#!/usr/bin/env node
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_VERSION, loadNostr, normalizeRelay, profileName } from './core.mjs';
import { runDaemon } from './daemon.mjs';
import { callUnixJson } from './ipc.mjs';
import { ensurePrivateDirectory, readJson, resolvePaths, writePrivateJson } from './store.mjs';
import { createVault } from './vault.mjs';

const AGENT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_ROOT = path.resolve(AGENT_ROOT, '..');

function usage() {
  return [
    `Property Agent ${AGENT_VERSION} — Node.js 22+, Linux/Ubuntu inicial`,
    '', 'Uso:',
    '  property-agent init [--profile default]',
    '  property-agent unlock [--profile default]',
    '  property-agent mcp [--profile default]',
    '  property-agent status [--profile default]',
    '  property-agent lock [--profile default]',
    '  property-agent relay add <wss-url|ws://localhost> [--profile default]',
    '  property-agent invite --name <nome> [--for <npub|hex>] [--profile default]',
    '  property-agent contact configure <npub|hex> --name <nome> --relay <url> [--read] [--send]',
    '  property-agent contact revoke <npub|hex> [--profile default]',
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

async function callAgentDaemon(paths, method, params) {
  try { return await callUnixJson(paths.socketPath, method, params); }
  catch (error) {
    if (error.message === 'agent-daemon-unavailable') throw new Error('O daemon local está bloqueado ou indisponível. Mantenha property-agent unlock ativo em outra sessão e tente novamente.');
    if (error.message === 'contact-not-found') throw new Error('Contato não encontrado.');
    if (error.message === 'contact-limit-reached') throw new Error('O limite de 100 contatos aprovados foi atingido.');
    if (error.message === 'contact-self-forbidden') throw new Error('A identidade do agente não pode ser adicionada como contato.');
    if (error.message === 'relay-limit-reached') throw new Error('O limite local é três relays de inbox.');
    if (error.message === 'relay-already-configured') throw new Error('Este relay já está configurado.');
    throw error;
  }
}

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
    await writePrivateJson(paths.configPath, { schema: 'property-agent-config/v2', version: 2, pubkey, inbox_relays: [], contacts: [], quota: { window: null, count: 0 } });
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
  const paths = resolvePaths(profile);
  if (action === 'revoke') {
    if (args.length !== 1) throw new Error('Uso: property-agent contact revoke <npub|hex>.');
    const { nostr } = await loadNostr(PROPERTY_ROOT);
    const pubkey = decodePublicKey(args[0], nostr);
    await confirmHuman(`Revogar leitura e envio para ${nostr.nip19.npubEncode(pubkey)}?`, 'REVOGAR');
    await callAgentDaemon(paths, 'contact.revoke', { pubkey });
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
  await confirmHuman(`Configurar ${name} (${nostr.nip19.npubEncode(pubkey)}) com read=${read}, send=${send} e ${relays.length} relay(s)?`, 'CONFIGURAR');
  await callAgentDaemon(paths, 'contact.configure', { pubkey, name: name.trim(), relays: [...new Set(relays)], read, send });
  process.stdout.write('Contato e escopos locais configurados. Altere-os com `property-agent contact configure` ou remova-os com `property-agent contact revoke`.\n');
}

async function run() {
  const [command = 'help', ...rawArgs] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') { process.stdout.write(usage()); return; }
  if (command === 'version' || command === '--version') { process.stdout.write(`property-agent ${AGENT_VERSION}; MCP 2026-07-28; Nostr tools 2.25.2 local\n`); return; }
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
    process.stdout.write(`Desbloqueado: ${state.unlocked ? 'sim' : 'não'}\nIdentidade: ${nostr.nip19.npubEncode(state.pubkey)}\nConversas configuradas: ${state.configured_conversations}\nRelays de inbox: ${state.relay_count}\n`); return;
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
    const relay = normalizeRelay(args[1]);
    await confirmHuman('Configurar relay de inbox ' + relay + '?', 'CONFIGURAR');
    const result = await callAgentDaemon(paths, 'relay.add', { relay });
    process.stdout.write('Relay de inbox salvo (' + result.relay_count + '/3). Reinicie o daemon para aplicar.\n'); return;
  }
  if (command === 'contact') {
    const [action, ...contactArgs] = args;
    if (action === 'configure') await changeContact(contactArgs, profile, 'configure');
    else if (action === 'revoke') await changeContact(contactArgs, profile, 'revoke');
    else throw new Error('Use `property-agent contact configure|revoke`.');
    return;
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
