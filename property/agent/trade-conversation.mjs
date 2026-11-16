import { createHash, randomBytes } from 'node:crypto';
import { exactObject, PUBKEY, validateToolText } from './core.mjs';
import { canonicalJson, parseBoundedJson, parseVersionedJson } from './protocol-contract.mjs';
import { TRADE_STATE_PROTOCOL } from './trade-state.mjs';

const TRADE_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const TXID = /^[0-9a-f]{64}$/i;
const CURRENCIES = Object.freeze({ BTC: 'regtest', XMR: 'fakechain', XNO: 'dev' });

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function exactKeys(value, keys) { return exactObject(value, keys); }

function readWireMessage(message, peer, self, now) {
  if (!message || message.direction !== 'received' || message.conversation_pubkey !== peer ||
      !/^[0-9a-f]{32}$/.test(message.message_id || '') || typeof message.body !== 'string') throw new Error('trade-message-not-authenticated');
  let value;
  try { value = parseVersionedJson(message.body, 'trade_state', { maxBytes: 8 * 1024 }); }
  catch { throw new Error('trade-message-invalid'); }
  if (value.protocol !== TRADE_STATE_PROTOCOL || typeof value.type !== 'string' || !TRADE_ID.test(value.trade_id || '')) throw new Error('trade-message-invalid');
  if (value.type === 'offer') {
    const keys = ['protocol', 'type', 'trade_id', 'currency', 'network', 'amount_atomic', 'seller_pubkey', 'buyer_pubkey',
      'destination', 'terms', 'terms_sha256', 'created_at', 'expires_at'];
    if (!exactKeys(value, keys) || !Object.hasOwn(CURRENCIES, value.currency) || value.network !== CURRENCIES[value.currency] ||
        value.seller_pubkey !== peer || value.buyer_pubkey !== self || !PUBKEY.test(value.seller_pubkey || '') ||
        !PUBKEY.test(value.buyer_pubkey || '') || value.seller_pubkey === value.buyer_pubkey ||
        typeof value.amount_atomic !== 'string' || !/^[1-9]\d{0,38}$/.test(value.amount_atomic) ||
        typeof value.destination !== 'string' || value.destination.length < 8 || value.destination.length > 256 ||
        typeof value.terms !== 'string' || Buffer.byteLength(value.terms, 'utf8') < 1 || Buffer.byteLength(value.terms, 'utf8') > 4096 ||
        !HASH.test(value.terms_sha256 || '') || digest(value.terms) !== value.terms_sha256 ||
        !Number.isSafeInteger(value.created_at) || value.created_at > now + 60 || !Number.isSafeInteger(value.expires_at) ||
        value.expires_at <= value.created_at || value.expires_at - value.created_at > 7 * 24 * 60 * 60) throw new Error('trade-offer-invalid');
    return value;
  }
  if (value.type === 'accepted') {
    if (!exactKeys(value, ['protocol', 'type', 'trade_id', 'actor_pubkey', 'created_at']) || value.actor_pubkey !== peer || !Number.isSafeInteger(value.created_at)) throw new Error('trade-acceptance-invalid');
    return value;
  }
  if (value.type === 'payment-request') {
    if (!exactKeys(value, ['protocol', 'type', 'trade_id', 'actor_pubkey', 'network', 'amount_atomic', 'destination', 'created_at']) ||
        value.actor_pubkey !== peer || !Object.values(CURRENCIES).includes(value.network) || !/^[1-9]\d{0,38}$/.test(value.amount_atomic || '') ||
        typeof value.destination !== 'string' || !Number.isSafeInteger(value.created_at)) throw new Error('trade-payment-request-invalid');
    return value;
  }
  if (value.type === 'settlement-notice') {
    if (!exactKeys(value, ['protocol', 'type', 'trade_id', 'actor_pubkey', 'network', 'amount_atomic', 'txid', 'confirmations', 'state', 'created_at']) ||
        value.actor_pubkey !== peer || !Object.values(CURRENCIES).includes(value.network) || !/^[1-9]\d{0,38}$/.test(value.amount_atomic || '') ||
        !TXID.test(value.txid || '') || !Number.isSafeInteger(value.confirmations) || value.confirmations < 0 ||
        !['payment-observed', 'settled'].includes(value.state) || !Number.isSafeInteger(value.created_at)) throw new Error('trade-settlement-notice-invalid');
    return value;
  }
  if (value.type === 'dispute') {
    if (!exactKeys(value, ['protocol', 'type', 'trade_id', 'actor_pubkey', 'summary', 'summary_sha256', 'created_at']) ||
        value.actor_pubkey !== peer || typeof value.summary !== 'string' || Buffer.byteLength(value.summary, 'utf8') < 1 ||
        Buffer.byteLength(value.summary, 'utf8') > 2048 || digest(value.summary) !== value.summary_sha256 || !HASH.test(value.summary_sha256 || '') ||
        !Number.isSafeInteger(value.created_at)) throw new Error('trade-dispute-invalid');
    return value;
  }
  if (value.type === 'cancelled') {
    if (!exactKeys(value, ['protocol', 'type', 'trade_id', 'actor_pubkey', 'created_at']) || value.actor_pubkey !== peer || !Number.isSafeInteger(value.created_at)) throw new Error('trade-cancellation-invalid');
    return value;
  }
  throw new Error('trade-message-type-unsupported');
}

