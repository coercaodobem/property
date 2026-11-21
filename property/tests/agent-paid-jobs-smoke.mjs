import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPaidJobService } from '../agent/paid-jobs.mjs';
import { createXnoTradeService, emptyXnoJournal } from '../agent/xno-trades.mjs';

const now = 2_000_000_000;
const buyerPubkey = 'a'.repeat(64);
const sellerPubkey = 'b'.repeat(64);
const listingEventId = 'c'.repeat(64);
const jobId = '1'.repeat(32);
const buyerAccount = `nano_1${'1'.repeat(59)}`;
const sellerAccount = `nano_3${'3'.repeat(59)}`;
const relay = 'ws://127.0.0.1:7447';
const txid = 'd'.repeat(64).toUpperCase();
const scope = 'Create one synthetic report and deliver the Markdown file.';
const delivery = 'Delivered report.md with the agreed findings.';
const inbox = { buyer: [], seller: [] };
const journals = { buyer: emptyXnoJournal(), seller: emptyXnoJournal() };
const blocked = { buyer: new Set(), seller: new Set() };
const network = { buyer: 'dev', seller: 'dev' };
const sendCalls = [];
const uniqueTransfers = new Map();
let receives = 0;
let sequence = 0;

function pubkey(role) { return role === 'buyer' ? buyerPubkey : sellerPubkey; }
function other(role) { return role === 'buyer' ? 'seller' : 'buyer'; }
function account(role) { return role === 'buyer' ? buyerAccount : sellerAccount; }
function messageId() { return (++sequence).toString(16).padStart(32, '0'); }

function transport(role) {
  return {
    async readMessages(peer, limit) {
      assert.equal(peer, pubkey(other(role)));
      assert.equal(limit, 100);
      return inbox[role].filter(item => item.conversation_pubkey === peer).slice(-limit).map(item => structuredClone(item));
    },
    async sendMessage(peer, body, inReplyTo, relays) {
      assert.equal(peer, pubkey(other(role)));
      assert.deepEqual(relays, [relay]);
      const id = messageId();
      inbox[role].push({ message_id: id, in_reply_to: inReplyTo, conversation_pubkey: peer, direction: 'sent', body, created_at: now });
      inbox[other(role)].push({ message_id: id, in_reply_to: inReplyTo, conversation_pubkey: pubkey(role), direction: 'received', body, created_at: now });
      return { message_id: id, status: 'fixture-accepted', relay_acks: 1, relay_attempts: 1 };
    },
  };
}

function wallet(role) {
  return {
    account: account(role),
    maxRawPerPayment: 100n,
    lifetimeBudgetRaw: 500n,
    async assertReady() { return { ready: true, account: account(role), network: network[role] }; },
    async policy() {
      return { configured: true, network: network[role], account: account(role), max_raw_per_payment: '100',
        lifetime_budget_raw: '500', confirmed_balance_raw: '1000' };
    },
    async send({ destination, amountRaw, idempotencyKey }) {
      sendCalls.push({ role, destination, amountRaw, idempotencyKey });
      assert.equal(role, 'buyer');
      assert.equal(destination, sellerAccount);
      assert.equal(amountRaw, '40');
      if (!uniqueTransfers.has(idempotencyKey)) uniqueTransfers.set(idempotencyKey, txid);
      return { txid: uniqueTransfers.get(idempotencyKey) };
    },
    async inspectSend(input) {
      assert.deepEqual(input, { txid, destination: sellerAccount, amountRaw: '40', source: buyerAccount });
      return { txid, source: buyerAccount, destination: sellerAccount, amount_raw: '40', confirmed: true, status: 'confirmed' };
    },
    async inspectSendForReceipt(input) {
      assert.deepEqual(input, { txid, destination: sellerAccount, amountRaw: '40', source: buyerAccount });
      return { txid, source: buyerAccount, destination: sellerAccount, amount_raw: '40', confirmed: true, status: 'confirmed' };
    },
    async receiveConfirmed(input) {
      assert.deepEqual(input, { txid, sourceAccount: buyerAccount, amountRaw: '40' });
      receives++;
      return { received: true, receive_txid: 'e'.repeat(64).toUpperCase() };
    },
  };
}

