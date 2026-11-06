'use strict';
(() => {
  const EVENT_ID = /^[0-9a-f]{64}$/i;
  const MAX_EDITS = 100;

  function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && EVENT_ID.test(value)).map(value => value.toLowerCase()))];
  }

  function eventIds(message) {
    return uniqueIds([message?.nostrEventId, message?.id, message?.editRootId, ...(message?.previousEventIds || [])]);
  }

  function editDescriptor(rumor) {
    const tag = Array.isArray(rumor?.tags) ? rumor.tags.find(item => Array.isArray(item) && item[0] === 'edit') : null;
    if (!tag || !EVENT_ID.test(tag[1] || '') || !/^\d+$/.test(tag[2] || '')) return null;
    const sequence = Number(tag[2]);
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_EDITS) return null;
    return { rootId: tag[1].toLowerCase(), sequence };
  }

  function createNip17Edit({ nostr, secret, selfPubkey, participants, rootId, priorEventIds, sequence, createdAt, replyToId = '', subject = '', text, maxTextLength = 4000 }) {
    const members = [...new Set((participants || []).map(value => String(value).toLowerCase()))].sort();
    if (!nostr?.nip59 || !secret || !EVENT_ID.test(selfPubkey || '') || !EVENT_ID.test(rootId || '') || !members.includes(selfPubkey.toLowerCase()) || members.length < 2 || members.length > 10 || members.some(value => !EVENT_ID.test(value))) {
      throw new TypeError('Invalid NIP-17 edit participants or root event.');
    }
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_EDITS) throw new RangeError('Message edit limit reached.');
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new RangeError('Invalid original message timestamp.');
    if (![4000, 5000].includes(maxTextLength) || typeof text !== 'string' || !text.trim() || text.length > maxTextLength) throw new TypeError(`Edited messages must contain 1–${maxTextLength} characters.`);
    const eventIdsToRemove = uniqueIds([rootId, ...(priorEventIds || [])]);
    if (!eventIdsToRemove.length) throw new TypeError('An edit must reference at least one prior event.');
    const recipients = members.filter(value => value !== selfPubkey.toLowerCase());
    const pTags = recipients.map(value => ['p', value]);
    const editTag = ['edit', rootId.toLowerCase(), String(sequence)];
    const deleteRumor = nostr.nip59.createRumor({
      kind: 5,
      tags: [...eventIdsToRemove.map(id => ['e', id]), ...pTags, ['k', '14'], editTag],
      content: ''
    }, secret);
    const messageTags = [...pTags];
    if (subject.trim()) messageTags.push(['subject', subject.trim().slice(0, 80)]);
    if (replyToId && EVENT_ID.test(replyToId)) messageTags.push(['e', replyToId.toLowerCase(), '', 'reply']);
    messageTags.push(editTag);
    const editRumor = nostr.nip59.createRumor({
      kind: 14,
      created_at: createdAt,
      tags: messageTags,
      content: text
    }, secret);
    const wrapFor = rumor => members.map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(rumor, secret, recipient), recipient));
    return { rootId: rootId.toLowerCase(), sequence, editRumor, deleteRumor, editWraps: wrapFor(editRumor), deleteWraps: wrapFor(deleteRumor) };
  }

  function applyIncomingEdit(messages, incoming, selfPubkey = '') {
    const descriptor = incoming?.edit || editDescriptor(incoming?.rumor);
    if (!descriptor || incoming?.kind === 7 || incoming?.fromAgent || typeof incoming?.text !== 'string') return { applied: false, message: null };
    const rows = Array.isArray(messages) ? messages : [];
    const existing = rows.find(message => message.peer === incoming.peer && message.kind !== 7 && !message.fromAgent &&
      (message.editRootId === descriptor.rootId || eventIds(message).includes(descriptor.rootId)));
    const existingAuthor = existing?.senderPubkey || (existing?.direction === 'sent' ? selfPubkey : '');
    if (existing && existingAuthor && existingAuthor !== incoming.senderPubkey) return { applied: false, message: null };
    if (existing && (existing.editSeq || 0) > descriptor.sequence) return { applied: false, message: existing };
    if (existing && (existing.editSeq || 0) === descriptor.sequence) {
      const currentId = typeof existing.nostrEventId === 'string' ? existing.nostrEventId.toLowerCase() : '';
      const incomingId = typeof incoming.nostrEventId === 'string' ? incoming.nostrEventId.toLowerCase() : '';
      // Concurrent edits at the same sequence converge by signed event ID, regardless of arrival order.
      if (!incomingId || (currentId && incomingId <= currentId)) return { applied: false, message: existing };
    }
    const incomingId = typeof incoming.nostrEventId === 'string' ? incoming.nostrEventId.toLowerCase() : '';
    const previousEventIds = uniqueIds([
      ...(existing?.previousEventIds || []), descriptor.rootId,
      existing?.nostrEventId, existing?.id, incoming.nostrEventId
    ]).filter(id => id !== incomingId);
    const message = {
      ...(existing || {}), ...incoming,
      id: existing?.id || `edit:${incoming.peer}:${descriptor.rootId}`,
      peer: incoming.peer,
      text: incoming.text,
      senderPubkey: incoming.senderPubkey,
      direction: existing?.direction || incoming.direction,
      status: existing?.status || incoming.status,
      createdAt: existing?.createdAt || incoming.createdAt,
      nostrEventId: incoming.nostrEventId,
      editRootId: descriptor.rootId,
      editSeq: descriptor.sequence,
      previousEventIds,
      deleted: false
    };
    return { applied: true, message, existing };
  }

  function mergeOriginalBehindEdit(messages, incoming, selfPubkey = '') {
    const originalId = typeof incoming?.nostrEventId === 'string' ? incoming.nostrEventId.toLowerCase() : '';
    if (!EVENT_ID.test(originalId)) return null;
    const existing = (Array.isArray(messages) ? messages : []).find(message => message.peer === incoming.peer &&
      message.editRootId === originalId &&
      (message.senderPubkey === incoming.senderPubkey || (!message.senderPubkey && message.direction === 'sent' && incoming.senderPubkey === selfPubkey)) &&
      (message.editSeq || 0) > 0);
    if (!existing) return null;
    const updated = { ...existing, previousEventIds: uniqueIds([...(existing.previousEventIds || []), originalId]), createdAt: incoming.createdAt || existing.createdAt };
    return { existing, message: updated };
  }

  window.PropertyMessageEdits = Object.freeze({ eventIds, editDescriptor, createNip17Edit, applyIncomingEdit, mergeOriginalBehindEdit });
})();
