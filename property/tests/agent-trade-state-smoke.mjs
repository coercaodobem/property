import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../agent/protocol-contract.mjs';
import { createTradeStateMachine, emptyTradeJournal } from '../agent/trade-state.mjs';

const CURRENCIES = { BTC: { network: 'regtest', minConfirmations: 1 }, XMR: { network: 'fakechain', minConfirmations: 10 }, XNO: { network: 'dev', minConfirmations: 1 } };
const BASE = 1_800_000_000;
const HASH = value => createHash('sha256').update(value, 'utf8').digest('hex');
const identityKeys = new Map();
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
let identitySequence = 0;

function identity() {
  const seed = Buffer.from(HASH(`property-g7-state-identity-${identitySequence++}`), 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  seed.fill(0);
  const pair = { privateKey, publicKey: createPublicKey(privateKey) };
  const encoded = pair.publicKey.export({ type: 'spki', format: 'der' });
  const pubkey = HASH(encoded.toString('base64'));
  identityKeys.set(pubkey, pair.publicKey);
  return { pubkey, privateKey: pair.privateKey };
}
function signText(privateKey, value) { return sign(null, Buffer.from(value, 'utf8'), privateKey).toString('base64'); }
function makeAuthorization(identityValue, action, tradeId, actorPubkey = identityValue.pubkey) {
  return signText(identityValue.privateKey, canonicalJson({ action, trade_id: tradeId, actor_pubkey: actorPubkey }));
}
function verifySigned(pubkey, bytes, signature) {
  const key = identityKeys.get(pubkey);
  if (!key || typeof signature !== 'string') return false;
  try { return verify(null, Buffer.from(bytes, 'utf8'), key, Buffer.from(signature, 'base64')); }
  catch { return false; }
}
function createFixture(currency, input = {}) {
  const seller = input.seller || identity();
  const buyer = input.buyer || identity();
  const observer = input.observer || identity();
  let now = input.now ?? BASE;
  let payment = null;
  let lookupCalls = 0;
  let addressCalls = 0;
  let rpcError = false;
  let journal = emptyTradeJournal();
  const network = CURRENCIES[currency].network;
  const ledger = {
    async assertNetwork() { if (input.assertNetworkError) throw new Error('wrong-network'); return network; },
    async createAddress({ campaignId }) { addressCalls++; return `${currency.toLowerCase()}-invoice-${campaignId}`; },
    async lookupPayment() { lookupCalls++; if (rpcError) throw new Error('rpc-timeout'); return payment === null ? null : structuredClone(payment); }
  };
  const machine = createTradeStateMachine({
    adapters: { [currency]: { ledger, network, minConfirmations: CURRENCIES[currency].minConfirmations } },
    localIdentityPubkey: seller.pubkey,
    signer: { pubkey: observer.pubkey, sign: async value => signText(observer.privateKey, value) },
    verifyEvidence: verifySigned,
    authorize: async ({ action, trade, actor_pubkey, authorization }) => {
      const key = identityKeys.get(actor_pubkey);
      if (!key || !['seller', 'buyer'].includes(trade.seller_pubkey === actor_pubkey ? 'seller' : trade.buyer_pubkey === actor_pubkey ? 'buyer' : '')) return false;
      return verifySigned(actor_pubkey, canonicalJson({ action, trade_id: trade.trade_id, actor_pubkey }), authorization);
    },
    loadJournal: async () => structuredClone(journal),
    saveJournal: async value => { journal = structuredClone(value); },
    now: () => now,
    randomId: () => '0'.repeat(32)
  });
  return {
    machine, seller, buyer, observer, ledger,
    get journal() { return structuredClone(journal); },
    set payment(value) { payment = value; },
    set rpcError(value) { rpcError = value; },
    set now(value) { now = value; },
    get lookupCalls() { return lookupCalls; },
    get addressCalls() { return addressCalls; }
  };
}

function receipt(currency, network, address, amount, txid = HASH(`${currency}:${address}`), extra = {}) {
  return { currency, network, address, amount_atomic: amount, txid, confirmations: CURRENCIES[currency].minConfirmations, proof: true, ...extra };
}
async function createAccepted(fixture, currency, tradeNumber, expiresAt = BASE + 100) {
  const tradeId = tradeNumber.toString(16).padStart(32, '0');
  const offer = await fixture.machine.createOffer({ trade_id: tradeId, currency, amount_atomic: '10',
    seller_pubkey: fixture.seller.pubkey, buyer_pubkey: fixture.buyer.pubkey,
    terms: `fixed terms ${currency} ${tradeNumber}`, expires_at: expiresAt });
  await fixture.machine.accept({ trade_id: tradeId, actor_pubkey: fixture.buyer.pubkey,
    authorization: makeAuthorization(fixture.buyer, 'accepted', tradeId) });
  await fixture.machine.requestPayment({ trade_id: tradeId, actor_pubkey: fixture.seller.pubkey,
    authorization: makeAuthorization(fixture.seller, 'payment-requested', tradeId) });
  return offer;
}
function paymentFor(currency, trade, overrides = {}) {
  return receipt(currency, trade.network, trade.destination, trade.amount_atomic, HASH(`tx:${trade.trade_id}`), overrides);
}

const perCurrency = {};
let fixtureCount = 0, invalidSettled = 0;
const scenarios = ['settled', 'observed', 'underpaid', 'overpaid', 'wrong-network', 'malformed', 'rpc-uncertain', 'duplicate', 'late-payment', 'cancelled'];
for (const currency of Object.keys(CURRENCIES)) {
  let counts = Object.fromEntries(scenarios.map(name => [name, 0]));
  for (let repeat = 0; repeat < 5; repeat++) for (const scenario of scenarios) {
    const fixture = createFixture(currency);
    const tradeId = ++fixtureCount;
    const expiredAt = BASE + 10;
    const offer = await fixture.machine.createOffer({ trade_id: tradeId.toString(16).padStart(32, '0'), currency, amount_atomic: '10',
      seller_pubkey: fixture.seller.pubkey, buyer_pubkey: fixture.buyer.pubkey,
      terms: `fixed terms ${currency} ${scenario} ${repeat}`, expires_at: scenario === 'late-payment' ? expiredAt : BASE + 100 });
    const id = offer.trade_id;
    if (scenario === 'cancelled') {
      const cancelled = await fixture.machine.cancel({ trade_id: id, actor_pubkey: fixture.seller.pubkey,
        authorization: makeAuthorization(fixture.seller, 'cancelled', id) });
      assert.equal(cancelled.state, 'cancelled');
    } else if (scenario === 'late-payment') {
      fixture.now = expiredAt;
      await fixture.machine.expire({ trade_id: id, actor_pubkey: fixture.seller.pubkey,
        authorization: makeAuthorization(fixture.seller, 'expired', id) });
      fixture.payment = paymentFor(currency, offer);
      const late = await fixture.machine.reconcile({ trade_id: id });
      assert.equal(late.state, 'disputed');
    } else {
      await fixture.machine.accept({ trade_id: id, actor_pubkey: fixture.buyer.pubkey,
        authorization: makeAuthorization(fixture.buyer, 'accepted', id) });
      await fixture.machine.requestPayment({ trade_id: id, actor_pubkey: fixture.seller.pubkey,
        authorization: makeAuthorization(fixture.seller, 'payment-requested', id) });
      if (scenario === 'rpc-uncertain') {
        fixture.rpcError = true;
        const uncertain = await fixture.machine.reconcile({ trade_id: id });
        assert.equal(uncertain.state, 'payment-requested');
        assert.equal(uncertain.rpc_uncertain, true);
      } else {
        const received = scenario === 'underpaid' ? '9' : scenario === 'overpaid' ? '11' : '10';
        const payment = paymentFor(currency, offer, scenario === 'wrong-network' ? { network: 'mainnet' } : {});
        if (scenario === 'underpaid' || scenario === 'overpaid') payment.amount_atomic = received;
        if (scenario === 'malformed') payment.txid = 'invalid';
        if (scenario === 'observed') payment.confirmations = 0;
        fixture.payment = payment;
        const result = await fixture.machine.reconcile({ trade_id: id });
        const expected = scenario === 'settled' || scenario === 'duplicate' ? 'settled' : scenario === 'observed' ? 'payment-observed' :
          ['underpaid', 'overpaid', 'wrong-network', 'malformed'].includes(scenario) ? 'disputed' : result.state;
        assert.equal(result.state, expected, `${currency} ${scenario} state`);
        if (scenario === 'duplicate') {
          const eventsBefore = result.events.length;
          const duplicated = await fixture.machine.reconcile({ trade_id: id });
          assert.equal(duplicated.state, 'settled');
          assert.equal(duplicated.duplicated, true);
          assert.equal(duplicated.events.length, eventsBefore, 'replayed receipt adds no journal credit');
        }
        if (['underpaid', 'overpaid', 'wrong-network', 'malformed'].includes(scenario)) assert.notEqual(result.state, 'settled');
      }
    }
    const status = await fixture.machine.status({ trade_id: id });
    if (['underpaid', 'overpaid', 'wrong-network', 'malformed', 'rpc-uncertain', 'late-payment', 'cancelled'].includes(scenario) && status.state === 'settled') invalidSettled++;
    const evidence = await fixture.machine.verifyJournal();
    assert.equal(evidence.valid, true);
    counts[scenario]++;
  }
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 50);
  perCurrency[currency] = counts;
}

