import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createXnoTradeService, emptyXnoJournal, validateXnoJournal } from '../agent/xno-trades.mjs';
import { createEncryptedXnoJournalStore } from '../agent/xno-journal.mjs';
import { createEncryptedPayload, openEncryptedPayload } from '../agent/vault.mjs';

const now = 1_900_000_000;
const sellerPub = 'a'.repeat(64), buyerPub = 'b'.repeat(64), strangerPub = 'c'.repeat(64);
const sellerAccount = `nano_1${'1'.repeat(59)}`;
const buyerAccount = `nano_3${'3'.repeat(59)}`;
const relay = 'ws://127.0.0.1:7447';
const terms = 'Entrega local de um arquivo sintético após a confirmação.';
const termsHash = createHash('sha256').update(terms).digest('hex');
const txid = 'd'.repeat(64).toUpperCase();
const fixedTradeIds = ['1'.repeat(32), '2'.repeat(32), '3'.repeat(32)];

const records = { seller: emptyXnoJournal(), buyer: emptyXnoJournal() };
const inbox = { seller: [], buyer: [] };
const outbox = { seller: [], buyer: [] };
const state = { seller: records.seller, buyer: records.buyer };
const sendCalls = [], broadcasts = new Map();
let failAfterFirstBroadcast = true;
let confirmed = false;
let receivedCount = 0;
let loseFirstReceiveResponse = true;
let messageIndex = 0;

const encryptedConfig = createEncryptedPayload({ rpc_password: 'synthetic-rpc-secret', wallet_password: 'synthetic-wallet-secret', amount_cap: '40' }, sellerPub,
  'synthetic-vault-password-never-used-for-a-wallet', 'xno-wallet');
assert.equal(JSON.stringify(encryptedConfig).includes('synthetic-rpc-secret'), false);
assert.deepEqual(openEncryptedPayload(encryptedConfig, sellerPub, 'synthetic-vault-password-never-used-for-a-wallet', 'xno-wallet'),
  { rpc_password: 'synthetic-rpc-secret', wallet_password: 'synthetic-wallet-secret', amount_cap: '40' });
assert.throws(() => openEncryptedPayload(encryptedConfig, buyerPub, 'synthetic-vault-password-never-used-for-a-wallet', 'xno-wallet'), /inválido ou incompatível/);
assert.throws(() => openEncryptedPayload(encryptedConfig, sellerPub, 'wrong-synthetic-password', 'xno-wallet'), /adulterado/);

function messageId() { return (++messageIndex).toString(16).padStart(32, '0'); }
function transport(role, pubkey, peerRole) {
  return {
    async readMessages(peer, limit) {
      assert.equal(limit, 100);
      const rows = inbox[role].filter(item => item.conversation_pubkey === peer);
      return rows.slice(-limit).map(row => structuredClone(row));
    },
    async sendMessage(peer, body, inReplyTo, relays) {
      assert.equal(peer, role === 'seller' ? buyerPub : sellerPub);
      assert.deepEqual(relays, [relay]);
      const id = messageId();
      const entry = { message_id: id, in_reply_to: inReplyTo, conversation_pubkey: peer, direction: 'sent', body, created_at: now };
      outbox[role].push(entry);
      inbox[peerRole].push({ ...entry, direction: 'received', conversation_pubkey: pubkey });
      return { status: 'relay_accepted', message_id: id, relay_acks: 1, relay_attempts: 1 };
    },
  };
}

