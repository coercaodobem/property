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
const storage = Storage.create({
  crypto: webcrypto,
  hashImplementation,
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
assert.equal(await storage.verifyFiles([manifest]), true, 'blocks saved in any order are reassembled and whole-file checked');
const restored = await storage.createBlob(manifest);
assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), bytes);
assert.equal(restored.type, manifest.mime);

const firstKey = `${manifest.transferId}:0`;
const damaged = records.get(firstKey);
records.set(firstKey, { ...damaged, bytes: new Uint8Array(damaged.bytes).fill(0) });
assert.equal(await storage.verifyFiles([manifest]), false, 'corrupt local blocks prevent completion');
assert.equal(await storage.createBlob(manifest), null, 'corrupt blocks never become a downloadable Blob');
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

console.log('PASS direct file storage: bounded local blocks, out-of-order assembly, whole-file hash and corrupt-block rejection');