assert.equal(fixtureCount, 150);
assert.equal(invalidSettled, 0);

// Every local journal remains explicit that a Nostr identity does not prove wallet-account control.
const identityBinding = { cases: 0, ownership_claims_verified: 0, unverified_label_cases: 0 };
for (let index = 0; index < 30; index++) {
  const fixture = createFixture('BTC');
  const offer = await fixture.machine.createOffer({ trade_id: (index + 1000).toString(16).padStart(32, '0'), currency: 'BTC', amount_atomic: '1',
    seller_pubkey: fixture.seller.pubkey, buyer_pubkey: fixture.buyer.pubkey, terms: `wallet claim ${index}`, expires_at: BASE + 100 });
  const policy = fixture.machine.policy();
  const stored = await fixture.machine.status({ trade_id: offer.trade_id });
  assert.equal(policy.wallet_identity_binding, 'unverified-claim');
  assert.equal(Object.hasOwn(stored, 'wallet_owner_pubkey'), false);
  identityBinding.cases++;
  identityBinding.unverified_label_cases++;
}
assert.equal(identityBinding.cases, 30);

// Reorgs reopen the state without claiming the prior observation remains settled.
{
  const fixture = createFixture('BTC');
  const offer = await createAccepted(fixture, 'BTC', 2000);
  fixture.payment = paymentFor('BTC', offer);
  assert.equal((await fixture.machine.reconcile({ trade_id: offer.trade_id })).state, 'settled');
  fixture.payment = null;
  assert.equal((await fixture.machine.reconcile({ trade_id: offer.trade_id })).state, 'payment-reorged');
  assert.equal((await fixture.machine.verifyJournal()).valid, true);
}

