'use strict';
(() => {
  const TAG = 'property-delete-v1';
  const EVENT_ID = /^[0-9a-f]{64}$/i;
  const PUBKEY = /^[0-9a-f]{64}$/i;
  const MAX_TARGETS = 128;
  const MAX_PARTICIPANTS = 10;

  function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .filter(value => typeof value === 'string' && EVENT_ID.test(value))
      .map(value => value.toLowerCase()))];
  }

  function messageEventIds(message) {
    const previous = Array.isArray(message?.previousEventIds) ? message.previousEventIds : [];
    const deleted = Array.isArray(message?.deletedEventIds) ? message.deletedEventIds : [];
    const transferEvents = Array.isArray(message?.fileTransfer?.eventIds) ? message.fileTransfer.eventIds : [];
    return uniqueIds([
      message?.nostrEventId, message?.id, message?.editRootId,
      ...previous, ...deleted, ...transferEvents
    ]);
  }

  function createNip17Deletion({ nostr, secret, selfPubkey, participants, targetIds, createdAt }) {
    const self = String(selfPubkey || '').toLowerCase();
    const members = [...new Set((participants || []).map(value => String(value).toLowerCase()))].sort();
    const targets = uniqueIds(targetIds);
    if (!nostr?.nip59?.createRumor || !nostr?.nip59?.createSeal || !nostr?.nip59?.createWrap || !secret ||
        !PUBKEY.test(self) || members.length < 2 || members.length > MAX_PARTICIPANTS ||
        members.some(member => !PUBKEY.test(member)) || !members.includes(self) ||
        targets.length !== (Array.isArray(targetIds) ? targetIds.length : -1) || !targets.length || targets.length > MAX_TARGETS ||
        !Number.isSafeInteger(createdAt) || createdAt < 0) {
      throw new TypeError('Invalid NIP-17 deletion participants or targets.');
    }
    const tags = [
      ...targets.map(id => ['e', id]),
      ...members.filter(member => member !== self).map(member => ['p', member]),
      ['k', '14'], [TAG, '1']
    ];
    const rumor = nostr.nip59.createRumor({ kind: 5, created_at: createdAt, tags, content: '' }, secret);
    const wraps = members.map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(rumor, secret, recipient), recipient));
    if (wraps.length !== members.length || wraps.some((event, index) =>
      event?.kind !== 1059 || event.tags?.filter(tag => tag[0] === 'p').length !== 1 || event.tags.find(tag => tag[0] === 'p')?.[1] !== members[index]
    )) throw new Error('The private deletion does not have one NIP-17 envelope per participant.');
    return Object.freeze({ rumor, targetIds: Object.freeze(targets), wraps: Object.freeze(wraps) });
  }

  function parseRumor(rumor, participants) {
    if (!rumor || rumor.kind !== 5 || rumor.content !== '' || !PUBKEY.test(rumor.pubkey || '') ||
        !EVENT_ID.test(rumor.id || '') || !Number.isSafeInteger(rumor.created_at) || rumor.created_at < 0 || !Array.isArray(rumor.tags)) return null;
    const members = [...new Set((participants || []).map(value => String(value).toLowerCase()))].sort();
    const sender = rumor.pubkey.toLowerCase();
    if (members.length < 2 || members.length > MAX_PARTICIPANTS || members.some(member => !PUBKEY.test(member)) || !members.includes(sender)) return null;
    const targets = [];
    const recipients = [];
    let kinds = 0;
    let markers = 0;
    for (const tag of rumor.tags) {
      if (!Array.isArray(tag) || typeof tag[0] !== 'string') return null;
      if (tag[0] === 'e') {
        if (tag.length !== 2 || !EVENT_ID.test(tag[1] || '')) return null;
        targets.push(tag[1].toLowerCase());
      } else if (tag[0] === 'p') {
        if (tag.length !== 2 || !PUBKEY.test(tag[1] || '')) return null;
        recipients.push(tag[1].toLowerCase());
      } else if (tag[0] === 'k') {
        if (tag.length !== 2 || tag[1] !== '14') return null;
        kinds += 1;
      } else if (tag[0] === TAG) {
        if (tag.length !== 2 || tag[1] !== '1') return null;
        markers += 1;
      } else return null;
    }
    if (!targets.length || targets.length > MAX_TARGETS || new Set(targets).size !== targets.length ||
        kinds !== 1 || markers !== 1 || recipients.length !== members.length - 1 || new Set(recipients).size !== recipients.length) return null;
    const expectedRecipients = members.filter(member => member !== sender).sort();
    if (recipients.slice().sort().some((member, index) => member !== expectedRecipients[index])) return null;
    return Object.freeze({ eventId: rumor.id.toLowerCase(), senderPubkey: sender, createdAt: rumor.created_at, targetIds: Object.freeze(targets) });
  }

  function settingId(identity, peer, targetId) {
    const owner = String(identity || '').toLowerCase();
    const conversation = String(peer || '').toLowerCase();
    const target = String(targetId || '').toLowerCase();
    if (!PUBKEY.test(owner) || !(PUBKEY.test(conversation) || /^group:[0-9a-f]{64}$/.test(conversation)) || !EVENT_ID.test(target)) return '';
    return `message-deletion:${owner}:${conversation}:${target}`;
  }

  function recordsFor(identity, peer, deletion) {
    const owner = typeof identity === 'string' ? identity.toLowerCase() : '';
    if (!PUBKEY.test(owner) || typeof peer !== 'string' || !deletion || !PUBKEY.test(deletion.senderPubkey || '') || !EVENT_ID.test(deletion.eventId || '') || !Number.isSafeInteger(deletion.createdAt) || deletion.createdAt < 0) return [];
    return uniqueIds(deletion.targetIds).map(targetEventId => {
      const id = settingId(owner, peer, targetEventId);
      return id ? Object.freeze({ id, type: TAG, identity: owner, peer, targetEventId, senderPubkey: deletion.senderPubkey.toLowerCase(), eventId: deletion.eventId.toLowerCase(), createdAt: deletion.createdAt }) : null;
    }).filter(Boolean);
  }

  function applyToMessage(message, peer, deletion, selfPubkey = '') {
    if (!message || message.peer !== peer || message.kind === 7 || message.fromAgent || message.agentMessageId || message.deleted ||
        !deletion || !PUBKEY.test(deletion.senderPubkey || '') || !EVENT_ID.test(deletion.eventId || '')) return null;
    const author = typeof message.senderPubkey === 'string' ? message.senderPubkey.toLowerCase()
      : message.direction === 'sent' ? String(selfPubkey || '').toLowerCase() : '';
    if (author !== deletion.senderPubkey.toLowerCase()) return null;
    const targets = new Set(uniqueIds(deletion.targetIds));
    if (!messageEventIds(message).some(id => targets.has(id))) return null;
    const deletedEventIds = messageEventIds(message);
    const transferId = message.fileChunk?.transferId || message.fileTransfer?.transferId || '';
    return {
      ...message,
      text: '', saved: false, deleted: true, deletionEventId: deletion.eventId.toLowerCase(),
      deletedEventIds,
      ...(typeof transferId === 'string' && transferId ? { deletionGroupId: `file:${transferId}` } : {}),
      linkPreview: null, mentions: [], forwarded: undefined,
      voiceMessage: undefined, fileChunk: undefined, fileTransfer: undefined,
      appPayload: undefined, agentMessageError: undefined
    };
  }

  function applyToMessages(messages, peer, deletion, selfPubkey = '') {
    const updates = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      const updated = applyToMessage(message, peer, deletion, selfPubkey);
      if (updated) updates.push(Object.freeze({ before: message, after: updated }));
    }
    return updates;
  }

  function applyPending(message, peer, records, selfPubkey = '') {
    let current = message;
    for (const record of Array.isArray(records) ? records : []) {
      if (record?.type !== TAG || record.peer !== peer || !PUBKEY.test(record.senderPubkey || '') ||
          !EVENT_ID.test(record.targetEventId || '') || !EVENT_ID.test(record.eventId || '')) continue;
      current = applyToMessage(current, peer, {
        senderPubkey: record.senderPubkey, eventId: record.eventId, targetIds: [record.targetEventId]
      }, selfPubkey) || current;
    }
    return current;
  }

  function coalesceDeletedMessages(messages) {
    const ordinary = [];
    const groups = new Map();
    for (const message of Array.isArray(messages) ? messages : []) {
      if (!message?.deleted || typeof message.deletionGroupId !== 'string' || !message.deletionGroupId) {
        ordinary.push(message);
        continue;
      }
      const key = `${message.peer || ''}:${message.senderPubkey || ''}:${message.deletionGroupId}`;
      const rows = groups.get(key) || [];
      rows.push(message);
      groups.set(key, rows);
    }
    for (const rows of groups.values()) {
      const first = rows.slice().sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0) || String(left.id).localeCompare(String(right.id)))[0];
      ordinary.push({
        ...first,
        id: `deleted:${first.peer}:${first.senderPubkey}:${first.deletionGroupId}`,
        createdAt: Math.min(...rows.map(row => row.createdAt || 0)),
        deletedEventIds: uniqueIds(rows.flatMap(messageEventIds))
      });
    }
    return ordinary.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0) || String(left.id).localeCompare(String(right.id)));
  }

  window.PropertyMessageDeletions = Object.freeze({ TAG, MAX_TARGETS, messageEventIds, createNip17Deletion, parseRumor, settingId, recordsFor, applyToMessage, applyToMessages, applyPending, coalesceDeletedMessages });
})();