function wallet(account, role) {
  return {
    account,
    maxRawPerPayment: 100n,
    lifetimeBudgetRaw: 150n,
    async assertReady() { return { ready: true, account, network: 'dev' }; },
    async policy() { return { configured: true, network: 'dev', account, max_raw_per_payment: '100', lifetime_budget_raw: '150', confirmed_balance_raw: '200' }; },
    async send({ destination, amountRaw, idempotencyKey }) {
      sendCalls.push({ role, destination, amountRaw, idempotencyKey });
      assert.equal(destination, sellerAccount);
      assert.equal(amountRaw, '40');
      if (!broadcasts.has(idempotencyKey)) broadcasts.set(idempotencyKey, txid);
      if (failAfterFirstBroadcast) { failAfterFirstBroadcast = false; throw new Error('xno-rpc-timeout'); }
      return { txid: broadcasts.get(idempotencyKey) };
    },
    async inspectSend(input) {
      assert.deepEqual(input, { txid, destination: sellerAccount, amountRaw: '40', source: buyerAccount });
      return { txid, source: buyerAccount, destination: sellerAccount, amount_raw: '40', confirmed, status: confirmed ? 'confirmed' : 'pending' };
    },
    async inspectSendForReceipt(input) {
      assert.deepEqual(input, { txid, destination: sellerAccount, amountRaw: '40', source: buyerAccount });
      return { txid, source: buyerAccount, destination: sellerAccount, amount_raw: '40', confirmed, status: confirmed ? 'confirmed' : 'pending' };
    },
    async receiveConfirmed({ txid: sourceTx, sourceAccount, amountRaw }) {
      assert.equal(sourceTx, txid);
      assert.equal(sourceAccount, buyerAccount);
      assert.equal(amountRaw, '40');
      if (receivedCount === 0) receivedCount++;
      if (loseFirstReceiveResponse) { loseFirstReceiveResponse = false; throw new Error('xno-rpc-timeout'); }
      return { received: true, receive_txid: 'e'.repeat(64).toUpperCase() };
    },
  };
}

function build(role, idSequence = []) {
  const self = role === 'seller' ? sellerPub : buyerPub;
  const peer = role === 'seller' ? buyerPub : sellerPub;
  const account = role === 'seller' ? sellerAccount : buyerAccount;
  const blocked = new Set();
  const service = createXnoTradeService({ pubkey: self, wallet: wallet(account, role), transport: transport(role, self, peer === sellerPub ? 'seller' : 'buyer'),
    blockedPubkeys: () => [...blocked], relays: () => [relay], loadJournal: async () => structuredClone(state[role]),
    saveJournal: async value => { state[role] = structuredClone(value); }, now: () => now,
    randomId: () => idSequence.shift() || 'f'.repeat(32) });
  return { service, blocked };
}

const seller = build('seller', fixedTradeIds);
const buyer = build('buyer');
const policy = await buyer.service.policy();
assert.deepEqual([policy.configured, policy.escrow, policy.max_raw_per_payment, policy.lifetime_budget_raw, policy.budget_committed_raw, policy.budget_remaining_raw],
  [true, false, '100', '150', '0', '150']);

const offerResult = await seller.service.createOffer({ recipient_pubkey: buyerPub, amount_raw: '40', terms, expires_in_seconds: 3600 });
assert.equal(offerResult.status, 'relay_accepted');
assert.equal(offerResult.trade_id, '1'.repeat(32));
assert.equal(offerResult.seller_account, sellerAccount);
const offerMessage = inbox.buyer.at(-1);
const parsedOffer = JSON.parse(offerMessage.body);
assert.equal(parsedOffer.terms_sha256, termsHash);
assert.equal(parsedOffer.expires_at, now + 3600);

await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: 'f'.repeat(32) }), /xno-offer-not-found/);
const replacedSeller = { ...parsedOffer, seller_pubkey: strangerPub };
inbox.buyer.push({ ...offerMessage, message_id: '9'.repeat(32), body: JSON.stringify(replacedSeller) });
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '9'.repeat(32) }), /xno-offer-invalid/);
const invalidHash = { ...parsedOffer, trade_id: '8'.repeat(32), terms_sha256: '0'.repeat(64) };
inbox.buyer.push({ ...offerMessage, message_id: '8'.repeat(32), body: JSON.stringify(invalidHash) });
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '8'.repeat(32) }), /xno-offer-invalid/);
const duplicateKeyBody = `{"protocol":"property-xno-trade/v1","protocol":"property-xno-trade/v1"}`;
inbox.buyer.push({ ...offerMessage, message_id: '7'.repeat(32), body: duplicateKeyBody });
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '7'.repeat(32) }), /xno-offer-invalid/);
seller.blocked.add(buyerPub);
await assert.rejects(seller.service.createOffer({ recipient_pubkey: buyerPub, amount_raw: '40', terms, expires_in_seconds: 3600 }), /agent-blocked-locally/);
seller.blocked.clear();

await assert.rejects(buyer.service.payOffer({ conversation_pubkey: strangerPub, offer_message_id: offerResult.offer_message_id }), /xno-offer-not-found/);
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: 'A'.repeat(32) }), /invalid-arguments/);
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: offerResult.offer_message_id, extra: true }), /invalid-arguments/);

