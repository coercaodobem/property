import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, btoa, atob, Intl };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/file-transfers.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const result = await vm.runInContext(`(async () => {
  const files = PropertyFileTransfers;
  const nostr = NostrTools;
  const raw = Uint8Array.from({ length: files.CHUNK_BYTES * 2 + 37 }, (_, index) => index % 251);
  const file = { name: '../private/photo.bin', type: 'application/octet-stream', size: raw.length, arrayBuffer: async () => raw.slice().buffer };
  const transfer = await files.createTransfer(file, { transferId: '0123456789abcdef0123456789abcdef', caption: 'c'.repeat(files.MAX_CAPTION_CHARS + 50) });
  const openedChunks = [];
  for (const chunk of transfer.chunks) openedChunks.push(await files.fromTags([chunk.tag]));
  const assembled = await files.assemble([...openedChunks].reverse());
  const records = openedChunks.map((fileChunk, index) => ({ id: 'event-' + index, peer: 'peer', senderPubkey: 'a'.repeat(64), nostrEventId: String(index + 1).padStart(64, '0'), createdAt: 1000 + index, direction: 'received', status: 'delivered', fileChunk }));
  const coalesced = files.coalesceMessages(records);
  const retried = files.coalesceMessages([...records, { ...records[0], id: 'event-retried-part', nostrEventId: 'f'.repeat(64), createdAt: 9000 }])[0]?.fileTransfer;
  const partial = files.coalesceMessages(records.slice(1))[0]?.fileTransfer;
  const conflicting = files.coalesceMessages([...records, { ...records[0], id: 'conflict', fileChunk: { ...records[0].fileChunk, chunkSha256: 'f'.repeat(64) } }])[0]?.fileTransfer;

  const senderSecret = new Uint8Array(32).fill(11);
  const recipientSecrets = [new Uint8Array(32).fill(12), new Uint8Array(32).fill(13)];
  const sender = nostr.getPublicKey(senderSecret);
  const recipients = recipientSecrets.map(secret => nostr.getPublicKey(secret));
  const maximumChunk = transfer.chunks[0];
  const rumor = nostr.nip59.createRumor({ kind: 14, tags: [...recipients.map(pubkey => ['p', pubkey]), maximumChunk.tag], content: '📎 photo.bin' }, senderSecret);
  const members = [sender, ...recipients];
  const secrets = [senderSecret, ...recipientSecrets];
  const wraps = members.map(pubkey => nostr.nip59.createWrap(nostr.nip59.createSeal(rumor, senderSecret, pubkey), pubkey));
  const opened = wraps.map((event, index) => nostr.nip17.unwrapEvent(event, secrets[index]));
  const invalidData = maximumChunk.tag.slice(); invalidData[9] = invalidData[9].slice(0, -4) + 'AAAA';
  const badChunkHash = await files.fromTags([invalidData]);
  const duplicateTag = await files.fromTags([maximumChunk.tag, maximumChunk.tag]);
  const badWholeFile = await files.assemble(openedChunks.map(chunk => ({ ...chunk, sha256: 'f'.repeat(64) })));
  const incomplete = await files.assemble(openedChunks.slice(1));
  const emptyFile = { name: 'empty.txt', type: 'text/plain', size: 0, arrayBuffer: async () => new ArrayBuffer(0) };
  const empty = await files.createTransfer(emptyFile, { transferId: 'fedcba9876543210fedcba9876543210' });
  const emptyChunk = await files.fromTags(empty.chunks.map(chunk => chunk.tag));
  const emptyAssembled = await files.assemble([emptyChunk]);
  const maximumFileBytes = new Uint8Array(files.MAX_FILE_BYTES);
  const maximumFile = await files.createTransfer({ name: 'max.bin', type: 'application/octet-stream', size: maximumFileBytes.length, arrayBuffer: async () => maximumFileBytes.slice().buffer }, { transferId: '11111111111111111111111111111111' });
  let oversizeRejected = false;
  try { await files.createTransfer({ ...file, size: files.MAX_FILE_BYTES + 1 }); } catch { oversizeRejected = true; }
  const wrapperSizes = wraps.map(event => files.relayEventBytes(event));
  return {
    chunkCount: transfer.chunks.length,
    metadata: transfer.name === 'photo.bin' && transfer.mime === 'application/octet-stream' && transfer.sizeBytes === raw.length && openedChunks[0].caption.length === files.MAX_CAPTION_CHARS,
    completeAndOrdered: assembled?.bytes.length === raw.length && assembled.bytes.every((byte, index) => byte === raw[index]),
    captionPreservedAfterReordering: assembled?.caption === 'c'.repeat(files.MAX_CAPTION_CHARS),
    coalescedToOneMessage: coalesced.length === 1 && coalesced[0].fileTransfer.complete && coalesced[0].fileTransfer.receivedChunks === transfer.chunks.length && coalesced[0].text.length === files.MAX_CAPTION_CHARS,
    retryDuplicateIsIdempotent: retried?.complete === true && retried.receivedChunks === transfer.chunks.length && retried.conflict === false && retried.eventIds.includes('f'.repeat(64)),
    partialTransferVisible: partial?.complete === false && partial.receivedChunks === transfer.chunks.length - 1,
    conflictingChunkBlocksCompletion: conflicting?.conflict === true && conflicting.complete === false,
    groupRumorShared: opened.every(event => event?.id === rumor.id),
    groupRecipientCount: wraps.length,
    outerRouteTagsOnly: wraps.every(event => event.tags.length === 1 && event.tags[0][0] === 'p'),
    payloadNotVisible: wraps.every(event => !event.content.includes(maximumChunk.base64)),
    wrapperSizes,
    withinSafeRelayLimit: wrapperSizes.every(bytes => bytes <= files.MAX_RELAY_EVENT_BYTES),
    damagedChunkRejected: badChunkHash === null,
    duplicateTagsRejected: duplicateTag === null,
    mismatchedFullHashRejected: badWholeFile === null,
    incompleteRejected: incomplete === null,
    oversizeRejected,
    maximumFileAccepted: maximumFile.sizeBytes === files.MAX_FILE_BYTES && maximumFile.chunks.length === files.MAX_CHUNKS && maximumFile.chunks.every((chunk, index) => chunk.index === index),
    emptyFileSupported: Boolean(emptyAssembled && emptyAssembled.bytes.length === 0),
    nameSanitized: files.safeName('..\\secret/evil\u0000.txt') === 'evil.txt',
    mimeSanitized: files.safeMime('text/html; charset=utf-8') === 'application/octet-stream'
  };
})()`, context, { timeout: 30000 });

