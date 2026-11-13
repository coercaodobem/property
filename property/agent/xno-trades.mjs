import { createHash, randomBytes } from 'node:crypto';
import { parseStrictJson } from './ipc.mjs';
import { exactObject, PUBKEY, validateToolText } from './core.mjs';
import { nanoTradeIdempotencyKey } from './nano-wallet.mjs';

export const XNO_TRADE_PROTOCOL = 'property-xno-trade/v1';
export const XNO_TRADE_TTL_MAX_SECONDS = 7 * 24 * 60 * 60;
export const XNO_TRADE_TERMS_MAX_BYTES = 4096;

const TRADE_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const TXID = /^[0-9a-f]{64}$/i;
const ACCOUNT = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const MAX_RAW = (1n << 128n) - 1n;
const OFFER_KEYS = ['protocol', 'type', 'trade_id', 'buyer_pubkey', 'seller_pubkey', 'seller_account', 'amount_raw', 'terms', 'terms_sha256', 'created_at', 'expires_at'];
const RECEIPT_KEYS = ['protocol', 'type', 'trade_id', 'offer_message_id', 'payer_pubkey', 'payer_account', 'payee_pubkey', 'payee_account', 'amount_raw', 'terms_sha256', 'txid'];

function raw(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,38}$/.test(value)) throw new Error('xno-amount-invalid');
  const amount = BigInt(value);
  if (amount < 1n || amount > MAX_RAW) throw new Error('xno-amount-invalid');
  return amount;
}

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function hashMatches(value, expected) { return HASH.test(expected || '') && digest(value) === expected; }

function validateOffer(value, sender, receiver) {
  if (!exactObject(value, OFFER_KEYS) || value.protocol !== XNO_TRADE_PROTOCOL || value.type !== 'offer' || !TRADE_ID.test(value.trade_id || '') ||
      !PUBKEY.test(value.buyer_pubkey || '') || !PUBKEY.test(value.seller_pubkey || '') || value.seller_pubkey !== sender || value.buyer_pubkey !== receiver ||
      !ACCOUNT.test(value.seller_account || '') || typeof value.terms !== 'string' ||
      Buffer.byteLength(value.terms, 'utf8') > XNO_TRADE_TERMS_MAX_BYTES || !Number.isSafeInteger(value.created_at) || value.created_at < 0 ||
      !Number.isSafeInteger(value.expires_at) || value.expires_at <= value.created_at || value.expires_at - value.created_at > XNO_TRADE_TTL_MAX_SECONDS) {
    throw new Error('xno-offer-invalid');
  }
  if (!hashMatches(value.terms, value.terms_sha256)) throw new Error('xno-offer-invalid');
  const amount = raw(value.amount_raw);
  return { ...value, amount };
}

function parseOfferMessage(message, sender, receiver) {
  if (!message || message.direction !== 'received' || message.conversation_pubkey !== sender || !/^[0-9a-f]{32}$/.test(message.message_id || '') || typeof message.body !== 'string') {
    throw new Error('xno-offer-not-authenticated');
  }
  let value;
  try { value = parseStrictJson(message.body, 8 * 1024); } catch { throw new Error('xno-offer-invalid'); }
  return validateOffer(value, sender, receiver);
}

function validateReceipt(value, payer, payee) {
  if (!exactObject(value, RECEIPT_KEYS) || value.protocol !== XNO_TRADE_PROTOCOL || value.type !== 'payment_receipt' || !TRADE_ID.test(value.trade_id || '') ||
      !/^[0-9a-f]{32}$/.test(value.offer_message_id || '') || value.payer_pubkey !== payer || value.payee_pubkey !== payee ||
      !PUBKEY.test(value.payer_pubkey || '') || !PUBKEY.test(value.payee_pubkey || '') || !ACCOUNT.test(value.payer_account || '') || !ACCOUNT.test(value.payee_account || '') ||
      !TXID.test(value.txid || '') || !HASH.test(value.terms_sha256 || '')) throw new Error('xno-receipt-invalid');
  return { ...value, amount: raw(value.amount_raw) };
}