function xnoTrades(role) {
  const self = pubkey(role), peer = pubkey(other(role));
  return createXnoTradeService({ pubkey: self, wallet: wallet(role), transport: transport(role),
    blockedPubkeys: () => [...blocked[role]], relays: () => [relay], loadJournal: async () => structuredClone(journals[role]),
    saveJournal: async value => { journals[role] = structuredClone(value); }, now: () => now });
}

function paidJobs(role, trades) {
  return createPaidJobService({ pubkey: pubkey(role), transport: transport(role), xnoTrades: trades,
    blockedPubkeys: () => [...blocked[role]], relays: () => [relay], now: () => now,
    randomId: () => jobId });
}

const buyerTrades = xnoTrades('buyer');
const sellerTrades = xnoTrades('seller');
const buyer = paidJobs('buyer', buyerTrades);
const seller = paidJobs('seller', sellerTrades);
const request = await buyer.request({ seller_pubkey: sellerPubkey, listing_event_id: listingEventId, listing_name: 'Synthetic report',
  amount_raw: '40', scope, expires_in_seconds: 3600, job_id: jobId });
assert.equal(request.payment, 'not-sent');
assert.equal(request.currency, 'XNO');
const requestId = request.message_id;
const requestBeforeReplay = inbox.buyer.length;
for (let iteration = 0; iteration < 20; iteration++) {
  const repeated = await buyer.request({ seller_pubkey: sellerPubkey, listing_event_id: listingEventId, listing_name: 'Synthetic report',
    amount_raw: '40', scope, expires_in_seconds: 3600, job_id: jobId });
  assert.equal(repeated.duplicated, true);
  assert.equal(repeated.message_id, requestId);
}
assert.equal(inbox.buyer.length, requestBeforeReplay, '20 repeated requests do not publish a second request');
await assert.rejects(buyer.request({ seller_pubkey: sellerPubkey, listing_event_id: listingEventId, listing_name: 'Synthetic report',
  amount_raw: '41', scope, expires_in_seconds: 3600, job_id: jobId }), /paid-job-id-conflict/);

await assert.rejects(seller.deliver({ conversation_pubkey: buyerPubkey, request_message_id: requestId, summary: delivery }), /paid-job-not-accepted/);
blocked.seller.add(buyerPubkey);
await assert.rejects(seller.respond({ conversation_pubkey: buyerPubkey, request_message_id: requestId, decision: 'accept' }), /agent-blocked-locally/);
blocked.seller.clear();
const accepted = await seller.respond({ conversation_pubkey: buyerPubkey, request_message_id: requestId, decision: 'accept' });
assert.equal(accepted.state, 'accepted');
assert.equal((await seller.respond({ conversation_pubkey: buyerPubkey, request_message_id: requestId, decision: 'accept' })).duplicated, true);
await assert.rejects(seller.respond({ conversation_pubkey: buyerPubkey, request_message_id: requestId, decision: 'decline' }), /paid-job-response-conflict/);
await assert.rejects(buyer.payPayout({ conversation_pubkey: sellerPubkey, request_message_id: requestId, offer_message_id: 'f'.repeat(32) }), /paid-job-delivery-required/);

const delivered = await seller.deliver({ conversation_pubkey: buyerPubkey, request_message_id: requestId, summary: delivery });
assert.equal(delivered.payment, 'not-sent');
assert.equal(delivered.delivery_sha256, createHash('sha256').update(delivery, 'utf8').digest('hex'));
assert.equal((await seller.deliver({ conversation_pubkey: buyerPubkey, request_message_id: requestId, summary: delivery })).duplicated, true);
await assert.rejects(seller.deliver({ conversation_pubkey: buyerPubkey, request_message_id: requestId, summary: 'Different delivery claim' }), /paid-job-delivery-conflict/);
assert.equal((await buyer.status({ conversation_pubkey: sellerPubkey, request_message_id: requestId })).state, 'delivered');

const offer = await seller.requestPayout({ conversation_pubkey: buyerPubkey, request_message_id: requestId });
assert.equal(offer.currency, 'XNO');
assert.equal(offer.custody, false);
assert.equal(offer.settlement, 'direct-irreversible-payment');
const payoutOfferId = offer.offer_message_id;
for (let iteration = 0; iteration < 20; iteration++) {
  const repeated = await seller.requestPayout({ conversation_pubkey: buyerPubkey, request_message_id: requestId });
  assert.equal(repeated.duplicated, true);
  assert.equal(repeated.offer_message_id, payoutOfferId);
}

