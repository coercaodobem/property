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
  assert.equal(record.storageVersion, 2, 'persisted direct blocks use the manifest-bound encrypted storage format');
  assert.equal(record.ownerPubkey, identity.pubkey, 'encrypted blocks are scoped to the unlocked Property identity');
  assert.equal(record.bytes.byteLength, Chunks.expectedChunkSize(manifest.sizeBytes, manifest.totalChunks, record.index) + 16,
    'stored block bytes contain AES-GCM ciphertext and its authentication tag');
  assert.match(record.manifestHash, /^[0-9a-f]{64}$/);
  assert.notDeepEqual(new Uint8Array(record.bytes), new Uint8Array(await Chunks.readChunk(file, manifest, record.index, webcrypto).then(part => part.bytes)),
    'IndexedDB never receives a direct file plaintext block');
}
const storageFormatKey = `${manifest.transferId}:0`;
const storedFormatRecord = records.get(storageFormatKey);
records.set(storageFormatKey, { ...storedFormatRecord, storageVersion: 3 });
assert.equal(await storage.verifyFiles([manifest]), false, 'unknown encrypted storage formats fail closed instead of being treated as legacy plaintext');
records.set(storageFormatKey, storedFormatRecord);
records.set(storageFormatKey, { ...storedFormatRecord, manifestHash: '00'.repeat(32) });
assert.equal(await storage.verifyFiles([manifest]), false, 'changing the manifest binding invalidates the AES-GCM authentication tag');
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
  listParts: async transferId => [...records.values()].filter(part => part.transferId === transferId)
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
assert.ok([...records.values()].every(record => record.storageVersion === 2 && /^[0-9a-f]{64}$/.test(record.manifestHash)),
  'legacy blocks are rewritten as manifest-bound authenticated ciphertext on first unlock');
assert.equal(await storage.createBlob(manifest) !== null, true, 'a migrated legacy transfer remains downloadable after whole-file verification');
await storage.deleteParts(manifest.transferId);
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
