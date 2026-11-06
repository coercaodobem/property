import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const bundle = await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../web/message-pins.js', import.meta.url), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(source, context, { timeout: 5000 });

const N = context.NostrTools;
const Pins = context.PropertyMessagePins;
const keys = [11, 12, 13, 14].map(value => new Uint8Array(32).fill(value));
const pubs = keys.map(key => N.getPublicKey(key));
const target = 'ab'.repeat(32);

function prepare(participants, action = 'pin', targetEventId = target) {
  return Pins.createNip17Pin({ nostr: N, secret: keys[0], selfPubkey: pubs[0], participants, action, targetEventId });
}

const direct = prepare([pubs[0], pubs[1]]);
assert.equal(direct.wraps.length, 2, 'a direct pin creates one private envelope for each participant');
assert.equal(direct.wraps[0].id === direct.wraps[1].id, false, 'each recipient receives a distinct gift wrap');
assert.equal(direct.wraps.every(event => N.verifyEvent(event)), true, 'all direct pin gift wraps are signed');
for (const wrap of direct.wraps) {
  const recipient = wrap.tags.find(tag => tag[0] === 'p')?.[1];
  const key = keys[pubs.indexOf(recipient)];
  assert.ok(key, 'the outer envelope names a conversation participant');
  const rumor = N.nip17.unwrapEvent(wrap, key);
  assert.equal(rumor.id, direct.rumor.id, 'both participants receive the same inner pin event');
  assert.equal(rumor.kind, 14);
  assert.equal(rumor.content, '', 'pin metadata never repeats the pinned message text');
  assert.deepEqual(JSON.parse(JSON.stringify(rumor.tags.find(tag => tag[0] === Pins.TAG))), [Pins.TAG, 'pin', target]);
  assert.equal(Pins.descriptor(rumor).targetEventId, target);
}
assert.throws(() => N.nip17.unwrapEvent(direct.wraps[0], keys[2]), 'a nonparticipant cannot read a message pin');

const groupMembers = [pubs[0], pubs[1], pubs[2]];
const group = prepare(groupMembers);
assert.equal(group.wraps.length, 3, 'group pins are privately wrapped for every participant');
assert.equal(new Set(group.wraps.map(event => event.tags.find(tag => tag[0] === 'p')[1])).size, 3);
for (const wrap of group.wraps) assert.equal(N.nip17.unwrapEvent(wrap, keys[pubs.indexOf(wrap.tags.find(tag => tag[0] === 'p')[1])]).id, group.rumor.id);

const descriptor = Pins.descriptor({ kind: 14, content: '', pubkey: pubs[0], tags: [[Pins.TAG, 'unpin', target]] });
assert.deepEqual(JSON.parse(JSON.stringify(descriptor)), { action: 'unpin', targetEventId: target });
assert.equal(Pins.descriptor({ kind: 14, content: 'exposed text', pubkey: pubs[0], tags: [[Pins.TAG, 'pin', target]] }), null);
assert.equal(Pins.descriptor({ kind: 14, content: '', pubkey: pubs[0], tags: [[Pins.TAG, 'pin', 'bad']] }), null);
assert.equal(Pins.descriptor({ kind: 14, content: '', pubkey: pubs[0], tags: [[Pins.TAG, 'pin', target], [Pins.TAG, 'unpin', target]] }), null);

const first = { action: 'pin', targetEventId: target, actorPubkey: pubs[0], createdAt: 100, eventId: '10'.repeat(32) };
const clear = { action: 'unpin', targetEventId: target, actorPubkey: pubs[1], createdAt: 101, eventId: '20'.repeat(32) };
const newer = { action: 'pin', targetEventId: 'cd'.repeat(32), actorPubkey: pubs[2], createdAt: 102, eventId: '30'.repeat(32) };
const a = Pins.applyPinRecord(Pins.applyPinRecord(Pins.applyPinRecord(null, first).record, clear).record, newer).record;
const b = Pins.applyPinRecord(Pins.applyPinRecord(Pins.applyPinRecord(null, newer).record, first).record, clear).record;
assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'pins, unpins, and concurrent changes converge independent of relay arrival order');
assert.equal(a.active, true);
assert.equal(a.targetEventId, newer.targetEventId);
assert.equal(Pins.applyPinRecord(a, first).applied, false, 'stale pin events cannot replace a newer state');
assert.equal(Pins.applyPinRecord(a, newer).applied, false, 'replayed pin events are idempotent');
assert.equal(Pins.applyPinRecord(a, { ...newer, eventId: 'malformed' }).applied, false, 'malformed state is ignored');
assert.throws(() => prepare([pubs[0]], 'pin'), /Invalid NIP-17 pin/);
assert.throws(() => prepare([pubs[0], pubs[1]], 'pin', 'bad'), /Invalid NIP-17 pin/);

console.log('PASS: private NIP-17 shared pins, recipient isolation, group fan-out, and deterministic unpin convergence.');
