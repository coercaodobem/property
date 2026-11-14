import { createHash } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { attachNanoThresholdSignature, calculateNanoThresholdBlockHash, nanoAccountFromPublicKey, nanoPublicKeyFromAccount } from './xno-threshold.mjs';

const TXID = /^[0-9a-f]{64}$/i;
const WALLET_ID = /^[0-9a-f]{64}$/i;
const ACCOUNT = /^(?:nano)_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const MAX_RAW = (1n << 128n) - 1n;
const ALLOWED_ACTIONS = new Set(['version', 'password_enter', 'wallet_locked', 'wallet_lock', 'account_list', 'wallet_contains', 'account_balance', 'send', 'block_info', 'receivable', 'account_history', 'receive', 'account_info', 'work_generate', 'process']);

function raw(value, label = 'amount_raw') {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,38})$/.test(value)) throw new Error(`${label}-invalid`);
  const parsed = BigInt(value);
  if (parsed > MAX_RAW) throw new Error(`${label}-invalid`);
  return parsed;
}

function normalizeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('xno-rpc-url-invalid'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = (net.isIP(host) === 4 && Number(host.split('.')[0]) === 127) || host === '::1';
  if (url.protocol !== 'http:' || !loopback || url.username || url.password || url.search || url.hash || url.pathname.includes('..')) throw new Error('xno-rpc-must-be-authenticated-loopback');
  return url;
}

function validateConfig(config) {
  const expectedKeys = ['rpc_url', 'rpc_username', 'rpc_password', 'wallet_password', 'wallet_id', 'account', 'network', 'max_raw_per_payment', 'lifetime_budget_raw'];
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).sort().join('|') !== [...expectedKeys].sort().join('|')) throw new Error('xno-config-invalid');
  normalizeUrl(config.rpc_url);
  if (typeof config.rpc_username !== 'string' || !config.rpc_username || config.rpc_username.length > 128 || /[\r\n\0]/.test(config.rpc_username) ||
      typeof config.rpc_password !== 'string' || !config.rpc_password || config.rpc_password.length > 256 || /[\r\n\0]/.test(config.rpc_password) ||
      typeof config.wallet_password !== 'string' || config.wallet_password.length > 256 || /[\r\n\0]/.test(config.wallet_password) ||
      !WALLET_ID.test(config.wallet_id || '') || !ACCOUNT.test(config.account || '') || !['live', 'dev'].includes(config.network)) throw new Error('xno-config-invalid');
  const cap = raw(config.max_raw_per_payment, 'max_raw_per_payment');
  const budget = raw(config.lifetime_budget_raw, 'lifetime_budget_raw');
  if (cap < 1n || budget < 1n || cap > budget) throw new Error('xno-config-invalid');
  return Object.freeze({ ...config, maxAmount: cap, lifetimeBudget: budget });
}

