import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNostr, validateConfig } from './core.mjs';
import { AgentService } from './service.mjs';
import { startUnixJsonServer } from './ipc.mjs';
import { NostrAgentTransport } from './relay.mjs';
import { readJson, resolvePaths, ensurePrivateDirectory, writePrivateJson } from './store.mjs';
import { openEncryptedPayload, unlockVault } from './vault.mjs';
import { createNanoAgentWallet, validateXnoWalletConfig } from './nano-wallet.mjs';
import { createXnoTradeService } from './xno-trades.mjs';
import { createEncryptedXnoJournalStore } from './xno-journal.mjs';

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
  let configSnapshot;
  const loadConfig = async () => {
    const stored = await readJson(paths.configPath);
    const config = validateConfig(stored);
    if (config.pubkey !== pubkey) throw new Error('A configuração não corresponde à identidade do cofre.');
    if (stored.schema !== config.schema || stored.version !== config.version) await writePrivateJson(paths.configPath, config);
    configSnapshot = config;
    return config;
  };
  await loadConfig();
  const transport = new NostrAgentTransport({
    nostr, messages, context, secretHex: unlocked.secretHex, pubkey,
    inboxRelays: (await loadConfig()).inbox_relays,
  });
  unlocked.secretHex = '';
  context.propertyAgentSecretHex = '';
  let xnoWallet = null;
  let xnoTrades = null;
  try {
    const envelope = await readJson(paths.xnoVaultPath);
    const paymentConfig = { ...validateXnoWalletConfig(openEncryptedPayload(envelope, pubkey, password, 'xno-wallet')) };
    xnoWallet = createNanoAgentWallet(paymentConfig);
    paymentConfig.rpc_password = ''; paymentConfig.wallet_password = '';
    const journal = createEncryptedXnoJournalStore({ file: paths.xnoJournalPath, pubkey, password });
    xnoTrades = createXnoTradeService({ pubkey, wallet: xnoWallet, transport,
      blockedPubkeys: () => configSnapshot.blocked_pubkeys, relays: () => configSnapshot.inbox_relays,
      loadJournal: () => journal.load(), saveJournal: value => journal.save(value), now });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      try { await xnoWallet?.lock(); } catch {}
      transport.secret.fill(0);
      context.propertyAgentSecretHex = '';
      unlocked.secretHex = '';
      throw error;
    }
  }
  const service = new AgentService({
    pubkey, loadConfig,
    saveConfig: async config => { configSnapshot = validateConfig(config); await writePrivateJson(paths.configPath, configSnapshot); },
    transport, xnoTrades, now,
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
    await service.close();
    await stop();
    try { await xnoWallet?.lock(); } catch { /* no secret is written to logs; the dedicated wallet may be unavailable during shutdown */ }
    transport.secret.fill(0);
    context.propertyAgentSecretHex = '';
    unlocked.secretHex = '';
    checkSecret.fill(0);
  };
  const onSignal = () => { void shutdown().finally(() => process.exit(0)); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  return { paths, pubkey, shutdown };
}
