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
  window.PropertyNostrRouting = Object.freeze({ inboxRelays, planGiftWraps });
})();
