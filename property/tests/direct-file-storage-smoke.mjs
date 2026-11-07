import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, Uint8Array, ArrayBuffer, DataView, Blob, TextEncoder };
vm.runInNewContext(await readFile(new URL('../web/direct-file-chunks.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
vm.runInNewContext(await readFile(new URL('../web/direct-file-storage.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const Chunks = context.PropertyDirectFileChunks;
const Storage = context.PropertyDirectFileStorage;
const hashImplementation = await import('../web/chess/vendor/noble-hashes/sha2.js');
const records = new Map();
let identity = { secret: new Uint8Array(32).fill(7), pubkey: '12'.repeat(32) };
const storage = Storage.create({
  crypto: webcrypto,
  hashImplementation,
  getIdentity: () => identity,
  putPart: async record => records.set(`${record.transferId}:${record.index}`, record),
  listParts: async transferId => [...records.values()].filter(part => part.transferId === transferId),
  listResumeTransferIds: async (peer, fingerprint) => [...new Set([...records.values()]
    .filter(part => part.peer === peer && part.direction === 'received' && part.resumeFingerprint === fingerprint)
    .map(part => part.transferId))],
  deleteParts: async transferId => { for (const [key, part] of records) if (part.transferId === transferId) records.delete(key); }
});
const bytes = Uint8Array.from({ length: Chunks.CHUNK_BYTES + 19 }, (_, index) => (index * 3) % 251);
const file = new Blob([bytes], { type: 'application/octet-stream' });
Object.defineProperties(file, { name: { value: 'recording.bin' } });
const manifest = await Chunks.createManifest(file, { transferId: 'ab'.repeat(16), hashImplementation });
for (let index = manifest.totalChunks - 1; index >= 0; index -= 1) {
  const chunk = await Chunks.readChunk(file, manifest, index, webcrypto);
  assert.equal(await storage.savePart({ file: manifest, index, bytes: chunk.bytes, sha256: chunk.sha256,
    sessionId: 'cd'.repeat(16), peer: 'ef'.repeat(32), direction: 'received' }), true);
}
for (const record of records.values()) {
  assert.equal(record.storageVersion, 3, 'persisted direct blocks use the authenticated reload-resume storage format');
  assert.equal(record.ownerPubkey, identity.pubkey, 'encrypted blocks are scoped to the unlocked Property identity');
  assert.equal(record.bytes.byteLength, Chunks.expectedChunkSize(manifest.sizeBytes, manifest.totalChunks, record.index) + 16,
    'stored block bytes contain AES-GCM ciphertext and its authentication tag');
  assert.match(record.manifestHash, /^[0-9a-f]{64}$/);
  assert.match(record.resumeFingerprint, /^[0-9a-f]{64}$/);
  assert.notDeepEqual(new Uint8Array(record.bytes), new Uint8Array(await Chunks.readChunk(file, manifest, record.index, webcrypto).then(part => part.bytes)),
    'IndexedDB never receives a direct file plaintext block');
}
const storageFormatKey = `${manifest.transferId}:0`;
const storedFormatRecord = records.get(storageFormatKey);
records.set(storageFormatKey, { ...storedFormatRecord, storageVersion: 4 });
assert.equal(await storage.verifyFiles([manifest]), false, 'unknown encrypted storage formats fail closed instead of being treated as legacy plaintext');
records.set(storageFormatKey, storedFormatRecord);
records.set(storageFormatKey, { ...storedFormatRecord, manifestHash: '00'.repeat(32) });
assert.equal(await storage.verifyFiles([manifest]), false, 'changing the manifest binding invalidates the AES-GCM authentication tag');
records.set(storageFormatKey, storedFormatRecord);
records.set(storageFormatKey, { ...storedFormatRecord, resumeFingerprint: '00'.repeat(32) });
assert.equal(await storage.verifyFiles([manifest]), false, 'changing the reload-resume fingerprint invalidates authenticated storage');
records.set(storageFormatKey, { ...storedFormatRecord, peer: '34'.repeat(32) });
assert.equal(await storage.verifyFiles([manifest]), false, 'changing the local peer binding invalidates authenticated storage');
records.set(storageFormatKey, { ...storedFormatRecord, direction: 'sent' });
assert.equal(await storage.verifyFiles([manifest]), false, 'changing the transfer direction invalidates authenticated storage');
records.set(storageFormatKey, storedFormatRecord);
assert.equal(await storage.verifyFiles([manifest]), true, 'blocks saved in any order are reassembled and whole-file checked');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [2], 'a contiguous, authenticated receiver prefix can resume');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], '34'.repeat(32))), [0], 'another peer cannot resume a contact\'s saved blocks');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([{ ...manifest, name: 'changed-name.bin' }], 'ef'.repeat(32))), [0],
  'a changed manifest cannot reuse blocks from an earlier file selection');
