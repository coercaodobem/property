'use strict';
(() => {
  const MAGIC = 'PFC2';
  const HEADER_BYTES = 65;
  const CHUNK_BYTES = 48 * 1024;
  const MAX_FILE_BYTES = 100 * 1024 * 1024;
  const MAX_BATCH_BYTES = 100 * 1024 * 1024;
  const MAX_FILES = 5;
  const ACK_WINDOW = 16;
  const TRANSFER_ID_RE = /^[0-9a-f]{32}$/i;
  const HASH_RE = /^[0-9a-f]{64}$/i;

  function expectedChunkCount(sizeBytes) {
    return Math.max(1, Math.ceil(sizeBytes / CHUNK_BYTES));
  }

  function expectedChunkSize(sizeBytes, totalChunks, index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= totalChunks) return -1;
    if (sizeBytes === 0) return 0;
    return index < totalChunks - 1 ? CHUNK_BYTES : sizeBytes - CHUNK_BYTES * (totalChunks - 1);
  }

  function expectedPart(files, sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
    let next = 0;
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      for (let index = 0; index < file.totalChunks; index += 1) {
        next += 1;
        if (next === sequence) return { fileIndex, index, file };
      }
    }
    return null;
  }

  function normalizeFileManifests(files) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) return null;
    const seen = new Set();
    let totalBytes = 0;
    const normalized = [];
    for (const file of files) {
      if (!file || !TRANSFER_ID_RE.test(file.transferId || '') || seen.has(file.transferId.toLowerCase()) ||
          typeof file.name !== 'string' || file.name.length < 1 || file.name.length > 128 ||
          file.name !== file.name.trim() || /[\\/\u0000-\u001f\u007f]/u.test(file.name) ||
          typeof file.mime !== 'string' || file.mime.length > 128 ||
          !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(file.mime) ||
          !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_FILE_BYTES ||
          file.chunkBytes !== CHUNK_BYTES || !Number.isSafeInteger(file.totalChunks) ||
          file.totalChunks !== expectedChunkCount(file.sizeBytes) || !HASH_RE.test(file.sha256 || '')) return null;
      seen.add(file.transferId.toLowerCase());
      totalBytes += file.sizeBytes;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_BATCH_BYTES) return null;
      normalized.push(Object.freeze({ transferId: file.transferId.toLowerCase(), name: file.name, mime: file.mime,
        sizeBytes: file.sizeBytes, chunkBytes: CHUNK_BYTES, totalChunks: file.totalChunks, sha256: file.sha256.toLowerCase() }));
    }
    return Object.freeze(normalized);
  }

  function hexBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }

  function bytesHex(bytes) {
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function encodePart({ transferId, sequence, fileIndex, index, bytes, sha256 }) {
    const payload = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
    if (!TRANSFER_ID_RE.test(transferId || '') || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0xffffffff ||
        !Number.isSafeInteger(fileIndex) || fileIndex < 0 || fileIndex >= MAX_FILES ||
        !Number.isSafeInteger(index) || index < 0 || index > 0xffffffff || !payload || payload.byteLength > CHUNK_BYTES ||
        !HASH_RE.test(sha256 || '')) return null;
    const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
    frame.set([0x50, 0x46, 0x43, 0x32], 0);
    frame.set(hexBytes(transferId.toLowerCase()), 4);
    const view = new DataView(frame.buffer);
    view.setUint32(20, sequence, false);
    frame[24] = fileIndex;
    view.setUint32(25, index, false);
    view.setUint32(29, payload.byteLength, false);
    frame.set(hexBytes(sha256.toLowerCase()), 33);
    frame.set(payload, HEADER_BYTES);
    return frame;
  }

  function decodePart(value) {
    const frame = value instanceof ArrayBuffer ? new Uint8Array(value)
      : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
    if (!frame || frame.byteLength < HEADER_BYTES || frame.byteLength > HEADER_BYTES + CHUNK_BYTES ||
        frame[0] !== 0x50 || frame[1] !== 0x46 || frame[2] !== 0x43 || frame[3] !== 0x32) return null;
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const sizeBytes = view.getUint32(29, false);
    if (frame.byteLength !== HEADER_BYTES + sizeBytes) return null;
    const transferId = bytesHex(frame.subarray(4, 20));
    const sequence = view.getUint32(20, false);
    const fileIndex = frame[24];
    const index = view.getUint32(25, false);
    const sha256 = bytesHex(frame.subarray(33, 65));
    if (!TRANSFER_ID_RE.test(transferId) || sequence < 1 || fileIndex >= MAX_FILES || !HASH_RE.test(sha256)) return null;
    return Object.freeze({ transferId, sequence, fileIndex, index, sizeBytes, sha256,
      bytes: frame.slice(HEADER_BYTES) });
  }

  async function digestHex(bytes, cryptoImpl = globalThis.crypto) {
    const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
    return bytesHex(new Uint8Array(digest));
  }

  async function verifyPart(part, file, cryptoImpl = globalThis.crypto, expectedTransferId = file?.transferId) {
    if (!part || !file || part.transferId !== expectedTransferId || part.sizeBytes !== part.bytes.byteLength ||
        part.sizeBytes !== expectedChunkSize(file.sizeBytes, file.totalChunks, part.index)) return false;
    return (await digestHex(part.bytes, cryptoImpl)) === part.sha256;
  }

  async function createManifest(file, { transferId, hashImplementation, cryptoImpl = globalThis.crypto, onProgress = () => {} } = {}) {
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES ||
        !TRANSFER_ID_RE.test(transferId || '')) throw new RangeError(`Choose a file no larger than ${MAX_FILE_BYTES} bytes.`);
    let hashModule = hashImplementation;
    if (!hashModule?.sha256?.create) hashModule = await import('./chess/vendor/noble-hashes/sha2.js');
    const hasher = hashModule.sha256.create();
    let processed = 0;
    if (typeof file.stream === 'function') {
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          processed += bytes.byteLength;
          if (processed > file.size) throw new Error('The file changed while it was being prepared. Choose it again.');
          hasher.update(bytes);
          onProgress(processed, file.size);
        }
      } finally { reader.releaseLock?.(); }
    } else {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const bytes = new Uint8Array(await file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size)).arrayBuffer());
        processed += bytes.byteLength;
        hasher.update(bytes);
        onProgress(processed, file.size);
      }
    }
    if (processed !== file.size) throw new Error('The file changed while it was being prepared. Choose it again.');
    const digest = bytesHex(hasher.digest());
    const name = String(file.name || 'attachment').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128) || 'attachment';
    return Object.freeze({ transferId: transferId.toLowerCase(), name,
      mime: /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.type || '') ? file.type.toLowerCase() : 'application/octet-stream',
      sizeBytes: file.size, chunkBytes: CHUNK_BYTES, totalChunks: expectedChunkCount(file.size), sha256: digest });
  }

  async function readChunk(file, manifest, index, cryptoImpl = globalThis.crypto) {
    if (!file || !manifest || file.size !== manifest.sizeBytes || !Number.isSafeInteger(index) || index < 0 || index >= manifest.totalChunks) return null;
    const offset = index * CHUNK_BYTES;
    const bytes = new Uint8Array(await file.slice(offset, Math.min(offset + CHUNK_BYTES, manifest.sizeBytes)).arrayBuffer());
    if (bytes.byteLength !== expectedChunkSize(manifest.sizeBytes, manifest.totalChunks, index)) return null;
    return Object.freeze({ bytes, sha256: await digestHex(bytes, cryptoImpl) });
  }

  globalThis.PropertyDirectFileChunks = Object.freeze({ MAGIC, HEADER_BYTES, CHUNK_BYTES, MAX_FILE_BYTES, MAX_BATCH_BYTES,
    MAX_FILES, ACK_WINDOW, expectedChunkCount, expectedChunkSize, expectedPart, normalizeFileManifests,
    encodePart, decodePart, digestHex, verifyPart, createManifest, readChunk });
})();