await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: offerResult.offer_message_id }), /xno-rpc-timeout/);
assert.equal(sendCalls.length, 1);
assert.equal(state.buyer.budget_committed_raw, '40', 'an uncertain send reserves the amount before the RPC call');
const afterTimeout = await buyer.service.tradeStatus({ trade_id: offerResult.trade_id });
assert.equal(afterTimeout.status, 'prepared');
assert.equal(afterTimeout.retry_safe, true);
const retry = await buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: offerResult.offer_message_id });
assert.equal(retry.txid, txid);
assert.equal(retry.status, 'submitted');
assert.equal(sendCalls.length, 2, 'the RPC retry is made with the same logical trade');
assert.equal(new Set(sendCalls.map(call => call.idempotencyKey)).size, 1);
assert.equal(broadcasts.size, 1, 'a lost response and retry create only one underlying Nano transfer');
assert.equal(retry.receipt.status, 'relay_accepted');
assert.equal(inbox.seller.at(-1).direction, 'received');

const receiptMessage = inbox.seller.at(-1);
const sellerVerify = await seller.service.verifyReceipt({ conversation_pubkey: buyerPub, receipt_message_id: receiptMessage.message_id });
assert.equal(sellerVerify.status, 'pending');
assert.equal(receivedCount, 0, 'unconfirmed transfers are never received');
confirmed = true;
await assert.rejects(seller.service.verifyReceipt({ conversation_pubkey: buyerPub, receipt_message_id: receiptMessage.message_id }), /xno-rpc-timeout/);
assert.equal(receivedCount, 1, 'the synthetic wallet accepted the receive before losing its response');
const verified = await seller.service.verifyReceipt({ conversation_pubkey: buyerPub, receipt_message_id: receiptMessage.message_id });
assert.equal(verified.status, 'received');
assert.equal(verified.confirmed, true);
assert.equal(receivedCount, 1);
const duplicateReceipt = await seller.service.verifyReceipt({ conversation_pubkey: buyerPub, receipt_message_id: receiptMessage.message_id });
assert.equal(duplicateReceipt.duplicated, true);
assert.equal(receivedCount, 1, 'a replayed receipt cannot trigger a second receive');

const payerStatus = await buyer.service.tradeStatus({ trade_id: offerResult.trade_id });
assert.equal(payerStatus.status, 'confirmed');
const dispute = await buyer.service.dispute({ conversation_pubkey: sellerPub, trade_id: offerResult.trade_id, summary: 'O arquivo acordado não foi entregue.' });
assert.equal(dispute.funds_frozen, false);
assert.equal(dispute.resolution, 'not-enforced-by-Nano');
assert.equal(JSON.parse(inbox.seller.at(-1).body).type, 'dispute');

const restartedBuyer = build('buyer');
const restartReplay = await restartedBuyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: offerResult.offer_message_id });
assert.equal(restartReplay.txid, txid);
assert.equal(broadcasts.size, 1, 'restoring the durable journal and retrying after restart reuses the same send ID');
assert.equal(state.buyer.budget_committed_raw, '40');

const expired = { ...parsedOffer, trade_id: '6'.repeat(32), created_at: now - 7200, expires_at: now - 3600 };
inbox.buyer.push({ ...offerMessage, message_id: '6'.repeat(32), created_at: now - 7200, body: JSON.stringify(expired) });
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '6'.repeat(32) }), /xno-offer-expired/);
const overCap = { ...parsedOffer, trade_id: '5'.repeat(32), amount_raw: '101' };
inbox.buyer.push({ ...offerMessage, message_id: '5'.repeat(32), body: JSON.stringify(overCap) });
await assert.rejects(buyer.service.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '5'.repeat(32) }), /xno-payment-limit-exceeded/);
const budgetOffer = { ...parsedOffer, trade_id: '4'.repeat(32), amount_raw: '1', terms_sha256: termsHash };
inbox.buyer.push({ ...offerMessage, message_id: '4'.repeat(32), body: JSON.stringify(budgetOffer) });
const saturated = emptyXnoJournal();
saturated.budget_committed_raw = '150';
saturated.payments['9'.repeat(32)] = { trade_id: '9'.repeat(32), offer_message_id: '9'.repeat(32), offer_fingerprint: '9'.repeat(64),
  peer_pubkey: sellerPub, source_account: buyerAccount, destination: sellerAccount, amount_raw: '150', terms_sha256: termsHash,
  status: 'confirmed', txid: txid, receipt_message_id: '9'.repeat(32) };