export function createTradeConversationService({ pubkey, machine, transport, blockedPubkeys = () => [], relays = () => [],
  now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  if (!PUBKEY.test(pubkey || '') || !machine || !transport || typeof transport.readMessages !== 'function' ||
      typeof transport.sendMessage !== 'function' || typeof blockedPubkeys !== 'function' || typeof relays !== 'function') throw new Error('trade-conversation-dependencies-invalid');
  const allowedPeer = peer => {
    if (!PUBKEY.test(peer || '') || peer === pubkey) throw new Error('invalid-arguments');
    if (blockedPubkeys().includes(peer)) throw new Error('agent-blocked-locally');
  };
  const selectedRelays = () => {
    const list = relays();
    if (!Array.isArray(list) || !list.length) throw new Error('relay-not-configured');
    return list;
  };
  const send = async (peer, body, replyTo = null) => {
    const result = await transport.sendMessage(peer, canonicalJson(body, 8 * 1024), replyTo, selectedRelays());
    if (!result || !/^[0-9a-f]{32}$/.test(result.message_id || '')) throw new Error('trade-message-send-failed');
    return { message_id: result.message_id, status: result.status || 'sent', relay_acks: result.relay_acks || 0, relay_attempts: result.relay_attempts || 0 };
  };
  const getMessages = async peer => {
    const messages = await transport.readMessages(peer, 100);
    if (!Array.isArray(messages) || messages.length > 100) throw new Error('trade-transport-response-invalid');
    return messages.filter(message => message?.direction === 'received' && message.conversation_pubkey === peer)
      .sort((a, b) => a.created_at - b.created_at || a.message_id.localeCompare(b.message_id));
  };

  async function offer(params) {
    if (!exactKeys(params, ['recipient_pubkey', 'currency', 'amount_atomic', 'terms', 'expires_in_seconds']) &&
        !exactKeys(params, ['recipient_pubkey', 'currency', 'amount_atomic', 'terms', 'expires_in_seconds', 'trade_id'])) throw new Error('invalid-arguments');
    allowedPeer(params.recipient_pubkey);
    if (!Object.hasOwn(CURRENCIES, params.currency) || !Number.isSafeInteger(params.expires_in_seconds) || params.expires_in_seconds < 60 || params.expires_in_seconds > 604800) throw new Error('trade-offer-invalid');
    const terms = validateToolText(params.terms);
    if (!terms || Buffer.byteLength(terms, 'utf8') > 4096) throw new Error('trade-terms-invalid');
    const tradeId = params.trade_id ?? randomId();
    if (!TRADE_ID.test(tradeId || '')) throw new Error('trade-id-invalid');
    const createdAt = now();
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('invalid-logical-clock');
    const trade = await machine.createOffer({ trade_id: tradeId, currency: params.currency, amount_atomic: params.amount_atomic,
      seller_pubkey: pubkey, buyer_pubkey: params.recipient_pubkey, terms, expires_at: createdAt + params.expires_in_seconds });
    const message = { protocol: TRADE_STATE_PROTOCOL, type: 'offer', trade_id: trade.trade_id, currency: trade.currency, network: trade.network,
      amount_atomic: trade.amount_atomic, seller_pubkey: trade.seller_pubkey, buyer_pubkey: trade.buyer_pubkey, destination: trade.destination,
      terms, terms_sha256: trade.terms_sha256, created_at: trade.created_at, expires_at: trade.expires_at };
    const sent = await send(params.recipient_pubkey, message);
    return { ...sent, trade_id: trade.trade_id, state: trade.state, currency: trade.currency, network: trade.network,
      amount_atomic: trade.amount_atomic, expires_at: trade.expires_at, settlement: 'direct-payment-only', delivery_guarantee: false,
      wallet_identity_binding: 'unverified-claim' };
  }

  async function accept({ conversation_pubkey, offer_message_id }) {
    allowedPeer(conversation_pubkey);
    if (!/^[0-9a-f]{32}$/.test(offer_message_id || '')) throw new Error('invalid-arguments');
    const message = (await transport.readMessages(conversation_pubkey, 100)).find(item => item?.message_id === offer_message_id);
    const offerData = readWireMessage(message, conversation_pubkey, pubkey, now());
    if (offerData.type !== 'offer') throw new Error('trade-offer-invalid');
    await machine.receiveOffer({ trade_id: offerData.trade_id, currency: offerData.currency, network: offerData.network,
      amount_atomic: offerData.amount_atomic, seller_pubkey: offerData.seller_pubkey, buyer_pubkey: offerData.buyer_pubkey,
      destination: offerData.destination, terms_sha256: offerData.terms_sha256, created_at: offerData.created_at, expires_at: offerData.expires_at,
      actor_pubkey: conversation_pubkey, authorization: { message_id: offer_message_id, transport_authenticated: true } });
    const accepted = await machine.accept({ trade_id: offerData.trade_id, actor_pubkey: pubkey, authorization: { local: true } });
    const sent = await send(conversation_pubkey, { protocol: TRADE_STATE_PROTOCOL, type: 'accepted', trade_id: offerData.trade_id,
      actor_pubkey: pubkey, created_at: now() }, offer_message_id);
    return { ...sent, trade_id: offerData.trade_id, state: accepted.state, payment_required: true,
      payment_notice: 'The buyer must pay through a wallet and verify the destination, amount and network.' };
  }

  async function sync({ conversation_pubkey, trade_id }) {
    allowedPeer(conversation_pubkey);
    if (!TRADE_ID.test(trade_id || '')) throw new Error('invalid-arguments');
    const current = await machine.status({ trade_id });
    if (![current.seller_pubkey, current.buyer_pubkey].includes(conversation_pubkey)) throw new Error('trade-peer-mismatch');
    const processed = [], peerClaims = [];
    for (const message of await getMessages(conversation_pubkey)) {
      let body;
      try { body = parseBoundedJson(message.body, 8 * 1024); } catch { continue; }
      if (body?.protocol !== TRADE_STATE_PROTOCOL) continue;
      let wire;
      try { wire = readWireMessage(message, conversation_pubkey, pubkey, now()); }
      catch (error) {
        if (error.message === 'trade-message-type-unsupported') continue;
        throw error;
      }
      if (wire.trade_id !== trade_id) continue;
      const authorization = { message_id: message.message_id, transport_authenticated: true };
      if (wire.type === 'accepted' && current.seller_pubkey === pubkey) {
        const local = await machine.status({ trade_id });
        if (local.state === 'offer') {
          const state = await machine.accept({ trade_id, actor_pubkey: conversation_pubkey, authorization });
          processed.push({ message_id: message.message_id, state: state.state, duplicated: Boolean(state.duplicated) });
        }
      } else if (wire.type === 'payment-request' && current.buyer_pubkey === pubkey) {
        const local = await machine.status({ trade_id });
        if (local.state === 'accepted') {
          const state = await machine.receivePaymentRequest({ trade_id, actor_pubkey: conversation_pubkey, network: wire.network,
            amount_atomic: wire.amount_atomic, destination: wire.destination, authorization });
          processed.push({ message_id: message.message_id, state: state.state, duplicated: Boolean(state.duplicated) });
        }
      } else if (wire.type === 'dispute') {
        const state = await machine.dispute({ trade_id, actor_pubkey: conversation_pubkey, authorization, summary: wire.summary });
        processed.push({ message_id: message.message_id, state: state.state, duplicated: Boolean(state.duplicated) });
      } else if (wire.type === 'cancelled') {
        const state = await machine.cancel({ trade_id, actor_pubkey: conversation_pubkey, authorization });
        processed.push({ message_id: message.message_id, state: state.state, duplicated: Boolean(state.duplicated) });
      } else if (wire.type === 'settlement-notice') {
        const state = await machine.status({ trade_id });
        if (wire.network !== state.network || wire.amount_atomic !== state.amount_atomic) throw new Error('trade-settlement-notice-mismatch');
        peerClaims.push({ reported_state: wire.state, network: wire.network, amount_atomic: wire.amount_atomic,
          txid: wire.txid.toLowerCase(), confirmations: wire.confirmations, trust: 'seller-reported-unverified' });
      }
    }
    return { trade_id, local_state: (await machine.status({ trade_id })).state, processed, peer_claims: peerClaims };
  }

  async function requestPayment({ trade_id }) {
    if (!TRADE_ID.test(trade_id || '')) throw new Error('invalid-arguments');
    let trade = await machine.status({ trade_id });
    if (trade.seller_pubkey !== pubkey) throw new Error('trade-seller-only');
    await sync({ conversation_pubkey: trade.buyer_pubkey, trade_id });
    trade = await machine.requestPayment({ trade_id, actor_pubkey: pubkey, authorization: { local: true } });
    const sent = await send(trade.buyer_pubkey, { protocol: TRADE_STATE_PROTOCOL, type: 'payment-request', trade_id,
      actor_pubkey: pubkey, network: trade.network, amount_atomic: trade.amount_atomic, destination: trade.destination, created_at: now() });
    return { ...sent, trade_id, state: trade.state, network: trade.network, amount_atomic: trade.amount_atomic,
      destination: trade.destination, custody: false, delivery_guarantee: false };
  }

  async function reconcile({ trade_id }) {
    if (!TRADE_ID.test(trade_id || '')) throw new Error('invalid-arguments');
    const result = await machine.reconcile({ trade_id });
    if (result.seller_pubkey !== pubkey || !['payment-observed', 'settled'].includes(result.state) || result.rpc_uncertain) return result;
    const sent = await send(result.buyer_pubkey, { protocol: TRADE_STATE_PROTOCOL, type: 'settlement-notice', trade_id,
      actor_pubkey: pubkey, network: result.network, amount_atomic: result.payment.amount_atomic, txid: result.payment.txid,
      confirmations: result.payment.confirmations, state: result.state, created_at: now() });
    return { ...result, notice: sent, notice_trust: 'seller-reported-unverified-by-recipient' };
  }

  async function dispute({ conversation_pubkey, trade_id, summary }) {
    allowedPeer(conversation_pubkey);
    if (!TRADE_ID.test(trade_id || '')) throw new Error('invalid-arguments');
    const safeSummary = validateToolText(summary);
    if (!safeSummary || Buffer.byteLength(safeSummary, 'utf8') > 2048) throw new Error('trade-dispute-invalid');
    const trade = await machine.status({ trade_id });
    if (![trade.seller_pubkey, trade.buyer_pubkey].includes(conversation_pubkey)) throw new Error('trade-peer-mismatch');
    const local = await machine.dispute({ trade_id, actor_pubkey: pubkey, authorization: { local: true }, summary: safeSummary });
    const sent = await send(conversation_pubkey, { protocol: TRADE_STATE_PROTOCOL, type: 'dispute', trade_id,
      actor_pubkey: pubkey, summary: safeSummary, summary_sha256: digest(safeSummary), created_at: now() });
    return { ...sent, trade_id, state: local.state, funds_action: 'none', arbitration: 'not-provided' };
  }

  async function cancel({ trade_id }) {
    if (!TRADE_ID.test(trade_id || '')) throw new Error('invalid-arguments');
    const trade = await machine.status({ trade_id });
    if (![trade.seller_pubkey, trade.buyer_pubkey].includes(pubkey)) throw new Error('trade-not-participant');
    const local = await machine.cancel({ trade_id, actor_pubkey: pubkey, authorization: { local: true } });
    const peer = pubkey === local.seller_pubkey ? local.buyer_pubkey : local.seller_pubkey;
    const sent = await send(peer, { protocol: TRADE_STATE_PROTOCOL, type: 'cancelled', trade_id, actor_pubkey: pubkey, created_at: now() });
    return { ...sent, trade_id, state: local.state, funds_action: 'none' };
  }

  return Object.freeze({
    policy: () => machine.policy(), offer, accept, sync, requestPayment, reconcile, dispute, cancel,
    status: async ({ trade_id }) => machine.status({ trade_id }),
  });
}
