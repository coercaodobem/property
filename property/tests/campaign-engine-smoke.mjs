import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createCampaignEngine, OFFER_KIND, OFFER_TAG, REFUND_REQUEST_KIND } from '../relay/campaign-engine.mjs';

const temp = await mkdtemp(path.join(os.tmpdir(), 'property-campaign-engine-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const N = context.NostrTools;
function identity() {
  const values = JSON.parse(vm.runInContext(`(() => { const secret=NostrTools.generateSecretKey(); return JSON.stringify({secret:Array.from(secret),pubkey:NostrTools.getPublicKey(secret)}); })()`, context));
  return { ...values, secretHex: values.secret.map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
const advertiser = identity(), nodeA = identity(), nodeB = identity();
const verifyEvent = event => {
  context.eventJson = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(eventJson))', context, { timeout: 5000 });
};
const signWith = who => draft => {
  context.signJson = JSON.stringify({ ...draft, secret: who.secret });
  return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(signJson); return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret))); })()`, context, { timeout: 5000 }));
};
let now = 1_800_000_000;
let addressSequence = 0;
const payments = new Map();
const refunds = new Map();
let lookupCalls = 0, refundCalls = 0;
const ledger = {
  async lookupPayment({ address, currency }) {
    lookupCalls++;
    const payment = payments.get(address);
    return payment ? structuredClone({ ...payment, currency: payment.currency ?? currency }) : null;
  },
  async refundPayment(request) {
    refundCalls++;
    if (refunds.has(request.idempotencyKey)) return structuredClone(refunds.get(request.idempotencyKey));
    const result = { confirmed: true, txid: 'f'.repeat(64), fee_atomic: '1' };
    refunds.set(request.idempotencyKey, result);
    return structuredClone(result);
  }
};
const published = [];
function engine(who, stateDir, policy = {}) {
  return createCampaignEngine({
    stateDir, nodePubkey: who.pubkey, verifyEvent, signEvent: signWith(who),
    addressProvider: async ({ campaignId }) => `offline-${who.pubkey.slice(0, 8)}-${campaignId}-${++addressSequence}`,
    ledger, publishEvent: async event => { published.push(event); return { accepted: true, message: 'stored' }; },
    nowSeconds: () => now, policy
  });
}
function signEvent(kind, content, secret = advertiser, tags = [], createdAt = now) {
  context.templateJson = JSON.stringify({ kind, content, tags, created_at: createdAt, secret: secret.secret });
  return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(templateJson); return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret))); })()`, context, { timeout: 5000 }));
}
function offer({ id = crypto.randomUUID(), amount = '1', expires = now + 120, currency = 'XNO' } = {}) {
  const content = JSON.stringify({ schema: OFFER_TAG, campaign_id: id, advertiser_pubkey: advertiser.pubkey,
    title: 'Node comunitário', body: 'Relay local', link: 'https://example.org/property', currency,
    amount_atomic: amount, expires_at: expires, refund_terms: 'Reembolso integral em caso de valor ou prazo incompatível.' });
  return signEvent(OFFER_KIND, content, advertiser, [['t', OFFER_TAG], ['d', id]]);
}

