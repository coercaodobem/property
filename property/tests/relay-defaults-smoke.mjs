import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, 'web', name), 'utf8');
const context = { console, crypto: webcrypto, URL, TextEncoder, TextDecoder, RangeError, TypeError, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await read('vendor/nostr-tools-2.25.2.bundle.js'), context, { timeout: 5000 });
vm.runInContext(await read('relay-defaults.js'), context, { timeout: 5000 });
const defaults = context.PropertyRelayDefaults;
const nostr = context.NostrTools;
const bundledTime = defaults.BUNDLED_EVENT.created_at + 20;

const bundled = defaults.defaultState(nostr.verifyEvent, bundledTime);
assert.equal(bundled.status, 'valid', 'the exact embedded default event verifies with the bundled Nostr implementation');
assert.equal(bundled.relays.length, 6);
assert.equal(new Set(bundled.relays).size, bundled.relays.length, 'bundled relay candidates are unique');
assert.ok(bundled.relays.every(url => url.startsWith('wss://')), 'defaults use secure WebSockets');
const draws = [5, 0];
const selected = [...defaults.pick(2, max => draws.shift() % max, nostr.verifyEvent, bundledTime)];
assert.deepEqual(selected, [bundled.relays[5], bundled.relays[0]]);
assert.equal(new Set(selected).size, 2, 'random selection does not repeat a relay');
assert.equal(defaults.pick(1, () => 0, nostr.verifyEvent, bundledTime).length, 1);
assert.throws(() => defaults.pick(0, () => 0, nostr.verifyEvent, bundledTime), RangeError);
assert.throws(() => defaults.pick(7, () => 0, nostr.verifyEvent, bundledTime), RangeError);
assert.throws(() => defaults.pick(1, () => 6, nostr.verifyEvent, bundledTime), RangeError, 'random index must fit the current pool');

const initialDraws = [4, 1];
const freshInstall = defaults.initialSelection(null, max => initialDraws.shift() % max, nostr.verifyEvent, bundledTime);
assert.deepEqual([...freshInstall.values], [bundled.relays[4], bundled.relays[1]]);
assert.equal(new Set(freshInstall.values).size, 2, 'fresh install gets two unique suggestions');
assert.equal(freshInstall.autoSelected, true);
assert.equal(freshInstall.shouldPersist, true);
const savedChoice = [bundled.relays[2]];
const existingSettings = defaults.initialSelection({ values: savedChoice, autoSelected: false }, () => assert.fail('saved relays must not be replaced'), nostr.verifyEvent, bundledTime);
assert.deepEqual([...existingSettings.values], savedChoice);
assert.equal(existingSettings.autoSelected, false);
assert.equal(existingSettings.shouldPersist, false);
const emptySettings = defaults.initialSelection({ values: [], autoSelected: false }, () => 0, nostr.verifyEvent, bundledTime);
assert.deepEqual([...emptySettings.values], [], 'an explicit empty list remains an offline choice');
assert.equal(emptySettings.autoSelected, false);
assert.equal(emptySettings.shouldPersist, false);
assert.deepEqual(Array.from(defaults.initialSelection(null, () => 0, () => false, bundledTime).values), [], 'an invalid bundled signature fails closed');
assert.deepEqual(Array.from(defaults.initialSelection(null, () => 0, nostr.verifyEvent, bundledTime, [defaults.BUNDLED_EVENT.id]).values), [], 'revoked bundled defaults fail closed');
assert.equal(defaults.validateSignedList(defaults.BUNDLED_EVENT, nostr.verifyEvent,
  Number(defaults.BUNDLED_EVENT.tags.find(tag => tag[0] === 'expiration')[1]), []).status, 'stale');

const trustedSecret = nostr.generateSecretKey();
const trustedKey = nostr.getPublicKey(trustedSecret);
const otherSecret = nostr.generateSecretKey();
const now = 1_800_000_000;
function signList({ createdAt = now - 10, expiresAt = now + 1000, extraTags = [], relays = ['wss://one.example', 'wss://two.example'], secret = trustedSecret } = {}) {
  const tags = [['property-defaults', 'v1'], ['expiration', String(expiresAt)], ...relays.map(url => ['r', url]), ...extraTags];
  context.signingSecret = secret;
  context.signingPayload = JSON.stringify({ kind: 10002, created_at: createdAt, content: 'synthetic signed defaults', tags });
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(signingPayload), signingSecret)', context, { timeout: 10000 });
}
let signedListCases = 0;
const caseCounts = { valid: 0, stale: 0, revoked: 0, duplicate: 0, wrong_key: 0, critical_version: 0, malicious_url: 0, unknown_version: 0, bad_signature: 0, future: 0 };
for (let index = 0; index < 100; index++) {
  const type = ['valid', 'stale', 'revoked', 'duplicate', 'wrong_key', 'critical_version', 'malicious_url', 'unknown_version', 'bad_signature', 'future'][index % 10];
  let event;
  let revoked = [];
  if (type === 'valid') event = signList({ relays: [`wss://one-${index}.example`, `wss://two-${index}.example`] });
  else if (type === 'stale') event = signList({ createdAt: now - 1000, expiresAt: now - 1 });
  else if (type === 'revoked') { event = signList(); revoked = [event.id]; }
  else if (type === 'duplicate') event = signList({ relays: ['wss://one.example', 'wss://one.example'] });
  else if (type === 'wrong_key') event = signList({ secret: otherSecret });
  else if (type === 'critical_version') event = signList({ extraTags: [['property-defaults-critical', 'v9']] });
  else if (type === 'malicious_url') event = signList({ relays: ['wss://user:pass@one.example', 'wss://two.example'] });
  else if (type === 'unknown_version') event = signList({ extraTags: [['property-defaults', 'v9']] });
  else if (type === 'bad_signature') { event = signList(); event.sig = 'f'.repeat(128); }
  else event = signList({ createdAt: now + 301 });
  const result = defaults.validateSignedList(event, nostr.verifyEvent, now, revoked, trustedKey);
  if (type === 'valid') assert.equal(result.status, 'valid');
  else if (type === 'stale') assert.equal(result.status, 'stale');
  else if (type === 'revoked') assert.equal(result.status, 'revoked');
  else assert.equal(result.status, 'invalid', `${type} event fails closed`);
  caseCounts[type]++;
  signedListCases++;
}
assert.equal(signedListCases, 100);
assert.ok(Object.values(caseCounts).every(count => count === 10), 'all ten signed-list variants ran ten times');

const unsafe = [
  'https://relay.example', 'ws://relay.example', 'wss://user@relay.example',
  'wss://relay.example/?token=x', 'wss://relay.example/#secret', 'javascript:alert(1)',
  'wss://', 'wss://relay.example:443/path?query=1', 'wss://relay.example\n.evil', 'wss://relay.example/' + 'x'.repeat(2048)
];
for (const value of unsafe) assert.equal(defaults.normalizeRelayUrl(value), null, `unsafe relay URL rejected: ${value.slice(0, 80)}`);

console.log(`PASS: embedded signature, 100 signed discovery cases, random choice, expiry, revocation and URL safety (${signedListCases} cases)`);
