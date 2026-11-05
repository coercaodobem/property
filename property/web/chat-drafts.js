'use strict';
(() => {
  const MAX_DRAFT_CHARS = 4000;
  const PUBLIC_KEY = /^[0-9a-f]{64}$/i;
  const CONVERSATION_ID = /^(?:[0-9a-f]{64}|group:(?:[0-9a-f]{64}:){2,9}[0-9a-f]{64})$/i;

  function idFor(owner, peer) {
    if (typeof owner !== 'string' || !PUBLIC_KEY.test(owner) || typeof peer !== 'string' || !CONVERSATION_ID.test(peer)) {
      throw new TypeError('Invalid local chat-draft identity.');
    }
    return `draft:${owner.toLowerCase()}:${peer.toLowerCase()}`;
  }

  function truncate(text) {
    let end = Math.min(text.length, MAX_DRAFT_CHARS);
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    return text.slice(0, end);
  }

  function createRecord(owner, peer, text) {
    const id = idFor(owner, peer);
    if (typeof text !== 'string') throw new TypeError('Chat draft must be text.');
    const value = truncate(text);
    if (!value) return null;
    return { id, owner: owner.toLowerCase(), peer: peer.toLowerCase(), text: value };
  }

  function readRecord(record, owner, peer) {
    let id;
    try { id = idFor(owner, peer); } catch { return ''; }
    if (!record || record.id !== id || record.owner !== owner.toLowerCase() || record.peer !== peer.toLowerCase() || typeof record.text !== 'string') return '';
    return truncate(record.text);
  }

  window.PropertyChatDrafts = Object.freeze({ MAX_DRAFT_CHARS, idFor, createRecord, readRecord });
})();
