import { createHash, randomBytes } from 'node:crypto';
import { exactObject, PUBKEY, validateToolText } from './core.mjs';
import { canonicalJson, parseVersionedJson } from './protocol-contract.mjs';
import { XNO_TRADE_PROTOCOL } from './xno-trades.mjs';

export const PAID_JOB_PROTOCOL = 'property-paid-job/v1';
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const ACCOUNT = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const MAX_RAW = (1n << 128n) - 1n;
const PAYOUT_PREFIX = 'Property paid job v1;';

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function exactKeys(value, keys) { return exactObject(value, keys); }
function rawAmount(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,38}$/.test(value) || BigInt(value) > MAX_RAW) throw new Error('paid-job-amount-invalid');
  return value;
}
function safeText(value, code, maxBytes) {
  const text = validateToolText(value);
  if (!text || Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(code);
  return text;
}
function id(value, code = 'invalid-arguments') {
  if (!HEX_32.test(value || '')) throw new Error(code);
  return value;
}

function parseJobMessage(message, peer, self, now) {
  if (!message || !['sent', 'received'].includes(message.direction) || message.conversation_pubkey !== peer ||
      !HEX_32.test(message.message_id || '') || typeof message.body !== 'string') throw new Error('paid-job-message-not-authenticated');
  let value;
  try { value = parseVersionedJson(message.body, 'trade_state', { maxBytes: 8 * 1024 }); }
  catch { throw new Error('paid-job-message-invalid'); }
  if (value.protocol !== PAID_JOB_PROTOCOL || typeof value.type !== 'string') throw new Error('paid-job-message-invalid');
  const author = message.direction === 'received' ? peer : self;
  if (value.type === 'request') {
    const keys = ['protocol', 'type', 'job_id', 'buyer_pubkey', 'seller_pubkey', 'listing_event_id', 'listing_name', 'amount_raw',
      'scope', 'scope_sha256', 'created_at', 'expires_at'];
    if (!exactKeys(value, keys) || !HEX_32.test(value.job_id || '') || value.buyer_pubkey !== author || !PUBKEY.test(value.buyer_pubkey || '') ||
        value.seller_pubkey !== (author === self ? peer : self) || !PUBKEY.test(value.seller_pubkey || '') ||
        !HEX_64.test(value.listing_event_id || '') || typeof value.listing_name !== 'string' || !value.listing_name.trim() ||
        value.listing_name.length > 140 || rawAmount(value.amount_raw) !== value.amount_raw || typeof value.scope !== 'string' ||
        Buffer.byteLength(value.scope, 'utf8') < 1 || Buffer.byteLength(value.scope, 'utf8') > 4096 || digest(value.scope) !== value.scope_sha256 ||
        !HEX_64.test(value.scope_sha256 || '') || !Number.isSafeInteger(value.created_at) || value.created_at > now + 60 ||
        !Number.isSafeInteger(value.expires_at) || value.expires_at <= value.created_at || value.expires_at - value.created_at > 7 * 24 * 60 * 60) {
      throw new Error('paid-job-request-invalid');
    }
    return value;
  }
  if (value.type === 'accepted' || value.type === 'declined') {
    if (!exactKeys(value, ['protocol', 'type', 'job_id', 'request_message_id', 'actor_pubkey', 'scope_sha256', 'created_at']) ||
        !HEX_32.test(value.job_id || '') || !HEX_32.test(value.request_message_id || '') || value.actor_pubkey !== author ||
        !HEX_64.test(value.scope_sha256 || '') || !Number.isSafeInteger(value.created_at)) throw new Error('paid-job-response-invalid');
    return value;
  }
  if (value.type === 'delivered') {
    if (!exactKeys(value, ['protocol', 'type', 'job_id', 'request_message_id', 'actor_pubkey', 'scope_sha256', 'summary', 'summary_sha256', 'created_at']) ||
        !HEX_32.test(value.job_id || '') || !HEX_32.test(value.request_message_id || '') || value.actor_pubkey !== author ||
        !HEX_64.test(value.scope_sha256 || '') || typeof value.summary !== 'string' || Buffer.byteLength(value.summary, 'utf8') < 1 ||
        Buffer.byteLength(value.summary, 'utf8') > 4096 || digest(value.summary) !== value.summary_sha256 || !HEX_64.test(value.summary_sha256 || '') ||
        !Number.isSafeInteger(value.created_at)) throw new Error('paid-job-delivery-invalid');
    return value;
  }
  throw new Error('paid-job-message-type-unsupported');
}

function parseXnoOffer(message, peer, self) {
  if (!message || message.direction !== 'received' || message.conversation_pubkey !== peer || !HEX_32.test(message.message_id || '') ||
      typeof message.body !== 'string') throw new Error('paid-job-payout-not-authenticated');
  let offer;
  try { offer = parseVersionedJson(message.body, 'trade_state', { maxBytes: 8 * 1024 }); }
  catch { throw new Error('paid-job-payout-invalid'); }
  const keys = ['protocol', 'type', 'trade_id', 'buyer_pubkey', 'seller_pubkey', 'seller_account', 'amount_raw', 'terms', 'terms_sha256', 'created_at', 'expires_at'];
  if (!exactKeys(offer, keys) || offer.protocol !== XNO_TRADE_PROTOCOL || offer.type !== 'offer' || !HEX_32.test(offer.trade_id || '') ||
      offer.buyer_pubkey !== self || offer.seller_pubkey !== peer || !PUBKEY.test(offer.buyer_pubkey || '') || !PUBKEY.test(offer.seller_pubkey || '') ||
      !ACCOUNT.test(offer.seller_account || '') || rawAmount(offer.amount_raw) !== offer.amount_raw || typeof offer.terms !== 'string' ||
      Buffer.byteLength(offer.terms, 'utf8') > 4096 || digest(offer.terms) !== offer.terms_sha256 || !HEX_64.test(offer.terms_sha256 || '') ||
      !Number.isSafeInteger(offer.created_at) || !Number.isSafeInteger(offer.expires_at) || offer.expires_at <= offer.created_at) {
    throw new Error('paid-job-payout-invalid');
  }
  return offer;
}

export function createPaidJobService({ pubkey, transport, xnoTrades, blockedPubkeys = () => [], relays = () => [],
  now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  const logicalTime = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid-logical-clock');
    return value;
  };
  if (!PUBKEY.test(pubkey || '') || !transport || typeof transport.readMessages !== 'function' || typeof transport.sendMessage !== 'function' ||
      typeof blockedPubkeys !== 'function' || typeof relays !== 'function' || typeof now !== 'function') throw new Error('paid-job-dependencies-invalid');
  logicalTime();
  const allowPeer = peer => {
    if (!PUBKEY.test(peer || '') || peer === pubkey) throw new Error('invalid-arguments');
    if (blockedPubkeys().includes(peer)) throw new Error('agent-blocked-locally');
  };
  const selectedRelays = () => {
    const values = relays();
    if (!Array.isArray(values) || !values.length) throw new Error('relay-not-configured');
    return values;
  };
  async function messages(peer) {
    const result = await transport.readMessages(peer, 100);
    if (!Array.isArray(result) || result.length > 100) throw new Error('paid-job-transport-response-invalid');
    return result.filter(message => message?.conversation_pubkey === peer && ['sent', 'received'].includes(message.direction));
  }
  async function send(peer, body, replyTo = null) {
    const result = await transport.sendMessage(peer, canonicalJson(body, 8 * 1024), replyTo, selectedRelays());
    if (!result || !HEX_32.test(result.message_id || '')) throw new Error('paid-job-message-send-failed');
    return { message_id: result.message_id, status: result.status || 'sent', relay_acks: result.relay_acks || 0, relay_attempts: result.relay_attempts || 0 };
  }
  function eventMatches(message, peer, type, job) {
    try {
      const value = parseJobMessage(message, peer, pubkey, logicalTime());
      return value.type === type && value.job_id === job.job_id && value.request_message_id === job.request_message_id &&
        value.scope_sha256 === job.scope_sha256;
    } catch { return false; }
  }
  async function findRequest(peer, requestId, requiredDirection) {
    allowPeer(peer); id(requestId);
    const message = (await messages(peer)).find(item => item.message_id === requestId);
    if (!message || (requiredDirection && message.direction !== requiredDirection)) throw new Error('paid-job-request-not-found');
    const request = parseJobMessage(message, peer, pubkey, logicalTime());
    if (request.type !== 'request') throw new Error('paid-job-request-invalid');
    return { message, request };
  }
  async function acceptedAndDelivered(peer, requestMessage, request) {
    const all = await messages(peer);
    const job = { job_id: request.job_id, request_message_id: requestMessage.message_id, scope_sha256: request.scope_sha256 };
    const sellerDirection = request.seller_pubkey === pubkey ? 'sent' : 'received';
    const responses = all.filter(item => eventMatches(item, peer, 'accepted', job) || eventMatches(item, peer, 'declined', job));
    const accepted = responses.find(item => {
      const value = parseJobMessage(item, peer, pubkey, logicalTime());
      return value.type === 'accepted' && value.actor_pubkey === request.seller_pubkey && item.direction === sellerDirection;
    });
    const declined = responses.some(item => {
      const value = parseJobMessage(item, peer, pubkey, logicalTime());
      return value.type === 'declined' && value.actor_pubkey === request.seller_pubkey && item.direction === sellerDirection;
    });
    const deliveries = all.filter(item => eventMatches(item, peer, 'delivered', job));
    const delivery = deliveries.find(item => {
      const value = parseJobMessage(item, peer, pubkey, logicalTime());
      return value.actor_pubkey === request.seller_pubkey && item.direction === sellerDirection;
    });
    return { all, job, accepted, declined, delivery };
  }
  function payoutTerms(requestMessage, request, delivery, network) {
    const peer = request.seller_pubkey === pubkey ? request.buyer_pubkey : request.seller_pubkey;
    const value = parseJobMessage(delivery, peer, pubkey, logicalTime());
    if (!['live', 'dev'].includes(network)) throw new Error('paid-job-network-invalid');
    return `${PAYOUT_PREFIX} job_id=${request.job_id}; request_message_id=${requestMessage.message_id}; scope_sha256=${request.scope_sha256}; delivery_sha256=${value.summary_sha256}; network=${network}`;
  }
  function payoutTradeId(requestMessage, request) {
    return digest(`${PAID_JOB_PROTOCOL}:${request.buyer_pubkey}:${request.seller_pubkey}:${requestMessage.message_id}`).slice(0, 32);
  }
  function verifyPayoutOffer(offer, requestMessage, request, delivery, network) {
    const expected = payoutTerms(requestMessage, request, delivery, network);
    if (offer.trade_id !== payoutTradeId(requestMessage, request) || offer.amount_raw !== request.amount_raw ||
        offer.terms !== expected || offer.buyer_pubkey !== request.buyer_pubkey ||
        offer.seller_pubkey !== request.seller_pubkey) throw new Error('paid-job-payout-mismatch');
    return offer;
  }

  async function createRequest(params) {
    const keys = ['seller_pubkey', 'listing_event_id', 'listing_name', 'amount_raw', 'scope', 'expires_in_seconds'];
    if (!exactKeys(params, keys) && !exactKeys(params, [...keys, 'job_id'])) throw new Error('invalid-arguments');
    allowPeer(params.seller_pubkey);
    if (!HEX_64.test(params.listing_event_id || '')) throw new Error('paid-job-listing-invalid');
    const listingName = safeText(params.listing_name, 'paid-job-listing-invalid', 140).trim();
    const scope = safeText(params.scope, 'paid-job-scope-invalid', 4096);
    const amount = rawAmount(params.amount_raw);
    const ttl = params.expires_in_seconds;
    if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 604800) throw new Error('paid-job-expiry-invalid');
    const current = logicalTime();
    const jobId = params.job_id ?? randomId();
    id(jobId, 'paid-job-id-invalid');
    const body = { protocol: PAID_JOB_PROTOCOL, type: 'request', job_id: jobId, buyer_pubkey: pubkey, seller_pubkey: params.seller_pubkey,
      listing_event_id: params.listing_event_id, listing_name: listingName, amount_raw: amount, scope,
      scope_sha256: digest(scope), created_at: current, expires_at: current + ttl };
    const existing = (await messages(params.seller_pubkey)).find(item => {
      try { return parseJobMessage(item, params.seller_pubkey, pubkey, current).type === 'request' &&
        parseJobMessage(item, params.seller_pubkey, pubkey, current).job_id === jobId; } catch { return false; }
    });
    if (existing) {
      const prior = parseJobMessage(existing, params.seller_pubkey, pubkey, current);
      const same = existing.direction === 'sent' && prior.buyer_pubkey === body.buyer_pubkey && prior.seller_pubkey === body.seller_pubkey &&
        prior.listing_event_id === body.listing_event_id && prior.listing_name === body.listing_name && prior.amount_raw === body.amount_raw &&
        prior.scope_sha256 === body.scope_sha256 && prior.scope === body.scope && prior.expires_at - prior.created_at === ttl;
      if (!same) throw new Error('paid-job-id-conflict');
      return { message_id: existing.message_id, job_id: jobId, status: 'already-sent', duplicated: true,
        amount_raw: amount, currency: 'XNO', expires_at: prior.expires_at };
    }
    const sent = await send(params.seller_pubkey, body);
    return { ...sent, job_id: jobId, amount_raw: amount, currency: 'XNO', expires_at: body.expires_at, payment: 'not-sent' };
  }

  async function respond(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id', 'decision']) || !['accept', 'decline'].includes(params.decision)) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id, decision } = params;
    const { message, request } = await findRequest(conversation_pubkey, request_message_id, 'received');
    if (request.seller_pubkey !== pubkey || request.expires_at <= logicalTime()) throw new Error('paid-job-request-expired');
    const all = await messages(conversation_pubkey);
    const prior = all.find(item => {
      try {
        const value = parseJobMessage(item, conversation_pubkey, pubkey, logicalTime());
        return item.direction === 'sent' && ['accepted', 'declined'].includes(value.type) && value.job_id === request.job_id &&
          value.request_message_id === message.message_id;
      } catch { return false; }
    });
    if (prior) {
      const value = parseJobMessage(prior, conversation_pubkey, pubkey, logicalTime());
      if (value.type !== (decision === 'accept' ? 'accepted' : 'declined')) throw new Error('paid-job-response-conflict');
      return { message_id: prior.message_id, job_id: request.job_id, state: value.type, duplicated: true };
    }
    const body = { protocol: PAID_JOB_PROTOCOL, type: decision === 'accept' ? 'accepted' : 'declined', job_id: request.job_id,
      request_message_id: message.message_id, actor_pubkey: pubkey, scope_sha256: request.scope_sha256, created_at: logicalTime() };
    const sent = await send(conversation_pubkey, body, message.message_id);
    return { ...sent, job_id: request.job_id, state: body.type, payment: 'not-sent' };
  }

  async function deliver(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id', 'summary'])) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id, summary } = params;
    const { message, request } = await findRequest(conversation_pubkey, request_message_id, 'received');
    if (request.seller_pubkey !== pubkey) throw new Error('paid-job-seller-only');
    const safeSummary = safeText(summary, 'paid-job-delivery-invalid', 4096);
    const all = await messages(conversation_pubkey);
    const accepted = all.some(item => eventMatches(item, conversation_pubkey, 'accepted', { job_id: request.job_id,
      request_message_id: message.message_id, scope_sha256: request.scope_sha256 }) && item.direction === 'sent');
    if (!accepted) throw new Error('paid-job-not-accepted');
    const summaryHash = digest(safeSummary);
    const previous = all.find(item => {
      try {
        const value = parseJobMessage(item, conversation_pubkey, pubkey, logicalTime());
        return item.direction === 'sent' && value.type === 'delivered' && value.job_id === request.job_id && value.request_message_id === message.message_id;
      } catch { return false; }
    });
    if (previous) {
      const value = parseJobMessage(previous, conversation_pubkey, pubkey, logicalTime());
      if (value.summary_sha256 !== summaryHash) throw new Error('paid-job-delivery-conflict');
      return { message_id: previous.message_id, job_id: request.job_id, delivery_sha256: summaryHash, duplicated: true };
    }
    const body = { protocol: PAID_JOB_PROTOCOL, type: 'delivered', job_id: request.job_id, request_message_id: message.message_id,
      actor_pubkey: pubkey, scope_sha256: request.scope_sha256, summary: safeSummary, summary_sha256: summaryHash, created_at: logicalTime() };
    const sent = await send(conversation_pubkey, body, message.message_id);
    return { ...sent, job_id: request.job_id, delivery_sha256: summaryHash, payment: 'not-sent' };
  }

  async function requestPayout(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id'])) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id } = params;
    if (!xnoTrades) throw new Error('xno-wallet-not-configured');
    const { message, request } = await findRequest(conversation_pubkey, request_message_id, 'received');
    if (request.seller_pubkey !== pubkey) throw new Error('paid-job-seller-only');
    const state = await acceptedAndDelivered(conversation_pubkey, message, request);
    if (!state.accepted || state.declined || !state.delivery || state.delivery.direction !== 'sent') throw new Error('paid-job-delivery-required');
    const walletPolicy = await xnoTrades.policy();
    const terms = payoutTerms(message, request, state.delivery, walletPolicy.network);
    const prior = state.all.find(item => {
      if (item.direction !== 'sent') return false;
      try {
        const value = parseVersionedJson(item.body, 'trade_state', { maxBytes: 8 * 1024 });
        return value.protocol === XNO_TRADE_PROTOCOL && value.type === 'offer' && value.trade_id === payoutTradeId(message, request) &&
          value.seller_pubkey === pubkey &&
          value.buyer_pubkey === conversation_pubkey && value.amount_raw === request.amount_raw && value.terms === terms;
      } catch { return false; }
    });
    if (prior) {
      const value = parseVersionedJson(prior.body, 'trade_state', { maxBytes: 8 * 1024 });
      return { offer_message_id: prior.message_id, trade_id: value.trade_id, amount_raw: request.amount_raw, currency: 'XNO',
        status: 'already-sent', duplicated: true, custody: false };
    }
    const result = await xnoTrades.createOffer({ recipient_pubkey: conversation_pubkey, amount_raw: request.amount_raw, terms,
      trade_id: payoutTradeId(message, request),
      expires_in_seconds: 7 * 24 * 60 * 60 });
    return { ...result, job_id: request.job_id, amount_raw: request.amount_raw, currency: 'XNO', custody: false,
      settlement: 'direct-irreversible-payment', delivery_guarantee: false };
  }

  async function payPayout(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id', 'offer_message_id'])) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id, offer_message_id } = params;
    if (!xnoTrades) throw new Error('xno-wallet-not-configured');
    const { message: requestMessage, request } = await findRequest(conversation_pubkey, request_message_id, 'sent');
    if (request.buyer_pubkey !== pubkey) throw new Error('paid-job-buyer-only');
    const state = await acceptedAndDelivered(conversation_pubkey, requestMessage, request);
    if (!state.accepted || state.declined || !state.delivery) throw new Error('paid-job-delivery-required');
    id(offer_message_id, 'paid-job-payout-id-invalid');
    const offerMessage = state.all.find(item => item.message_id === offer_message_id && item.direction === 'received');
    const offer = parseXnoOffer(offerMessage, conversation_pubkey, pubkey);
    const walletPolicy = await xnoTrades.policy();
    verifyPayoutOffer(offer, requestMessage, request, state.delivery, walletPolicy.network);
    const result = await xnoTrades.payOffer({ conversation_pubkey, offer_message_id });
    return { ...result, job_id: request.job_id, currency: 'XNO', settlement: 'direct-irreversible-payment', delivery: 'seller-signed-claim' };
  }

  async function verifyPayout(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id', 'receipt_message_id'])) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id, receipt_message_id } = params;
    if (!xnoTrades) throw new Error('xno-wallet-not-configured');
    const { message: requestMessage, request } = await findRequest(conversation_pubkey, request_message_id, 'received');
    if (request.seller_pubkey !== pubkey) throw new Error('paid-job-seller-only');
    const state = await acceptedAndDelivered(conversation_pubkey, requestMessage, request);
    if (!state.accepted || state.declined || !state.delivery || state.delivery.direction !== 'sent') throw new Error('paid-job-delivery-required');
    const receiptId = id(receipt_message_id, 'paid-job-receipt-id-invalid');
    const receiptMessage = state.all.find(item => item.message_id === receiptId && item.direction === 'received');
    let receipt;
    try { receipt = parseVersionedJson(receiptMessage?.body, 'trade_state', { maxBytes: 8 * 1024 }); }
    catch { throw new Error('paid-job-receipt-invalid'); }
    const walletPolicy = await xnoTrades.policy();
    const terms = payoutTerms(requestMessage, request, state.delivery, walletPolicy.network);
    const sentOffer = state.all.find(item => {
      if (item.direction !== 'sent') return false;
      try {
        const value = parseVersionedJson(item.body, 'trade_state', { maxBytes: 8 * 1024 });
        return value.protocol === XNO_TRADE_PROTOCOL && value.type === 'offer' && value.trade_id === payoutTradeId(requestMessage, request) &&
          value.trade_id === receipt.trade_id &&
          value.amount_raw === request.amount_raw && value.terms === terms && value.buyer_pubkey === conversation_pubkey;
      } catch { return false; }
    });
    if (!sentOffer) throw new Error('paid-job-payout-mismatch');
    const result = await xnoTrades.verifyReceipt({ conversation_pubkey, receipt_message_id: receiptId });
    const received = result.received === true || result.status === 'received';
    return { ...result, job_id: request.job_id, currency: 'XNO', custody: false,
      payout: received ? 'received' : result.confirmed ? 'confirmed-pending-receive' : result.status };
  }

  async function status(params) {
    if (!exactKeys(params, ['conversation_pubkey', 'request_message_id'])) throw new Error('invalid-arguments');
    const { conversation_pubkey, request_message_id } = params;
    const { message, request } = await findRequest(conversation_pubkey, request_message_id);
    const state = await messages(conversation_pubkey);
    const response = state.map(item => {
      try { return { item, value: parseJobMessage(item, conversation_pubkey, pubkey, logicalTime()) }; } catch { return null; }
    }).filter(item => item && ['accepted', 'declined', 'delivered'].includes(item.value.type) && item.value.job_id === request.job_id &&
      item.value.request_message_id === message.message_id && item.value.scope_sha256 === request.scope_sha256);
    const acceptance = response.find(item => item.value.type === 'accepted' && item.value.actor_pubkey === request.seller_pubkey);
    const decline = response.find(item => item.value.type === 'declined' && item.value.actor_pubkey === request.seller_pubkey);
    const delivery = response.find(item => item.value.type === 'delivered' && item.value.actor_pubkey === request.seller_pubkey);
    const payoutTermsPrefix = delivery ? `${PAYOUT_PREFIX} job_id=${request.job_id}; request_message_id=${message.message_id}; scope_sha256=${request.scope_sha256}; delivery_sha256=${delivery.value.summary_sha256}; network=` : null;
    const payoutMessage = payoutTermsPrefix ? state.find(item => {
      if (item.direction !== (pubkey === request.seller_pubkey ? 'sent' : 'received')) return false;
      try {
        const value = parseVersionedJson(item.body, 'trade_state', { maxBytes: 8 * 1024 });
        return value.protocol === XNO_TRADE_PROTOCOL && value.type === 'offer' && value.trade_id === payoutTradeId(message, request) &&
          value.terms.startsWith(payoutTermsPrefix) &&
          /^(?:live|dev)$/.test(value.terms.slice(payoutTermsPrefix.length)) &&
          value.amount_raw === request.amount_raw && value.seller_pubkey === request.seller_pubkey && value.buyer_pubkey === request.buyer_pubkey;
      } catch { return false; }
    }) : null;
    let payout = 'not-requested', tradeId = null;
    if (payoutMessage) {
      const offer = parseVersionedJson(payoutMessage.body, 'trade_state', { maxBytes: 8 * 1024 });
      tradeId = offer.trade_id;
      payout = 'invoice-published-unverified';
    }
    return { protocol: PAID_JOB_PROTOCOL, job_id: request.job_id, request_message_id: message.message_id,
      role: request.buyer_pubkey === pubkey ? 'buyer' : 'seller', listing_event_id: request.listing_event_id, listing_name: request.listing_name,
      amount_raw: request.amount_raw, currency: 'XNO', scope_sha256: request.scope_sha256,
      state: decline ? 'declined' : delivery ? 'delivered' : acceptance ? 'accepted' : request.expires_at <= logicalTime() ? 'expired' : 'requested',
      payout, payout_trade_id: tradeId, payment_proof: 'must be checked by local wallet/node; relay notices are not proof',
      direct_payment_only: true, reversible: false, delivery_claim: delivery ? 'seller-signed-unverified' : null,
      relayed_events_seen: response.length, bounded_history: 100 };
  }

  return Object.freeze({
    request: createRequest,
    respond,
    deliver,
    requestPayout,
    payPayout,
    verifyPayout,
    status,
  });
}
