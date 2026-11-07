import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const bundle = await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../web/message-deletions.js', import.meta.url), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL };
context.window = context;
vm.createContext(context);
vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(source, context, { timeout: 5000 });

const nostr = context.NostrTools;
const deletions = context.PropertyMessageDeletions;
const alice = new Uint8Array(32).fill(1);
const bob = new Uint8Array(32).fill(2);
const carol = new Uint8Array(32).fill(3);
const alicePub = nostr.getPublicKey(alice);
const bobPub = nostr.getPublicKey(bob);
const carolPub = nostr.getPublicKey(carol);
const createdAt = 1_800_000_000;
const original = nostr.nip59.createRumor({ kind: 14, created_at: createdAt, tags: [['p', bobPub]], content: 'A private message body' }, alice);
const filePartId = 'a'.repeat(64);

const direct = deletions.createNip17Deletion({
  nostr, secret: alice, selfPubkey: alicePub, participants: [alicePub, bobPub],
  targetIds: [original.id], createdAt: createdAt + 1
});
assert.equal(direct.rumor.kind, 5, 'the deletion is a NIP-17 kind-5 control rumor');
assert.equal(direct.rumor.content, '', 'the control rumor carries no deleted message text');
assert.equal(direct.wraps.length, 2, 'a direct deletion is wrapped separately for both participants');
const parsedDirect = deletions.parseRumor(direct.rumor, [alicePub, bobPub]);
assert.equal(parsedDirect.targetIds[0], original.id);
for (const wrap of direct.wraps) {
  assert.equal(wrap.kind, 1059);
  assert.equal(nostr.verifyEvent(wrap), true);
  const recipient = wrap.tags.find(tag => tag[0] === 'p')?.[1];
  const secret = recipient === alicePub ? alice : recipient === bobPub ? bob : null;
  assert.ok(secret, 'each envelope targets only a conversation member');
  const rumor = nostr.nip17.unwrapEvent(wrap, secret);
  assert.equal(deletions.parseRumor(rumor, [alicePub, bobPub]).senderPubkey, alicePub);
  assert.throws(() => nostr.nip17.unwrapEvent(wrap, recipient === alicePub ? bob : alice), 'a non-recipient cannot read the deletion');
  assert.equal(wrap.tags.some(tag => tag[0] === 'e' && tag[1] === original.id), false, 'outer relay-visible wraps do not reveal the deleted event id');
}

const message = {
  id: original.id, peer: alicePub, text: 'A private message body', senderPubkey: alicePub,
  direction: 'received', status: 'delivered', createdAt: createdAt * 1000, nostrEventId: original.id,
  saved: true, linkPreview: { title: 'Private preview' }, voiceMessage: { base64: 'PRIVATE_AUDIO' },
  fileChunk: { transferId: 'private-transfer' }, fileTransfer: { eventIds: [filePartId] }, mentions: [{ pubkey: carolPub }]
};
const combinedDeletion = { ...parsedDirect, targetIds: [original.id, filePartId] };
const removed = deletions.applyToMessage(message, alicePub, combinedDeletion, bobPub);
assert.equal(removed.deleted, true);
assert.equal(removed.text, '', 'deleted plaintext is removed from the local message record');
assert.equal(removed.saved, false, 'deleted messages leave local Saved');
assert.equal(removed.linkPreview, null);
assert.equal(removed.voiceMessage, undefined, 'voice payload is removed from the local record');
assert.equal(removed.fileChunk, undefined, 'file payload is removed from the local record');
assert.equal(removed.fileTransfer, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(removed.mentions)), []);
assert.equal(deletions.applyToMessage(message, bobPub, combinedDeletion, bobPub), null, 'a deletion cannot cross conversation boundaries');
assert.equal(deletions.applyToMessage({ ...message, senderPubkey: carolPub }, alicePub, combinedDeletion, bobPub), null, 'only the original author may delete their message');
assert.equal(deletions.applyToMessage({ ...message, kind: 7 }, alicePub, combinedDeletion, bobPub), null, 'reaction rows are not message-deletion targets');
assert.equal(deletions.applyToMessage({ ...message, fromAgent: true }, alicePub, combinedDeletion, bobPub), null, 'agent protocol records are not deleted as human messages');

