import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, btoa, atob, Intl };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/file-transfers.js', '../web/direct-file-envelope.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const result = await vm.runInContext(`(async () => {
  const nostr = NostrTools;
  const files = PropertyFileTransfers;
  const envelopes = PropertyDirectFileEnvelope;
  const senderSecret = new Uint8Array(32).fill(31);
  const recipientSecret = new Uint8Array(32).fill(32);
  const outsiderSecret = new Uint8Array(32).fill(33);
  const senderPubkey = nostr.getPublicKey(senderSecret);
  const recipientPubkey = nostr.getPublicKey(recipientSecret);
  const outsiderPubkey = nostr.getPublicKey(outsiderSecret);
  const sourceBytes = Uint8Array.from({ length: files.CHUNK_BYTES + 17 }, (_, index) => (index * 17) % 251);
  const transfer = await files.createTransfer({ name: 'private-report.bin', type: 'application/octet-stream', size: sourceBytes.length,
    arrayBuffer: async () => sourceBytes.slice().buffer }, { transferId: 'ab'.repeat(16), caption: 'private caption' });
  const manifest = [{ transferId: transfer.transferId, name: transfer.name, mime: transfer.mime, sizeBytes: transfer.sizeBytes,
    totalChunks: transfer.chunks.length, sha256: transfer.sha256 }];
  const replyEventId = 'cd'.repeat(32);
  const created = await envelopes.create({ nostr, fileTransfers: files, secret: senderSecret, senderPubkey, recipientPubkey,
    chunk: transfer.chunks[0], replyEventId });
  const accepted = await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
    files: manifest, sequence: 1, event: created.event });

  const changed = { ...created.event, content: created.event.content.slice(0, -4) + 'AAAA' };
  const mismatchedManifest = [{ ...manifest[0], sha256: 'ff'.repeat(32) }];
  const extraRecipientRumor = nostr.nip59.createRumor({ kind: 14,
    tags: [['p', recipientPubkey], ['p', outsiderPubkey], transfer.chunks[0].tag], content: envelopes.chunkBody(transfer.chunks[0]) }, senderSecret);
  const extraRecipientEvent = nostr.nip59.createWrap(nostr.nip59.createSeal(extraRecipientRumor, senderSecret, recipientPubkey), recipientPubkey);
  const routingMismatchSecret = new Uint8Array(32).fill(34);
  const routingMismatchSeal = nostr.nip59.createSeal(created.rumor, senderSecret, recipientPubkey);
  const routingMismatchKey = nostr.nip44.getConversationKey(routingMismatchSecret, recipientPubkey);
  const routingMismatchEvent = nostr.finalizeEvent({ kind: 1059, created_at: Math.floor(Date.now() / 1000),
    tags: [['p', outsiderPubkey]], content: nostr.nip44.encrypt(JSON.stringify(routingMismatchSeal), routingMismatchKey) }, routingMismatchSecret);
  const malformedChunk = { ...transfer.chunks[0], tag: transfer.chunks[0].tag.slice() };
  malformedChunk.tag[9] = malformedChunk.tag[9].slice(0, -4) + 'AAAA';
  const badInputRejected = await envelopes.create({ nostr, fileTransfers: files, secret: senderSecret, senderPubkey,
    recipientPubkey, chunk: malformedChunk }).then(() => false, () => true);
  const mismatchedSecretRejected = await envelopes.create({ nostr, fileTransfers: files, secret: outsiderSecret, senderPubkey,
    recipientPubkey, chunk: transfer.chunks[0] }).then(() => false, () => true);
  const wrapJson = JSON.stringify(created.event);
  return {
    validRecipientDecrypts: Boolean(accepted && accepted.rumor.id === created.rumor.id && accepted.chunk.chunkSha256 === transfer.chunks[0].chunkSha256),
    replyReferencePreserved: accepted?.replyEventId === replyEventId,
    onlyRecipientRouteVisible: created.event.kind === 1059 && created.event.tags.length === 1 && created.event.tags[0][0] === 'p' && created.event.tags[0][1] === recipientPubkey,
    fileMetadataNotVisibleOutside: !wrapJson.includes(transfer.name) && !wrapJson.includes('private caption') && !wrapJson.includes(transfer.chunks[0].base64),
    nonRecipientCannotValidate: await envelopes.validate({ nostr, fileTransfers: files, secret: outsiderSecret, senderPubkey, recipientPubkey: outsiderPubkey,
      files: manifest, sequence: 1, event: created.event }) === null,
    wrongSenderRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey: outsiderPubkey, recipientPubkey,
      files: manifest, sequence: 1, event: created.event }) === null,
    wrongSequenceRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
      files: manifest, sequence: 2, event: created.event }) === null,
    wrongManifestRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
      files: mismatchedManifest, sequence: 1, event: created.event }) === null,
    tamperedSignatureRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
      files: manifest, sequence: 1, event: changed }) === null,
    multipleRecipientsRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
      files: manifest, sequence: 1, event: extraRecipientEvent }) === null,
    mismatchedOuterRouteRejected: await envelopes.validate({ nostr, fileTransfers: files, secret: recipientSecret, senderPubkey, recipientPubkey,
      files: manifest, sequence: 1, event: routingMismatchEvent }) === null,
    malformedChunkRejected: badInputRejected,
    mismatchedSecretRejected,
    secondChunkSequence: envelopes.expectedChunk(manifest, 2)?.index === 1,
    outOfRangeSequenceRejected: envelopes.expectedChunk(manifest, 3) === null
  };
})()`, context, { timeout: 30000 });

for (const [name, passed] of Object.entries(result)) assert.equal(passed, true, `${name}: ${JSON.stringify(result)}`);
console.log(`PASS direct NIP-17 file envelopes: ${Object.keys(result).length} integrity, privacy, recipient, and sequence assertions`);