const exhaustedBudgetService = createXnoTradeService({ pubkey: buyerPub, wallet: wallet(buyerAccount, 'budget-fixture'), transport: transport('buyer', buyerPub, 'seller'),
  blockedPubkeys: () => [], relays: () => [relay], loadJournal: async () => structuredClone(saturated), saveJournal: async () => { throw new Error('unexpected-journal-write'); }, now: () => now });
await assert.rejects(exhaustedBudgetService.payOffer({ conversation_pubkey: sellerPub, offer_message_id: '4'.repeat(32) }), /xno-lifetime-budget-exceeded/);

const tamperedJournal = structuredClone(state.buyer);
tamperedJournal.budget_committed_raw = '0';
assert.throws(() => validateXnoJournal(tamperedJournal), /xno-journal-budget-mismatch/);

const journalDirectory = await mkdtemp(path.join(os.tmpdir(), 'property-xno-journal-'));
const journalFile = path.join(journalDirectory, 'journal.json');
const journalStore = createEncryptedXnoJournalStore({ file: journalFile, pubkey: buyerPub, password: 'synthetic-vault-password-never-used-for-a-wallet' });
try {
  await journalStore.save(state.buyer);
  const encryptedJournal = await readFile(journalFile, 'utf8');
  assert.match(encryptedJournal, /property-agent-encrypted-payload-v1/);
  assert.doesNotMatch(encryptedJournal, /"budget_committed_raw"|"offer_fingerprint"|"payments"/);
  assert.deepEqual(await journalStore.load(), validateXnoJournal(state.buyer));
  const changedEnvelope = JSON.parse(encryptedJournal);
  changedEnvelope.auth_tag = (changedEnvelope.auth_tag[0] === 'A' ? 'B' : 'A') + changedEnvelope.auth_tag.slice(1);
  await writeFile(journalFile, JSON.stringify(changedEnvelope), { mode: 0o600 });
  await assert.rejects(journalStore.load(), /adulterado/);
  const wrongIdentityStore = createEncryptedXnoJournalStore({ file: journalFile, pubkey: sellerPub, password: 'synthetic-vault-password-never-used-for-a-wallet' });
  await assert.rejects(wrongIdentityStore.load(), /inválido ou incompatível/);
  await writeFile(journalFile, JSON.stringify(state.buyer), { mode: 0o600 });
  await assert.rejects(journalStore.load(), /inválido ou incompatível/);
} finally { await rm(journalDirectory, { recursive: true, force: true }); }

assert.equal(fixedTradeIds.length, 2);

const expectedIds = ['encrypted-policy-contains-no-plaintext-secret', 'encrypted-payload-context-and-password-binding', 'policy', 'offer', 'unknown-offer-refused', 'forged-signer-refused', 'terms-hash-refused', 'duplicate-json-refused', 'blocked-peer-refused',
  'bad-peer-refused', 'bad-message-id-refused', 'extra-argument-refused', 'lost-send-response-reserved', 'same-id-retry-single-transfer',
  'receipt-waits-for-confirmation', 'lost-receive-response-recovered-on-retry', 'confirmed-receipt-received-once', 'receipt-replay-deduplicated', 'confirmed-status', 'dispute-recorded-no-freeze',
  'restart-retry-no-duplicate', 'expired-offer-refused', 'over-cap-offer-refused', 'lifetime-budget-exhausted-refused', 'journal-budget-tamper-rejected',
  'journal-encrypted-at-rest', 'journal-authentication-and-identity-binding', 'plaintext-or-tampered-journal-fails-closed'];
process.stdout.write(JSON.stringify({ gate: 'G8-XNO-trades', profile: 'offline', seed: 'property-xno-trade-fixed-v1', logicalNow: now,
  cases: expectedIds.map(id => ({ id, result: 'PASS' })), caseCount: expectedIds.length, rawAmounts: ['40', '100', '101', '150'], actualNanoTransfers: broadcasts.size,
  actualNanoReceiveBlocks: receivedCount, fundsUsed: false, relayUsed: 'local-fixtures-only', escrow: false }, null, 2) + '\n');
