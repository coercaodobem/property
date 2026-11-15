import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  EVENT_FAMILIES, PROTOCOL_VERSIONS, ProtocolContractError, canonicalJson, negotiateProtocolVersions,
  nostrEventId, parseBoundedJson, parseEventFamily, reduceNostrEventBatch, serializeNostrEventForId,
  validateAtomicAmount,
} from '../agent/protocol-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/evidence/product-completion/G1/fixed-run-01'));
const NOW = 2_000_000_000;
const familyIds = Object.keys(EVENT_FAMILIES);
const NOSTR_SOURCE = await readFile(path.join(ROOT, 'web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8');
const webContractSource = await readFile(path.join(ROOT, 'web/protocol-contract.js'), 'utf8');
const matrix = JSON.parse(await readFile(path.join(ROOT, 'docs/protocol-versions.json'), 'utf8'));
const nostrContext = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
nostrContext.window = nostrContext;
vm.createContext(nostrContext);
vm.runInContext(NOSTR_SOURCE, nostrContext, { timeout: 5_000 });
const nostr = nostrContext.NostrTools;
assert.ok(nostr?.finalizeEvent && nostr?.verifyEvent, 'locally bundled Nostr signer/verifier is required');
const verifyEvent = event => {
  nostrContext.eventJson = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(eventJson))', nostrContext, { timeout: 5_000 });
};
const browserContext = { TextEncoder, TextDecoder, URL };
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
vm.runInContext(webContractSource, browserContext, { timeout: 5_000 });
assert.equal(typeof browserContext.PropertyProtocol?.canonicalJson, 'function');
browserContext.verifyEvent = verifyEvent;
vectorError(() => canonicalJson(Number.POSITIVE_INFINITY), 'protocol-json-');
vectorError(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1), 'protocol-json-');
vectorError(() => canonicalJson({ omitted: undefined }), 'protocol-json-');