assert.equal(result.metadata, true, JSON.stringify(result));
assert.equal(result.completeAndOrdered, true, 'chunks reassemble independent of arrival order and match their full-file hash');
assert.equal(result.captionPreservedAfterReordering, true);
assert.equal(result.coalescedToOneMessage, true, 'separate NIP-17 chunks become one local attachment message');
assert.equal(result.retryDuplicateIsIdempotent, true, 'a retry with the same transfer id may repeat confirmed chunks without corrupting the attachment');
assert.equal(result.partialTransferVisible, true, 'an incomplete transfer stays visible without exposing a download');
assert.equal(result.conflictingChunkBlocksCompletion, true, 'conflicting duplicate chunks cannot complete a transfer');
assert.equal(result.groupRumorShared, true, 'each group member decrypts the same NIP-17 chunk rumor');
assert.equal(result.groupRecipientCount, 3);
assert.equal(result.outerRouteTagsOnly, true, 'outer gift wraps reveal only the NIP-17 recipient');
assert.equal(result.payloadNotVisible, true, 'the attachment bytes remain encrypted inside the NIP-17 gift wrap');
assert.equal(result.withinSafeRelayLimit, true, `wrapped NIP-17 events fit the local safety cap: ${result.wrapperSizes.join(', ')}`);
assert.equal(result.damagedChunkRejected, true);
assert.equal(result.duplicateTagsRejected, true);
assert.equal(result.mismatchedFullHashRejected, true);
assert.equal(result.incompleteRejected, true);
assert.equal(result.oversizeRejected, true);
assert.equal(result.maximumFileAccepted, true, 'the declared maximum file size is fully chunked into a bounded count of NIP-17 events');
assert.equal(result.emptyFileSupported, true);
assert.equal(result.nameSanitized, true);
assert.equal(result.mimeSanitized, true);
console.log(`PASS NIP-17 file transfer primitives: ${result.chunkCount} chunks, ${result.groupRecipientCount} wrappers, max ${Math.max(...result.wrapperSizes)} bytes`);