function postJson(url, body, authorization, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization },
      timeout: timeoutMs,
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { request.destroy(new Error('xno-rpc-response-too-large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('timeout', () => request.destroy(new Error('xno-rpc-timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

function parseBlockContents(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function validateXnoWalletConfig(config) {
  const value = validateConfig(config);
  return Object.freeze({ rpc_url: value.rpc_url, rpc_username: value.rpc_username, rpc_password: value.rpc_password, wallet_password: value.wallet_password, wallet_id: value.wallet_id,
    account: value.account, network: value.network, max_raw_per_payment: value.max_raw_per_payment, lifetime_budget_raw: value.lifetime_budget_raw });
}

/**
 * Constrained client for a locally hosted authenticated gateway in front of Nano RPC.
 * It never accepts an RPC action or account from the MCP caller. Nano's built-in
 * RPC itself does not authenticate HTTP callers, so the gateway and node must be
 * isolated by the operator; Basic auth on the built-in node is not assumed.
 */
export function createNanoAgentWallet(configValue, { timeoutMs = 10_000, maxResponseBytes = 256 * 1024 } = {}) {
  const config = { ...validateConfig(configValue) };
  const url = normalizeUrl(config.rpc_url);
  let rpcPassword = config.rpc_password;
  let walletPassword = config.wallet_password;
  config.rpc_password = '';
  config.wallet_password = '';

  async function rpc(action, params = {}) {
    if (!ALLOWED_ACTIONS.has(action)) throw new Error('xno-rpc-action-not-allowed');
    const authorization = `Basic ${Buffer.from(`${config.rpc_username}:${rpcPassword}`, 'utf8').toString('base64')}`;
    const response = await postJson(url, JSON.stringify({ action, ...params }), authorization, timeoutMs, maxResponseBytes);
    if (response.status < 200 || response.status >= 300) throw new Error(`xno-rpc-http-${response.status}`);
    let result;
    try { result = JSON.parse(response.body); } catch { throw new Error('xno-rpc-invalid-json'); }
    if (result?.error) throw new Error('xno-rpc-request-failed');
    return result;
  }

  async function assertNetwork() {
    const result = await rpc('version');
    if (String(result.network || '').toLowerCase() !== config.network) throw new Error('xno-wrong-network');
    return result;
  }

  async function assertWalletAccount() {
    const unlocked = await rpc('password_enter', { wallet: config.wallet_id, password: walletPassword });
    if (unlocked.valid !== '1' && unlocked.valid !== 1 && unlocked.valid !== true) throw new Error('xno-wallet-unlock-failed');
    const listed = await rpc('account_list', { wallet: config.wallet_id });
    if (!Array.isArray(listed.accounts) || listed.accounts.length !== 1 || listed.accounts[0] !== config.account) throw new Error('xno-wallet-must-have-one-dedicated-account');
    const result = await rpc('wallet_contains', { wallet: config.wallet_id, account: config.account });
    if (result.exists !== '1' && result.exists !== 1 && result.exists !== true) throw new Error('xno-account-not-in-wallet');
    return true;
  }

  async function confirmedBalance() {
    const result = await rpc('account_balance', { account: config.account, include_only_confirmed: 'true' });
    if (!/^\d+$/.test(String(result.balance ?? ''))) throw new Error('xno-balance-invalid');
    return BigInt(result.balance);
  }

  function requireThresholdDevNetwork() {
    if (config.network !== 'dev') throw new Error('xno-threshold-mainnet-disabled');
  }

  async function inspectThresholdAccount({ account, groupPublicKey }) {
    requireThresholdDevNetwork();
    if (!/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(account || '') || !(groupPublicKey instanceof Uint8Array) ||
        nanoAccountFromPublicKey(groupPublicKey) !== account || nanoPublicKeyFromAccount(account).some((byte, index) => byte !== groupPublicKey[index])) throw new Error('xno-threshold-account-key-mismatch');
    await assertNetwork();
    const result = await rpc('account_info', { account, representative: 'true', include_confirmed: 'true' });
    const frontier = String(result.confirmed_frontier || '').toUpperCase();
    const balance = String(result.confirmed_balance ?? '');
    if (!TXID.test(frontier) || /^0{64}$/.test(frontier) || !/^\d+$/.test(balance) || !/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(result.confirmed_representative || '')) {
      throw new Error('xno-threshold-confirmed-state-unavailable');
    }
    if (String(result.frontier || '').toUpperCase() !== frontier || String(result.balance ?? '') !== balance) throw new Error('xno-threshold-account-has-unconfirmed-head');
    return Object.freeze({ account, previous: frontier, representative: result.confirmed_representative, balance_raw: balance });
  }

  async function generateThresholdWork(block) {
    requireThresholdDevNetwork();
    if (!block || block.type !== 'state' || !TXID.test(block.previous || '') || !/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(block.account || '')) throw new Error('xno-threshold-work-request-invalid');
    await assertNetwork();
    const result = await rpc('work_generate', { json_block: 'true', block });
    const work = String(result.work || '').toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(work) || (result.hash && String(result.hash).toUpperCase() !== String(block.previous).toUpperCase())) throw new Error('xno-threshold-work-result-invalid');
    return work;
  }

  async function publishThresholdBlock(blockValue, groupPublicKey) {
    requireThresholdDevNetwork();
    if (!blockValue || blockValue.type !== 'state' || !/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(blockValue.account || '') || !/^[0-9a-f]{16}$/i.test(blockValue.work || '') ||
        !/^[0-9a-f]{128}$/i.test(blockValue.signature || '')) throw new Error('xno-threshold-block-invalid');
    const publicKey = groupPublicKey instanceof Uint8Array ? groupPublicKey : Buffer.from(String(groupPublicKey || ''), 'hex');
    if (publicKey.length !== 32 || nanoAccountFromPublicKey(publicKey) !== blockValue.account) throw new Error('xno-threshold-account-key-mismatch');
    const verified = attachNanoThresholdSignature(blockValue, blockValue.signature, publicKey);
    if (verified.block_hash !== calculateNanoThresholdBlockHash(blockValue)) throw new Error('xno-threshold-block-hash-mismatch');
    await assertNetwork();
    const result = await rpc('process', { json_block: 'true', subtype: 'send', block: blockValue });
    const hash = String(result.hash || '').toUpperCase();
    if (!TXID.test(hash) || hash !== verified.block_hash) throw new Error('xno-threshold-publish-result-mismatch');
    return Object.freeze({ hash, status: 'submitted_unconfirmed', network: 'dev' });
  }

  async function inspectSend({ txid, destination, amountRaw, source = config.account }) {
    if (!TXID.test(txid || '') || !ACCOUNT.test(destination || '') || !ACCOUNT.test(source || '')) throw new Error('xno-transaction-query-invalid');
    raw(amountRaw);
    await assertNetwork();
    const result = await rpc('block_info', { hash: txid, json_block: 'true' });
    const contents = parseBlockContents(result.contents);
    const observedSource = contents?.account || result.block_account || result.account;
    const observedDestination = contents?.link_as_account || result.link_as_account;
    const observedAmount = String(result.amount ?? '');
    const confirmed = result.confirmed === true || result.confirmed === 'true';
    if (observedSource !== source || observedDestination !== destination || observedAmount !== amountRaw || (result.subtype && result.subtype !== 'send')) {
      throw new Error('xno-transaction-does-not-match-trade');
    }
    return { txid: String(result.hash || txid).toUpperCase(), source: observedSource, destination: observedDestination,
      amount_raw: observedAmount, confirmed, status: confirmed ? 'confirmed' : 'pending' };
  }

  async function findReceiveBlock(sendHash, sourceAccount, amountRaw) {
    let head = '';
    const seenHeads = new Set();
    for (let page = 0; page < 100; page++) {
      const params = { account: config.account, count: '100', raw: 'true', account_filter: [sourceAccount] };
      if (head) params.head = head;
      const result = await rpc('account_history', params);
      if (!Array.isArray(result.history)) throw new Error('xno-history-invalid');
      for (const entry of result.history) {
        const contents = parseBlockContents(entry.contents) || entry;
        const linkedHash = String(contents.link || entry.link || '').toUpperCase();
        const subtype = String(entry.subtype || contents.subtype || entry.type || contents.type || '').toLowerCase();
        if (linkedHash !== sendHash.toUpperCase() || !['receive', 'open'].includes(subtype)) continue;
        if (String(entry.amount ?? contents.amount ?? '') !== amountRaw) throw new Error('xno-receive-does-not-match-payment');
        if (!TXID.test(entry.hash || contents.hash || '')) throw new Error('xno-history-invalid');
        return String(entry.hash || contents.hash).toUpperCase();
      }
      const nextHead = typeof result.previous === 'string' && TXID.test(result.previous) ? result.previous.toUpperCase() : '';
      if (!nextHead || seenHeads.has(nextHead)) break;
      seenHeads.add(nextHead);
      head = nextHead;
    }
    return '';
  }

  async function inspectReceiveBlock({ receiveTxid, sendTxid, sourceAccount, amountRaw }) {
    const result = await rpc('block_info', { hash: receiveTxid, json_block: 'true' });
    const contents = parseBlockContents(result.contents);
    const linkedHash = String(contents?.link || result.link || '').toUpperCase();
    const receivingAccount = contents?.account || result.block_account || result.account;
    const subtype = String(result.subtype || contents?.subtype || '').toLowerCase();
    const observedAmount = String(result.amount ?? '');
    if (receivingAccount !== config.account || linkedHash !== sendTxid.toUpperCase() || observedAmount !== amountRaw ||
        !['receive', 'open'].includes(subtype)) throw new Error('xno-receive-does-not-match-payment');
    const confirmed = result.confirmed === true || result.confirmed === 'true';
    return { received: confirmed, ...(confirmed ? {} : { reason: 'xno-receive-pending-confirmation' }), receive_txid: String(result.hash || receiveTxid).toUpperCase() };
  }

  return Object.freeze({
    account: config.account,
    network: config.network,
    maxRawPerPayment: config.maxAmount,
    lifetimeBudgetRaw: config.lifetimeBudget,
    async assertReady() {
      await assertNetwork();
      await assertWalletAccount();
      await confirmedBalance();
      return { ready: true, account: config.account, network: config.network };
    },
    async send({ destination, amountRaw, idempotencyKey }) {
      if (!ACCOUNT.test(destination || '') || destination === config.account || typeof idempotencyKey !== 'string' || !/^[a-z0-9:-]{16,128}$/.test(idempotencyKey)) throw new Error('xno-send-arguments-invalid');
      const amount = raw(amountRaw);
      if (amount < 1n || amount > config.maxAmount) throw new Error('xno-payment-limit-exceeded');
      await assertNetwork();
      await assertWalletAccount();
      // Let Nano's idempotent send RPC answer before any balance preflight.
      // A previous send may have succeeded while its response was lost; a
      // local balance check would then reject the retry before Nano can return
      // the original block for the same id.
      const result = await rpc('send', { wallet: config.wallet_id, source: config.account, destination,
        amount: amount.toString(), id: idempotencyKey });
      if (!TXID.test(result.block || '')) throw new Error('xno-rpc-invalid-send-result');
      return { txid: result.block.toUpperCase() };
    },
    async inspectSend(input) { return inspectSend(input); },
    async inspectThresholdAccount(input) { return inspectThresholdAccount(input); },
    async generateThresholdWork(block) { return generateThresholdWork(block); },
    async publishThresholdBlock(block, groupPublicKey) { return publishThresholdBlock(block, groupPublicKey); },
    async receiveConfirmed({ txid, sourceAccount, amountRaw }) {
      if (!TXID.test(txid || '') || !ACCOUNT.test(sourceAccount || '')) throw new Error('xno-transaction-query-invalid');
      raw(amountRaw);
      await assertNetwork();
      await assertWalletAccount();
      const source = await rpc('block_info', { hash: txid, json_block: 'true' });
      const contents = parseBlockContents(source.contents);
      const destination = contents?.link_as_account || source.link_as_account;
      const observedSource = contents?.account || source.block_account || source.account;
      if (destination !== config.account || observedSource !== sourceAccount || String(source.amount ?? '') !== amountRaw) throw new Error('xno-transaction-does-not-match-trade');
      if (!(source.confirmed === true || source.confirmed === 'true')) return { received: false, reason: 'xno-payment-not-confirmed' };
      const sendHash = String(source.hash || txid).toUpperCase();
      const receivable = await rpc('receivable', { account: config.account, count: '100', source: true, include_only_confirmed: true });
      const blocks = receivable.blocks;
      if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) throw new Error('xno-receivable-invalid');
      const key = Object.keys(blocks).find(hash => hash.toUpperCase() === sendHash);
      if (key) {
        const pending = blocks[key];
        if (!pending || typeof pending !== 'object' || String(pending.amount ?? '') !== amountRaw || pending.source !== sourceAccount) {
          throw new Error('xno-receivable-does-not-match-payment');
        }
        const result = await rpc('receive', { wallet: config.wallet_id, account: config.account, block: sendHash });
        if (!TXID.test(result.block || '')) throw new Error('xno-rpc-invalid-receive-result');
        return inspectReceiveBlock({ receiveTxid: result.block, sendTxid: sendHash, sourceAccount, amountRaw });
      }
      const receiveTxid = await findReceiveBlock(sendHash, sourceAccount, amountRaw);
      if (!receiveTxid) return { received: false, reason: 'xno-receivable-not-found' };
      return inspectReceiveBlock({ receiveTxid, sendTxid: sendHash, sourceAccount, amountRaw });
    },
    async inspectSendForReceipt({ txid, destination, amountRaw, source }) { return inspectSend({ txid, destination, amountRaw, source }); },
    async lock() {
      try { await rpc('wallet_lock', { wallet: config.wallet_id }); return true; }
      finally { walletPassword = ''; rpcPassword = ''; }
    },
    async policy() {
      const network = await assertNetwork();
      const balance = await confirmedBalance();
      return { configured: true, network: config.network, account: config.account, max_raw_per_payment: config.maxAmount.toString(),
        lifetime_budget_raw: config.lifetimeBudget.toString(), confirmed_balance_raw: balance.toString(), node_version: String(network.node_vendor || network.node || '') };
    },
  });
}

export function nanoTradeIdempotencyKey(pubkey, tradeId) {
  if (!/^[0-9a-f]{64}$/.test(pubkey) || !/^[0-9a-f]{32}$/.test(tradeId)) throw new Error('xno-trade-id-invalid');
  return `property-xno:${createHash('sha256').update(`${pubkey}:${tradeId}`).digest('hex')}`;
}