export function emptyXnoJournal() {
  return { schema: 'property-agent-xno-journal/v1', version: 1, budget_committed_raw: '0', offers: {}, payments: {}, receipts: {}, disputes: {} };
}

export function validateXnoJournal(value) {
  const keys = ['schema', 'version', 'budget_committed_raw', 'offers', 'payments', 'receipts', 'disputes'];
  if (!exactObject(value, keys) || value.schema !== 'property-agent-xno-journal/v1' || value.version !== 1 ||
      typeof value.budget_committed_raw !== 'string' || !/^(?:0|[1-9]\d{0,38})$/.test(value.budget_committed_raw) ||
      BigInt(value.budget_committed_raw) > MAX_RAW) throw new Error('xno-journal-invalid');
  for (const name of ['offers', 'payments', 'receipts', 'disputes']) {
    if (!value[name] || typeof value[name] !== 'object' || Array.isArray(value[name]) || Object.keys(value[name]).length > 10_000) throw new Error('xno-journal-invalid');
  }
  for (const [id, record] of Object.entries(value.offers)) {
    if (!TRADE_ID.test(id) || !record || record.trade_id !== id || !PUBKEY.test(record.peer_pubkey || '') || !ACCOUNT.test(record.account || '') ||
        !TRADE_ID.test(record.trade_id) || !/^[0-9a-f]{32}$/.test(record.message_id || '') || !HASH.test(record.terms_sha256 || '') ||
        typeof record.amount_raw !== 'string' || !/^[1-9]\d{0,38}$/.test(record.amount_raw)) throw new Error('xno-journal-invalid');
  }
  for (const [id, record] of Object.entries(value.payments)) {
    if (!TRADE_ID.test(id) || !record || record.trade_id !== id || !/^[0-9a-f]{32}$/.test(record.offer_message_id || '') ||
        !PUBKEY.test(record.peer_pubkey || '') || !ACCOUNT.test(record.source_account || '') || !ACCOUNT.test(record.destination || '') ||
        typeof record.amount_raw !== 'string' || !/^[1-9]\d{0,38}$/.test(record.amount_raw) || !HASH.test(record.terms_sha256 || '') ||
        !HASH.test(record.offer_fingerprint || '') ||
        !['prepared', 'submitted', 'confirmed'].includes(record.status) || !(record.txid === null || TXID.test(record.txid)) ||
        typeof record.receipt_message_id !== 'string' || !(record.receipt_message_id === '' || /^[0-9a-f]{32}$/.test(record.receipt_message_id))) throw new Error('xno-journal-invalid');
  }
  for (const [id, record] of Object.entries(value.receipts)) {
    if (!TRADE_ID.test(id) || !record || record.trade_id !== id || !TXID.test(record.txid || '') || !/^[0-9a-f]{32}$/.test(record.receipt_message_id || '') ||
        !PUBKEY.test(record.payer_pubkey || '') || !/^[0-9a-f]{32}$/.test(record.offer_message_id || '') ||
        !['verified', 'received'].includes(record.status) || !(record.receive_txid === null || TXID.test(record.receive_txid))) throw new Error('xno-journal-invalid');
  }
  for (const [id, record] of Object.entries(value.disputes)) {
    if (!TRADE_ID.test(id) || !record || record.trade_id !== id || !/^[0-9a-f]{32}$/.test(record.message_id || '') || !HASH.test(record.summary_sha256 || '')) throw new Error('xno-journal-invalid');
  }
  const committed = Object.values(value.payments).reduce((sum, item) => sum + BigInt(item.amount_raw), 0n);
  if (committed.toString() !== value.budget_committed_raw) throw new Error('xno-journal-budget-mismatch');
  return structuredClone(value);
}

