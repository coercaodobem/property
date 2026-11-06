import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const bundle = await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8');
const editsSource = await readFile(new URL('../web/message-edits.js', import.meta.url), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(editsSource, context, { timeout: 5000 });

const nostr = context.NostrTools;
const edits = context.PropertyMessageEdits;
const alice = nostr.generateSecretKey();
const bob = nostr.generateSecretKey();
const carol = nostr.generateSecretKey();
const alicePub = nostr.getPublicKey(alice);
const bobPub = nostr.getPublicKey(bob);
const carolPub = nostr.getPublicKey(carol);
const fixedCreatedAt = 1_800_000_000;
const original = nostr.nip59.createRumor({
  kind: 14, created_at: fixedCreatedAt, tags: [['p', bobPub]], content: 'Original encrypted copy'
}, alice);

function prepareEdit(sequence, text, participants = [alicePub, bobPub]) {
  return edits.createNip17Edit({
    nostr, secret: alice, selfPubkey: alicePub, participants,
    rootId: original.id, priorEventIds: [original.id], sequence,
    createdAt: original.created_at, replyToId: '', text
  });
}

const first = prepareEdit(1, 'Edited encrypted copy');
assert.equal(first.editRumor.kind, 14, 'the replacement stays in the normal NIP-17 chat protocol');
assert.equal(first.editRumor.created_at, original.created_at, 'the edited message keeps its original sort timestamp');
assert.deepEqual(JSON.parse(JSON.stringify(edits.editDescriptor(first.editRumor))), { rootId: original.id, sequence: 1 });
assert.equal(first.editWraps.length, 2, 'direct edits wrap one copy for each participant');
assert.equal(first.deleteWraps.length, 2, 'the old rumor is retired only with encrypted kind-5 control envelopes');

for (const wrap of first.editWraps) {
  assert.equal(wrap.kind, 1059);
  assert.equal(nostr.verifyEvent(wrap), true);
  const recipient = wrap.tags.find(tag => tag[0] === 'p')?.[1];
  const secret = recipient === alicePub ? alice : recipient === bobPub ? bob : null;
  assert.ok(secret, 'each direct envelope names exactly a conversation participant');
  const rumor = nostr.nip17.unwrapEvent(wrap, secret);
  assert.equal(rumor.kind, 14);
  assert.equal(rumor.content, 'Edited encrypted copy');
  assert.equal(rumor.created_at, original.created_at);
  assert.throws(() => nostr.nip17.unwrapEvent(wrap, recipient === alicePub ? bob : alice), 'a different participant key cannot open the envelope');
}
for (const wrap of first.deleteWraps) {
  const recipient = wrap.tags.find(tag => tag[0] === 'p')?.[1];
  const rumor = nostr.nip17.unwrapEvent(wrap, recipient === alicePub ? alice : bob);
  assert.equal(rumor.kind, 5, 'the original NIP-17 rumor is retired for compatible clients');
  assert.ok(rumor.tags.some(tag => tag[0] === 'e' && tag[1] === original.id));
  assert.deepEqual(JSON.parse(JSON.stringify(edits.editDescriptor(rumor))), { rootId: original.id, sequence: 1 });
  assert.equal(rumor.content, '');
}

const originalMessage = {
  id: original.id, peer: alicePub, text: 'Original encrypted copy', senderPubkey: alicePub,
  direction: 'received', status: 'delivered', createdAt: original.created_at * 1000,
  nostrEventId: original.id
};
const incoming = {
  id: `edit:${alicePub}:${original.id}`, peer: alicePub, text: first.editRumor.content,
  senderPubkey: alicePub, direction: 'received', status: 'delivered',
  createdAt: first.editRumor.created_at * 1000, nostrEventId: first.editRumor.id,
  edit: { rootId: original.id, sequence: 1 }
};
const applied = edits.applyIncomingEdit([originalMessage], incoming, bobPub);
assert.equal(applied.applied, true);
assert.equal(applied.message.id, original.id, 'editing keeps the local message identity stable');
assert.equal(applied.message.text, 'Edited encrypted copy');
assert.equal(applied.message.createdAt, originalMessage.createdAt);
assert.ok(edits.eventIds(applied.message).includes(original.id), 'replies and reactions can still resolve the original event ID');
assert.equal(edits.applyIncomingEdit([applied.message], incoming, bobPub).applied, false, 'duplicate edits are idempotent');
const attacker = edits.applyIncomingEdit([originalMessage], { ...incoming, senderPubkey: carolPub }, bobPub);
assert.equal(attacker.applied, false, 'another conversation participant cannot edit someone else’s message');

const secondA = prepareEdit(2, 'Concurrent edit A');
const secondB = prepareEdit(2, 'Concurrent edit B');
function incomingEdit(prepared) {
  return { ...incoming, text: prepared.editRumor.content, nostrEventId: prepared.editRumor.id, edit: { rootId: original.id, sequence: 2 } };
}
const candidateA = incomingEdit(secondA);
const candidateB = incomingEdit(secondB);
const winner = candidateA.nostrEventId > candidateB.nostrEventId ? candidateA : candidateB;
const loser = winner === candidateA ? candidateB : candidateA;
let forward = edits.applyIncomingEdit([applied.message], candidateA, bobPub).message;
forward = edits.applyIncomingEdit([forward], candidateB, bobPub).message;
let reverse = edits.applyIncomingEdit([applied.message], candidateB, bobPub).message;
reverse = edits.applyIncomingEdit([reverse], candidateA, bobPub).message;
assert.equal(forward.nostrEventId, winner.nostrEventId, 'same-sequence conflicts converge on the greater signed event ID');
assert.equal(reverse.nostrEventId, winner.nostrEventId, 'conflict result does not depend on relay delivery order');
assert.notEqual(winner.nostrEventId, loser.nostrEventId);

const groupEdit = prepareEdit(1, 'Private group edit', [alicePub, bobPub, carolPub]);
assert.equal(groupEdit.editWraps.length, 3, 'a group edit creates one private wrapper for every participant');
assert.equal(groupEdit.deleteWraps.length, 3);
assert.equal(new Set(groupEdit.editWraps.map(wrap => wrap.tags.find(tag => tag[0] === 'p')[1])).size, 3);

const outOfOrder = edits.applyIncomingEdit([], incoming, bobPub);
assert.equal(outOfOrder.applied, true, 'an edit arriving before its original can be stored');
const merged = edits.mergeOriginalBehindEdit([outOfOrder.message], originalMessage, bobPub);
assert.ok(merged, 'a late original is merged into the existing edited row');
assert.equal(merged.message.text, 'Edited encrypted copy');
assert.ok(edits.eventIds(merged.message).includes(original.id));
const forwardedOriginal = { ...originalMessage, forwarded: 2 };
const mergedForwarded = edits.mergeOriginalBehindEdit([outOfOrder.message], forwardedOriginal, bobPub);
assert.equal(mergedForwarded.message.forwarded, 2, 'an out-of-order original preserves its private forwarding badge');
assert.equal(edits.editDescriptor({ tags: [['edit', 'broken', '1']] }), null, 'malformed edit tags are ignored');
assert.throws(() => prepareEdit(101, 'too many edits'), /limit/i, 'edit sequence is bounded');

console.log('PASS: NIP-17 message edits, private wrappers, out-of-order delivery, and relay-order convergence.');