const receivedSecondRecord = records.get(`${manifest.transferId}:1`);
records.set(`${manifest.transferId}:1`, { ...receivedSecondRecord, direction: 'sent' });
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [1], 'only recipient-owned contiguous blocks count as a resumable prefix');
records.set(`${manifest.transferId}:1`, receivedSecondRecord);
const restored = await storage.createBlob(manifest);
assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), bytes);
assert.equal(restored.type, manifest.mime);

const reloadedStorage = Storage.create({
  crypto: webcrypto, hashImplementation, getIdentity: () => identity,
  putPart: async record => records.set(`${record.transferId}:${record.index}`, record),
  listParts: async transferId => [...records.values()].filter(part => part.transferId === transferId),
  listResumeTransferIds: async (peer, fingerprint) => [...new Set([...records.values()]
    .filter(part => part.peer === peer && part.direction === 'received' && part.resumeFingerprint === fingerprint)
    .map(part => part.transferId))]
});
assert.equal(await reloadedStorage.verifyFiles([manifest]), true, 'the same Property identity decrypts files after a storage facade reload');
identity = { secret: new Uint8Array(32).fill(8), pubkey: '34'.repeat(32) };
assert.equal(await reloadedStorage.verifyFiles([manifest]), false, 'another identity cannot decrypt the stored files');
identity = null;
assert.equal(await reloadedStorage.verifyFiles([manifest]), false, 'locked identities cannot read direct file blocks');
const lockedPart = await Chunks.readChunk(file, manifest, 0, webcrypto);
await assert.rejects(async () => reloadedStorage.savePart({ file: manifest, index: 0, bytes: lockedPart.bytes,
  sha256: lockedPart.sha256 }), /Unlock the Property identity/);
identity = { secret: new Uint8Array(32).fill(7), pubkey: '12'.repeat(32) };

const firstKey = `${manifest.transferId}:0`;
const damaged = records.get(firstKey);
records.set(firstKey, { ...damaged, bytes: new Uint8Array(damaged.bytes).fill(0) });
assert.equal(await storage.verifyFiles([manifest]), false, 'corrupt local blocks prevent completion');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [0], 'an unauthenticated first block is never resumed');
assert.equal(await storage.createBlob(manifest), null, 'corrupt blocks never become a downloadable Blob');
records.set(firstKey, storedFormatRecord);
const secondKey = `${manifest.transferId}:1`;
const damagedSecond = records.get(secondKey);
records.set(secondKey, { ...damagedSecond, bytes: new Uint8Array(damagedSecond.bytes).fill(0) });
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [1], 'resume stops at the first corrupt block');
records.set(secondKey, damagedSecond);
records.delete(firstKey);
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [0], 'a later block cannot bridge a missing prefix block');
records.set(firstKey, storedFormatRecord);
await storage.deleteParts(manifest.transferId);
assert.equal(records.size, 0);

for (let index = 0; index < manifest.totalChunks; index += 1) {
  const chunk = await Chunks.readChunk(file, manifest, index, webcrypto);
  records.set(`${manifest.transferId}:${index}`, { transferId: manifest.transferId, index, bytes: chunk.bytes, sha256: chunk.sha256 });
}
assert.equal(await storage.verifyFiles([manifest]), true, 'legacy plaintext blocks migrate without losing a valid completed transfer');
assert.ok([...records.values()].every(record => record.storageVersion === 3 && /^[0-9a-f]{64}$/.test(record.manifestHash) &&
  /^[0-9a-f]{64}$/.test(record.resumeFingerprint)),
  'legacy blocks are rewritten as manifest-bound and peer-bound authenticated ciphertext on first unlock');
assert.equal(await storage.createBlob(manifest) !== null, true, 'a migrated legacy transfer remains downloadable after whole-file verification');
await storage.deleteParts(manifest.transferId);
assert.equal(records.size, 0);

for (let index = 0; index < manifest.totalChunks; index += 1) {
  const chunk = await Chunks.readChunk(file, manifest, index, webcrypto);
  assert.equal(await storage.savePart({ file: manifest, index, bytes: chunk.bytes, sha256: chunk.sha256,
    peer: 'ef'.repeat(32), direction: 'received' }), true);
}
const reselectedManifest = await Chunks.createManifest(file, { transferId: '23'.repeat(16), hashImplementation });
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([reselectedManifest], 'ef'.repeat(32))), [2],
  'the exact same peer and file can recover verified blocks under a new transfer id after reload and reselection');