export function createXnoTradeService({ pubkey, blockedPubkeys = () => [], relays = () => [], wallet, transport, loadJournal, saveJournal,
  now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  if (!PUBKEY.test(pubkey) || !wallet || !transport || typeof loadJournal !== 'function' || typeof saveJournal !== 'function') throw new Error('xno-service-invalid');
  let queue = Promise.resolve();
  const serialize = task => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
  const configRelays = () => {
    const list = relays();
    if (!Array.isArray(list) || !list.length) throw new Error('relay-not-configured');
    return list;
  };
  const ensurePeerAllowed = peer => {
    if (!PUBKEY.test(peer || '') || peer === pubkey) throw new Error('invalid-arguments');
    if (blockedPubkeys().includes(peer)) throw new Error('agent-blocked-locally');
  };
  const journal = async () => validateXnoJournal(await loadJournal());

  async function policy() {
    const state = await journal();
    const walletPolicy = await wallet.policy();
    const committed = BigInt(state.budget_committed_raw);
    const budget = BigInt(walletPolicy.lifetime_budget_raw);
    return { ...walletPolicy, budget_committed_raw: committed.toString(), budget_remaining_raw: (budget > committed ? budget - committed : 0n).toString(), escrow: false,
      limitation: 'Nano does not enforce delivery-conditioned payment; this is capped direct payment, not escrow.' };
  }

  async function createOffer(params) {
    if (!exactObject(params, ['recipient_pubkey', 'amount_raw', 'terms', 'expires_in_seconds'])) throw new Error('invalid-arguments');
    ensurePeerAllowed(params.recipient_pubkey);
    const amount = raw(params.amount_raw);
    const terms = validateToolText(params.terms);
    if (Buffer.byteLength(terms, 'utf8') > XNO_TRADE_TERMS_MAX_BYTES) throw new Error('xno-terms-too-large');
    const ttl = params.expires_in_seconds;
    if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > XNO_TRADE_TTL_MAX_SECONDS) throw new Error('xno-offer-expiry-invalid');
    if (amount > wallet.maxRawPerPayment) throw new Error('xno-payment-limit-exceeded');
    await wallet.assertReady();
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    const tradeId = randomId();
    if (!TRADE_ID.test(tradeId)) throw new Error('xno-trade-id-invalid');
    const offer = { protocol: XNO_TRADE_PROTOCOL, type: 'offer', trade_id: tradeId, buyer_pubkey: params.recipient_pubkey,
      seller_pubkey: pubkey, seller_account: wallet.account, amount_raw: amount.toString(), terms, terms_sha256: digest(terms),
      created_at: current, expires_at: current + ttl };
    const result = await transport.sendMessage(params.recipient_pubkey, JSON.stringify(offer), null, configRelays());
    if (!result || !/^[0-9a-f]{32}$/.test(result.message_id || '')) throw new Error('xno-offer-send-failed');
    const state = await journal();
    state.offers[tradeId] = { trade_id: tradeId, peer_pubkey: params.recipient_pubkey, account: wallet.account,
      amount_raw: amount.toString(), terms_sha256: offer.terms_sha256, message_id: result.message_id };
    await saveJournal(validateXnoJournal(state));
    return { status: result.status || 'sent', trade_id: tradeId, offer_message_id: result.message_id, amount_raw: amount.toString(),
      seller_account: wallet.account, expires_at: offer.expires_at, relay_acks: result.relay_acks || 0, relay_attempts: result.relay_attempts || 0 };
  }

  async function payOffer(params) {
    if (!exactObject(params, ['conversation_pubkey', 'offer_message_id']) || !/^[0-9a-f]{32}$/.test(params.offer_message_id || '')) throw new Error('invalid-arguments');
    ensurePeerAllowed(params.conversation_pubkey);
    const messages = await transport.readMessages(params.conversation_pubkey, 100);
    const message = messages.find(item => item.message_id === params.offer_message_id);
    if (!message) throw new Error('xno-offer-not-found');
    const offer = parseOfferMessage(message, params.conversation_pubkey, pubkey);
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    if (current > offer.expires_at) throw new Error('xno-offer-expired');
    if (offer.amount > wallet.maxRawPerPayment) throw new Error('xno-payment-limit-exceeded');

    const state = await journal();
    const existing = state.payments[offer.trade_id];
    const offerFingerprint = digest(message.body);
    if (existing && (existing.offer_message_id !== message.message_id || existing.offer_fingerprint !== offerFingerprint || existing.peer_pubkey !== params.conversation_pubkey)) {
      throw new Error('xno-trade-id-reused');
    }
    if (!existing) {
      const committed = BigInt(state.budget_committed_raw);
      if (committed + offer.amount > wallet.lifetimeBudgetRaw) throw new Error('xno-lifetime-budget-exceeded');
      state.budget_committed_raw = (committed + offer.amount).toString();
      state.payments[offer.trade_id] = { trade_id: offer.trade_id, offer_message_id: message.message_id, offer_fingerprint: offerFingerprint,
        peer_pubkey: params.conversation_pubkey, source_account: wallet.account, destination: offer.seller_account, amount_raw: offer.amount_raw,
        terms_sha256: offer.terms_sha256, status: 'prepared', txid: null, receipt_message_id: '' };
      await saveJournal(validateXnoJournal(state));
    }
    const record = state.payments[offer.trade_id];
    if (!record.txid) {
      const sent = await wallet.send({ destination: offer.seller_account, amountRaw: offer.amount_raw,
        idempotencyKey: nanoTradeIdempotencyKey(pubkey, offer.trade_id) });
      if (!TXID.test(sent?.txid || '')) throw new Error('xno-payment-result-invalid');
      record.txid = sent.txid.toUpperCase();
      record.status = 'submitted';
      await saveJournal(validateXnoJournal(state));
    }

    let receipt = { status: 'pending', message_id: record.receipt_message_id || '' };
    if (!record.receipt_message_id) {
      const body = { protocol: XNO_TRADE_PROTOCOL, type: 'payment_receipt', trade_id: offer.trade_id, offer_message_id: message.message_id,
        payer_pubkey: pubkey, payer_account: wallet.account, payee_pubkey: params.conversation_pubkey, payee_account: offer.seller_account,
        amount_raw: offer.amount_raw, terms_sha256: offer.terms_sha256, txid: record.txid };
      try {
        const result = await transport.sendMessage(params.conversation_pubkey, JSON.stringify(body), message.message_id, configRelays());
        if (/^[0-9a-f]{32}$/.test(result?.message_id || '')) {
          record.receipt_message_id = result.message_id;
          receipt = { status: result.status || 'sent', message_id: result.message_id, relay_acks: result.relay_acks || 0, relay_attempts: result.relay_attempts || 0 };
          await saveJournal(validateXnoJournal(state));
        }
      } catch { /* payment already has an idempotent chain record; status can be checked and receipt retried */ }
    } else receipt = { status: 'already-sent', message_id: record.receipt_message_id };
    return { status: record.status, trade_id: offer.trade_id, txid: record.txid, amount_raw: offer.amount_raw,
      destination: offer.seller_account, receipt, reversible: false, escrow: false };
  }

  async function tradeStatus(params) {
    if (!exactObject(params, ['trade_id']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    const state = await journal();
    const record = state.payments[params.trade_id];
    if (!record) throw new Error('xno-trade-not-found');
    if (record.txid) {
      const observed = await wallet.inspectSend({ txid: record.txid, destination: record.destination, amountRaw: record.amount_raw, source: record.source_account });
      if (observed.confirmed && record.status !== 'confirmed') {
        record.status = 'confirmed';
        await saveJournal(validateXnoJournal(state));
      }
      return { ...record, status: observed.status, confirmed: observed.confirmed, txid: observed.txid, reversible: false, escrow: false };
    }
    return { ...record, status: 'prepared', confirmed: false, retry_safe: true, reversible: false, escrow: false };
  }

  async function verifyReceipt(params) {
    if (!exactObject(params, ['conversation_pubkey', 'receipt_message_id']) || !/^[0-9a-f]{32}$/.test(params.receipt_message_id || '')) throw new Error('invalid-arguments');
    ensurePeerAllowed(params.conversation_pubkey);
    const messages = await transport.readMessages(params.conversation_pubkey, 100);
    const message = messages.find(item => item.message_id === params.receipt_message_id);
    if (!message || message.direction !== 'received' || message.conversation_pubkey !== params.conversation_pubkey) throw new Error('xno-receipt-not-authenticated');
    let payload;
    try { payload = parseStrictJson(message.body, 8 * 1024); } catch { throw new Error('xno-receipt-invalid'); }
    const receipt = validateReceipt(payload, params.conversation_pubkey, pubkey);
    const state = await journal();
    const offer = state.offers[receipt.trade_id];
    if (!offer || offer.message_id !== receipt.offer_message_id || offer.peer_pubkey !== params.conversation_pubkey ||
        offer.account !== receipt.payee_account || offer.amount_raw !== receipt.amount_raw || offer.terms_sha256 !== receipt.terms_sha256) throw new Error('xno-receipt-does-not-match-offer');
    const existing = state.receipts[receipt.trade_id];
    if (existing && (existing.txid !== receipt.txid || existing.offer_message_id !== receipt.offer_message_id || existing.payer_pubkey !== receipt.payer_pubkey)) {
      throw new Error('xno-receipt-replay-conflict');
    }
    if (existing?.status === 'received') return { ...existing, confirmed: true, amount_raw: receipt.amount_raw, destination: wallet.account, duplicated: true, reversible: false, escrow: false };
    const observed = await wallet.inspectSendForReceipt({ txid: receipt.txid, destination: wallet.account, amountRaw: receipt.amount_raw, source: receipt.payer_account });
    if (!observed.confirmed) return { status: 'pending', trade_id: receipt.trade_id, txid: observed.txid, confirmed: false, received: false };
    const receive = await wallet.receiveConfirmed({ txid: observed.txid, sourceAccount: receipt.payer_account, amountRaw: receipt.amount_raw });
    const record = { trade_id: receipt.trade_id, receipt_message_id: message.message_id, offer_message_id: receipt.offer_message_id,
      payer_pubkey: receipt.payer_pubkey, txid: observed.txid, status: receive.received ? 'received' : 'verified', receive_txid: receive.receive_txid || null };
    state.receipts[receipt.trade_id] = record;
    await saveJournal(validateXnoJournal(state));
    return { ...record, confirmed: true, amount_raw: receipt.amount_raw, destination: wallet.account, reversible: false, escrow: false };
  }

  async function dispute(params) {
    if (!exactObject(params, ['conversation_pubkey', 'trade_id', 'summary']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    ensurePeerAllowed(params.conversation_pubkey);
    const summary = validateToolText(params.summary);
    if (Buffer.byteLength(summary, 'utf8') > 2 * 1024) throw new Error('xno-dispute-summary-too-large');
    const state = await journal();
    const offer = state.offers[params.trade_id];
    const payment = state.payments[params.trade_id];
    const receipt = state.receipts[params.trade_id];
    if (!offer && !payment && !receipt) throw new Error('xno-trade-not-found');
    const peer = offer?.peer_pubkey || payment?.peer_pubkey || receipt?.payer_pubkey;
    if (peer !== params.conversation_pubkey) throw new Error('xno-trade-peer-mismatch');
    const body = { protocol: XNO_TRADE_PROTOCOL, type: 'dispute', trade_id: params.trade_id, author_pubkey: pubkey, summary, summary_sha256: digest(summary) };
    const relatedMessageId = offer?.message_id || payment?.offer_message_id || receipt?.offer_message_id;
    const result = await transport.sendMessage(params.conversation_pubkey, JSON.stringify(body), relatedMessageId, configRelays());
    if (!/^[0-9a-f]{32}$/.test(result?.message_id || '')) throw new Error('xno-dispute-send-failed');
    state.disputes[params.trade_id] = { trade_id: params.trade_id, message_id: result.message_id, summary_sha256: digest(summary) };
    await saveJournal(validateXnoJournal(state));
    return { status: result.status || 'sent', trade_id: params.trade_id, message_id: result.message_id, relay_acks: result.relay_acks || 0,
      escrow: false, funds_frozen: false, resolution: 'not-enforced-by-Nano' };
  }

  return Object.freeze({
    policy: () => serialize(policy),
    createOffer: params => serialize(() => createOffer(params)),
    payOffer: params => serialize(() => payOffer(params)),
    tradeStatus: params => serialize(() => tradeStatus(params)),
    verifyReceipt: params => serialize(() => verifyReceipt(params)),
    dispute: params => serialize(() => dispute(params)),
  });
}
