import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fixedEpochSeconds = 1_800_000_000;
class FixedDate extends Date { static now() { return fixedEpochSeconds * 1000; } }
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, Date: FixedDate, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
vm.runInContext(await readFile(new URL('../web/forwarding.js', import.meta.url), 'utf8'), context, { timeout: 5000 });

const nostr = context.NostrTools;
const bridgeApi = context.PropertyRelayBridge;
const secret = nostr.generateSecretKey();
const pubkey = nostr.getPublicKey(secret);
const now = fixedEpochSeconds;
const fixedNow = () => now * 1000;
const bridge = bridgeApi.createBridge(nostr.verifyEvent, 8, fixedNow);
function sign(kind, content, createdAt = now, tags = []) {
  context.eventTemplateJson = JSON.stringify({ kind, content, tags, pubkey, created_at: createdAt });
  context.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(eventTemplateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}

const filter = bridge.filter(now - 60);
assert.deepEqual(Array.from(filter.kinds), [1, 5, 7, 10050, 30017, 30018, 30019]);
assert.ok(!filter.kinds.includes(1059), 'general bridge does not subscribe to other users gift wraps');
assert.equal(filter.since, now - 60);
assert.throws(() => bridge.filter(-1));

const event = sign(1, 'public post');
assert.deepEqual(Array.from(bridge.targets(event, 'wss://one.example', ['wss://one.example', 'wss://two.example', 'wss://two.example'])), ['wss://two.example']);
assert.deepEqual(Array.from(bridge.targets(event, 'wss://two.example', ['wss://one.example', 'wss://two.example'])), [], 'deduplication prevents relay loops');
assert.equal(bridge.seenCount, 1);

const retryable = sign(1, 'retry after destination was unavailable');
assert.deepEqual(Array.from(bridge.targets(retryable, 'wss://one.example', ['wss://two.example'])), ['wss://two.example']);
assert.equal(bridge.releaseForRetry(retryable.id), true, 'failed forwarding releases its deduplication claim');
assert.deepEqual(Array.from(bridge.targets(retryable, 'wss://one.example', ['wss://two.example'])), ['wss://two.example'], 'a replay can retry after failure');
assert.deepEqual(Array.from(bridge.targets(retryable, 'wss://two.example', ['wss://one.example', 'wss://two.example'])), [], 'successful retry still prevents a relay loop');
assert.equal(bridge.releaseForRetry('not-an-event-id'), false);

const tampered = JSON.parse(JSON.stringify(sign(1, 'original')));
tampered.content = 'tampered';
assert.deepEqual(Array.from(bridge.targets(tampered, 'wss://one.example', ['wss://two.example'])), [], 'invalid signatures are never forwarded');
assert.deepEqual(Array.from(bridge.targets(sign(4, 'legacy plaintext DM'), 'wss://one.example', ['wss://two.example'])), [], 'legacy plaintext private messages are excluded');
assert.deepEqual(Array.from(bridge.targets(sign(1, 'stale', now - 301), 'wss://one.example', ['wss://two.example'])), [], 'stale events are excluded');

const recipientSecret = nostr.generateSecretKey();
const recipientPubkey = nostr.getPublicKey(recipientSecret);
const privateWraps = nostr.nip17.wrapManyEvents(secret, [{ publicKey: recipientPubkey }], 'private test message');
const privateWrap = privateWraps.find(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === recipientPubkey));
assert.ok(privateWrap && privateWrap.created_at <= now, 'NIP-17 gift wrap uses a randomized past timestamp');
assert.equal(privateWrap.content.includes('private test message'), false, 'private plaintext remains encrypted');
assert.deepEqual(Array.from(bridge.privateTargets(privateWrap, 'wss://source.example', ['wss://recipient-inbox.example'], recipientPubkey)), ['wss://recipient-inbox.example']);
assert.deepEqual(Array.from(bridge.privateTargets(privateWrap, 'wss://source.example', ['wss://recipient-inbox.example'], pubkey)), [], 'private wraps for other people are never forwarded');
assert.deepEqual(Array.from(bridge.privateTargets(sign(1059, 'too old', now - 173101, [['p', recipientPubkey]]), 'wss://source.example', ['wss://recipient-inbox.example'], recipientPubkey)), [], 'private wraps older than the two-day window plus clock tolerance are excluded');
const published = sign(1, 'already sent by this client');
assert.equal(bridge.markPublished(published), true);
assert.deepEqual(Array.from(bridge.targets(published, 'wss://source.example', ['wss://target.example'])), [], 'client-originated events are not retransmitted');
assert.deepEqual(Array.from(bridge.targets(sign(1, 'no route'), 'wss://only.example', ['wss://only.example'])), [], 'events are not sent back to their source');

const limited = bridgeApi.createBridge(nostr.verifyEvent, 200, fixedNow);
for (let index = 0; index < 61; index += 1) {
  const result = limited.targets(sign(1, `bounded-${index}`), 'wss://source.example', ['wss://target.example']);
  assert.equal(result.length, index < 60 ? 1 : 0, 'bridge caps event forwarding at 60 attempts in the fixed logical window');
}
const byteLimited = bridgeApi.createBridge(() => true, 32, fixedNow);
for (let index = 0; index < 9; index += 1) {
  const oversizedUtf8Batch = {
    id: index.toString(16).padStart(64, '0'), kind: 1, created_at: now, content: 'é'.repeat(120_000)
  };
  const result = byteLimited.targets(oversizedUtf8Batch, 'wss://source.example', ['wss://target.example']);
  assert.equal(result.length, index < 8 ? 1 : 0, 'bridge meters UTF-8 payload bytes within the fixed logical window');
}
const fanoutLimited = bridgeApi.createBridge(() => true, 16, fixedNow);
for (let index = 0; index < 4; index += 1) {
  const event = { id: (100 + index).toString(16).padStart(64, '0'), kind: 1, created_at: now, content: 'x'.repeat(200_000) };
  const result = fanoutLimited.targets(event, 'wss://source.example', ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example']);
  assert.equal(result.length, index < 3 ? 3 : 0, '2 MB logical-window egress cap includes destination fan-out');
}
assert.throws(() => bridgeApi.createBridge(nostr.verifyEvent, 0));
console.log('PASS: event signature/time/kind validation, per-event deduplication, source exclusion, private-route boundary, event rate and UTF-8 byte limits');
