#!/usr/bin/env node
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNostr, normalizeRelay, profileName, validateConfig } from './core.mjs';
import { runDaemon } from './daemon.mjs';
import { callUnixJson } from './ipc.mjs';
import { decideApproval, ensurePrivateDirectory, readJson, replaceContact, resolvePaths, setInboxRelays, writePrivateJson } from './store.mjs';
import { createVault } from './vault.mjs';

const AGENT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_ROOT = path.resolve(AGENT_ROOT, '..');

function usage() {
  return [
    'Property Agent 0.1.0 — Node.js 22+, Linux/Ubuntu inicial',
    '', 'Uso:',
    '  property-agent init [--profile default]',
    '  property-agent unlock [--profile default]',
    '  property-agent mcp [--profile default]',
    '  property-agent status [--profile default]',
    '  property-agent lock [--profile default]',
    '  property-agent relay add <wss-url|ws://localhost> [--profile default]',
    '  property-agent invite --name <nome> [--for <npub|hex>] [--profile default]',
    '  property-agent contact grant <npub|hex> --name <nome> --relay <url> [--read] [--send]',
    '  property-agent contact revoke <npub|hex> [--profile default]',
    '  property-agent requests [--profile default]',
    '  property-agent request decide <id> <approve|deny> [--profile default]',
    '  property-agent backup <arquivo-destino-absoluto> [--profile default]',
    '', 'Senha é lida somente de um TTY local e nunca aceita por argumento ou variável de ambiente.', '',
  ].join('\n');
}

function parseProfile(args) {
  const copy = [...args];
  let profile = 'default';
  for (let index = 0; index < copy.length; index++) {
    if (copy[index] === '--profile') {
      if (!copy[index + 1]) throw new Error('Falta o nome após --profile.');
      profile = profileName(copy[index + 1]); copy.splice(index, 2); index--;
    }
  }
  return { profile, args: copy };
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') throw new Error('A senha só pode ser lida em um terminal interativo (TTY).');
  process.stderr.write(label);
  return await new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const finish = (error) => {
      stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stderr.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') return finish(new Error('Operação cancelada.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && character !== '\u007f' && Buffer.byteLength(value + character, 'utf8') <= 256) value += character;
      }
    };
    stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
  });
}

async function confirmHuman(message, expected = 'CONFIRMAR') {
  if (!process.stdin.isTTY) throw new Error('Esta alteração exige confirmação em terminal interativo.');
  process.stderr.write(`${message}\nDigite ${expected}: `);
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { const answer = await rl.question(''); if (answer !== expected) throw new Error('Operação cancelada.'); }
  finally { rl.close(); }
}

function profileAndPaths(args) { const result = parseProfile(args); return { ...result, paths: resolvePaths(result.profile) }; }