const identity = bobPub;
const pending = deletions.recordsFor(identity, alicePub, parsedDirect);
assert.equal(pending.length, 1);
assert.equal(pending[0].id, deletions.settingId(identity, alicePub, original.id));
assert.equal(deletions.applyPending(message, alicePub, pending, bobPub).deleted, true, 'a deletion received before its message applies when that message arrives later');
assert.notEqual(deletions.applyPending({ ...message, senderPubkey: carolPub }, alicePub, pending, carolPub).deleted, true, 'pending tombstones do not delete messages authored by another key');
assert.equal(deletions.applyToMessages([message, { ...message, kind: 7 }], alicePub, combinedDeletion, bobPub).length, 1);

const secondFilePartId = 'b'.repeat(64);
const fileRows = [filePartId, secondFilePartId].map((id, index) => ({
  id, nostrEventId: id, peer: alicePub, senderPubkey: alicePub, direction: 'received',
  createdAt: (createdAt + index) * 1000, text: '', fileChunk: { transferId: 'shared-file-transfer' }
}));
const fileDeletion = { ...parsedDirect, targetIds: [filePartId, secondFilePartId] };
const deletedFileRows = deletions.applyToMessages(fileRows, alicePub, fileDeletion, bobPub).map(update => update.after);
const deletedFileMessages = deletions.coalesceDeletedMessages(deletedFileRows);
assert.equal(deletedFileMessages.length, 1, 'all deleted parts of one attachment render as a single placeholder');
assert.deepEqual(JSON.parse(JSON.stringify(deletedFileMessages[0].deletedEventIds)), [filePartId, secondFilePartId]);

const group = deletions.createNip17Deletion({
  nostr, secret: alice, selfPubkey: alicePub, participants: [carolPub, alicePub, bobPub],
  targetIds: [original.id, filePartId], createdAt: createdAt + 2
});
assert.equal(group.wraps.length, 3, 'private group deletion creates one encrypted envelope per participant');
assert.equal(new Set(group.wraps.map(wrap => wrap.tags.find(tag => tag[0] === 'p')[1])).size, 3);
assert.deepEqual(JSON.parse(JSON.stringify(deletions.parseRumor(group.rumor, [alicePub, bobPub, carolPub]).targetIds)), [original.id, filePartId]);

assert.equal(deletions.parseRumor({ ...direct.rumor, tags: [...direct.rumor.tags, ['untrusted', 'extra']] }, [alicePub, bobPub]), null, 'unknown tags fail closed');
assert.equal(deletions.parseRumor({ ...direct.rumor, tags: [...direct.rumor.tags, ['e', original.id]] }, [alicePub, bobPub]), null, 'duplicate target ids fail closed');
assert.equal(deletions.parseRumor({ ...direct.rumor, tags: direct.rumor.tags.filter(tag => tag[0] !== 'p') }, [alicePub, bobPub]), null, 'missing recipients fail closed');
assert.throws(() => deletions.createNip17Deletion({ nostr, secret: alice, selfPubkey: alicePub, participants: [alicePub, bobPub], targetIds: [], createdAt }));
assert.throws(() => deletions.createNip17Deletion({ nostr, secret: alice, selfPubkey: alicePub, participants: [alicePub, bobPub], targetIds: [original.id, original.id], createdAt }));
assert.throws(() => deletions.createNip17Deletion({ nostr, secret: alice, selfPubkey: alicePub, participants: [alicePub, bobPub], targetIds: [original.id], createdAt: -1 }));

console.log('PASS: private NIP-17 message deletion, recipient isolation, author binding, attachment clearing, duplicate rejection, and out-of-order tombstones');
