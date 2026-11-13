import { createHash, randomBytes } from 'node:crypto';
import { parseStrictJson } from './ipc.mjs';
import { exactObject, PUBKEY, validateToolText } from './core.mjs';
import { recalculateXnoJournalBudget, validateXnoJournal } from './xno-trades.mjs';

export const XNO_ESCROW_PROTOCOL = 'property-xno-escrow/v1';
const TRADE_ID = /^[0-9a-f]{32}$/;
const MESSAGE_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const TXID = /^[0-9a-f]{64}$/i;
const ACCOUNT = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const MAX_RAW = (1n << 128n) - 1n;
const MAX_TTL = 7 * 24 * 60 * 60;
const REQUEST_KEYS = ['protocol', 'type', 'trade_id', 'buyer_pubkey', 'buyer_account', 'seller_pubkey', 'seller_account', 'arbiter_pubkey', 'custodian_pubkey', 'amount_raw', 'terms', 'terms_sha256', 'created_at', 'expires_at'];
const CONTRACT_KEYS = ['protocol', 'type', 'trade_id', 'buyer_pubkey', 'buyer_account', 'seller_pubkey', 'seller_account', 'arbiter_pubkey', 'custodian_pubkey', 'escrow_account', 'amount_raw', 'terms', 'terms_sha256', 'expires_at', 'contract_sha256', 'status', 'deposit_txid', 'resolution', 'payout_txid'];

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function escrowDigest(pubkey, tradeId, resolution) {
  return `property-xno-escrow:${createHash('sha256').update(`${pubkey}:${tradeId}:${resolution}`).digest('hex')}`;
}
function parseAmount(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,38}$/.test(value)) throw new Error('xno-escrow-amount-invalid');
  const amount = BigInt(value);
  if (amount > MAX_RAW) throw new Error('xno-escrow-amount-invalid');
  return amount;
}
function fingerprint(value) {
  const fields = ['trade_id', 'buyer_pubkey', 'buyer_account', 'seller_pubkey', 'seller_account', 'arbiter_pubkey', 'custodian_pubkey', 'escrow_account', 'amount_raw', 'terms_sha256', 'expires_at'];
  return digest(fields.map(key => `${key}:${value[key]}`).join('\n'));
}
function messageFrom(messages, id, peer) {
  const message = messages.find(item => item.message_id === id);
  if (!message || message.direction !== 'received' || message.conversation_pubkey !== peer || !MESSAGE_ID.test(message.message_id || '') || typeof message.body !== 'string') {
    throw new Error('xno-escrow-message-not-authenticated');
  }
  return message;
}
function parseJson(body, maxBytes = 12 * 1024) {
  try { return parseStrictJson(body, maxBytes); } catch { throw new Error('xno-escrow-message-invalid'); }
}
function recordFrom(value, role, status) {
  return {
    trade_id: value.trade_id, role, custodian_pubkey: value.custodian_pubkey, arbiter_pubkey: value.arbiter_pubkey, buyer_pubkey: value.buyer_pubkey,
    buyer_account: value.buyer_account, seller_pubkey: value.seller_pubkey, seller_account: value.seller_account,
    escrow_account: value.escrow_account || '', amount_raw: value.amount_raw, terms: value.terms, terms_sha256: value.terms_sha256,
    expires_at: value.expires_at, contract_sha256: value.contract_sha256 || '', request_message_id: value.request_message_id || '',
    contract_message_id: value.contract_message_id || '', seller_contract_message_id: value.seller_contract_message_id || '', arbiter_contract_message_id: value.arbiter_contract_message_id || '',
    seller_acceptance_message_id: '', deposit_txid: value.deposit_txid || '', receive_txid: value.receive_txid || '',
    buyer_approval_message_id: '', dispute_message_id: '', dispute_pubkey: '', status, resolution: '', payout_txid: '',
  };
}
function recordMatchesContract(record, contract) {
  return record.trade_id === contract.trade_id && record.custodian_pubkey === contract.custodian_pubkey && record.arbiter_pubkey === contract.arbiter_pubkey &&
    record.buyer_pubkey === contract.buyer_pubkey && record.buyer_account === contract.buyer_account &&
    record.seller_pubkey === contract.seller_pubkey && record.seller_account === contract.seller_account &&
    record.amount_raw === contract.amount_raw && record.terms_sha256 === contract.terms_sha256 && record.expires_at === contract.expires_at &&
    (!record.escrow_account || record.escrow_account === contract.escrow_account) &&
    (!record.contract_sha256 || record.contract_sha256 === contract.contract_sha256);
}