// One invoice address cannot be rebound to a second offer, even if a broken wallet adapter repeats it.
{
  const fixture = createFixture('BTC');
  const first = await createAccepted(fixture, 'BTC', 3000);
  const sharedPayment = paymentFor('BTC', first);
  fixture.payment = sharedPayment;
  assert.equal((await fixture.machine.reconcile({ trade_id: first.trade_id })).state, 'settled');
  const secondId = '0'.repeat(31) + '2';
  fixture.ledger.createAddress = async () => first.destination;
  await assert.rejects(fixture.machine.createOffer({ trade_id: secondId, currency: 'BTC', amount_atomic: '10',
    seller_pubkey: fixture.seller.pubkey, buyer_pubkey: fixture.buyer.pubkey, terms: 'second offer', expires_at: BASE + 100 }), /address-reused/);
}

// Rejected participant signatures never advance a trade.
{
  const fixture = createFixture('BTC');
  const offer = await fixture.machine.createOffer({ trade_id: 'f'.repeat(32), currency: 'BTC', amount_atomic: '1',
    seller_pubkey: fixture.seller.pubkey, buyer_pubkey: fixture.buyer.pubkey, terms: 'auth case', expires_at: BASE + 100 });
  await assert.rejects(fixture.machine.accept({ trade_id: offer.trade_id, actor_pubkey: fixture.buyer.pubkey, authorization: 'invalid' }), /authentication-failed/);
  assert.equal((await fixture.machine.status({ trade_id: offer.trade_id })).state, 'offer');
}

