'use strict';
(() => {
  const PUBKEY_RE = /^[0-9a-f]{64}$/i;
  const EVENT_BYTES_LIMIT = 60000;

  function expectedChunk(files, sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
    let indexInBatch = 0;
    for (const file of files || []) {
      for (let index = 0; index < file.totalChunks; index += 1) {
        indexInBatch += 1;
        if (indexInBatch === sequence) return { file, index };
      }
    }
    return null;
  }

  function chunkBody(chunk) {
    return chunk?.index === 0 ? `📎 ${chunk.name}${chunk.caption ? `\n${chunk.caption}` : ''}` : '';
  }

  async function create({ nostr, fileTransfers, secret, senderPubkey, recipientPubkey, chunk, replyEventId = '' }) {
    if (!nostr?.nip59?.createRumor || !nostr?.nip59?.createSeal || !nostr?.nip59?.createWrap || typeof nostr.getPublicKey !== 'function' ||
        typeof nostr.verifyEvent !== 'function' || !fileTransfers?.fromTags || typeof secret !== 'string' && !(secret instanceof Uint8Array) ||
        !PUBKEY_RE.test(senderPubkey || '') || !PUBKEY_RE.test(recipientPubkey || '') || String(senderPubkey).toLowerCase() === String(recipientPubkey).toLowerCase() ||
        !chunk?.tag || (replyEventId && !/^[0-9a-f]{64}$/i.test(replyEventId))) throw new TypeError('Invalid direct NIP-17 file envelope input.');
    if (nostr.getPublicKey(secret).toLowerCase() !== senderPubkey.toLowerCase()) throw new TypeError('The active secret does not match the direct file sender.');
    const verified = await fileTransfers.fromTags([chunk.tag]);
    if (!verified || verified.transferId !== chunk.transferId || verified.index !== chunk.index) throw new Error('The direct file part failed its local integrity check.');
    const tags = [['p', recipientPubkey.toLowerCase()]];
    if (replyEventId) tags.push(['e', replyEventId.toLowerCase(), '', 'reply']);
    tags.push(chunk.tag);
    const rumor = nostr.nip59.createRumor({ kind: 14, tags, content: chunkBody(verified) }, secret);
    const event = nostr.nip59.createWrap(nostr.nip59.createSeal(rumor, secret, recipientPubkey.toLowerCase()), recipientPubkey.toLowerCase());
    if (event?.kind !== 1059 || !nostr.verifyEvent(event) || fileTransfers.relayEventBytes(event) > EVENT_BYTES_LIMIT) {
      throw new Error('The encrypted direct file part exceeds the supported event size.');
    }
    return Object.freeze({ rumor, event, chunk: verified });
  }

  async function validate({ nostr, fileTransfers, secret, recipientPubkey, senderPubkey, files, sequence, event }) {
    if (!nostr?.nip17?.unwrapEvent || typeof nostr.verifyEvent !== 'function' || !fileTransfers?.fromTags ||
        !PUBKEY_RE.test(recipientPubkey || '') || !PUBKEY_RE.test(senderPubkey || '') || String(recipientPubkey).toLowerCase() === String(senderPubkey).toLowerCase() ||
        !event || event.kind !== 1059 || !Array.isArray(event.tags) || event.tags.length !== 1 || !Array.isArray(event.tags[0]) ||
        event.tags[0].length !== 2 || event.tags[0][0] !== 'p' || String(event.tags[0][1] || '').toLowerCase() !== recipientPubkey.toLowerCase() ||
        !nostr.verifyEvent(event) || fileTransfers.relayEventBytes(event) > EVENT_BYTES_LIMIT) return null;
    let rumor;
    try { rumor = nostr.nip17.unwrapEvent(event, secret); } catch { return null; }
    if (!rumor || rumor.kind !== 14 || String(rumor.pubkey || '').toLowerCase() !== senderPubkey.toLowerCase() ||
        !Array.isArray(rumor.tags) || (rumor.tags.length !== 2 && rumor.tags.length !== 3)) return null;
    const recipientTags = rumor.tags.filter(tag => Array.isArray(tag) && tag.length === 2 && tag[0] === 'p' &&
      String(tag[1] || '').toLowerCase() === recipientPubkey.toLowerCase());
    const replyTags = rumor.tags.filter(tag => Array.isArray(tag) && tag[0] === 'e');
    if (recipientTags.length !== 1 || replyTags.length !== (rumor.tags.length === 3 ? 1 : 0) ||
        replyTags.some(tag => tag.length !== 4 || !/^[0-9a-f]{64}$/i.test(tag[1] || '') || tag[3] !== 'reply')) return null;
    const expected = expectedChunk(files, sequence);
    const chunk = await fileTransfers.fromTags(rumor.tags);
    if (!chunk || !expected || chunk.transferId !== expected.file.transferId || chunk.index !== expected.index ||
        chunk.name !== expected.file.name || chunk.mime !== expected.file.mime || chunk.sizeBytes !== expected.file.sizeBytes ||
        chunk.totalChunks !== expected.file.totalChunks || chunk.sha256 !== expected.file.sha256 || rumor.content !== chunkBody(chunk)) return null;
    return Object.freeze({ rumor, chunk, replyEventId: replyTags[0]?.[1]?.toLowerCase() || '' });
  }

  globalThis.PropertyDirectFileEnvelope = Object.freeze({ EVENT_BYTES_LIMIT, expectedChunk, chunkBody, create, validate });
})();
