import { lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadNostr, validateConfig } from './core.mjs';
import { AgentService } from './service.mjs';
import { startUnixJsonServer } from './ipc.mjs';
import { NostrAgentTransport } from './relay.mjs';
import { readJson, resolvePaths, ensurePrivateDirectory, writePrivateJson } from './store.mjs';
import { unlockVault } from './vault.mjs';

const AGENT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_ROOT = path.resolve(AGENT_ROOT, '..');

async function verifyVaultFile(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('Arquivo do cofre não é regular ou não pertence ao usuário.');
  if ((info.mode & 0o777) !== 0o600) throw new Error('As permissões do cofre não são 0600; corrija-as antes de desbloquear.');
}

export async function runDaemon({ password, profile = 'default', env = process.env, now = () => Math.floor(Date.now() / 1000) }) {
  if (typeof WebSocket !== 'function') throw new Error('Node.js 22+ com WebSocket nativo é necessário.');
  const paths = resolvePaths(profile, env);
  await ensurePrivateDirectory(paths.dataDir);
  await ensurePrivateDirectory(paths.runtimeDir);
  await verifyVaultFile(paths.vaultPath);
  const vault = await readJson(paths.vaultPath);
  const { context, nostr, messages } = await loadNostr(PROPERTY_ROOT);
  const unlocked = unlockVault(vault, password, nostr, context);
  const checkSecret = context.Uint8Array.from(unlocked.secretHex.match(/.{2}/g), value => parseInt(value, 16));
  const pubkey = nostr.getPublicKey(checkSecret);
  checkSecret.fill(0);
  if (pubkey !== vault.pubkey) throw new Error('A identidade desbloqueada não corresponde ao cofre.');
  const loadConfig = async () => {
    const config = validateConfig(await readJson(paths.configPath));
    if (config.pubkey !== pubkey) throw new Error('A configuração não corresponde à identidade do cofre.');
    return config;
  };
  await loadConfig();
  const transport = new NostrAgentTransport({
    nostr, messages, context, secretHex: unlocked.secretHex, pubkey,
    inboxRelays: (await loadConfig()).inbox_relays,
    getContact: async key => (await loadConfig()).contacts.find(contact => contact.pubkey === key) || null,
  });
  unlocked.secretHex = '';
  context.propertyAgentSecretHex = '';
  const createInvite = ({ name, recipientPubkey, relayHints }) => {
    const createdAt = now();
    const content = {
      protocol: 'property-agent-invite/v1',
      agent_name: name,
      nonce: randomBytes(16).toString('hex'),
      expires_at: createdAt + 3600,
      recipient_pubkey: recipientPubkey,
      relay_hints: relayHints,
    };
    context.propertyAgentInviteTemplate = JSON.stringify({ kind: 30078, created_at: createdAt, tags: [['d', 'property-agent-invite-v1']], content: JSON.stringify(content) });
    context.propertyAgentInviteSecret = transport.secret;
    let signed;
    try {
      signed = vm.runInContext('NostrTools.finalizeEvent(JSON.parse(propertyAgentInviteTemplate), propertyAgentInviteSecret)', context, { timeout: 5000 });
      context.propertyAgentInviteEvent = JSON.stringify(signed);
      if (!vm.runInContext('NostrTools.verifyEvent(JSON.parse(propertyAgentInviteEvent))', context, { timeout: 5000 })) throw new Error('invite-sign-failed');
    } catch { throw new Error('invite-sign-failed'); }
    finally { context.propertyAgentInviteTemplate = ''; context.propertyAgentInviteSecret = null; context.propertyAgentInviteEvent = ''; }
    const encoded = Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
    return { invite: `property-agent-invite:v1:${encoded}`, expires_at: content.expires_at, agent_pubkey: pubkey };
  };
  const service = new AgentService({
    pubkey, loadConfig,
    saveConfig: config => writePrivateJson(paths.configPath, validateConfig(config)),
    transport, createInvite, now,
  });
  let shutdown;
  const stop = await startUnixJsonServer(paths.socketPath, async (method, params) => {
    if (method === 'daemon.lock') {
      if (Object.keys(params).length) throw new Error('invalid-arguments');
      setTimeout(() => { void shutdown?.(); }, 50);
      return { locked: true };
    }
    return service.dispatch(method, params);
  });
  process.stderr.write(`Property Agent desbloqueado para ${nostr.nip19.npubEncode(pubkey)}. MCP local ativo em socket Unix; não há listener TCP.\n`);
  let stopped = false;
  shutdown = async () => {
    if (stopped) return;
    stopped = true;
    await stop();
    transport.secret.fill(0);
    context.propertyAgentSecretHex = '';
    unlocked.secretHex = '';
    checkSecret.fill(0);
  };
  const onSignal = () => { void shutdown().finally(() => process.exit(0)); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  return { paths, pubkey, shutdown };
}
