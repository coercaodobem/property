'use strict';
(() => {
  function validEventFamily(event, family, verifyEvent, nowSeconds = Math.floor(Date.now() / 1000)) {
    try { return window.PropertyProtocol.validateEventFamily(event, family, verifyEvent, nowSeconds) === event; }
    catch { return false; }
  }
  function inboxRelays(event, verifyEvent, normalizeRelay) {
    if (!event || event.kind !== 10050 || !validEventFamily(event, 'relay_discovery', verifyEvent) || !Array.isArray(event.tags)) return [];
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
      if (event?.kind !== 1059 || !validEventFamily(event, 'private_message', verifyEvent)) return { ready: false, deliveries: [], reason: 'invalid-gift-wrap' };
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
      if (event?.kind !== 1059 || !validEventFamily(event, 'private_message', verifyEvent)) return { ready: false, deliveries: [], reason: 'invalid-gift-wrap' };
      const recipients = (event.tags || []).filter(tag => tag[0] === 'p').map(tag => tag[1]);
      if (recipients.length !== 1 || !expected.has(recipients[0]) || seen.has(recipients[0])) return { ready: false, deliveries: [], reason: 'unexpected-recipient' };
      const recipient = recipients[0];
      seen.add(recipient);
      deliveries.push({ event, recipient, relays: [...relaysByParticipant[recipient]] });
    }
    if (seen.size !== expected.size) return { ready: false, deliveries: [], reason: 'missing-gift-wrap' };
    return { ready: true, deliveries, reason: '' };
  }
  function createRelayResponseTracker(requestedRelayUrls, sentRelayUrls = requestedRelayUrls) {
    const requested = [...new Set(Array.isArray(requestedRelayUrls) ? requestedRelayUrls : [])];
    const sent = [...new Set(Array.isArray(sentRelayUrls) ? sentRelayUrls : [])].filter(url => requested.includes(url));
    return { requestedRelayUrls: new Set(requested), sentRelayUrls: new Set(sent), responses: new Map() };
  }
  function recordRelayResponse(tracker, relayUrl, accepted) {
    if (!tracker?.requestedRelayUrls?.has(relayUrl) || !tracker.sentRelayUrls?.has(relayUrl) ||
        tracker.responses?.has(relayUrl) || typeof accepted !== 'boolean') return false;
    tracker.responses.set(relayUrl, accepted);
    return true;
  }
  function summarizeRelayResponses(tracker) {
    const acceptedRelayUrls = [];
    const rejectedRelayUrls = [];
    for (const [url, accepted] of tracker?.responses || []) (accepted ? acceptedRelayUrls : rejectedRelayUrls).push(url);
    const responded = new Set(tracker?.responses?.keys?.() || []);
    return {
      acceptedRelayUrls: acceptedRelayUrls.sort(),
      rejectedRelayUrls: rejectedRelayUrls.sort(),
      unansweredRelayUrls: [...(tracker?.requestedRelayUrls || [])].filter(url => !responded.has(url)).sort()
    };
  }
  function messageDeliveryState(progress) {
    const rows = Array.isArray(progress) ? progress : [];
    if (!rows.length) return 'queued';
    if (rows.every(item => Array.isArray(item.observedRelayUrls) && item.observedRelayUrls.length > 0)) return 'observed';
    if (rows.some(item => Array.isArray(item.acceptedRelayUrls) && item.acceptedRelayUrls.length > 0)) return 'relay-accepted';
    if (rows.every(item => Array.isArray(item.rejectedRelayUrls) && item.rejectedRelayUrls.length > 0 &&
        Array.isArray(item.unansweredRelayUrls) && item.unansweredRelayUrls.length === 0)) return 'failed';
    return 'queued';
  }
  function messageNeedsRetry(progress) {
    return Array.isArray(progress) && progress.some(item => item?.rejectedRelayUrls?.length || item?.unansweredRelayUrls?.length);
  }
  function recipientBlocked(access) { return access?.status === 'blocked'; }
  function retryIdentityMatches(senderPubkey, currentPubkey) {
    const sender = typeof senderPubkey === 'string' ? senderPubkey.toLowerCase() : '';
    const current = typeof currentPubkey === 'string' ? currentPubkey.toLowerCase() : '';
    return /^[0-9a-f]{64}$/.test(sender) && sender === current;
  }
  window.PropertyNostrRouting = Object.freeze({ inboxRelays, groupParticipants, groupConversationId, planGiftWraps, planGroupGiftWraps,
    createRelayResponseTracker, recordRelayResponse, summarizeRelayResponses, messageDeliveryState, messageNeedsRetry, recipientBlocked, retryIdentityMatches });
})();
