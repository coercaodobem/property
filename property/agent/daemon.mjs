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
import { createXnoEscrowService } from './xno-escrow.mjs';
import { createEncryptedXnoJournalStore } from './xno-journal.mjs';
import { createEncryptedXnoThresholdStore } from './xno-threshold-store.mjs';
import { createXnoThresholdProtocol } from './xno-threshold-protocol.mjs';
import { createBitcoinCoreLedger, createMoneroWalletLedger, createNanoNodeLedger } from './ledger-rpc.mjs';
import { createTradeStateMachine } from './trade-state.mjs';
import { createTradeConversationService } from './trade-conversation.mjs';
import { createTradeEvidenceSigner, createEncryptedTradeJournalStore } from './trade-state-store.mjs';
import { validateTradeNodeConfig } from './trade-node-config.mjs';

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
  let xnoEscrowWallet = null;
  let xnoTrades = null;
  let xnoEscrow = null;
  let xnoThreshold = null;
  let tradeConversations = null;
  try {
    try {
      const envelope = await readJson(paths.xnoVaultPath);
      const paymentConfig = { ...validateXnoWalletConfig(openEncryptedPayload(envelope, pubkey, password, 'xno-wallet')) };
      xnoWallet = createNanoAgentWallet(paymentConfig);
      paymentConfig.rpc_password = ''; paymentConfig.wallet_password = '';
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try {
      const envelope = await readJson(paths.xnoEscrowVaultPath);
      const escrowConfig = { ...validateXnoWalletConfig(openEncryptedPayload(envelope, pubkey, password, 'xno-escrow-wallet')) };
      xnoEscrowWallet = createNanoAgentWallet(escrowConfig);
      escrowConfig.rpc_password = ''; escrowConfig.wallet_password = '';
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const journal = createEncryptedXnoJournalStore({ file: paths.xnoJournalPath, pubkey, password });
    const thresholdStore = createEncryptedXnoThresholdStore({ file: paths.xnoThresholdPath, pubkey, password });
    let queue = Promise.resolve();
    const serializeTask = task => {
      const next = queue.then(task, task);
      queue = next.catch(() => {});
      return next;
    };
    const journalOptions = { loadJournal: () => journal.load(), saveJournal: value => journal.save(value), serializeTask, now };
    xnoThreshold = createXnoThresholdProtocol({ pubkey, transport, wallet: xnoWallet,
      blockedPubkeys: () => configSnapshot.blocked_pubkeys, relays: () => configSnapshot.inbox_relays,
      loadStore: () => thresholdStore.load(), saveStore: value => thresholdStore.save(value), serializeTask, now });
    if (xnoWallet) xnoTrades = createXnoTradeService({ pubkey, wallet: xnoWallet, transport,
      blockedPubkeys: () => configSnapshot.blocked_pubkeys, relays: () => configSnapshot.inbox_relays, ...journalOptions });
    xnoEscrow = createXnoEscrowService({ pubkey, wallet: xnoWallet, escrowWallet: xnoEscrowWallet, transport,
      blockedPubkeys: () => configSnapshot.blocked_pubkeys, relays: () => configSnapshot.inbox_relays, ...journalOptions });
    try {
      const envelope = await readJson(paths.tradeNodeVaultPath, { maxBytes: 64 * 1024 });
      const tradeConfig = validateTradeNodeConfig(openEncryptedPayload(envelope, pubkey, password, 'trade-node-config'));
      const adapters = {};
      await ensurePrivateDirectory(paths.tradeLedgerStateDir);
      if (tradeConfig.adapters.BTC) {
        const item = tradeConfig.adapters.BTC;
        const ledger = createBitcoinCoreLedger({ rpcUrl: item.rpc_url, username: item.username, password: item.password,
          walletName: item.wallet_name, expectedChain: 'regtest', minConfirmations: item.min_confirmations });
        adapters.BTC = { ledger, network: 'regtest', minConfirmations: item.min_confirmations };
      }
      if (tradeConfig.adapters.XMR) {
        const item = tradeConfig.adapters.XMR;
        const ledger = createMoneroWalletLedger({ walletRpcUrl: item.wallet_rpc_url, daemonRpcUrl: item.daemon_rpc_url,
          username: item.username, password: item.password, daemonUsername: item.daemon_username, daemonPassword: item.daemon_password,
          stateDir: path.join(paths.tradeLedgerStateDir, 'xmr'), expectedNetwork: 'fakechain', minConfirmations: item.min_confirmations });
        adapters.XMR = { ledger, network: 'fakechain', minConfirmations: item.min_confirmations };
      }
      if (tradeConfig.adapters.XNO) {
        const item = tradeConfig.adapters.XNO;
        const ledger = createNanoNodeLedger({ rpcUrl: item.rpc_url, username: item.username, password: item.password,
          wallet: item.wallet, stateDir: path.join(paths.tradeLedgerStateDir, 'xno'), expectedNetwork: 'dev', minConfirmations: item.min_confirmations });
        adapters.XNO = { ledger, network: 'dev', minConfirmations: item.min_confirmations };
      }
      const evidence = createTradeEvidenceSigner(tradeConfig.signing_seed);
      tradeConfig.signing_seed = '';
      for (const adapter of Object.values(tradeConfig.adapters)) {
        for (const field of ['password', 'daemon_password']) adapter[field] = '';
        for (const field of ['username', 'daemon_username']) adapter[field] = '';
      }
      tradeConfig.adapters = {};
      const store = createEncryptedTradeJournalStore({ file: paths.tradeJournalPath, pubkey, password });
      const machine = createTradeStateMachine({ adapters, localIdentityPubkey: pubkey, signer: evidence,
        verifyEvidence: evidence.verify,
        authorize: async ({ trade, actor_pubkey, authorization }) => {
          if (actor_pubkey === pubkey) return authorization?.local === true;
          return [trade.seller_pubkey, trade.buyer_pubkey].includes(actor_pubkey) && authorization?.transport_authenticated === true &&
            /^[0-9a-f]{32}$/.test(authorization?.message_id || '');
        }, loadJournal: () => store.load(), saveJournal: value => store.save(value), now });
      await machine.verifyJournal();
      tradeConversations = createTradeConversationService({ pubkey, machine, transport,
        blockedPubkeys: () => configSnapshot.blocked_pubkeys, relays: () => configSnapshot.inbox_relays, now });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  } catch (error) {
    try { await xnoWallet?.lock(); } catch {}
    try { await xnoEscrowWallet?.lock(); } catch {}
    transport.secret.fill(0);
    context.propertyAgentSecretHex = '';
    unlocked.secretHex = '';
    throw error;
  }
  const service = new AgentService({
    pubkey, loadConfig,
    saveConfig: async config => { configSnapshot = validateConfig(config); await writePrivateJson(paths.configPath, configSnapshot); },
    transport, xnoTrades, xnoEscrow, xnoThreshold, tradeConversations, now,
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
    try { await xnoEscrowWallet?.lock(); } catch { /* escrow custody wallet is locked independently */ }
    transport.secret.fill(0);
    context.propertyAgentSecretHex = '';
    unlocked.secretHex = '';
    checkSecret.fill(0);
  };
  const onSignal = () => { void shutdown().finally(() => process.exit(0)); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  return { paths, pubkey, shutdown };
}