function validateRequest(value, sender, recipient) {
  if (!exactObject(value, REQUEST_KEYS) || value.protocol !== XNO_ESCROW_PROTOCOL || value.type !== 'request' || !TRADE_ID.test(value.trade_id || '') ||
      !PUBKEY.test(value.buyer_pubkey || '') || value.buyer_pubkey !== sender || value.custodian_pubkey !== recipient ||
      !PUBKEY.test(value.seller_pubkey || '') || value.seller_pubkey === sender || !ACCOUNT.test(value.buyer_account || '') ||
      !ACCOUNT.test(value.seller_account || '') || !PUBKEY.test(value.arbiter_pubkey || '') || !PUBKEY.test(value.custodian_pubkey || '') ||
      new Set([sender, value.seller_pubkey, value.arbiter_pubkey, value.custodian_pubkey]).size !== 4 || typeof value.terms !== 'string' ||
      Buffer.byteLength(value.terms, 'utf8') < 1 || Buffer.byteLength(value.terms, 'utf8') > 4096 ||
      !HASH.test(value.terms_sha256 || '') || digest(value.terms) !== value.terms_sha256 || !Number.isSafeInteger(value.created_at) || value.created_at < 0 ||
      !Number.isSafeInteger(value.expires_at) || value.expires_at <= value.created_at || value.expires_at - value.created_at > MAX_TTL) throw new Error('xno-escrow-request-invalid');
  parseAmount(value.amount_raw);
  return value;
}

function contractPayload(record, status) {
  return {
    protocol: XNO_ESCROW_PROTOCOL, type: 'contract', trade_id: record.trade_id,
    buyer_pubkey: record.buyer_pubkey, buyer_account: record.buyer_account,
    seller_pubkey: record.seller_pubkey, seller_account: record.seller_account, arbiter_pubkey: record.arbiter_pubkey,
    custodian_pubkey: record.custodian_pubkey, escrow_account: record.escrow_account,
    amount_raw: record.amount_raw, terms: record.terms, terms_sha256: record.terms_sha256,
    expires_at: record.expires_at, contract_sha256: record.contract_sha256,
    status, deposit_txid: record.deposit_txid, resolution: record.resolution, payout_txid: record.payout_txid,
  };
}

function validateContract(value, sender, recipient) {
  if (!exactObject(value, CONTRACT_KEYS) || value.protocol !== XNO_ESCROW_PROTOCOL || value.type !== 'contract' || !TRADE_ID.test(value.trade_id || '') ||
      !PUBKEY.test(value.custodian_pubkey || '') || value.custodian_pubkey !== sender ||
      !PUBKEY.test(value.buyer_pubkey || '') || !PUBKEY.test(value.seller_pubkey || '') || !PUBKEY.test(value.arbiter_pubkey || '') ||
      ![value.buyer_pubkey, value.seller_pubkey, value.arbiter_pubkey].includes(recipient) ||
      new Set([value.buyer_pubkey, value.seller_pubkey, value.arbiter_pubkey, value.custodian_pubkey]).size !== 4 ||
      !ACCOUNT.test(value.buyer_account || '') || !ACCOUNT.test(value.seller_account || '') || !ACCOUNT.test(value.escrow_account || '') ||
      typeof value.terms !== 'string' || Buffer.byteLength(value.terms, 'utf8') < 1 || Buffer.byteLength(value.terms, 'utf8') > 4096 || !HASH.test(value.terms_sha256 || '') ||
      digest(value.terms) !== value.terms_sha256 || !HASH.test(value.contract_sha256 || '') || !Number.isSafeInteger(value.expires_at) ||
      !['awaiting_seller', 'awaiting_deposit', 'funded', 'disputed', 'settling', 'settled', 'declined'].includes(value.status) ||
      !(value.deposit_txid === '' || TXID.test(value.deposit_txid)) || !['', 'release', 'refund'].includes(value.resolution) ||
      !(value.payout_txid === '' || TXID.test(value.payout_txid))) throw new Error('xno-escrow-contract-invalid');
  parseAmount(value.amount_raw);
  if (fingerprint(value) !== value.contract_sha256) throw new Error('xno-escrow-contract-invalid');
  return value;
}