const validOfferMessage = inbox.buyer.find(item => item.message_id === payoutOfferId);
const tamperedOffer = JSON.parse(validOfferMessage.body);
tamperedOffer.amount_raw = '41';
const tamperedOfferId = 'f'.repeat(32);
inbox.buyer.push({ ...validOfferMessage, message_id: tamperedOfferId, body: JSON.stringify(tamperedOffer) });
await assert.rejects(buyer.payPayout({ conversation_pubkey: sellerPubkey, request_message_id: requestId, offer_message_id: tamperedOfferId }), /paid-job-payout-mismatch/);
network.buyer = 'live';
await assert.rejects(buyer.payPayout({ conversation_pubkey: sellerPubkey, request_message_id: requestId, offer_message_id: payoutOfferId }), /paid-job-payout-mismatch/);
network.buyer = 'dev';
assert.equal(sendCalls.length, 0, 'mismatched amount and wallet network fail before wallet send');

const paid = await buyer.payPayout({ conversation_pubkey: sellerPubkey, request_message_id: requestId, offer_message_id: payoutOfferId });
assert.equal(paid.txid, txid);
assert.equal(paid.settlement, 'direct-irreversible-payment');
assert.equal(paid.delivery, 'seller-signed-claim');
assert.equal(sendCalls.length, 1);
assert.equal(uniqueTransfers.size, 1);
for (let iteration = 0; iteration < 20; iteration++) {
  const repeated = await buyer.payPayout({ conversation_pubkey: sellerPubkey, request_message_id: requestId, offer_message_id: payoutOfferId });
  assert.equal(repeated.txid, txid);
}
assert.equal(sendCalls.length, 1, '20 replayed payout commands retain a single wallet send');
assert.equal(uniqueTransfers.size, 1, 'the mocked Nano network records one transfer');

const receipt = inbox.seller.at(-1);
const verified = await seller.verifyPayout({ conversation_pubkey: buyerPubkey, request_message_id: requestId, receipt_message_id: receipt.message_id });
assert.equal(verified.payout, 'received');
assert.equal(verified.confirmed, true);
assert.equal(receives, 1);
for (let iteration = 0; iteration < 20; iteration++) {
  const repeated = await seller.verifyPayout({ conversation_pubkey: buyerPubkey, request_message_id: requestId, receipt_message_id: receipt.message_id });
  assert.equal(repeated.duplicated, true);
}
assert.equal(receives, 1, '20 duplicate receipt verifications do not receive funds twice');
assert.equal((await buyerTrades.tradeStatus({ trade_id: paid.trade_id })).status, 'confirmed');
const finalStatus = await seller.status({ conversation_pubkey: buyerPubkey, request_message_id: requestId });
assert.equal(finalStatus.state, 'delivered');
assert.equal(finalStatus.payment_proof, 'must be checked by local wallet/node; relay notices are not proof');

const report = { result: 'PASS', profile: 'offline-synthetic-two-agent-XNO-paid-job', logicalNow: now,
  cases: ['request-no-payment', 'request-idempotency', 'request-conflict-rejected', 'blocked-peer-rejected', 'acceptance-idempotency',
    'delivery-requires-acceptance', 'delivery-idempotency', 'payout-offer-idempotency', 'wrong-amount-rejected', 'wrong-network-rejected',
    'direct-payout-once', 'ledger-receipt-verified', 'receipt-replay-received-once'],
  repeated_commands_per_idempotency_case: 20, wallet_send_calls: sendCalls.length, unique_mock_transfers: uniqueTransfers.size,
  verified_receives: receives, relay: 'in-memory-only', funds_used: false, real_participants: false, escrow: false };
const evidenceFile = fileURLToPath(new URL('../docs/evidence/product-completion/G5/paid-jobs-offline.json', import.meta.url));
await mkdir(path.dirname(evidenceFile), { recursive: true, mode: 0o700 });
await writeFile(evidenceFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report)}\n`);
