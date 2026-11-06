'use strict';
(() => {
  const TAG = 'property-pin-v1';
  const EVENT_ID = /^[0-9a-f]{64}$/i;
  const PUBKEY = /^[0-9a-f]{64}$/i;

  function hasTag(rumor) {
    return Array.isArray(rumor?.tags) && rumor.tags.some(tag => Array.isArray(tag) && tag[0] === TAG);
  }

  function descriptor(rumor) {
    if (!rumor || rumor.kind !== 14 || rumor.content !== '' || !PUBKEY.test(rumor.pubkey || '') || !Array.isArray(rumor.tags)) return null;
    const entries = rumor.tags.filter(tag => Array.isArray(tag) && tag[0] === TAG);
    if (entries.length !== 1 || entries[0].length !== 3 || !['pin', 'unpin'].includes(entries[0][1]) || !EVENT_ID.test(entries[0][2] || '')) return null;
    return Object.freeze({ action: entries[0][1], targetEventId: entries[0][2].toLowerCase() });
  }

  function createNip17Pin({ nostr, secret, selfPubkey, participants, action, targetEventId }) {
    const members = [...new Set((participants || []).map(value => String(value).toLowerCase()))].sort();
    const self = String(selfPubkey || '').toLowerCase();
    const target = String(targetEventId || '').toLowerCase();
    if (!nostr?.nip59?.createRumor || !nostr?.nip59?.createSeal || !nostr?.nip59?.createWrap || !secret ||
        !PUBKEY.test(self) || members.length < 2 || members.length > 10 || members.some(member => !PUBKEY.test(member)) || !members.includes(self) ||
        !['pin', 'unpin'].includes(action) || !EVENT_ID.test(target)) {
      throw new TypeError('Invalid NIP-17 pin participants or target.');
    }
    const tags = members.filter(member => member !== self).map(member => ['p', member]);
    tags.push([TAG, action, target]);
    const rumor = nostr.nip59.createRumor({ kind: 14, tags, content: '' }, secret);
    const wraps = members.map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(rumor, secret, recipient), recipient));
    if (wraps.length !== members.length || wraps.some((event, index) => event?.kind !== 1059 || event.tags?.find(tag => tag[0] === 'p')?.[1] !== members[index])) {
      throw new Error('The message pin does not have one private NIP-17 envelope per participant.');
    }
    return Object.freeze({ rumor, wraps: Object.freeze(wraps) });
  }

  function compare(left, right) {
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
    return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
  }

  function validRecord(value) {
    return Boolean(value && ['pin', 'unpin'].includes(value.action) && value.active === (value.action === 'pin') &&
      EVENT_ID.test(value.eventId || '') && EVENT_ID.test(value.targetEventId || '') && PUBKEY.test(value.actorPubkey || '') &&
      Number.isSafeInteger(value.createdAt) && value.createdAt >= 0);
  }

  function applyPinRecord(current, incoming) {
    const eventId = String(incoming?.eventId || '').toLowerCase();
    const actorPubkey = String(incoming?.actorPubkey || '').toLowerCase();
    const targetEventId = String(incoming?.targetEventId || '').toLowerCase();
    if (!['pin', 'unpin'].includes(incoming?.action) || !EVENT_ID.test(eventId) || !EVENT_ID.test(targetEventId) ||
        !PUBKEY.test(actorPubkey) || !Number.isSafeInteger(incoming?.createdAt) || incoming.createdAt < 0) {
      return Object.freeze({ applied: false, record: current || null });
    }
    const normalized = Object.freeze({
      action: incoming.action, active: incoming.action === 'pin', targetEventId, actorPubkey,
      createdAt: incoming.createdAt, eventId
    });
    const previous = validRecord(current) ? current : null;
    if (previous && compare(normalized, previous) <= 0) {
      return Object.freeze({ applied: false, record: previous });
    }
    return Object.freeze({ applied: true, record: normalized });
  }

  function recordFromRumor(rumor) {
    const state = descriptor(rumor);
    const eventId = String(rumor?.id || '').toLowerCase();
    const actorPubkey = String(rumor?.pubkey || '').toLowerCase();
    if (!state || !EVENT_ID.test(eventId) || !PUBKEY.test(actorPubkey) || !Number.isSafeInteger(rumor?.created_at) || rumor.created_at < 0) return null;
    return Object.freeze({ ...state, eventId, actorPubkey, createdAt: rumor.created_at });
  }

  globalThis.PropertyMessagePins = Object.freeze({ TAG, hasTag, descriptor, createNip17Pin, applyPinRecord, recordFromRumor, validRecord });
})();