async function init(profile) {
  const paths = resolvePaths(profile);
  await ensurePrivateDirectory(paths.dataDir);
  try { await readJson(paths.vaultPath); throw new Error('Este perfil já tem um cofre. Use outro perfil ou faça backup antes de migrar.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { context, nostr } = await loadNostr(PROPERTY_ROOT);
  const secret = nostr.generateSecretKey();
  const secretBuffer = Buffer.from(secret);
  try {
    const first = await promptHidden('Nova senha (mínimo 12 caracteres; entrada oculta): ');
    const second = await promptHidden('Repita a senha: ');
    if (first !== second) throw new Error('As senhas não correspondem.');
    const pubkey = nostr.getPublicKey(secret);
    const vault = createVault(secretBuffer, pubkey, first);
    await writePrivateJson(paths.vaultPath, vault);
    await writePrivateJson(paths.configPath, { schema: 'property-agent-config/v1', version: 1, pubkey, inbox_relays: [], contacts: [], pending_approvals: [], quota: { window: null, count: 0 } });
    process.stdout.write(`Identidade local criada: ${nostr.nip19.npubEncode(pubkey)}\nCofre cifrado em ${paths.vaultPath}. Faça backup cifrado com o comando property-agent backup <arquivo>.\n`);
  } finally { secretBuffer.fill(0); secret.fill(0); context.propertyAgentSecretHex = ''; }
}

function decodePublicKey(input, nostr) {
  if (/^[0-9a-f]{64}$/.test(input)) return input;
  const decoded = nostr.nip19.decode(input);
  if (decoded.type !== 'npub' || typeof decoded.data !== 'string' || !/^[0-9a-f]{64}$/.test(decoded.data)) throw new Error('Use uma npub ou chave pública hexadecimal válida.');
  return decoded.data;
}

async function changeContact(args, profile, action) {
  if (action === 'revoke') {
    if (args.length !== 1) throw new Error('Uso: property-agent contact revoke <npub|hex>.');
    const { nostr } = await loadNostr(PROPERTY_ROOT);
    const pubkey = decodePublicKey(args[0], nostr);
    const paths = resolvePaths(profile); const config = validateConfig(await readJson(paths.configPath));
    const existing = config.contacts.find(item => item.pubkey === pubkey);
    if (!existing) throw new Error('Contato não encontrado.');
    await confirmHuman(`Revogar leitura e envio para ${nostr.nip19.npubEncode(pubkey)}?`, 'REVOGAR');
    await replaceContact(paths.configPath, config.pubkey, { ...existing, read: false, send: false, status: 'revoked' });
    process.stdout.write('Permissões locais revogadas. O Property Agent não publica um aviso NIP-17 de revogação nesta versão.\n');
    return;
  }
  const { nostr } = await loadNostr(PROPERTY_ROOT);
  const pubkey = decodePublicKey(args[0] || '', nostr);
  const options = args.slice(1); let name = ''; let relays = []; let read = false; let send = false;
  for (let index = 0; index < options.length; index++) {
    const value = options[index];
    if (value === '--name' && options[index + 1]) name = options[++index];
    else if (value === '--relay' && options[index + 1]) relays.push(normalizeRelay(options[++index]));
    else if (value === '--read') read = true;
    else if (value === '--send') send = true;
    else throw new Error(`Opção de contato desconhecida: ${value}`);
  }
  if (!name.trim() || name.length > 80 || !relays.length || relays.length > 3 || (!read && !send)) throw new Error('Informe --name, ao menos um --relay, no máximo três relays e pelo menos um escopo --read/--send.');
  const paths = resolvePaths(profile); const config = validateConfig(await readJson(paths.configPath));
  if (pubkey === config.pubkey) throw new Error('A identidade do agente não pode ser adicionada como contato.');
  await confirmHuman(`Adicionar ${name} (${nostr.nip19.npubEncode(pubkey)}) com read=${read}, send=${send} e ${relays.length} relay(s)?`, 'APROVAR');
  await replaceContact(paths.configPath, config.pubkey, { pubkey, name: name.trim(), relays: [...new Set(relays)], read, send, status: 'approved' });
  process.stdout.write('Contato e escopos locais aprovados. Revogue-os com `property-agent contact revoke`.\n');
}

async function run() {
  const [command = 'help', ...rawArgs] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') { process.stdout.write(usage()); return; }
  if (command === 'version' || command === '--version') { process.stdout.write('property-agent 0.1.0; MCP 2026-07-28; Nostr tools 2.25.2 local\n'); return; }
  const { profile, args, paths } = profileAndPaths(rawArgs);
  if (command === 'init') { if (args.length) throw new Error('init não recebe senha ou parâmetros extras.'); await init(profile); return; }
  if (command === 'unlock' || command === 'daemon') {
    if (args.length) throw new Error('unlock não aceita senha por argumento ou opções adicionais.');
    let password = await promptHidden('Senha do cofre (entrada oculta; apenas na memória deste processo): ');
    try { await runDaemon({ password, profile }); }
    finally { password = ''; /* strings JavaScript não podem ser apagadas fisicamente; a senha não é persistida nem repassada a processo filho */ }
    return;
  }
  if (command === 'mcp') { if (args.length) throw new Error('mcp não aceita argumentos adicionais.'); process.env.PROPERTY_AGENT_PROFILE = profile; await import('./mcp-server.mjs'); return; }
  if (command === 'status') {
    if (args.length) throw new Error('status não aceita parâmetros adicionais.');
    const { nostr } = await loadNostr(PROPERTY_ROOT);
    const state = await callUnixJson(paths.socketPath, 'status', {});
    process.stdout.write(`Desbloqueado: ${state.unlocked ? 'sim' : 'não'}\nIdentidade: ${nostr.nip19.npubEncode(state.pubkey)}\nConversas aprovadas: ${state.approved_conversations}\nRelays de inbox: ${state.relay_count}\n`); return;
  }
  if (command === 'lock') { if (args.length) throw new Error('lock não aceita parâmetros adicionais.'); await callUnixJson(paths.socketPath, 'daemon.lock', {}); process.stdout.write('Daemon bloqueado.\n'); return; }
  if (command === 'invite') {
    let name = ''; let recipientPubkey = null;
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--name' && args[index + 1]) name = args[++index];
      else if (args[index] === '--for' && args[index + 1]) { const { nostr } = await loadNostr(PROPERTY_ROOT); recipientPubkey = decodePublicKey(args[++index], nostr); }
      else throw new Error('Uso: property-agent invite --name <nome> [--for <npub|hex>].');
    }
    if (!name.trim() || name.length > 80) throw new Error('Informe um nome de agente de até 80 caracteres.');
    await confirmHuman(`Gerar convite assinado para ${name.trim()}${recipientPubkey ? ` e vinculado à identidade ${recipientPubkey}` : ''}?`, 'GERAR');
    const result = await callUnixJson(paths.socketPath, 'invite.make', { name: name.trim(), recipient_pubkey: recipientPubkey });
    process.stdout.write(`${result.invite}\nExpira em ${new Date(result.expires_at * 1000).toISOString()}. Compartilhe apenas com a pessoa destinatária.\n`); return;
  }
  if (command === 'relay') {
    if (args[0] !== 'add' || args.length !== 2) throw new Error('Uso: property-agent relay add <wss-url|ws://localhost>.');
    const relay = normalizeRelay(args[1]); const { nostr } = await loadNostr(PROPERTY_ROOT);
    const config = validateConfig(await readJson(paths.configPath)); await confirmHuman(`Adicionar relay de inbox ${relay} à identidade ${nostr.nip19.npubEncode(config.pubkey)}?`, 'APROVAR');
    const relays = [...new Set([...config.inbox_relays, relay])]; if (relays.length > 3) throw new Error('O limite local é três relays de inbox.');
    await setInboxRelays(paths.configPath, config.pubkey, relays); process.stdout.write('Relay de inbox salvo. Reinicie o daemon para aplicar.\n'); return;
  }
  if (command === 'contact') {
    const [action, ...contactArgs] = args;
    if (action === 'grant') await changeContact(contactArgs, profile, 'grant');
    else if (action === 'revoke') await changeContact(contactArgs, profile, 'revoke');
    else throw new Error('Use `property-agent contact grant|revoke`.');
    return;
  }
  if (command === 'requests') {
    if (args.length) throw new Error('requests não aceita parâmetros adicionais.');
    const config = validateConfig(await readJson(paths.configPath));
    const pending = config.pending_approvals.filter(item => item.status === 'pending');
    process.stdout.write(pending.length ? pending.map(item => `${item.id} ${item.permission} ${item.conversation_pubkey} ${item.reason}`).join('\n') + '\n' : 'Nenhum pedido pendente.\n'); return;
  }
  if (command === 'request' && args[0] === 'decide') {
    if (args.length !== 3 || !/^[0-9a-f]{32}$/.test(args[1]) || !['approve', 'deny'].includes(args[2])) throw new Error('Uso: property-agent request decide <id> <approve|deny>.');
    const config = validateConfig(await readJson(paths.configPath)); const item = config.pending_approvals.find(entry => entry.id === args[1] && entry.status === 'pending');
    if (!item) throw new Error('approval-request-not-found');
    const { nostr } = await loadNostr(PROPERTY_ROOT);
    await confirmHuman(`${args[2] === 'approve' ? 'Aprovar' : 'Negar'} ${item.permission} para ${nostr.nip19.npubEncode(item.conversation_pubkey)}? Motivo: ${item.reason}`, args[2] === 'approve' ? 'APROVAR' : 'NEGAR');
    const result = await decideApproval(paths.configPath, config.pubkey, args[1], args[2]); process.stdout.write(`Pedido ${result.status}.\n`); return;
  }
  if (command === 'backup') {
    if (args.length !== 1 || !path.isAbsolute(args[0])) throw new Error('Informe um caminho absoluto para o backup cifrado.');
    const backup = await readJson(paths.vaultPath);
    await confirmHuman(`Gravar uma cópia cifrada do cofre em ${args[0]}? Mantenha o arquivo fora de dispositivos compartilhados.`, 'BACKUP');
    const handle = await open(args[0], 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(backup, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
    process.stdout.write('Backup cifrado criado com permissão 0600.\n'); return;
  }
  throw new Error(usage());
}

try { await run(); }
catch (error) { process.stderr.write(`Property Agent: ${error.message}\n`); process.exitCode = 1; }
