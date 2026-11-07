'use strict';
(() => {
  const Chunks = globalThis.PropertyDirectFileChunks;
  const STORAGE_VERSION = 1;
  const KEY_INFO = new TextEncoder().encode('Property direct-file blocks at rest v1');

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function create({ putPart, listParts, deleteParts = async () => {}, deleteSessionParts = async () => {},
    getIdentity, crypto: cryptoImpl = globalThis.crypto, hashImplementation } = {}) {
    if (!Chunks || typeof putPart !== 'function' || typeof listParts !== 'function' || typeof getIdentity !== 'function') {
      throw new TypeError('Direct file storage needs the local block protocol, identity provider and storage callbacks.');
    }

    async function getHash() {
      if (hashImplementation?.sha256?.create) return hashImplementation;
      return import('./chess/vendor/noble-hashes/sha2.js');
    }

    const pendingSessionWrites = new Map();

    let cachedIdentity = null;
    let cachedKey = null;

    function currentIdentity() {
      const identity = getIdentity();
      if (!identity || !(identity.secret instanceof Uint8Array) || identity.secret.byteLength !== 32 ||
          !/^[0-9a-f]{64}$/i.test(identity.pubkey || '')) throw new Error('Unlock the Property identity to access direct files.');
      return identity;
    }

    async function keyFor(identity) {
      if (cachedKey && cachedIdentity?.secret === identity.secret && cachedIdentity.pubkey === identity.pubkey) return cachedKey;
      const materialBytes = identity.secret.slice();
      try {
        const material = await cryptoImpl.subtle.importKey('raw', materialBytes, 'HKDF', false, ['deriveKey']);
        const salt = new Uint8Array(identity.pubkey.match(/.{2}/g).map(value => Number.parseInt(value, 16)));
        cachedKey = await cryptoImpl.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: KEY_INFO }, material,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        cachedIdentity = { secret: identity.secret, pubkey: identity.pubkey };
        return cachedKey;
      } finally { materialBytes.fill(0); }
    }

    function assertIdentity(identity) {
      const current = currentIdentity();
      if (current.secret !== identity.secret || current.pubkey !== identity.pubkey) {
        throw new Error('The Property identity changed while direct files were being processed.');
      }
    }

    function recordAad(identity, record) {
      return new TextEncoder().encode(`${identity.pubkey}:${record.transferId}:${record.index}:${record.sha256}`);
    }

    async function encryptRecord(record, bytes, identity, key) {
      const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
      const cipher = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(identity, record), tagLength: 128 }, key, bytes);
      assertIdentity(identity);
      return { ...record, ownerPubkey: identity.pubkey, storageVersion: STORAGE_VERSION, iv, bytes: new Uint8Array(cipher) };
    }

    async function decryptRecord(record, identity, key, expectedBytes) {
      if (record?.ownerPubkey !== undefined && record.ownerPubkey !== identity.pubkey) return null;
      if (record?.storageVersion !== undefined && record.storageVersion !== STORAGE_VERSION) return null;
      if (record?.storageVersion === STORAGE_VERSION) {
        const iv = asBytes(record.iv);
        const cipher = asBytes(record.bytes);
        if (!iv || iv.byteLength !== 12 || !cipher || cipher.byteLength !== expectedBytes + 16) return null;
        try {
          const plain = new Uint8Array(await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv,
            additionalData: recordAad(identity, record), tagLength: 128 }, key, cipher));
          return plain.byteLength === expectedBytes ? plain : null;
        } catch { return null; }
      }
      // Upgrade blocks written by the previous release when the matching identity opens them.
      const legacy = asBytes(record?.bytes);
      if (!legacy || legacy.byteLength !== expectedBytes) return null;
      return legacy.slice();
    }

    async function writePart({ file, index, bytes: rawBytes, sha256, sessionId = '', peer = '', direction = '' }) {
      const bytes = asBytes(rawBytes);
      if (!bytes || !file || !Chunks.normalizeFileManifests([file]) ||
          bytes.byteLength !== Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index) ||
          !/^[0-9a-f]{64}$/i.test(sha256 || '') || (await Chunks.digestHex(bytes, cryptoImpl)) !== sha256.toLowerCase()) return false;
      const identity = currentIdentity();
      const key = await keyFor(identity);
      const record = { transferId: file.transferId, index, sha256: sha256.toLowerCase(),
        ...(sessionId ? { sessionId } : {}), ...(peer ? { peer } : {}), ...(direction ? { direction } : {}) };
      await putPart(await encryptRecord(record, bytes, identity, key));
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
      let identity;
      try { identity = currentIdentity(); } catch { return null; }
      const key = await keyFor(identity);
      const records = await listParts(file.transferId);
      if (!Array.isArray(records) || records.length !== file.totalChunks) return null;
      const parts = records.slice().sort((left, right) => left.index - right.index);
      const hash = (await getHash()).sha256.create();
      let totalBytes = 0;
      for (let index = 0; index < parts.length; index += 1) {
        const record = parts[index];
        const bytesExpected = Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index);
        if (!record || record.index !== index || !/^[0-9a-f]{64}$/i.test(record.sha256 || '')) return null;
        const bytes = await decryptRecord(record, identity, key, bytesExpected);
        if (!bytes || (await Chunks.digestHex(bytes, cryptoImpl)) !== record.sha256.toLowerCase()) return null;
        assertIdentity(identity);
        if (record.storageVersion !== STORAGE_VERSION || record.ownerPubkey !== identity.pubkey) {
          await putPart(await encryptRecord(record, bytes, identity, key));
        }
        totalBytes += bytes.byteLength;
        hash.update(bytes);
        parts[index] = bytes;
      }
      if (totalBytes !== file.sizeBytes || [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('') !== file.sha256) return null;
      assertIdentity(identity);
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

    function clearKey() {
      cachedIdentity = null;
      cachedKey = null;
    }

    return Object.freeze({ savePart, verifyFiles, createBlob, clearKey,
      deleteParts: transferId => deleteParts(transferId), discardSession });
  }

  globalThis.PropertyDirectFileStorage = Object.freeze({ create });
})();
