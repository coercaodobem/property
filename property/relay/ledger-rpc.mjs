import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

const TXID = /^[0-9a-f]{64}$/i;
const MONERO_INTEGER_FIELDS = new Set(['amount', 'amounts', 'fee', 'balance', 'unlocked_balance', 'amount_atomic']);

function loopbackUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('RPC URL is invalid.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = host === 'localhost' || (net.isIP(host) === 4 && Number(host.split('.')[0]) === 127) || host === '::1';
  if (url.protocol !== 'http:' || !loopback || url.username || url.password || url.search || url.hash) {
    throw new TypeError('Ledger RPC must use an HTTP loopback URL without embedded credentials.');
  }
  return url;
}

function escapeAuth(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function parseDigestChallenge(value) {
  if (typeof value !== 'string' || !/^Digest\s/i.test(value)) return null;
  const fields = {};
  for (const match of value.slice(value.indexOf(' ') + 1).matchAll(/([a-z][a-z0-9_-]*)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/gi)) {
    fields[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').replace(/\\([\\"])/g, '$1');
  }
  return fields.realm && fields.nonce ? fields : null;
}

function digestAuthorization(challenge, method, uri, body, credentials, nonceCount) {
  const algorithm = String(challenge.algorithm || 'MD5').toUpperCase();
  const digestName = algorithm.startsWith('SHA-256') ? 'sha256' : algorithm.startsWith('MD5') ? 'md5' : '';
  if (!digestName) throw new Error('Ledger RPC offered an unsupported digest algorithm.');
  const offeredQop = String(challenge.qop || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const qop = offeredQop.includes('auth') ? 'auth' : offeredQop.includes('auth-int') ? 'auth-int' : '';
  if (!qop) throw new Error('Ledger RPC digest challenge does not offer a supported qop.');
  const cnonce = randomBytes(16).toString('hex');
  const nc = String(nonceCount).padStart(8, '0');
  const hash = value => createHash(digestName).update(value).digest('hex');
  let ha1 = hash(`${credentials.username}:${challenge.realm}:${credentials.password}`);
  if (algorithm.endsWith('-SESS')) ha1 = hash(`${ha1}:${challenge.nonce}:${cnonce}`);
  const entity = qop === 'auth-int' ? `:${hash(body)}` : '';
  const ha2 = hash(`${method}:${uri}${entity}`);
  const response = qop
    ? hash(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username=${escapeAuth(credentials.username)}`,
    `realm=${escapeAuth(challenge.realm)}`,
    `nonce=${escapeAuth(challenge.nonce)}`,
    `uri=${escapeAuth(uri)}`,
    `response=${escapeAuth(response)}`,
    `algorithm=${algorithm}`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce=${escapeAuth(cnonce)}`
  ];
  if (challenge.opaque) parts.push(`opaque=${escapeAuth(challenge.opaque)}`);
  return `Digest ${parts.join(', ')}`;
}

function encodeJson(value) {
  const bigints = [];
  const encoded = JSON.stringify(value, (_key, child) => {
    if (typeof child !== 'bigint') return child;
    const index = bigints.push(child.toString()) - 1;
    return `__PROPERTY_JSON_BIGINT_${index}__`;
  });
  return encoded.replace(/"__PROPERTY_JSON_BIGINT_(\d+)__"/g, (_match, index) => bigints[Number(index)]);
}

function parseJson(text, preserveMoneroIntegers = false) {
  if (!preserveMoneroIntegers) return JSON.parse(text);
  const fields = [...MONERO_INTEGER_FIELDS].join('|');
  const lossless = text.replace(new RegExp(`("(?:${fields})"\\s*:\\s*)(-?\\d+)(?=\\s*[,}\\]])`, 'g'), '$1"$2"');
  return JSON.parse(lossless);
}

function httpPost(url, body, headers, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      timeout: timeoutMs
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(new Error('Ledger RPC response exceeded its configured size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('timeout', () => request.destroy(new Error('Ledger RPC request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

export function createJsonRpcClient(urlValue, options = {}) {
  const url = loopbackUrl(urlValue);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  const credentials = options.auth || null;
  if (credentials && (!['basic', 'digest'].includes(credentials.type) ||
      typeof credentials.username !== 'string' || typeof credentials.password !== 'string')) {
    throw new TypeError('RPC authentication configuration is invalid.');
  }
  const preserveMoneroIntegers = options.preserveMoneroIntegers === true;
  let requestId = 0;
  let challenge = null;
  let nonceCount = 0;

  return async function call(method, params = []) {
    if (typeof method !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(method)) throw new TypeError('RPC method is invalid.');
    const body = encodeJson({ jsonrpc: '2.0', id: String(++requestId), method, params });
    const headers = {};
    if (credentials?.type === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
    } else if (credentials?.type === 'digest' && challenge) {
      nonceCount++;
      headers.authorization = digestAuthorization(challenge, 'POST', `${url.pathname}${url.search}`, body, credentials, nonceCount);
    }
    let response = await httpPost(url, body, headers, timeoutMs, maxResponseBytes);
    if (response.status === 401 && credentials?.type === 'digest') {
      const refreshed = parseDigestChallenge(response.headers['www-authenticate']);
      if (!refreshed) throw new Error(`Ledger RPC ${method} requires unsupported authentication.`);
      if (!challenge || refreshed.nonce !== challenge.nonce || refreshed.stale === 'true') nonceCount = 0;
      challenge = refreshed;
      nonceCount++;
      response = await httpPost(url, body, {
        authorization: digestAuthorization(challenge, 'POST', `${url.pathname}${url.search}`, body, credentials, nonceCount)
      }, timeoutMs, maxResponseBytes);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Ledger RPC ${method} returned HTTP ${response.status}.`);
    let decoded;
    try { decoded = parseJson(response.body, preserveMoneroIntegers); }
    catch { throw new Error(`Ledger RPC ${method} returned invalid JSON.`); }
    if (decoded?.error) {
      const error = new Error(`Ledger RPC ${method} failed: ${String(decoded.error.message || 'unspecified RPC error').slice(0, 240)}`);
      error.rpcCode = decoded.error.code;
      throw error;
    }
    return decoded?.result ?? decoded;
  };
}

/** Send a plain JSON body to an authenticated loopback HTTP RPC endpoint using Digest auth. */
export function createDigestHttpJsonClient(urlValue, credentials, options = {}) {
  const url = loopbackUrl(urlValue);
  if (!credentials || typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
    throw new TypeError('RPC authentication configuration is invalid.');
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  let challenge = null;
  let nonceCount = 0;
  return async function post(payload) {
    const body = encodeJson(payload);
    let response = await httpPost(url, body, {}, timeoutMs, maxResponseBytes);
    if (response.status === 401) {
      const refreshed = parseDigestChallenge(response.headers['www-authenticate']);
      if (!refreshed) throw new Error('Ledger HTTP endpoint requires unsupported authentication.');
      if (!challenge || refreshed.nonce !== challenge.nonce || refreshed.stale === 'true') nonceCount = 0;
      challenge = refreshed;
      nonceCount++;
      response = await httpPost(url, body, {
        authorization: digestAuthorization(challenge, 'POST', `${url.pathname}${url.search}`, body, credentials, nonceCount)
      }, timeoutMs, maxResponseBytes);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Ledger HTTP endpoint returned ${response.status}.`);
    let decoded;
    try { decoded = parseJson(response.body, options.preserveMoneroIntegers === true); }
    catch { throw new Error('Ledger HTTP endpoint returned invalid JSON.'); }
    if (decoded?.error) throw new Error(`Ledger HTTP endpoint failed: ${String(decoded.error.message || decoded.error).slice(0, 240)}`);
    return decoded;
  };
}

function sats(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Bitcoin RPC returned an invalid amount.');
  const atomic = Math.round(amount * 100_000_000);
  if (!Number.isSafeInteger(atomic) || Math.abs(amount * 100_000_000 - atomic) > 0.0001) {
    throw new Error('Bitcoin RPC amount cannot be represented exactly in satoshis.');
  }
  return BigInt(atomic);
}

function btcAmount(atomicValue) {
  const atomic = BigInt(atomicValue);
  if (atomic < 1n || atomic > 2_100_000_000_000_000n) throw new Error('Bitcoin amount is outside the supported range.');
  const whole = atomic / 100_000_000n;
  const fraction = String(atomic % 100_000_000n).padStart(8, '0');
  return `${whole}.${fraction}`;
}

function requireKey(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
  return value;
}

export function createBitcoinCoreLedger(options = {}) {
  const rpcUrl = new URL(loopbackUrl(options.rpcUrl));
  if (options.walletName) rpcUrl.pathname = `${rpcUrl.pathname.replace(/\/$/, '')}/wallet/${encodeURIComponent(options.walletName)}`;
  const rpc = createJsonRpcClient(rpcUrl.href, {
    auth: { type: 'basic', username: requireKey(options.username, 'Bitcoin RPC username'), password: requireKey(options.password, 'Bitcoin RPC password') },
    timeoutMs: options.timeoutMs
  });
  const expectedChain = options.expectedChain || 'regtest';
  const minConfirmations = options.minConfirmations ?? 1;
  const minRefundConfirmations = options.minRefundConfirmations ?? minConfirmations;
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1 || !Number.isSafeInteger(minRefundConfirmations) || minRefundConfirmations < 1) {
    throw new TypeError('Bitcoin confirmation thresholds must be positive integers.');
  }
  async function assertNetwork() {
    const info = await rpc('getblockchaininfo');
    if (info.chain !== expectedChain) throw new Error(`Bitcoin node is on ${info.chain || 'an unknown chain'}, not ${expectedChain}.`);
  }
  async function transactions() { return rpc('listtransactions', ['*', 10000, 0, true]); }
  async function transaction(txid) { return rpc('gettransaction', [txid, true]); }
  async function findRefund(marker, address) {
    const matches = (await transactions()).filter(row => row.category === 'send' && row.comment === marker && row.address === address && TXID.test(row.txid || ''));
    if (matches.length > 1) throw new Error('Multiple Bitcoin refunds share one idempotency marker; manual reconciliation is required.');
    if (!matches.length) return null;
    const tx = await transaction(matches[0].txid);
    return { txid: tx.txid, confirmations: Number(tx.confirmations || 0), fee_atomic: sats(Math.abs(Number(tx.fee || 0))).toString() };
  }
  return Object.freeze({
    currency: 'BTC',
    async createAddress({ campaignId }) {
      await assertNetwork();
      return rpc('getnewaddress', [`Property campaign ${requireKey(campaignId, 'campaignId')}`, 'bech32']);
    },
    async lookupPayment({ address, currency = 'BTC' }) {
      if (currency !== 'BTC' || typeof address !== 'string' || !address) return null;
      await assertNetwork();
      const byTxid = new Map();
      for (const row of await transactions()) {
        if (row.category !== 'receive' || row.address !== address || !TXID.test(row.txid || '')) continue;
        const previous = byTxid.get(row.txid) || { amount: 0n, confirmations: Number(row.confirmations || 0) };
        previous.amount += sats(row.amount);
        previous.confirmations = Math.min(previous.confirmations, Number(row.confirmations || 0));
        byTxid.set(row.txid, previous);
      }
      if (!byTxid.size) return null;
      const entries = [...byTxid.entries()];
      const [txid, payment] = entries[0];
      const amount = entries.reduce((sum, [, value]) => sum + value.amount, 0n);
      const confirmations = Math.min(...entries.map(([, value]) => value.confirmations));
      return { address, currency: 'BTC', amount_atomic: amount.toString(), txid, confirmations,
        proof: entries.length === 1 && confirmations >= 0 };
    },
    async refundPayment({ payment, currency = 'BTC', amountAtomic, refundAddress, idempotencyKey }) {
      if (currency !== 'BTC' || payment?.currency !== 'BTC' || !TXID.test(payment.txid || '')) throw new Error('Bitcoin refund is not linked to a verified BTC payment.');
      await assertNetwork();
      if (String(payment.amount_atomic) !== String(amountAtomic)) throw new Error('Bitcoin refund amount must equal the verified payment amount.');
      const marker = `property-refund:${createHash('sha256').update(requireKey(idempotencyKey, 'idempotencyKey')).digest('hex')}`;
      const existing = await findRefund(marker, requireKey(refundAddress, 'refundAddress'));
      if (existing) return { ...existing, confirmed: existing.confirmations >= minRefundConfirmations };
      const received = await transaction(payment.txid);
      if (Number(received.confirmations || 0) < minConfirmations || Number(received.confirmations || 0) < 0) {
        return { confirmed: false, txid: payment.txid, reason: 'source_payment_not_confirmed' };
      }
      const validation = await rpc('validateaddress', [refundAddress]);
      if (validation.isvalid !== true) throw new Error('Bitcoin refund address is invalid for the configured wallet network.');
      const amount = BigInt(amountAtomic);
      const txid = await rpc('sendtoaddress', [refundAddress, btcAmount(amount), marker]);
      if (!TXID.test(txid || '')) throw new Error('Bitcoin Core did not return a valid refund transaction ID.');
      const sent = await transaction(txid);
      const confirmations = Number(sent.confirmations || 0);
      return { txid, confirmations, fee_atomic: sats(Math.abs(Number(sent.fee || 0))).toString(),
        confirmed: confirmations >= minRefundConfirmations };
    }
  });
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try { await rename(temporary, filePath); }
  catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
}

export function createMoneroWalletLedger(options = {}) {
  const walletRpc = createJsonRpcClient(options.walletRpcUrl, {
    auth: { type: 'digest', username: requireKey(options.username, 'Monero wallet RPC username'), password: requireKey(options.password, 'Monero wallet RPC password') },
    preserveMoneroIntegers: true, timeoutMs: options.timeoutMs
  });
  const daemonRpc = createJsonRpcClient(options.daemonRpcUrl, {
    auth: options.daemonUsername ? { type: 'digest', username: options.daemonUsername, password: requireKey(options.daemonPassword, 'Monero daemon RPC password') } : null,
    preserveMoneroIntegers: true, timeoutMs: options.timeoutMs
  });
  const statePath = path.join(path.resolve(requireKey(options.stateDir, 'Monero refund stateDir')), 'monero-refunds.json');
  const expectedNetwork = options.expectedNetwork || 'fakechain';
  const minConfirmations = options.minConfirmations ?? 10;
  const minRefundConfirmations = options.minRefundConfirmations ?? minConfirmations;
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1 || !Number.isSafeInteger(minRefundConfirmations) || minRefundConfirmations < 1) {
    throw new TypeError('Monero confirmation thresholds must be positive integers.');
  }
  let journal = null;
  let queue = Promise.resolve();
  async function loadJournal() {
    if (journal) return journal;
    try { journal = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      journal = { schema_version: 1, refunds: {} };
      await atomicJson(statePath, journal);
    }
    if (journal.schema_version !== 1 || !journal.refunds || typeof journal.refunds !== 'object' || Array.isArray(journal.refunds)) {
      throw new Error('Monero refund journal schema is invalid.');
    }
    return journal;
  }
  async function assertNetwork() {
    const info = await daemonRpc('get_info');
    if (info.nettype !== expectedNetwork) throw new Error(`Monero daemon is on ${info.nettype || 'an unknown network'}, not ${expectedNetwork}.`);
  }
  async function transferRows(flags) {
    const result = await walletRpc('get_transfers', { account_index: 0, ...flags });
    return ['in', 'out', 'pending', 'pool', 'failed'].flatMap(type => (result[type] || []).map(row => ({ ...row, type })));
  }
  async function findOutgoing(address, amount) {
    await walletRpc('refresh', {});
    const rows = await transferRows({ out: true, pending: true, pool: true });
    const matches = rows.filter(row => TXID.test(row.txid || '') && (row.destinations || []).some(destination =>
      destination.address === address && BigInt(String(destination.amount)) === amount));
    return [...new Map(matches.map(row => [row.txid, row])).values()];
  }
  async function refundResult(txid) {
    try {
      const details = await walletRpc('get_transfer_by_txid', { txid });
      const transfer = details.transfer;
      const confirmations = Number(transfer?.confirmations || 0);
      const feeAtomic = String(transfer?.fee || '0');
      const unlocked = transfer?.locked === false;
      return { txid, confirmations, fee_atomic: feeAtomic, confirmed: confirmations >= minRefundConfirmations && unlocked };
    } catch (error) {
      if (error.rpcCode === -8 || error.rpcCode === -5) return { txid, confirmations: 0, confirmed: false, reason: 'refund_not_yet_indexed' };
      throw error;
    }
  }
  return Object.freeze({
    currency: 'XMR',
    async createAddress({ campaignId }) {
      await assertNetwork();
      const result = await walletRpc('create_address', { account_index: 0, label: `Property campaign ${requireKey(campaignId, 'campaignId')}` });
      if (!result.address || !Number.isSafeInteger(result.address_index)) throw new Error('Monero wallet did not return a unique subaddress.');
      return result.address;
    },
    async lookupPayment({ address, currency = 'XMR' }) {
      if (currency !== 'XMR' || typeof address !== 'string' || !address) return null;
      await assertNetwork();
      const addressIndex = await walletRpc('get_address_index', { address });
      if (!addressIndex.index || addressIndex.index.major !== 0 || !Number.isSafeInteger(addressIndex.index.minor)) return null;
      const result = await walletRpc('get_transfers', { in: true, pending: true, pool: true,
        account_index: addressIndex.index.major, subaddr_indices: [addressIndex.index.minor] });
      const rows = ['in', 'pending', 'pool'].flatMap(type => (result[type] || []).map(row => ({ ...row, type })))
        .filter(row => row.address === address && TXID.test(row.txid || ''));
      const byTxid = new Map();
      for (const row of rows) {
        const existing = byTxid.get(row.txid) || { amount: 0n, confirmations: Number(row.confirmations || 0), locked: true, row };
        existing.amount += BigInt(String(row.amount));
        existing.confirmations = Math.min(existing.confirmations, Number(row.confirmations || 0));
        existing.locked = existing.locked && row.locked !== false;
        byTxid.set(row.txid, existing);
      }
      if (!byTxid.size) return null;
      const entries = [...byTxid.entries()];
      const [txid, payment] = entries[0];
      const amount = entries.reduce((sum, [, row]) => sum + row.amount, 0n);
      const confirmations = Math.min(...entries.map(([, row]) => row.confirmations));
      const unlocked = entries.every(([, row]) => !row.locked);
      return { address, currency: 'XMR', amount_atomic: amount.toString(), txid,
        confirmations: unlocked ? confirmations : 0, proof: entries.length === 1 && !payment.row.double_spend_seen };
    },
    async refundPayment(request) {
      return serialized(async () => {
        if (request.currency !== 'XMR' || request.payment?.currency !== 'XMR' || !TXID.test(request.payment.txid || '')) {
          throw new Error('Monero refund is not linked to a verified XMR payment.');
        }
        await assertNetwork();
        const amount = BigInt(request.amountAtomic);
        if (amount < 1n || String(request.payment.amount_atomic) !== amount.toString()) {
          throw new Error('Monero refund amount must equal the verified payment amount.');
        }
        const refundAddress = requireKey(request.refundAddress, 'refundAddress');
        const id = createHash('sha256').update(requireKey(request.idempotencyKey, 'idempotencyKey')).digest('hex');
        const current = await loadJournal();
        let record = current.refunds[id];
        if (record && (record.currency !== 'XMR' || record.amount_atomic !== amount.toString() || record.refund_address !== refundAddress || record.payment_txid !== request.payment.txid)) {
          throw new Error('Monero refund idempotency key was reused for different terms.');
        }
        if (record?.txid) return refundResult(record.txid);
        if (Number(request.payment.confirmations || 0) < minConfirmations || request.payment.proof !== true) {
          return { confirmed: false, reason: 'source_payment_not_confirmed' };
        }
        if (!record) {
          record = current.refunds[id] = { currency: 'XMR', payment_txid: request.payment.txid,
            amount_atomic: amount.toString(), refund_address: refundAddress, status: 'intent', created_at: Math.floor(Date.now() / 1000), txid: null };
          await atomicJson(statePath, current);
        }
        let matches = await findOutgoing(refundAddress, amount);
        if (matches.length > 1) throw new Error('Multiple Monero refunds match a pending idempotency key; manual reconciliation is required.');
        if (matches.length === 1) {
          record.txid = matches[0].txid;
          record.status = 'broadcast';
          await atomicJson(statePath, current);
          return refundResult(record.txid);
        }
        const sent = await walletRpc('transfer', { destinations: [{ address: refundAddress, amount }], account_index: 0, priority: 1, get_tx_key: false });
        if (!TXID.test(sent.tx_hash || '')) throw new Error('Monero wallet did not return a valid refund transaction ID.');
        record.txid = sent.tx_hash;
        record.fee_atomic = String(sent.fee || '0');
        record.status = 'broadcast';
        await atomicJson(statePath, current);
        return { ...(await refundResult(record.txid)), fee_atomic: String(sent.fee || '0') };
      });
    }
  });
  function serialized(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }
}

export function combineCampaignLedgers(adapters) {
  if (!Array.isArray(adapters) || adapters.some(adapter => !adapter || typeof adapter.currency !== 'string')) {
    throw new TypeError('Each currency must have exactly one ledger adapter.');
  }
  const byCurrency = new Map(adapters.map(adapter => [adapter.currency, adapter]));
  if (byCurrency.size !== adapters.length) throw new TypeError('Each currency must have exactly one ledger adapter.');
  function adapter(currency) {
    const result = byCurrency.get(currency);
    if (!result) throw new Error(`No real ledger adapter is configured for ${currency}.`);
    return result;
  }
  return Object.freeze({
    addressProvider: request => adapter(request.currency).createAddress(request),
    lookupPayment: request => adapter(request.currency).lookupPayment(request),
    refundPayment: request => adapter(request.currency).refundPayment(request)
  });
}

function nanoRaw(value) {
  const amount = BigInt(String(value));
  if (amount < 1n || amount >= (1n << 128n)) throw new Error('Nano amount is outside the supported raw range.');
  return amount;
}

function nanoAccount(value) {
  return typeof value === 'string' && /^(?:nano|xrb)_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(value);
}

function nanoConfirmed(value) {
  return value === true || value === 'true';
}

/**
 * Adapter for a Nano node's loopback JSON RPC. Nano's built-in RPC does not
 * authenticate HTTP requests, so deployments must keep it loopback-only or
 * put an authenticated local gateway in front of it. This adapter always
 * sends Basic credentials to the configured loopback endpoint.
 */
export function createNanoNodeLedger(options = {}) {
  const url = loopbackUrl(options.rpcUrl);
  const username = requireKey(options.username, 'Nano RPC username');
  const password = requireKey(options.password, 'Nano RPC password');
  const wallet = requireKey(options.wallet, 'Nano wallet id');
  const expectedNetwork = options.expectedNetwork || 'dev';
  const minConfirmations = options.minConfirmations ?? 1;
  const minRefundConfirmations = options.minRefundConfirmations ?? minConfirmations;
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1 ||
      !Number.isSafeInteger(minRefundConfirmations) || minRefundConfirmations < 1) {
    throw new TypeError('Nano confirmation thresholds must be positive integers.');
  }
  const statePath = path.join(path.resolve(requireKey(options.stateDir, 'Nano refund stateDir')), 'nano-refunds.json');
  let journal = null;
  let queue = Promise.resolve();

  async function rpc(action, params = {}) {
    if (typeof action !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(action)) throw new TypeError('Nano RPC action is invalid.');
    const body = JSON.stringify({ action, ...params });
    const response = await httpPost(url, body, {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    }, options.timeoutMs ?? 15_000, options.maxResponseBytes ?? 2 * 1024 * 1024);
    if (response.status < 200 || response.status >= 300) throw new Error(`Nano RPC ${action} returned HTTP ${response.status}.`);
    let result;
    try { result = JSON.parse(response.body); }
    catch { throw new Error(`Nano RPC ${action} returned invalid JSON.`); }
    if (typeof result?.error === 'string' && result.error) throw new Error(`Nano RPC ${action} failed: ${result.error.slice(0, 240)}`);
    return result;
  }

  async function assertNetwork() {
    const info = await rpc('version');
    const network = String(info.network || '').toLowerCase();
    if (network !== expectedNetwork.toLowerCase()) {
      throw new Error(`Nano node is on ${network || 'an unknown network'}, not ${expectedNetwork}.`);
    }
  }

  async function loadJournal() {
    if (journal) return journal;
    try { journal = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      journal = { schema_version: 1, refunds: {}, receipts: {} };
      await atomicJson(statePath, journal);
    }
    if (journal.schema_version !== 1 || !journal.refunds || typeof journal.refunds !== 'object' || Array.isArray(journal.refunds) ||
        !journal.receipts || typeof journal.receipts !== 'object' || Array.isArray(journal.receipts)) {
      throw new Error('Nano ledger journal schema is invalid.');
    }
    return journal;
  }

  async function blockDetails(hash) {
    if (!TXID.test(hash || '')) return null;
    try { return await rpc('block_info', { hash }); }
    catch (error) {
      if (/not found|not exist|not valid|invalid block/i.test(error.message)) return null;
      throw error;
    }
  }

  async function findReceipt(address) {
    const saved = (await loadJournal()).receipts[address];
    if (saved?.source_txid && saved?.receive_txid) {
      const source = await blockDetails(saved.source_txid);
      const received = await blockDetails(saved.receive_txid);
      if (source && received) return { ...saved, confirmations: nanoConfirmed(received.confirmed) ? 1 : 0 };
    }
    const history = await rpc('account_history', { account: address, count: '100', raw: true, include_linked_account: true });
    // Nano v28 reports a state receive as type=state/subtype=receive and an
    // account's first receipt as type=open/source=<send hash> in raw history.
    const receive = (history.history || []).find(row => {
      const isReceive = row.type === 'receive' || row.type === 'open' ||
        (row.type === 'state' && row.subtype === 'receive');
      return isReceive && TXID.test(row.hash || '');
    });
    let sourceTxid = receive?.link || receive?.source;
    let receiveInfo = null;
    if (receive && !TXID.test(sourceTxid || '')) {
      // Some Nano RPC gateways normalize account_history even when raw=true
      // and omit the source block hash. Recover it from the confirmed receive
      // block itself instead of treating a real payment as absent.
      receiveInfo = await rpc('block_info', { hash: receive.hash, json_block: 'true' });
      let contents = receiveInfo.contents;
      if (typeof contents === 'string') {
        try { contents = JSON.parse(contents); }
        catch { contents = null; }
      }
      sourceTxid = contents?.link || contents?.source || receiveInfo.source_hash;
    }
    if (!receive || !TXID.test(sourceTxid || '')) return null;
    const amountAtomic = String(receive.amount || receiveInfo?.amount || '');
    if (!/^\d+$/.test(amountAtomic)) return null;
    const record = { source_txid: sourceTxid, receive_txid: receive.hash, amount_atomic: amountAtomic, address };
    (await loadJournal()).receipts[address] = record;
    await atomicJson(statePath, journal);
    return { ...record, confirmations: nanoConfirmed(receive.confirmed) ? 1 : 0 };
  }

  return Object.freeze({
    currency: 'XNO',
    async createAddress({ campaignId }) {
      await assertNetwork();
      const created = await rpc('account_create', { wallet, work: true });
      if (!nanoAccount(created.account)) throw new Error('Nano node did not create a valid campaign account.');
      return created.account;
    },
    async lookupPayment({ address, currency = 'XNO' }) {
      if (currency !== 'XNO' || !nanoAccount(address)) return null;
      await assertNetwork();
      const prior = await findReceipt(address);
      if (prior) {
        const source = await blockDetails(prior.source_txid);
        const received = await blockDetails(prior.receive_txid);
        return { address, currency: 'XNO', amount_atomic: prior.amount_atomic, txid: prior.source_txid,
          confirmations: nanoConfirmed(received?.confirmed) && nanoConfirmed(source?.confirmed) ? 1 : 0, proof: Boolean(source && received) };
      }
      const pending = await rpc('receivable', { account: address, count: '100', source: true,
        include_active: true, include_only_confirmed: false });
      const blocks = pending.blocks?.[address] || {};
      const entries = Object.entries(blocks).filter(([hash, row]) => TXID.test(hash) && row && typeof row === 'object');
      if (!entries.length) return null;
      if (entries.length !== 1) {
        const total = entries.reduce((sum, [, row]) => sum + BigInt(String(row.amount || '0')), 0n);
        return { address, currency: 'XNO', amount_atomic: total.toString(), txid: entries[0][0], confirmations: 0, proof: false };
      }
      const [sourceTxid, row] = entries[0];
      const source = await blockDetails(sourceTxid);
      if (!source) return null;
      const amount = nanoRaw(row.amount);
      if (!nanoConfirmed(source.confirmed)) return { address, currency: 'XNO', amount_atomic: amount.toString(),
        txid: sourceTxid, confirmations: 0, proof: true };
      const received = await rpc('receive', { wallet, account: address, block: sourceTxid });
      if (!TXID.test(received.block || '')) throw new Error('Nano node did not return a valid receive block hash.');
      const receiveInfo = await blockDetails(received.block);
      const record = { source_txid: sourceTxid, receive_txid: received.block, amount_atomic: amount.toString(), address };
      (await loadJournal()).receipts[address] = record;
      await atomicJson(statePath, journal);
      return { address, currency: 'XNO', amount_atomic: amount.toString(), txid: sourceTxid,
        confirmations: nanoConfirmed(source.confirmed) && nanoConfirmed(receiveInfo?.confirmed) ? 1 : 0, proof: true };
    },
    async refundPayment(request) {
      return serialized(async () => {
        if (request.currency !== 'XNO' || request.payment?.currency !== 'XNO' || !TXID.test(request.payment.txid || '') ||
            !nanoAccount(request.payment.address) || !nanoAccount(request.refundAddress)) {
          throw new Error('Nano refund is not linked to a verified XNO payment and valid accounts.');
        }
        await assertNetwork();
        const amount = nanoRaw(request.amountAtomic);
        if (String(request.payment.amount_atomic) !== amount.toString()) throw new Error('Nano refund amount must equal the verified payment amount.');
        if (Number(request.payment.confirmations || 0) < minConfirmations || request.payment.proof !== true) {
          return { confirmed: false, reason: 'source_payment_not_confirmed' };
        }
        const id = createHash('sha256').update(requireKey(request.idempotencyKey, 'idempotencyKey')).digest('hex');
        const current = await loadJournal();
        let record = current.refunds[id];
        if (record && (record.amount_atomic !== amount.toString() || record.source !== request.payment.address ||
            record.destination !== request.refundAddress || record.payment_txid !== request.payment.txid)) {
          throw new Error('Nano refund idempotency key was reused for different terms.');
        }
        if (record?.txid) {
          const info = await blockDetails(record.txid);
          return { txid: record.txid, confirmations: nanoConfirmed(info?.confirmed) ? 1 : 0,
            fee_atomic: '0', confirmed: nanoConfirmed(info?.confirmed) && minRefundConfirmations <= 1 };
        }
        record ||= current.refunds[id] = { amount_atomic: amount.toString(), source: request.payment.address,
          destination: request.refundAddress, payment_txid: request.payment.txid, status: 'intent', txid: null };
        await atomicJson(statePath, current);
        // Nano's send RPC persists id -> block mapping; retrying the same ID after
        // a lost response returns/broadcasts the original block rather than paying twice.
        const sent = await rpc('send', { wallet, source: request.payment.address, destination: request.refundAddress,
          amount: amount.toString(), id: `property-refund:${id}` });
        if (!TXID.test(sent.block || '')) throw new Error('Nano node did not return a valid refund block hash.');
        record.txid = sent.block; record.status = 'broadcast';
        await atomicJson(statePath, current);
        const info = await blockDetails(record.txid);
        return { txid: record.txid, confirmations: nanoConfirmed(info?.confirmed) ? 1 : 0,
          fee_atomic: '0', confirmed: nanoConfirmed(info?.confirmed) && minRefundConfirmations <= 1 };
      });
    }
  });

  function serialized(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }
}
