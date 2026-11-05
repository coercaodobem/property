'use strict';
(() => {
  function inboxRelays(event, verifyEvent, normalizeRelay) {
    if (!event || event.kind !== 10050 || !verifyEvent(event) || !Array.isArray(event.tags)) return [];
    const urls = [];
    for (const tag of event.tags) {
      if (tag[0] !== 'relay' || typeof tag[1] !== 'string') continue;
      try { urls.push(normalizeRelay(tag[1])); } catch {}
    }
    return [...new Set(urls)].slice(0, 3);
  }
  function groupParticipants(rumor, maxMembers = 10) {
    if (!rumor || !/^[0-9a-f]{64}$/i.test(rumor.pubkey || '')) return [];
    const members = new Set([rumor.pubkey.toLowerCase()]);
    for (const tag of Array.isArray(rumor.tags) ? rumor.tags : []) {
      if (Array.isArray(tag) && tag[0] === 'p' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) members.add(tag[1].toLowerCase());
    }
    return members.size <= maxMembers ? [...members].sort() : [];
  }
  function groupConversationId(participants, maxMembers = 10) {
    if (!Array.isArray(participants)) return '';
    const members = participants.map(key => typeof key === 'string' ? key.toLowerCase() : '');
    if (members.length < 3 || members.length > maxMembers || new Set(members).size !== members.length || members.some(key => !/^[0-9a-f]{64}$/i.test(key))) return '';
    return `group:${members.sort().join(':')}`;
  }
  function planGiftWraps(wraps, senderPubkey, recipientPubkey, senderRelays, recipientRelays, verifyEvent) {
    if (!Array.isArray(wraps) || !senderPubkey || !recipientPubkey || !senderRelays?.length || !recipientRelays?.length) return { ready: false, deliveries: [], reason: 'missing-inbox' };
    const expected = new Set([senderPubkey, recipientPubkey]);
    const deliveries = [];
    const seen = new Set();
    for (const event of wraps) {
      if (event?.kind !== 1059 || !verifyEvent(event)) return { ready: false, deliveries: [], reason: 'invalid-gift-wrap' };
      const recipients = (event.tags || []).filter(tag => tag[0] === 'p').map(tag => tag[1]);
      if (recipients.length !== 1 || !expected.has(recipients[0]) || seen.has(recipients[0])) return { ready: false, deliveries: [], reason: 'unexpected-recipient' };
      const recipient = recipients[0];
      seen.add(recipient);
      deliveries.push({ event, recipient, relays: [...(recipient === senderPubkey ? senderRelays : recipientRelays)] });
    }
    if (seen.size !== expected.size) return { ready: false, deliveries: [], reason: 'missing-gift-wrap' };
    return { ready: true, deliveries, reason: '' };
  }
  function planGroupGiftWraps(wraps, participants, relaysByParticipant, verifyEvent) {
    if (!Array.isArray(wraps)) return { ready: false, deliveries: [], reason: 'invalid-gift-wrap' };
    if (!Array.isArray(participants) || participants.length < 3 || participants.length > 10 || new Set(participants).size !== participants.length || participants.some(key => !/^[0-9a-f]{64}$/i.test(key || ''))) {
      return { ready: false, deliveries: [], reason: 'invalid-participants' };
    }
    if (!relaysByParticipant || participants.some(key => !Array.isArray(relaysByParticipant[key]) || relaysByParticipant[key].length === 0)) {
      return { ready: false, deliveries: [], reason: 'missing-inbox' };
    }
    const expected = new Set(participants);
    const seen = new Set();
    const deliveries = [];
    for (const event of wraps) {
      if (event?.kind !== 1059 || !verifyEvent(event)) return { ready: false, deliveries: [], reason: 'invalid-gift-wrap' };
      const recipients = (event.tags || []).filter(tag => tag[0] === 'p').map(tag => tag[1]);
      if (recipients.length !== 1 || !expected.has(recipients[0]) || seen.has(recipients[0])) return { ready: false, deliveries: [], reason: 'unexpected-recipient' };
      const recipient = recipients[0];
      seen.add(recipient);
      deliveries.push({ event, recipient, relays: [...relaysByParticipant[recipient]] });
    }
    if (seen.size !== expected.size) return { ready: false, deliveries: [], reason: 'missing-gift-wrap' };
    return { ready: true, deliveries, reason: '' };
  }
  window.PropertyNostrRouting = Object.freeze({ inboxRelays, groupParticipants, groupConversationId, planGiftWraps, planGroupGiftWraps });
})();