export function createXnoEscrowService({ pubkey, wallet = null, escrowWallet = null, transport, relays = () => [], blockedPubkeys = () => [],
  loadJournal, saveJournal, serializeTask, now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  if (!PUBKEY.test(pubkey) || !transport || typeof loadJournal !== 'function' || typeof saveJournal !== 'function') throw new Error('xno-escrow-service-invalid');
  let queue = Promise.resolve();
  const serialize = serializeTask || (task => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  });
  const getRelays = () => {
    const value = relays();
    if (!Array.isArray(value) || !value.length) throw new Error('relay-not-configured');
    return value;
  };
  const ensurePeer = peer => {
    if (!PUBKEY.test(peer || '') || peer === pubkey || blockedPubkeys().includes(peer)) throw new Error('xno-escrow-peer-invalid');
  };
  const state = async () => validateXnoJournal(await loadJournal());
  const save = async value => saveJournal(validateXnoJournal(value));
  const send = async (peer, payload, replyTo = null) => {
    ensurePeer(peer);
    const result = await transport.sendMessage(peer, JSON.stringify(payload), replyTo, getRelays());
    if (!MESSAGE_ID.test(result?.message_id || '')) throw new Error('xno-escrow-send-failed');
    return result;
  };
  const read = async peer => {
    ensurePeer(peer);
    const messages = await transport.readMessages(peer, 100);
    if (!Array.isArray(messages) || messages.length > 100) throw new Error('xno-escrow-transport-invalid');
    return messages;
  };
  const sendContract = (record, status) => contractPayload(record, status);
  const statusMessageFields = ['contract_message_id', 'seller_contract_message_id', 'arbiter_contract_message_id'];
  const clearStatusMessageIds = record => { for (const field of statusMessageFields) record[field] = ''; };
  const setStatus = async (record, status, journal) => {
    const payload = sendContract(record, status);
    const targets = [[record.buyer_pubkey, statusMessageFields[0]], [record.seller_pubkey, statusMessageFields[1]], [record.arbiter_pubkey, statusMessageFields[2]]];
    const pending = targets.map(([peer, field]) => record[field] ? Promise.resolve({ message_id: record[field] }) : send(peer, payload));
    const results = await Promise.allSettled(pending);
    for (let index = 0; index < targets.length; index++) {
      if (results[index].status === 'fulfilled') record[targets[index][1]] = results[index].value.message_id;
    }
    journal.escrows[record.trade_id] = record;
    await save(journal);
    if (results.some(result => result.status === 'rejected')) throw new Error('xno-escrow-status-delivery-incomplete');
    return targets.map(([, field]) => record[field]);
  };
  const requireWallet = () => { if (!wallet) throw new Error('xno-wallet-not-configured'); };
  const requireEscrowWallet = () => { if (!escrowWallet) throw new Error('xno-escrow-custodian-wallet-not-configured'); };
  const activeLiabilities = (journal, except = '') => Object.values(journal.escrows).reduce((sum, item) =>
    sum + (item.role === 'custodian' && item.trade_id !== except && ['awaiting_seller', 'awaiting_deposit', 'deposit_prepared', 'deposit_submitted', 'funded', 'disputed', 'settling'].includes(item.status) ? BigInt(item.amount_raw) : 0n), 0n);
  const findBody = (messages, expected, tradeId, contractHash, peer) => messages.find(item => {
    if (item?.direction !== 'received' || item.conversation_pubkey !== peer || typeof item.body !== 'string') return false;
    let body;
    try { body = parseJson(item.body); } catch { return false; }
    return body.protocol === XNO_ESCROW_PROTOCOL && body.type === expected && body.trade_id === tradeId && body.contract_sha256 === contractHash;
  });

  async function offer(params) {
    requireWallet();
    if (!exactObject(params, ['escrow_pubkey', 'arbiter_pubkey', 'seller_pubkey', 'seller_account', 'amount_raw', 'terms', 'expires_in_seconds'])) throw new Error('invalid-arguments');
    ensurePeer(params.escrow_pubkey);
    ensurePeer(params.arbiter_pubkey);
    ensurePeer(params.seller_pubkey);
    if (new Set([pubkey, params.seller_pubkey, params.escrow_pubkey, params.arbiter_pubkey]).size !== 4 || !ACCOUNT.test(params.seller_account || '')) throw new Error('xno-escrow-party-invalid');
    const amount = parseAmount(params.amount_raw);
    const terms = validateToolText(params.terms);
    if (Buffer.byteLength(terms, 'utf8') > 4096) throw new Error('xno-terms-too-large');
    if (!Number.isSafeInteger(params.expires_in_seconds) || params.expires_in_seconds < 60 || params.expires_in_seconds > MAX_TTL) throw new Error('xno-escrow-expiry-invalid');
    if (amount > wallet.maxRawPerPayment) throw new Error('xno-payment-limit-exceeded');
    const created = now();
    const tradeId = randomId();
    if (!Number.isSafeInteger(created) || created < 0 || !TRADE_ID.test(tradeId)) throw new Error('xno-escrow-clock-or-id-invalid');
    await wallet.assertReady();
    const request = { protocol: XNO_ESCROW_PROTOCOL, type: 'request', trade_id: tradeId, buyer_pubkey: pubkey, buyer_account: wallet.account,
      seller_pubkey: params.seller_pubkey, seller_account: params.seller_account, arbiter_pubkey: params.arbiter_pubkey, custodian_pubkey: params.escrow_pubkey,
      amount_raw: amount.toString(), terms, terms_sha256: digest(terms), created_at: created, expires_at: created + params.expires_in_seconds };
    const journal = await state();
    if (journal.escrows[tradeId]) throw new Error('xno-escrow-trade-id-reused');
    const record = recordFrom({ ...request, request_message_id: '' }, 'buyer', 'requested');
    journal.escrows[tradeId] = record;
    await save(journal);
    const result = await send(params.escrow_pubkey, request);
    record.request_message_id = result.message_id;
    await save(journal);
    return { status: 'requested', trade_id: tradeId, request_message_id: result.message_id, custodian_pubkey: params.escrow_pubkey, amount_raw: amount.toString(), terms_sha256: request.terms_sha256 };
  }

  async function open(params) {
    requireEscrowWallet();
    if (!exactObject(params, ['buyer_pubkey', 'request_message_id']) || !MESSAGE_ID.test(params.request_message_id || '')) throw new Error('invalid-arguments');
    ensurePeer(params.buyer_pubkey);
    const messages = await read(params.buyer_pubkey);
    const message = messageFrom(messages, params.request_message_id, params.buyer_pubkey);
    const request = validateRequest(parseJson(message.body), params.buyer_pubkey, pubkey);
    if (request.custodian_pubkey !== pubkey) throw new Error('xno-escrow-wrong-custodian');
    ensurePeer(request.seller_pubkey);
    ensurePeer(request.arbiter_pubkey);
    const current = now();
    if (!Number.isSafeInteger(current) || current > request.expires_at) throw new Error('xno-escrow-expired');
    const amount = parseAmount(request.amount_raw);
    if (amount > escrowWallet.maxRawPerPayment) throw new Error('xno-escrow-per-trade-cap-exceeded');
    await escrowWallet.assertReady();
    const journal = await state();
    const existing = journal.escrows[request.trade_id];
    if (existing) {
      if (existing.role !== 'custodian' || existing.buyer_pubkey !== request.buyer_pubkey || existing.buyer_account !== request.buyer_account ||
          existing.seller_pubkey !== request.seller_pubkey || existing.seller_account !== request.seller_account || existing.arbiter_pubkey !== request.arbiter_pubkey || existing.amount_raw !== request.amount_raw ||
          existing.terms_sha256 !== request.terms_sha256 || existing.expires_at !== request.expires_at) throw new Error('xno-escrow-trade-id-reused');
      const results = await Promise.allSettled([
        existing.contract_message_id ? Promise.resolve({ message_id: existing.contract_message_id }) : send(request.buyer_pubkey, sendContract(existing, existing.status), params.request_message_id),
        existing.seller_contract_message_id ? Promise.resolve({ message_id: existing.seller_contract_message_id }) : send(request.seller_pubkey, sendContract(existing, existing.status), params.request_message_id),
        existing.arbiter_contract_message_id ? Promise.resolve({ message_id: existing.arbiter_contract_message_id }) : send(request.arbiter_pubkey, sendContract(existing, existing.status), params.request_message_id),
      ]);
      for (let index = 0; index < results.length; index++) {
        if (results[index].status === 'fulfilled') {
          if (index === 0) existing.contract_message_id = results[index].value.message_id;
          else if (index === 1) existing.seller_contract_message_id = results[index].value.message_id;
          else existing.arbiter_contract_message_id = results[index].value.message_id;
        }
      }
      await save(journal);
      return { trade_id: existing.trade_id, status: existing.status, escrow_account: existing.escrow_account, amount_raw: existing.amount_raw };
    }
    if (activeLiabilities(journal) + amount > escrowWallet.lifetimeBudgetRaw) throw new Error('xno-escrow-liability-cap-exceeded');
    const record = recordFrom({ ...request, escrow_account: escrowWallet.account, contract_message_id: '', seller_contract_message_id: '' }, 'custodian', 'awaiting_seller');
    record.contract_sha256 = fingerprint({ ...record, escrow_account: escrowWallet.account });
    record.request_message_id = params.request_message_id;
    journal.escrows[record.trade_id] = record;
    await save(journal);
    const results = await Promise.allSettled([
      send(record.buyer_pubkey, sendContract(record, record.status), params.request_message_id),
      send(record.seller_pubkey, sendContract(record, record.status), params.request_message_id),
      send(record.arbiter_pubkey, sendContract(record, record.status), params.request_message_id),
    ]);
    if (results[0].status === 'fulfilled') record.contract_message_id = results[0].value.message_id;
    if (results[1].status === 'fulfilled') record.seller_contract_message_id = results[1].value.message_id;
    if (results[2].status === 'fulfilled') record.arbiter_contract_message_id = results[2].value.message_id;
    await save(journal);
    if (results.some(result => result.status === 'rejected')) throw new Error('xno-escrow-contract-delivery-incomplete');
    return { trade_id: record.trade_id, status: record.status, escrow_account: record.escrow_account, amount_raw: record.amount_raw,
      buyer_contract_message_id: record.contract_message_id, seller_contract_message_id: record.seller_contract_message_id,
      arbiter_contract_message_id: record.arbiter_contract_message_id };
  }

  async function accept(params) {
    requireWallet();
    if (!exactObject(params, ['escrow_pubkey', 'contract_message_id', 'decision']) || !MESSAGE_ID.test(params.contract_message_id || '') || !['accept', 'decline'].includes(params.decision)) throw new Error('invalid-arguments');
    ensurePeer(params.escrow_pubkey);
    const messages = await read(params.escrow_pubkey);
    const message = messageFrom(messages, params.contract_message_id, params.escrow_pubkey);
    const contract = validateContract(parseJson(message.body), params.escrow_pubkey, pubkey);
    if (contract.seller_pubkey !== pubkey || contract.status !== 'awaiting_seller' || now() > contract.expires_at) throw new Error('xno-escrow-contract-not-acceptable');
    if (params.decision === 'accept') {
      if (wallet.account !== contract.seller_account) throw new Error('xno-escrow-seller-account-mismatch');
      await wallet.assertReady();
    }
    const journal = await state();
    const existing = journal.escrows[contract.trade_id];
    if (existing && (existing.role !== 'seller' || existing.contract_sha256 && existing.contract_sha256 !== contract.contract_sha256)) throw new Error('xno-escrow-record-conflict');
    if (existing?.role === 'seller' && ['awaiting_deposit', 'declined'].includes(existing.status)) {
      const sameDecision = (existing.status === 'awaiting_deposit' && params.decision === 'accept') || (existing.status === 'declined' && params.decision === 'decline');
      if (!sameDecision) throw new Error('xno-escrow-response-immutable');
      return { trade_id: contract.trade_id, status: existing.status, message_id: existing.seller_acceptance_message_id, duplicate: true };
    }
    const record = existing || recordFrom({ ...contract, contract_message_id: message.message_id }, 'seller', params.decision === 'accept' ? 'awaiting_deposit' : 'declined');
    if (record.role !== 'seller' && record.role !== 'custodian') throw new Error('xno-escrow-role-mismatch');
    const response = { protocol: XNO_ESCROW_PROTOCOL, type: 'seller_response', trade_id: contract.trade_id,
      contract_sha256: contract.contract_sha256, seller_pubkey: pubkey, accepted: params.decision === 'accept' };
    const result = await send(params.escrow_pubkey, response, message.message_id);
    if (record.role === 'seller') {
      record.contract_message_id = message.message_id;
      record.seller_acceptance_message_id = result.message_id;
      record.status = params.decision === 'accept' ? 'awaiting_deposit' : 'declined';
      journal.escrows[contract.trade_id] = record;
      await save(journal);
    }
    return { trade_id: contract.trade_id, status: params.decision === 'accept' ? 'awaiting_deposit' : 'declined', message_id: result.message_id };
  }

  async function fund(params) {
    requireWallet();
    if (!exactObject(params, ['escrow_pubkey', 'contract_message_id']) || !MESSAGE_ID.test(params.contract_message_id || '')) throw new Error('invalid-arguments');
    ensurePeer(params.escrow_pubkey);
    const messages = await read(params.escrow_pubkey);
    const message = messageFrom(messages, params.contract_message_id, params.escrow_pubkey);
    const contract = validateContract(parseJson(message.body), params.escrow_pubkey, pubkey);
    if (contract.buyer_pubkey !== pubkey || contract.status !== 'awaiting_deposit' || now() > contract.expires_at || wallet.account !== contract.buyer_account) throw new Error('xno-escrow-not-ready-for-deposit');
    const amount = parseAmount(contract.amount_raw);
    if (amount > wallet.maxRawPerPayment) throw new Error('xno-payment-limit-exceeded');
    await wallet.assertReady();
    const journal = await state();
    let record = journal.escrows[contract.trade_id];
    if (!record || record.role !== 'buyer' || record.status !== 'requested' && !['deposit_prepared', 'deposit_submitted'].includes(record.status) || !recordMatchesContract(record, contract)) throw new Error('xno-escrow-record-conflict');
    record.escrow_account = contract.escrow_account;
    record.contract_sha256 = contract.contract_sha256;
    record.contract_message_id = message.message_id;
    if (record.status === 'requested' || record.status === 'awaiting_seller') record.status = 'deposit_prepared';
    journal.escrows[contract.trade_id] = record;
    const committed = recalculateXnoJournalBudget(journal);
    if (committed > wallet.lifetimeBudgetRaw) throw new Error('xno-lifetime-budget-exceeded');
    journal.budget_committed_raw = committed.toString();
    await save(journal);
    if (!record.deposit_txid) {
      const sent = await wallet.send({ destination: contract.escrow_account, amountRaw: contract.amount_raw,
        idempotencyKey: escrowDigest(pubkey, contract.trade_id, 'deposit') });
      if (!TXID.test(sent?.txid || '')) throw new Error('xno-escrow-deposit-result-invalid');
      record.deposit_txid = sent.txid.toUpperCase();
      record.status = 'deposit_submitted';
      journal.escrows[contract.trade_id] = record;
      await save(journal);
    }
    const notice = { protocol: XNO_ESCROW_PROTOCOL, type: 'deposit_notice', trade_id: contract.trade_id,
      contract_sha256: contract.contract_sha256, buyer_pubkey: pubkey, buyer_account: wallet.account,
      amount_raw: contract.amount_raw, txid: record.deposit_txid };
    const result = await send(params.escrow_pubkey, notice, message.message_id);
    return { trade_id: contract.trade_id, status: record.status, txid: record.deposit_txid, amount_raw: contract.amount_raw,
      escrow_account: contract.escrow_account, deposit_notice_message_id: result.message_id };
  }

  async function approve(params) {
    if (!exactObject(params, ['escrow_pubkey', 'trade_id']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    ensurePeer(params.escrow_pubkey);
    const journal = await state();
    const record = journal.escrows[params.trade_id];
    if (!record || record.role !== 'buyer' || record.custodian_pubkey !== params.escrow_pubkey || record.buyer_pubkey !== pubkey) throw new Error('xno-escrow-trade-not-found');
    const messages = await read(params.escrow_pubkey);
    const latest = messages.filter(item => item.direction === 'received' && item.conversation_pubkey === params.escrow_pubkey).map(item => {
      try { return { item, body: parseJson(item.body) }; } catch { return null; }
    }).filter(item => item?.body.protocol === XNO_ESCROW_PROTOCOL && item.body.trade_id === record.trade_id && item.body.contract_sha256 === record.contract_sha256 && item.body.type === 'contract');
    const current = latest.at(-1)?.body;
    if (!current || current.status !== 'funded') throw new Error('xno-escrow-not-funded');
    if (!record.deposit_txid || current.deposit_txid !== record.deposit_txid || !record.escrow_account || typeof wallet.inspectSendForReceipt !== 'function') {
      throw new Error('xno-escrow-deposit-not-verifiable');
    }
    const observed = await wallet.inspectSendForReceipt({ txid: record.deposit_txid, destination: record.escrow_account,
      amountRaw: record.amount_raw, source: record.buyer_account });
    if (!observed.confirmed || observed.txid !== record.deposit_txid) throw new Error('xno-escrow-deposit-not-confirmed');
    const response = { protocol: XNO_ESCROW_PROTOCOL, type: 'buyer_approval', trade_id: record.trade_id,
      contract_sha256: record.contract_sha256, buyer_pubkey: pubkey, approved: true };
    const result = await send(params.escrow_pubkey, response, latest.at(-1).item.message_id);
    record.buyer_approval_message_id = result.message_id;
    await save(journal);
    return { trade_id: record.trade_id, status: 'release-approved', message_id: result.message_id };
  }

  async function dispute(params) {
    if (!exactObject(params, ['escrow_pubkey', 'trade_id', 'summary']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    ensurePeer(params.escrow_pubkey);
    const summary = validateToolText(params.summary);
    if (Buffer.byteLength(summary, 'utf8') > 2048) throw new Error('xno-escrow-dispute-too-large');
    const journal = await state();
    const record = journal.escrows[params.trade_id];
    if (!record || !['buyer', 'seller'].includes(record.role) || record.custodian_pubkey !== params.escrow_pubkey || ![record.buyer_pubkey, record.seller_pubkey].includes(pubkey)) throw new Error('xno-escrow-trade-not-found');
    const messages = await read(params.escrow_pubkey);
    const latest = messages.filter(item => item.direction === 'received' && item.conversation_pubkey === params.escrow_pubkey).map(item => {
      try { return { item, body: parseJson(item.body) }; } catch { return null; }
    }).filter(item => item?.body.protocol === XNO_ESCROW_PROTOCOL && item.body.trade_id === record.trade_id && item.body.contract_sha256 === record.contract_sha256 && item.body.type === 'contract');
    const current = latest.at(-1)?.body;
    if (!current || !['funded', 'disputed'].includes(current.status)) throw new Error('xno-escrow-not-funded');
    const payload = { protocol: XNO_ESCROW_PROTOCOL, type: 'dispute', trade_id: record.trade_id,
      contract_sha256: record.contract_sha256, author_pubkey: pubkey, summary, summary_sha256: digest(summary) };
    const result = await send(params.escrow_pubkey, payload, latest.at(-1).item.message_id);
    record.dispute_message_id = result.message_id;
    await save(journal);
    return { trade_id: record.trade_id, status: 'dispute-filed', message_id: result.message_id };
  }

  async function completeSettlement(record, journal) {
    requireEscrowWallet();
    if (record.role !== 'custodian' || record.status !== 'settling' || !['release', 'refund'].includes(record.resolution)) throw new Error('xno-escrow-settlement-not-ready');
    const destination = record.resolution === 'release' ? record.seller_account : record.buyer_account;
    const sent = await escrowWallet.send({ destination, amountRaw: record.amount_raw, idempotencyKey: escrowDigest(pubkey, record.trade_id, record.resolution) });
    if (!TXID.test(sent?.txid || '')) throw new Error('xno-escrow-settlement-result-invalid');
    record.payout_txid = sent.txid.toUpperCase();
    record.status = 'settled';
    clearStatusMessageIds(record);
    journal.escrows[record.trade_id] = record;
    await save(journal);
    await setStatus(record, 'settled', journal);
    return { trade_id: record.trade_id, status: 'settled', resolution: record.resolution, txid: record.payout_txid, destination, amount_raw: record.amount_raw };
  }

  async function sync(params) {
    requireEscrowWallet();
    if (!exactObject(params, ['trade_id']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    const journal = await state();
    const record = journal.escrows[params.trade_id];
    if (!record || record.role !== 'custodian') throw new Error('xno-escrow-trade-not-found');
    if (record.status !== 'settling' && statusMessageFields.some(field => !record[field])) await setStatus(record, record.status, journal);
    if (record.status === 'settling') return completeSettlement(record, journal);
    if (record.status === 'settled' || record.status === 'declined') return { trade_id: record.trade_id, status: record.status, resolution: record.resolution, txid: record.payout_txid };

    if (record.status === 'awaiting_seller') {
      const sellerMessages = await read(record.seller_pubkey);
      const responseMessage = findBody(sellerMessages, 'seller_response', record.trade_id, record.contract_sha256, record.seller_pubkey);
      if (responseMessage) {
        const response = parseJson(responseMessage.body);
        if (!exactObject(response, ['protocol', 'type', 'trade_id', 'contract_sha256', 'seller_pubkey', 'accepted']) || response.protocol !== XNO_ESCROW_PROTOCOL ||
            response.seller_pubkey !== record.seller_pubkey || typeof response.accepted !== 'boolean') throw new Error('xno-escrow-seller-response-invalid');
        if (!response.accepted) {
          record.status = 'declined';
          clearStatusMessageIds(record);
          await save(journal);
          await setStatus(record, 'declined', journal);
          return { trade_id: record.trade_id, status: record.status };
        }
        record.seller_acceptance_message_id = responseMessage.message_id;
        record.status = 'awaiting_deposit';
        clearStatusMessageIds(record);
        await save(journal);
        await setStatus(record, 'awaiting_deposit', journal);
      }
    }

    if (record.status === 'awaiting_deposit' || record.status === 'deposit_submitted') {
      const buyerMessages = await read(record.buyer_pubkey);
      const depositMessage = findBody(buyerMessages, 'deposit_notice', record.trade_id, record.contract_sha256, record.buyer_pubkey);
      if (depositMessage) {
        const notice = parseJson(depositMessage.body);
        if (!exactObject(notice, ['protocol', 'type', 'trade_id', 'contract_sha256', 'buyer_pubkey', 'buyer_account', 'amount_raw', 'txid']) ||
            notice.protocol !== XNO_ESCROW_PROTOCOL || notice.buyer_pubkey !== record.buyer_pubkey || notice.buyer_account !== record.buyer_account ||
            notice.amount_raw !== record.amount_raw || !TXID.test(notice.txid || '')) throw new Error('xno-escrow-deposit-notice-invalid');
        const observed = await escrowWallet.inspectSendForReceipt({ txid: notice.txid, destination: record.escrow_account,
          amountRaw: record.amount_raw, source: record.buyer_account });
        if (!observed.confirmed) return { trade_id: record.trade_id, status: 'deposit-pending', txid: observed.txid };
        const received = await escrowWallet.receiveConfirmed({ txid: observed.txid, sourceAccount: record.buyer_account, amountRaw: record.amount_raw });
        if (!received.received) return { trade_id: record.trade_id, status: 'deposit-receive-pending', txid: observed.txid };
        record.deposit_txid = observed.txid.toUpperCase();
        record.receive_txid = received.receive_txid || '';
        record.status = 'funded';
        clearStatusMessageIds(record);
        journal.escrows[record.trade_id] = record;
        if (activeLiabilities(journal, record.trade_id) + BigInt(record.amount_raw) > escrowWallet.lifetimeBudgetRaw) throw new Error('xno-escrow-liability-cap-exceeded');
        const walletPolicy = await escrowWallet.policy();
        const liability = activeLiabilities(journal);
        if (BigInt(walletPolicy.confirmed_balance_raw) < liability) throw new Error('xno-escrow-under-collateralized');
        await save(journal);
        await setStatus(record, 'funded', journal);
      }
    }

    if (record.status === 'funded' || record.status === 'disputed') {
      for (const peer of [record.buyer_pubkey, record.seller_pubkey]) {
        const messages = await read(peer);
        const disputeMessage = findBody(messages, 'dispute', record.trade_id, record.contract_sha256, peer);
        if (disputeMessage) {
          const disputeBody = parseJson(disputeMessage.body);
          if (!exactObject(disputeBody, ['protocol', 'type', 'trade_id', 'contract_sha256', 'author_pubkey', 'summary', 'summary_sha256']) ||
              disputeBody.protocol !== XNO_ESCROW_PROTOCOL || disputeBody.author_pubkey !== peer || !HASH.test(disputeBody.summary_sha256 || '') ||
              typeof disputeBody.summary !== 'string' || digest(disputeBody.summary) !== disputeBody.summary_sha256) throw new Error('xno-escrow-dispute-invalid');
          record.dispute_message_id = disputeMessage.message_id;
          record.dispute_pubkey = peer;
          record.status = 'disputed';
          clearStatusMessageIds(record);
          journal.escrows[record.trade_id] = record;
          await save(journal);
          await setStatus(record, 'disputed', journal);
          break;
        }
      }
    }

    if (record.status === 'disputed') {
      const arbiterMessages = await read(record.arbiter_pubkey);
      const rulingMessage = findBody(arbiterMessages, 'ruling', record.trade_id, record.contract_sha256, record.arbiter_pubkey);
      if (rulingMessage) {
        const ruling = parseJson(rulingMessage.body);
        if (!exactObject(ruling, ['protocol', 'type', 'trade_id', 'contract_sha256', 'custodian_pubkey', 'arbiter_pubkey', 'outcome', 'summary', 'summary_sha256']) ||
            ruling.protocol !== XNO_ESCROW_PROTOCOL || ruling.custodian_pubkey !== pubkey || ruling.arbiter_pubkey !== record.arbiter_pubkey ||
            !['release', 'refund'].includes(ruling.outcome) || typeof ruling.summary !== 'string' || !HASH.test(ruling.summary_sha256 || '') ||
            digest(ruling.summary) !== ruling.summary_sha256) throw new Error('xno-escrow-ruling-invalid');
        record.resolution = ruling.outcome;
        record.status = 'settling';
        await save(journal);
        return completeSettlement(record, journal);
      }
    }

    if (record.status === 'funded') {
      const buyerMessages = await read(record.buyer_pubkey);
      const approvalMessage = findBody(buyerMessages, 'buyer_approval', record.trade_id, record.contract_sha256, record.buyer_pubkey);
      if (approvalMessage) {
        const approval = parseJson(approvalMessage.body);
        if (!exactObject(approval, ['protocol', 'type', 'trade_id', 'contract_sha256', 'buyer_pubkey', 'approved']) || approval.protocol !== XNO_ESCROW_PROTOCOL ||
            approval.buyer_pubkey !== record.buyer_pubkey || approval.approved !== true) throw new Error('xno-escrow-approval-invalid');
        record.buyer_approval_message_id = approvalMessage.message_id;
        record.status = 'settling';
        record.resolution = 'release';
        await save(journal);
        return completeSettlement(record, journal);
      }
    }
    return { trade_id: record.trade_id, status: record.status, escrow_account: record.escrow_account, amount_raw: record.amount_raw,
      deposit_txid: record.deposit_txid, dispute_by: record.dispute_pubkey };
  }

  async function resolve(params) {
    if (!exactObject(params, ['custodian_pubkey', 'trade_id', 'outcome', 'summary']) || !TRADE_ID.test(params.trade_id || '') || !['release', 'refund'].includes(params.outcome)) throw new Error('invalid-arguments');
    ensurePeer(params.custodian_pubkey);
    const summary = validateToolText(params.summary);
    if (Buffer.byteLength(summary, 'utf8') > 2048) throw new Error('xno-escrow-ruling-too-large');
    const messages = await read(params.custodian_pubkey);
    const contracts = messages.filter(item => item.direction === 'received' && item.conversation_pubkey === params.custodian_pubkey).map(item => {
      try { return { item, contract: validateContract(parseJson(item.body), params.custodian_pubkey, pubkey) }; } catch { return null; }
    }).filter(item => item?.contract.trade_id === params.trade_id);
    const current = contracts.at(-1)?.contract;
    if (!current || current.arbiter_pubkey !== pubkey || current.status !== 'disputed') throw new Error('xno-escrow-dispute-required');
    const existing = findBody(messages, 'ruling', params.trade_id, current.contract_sha256, params.custodian_pubkey);
    if (existing) {
      const body = parseJson(existing.body);
      if (body.outcome !== params.outcome || body.summary_sha256 !== digest(summary)) throw new Error('xno-escrow-resolution-immutable');
      return { trade_id: params.trade_id, status: 'ruling-already-submitted', outcome: body.outcome, message_id: existing.message_id };
    }
    const ruling = { protocol: XNO_ESCROW_PROTOCOL, type: 'ruling', trade_id: params.trade_id,
      contract_sha256: current.contract_sha256, custodian_pubkey: params.custodian_pubkey, arbiter_pubkey: pubkey,
      outcome: params.outcome, summary, summary_sha256: digest(summary) };
    const result = await send(params.custodian_pubkey, ruling, contracts.at(-1).item.message_id);
    return { trade_id: params.trade_id, status: 'ruling-submitted', outcome: params.outcome, message_id: result.message_id };
  }

  async function status(params) {
    if (!exactObject(params, ['trade_id']) || !TRADE_ID.test(params.trade_id || '')) throw new Error('invalid-arguments');
    const journal = await state();
    const record = journal.escrows[params.trade_id];
    if (!record || ![record.buyer_pubkey, record.seller_pubkey, record.custodian_pubkey, record.arbiter_pubkey].includes(pubkey)) throw new Error('xno-escrow-trade-not-found');
    if (record.role !== 'custodian') {
      const messages = await read(record.custodian_pubkey);
      const updates = messages.filter(item => item.direction === 'received' && item.conversation_pubkey === record.custodian_pubkey).map(item => {
        try { return { item, contract: validateContract(parseJson(item.body), record.custodian_pubkey, pubkey) }; } catch { return null; }
      }).filter(item => item?.contract.trade_id === record.trade_id && (!record.contract_sha256 || item.contract.contract_sha256 === record.contract_sha256));
      const latest = updates.at(-1)?.contract;
      if (latest) {
        if (!recordMatchesContract(record, latest)) throw new Error('xno-escrow-contract-conflict');
        record.contract_sha256 = latest.contract_sha256;
        record.status = latest.status;
        record.deposit_txid = latest.deposit_txid;
        record.resolution = latest.resolution;
        record.payout_txid = latest.payout_txid;
        record.escrow_account = latest.escrow_account;
        await save(journal);
      }
    }
    return { trade_id: record.trade_id, role: record.role, status: record.status, amount_raw: record.amount_raw,
      buyer_pubkey: record.buyer_pubkey, seller_pubkey: record.seller_pubkey, custodian_pubkey: record.custodian_pubkey,
      escrow_account: record.escrow_account, deposit_txid: record.deposit_txid, resolution: record.resolution, payout_txid: record.payout_txid,
      terms_sha256: record.terms_sha256 };
  }

  return Object.freeze({
    async policy() { return { configured: Boolean(wallet), custodian_configured: Boolean(escrowWallet), escrow_protocol: XNO_ESCROW_PROTOCOL,
      custody_model: escrowWallet ? 'single-operator-custody' : 'external-custodian', ...(escrowWallet ? await escrowWallet.policy() : {}) }; },
    offer: params => serialize(() => offer(params)),
    open: params => serialize(() => open(params)),
    accept: params => serialize(() => accept(params)),
    fund: params => serialize(() => fund(params)),
    approve: params => serialize(() => approve(params)),
    dispute: params => serialize(() => dispute(params)),
    sync: params => serialize(() => sync(params)),
    resolve: params => serialize(() => resolve(params)),
    status: params => serialize(() => status(params)),
  });
}