try {
  const nodeADir = path.join(temp, 'node-a');
  const nodeBDir = path.join(temp, 'node-b');
  const firstOffer = offer();
  assert.equal(verifyEvent(firstOffer), true);
  let nodeAEngine = engine(nodeA, nodeADir);
  const accepted = await nodeAEngine.decide(firstOffer);
  assert.equal(accepted.decision, 'accepted');
  assert.equal(accepted.record.status, 'awaiting_payment');
  assert.equal(accepted.event.kind, 30080);
  assert.equal(verifyEvent(accepted.event), true);
  const acceptance = JSON.parse(accepted.event.content);
  assert.equal(acceptance.offer_event_id, firstOffer.id);
  assert.equal(acceptance.terms_hash, nodeAEngine ? accepted.record.terms_hash : null);
  assert.equal(acceptance.currency, 'XNO');
  assert.equal(acceptance.amount_atomic, '1');
  assert.ok(acceptance.payment_address);
  assert.ok(acceptance.refund_terms);
  assert.equal((await nodeAEngine.decide(firstOffer)).event.id, accepted.event.id, 'same offer is decided once');
  const changedTerms = await nodeAEngine.decide(offer({ id: accepted.record.campaign_id, amount: '2' }));
  assert.equal(changedTerms.decision, 'rejected', 'a changed offer using the same campaign ID receives a signed refusal');
  assert.equal(JSON.parse(changedTerms.event.content).reason, 'campaign_id_conflict');
  assert.equal((await nodeAEngine.get(accepted.record.campaign_id)).payment_address, accepted.record.payment_address,
    'a changed offer cannot replace the original signed acceptance');
  assert.equal((await stat(path.join(nodeADir, 'campaigns.json'))).mode & 0o777, 0o600, 'state file is private');

  nodeAEngine = engine(nodeA, nodeADir);
  assert.equal((await nodeAEngine.get(accepted.record.campaign_id)).status, 'awaiting_payment', 'restart preserves acceptance');
  assert.equal((await nodeAEngine.reconcile(accepted.record.campaign_id)).status, 'awaiting_payment', 'missing payment does not publish');
  const txid = '1'.repeat(64);
  payments.set(acceptance.payment_address, { address: acceptance.payment_address, currency: 'XNO', amount_atomic: '1', txid, confirmations: 0, proof: true });
  assert.equal((await nodeAEngine.reconcile(accepted.record.campaign_id)).status, 'payment_pending', 'unconfirmed payment does not publish');
  nodeAEngine = engine(nodeA, nodeADir);
  payments.set(acceptance.payment_address, { address: acceptance.payment_address, currency: 'XNO', amount_atomic: '1', txid, confirmations: 1, proof: true });
  const publishedResult = await nodeAEngine.reconcile(accepted.record.campaign_id);
  assert.equal(publishedResult.status, 'published');
  assert.equal(publishedResult.event.kind, 30078);
  assert.equal(verifyEvent(publishedResult.event), true);
  const activeCampaign = JSON.parse(publishedResult.event.content);
  assert.equal(activeCampaign.offer_event_id, firstOffer.id);
  assert.equal(activeCampaign.acceptance_event_id, accepted.event.id);
  assert.equal(activeCampaign.payment_tx_id, txid);
  assert.equal(activeCampaign.amount_atomic, '1');
  assert.equal(published.filter(event => event.kind === 30078).length, 1);
  nodeAEngine = engine(nodeA, nodeADir);
  assert.equal((await nodeAEngine.reconcile(accepted.record.campaign_id)).status, 'published', 'restart and duplicate reconciliation do not duplicate publication');
  assert.equal(published.filter(event => event.kind === 30078).length, 1);
  now = activeCampaign.expires_at + 1;
  const expired = await nodeAEngine.reconcile(accepted.record.campaign_id);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.event.kind, 5, 'expiry publishes a signed NIP-09 deletion event');
  assert.equal(verifyEvent(expired.event), true);
  assert.equal(published.filter(event => event.kind === 5).length, 1);

  const rejectedOffer = offer({ id: crypto.randomUUID(), expires: now + 300 });
  const nodeBEngine = engine(nodeB, nodeBDir, { enabled: false });
  const rejected = await nodeBEngine.decide(rejectedOffer);
  assert.equal(rejected.decision, 'rejected');
  assert.equal(JSON.parse(rejected.event.content).reason, 'campaigns_disabled_by_node');
  assert.equal(verifyEvent(rejected.event), true);
  assert.equal('payment_address' in JSON.parse(rejected.event.content), false);
  assert.equal(published.filter(event => event.kind === 30078).length, 1, 'rejection does not publish a campaign');
  assert.equal(await nodeBEngine.get(rejected.record.campaign_id).then(row => row.status), 'rejected', 'node B decision persists independently');

  now += 1;
  const mismatchOffer = offer({ id: crypto.randomUUID(), expires: now + 300 });
  const mismatchAcceptance = await nodeAEngine.decide(mismatchOffer);
  const mismatchAddress = JSON.parse(mismatchAcceptance.event.content).payment_address;
  payments.set(mismatchAddress, { address: mismatchAddress, currency: 'XNO', amount_atomic: '2', txid: '2'.repeat(64), confirmations: 2, proof: true });
  const mismatch = await nodeAEngine.reconcile(mismatchAcceptance.record.campaign_id);
  assert.equal(mismatch.status, 'refund_due');
  assert.equal(published.filter(event => event.kind === 30078).length, 1, 'wrong amount never activates a campaign');
  const refundRequest = signEvent(REFUND_REQUEST_KIND, JSON.stringify({ schema: 'property-campaign-refund-v1',
    campaign_id: mismatchAcceptance.record.campaign_id, offer_event_id: mismatchOffer.id,
    payment_tx_id: '2'.repeat(64), refund_address: 'refund-address-from-signed-request' }), advertiser,
  [['d', mismatchAcceptance.record.campaign_id], ['e', mismatchOffer.id]]);
  const beforeRefundCalls = refundCalls;
  const refunded = await nodeAEngine.refund(refundRequest);
  assert.equal(refunded.status, 'refunded');
  assert.equal(refunded.refund.amount_atomic, '2', 'refund covers the exact observed atomic amount');
  assert.equal(verifyEvent(refundRequest), true);
  const duplicateRefund = await engine(nodeA, nodeADir).refund(refundRequest);
  assert.equal(duplicateRefund.status, 'refunded');
  assert.equal(refundCalls, beforeRefundCalls + 1, 'restart and duplicate refund request remain idempotent');
  assert.equal((await engine(nodeA, nodeADir).get(mismatchAcceptance.record.campaign_id)).status, 'refunded');

  const changedOffer = JSON.parse(JSON.stringify(firstOffer));
  changedOffer.content = changedOffer.content.replace('"amount_atomic":"1"', '"amount_atomic":"2"');
  assert.throws(() => offerPayloadForSmoke(changedOffer), /signature/i);
  assert.ok(lookupCalls >= 4, 'payment state comes from the ledger adapter, not a declared transaction ID');
  console.log('PASS: signed node decisions, independent policy, persisted campaign state machine, exact payment reconciliation, idempotent publication/refund, and expiry tombstone');
} finally {
  await rm(temp, { recursive: true, force: true });
}

function offerPayloadForSmoke(event) {
  if (!verifyEvent(event)) throw new Error('signature check failed');
  return event;
}
