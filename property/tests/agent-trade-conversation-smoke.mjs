import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createEmptyConfig } from '../agent/core.mjs';
import { AgentService } from '../agent/service.mjs';
import { createTradeConversationService } from '../agent/trade-conversation.mjs';
import { createTradeStateMachine, emptyTradeJournal } from '../agent/trade-state.mjs';

const NOW = 1_800_000_000;
const NETWORKS = { BTC: ['regtest', 1], XMR: ['fakechain', 10], XNO: ['dev', 1] };
const hash = data => createHash('sha256').update(data).digest('hex');
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
function keyPair(label) {
  const seed = Buffer.from(hash(`property-g7-conversation-${label}`), 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  seed.fill(0);
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
function identity(name) {
  const pair = keyPair(name);
  return { pubkey: hash(pair.publicKey.export({ type: 'spki', format: 'der' })), ...pair, name };
}
function localSigner(name) {
  const pair = keyPair(name);
  const pubkey = hash(pair.publicKey.export({ type: 'spki', format: 'der' }));
  return { pubkey, sign: async message => sign(null, Buffer.from(message), pair.privateKey).toString('base64'), publicKey: pair.publicKey };
}
function machineFor(local, remote, signer, adapter, storage) {
  return createTradeStateMachine({ adapters: { [adapter.currency]: adapter }, localIdentityPubkey: local.pubkey, signer,
    verifyEvidence: async (pubkey, message, signature) => pubkey === signer.pubkey && verify(null, Buffer.from(message), signer.publicKey, Buffer.from(signature, 'base64')),
    authorize: async ({ actor_pubkey, authorization }) => actor_pubkey === local.pubkey ? authorization?.local === true :
      actor_pubkey === remote.pubkey && authorization?.transport_authenticated === true && /^[0-9a-f]{32}$/.test(authorization.message_id || ''),
    loadJournal: async () => structuredClone(storage.value), saveJournal: async value => { storage.value = structuredClone(value); }, now: () => NOW });
}
function transportPair(left, right, relays) {
  const leftInbox = [], rightInbox = [];
  let sequence = 0;
  const endpoint = (self, peer, inbox, otherInbox) => ({
    async sendMessage(recipient, body, in_reply_to, selectedRelays) {
      assert.equal(recipient, peer.pubkey);
      assert.deepEqual(selectedRelays, relays);
      const message_id = (sequence++).toString(16).padStart(32, '0');
      const message = { message_id, body, created_at: NOW + sequence, in_reply_to };
      inbox.push({ ...message, direction: 'sent', conversation_pubkey: peer.pubkey });
      otherInbox.push({ ...message, direction: 'received', conversation_pubkey: self.pubkey });
      return { message_id, status: 'relay_accepted', relay_acks: 1, relay_attempts: 1 };
    },
    async readMessages(conversation) { assert.equal(conversation, peer.pubkey); return inbox.map(item => ({ ...item })); }
  });
  return { left: endpoint(left, right, leftInbox, rightInbox), right: endpoint(right, left, rightInbox, leftInbox) };
}
function testAdapter(currency, paymentMap) {
  const [network, minConfirmations] = NETWORKS[currency];
  let nextAddress = 0;
  return { currency, network, minConfirmations, ledger: {
    async assertNetwork() { return network; },
    async createAddress() { nextAddress++; return `${currency.toLowerCase()}-trade-invoice-${nextAddress}`; },
    async lookupPayment({ address }) { return structuredClone(paymentMap.get(address) ?? null); }
  } };
}

const relay = ['ws://127.0.0.1:7447'];
const counts = {};
for (const currency of Object.keys(NETWORKS)) {
  const seller = identity(`${currency}-seller`), buyer = identity(`${currency}-buyer`);
  const sellerSigner = localSigner(`${currency}-seller-journal`), buyerSigner = localSigner(`${currency}-buyer-journal`);
  const sellerStorage = { value: emptyTradeJournal() }, buyerStorage = { value: emptyTradeJournal() }, payments = new Map();
  const transports = transportPair(seller, buyer, relay);
  const sellerMachine = machineFor(seller, buyer, sellerSigner, testAdapter(currency, payments), sellerStorage);
  const buyerMachine = machineFor(buyer, seller, buyerSigner, testAdapter(currency, payments), buyerStorage);
  const sellerService = createTradeConversationService({ pubkey: seller.pubkey, machine: sellerMachine, transport: transports.left,
    blockedPubkeys: () => [], relays: () => relay, now: () => NOW, randomId: () => 'f'.repeat(32) });
  const buyerService = createTradeConversationService({ pubkey: buyer.pubkey, machine: buyerMachine, transport: transports.right,
    blockedPubkeys: () => [], relays: () => relay, now: () => NOW });
  const sellerAgent = new AgentService({ pubkey: seller.pubkey, loadConfig: async () => createEmptyConfig(seller.pubkey),
    saveConfig: async () => {}, transport: transports.left, tradeConversations: sellerService });
  const buyerAgent = new AgentService({ pubkey: buyer.pubkey, loadConfig: async () => createEmptyConfig(buyer.pubkey),
    saveConfig: async () => {}, transport: transports.right, tradeConversations: buyerService });
  assert.equal((await sellerAgent.dispatch('trade.policy', {})).mainnet_enabled, false);
  let offers = 0, accepts = 0, requests = 0, notices = 0, localVerifications = 0, falselyVerified = 0, disputes = 0, cancellations = 0;
  for (let index = 0; index < 10; index++) {
    const tradeId = (index + 1).toString(16).padStart(32, '0');
    const created = await sellerAgent.dispatch('trade.offer', { recipient_pubkey: buyer.pubkey, currency, amount_atomic: '100',
      terms: `Fixed ${currency} terms ${index}`, expires_in_seconds: 600, trade_id: tradeId });
    offers++;
    const accepted = await buyerAgent.dispatch('trade.accept', { conversation_pubkey: seller.pubkey, offer_message_id: created.message_id });
    assert.equal(accepted.state, 'accepted'); accepts++;
    const paymentRequest = await sellerAgent.dispatch('trade.request_payment', { trade_id: tradeId });
    assert.equal(paymentRequest.state, 'payment-requested'); requests++;
    const buyerSync = await buyerAgent.dispatch('trade.sync', { conversation_pubkey: seller.pubkey, trade_id: tradeId });
    assert.equal(buyerSync.local_state, 'payment-requested');

    const sellerTrade = await sellerMachine.status({ trade_id: tradeId });
    const txid = hash(`${currency}-${tradeId}`);
    payments.set(sellerTrade.destination, { currency, network: NETWORKS[currency][0], address: sellerTrade.destination,
      amount_atomic: '100', txid, confirmations: NETWORKS[currency][1], proof: true });
    const settlement = await sellerAgent.dispatch('trade.reconcile', { trade_id: tradeId });
    assert.equal(settlement.state, 'settled');
    const noticeSync = await buyerAgent.dispatch('trade.sync', { conversation_pubkey: seller.pubkey, trade_id: tradeId });
    assert.equal(noticeSync.local_state, 'payment-requested');
    assert.equal(noticeSync.peer_claims.length, 1);
    assert.equal(noticeSync.peer_claims[0].trust, 'seller-reported-unverified');
    notices++;
    if (noticeSync.local_state === 'settled') falselyVerified++;
    const buyerLedgerCheck = await buyerAgent.dispatch('trade.reconcile', { trade_id: tradeId });
    assert.equal(buyerLedgerCheck.state, 'settled', 'recipient independently verifies through its own local test ledger');
    localVerifications++;
    const repeated = await buyerAgent.dispatch('trade.sync', { conversation_pubkey: seller.pubkey, trade_id: tradeId });
    assert.equal(repeated.local_state, 'settled');
    assert.equal(repeated.peer_claims.length, 1, 'repeated reads remain claims and never advance local settlement');
  }
  assert.equal(offers, 10); assert.equal(accepts, 10); assert.equal(requests, 10); assert.equal(notices, 10);
  assert.equal(localVerifications, 10); assert.equal(falselyVerified, 0);
  const disputeId = 'd'.repeat(32);
  const disputeOffer = await sellerAgent.dispatch('trade.offer', { recipient_pubkey: buyer.pubkey, currency, amount_atomic: '7',
    terms: `Dispute fixture ${currency}`, expires_in_seconds: 600, trade_id: disputeId });
  await buyerAgent.dispatch('trade.accept', { conversation_pubkey: seller.pubkey, offer_message_id: disputeOffer.message_id });
  await buyerAgent.dispatch('trade.dispute', { conversation_pubkey: seller.pubkey, trade_id: disputeId, summary: 'Fixed synthetic dispute' });
  await sellerAgent.dispatch('trade.sync', { conversation_pubkey: buyer.pubkey, trade_id: disputeId });
  assert.equal((await sellerAgent.dispatch('trade.status', { trade_id: disputeId })).state, 'disputed');
  assert.equal((await buyerAgent.dispatch('trade.status', { trade_id: disputeId })).state, 'disputed');
  disputes++;

  const cancelId = 'c'.repeat(32);
  const cancelOffer = await sellerAgent.dispatch('trade.offer', { recipient_pubkey: buyer.pubkey, currency, amount_atomic: '8',
    terms: `Cancel fixture ${currency}`, expires_in_seconds: 600, trade_id: cancelId });
  await buyerAgent.dispatch('trade.accept', { conversation_pubkey: seller.pubkey, offer_message_id: cancelOffer.message_id });
  await buyerAgent.dispatch('trade.cancel', { trade_id: cancelId });
  await sellerAgent.dispatch('trade.sync', { conversation_pubkey: buyer.pubkey, trade_id: cancelId });
  assert.equal((await sellerAgent.dispatch('trade.status', { trade_id: cancelId })).state, 'cancelled');
  assert.equal((await buyerAgent.dispatch('trade.status', { trade_id: cancelId })).state, 'cancelled');
  cancellations++;
  assert.equal(disputes, 1); assert.equal(cancellations, 1);
  await sellerAgent.close(); await buyerAgent.close();
  counts[currency] = { offers, accepted: accepts, payment_requests: requests, seller_settlements: notices,
    recipient_local_ledger_verifications: localVerifications, recipient_settlements_from_peer_claims: 0,
    disputes: disputes, cancellations: cancellations, repeated_syncs_safe: true };
}

const report = { schema_version: 1, gate: 'G7-NIP17-trade-conversation', result: 'PASS', fixed_count: counts,
  network_scope: { seller_adapter_must_be_local_and_test_network_only: true, public_relays: false, mainnet: false },
  trust_boundaries: { seller_chain_state_is_local: true, buyer_settlement_notice_trust: 'seller-reported-unverified', delivery_guarantee: false,
    wallet_identity_binding: 'unverified-claim', custody: false } };
process.stdout.write(`${JSON.stringify(report)}\n`);