function publicKey(secret) {
  nostrContext.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.getPublicKey(Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', nostrContext, { timeout: 5_000 });
}

const seeds = Object.fromEntries(familyIds.map(family => [family, `property-g1-fixed-seed/${family}/v1`]));
const secrets = new Map();
for (const family of familyIds) {
  let secret;
  for (let attempt = 0; attempt < 32; attempt++) {
    secret = createHash('sha256').update(`${seeds[family]}/${attempt}`).digest();
    try { publicKey(secret); break; } catch { secret = null; }
  }
  assert.ok(secret, `fixed synthetic key seed must map to a valid key for ${family}`);
  secrets.set(family, secret);
}
const otherSecret = createHash('sha256').update('property-g1-fixed-seed/other/v1').digest();
const otherPubkey = publicKey(otherSecret);

function sign(kind, content, tags, createdAt, secret) {
  nostrContext.templateJson = JSON.stringify({ kind, content, tags, created_at: createdAt });
  nostrContext.secretHex = Buffer.from(secret).toString('hex');
  const event = vm.runInContext(
    'NostrTools.finalizeEvent(JSON.parse(templateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))',
    nostrContext,
    { timeout: 5_000 },
  );
  return JSON.parse(JSON.stringify(event));
}

function fixture(family, index, options = {}) {
  const rule = EVENT_FAMILIES[family];
  const secret = options.secret || secrets.get(family);
  const pubkey = publicKey(secret);
  const kind = options.kind ?? (family === 'marketplace_offer' ? 30018 : family === 'campaign_sponsorship' ? 30079 : family === 'relay_discovery' ? 10050 : rule.kinds[0]);
  let tags = options.tags;
  if (!tags) {
    if (family === 'identity_claim') tags = [['i', `github:synthetic-${index}`, '0'.repeat(20)]];
    else if (family === 'private_message' || family === 'trade_state') tags = [['p', otherPubkey]];
    else if (family === 'marketplace_offer') tags = [['d', `g1-product-${index}`]];
    else if (family === 'campaign_sponsorship') tags = [['t', 'property-campaign-offer-v1'], ['d', `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`]];
    else if (family === 'relay_discovery') tags = [['relay', `wss://relay-${index}.invalid`]];
    else tags = [];
  }
  let content = options.content;
  if (content === undefined) {
    if (family === 'identity_claim' || family === 'relay_discovery') content = '';
    else if (family === 'private_message' || family === 'trade_state') content = 'ciphertext-fixture';
    else if (family === 'public_note') content = `Public note vector ${index}`;
    else if (family === 'marketplace_offer') content = canonicalJson({ id: `g1-product-${index}`, stall_id: 'g1-stall', name: 'Fixture', currency: 'BTC', price: 1, price_atomic: '1' });
    else content = canonicalJson({ schema: 'property-campaign-offer/v1', amount_atomic: '1', currency: 'BTC' });
  }
  const createdAt = options.createdAt ?? NOW - 100 + index;
  return sign(kind, content, tags, createdAt, secret);
}

function vectorError(callback, codePrefix = '') {
  let error;
  try { callback(); } catch (caught) { error = caught; }
  assert.ok(error instanceof ProtocolContractError, `expected a typed protocol rejection, received ${error?.constructor?.name || 'no error'}`);
  assert.equal(typeof error.code, 'string');
  if (codePrefix) assert.ok(error.code.startsWith(codePrefix), `unexpected rejection code ${error.code}`);
  return error.code;
}

function malformedEvent(family, variant, index) {
  const baseline = fixture(family, index);
  if (variant === 0) return '{"kind":';
  if (variant === 1) return '{"x":1,"x":2}';
  if (variant === 2) return 'null';
  if (variant === 3) return '[]';
  if (variant === 4) return JSON.stringify({ ...baseline, id: '' });
  if (variant === 5) return { ...baseline, kind: 65_000 };
  if (variant === 6) return { ...baseline, tags: Array.from({ length: EVENT_FAMILIES[family].maxTags + 1 }, () => ['t', 'x']) };
  if (variant === 7) return { ...baseline, tags: [['relay', 17]] };
  if (variant === 8) return { ...baseline, created_at: NOW + 301 };
  return { ...baseline, tags: [...baseline.tags, ['property-crit', 'unknown-critical'], ['unknown-critical', 'x']] };
}

const vectors = [];
const parserRecords = [];
const reducerRecords = [];
for (const family of familyIds) {
  const protocolList = PROTOCOL_VERSIONS[family];
  const familyVectors = [];
  for (let index = 0; index < 100; index++) {
    const payload = { z: index, family, amount_atomic: String(index + 1), nested: { z: true, a: ['x', index] } };
    const encodedPayload = canonicalJson(payload, 4_096);
    browserContext.payloadJson = JSON.stringify(payload);
    const browserEncoded = vm.runInContext('PropertyProtocol.canonicalJson(JSON.parse(payloadJson), 4096)', browserContext, { timeout: 1_000 });
    assert.equal(browserEncoded, encodedPayload, 'browser and agent canonical serializers must match byte for byte');
    const marketplaceDisplay = { price: 0.25, price_atomic: '25', currency: 'BTC' };
    assert.equal(canonicalJson(marketplaceDisplay), '{"currency":"BTC","price":0.25,"price_atomic":"25"}', 'canonical NIP-15 display decimals retain exact amount in the atomic string');
    browserContext.payloadJson = JSON.stringify(marketplaceDisplay);
    assert.equal(vm.runInContext('PropertyProtocol.canonicalJson(JSON.parse(payloadJson),4096)', browserContext, { timeout: 1_000 }), canonicalJson(marketplaceDisplay));
    assert.deepEqual(parseBoundedJson(encodedPayload, 4_096), payload, 'canonical payload round-trips');

    const peerOffer = index < 50
      ? { supported: [...protocolList], critical: [protocolList[0]] }
      : { supported: [`${protocolList[0]}-unknown`], critical: [`${protocolList[0]}-unknown`] };
    if (index < 50) {
      const negotiated = negotiateProtocolVersions(family, peerOffer);
      assert.equal(negotiated.selected, protocolList[0]);
    } else {
      vectorError(() => negotiateProtocolVersions(family, peerOffer), 'protocol-version-');
    }

    const valid = fixture(family, index);
    assert.equal(nostrEventId(valid), valid.id, 'Property NIP-01 serializer must match the bundled Nostr event hash');
    assert.equal(serializeNostrEventForId(valid), JSON.stringify([0, valid.pubkey, valid.created_at, valid.kind, valid.tags, valid.content]));
    const action = index < 50 ? 'valid-signed-event' : [
      'bad-signature', 'wrong-kind', 'oversized-content', 'unknown-critical-tag', 'too-many-tags', 'malformed-tag', 'future-time',
    ][(index - 50) % 7];
    if (index < 50) {
      const parsed = parseEventFamily(valid, family, verifyEvent, NOW);
      assert.equal(parsed.id, valid.id);
      browserContext.eventJson = JSON.stringify(valid);
      browserContext.family = family;
      browserContext.nowSeconds = NOW;
      assert.equal(vm.runInContext('PropertyProtocol.validateEventFamily(JSON.parse(eventJson), family, verifyEvent, nowSeconds).id', browserContext, { timeout: 1_000 }), valid.id,
        'the browser parser accepts the same signed event as the agent parser');
      if (index === 0) {
        const withUnknownNoncritical = sign(valid.kind, valid.content, [...valid.tags, ['future-unmarked-tag', 'preserved']], valid.created_at, secrets.get(family));
        assert.equal(parseEventFamily(withUnknownNoncritical, family, verifyEvent, NOW).tags.at(-1)[0], 'future-unmarked-tag');
        browserContext.eventJson = JSON.stringify(withUnknownNoncritical);
        assert.equal(vm.runInContext('PropertyProtocol.validateEventFamily(JSON.parse(eventJson), family, verifyEvent, nowSeconds).tags.at(-1)[0]', browserContext, { timeout: 1_000 }), 'future-unmarked-tag');
      }
    } else {
      let invalid = valid;
      if (action === 'bad-signature') invalid = { ...valid, sig: `${valid.sig[0] === '0' ? '1' : '0'}${valid.sig.slice(1)}` };
      if (action === 'wrong-kind') invalid = fixture(family, index, { kind: 65_000 });
      if (action === 'oversized-content') invalid = fixture(family, index, { content: 'x'.repeat(EVENT_FAMILIES[family].maxContentBytes + 1) });
      if (action === 'unknown-critical-tag') invalid = fixture(family, index, { tags: [...valid.tags, ['property-crit', 'unknown-critical'], ['unknown-critical', 'x']] });
      if (action === 'too-many-tags') invalid = { ...valid, tags: Array.from({ length: EVENT_FAMILIES[family].maxTags + 1 }, () => ['t', 'x']) };
      if (action === 'malformed-tag') invalid = { ...valid, tags: [['relay', 17]] };
      if (action === 'future-time') invalid = fixture(family, index, { createdAt: NOW + 301 });
      const before = canonicalJson(invalid, 262_144);
      vectorError(() => parseEventFamily(invalid, family, verifyEvent, NOW));
      assert.equal(canonicalJson(invalid, 262_144), before, 'rejected inputs do not mutate state or the event');
      browserContext.eventJson = JSON.stringify(invalid);
      let browserError;
      try { vm.runInContext('PropertyProtocol.validateEventFamily(JSON.parse(eventJson), family, verifyEvent, nowSeconds)', browserContext, { timeout: 1_000 }); }
      catch (error) { browserError = error; }
      assert.equal(browserError?.name, 'ProtocolContractError', `${family}: browser parser returns a typed rejection`);
      assert.equal(typeof browserError?.code, 'string');
      assert.equal(canonicalJson(invalid, 262_144), before, 'browser rejection does not mutate the event');
    }
    familyVectors.push({ index, action, event_id: valid.id, fixture_sha256: createHash('sha256').update(`${family}/${index}/${action}`).digest('hex') });
  }
  assert.equal(familyVectors.length, 100);
  vectors.push({ family, count: familyVectors.length, valid: 50, invalid: 50, cases: familyVectors });

  const malformedCounts = new Map();
  for (let index = 0; index < 100; index++) {
    const raw = malformedEvent(family, index % 10, index);
    const code = vectorError(() => parseEventFamily(raw, family, verifyEvent, NOW));
    assert.ok(!code.includes('g1-secret-do-not-echo'));
    malformedCounts.set(code, (malformedCounts.get(code) || 0) + 1);
  }
  parserRecords.push({ family, malformed_inputs: 100, rejection_codes: Object.fromEntries([...malformedCounts].sort(([a], [b]) => a.localeCompare(b))) });

  const base = [fixture(family, 1), fixture(family, 2), fixture(family, 3, { secret: otherSecret })];
  const expected = canonicalJson(reduceNostrEventBatch(base));
  const duplicateReplay = canonicalJson(reduceNostrEventBatch([...base, ...Array.from({ length: 50 }, () => base[1])]));
  const reorderedReplay = canonicalJson(reduceNostrEventBatch(Array.from({ length: 50 }, () => [...base].reverse()).flat()));
  assert.equal(duplicateReplay, expected, `${family}: 50 duplicate copies produce byte-identical reduced state`);
  assert.equal(reorderedReplay, expected, `${family}: 50 out-of-order batches produce byte-identical reduced state`);
  const expectedIds = JSON.parse(expected).map(event => event.id);
  reducerRecords.push({ family, duplicate_copies: 50, reordered_batches: 50, unique_input_events: 3, final_state_sha256: createHash('sha256').update(expected).digest('hex'), result_ids: expectedIds });
}

const atomicRecords = [];
const atomicBoundaries = {
  BTC: ['1', '2100000000000000'],
  XMR: ['1', '18446744073709551615'],
  XNO: ['1', '340282366920938463463374607431768211455'],
};
for (const [currency, [minimum, maximum]] of Object.entries(atomicBoundaries)) {
  assert.equal(validateAtomicAmount(currency, minimum), 1n);
  assert.equal(validateAtomicAmount(currency, maximum).toString(), maximum);
  for (const invalid of ['0', '00', '01', '-1', '1.0', '', (BigInt(maximum) + 1n).toString()]) {
    vectorError(() => validateAtomicAmount(currency, invalid), 'protocol-amount-');
  }
  vectorError(() => validateAtomicAmount(currency.toLowerCase(), minimum), 'protocol-amount-');
  atomicRecords.push({ currency, min: minimum, max: maximum, rejected_values: 8 });
}
for (const invalid of [1, 1.5, null, '1 BTC', '1e3']) vectorError(() => validateAtomicAmount('BTC', invalid), 'protocol-amount-');

assert.equal(matrix.contract, 'property-protocol-contract/v1');
assert.deepEqual(matrix.event_families.map(item => item.id).sort(), [...familyIds].sort(), 'JSON matrix and executable registry cover identical families');
for (const row of matrix.event_families) {
  assert.deepEqual(row.protocols, PROTOCOL_VERSIONS[row.id]);
  assert.deepEqual(row.kinds, EVENT_FAMILIES[row.id].kinds);
  assert.equal(row.content_max_bytes, EVENT_FAMILIES[row.id].maxContentBytes);
  assert.equal(row.tags_max, EVENT_FAMILIES[row.id].maxTags);
}

const report = {
  schema_version: 1,
  gate: 'G1',
  result: 'PASS',
  host_scope: 'Ubuntu Linux x86_64 only',
  network_scope: 'offline; local source files and synthetic event fixtures only',
  seed_labels: seeds,
  counts: {
    event_families: familyIds.length,
    vectors_per_family: 100,
    valid_vectors_per_family: 50,
    invalid_vectors_per_family: 50,
    total_event_vectors: vectors.length * 100,
    malformed_inputs_per_family_parser: 100,
    total_malformed_inputs: parserRecords.length * 100,
    duplicate_copies_per_family: 50,
    reordered_batches_per_family: 50,
    atomic_currency_boundaries: atomicRecords.length,
  },
  serializer_and_negotiation: 'PASS; browser and agent canonical JSON outputs match; local protocol registry and JSON matrix match',
  event_vectors: vectors,
  malformed_parsers: parserRecords,
  replay_reduction: reducerRecords,
  atomic_boundaries: atomicRecords,
  security_assertions: {
    unknown_critical_tags_and_versions_rejected: true,
    unknown_unmarked_tags_preserved: true,
    malformed_inputs_return_typed_codes: true,
    rejected_event_objects_unchanged: true,
    no_network_calls: true,
    no_private_keys_in_report: true,
  },
};
await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
await writeFile(path.join(OUTPUT, 'protocol-contract-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ gate: report.gate, result: report.result, counts: report.counts }, null, 2)}\n`);