// Each field listed by the gate is changed ten times after signing; all 60 tampering attempts fail closed.
const tamperCounts = { txid: 0, amount: 0, destination: 0, network: 0, offer_hash: 0, journal: 0 };
for (const field of Object.keys(tamperCounts)) for (let repeat = 0; repeat < 10; repeat++) {
  const fixture = createFixture('BTC');
  const offer = await createAccepted(fixture, 'BTC', 4000 + repeat);
  fixture.payment = paymentFor('BTC', offer);
  await fixture.machine.reconcile({ trade_id: offer.trade_id });
  const changed = fixture.journal;
  const trade = changed.trades[offer.trade_id];
  if (field === 'txid') trade.payment.txid = HASH(`${field}:${repeat}`);
  if (field === 'amount') trade.amount_atomic = String(11 + repeat);
  if (field === 'destination') trade.destination = `changed-destination-${repeat}`;
  if (field === 'network') trade.network = 'mainnet';
  if (field === 'offer_hash') trade.terms_sha256 = HASH(`${field}:${repeat}`);
  if (field === 'journal') trade.events[0].hash = HASH(`${field}:${repeat}`);
  const corruptedMachine = createTradeStateMachine({
    adapters: { BTC: { ledger: fixture.ledger, network: 'regtest', minConfirmations: 1 } },
    localIdentityPubkey: fixture.seller.pubkey,
    signer: { pubkey: fixture.observer.pubkey, sign: async value => signText(fixture.observer.privateKey, value) },
    verifyEvidence: verifySigned, authorize: async () => true,
    loadJournal: async () => structuredClone(changed), saveJournal: async value => { Object.assign(changed, value); }, now: () => BASE
  });
  await assert.rejects(corruptedMachine.status({ trade_id: offer.trade_id }), /trade-journal-/);
  tamperCounts[field]++;
}

assert.deepEqual(tamperCounts, { txid: 10, amount: 10, destination: 10, network: 10, offer_hash: 10, journal: 10 });
const report = {
  gate: 'G7-trade-state-machine', result: 'PASS', fixture_seed: 'property-g7-fixed-v1',
  state_fixtures_total: fixtureCount, state_fixtures_per_currency: perCurrency, invalid_fixtures_settled: invalidSettled,
  identity_binding: identityBinding, tampering: { ...tamperCounts, total: Object.values(tamperCounts).reduce((sum, count) => sum + count, 0), rejected: 60 },
  additional_checks: { btc_reorg_rolls_back: true, wallet_address_cannot_be_reused_for_another_offer: true, rejected_participant_auth_does_not_advance: true,
    mainnet_enabled: false, external_endpoints: 0 },
  signature_material: 'not-recorded'
};
const output = process.argv[2];
if (output) {
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}
process.stdout.write(`${JSON.stringify(report)}\n`);