assert.equal(await storage.verifyFiles([reselectedManifest]), true, 'rebound blocks complete under the new manifest id');
assert.ok([...records.values()].filter(record => record.transferId === reselectedManifest.transferId)
  .every(record => record.storageVersion === 3 && record.resumeFingerprint), 'rebound blocks are re-encrypted for the new transfer id');
await storage.deleteParts(reselectedManifest.transferId);
await storage.deleteParts(manifest.transferId);
assert.equal(records.size, 0);

const legacyChunk = await Chunks.readChunk(file, manifest, 0, webcrypto);
const normalizedLegacyManifest = Chunks.normalizeFileManifests([manifest])[0];
const legacyManifestCanonical = JSON.stringify([normalizedLegacyManifest.transferId, normalizedLegacyManifest.name,
  normalizedLegacyManifest.mime, normalizedLegacyManifest.sizeBytes, normalizedLegacyManifest.chunkBytes,
  normalizedLegacyManifest.totalChunks, normalizedLegacyManifest.sha256]);
const legacyManifestHash = await Chunks.digestHex(new TextEncoder().encode(legacyManifestCanonical), webcrypto);
const legacyMaterial = await webcrypto.subtle.importKey('raw', identity.secret, 'HKDF', false, ['deriveKey']);
const legacySalt = Uint8Array.from(identity.pubkey.match(/.{2}/g).map(value => Number.parseInt(value, 16)));
const legacyKey = await webcrypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: legacySalt,
  info: new TextEncoder().encode('Property direct-file blocks at rest v1') }, legacyMaterial,
{ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const legacyIv = new Uint8Array(12).fill(9);
const legacyAad = new TextEncoder().encode(`${identity.pubkey}:${manifest.transferId}:0:${legacyChunk.sha256}:${legacyManifestHash}`);
const legacyCipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: legacyIv, additionalData: legacyAad, tagLength: 128 },
  legacyKey, legacyChunk.bytes);
records.set(`${manifest.transferId}:0`, { transferId: manifest.transferId, index: 0, sha256: legacyChunk.sha256,
  manifestHash: legacyManifestHash, ownerPubkey: identity.pubkey, peer: 'ef'.repeat(32), direction: 'received',
  storageVersion: 2, iv: legacyIv, bytes: new Uint8Array(legacyCipher) });
const legacyReloadManifest = await Chunks.createManifest(file, { transferId: 'ac'.repeat(16), hashImplementation });
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([legacyReloadManifest], 'ef'.repeat(32))), [0],
  'an older partial format is not automatically matched to a different transfer id');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], 'ef'.repeat(32))), [1],
  'same-id retries still decrypt and migrate authenticated version-2 blocks');
assert.equal(records.get(`${manifest.transferId}:0`).storageVersion, 3, 'version-2 blocks are re-encrypted with the current resume binding');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([legacyReloadManifest], 'ef'.repeat(32))), [1],
  'a migrated version-2 prefix can be rebound after a reload');
await storage.deleteParts(manifest.transferId);
await storage.deleteParts(legacyReloadManifest.transferId);
assert.equal(records.size, 0);

let unblockWrite;
let announceWriteStarted;
let sessionDeleteStarted = false;
const writeGate = new Promise(resolve => { unblockWrite = resolve; });
const writeStarted = new Promise(resolve => { announceWriteStarted = resolve; });
const pendingRecords = new Map();
const delayedStorage = Storage.create({
  crypto: webcrypto,
  hashImplementation,
  getIdentity: () => identity,
  putPart: async record => {
    announceWriteStarted();
    await writeGate;
    pendingRecords.set(`${record.transferId}:${record.index}`, record);
  },
  listParts: async transferId => [...pendingRecords.values()].filter(part => part.transferId === transferId),
  deleteSessionParts: async sessionId => {
    sessionDeleteStarted = true;
    for (const [key, part] of pendingRecords) if (part.sessionId === sessionId) pendingRecords.delete(key);
  }
});
const interruptedSession = 'ef'.repeat(16);
const firstPart = await Chunks.readChunk(file, manifest, 0, webcrypto);
const pendingSave = delayedStorage.savePart({ file: manifest, index: 0, bytes: firstPart.bytes,
  sha256: firstPart.sha256, sessionId: interruptedSession });
await writeStarted;
const pendingDiscard = delayedStorage.discardSession(interruptedSession);
await Promise.resolve();
assert.equal(sessionDeleteStarted, false, 'session cleanup waits for a block write already in flight');
unblockWrite();
assert.equal(await pendingSave, true);
await pendingDiscard;
assert.equal(sessionDeleteStarted, true);
assert.equal(pendingRecords.size, 0, 'cleanup removes the block after its IndexedDB-style write settles');

console.log('PASS direct file storage: identity-derived AES-GCM at rest, reload, identity isolation, legacy migration, bounded blocks, full-file hash and corrupt-block rejection');
