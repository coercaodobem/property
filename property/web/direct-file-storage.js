'use strict';
(() => {
  const Chunks = globalThis.PropertyDirectFileChunks;

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function create({ putPart, listParts, deleteParts = async () => {}, deleteSessionParts = async () => {}, crypto: cryptoImpl = globalThis.crypto, hashImplementation } = {}) {
    if (!Chunks || typeof putPart !== 'function' || typeof listParts !== 'function') {
      throw new TypeError('Direct file storage needs the local block protocol and storage callbacks.');
    }

    async function getHash() {
      if (hashImplementation?.sha256?.create) return hashImplementation;
      return import('./chess/vendor/noble-hashes/sha2.js');
    }

    const pendingSessionWrites = new Map();

    async function writePart({ file, index, bytes: rawBytes, sha256, sessionId = '', peer = '', direction = '' }) {
      const bytes = asBytes(rawBytes);
      if (!bytes || !file || !Chunks.normalizeFileManifests([file]) ||
          bytes.byteLength !== Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index) ||
          !/^[0-9a-f]{64}$/i.test(sha256 || '') || (await Chunks.digestHex(bytes, cryptoImpl)) !== sha256.toLowerCase()) return false;
      await putPart({ transferId: file.transferId, index, bytes: bytes.slice(), sha256: sha256.toLowerCase(),
        ...(sessionId ? { sessionId } : {}), ...(peer ? { peer } : {}), ...(direction ? { direction } : {}) });
      return true;
    }

    function savePart(options) {
      const sessionId = String(options?.sessionId || '');
      if (!sessionId) return writePart(options || {});
      const previous = pendingSessionWrites.get(sessionId) || Promise.resolve();
      const operation = previous.catch(() => {}).then(() => writePart(options || {}));
      pendingSessionWrites.set(sessionId, operation);
      return operation.finally(() => {
        if (pendingSessionWrites.get(sessionId) === operation) pendingSessionWrites.delete(sessionId);
      });
    }

    async function discardSession(sessionId) {
      const id = String(sessionId || '');
      const pending = pendingSessionWrites.get(id);
      if (pending) await pending.catch(() => {});
      return deleteSessionParts(id);
    }

    async function verifiedParts(file) {
      if (!file || !Chunks.normalizeFileManifests([file])) return null;
      const records = await listParts(file.transferId);
      if (!Array.isArray(records) || records.length !== file.totalChunks) return null;
      const parts = records.slice().sort((left, right) => left.index - right.index);
      const hash = (await getHash()).sha256.create();
      let totalBytes = 0;
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const bytes = asBytes(part?.bytes);
        if (!bytes || part.index !== index || bytes.byteLength !== Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index) ||
            !/^[0-9a-f]{64}$/i.test(part.sha256 || '') || (await Chunks.digestHex(bytes, cryptoImpl)) !== part.sha256.toLowerCase()) return null;
        totalBytes += bytes.byteLength;
        hash.update(bytes);
        parts[index] = bytes;
      }
      if (totalBytes !== file.sizeBytes || [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('') !== file.sha256) return null;
      return parts;
    }

    async function verifyFiles(files) {
      const normalized = Chunks.normalizeFileManifests(files);
      if (!normalized) return false;
      for (const file of normalized) if (!(await verifiedParts(file))) return false;
      return true;
    }

    async function createBlob(file) {
      const parts = await verifiedParts(file);
      return parts ? new Blob(parts, { type: file.mime }) : null;
    }

    return Object.freeze({ savePart, verifyFiles, createBlob, deleteParts: transferId => deleteParts(transferId), discardSession });
  }

  globalThis.PropertyDirectFileStorage = Object.freeze({ create });
})();
