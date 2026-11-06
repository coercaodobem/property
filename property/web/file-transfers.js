'use strict';
(() => {
  // Nostr relays cap individual events. Files travel as independently encrypted
  // NIP-17 chunk messages, then are reassembled and hash-checked on the device.
  const TAG = 'property-file-chunk-v1';
  const VERSION = 1;
  const CHUNK_BYTES = 12_000;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_CHUNKS = Math.ceil(MAX_FILE_BYTES / CHUNK_BYTES);
  const MAX_RELAY_EVENT_BYTES = 60_000;
  const MAX_NAME_CHARS = 128;
  const MAX_MIME_CHARS = 128;
  const MAX_CAPTION_CHARS = 1_000;
  const MAX_BASE64_CHARS = Math.ceil(CHUNK_BYTES / 3) * 4;

  function digestHex(bytes, cryptoImpl = globalThis.crypto) {
    return cryptoImpl.subtle.digest('SHA-256', bytes).then(digest =>
      [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x4000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x4000)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof value !== 'string' || value.length > MAX_BASE64_CHARS ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
    try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
    catch { return null; }
  }

  function safeName(value) {
    const leaf = String(value || '').split(/[\\/]/).pop() || 'attachment';
    const clean = Array.from(leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, MAX_NAME_CHARS).join('');
    return clean || 'attachment';
  }

  function safeMime(value) {
    const mime = String(value || '').trim().toLowerCase();
    return mime.length <= MAX_MIME_CHARS && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)
      ? mime : 'application/octet-stream';
  }

  function previewKind(value) {
    const mime = safeMime(value);
    if (['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(mime)) return 'image';
    if (['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'].includes(mime)) return 'audio';
    if (['video/mp4', 'video/webm'].includes(mime)) return 'video';
    return '';
  }

  function randomTransferId(cryptoImpl = globalThis.crypto) {
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function expectedChunkCount(sizeBytes) {
    return Math.max(1, Math.ceil(sizeBytes / CHUNK_BYTES));
  }

  function expectedChunkSize(sizeBytes, totalChunks, index) {
    if (sizeBytes === 0) return 0;
    return index < totalChunks - 1 ? CHUNK_BYTES : sizeBytes - CHUNK_BYTES * (totalChunks - 1);
  }

  async function createTransfer(file, { cryptoImpl = globalThis.crypto, transferId = randomTransferId(cryptoImpl), caption = '' } = {}) {
    if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
      throw new RangeError(`Choose a file no larger than ${MAX_FILE_BYTES} bytes.`);
    }
    if (!/^[0-9a-f]{32}$/.test(transferId)) throw new TypeError('The file transfer identifier is invalid.');
    const name = safeName(file.name);
    const mime = safeMime(file.type);
    caption = Array.from(String(caption || '').trim()).slice(0, MAX_CAPTION_CHARS).join('');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) throw new Error('The file changed while it was being prepared. Choose it again.');
    const sha256 = await digestHex(bytes, cryptoImpl);
    const totalChunks = expectedChunkCount(bytes.byteLength);
    const chunks = [];
    for (let index = 0; index < totalChunks; index += 1) {
      const part = bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES));
      const partHash = await digestHex(part, cryptoImpl);
      const tag = [
        TAG, transferId, String(index), String(totalChunks), name, mime,
        String(bytes.byteLength), sha256, partHash, bytesToBase64(part)
      ];
      if (index === 0) tag.push(caption);
      Object.freeze(tag);
      chunks.push(Object.freeze({ version: VERSION, transferId, index, totalChunks, name, mime, sizeBytes: bytes.byteLength, sha256, chunkSha256: partHash, base64: tag[9], ...(index === 0 ? { caption } : {}), tag }));
    }
    return Object.freeze({ version: VERSION, transferId, name, mime, sizeBytes: bytes.byteLength, sha256, chunks: Object.freeze(chunks) });
  }

  async function fromTags(tags, cryptoImpl = globalThis.crypto) {
    if (!Array.isArray(tags)) return null;
    const matches = tags.filter(tag => Array.isArray(tag) && tag[0] === TAG);
    if (matches.length !== 1) return null;
    const tag = matches[0];
    if (![10, 11].includes(tag.length) || !/^[0-9a-f]{32}$/.test(tag[1] || '') ||
        !/^(0|[1-9][0-9]*)$/.test(tag[2] || '') || !/^[1-9][0-9]*$/.test(tag[3] || '') ||
        !/^(0|[1-9][0-9]*)$/.test(tag[6] || '') || !/^[0-9a-f]{64}$/.test(tag[7] || '') || !/^[0-9a-f]{64}$/.test(tag[8] || '')) return null;
    const index = Number(tag[2]);
    const totalChunks = Number(tag[3]);
    const sizeBytes = Number(tag[6]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(totalChunks) || !Number.isSafeInteger(sizeBytes) ||
        totalChunks > MAX_CHUNKS || index >= totalChunks || sizeBytes > MAX_FILE_BYTES ||
        totalChunks !== expectedChunkCount(sizeBytes) || tag[4] !== safeName(tag[4]) ||
        (tag.length === 11 && index !== 0) ||
        (tag.length === 11 && (typeof tag[10] !== 'string' || Array.from(tag[10]).length > MAX_CAPTION_CHARS)) ||
        typeof tag[5] !== 'string' || tag[5].length > MAX_MIME_CHARS || tag[5] !== safeMime(tag[5])) return null;
    const bytes = base64ToBytes(tag[9]);
    if (!bytes || bytes.byteLength !== expectedChunkSize(sizeBytes, totalChunks, index) ||
        await digestHex(bytes, cryptoImpl) !== tag[8]) return null;
    return Object.freeze({ version: VERSION, transferId: tag[1], index, totalChunks, name: tag[4], mime: tag[5], sizeBytes, sha256: tag[7], chunkSha256: tag[8], base64: tag[9], ...(tag.length === 11 ? { caption: tag[10] } : {}) });
  }

  async function assemble(chunks, cryptoImpl = globalThis.crypto) {
    if (!Array.isArray(chunks) || !chunks.length || chunks.length > MAX_CHUNKS) return null;
    const first = chunks[0];
    if (!first || first.version !== VERSION || chunks.length !== first.totalChunks || first.totalChunks !== expectedChunkCount(first.sizeBytes)) return null;
    const ordered = new Array(first.totalChunks);
    for (const chunk of chunks) {
      if (!chunk || chunk.version !== VERSION || chunk.transferId !== first.transferId || chunk.totalChunks !== first.totalChunks ||
          chunk.name !== first.name || chunk.mime !== first.mime || chunk.sizeBytes !== first.sizeBytes || chunk.sha256 !== first.sha256 ||
          !Number.isSafeInteger(chunk.index) || chunk.index < 0 || chunk.index >= ordered.length || ordered[chunk.index]) return null;
      const bytes = base64ToBytes(chunk.base64);
      if (!bytes || bytes.byteLength !== expectedChunkSize(first.sizeBytes, first.totalChunks, chunk.index) ||
          await digestHex(bytes, cryptoImpl) !== chunk.chunkSha256) return null;
      ordered[chunk.index] = bytes;
    }
    if (ordered.some(bytes => !bytes)) return null;
    const bytes = new Uint8Array(first.sizeBytes);
    let offset = 0;
    for (const part of ordered) { bytes.set(part, offset); offset += part.byteLength; }
    if (offset !== first.sizeBytes || await digestHex(bytes, cryptoImpl) !== first.sha256) return null;
    const manifest = chunks.find(chunk => chunk.index === 0);
    return Object.freeze({ ...manifest, bytes, blob: new Blob([bytes], { type: manifest.mime }) });
  }

  function coalesceMessages(messages) {
    const ordinary = [];
    const transfers = new Map();
    for (const message of messages) {
      const chunk = message?.fileChunk;
      if (!chunk || chunk.version !== VERSION || !/^[0-9a-f]{32}$/.test(chunk.transferId || '')) { ordinary.push(message); continue; }
      const key = `${message.peer || ''}:${message.senderPubkey || ''}:${chunk.transferId}`;
      const group = transfers.get(key) || { records: [], byIndex: new Map(), conflict: false };
      group.records.push(message);
      const prior = group.byIndex.get(chunk.index);
      if (prior && (prior.chunkSha256 !== chunk.chunkSha256 || prior.sha256 !== chunk.sha256)) group.conflict = true;
      else if (!prior || (message.createdAt || 0) < (prior.record.createdAt || 0)) group.byIndex.set(chunk.index, { ...chunk, record: message });
      transfers.set(key, group);
    }
    for (const group of transfers.values()) {
      const parts = [...group.byIndex.values()].map(part => {
        const { record, ...chunk } = part;
        return chunk;
      });
      const first = group.byIndex.get(0);
      const earliest = [...group.records].sort((a, b) => a.createdAt - b.createdAt)[0];
      const source = first?.record || earliest;
      const chunk = first || source.fileChunk;
      const records = group.records;
      const ids = records.map(record => record.nostrEventId).filter(id => typeof id === 'string' && /^[0-9a-f]{64}$/i.test(id));
      const inconsistentMetadata = parts.some(part => part.transferId !== chunk.transferId || part.totalChunks !== chunk.totalChunks || part.name !== chunk.name || part.mime !== chunk.mime || part.sizeBytes !== chunk.sizeBytes || part.sha256 !== chunk.sha256);
      const conflict = group.conflict || inconsistentMetadata;
      const completed = !conflict && parts.length === chunk.totalChunks;
      ordinary.push({
        ...source,
        id: `file:${source.peer || ''}:${source.senderPubkey || ''}:${chunk.transferId}`,
        text: first?.caption || '',
        createdAt: Math.min(...records.map(record => record.createdAt || 0)),
        nostrEventId: first?.record.nostrEventId || source.nostrEventId,
        fileTransfer: {
          version: VERSION, transferId: chunk.transferId, name: chunk.name, mime: chunk.mime,
          sizeBytes: chunk.sizeBytes, sha256: chunk.sha256, totalChunks: chunk.totalChunks,
          chunks: parts, receivedChunks: parts.length, complete: completed, conflict,
          caption: first?.caption || '', eventIds: [...new Set(ids)], statuses: records.map(record => record.status)
        }
      });
    }
    return ordinary.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function relayEventBytes(event, encoder = new TextEncoder()) {
    try { return encoder.encode(JSON.stringify(event)).byteLength; } catch { return Infinity; }
  }

  function formatSize(bytes, language = 'en') {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const value = bytes / 1024;
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value >= 1024 ? value / 1024 : value)} ${value >= 1024 ? 'MB' : 'KB'}`;
  }

  globalThis.PropertyFileTransfers = Object.freeze({
    TAG, VERSION, CHUNK_BYTES, MAX_FILE_BYTES, MAX_CHUNKS, MAX_RELAY_EVENT_BYTES, MAX_NAME_CHARS, MAX_CAPTION_CHARS,
    createTransfer, randomTransferId, fromTags, assemble, coalesceMessages, safeName, safeMime, previewKind, expectedChunkCount, relayEventBytes, formatSize
  });
})();
