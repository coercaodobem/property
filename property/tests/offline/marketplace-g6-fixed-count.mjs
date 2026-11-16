import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['vendor/nostr-tools-2.25.2.bundle.js', 'protocol-contract.js', 'nano.js', 'money.js', 'marketplace.js']) {
  vm.runInContext(await readFile(new URL(`../../web/${file}`, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const { PropertyMoney: money, PropertyMarketplace: market, PropertyProtocol: protocol, NostrTools: nostr } = context;
const currencies = Object.keys(money.CURRENCIES).sort();
const baseTime = 1_800_000_000;
const nowBeforeExpiry = baseTime + 40;
const nowAfterExpiry = baseTime + 101;
const secrets = [1, 2, 3].map(value => {
  const secret = new Uint8Array(32); secret[31] = value; return secret;
});
const sellerPub = nostr.getPublicKey(secrets[0]);
const unrelatedPub = nostr.getPublicKey(secrets[1]);

function sign(kind, content, createdAt, tags, secret) {
  context.g6TemplateJson = JSON.stringify({ kind, content, created_at: createdAt, tags });
  context.g6SecretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(g6TemplateJson), Uint8Array.from(g6SecretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}
function dataFor({ id, currency, atomic, seller = sellerPub, name = `offer-${id}`, expiresAt = null, relayHints = [] }) {
  return market.makeOfferData({ id, stallId: `stall-${currency}`, name, terms: `Terms for ${name}`,
    offerType: id.endsWith('-service') ? 'service' : 'item', images: [], currency, atomic,
    sellerPubkey: seller, paymentRail: market.PAYMENT_RAILS[currency], relayHints, expiresAt });
}
function product({ id, currency, atomic = '1', createdAt, secret = secrets[0], seller = sellerPub,
  name, expiresAt = null, version = market.OFFER_SCHEMA, relayHints = [] }) {
  const data = { ...dataFor({ id, currency, atomic, seller, name: name || `offer-${id}`, expiresAt, relayHints }), schema: version };
  if (version !== market.OFFER_SCHEMA) delete data.schema;
  const tags = [['d', id]];
  if (expiresAt !== null) tags.push(['expiration', String(expiresAt)]);
  return sign(30018, protocol.canonicalJson(data), createdAt, tags, secret);
}
function active(events, now) { return market.selectActiveProducts(events, nostr.verifyEvent, now); }

const amountCounts = {};
for (const currency of currencies) {
  const maximum = BigInt(money.CURRENCIES[currency].max);
  const valid = [0n, maximum, maximum - 1n, 1n];
  for (let i = 1; valid.length < 50; i++) valid.push((maximum * BigInt(i)) / 97n);
  for (const atomic of valid) {
    const exact = atomic.toString();
    assert.equal(money.validateAtomic(exact, currency), exact);
    const decimal = money.fromAtomic(exact, currency);
    assert.equal(money.toAtomic(decimal, currency), exact, `${currency} exact amount round-trip ${exact}`);
  }
  const invalid = ['-1', '00', '01', '1.0', '1e3', '', 'NaN', '+1', ' ', '１２'];
  for (let i = 0; invalid.length < 50; i++) invalid.push((maximum + BigInt(i + 1)).toString());
  for (const atomic of invalid) assert.throws(() => money.validateAtomic(atomic, currency), undefined, `${currency} rejects ${atomic}`);
  const extraPrecision = `0.${'0'.repeat(money.CURRENCIES[currency].decimals)}1`;
  assert.throws(() => money.toAtomic(extraPrecision, currency), undefined, `${currency} rejects one extra decimal place`);
  amountCounts[currency] = { total: valid.length + invalid.length, valid_round_trips: valid.length,
    rejected_atomic_values: invalid.length, maximum: maximum.toString(), zero_supported_as_free_offer: money.fromAtomic('0', currency) === '0' };
}

const schemaExample = dataFor({ id: 'g6-schema-service', currency: 'XMR', atomic: '1' });
assert.equal(schemaExample.schema, 'property-marketplace-offer/v1');
assert.equal(schemaExample.offer_type, 'service');
assert.equal(schemaExample.payment_rail, 'monero-onchain');
assert.equal(schemaExample.seller_pubkey, sellerPub);
assert.equal(schemaExample.contact_event, null);
assert.throws(() => dataFor({ id: 'g6-unsafe-relay-hint', currency: 'BTC', atomic: '1', relayHints: ['ws://127.0.0.1:9'] }));
assert.equal(dataFor({ id: 'g6-max-xno-raw', currency: 'XNO', atomic: money.CURRENCIES.XNO.max }).price_atomic,
  money.CURRENCIES.XNO.max, 'XNO maximum raw remains exact even though its NIP-15 number is only a display compatibility projection');
const validVersioned = product({ id: 'g6-valid-schema', currency: 'BTC', atomic: '1', createdAt: baseTime + 1 });
assert.equal(active([validVersioned], baseTime + 2).length, 1, 'versioned Property offer is accepted');
const searchableOffers = [
  product({ id: 'g6-filter-btc-expensive', currency: 'BTC', atomic: '200000000', createdAt: baseTime + 3, name: 'Café lamp' }),
  product({ id: 'g6-filter-btc-cheap-service', currency: 'BTC', atomic: '1', createdAt: baseTime + 2, name: 'Garden lamp service' }),
  product({ id: 'g6-filter-xmr', currency: 'XMR', atomic: '1000000000000', createdAt: baseTime + 4, name: 'Tea set' }),
  product({ id: 'g6-filter-xno-service', currency: 'XNO', atomic: '1', createdAt: baseTime + 5, name: 'Lamp repair' }),
  product({ id: 'g6-filter-xmr-service', currency: 'XMR', atomic: '2', createdAt: baseTime + 1, name: 'Garden repair service' })
];
const searchable = active(searchableOffers, baseTime + 10);
assert.equal(searchable.length, 5, 'signed search fixtures are accepted as public offers');
const filteredIds = options => JSON.parse(JSON.stringify(market.filterProducts(searchable, options).map(row => row.data.id)));
assert.deepEqual(filteredIds({ query: 'cafe' }),
  ['g6-filter-btc-expensive'], 'text search folds accents and searches locally');
assert.deepEqual(filteredIds({ currency: 'BTC' }),
  ['g6-filter-btc-expensive', 'g6-filter-btc-cheap-service'], 'currency filter keeps only the selected currency');
assert.deepEqual(filteredIds({ offerType: 'service' }),
  ['g6-filter-xno-service', 'g6-filter-btc-cheap-service', 'g6-filter-xmr-service'], 'type filter returns only services');
assert.deepEqual(filteredIds({ currency: 'BTC', sort: 'price-asc' }),
  ['g6-filter-btc-cheap-service', 'g6-filter-btc-expensive'], 'price sort uses exact integer atomic amounts');
assert.deepEqual(filteredIds({ currency: 'BTC', sort: 'price-desc' }),
  ['g6-filter-btc-expensive', 'g6-filter-btc-cheap-service'], 'descending price sort reverses exact atomic order');
assert.deepEqual(filteredIds({ currency: 'all', sort: 'price-asc' }),
  JSON.parse(JSON.stringify(searchable.map(row => row.data.id))), 'price sort falls back to newest when currency units are mixed');
assert.equal(market.filterProducts(searchable, { query: 'not present' }).length, 0, 'empty local result is represented by an empty list');
assert.equal(market.filterProducts(searchable, { currency: 'invalid', offerType: 'invalid' }).length, 5,
  'unknown filter values do not hide valid offers');
const unknownSchemaData = { ...JSON.parse(validVersioned.content), schema: 'property-marketplace-offer/v999' };
const unknownSchema = sign(30018, protocol.canonicalJson(unknownSchemaData), baseTime + 1, [['d', 'g6-valid-schema']], secrets[0]);
assert.equal(active([unknownSchema], baseTime + 2).length, 0, 'unknown offer schema is rejected');
const mismatchedAuthorData = { ...JSON.parse(validVersioned.content), seller_pubkey: unrelatedPub };
const mismatchedAuthor = sign(30018, protocol.canonicalJson(mismatchedAuthorData), baseTime + 1, [['d', 'g6-valid-schema']], secrets[0]);
assert.equal(active([mismatchedAuthor], baseTime + 2).length, 0, 'seller key must match signed event author');
const mismatchedRailData = { ...JSON.parse(validVersioned.content), payment_rail: 'nano-direct' };
const mismatchedRail = sign(30018, protocol.canonicalJson(mismatchedRailData), baseTime + 1, [['d', 'g6-valid-schema']], secrets[0]);
assert.equal(active([mismatchedRail], baseTime + 2).length, 0, 'declared rail must match currency');
const mismatchedExpiryData = { ...JSON.parse(validVersioned.content), expires_at: baseTime + 100 };
const mismatchedExpiry = sign(30018, protocol.canonicalJson(mismatchedExpiryData), baseTime + 1, [['d', 'g6-valid-schema']], secrets[0]);
assert.equal(active([mismatchedExpiry], baseTime + 2).length, 0, 'schema expiry must match its single Nostr expiration tag');
const legacyOffer = product({ id: 'g6-legacy-display-only', currency: 'XNO', atomic: '1', createdAt: baseTime + 1, version: 'legacy' });
assert.equal(active([legacyOffer], baseTime + 2).length, 1, 'versionless exact-amount offer remains in the explicit read-only compatibility path');
const ambiguousLegacyData = { ...JSON.parse(legacyOffer.content), price_atomic: undefined, price_raw: undefined };
delete ambiguousLegacyData.price_atomic; delete ambiguousLegacyData.price_raw;
const ambiguousLegacy = sign(30018, protocol.canonicalJson(ambiguousLegacyData), baseTime + 1, [['d', 'g6-legacy-display-only']], secrets[0]);
assert.equal(active([ambiguousLegacy], baseTime + 2).length, 0, 'versionless number-only offer is not reinterpreted');

const lifecycleEvents = [];
const lifecycleCounts = {};
for (const currency of currencies) {
  const base = [];
  const edits = [];
  const withdrawals = [];
  for (let index = 0; index < 20; index++) {
    const id = `g6-${currency}-${String(index).padStart(2, '0')}`;
    const expiresAt = index >= 10 ? baseTime + 100 : null;
    const original = product({ id, currency, atomic: '1', createdAt: baseTime + index, expiresAt });
    base.push(original); lifecycleEvents.push(original);
    if (index < 10) {
      const edited = product({ id, currency, atomic: '2', createdAt: baseTime + 25, name: `${id}-edited` });
      edits.push(edited); lifecycleEvents.push(edited);
      const request = market.makeProductDeletion(edited);
      withdrawals.push(sign(request.kind, request.content, baseTime + 31, request.tags, secrets[0]));
      lifecycleEvents.push(withdrawals.at(-1));
    }
  }
  lifecycleCounts[currency] = { created: base.length, edited: edits.length, withdrawn: withdrawals.length, expiring: 10 };
}
const unrelatedId = 'g6-unrelated-author-offer';
const unrelated = product({ id: unrelatedId, currency: 'BTC', atomic: '3', createdAt: baseTime + 2,
  secret: secrets[1], seller: unrelatedPub, name: 'unrelated survives' });
lifecycleEvents.push(unrelated);
assert.equal(lifecycleEvents.length, 121);

const relayStores = Array.from({ length: 5 }, (_, index) => {
  const order = [...lifecycleEvents];
  if (index === 1) order.reverse();
  else if (index === 2) order.sort((left, right) => left.id.localeCompare(right.id));
  else if (index === 3) order.sort((left, right) => left.created_at - right.created_at || right.id.localeCompare(left.id));
  else if (index === 4) order.splice(0, 0, ...order.slice(0, 12));
  return order;
});
const beforeExpiryStates = relayStores.map(store => active(store, nowBeforeExpiry).map(event => event.id).sort());
assert.ok(beforeExpiryStates.every(state => JSON.stringify(state) === JSON.stringify(beforeExpiryStates[0])), 'five relay views converge before expiry');
assert.equal(beforeExpiryStates[0].length, 31, '10 unexpired, non-withdrawn offers per currency plus one unrelated offer remain');
assert.ok(beforeExpiryStates[0].includes(unrelated.id), 'an unrelated author event remains after targeted deletions');
const afterExpiryStates = relayStores.map(store => active(store, nowAfterExpiry).map(event => event.id).sort());
assert.ok(afterExpiryStates.every(state => JSON.stringify(state) === JSON.stringify(afterExpiryStates[0])), 'five relay views converge after expiry');
assert.equal(JSON.stringify(afterExpiryStates[0]), JSON.stringify([unrelated.id]), 'expiry and NIP-09 withdrawals remove only targeted active offers');

let sameAuthorConflicts = 0;
for (let index = 0; index < 20; index++) {
  const id = `g6-conflict-${String(index).padStart(2, '0')}`;
  const left = product({ id, currency: 'BTC', atomic: '1', createdAt: baseTime + 200, name: `${id}-left` });
  const right = product({ id, currency: 'BTC', atomic: '2', createdAt: baseTime + 200, name: `${id}-right` });
  const expected = [left, right].sort((a, b) => a.id.localeCompare(b.id))[0];
  for (const order of [[left, right], [right, left], [left, right, left]]) assert.equal(active(order, baseTime + 205)[0].id, expected.id);
  sameAuthorConflicts++;
}

let crossRelayOutOfOrder = 0;
for (let index = 0; index < 20; index++) {
  const id = `g6-out-of-order-${String(index).padStart(2, '0')}`;
  const first = product({ id, currency: 'XMR', atomic: '1', createdAt: baseTime + 300, name: `${id}-first` });
  const latest = product({ id, currency: 'XMR', atomic: '3', createdAt: baseTime + 302, name: `${id}-latest` });
  const middle = product({ id, currency: 'XMR', atomic: '2', createdAt: baseTime + 301, name: `${id}-middle` });
  const stores = [[first, latest, middle], [middle, first, latest], [latest, middle, first], [first, middle, latest], [middle, latest, first]];
  const selected = stores.map(store => active(store, baseTime + 305));
  assert.ok(selected.every(rows => rows.length === 1 && rows[0].id === latest.id), `update order converges for ${id}`);
  crossRelayOutOfOrder++;
}

const report = {
  gate: 'G6', suite: 'marketplace-g6-fixed-count', result: 'PASS',
  network: 'signed synthetic fixtures; local reducer; no relay, wallet, or public network access',
  amount_vectors: amountCounts,
  local_search: { signed_offers: searchableOffers.length, assertions: 8, accent_folding: true,
    price_ordering: 'integer atomic amounts; only one selected currency', network_access: false },
  lifecycle: { per_currency: lifecycleCounts, synthetic_offer_events: lifecycleEvents.length,
    relays_simulated: relayStores.length, active_before_expiry: beforeExpiryStates[0].length,
    active_after_expiry: afterExpiryStates[0].length, unrelated_offer_preserved: true,
    all_five_states_converged: true },
  conflicts: { same_author_equal_time: sameAuthorConflicts, cross_relay_out_of_order: crossRelayOutOfOrder,
    deterministic_rule: 'newer created_at; on tie lexicographically lowest event id' }
};
console.log(JSON.stringify(report, null, 2));
