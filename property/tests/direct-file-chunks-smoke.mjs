import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../web/direct-file-chunks.js', import.meta.url), 'utf8');
const hashImplementation = await import('../web/chess/vendor/noble-hashes/sha2.js');
const context = { crypto: webcrypto, Uint8Array, ArrayBuffer, DataView, TextEncoder };
vm.runInNewContext(source, context, { timeout: 5000 });
const DirectFiles = context.PropertyDirectFileChunks;

const bytes = Uint8Array.from({ length: DirectFiles.CHUNK_BYTES + 37 }, (_, index) => index % 251);
const blob = new Blob([bytes], { type: 'application/octet-stream' });
Object.defineProperties(blob, { name: { value: '../archive.bin' } });
const manifest = await DirectFiles.createManifest(blob, { transferId: '12'.repeat(16), hashImplementation });
assert.equal(manifest.name, 'archive.bin');
assert.equal(manifest.sizeBytes, bytes.byteLength);
assert.equal(manifest.totalChunks, 2);
assert.equal(manifest.sha256, Buffer.from(hashImplementation.sha256(bytes)).toString('hex'));
const first = await DirectFiles.readChunk(blob, manifest, 0, webcrypto);
const second = await DirectFiles.readChunk(blob, manifest, 1, webcrypto);
assert.equal(first.bytes.byteLength, DirectFiles.CHUNK_BYTES);
assert.equal(second.bytes.byteLength, 37);

const encoded = DirectFiles.encodePart({ transferId: manifest.transferId, sequence: 2, fileIndex: 0,
  index: 1, bytes: second.bytes, sha256: second.sha256 });
const decoded = DirectFiles.decodePart(encoded.buffer);
assert.equal(decoded.transferId, manifest.transferId);
assert.equal(decoded.sequence, 2);
assert.equal(decoded.fileIndex, 0);
assert.equal(decoded.index, 1);
assert.equal(decoded.sizeBytes, 37);
assert.equal(await DirectFiles.verifyPart(decoded, manifest, webcrypto), true);
const damaged = encoded.slice(); damaged[DirectFiles.HEADER_BYTES] ^= 0xff;
assert.equal(await DirectFiles.verifyPart(DirectFiles.decodePart(damaged.buffer), manifest, webcrypto), false);
assert.equal(DirectFiles.decodePart(encoded.subarray(0, DirectFiles.HEADER_BYTES - 1)), null);

const normalized = DirectFiles.normalizeFileManifests([manifest]);
assert.equal(normalized[0].transferId, manifest.transferId);
assert.equal(DirectFiles.normalizeFileManifests([{ ...manifest, sizeBytes: DirectFiles.MAX_FILE_BYTES + 1,
  totalChunks: DirectFiles.expectedChunkCount(DirectFiles.MAX_FILE_BYTES + 1) }]), null);
assert.equal(DirectFiles.normalizeFileManifests([{ ...manifest, chunkBytes: 12000 }]), null);
assert.equal(DirectFiles.expectedPart([manifest], 2).index, 1);
assert.equal(DirectFiles.expectedPart([manifest], 3), null);

console.log(`PASS direct file blocks: ${manifest.totalChunks} fixed-size blocks, bounded frame, stream hash, per-block integrity and 100 MiB manifest cap`);
