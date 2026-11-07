'use strict';
(() => {
  const Chunks = globalThis.PropertyDirectFileChunks;
  const STORAGE_VERSION = 3;
  const KEY_INFO = new TextEncoder().encode('Property direct-file blocks at rest v1');

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function create({ putPart, listParts, listResumeTransferIds, deleteParts = async () => {}, deleteSessionParts = async () => {},
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
      const legacy = `${identity.pubkey}:${record.transferId}:${record.index}:${record.sha256}`;
      if (record.storageVersion === 1) return new TextEncoder().encode(legacy);
      if (record.storageVersion === 2) return new TextEncoder().encode(`${legacy}:${record.manifestHash}`);
      return new TextEncoder().encode(`${legacy}:${record.manifestHash}:${record.resumeFingerprint}:${record.peer || ''}:${record.direction || ''}`);
    }

    async function encryptRecord(record, bytes, identity, key) {
      const storedRecord = { ...record, ownerPubkey: identity.pubkey, storageVersion: STORAGE_VERSION };
      const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
      const cipher = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(identity, storedRecord), tagLength: 128 }, key, bytes);
      assertIdentity(identity);
      return { ...storedRecord, iv, bytes: new Uint8Array(cipher) };
    }

    async function decryptRecord(record, identity, key, expectedBytes) {
      if (record?.ownerPubkey !== undefined && record.ownerPubkey !== identity.pubkey) return null;
      if (record?.storageVersion !== undefined && ![1, 2, STORAGE_VERSION].includes(record.storageVersion)) return null;
      if ([1, 2, STORAGE_VERSION].includes(record?.storageVersion)) {
        if (record.storageVersion >= 2 && !/^[0-9a-f]{64}$/i.test(record.manifestHash || '')) return null;
        if (record.storageVersion === STORAGE_VERSION && !/^[0-9a-f]{64}$/i.test(record.resumeFingerprint || '')) return null;
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

    async function manifestHashFor(file) {
      const normalized = Chunks.normalizeFileManifests([file]);
      if (!normalized) return null;
      const item = normalized[0];
      const canonical = JSON.stringify([item.transferId, item.name, item.mime, item.sizeBytes,
        item.chunkBytes, item.totalChunks, item.sha256]);
      return Chunks.digestHex(new TextEncoder().encode(canonical), cryptoImpl);
    }

    async function resumeFingerprintFor(file) {
      const normalized = Chunks.normalizeFileManifests([file]);
      if (!normalized) return null;
      const item = normalized[0];
      const canonical = JSON.stringify(['property-direct-file-resume-v1', item.name, item.mime, item.sizeBytes,
        item.chunkBytes, item.totalChunks, item.sha256]);
      return Chunks.digestHex(new TextEncoder().encode(canonical), cryptoImpl);
    }

    async function writePart({ file, index, bytes: rawBytes, sha256, sessionId = '', peer = '', direction = '' }) {
      const bytes = asBytes(rawBytes);
      const manifestHash = await manifestHashFor(file);
      const resumeFingerprint = await resumeFingerprintFor(file);
      if (!bytes || !manifestHash || !resumeFingerprint ||
          bytes.byteLength !== Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index) ||
          !/^[0-9a-f]{64}$/i.test(sha256 || '') || (await Chunks.digestHex(bytes, cryptoImpl)) !== sha256.toLowerCase()) return false;
      const identity = currentIdentity();
      const key = await keyFor(identity);
      const record = { transferId: file.transferId, index, sha256: sha256.toLowerCase(), manifestHash, resumeFingerprint,
        ...(sessionId ? { sessionId } : {}), ...(peer ? { peer: String(peer).toLowerCase() } : {}), ...(direction ? { direction } : {}) };
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
      const manifestHash = await manifestHashFor(file);
      const resumeFingerprint = await resumeFingerprintFor(file);
      if (!manifestHash || !resumeFingerprint) return null;
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
        if (record.storageVersion >= 2 && record.manifestHash !== manifestHash) return null;
        if (record.storageVersion === STORAGE_VERSION && record.resumeFingerprint !== resumeFingerprint) return null;
        const bytes = await decryptRecord(record, identity, key, bytesExpected);
        if (!bytes || (await Chunks.digestHex(bytes, cryptoImpl)) !== record.sha256.toLowerCase()) return null;
        assertIdentity(identity);
        if (record.storageVersion !== STORAGE_VERSION || record.ownerPubkey !== identity.pubkey ||
            record.manifestHash !== manifestHash || record.resumeFingerprint !== resumeFingerprint) {
          await putPart(await encryptRecord({ ...record, manifestHash, resumeFingerprint }, bytes, identity, key));
        }
        totalBytes += bytes.byteLength;
        hash.update(bytes);
        parts[index] = bytes;
      }
      if (totalBytes !== file.sizeBytes || [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('') !== file.sha256) return null;
      assertIdentity(identity);
      return parts;
    }

    async function verifiedResumeOffsets(files, peer) {
      const normalized = Chunks.normalizeFileManifests(files);
      const recipient = String(peer || '').toLowerCase();
      if (!normalized || !/^[0-9a-f]{64}$/.test(recipient)) return null;
      let identity;
      try { identity = currentIdentity(); } catch { return normalized.map(() => 0); }
      const key = await keyFor(identity);
      const offsets = normalized.map(() => 0);
      for (let fileIndex = 0; fileIndex < normalized.length; fileIndex += 1) {
        const file = normalized[fileIndex];
        const manifestHash = await manifestHashFor(file);
        const resumeFingerprint = await resumeFingerprintFor(file);
        let records = await listParts(file.transferId);
        if (!manifestHash || !resumeFingerprint || !Array.isArray(records)) break;

        async function verifiedPrefix(candidateRecords, candidateFile, candidateManifestHash, exactTransfer) {
          const byIndex = new Map();
          for (const record of candidateRecords) {
            if (!Number.isSafeInteger(record?.index) || record.index < 0 || record.index >= file.totalChunks ||
                byIndex.has(record.index)) return 0;
            byIndex.set(record.index, record);
          }
          const hash = (await getHash()).sha256.create();
          let count = 0;
          let totalBytes = 0;
          for (let index = 0; index < file.totalChunks; index += 1) {
            const record = byIndex.get(index);
            const peerMatches = String(record?.peer || '').toLowerCase() === recipient;
            if (!record || record.transferId !== candidateFile.transferId || !peerMatches || record.direction !== 'received' ||
                (record.storageVersion >= 2 && record.manifestHash !== candidateManifestHash) ||
                (record.storageVersion === STORAGE_VERSION && record.resumeFingerprint !== resumeFingerprint) ||
                (record.storageVersion !== STORAGE_VERSION && !exactTransfer) ||
                !/^[0-9a-f]{64}$/i.test(record.sha256 || '')) break;
            const expectedBytes = Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index);
            const bytes = await decryptRecord(record, identity, key, expectedBytes);
            if (!bytes || (await Chunks.digestHex(bytes, cryptoImpl)) !== record.sha256.toLowerCase()) break;
            assertIdentity(identity);
            if (record.storageVersion !== STORAGE_VERSION || record.ownerPubkey !== identity.pubkey ||
                record.manifestHash !== candidateManifestHash || record.resumeFingerprint !== resumeFingerprint ||
                String(record.peer || '').toLowerCase() !== recipient) {
              if (!(await writePart({ file: candidateFile, index, bytes, sha256: record.sha256, sessionId: record.sessionId || '',
                peer: recipient, direction: 'received' }))) break;
            }
            hash.update(bytes);
            totalBytes += bytes.byteLength;
            count += 1;
          }
          if (count === file.totalChunks && (totalBytes !== file.sizeBytes ||
              [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('') !== file.sha256)) return 0;
          return count;
        }

        let best = { transferId: file.transferId, file, count: await verifiedPrefix(records, file, manifestHash, true) };
        records = [];

        if (best.count === 0 && typeof listResumeTransferIds === 'function') {
          let candidateIds = [];
          try { candidateIds = await listResumeTransferIds(recipient, resumeFingerprint); } catch { candidateIds = []; }
          const uniqueIds = [...new Set(Array.isArray(candidateIds) ? candidateIds : [])]
            .filter(id => typeof id === 'string' && /^[0-9a-f]{32}$/i.test(id) && id !== file.transferId)
            .sort((left, right) => left.localeCompare(right));
          for (const transferId of uniqueIds) {
            const candidateFile = { ...file, transferId };
            const candidateManifestHash = await manifestHashFor(candidateFile);
            let candidateRecords = [];
            try { candidateRecords = await listParts(transferId); } catch { continue; }
            const count = await verifiedPrefix(candidateRecords, candidateFile, candidateManifestHash, false);
            candidateRecords = [];
            if (count > best.count) best = { transferId, file: candidateFile, count };
            if (best.count === file.totalChunks) break;
          }
        }

        if (best.count > 0 && best.transferId !== file.transferId) {
          let sourceRecords;
          try { sourceRecords = await listParts(best.transferId); } catch { best.count = 0; sourceRecords = []; }
          const sourceManifestHash = await manifestHashFor(best.file);
          const sourceCount = await verifiedPrefix(sourceRecords, best.file, sourceManifestHash, false);
          if (sourceCount < best.count) best.count = 0;
          const sourceByIndex = new Map(sourceRecords.map(record => [record.index, record]));
          for (let index = 0; index < best.count; index += 1) {
            const record = sourceByIndex.get(index);
            const bytes = await decryptRecord(record, identity, key, Chunks.expectedChunkSize(file.sizeBytes, file.totalChunks, index));
            if (!bytes || !(await writePart({ file, index, bytes, sha256: record.sha256, peer: recipient, direction: 'received' }))) {
              best.count = 0;
              break;
            }
          }
        }
        offsets[fileIndex] = best.count;
        if (best.count < file.totalChunks) break;
      }
      assertIdentity(identity);
      return offsets;
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

    return Object.freeze({ savePart, verifyFiles, createBlob, verifiedResumeOffsets, clearKey,
      deleteParts: transferId => deleteParts(transferId), discardSession });
  }

  globalThis.PropertyDirectFileStorage = Object.freeze({ create });
})();
