'use strict';
(() => {
  const RUMOR_KIND = 20000;
  const EPHEMERAL_GIFT_WRAP_KIND = 21059;
  const MAX_PARTICIPANTS = 10;
  const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;
  const MAX_SIGNAL_AGE_SECONDS = 8;
  const MAX_THINKING_AGE_SECONDS = 60;
  const MAX_READ_AGE_SECONDS = 120;
  const MAX_PRESENCE_AGE_SECONDS = 75;
  const KEY_RE = /^[0-9a-f]{64}$/i;
  const EVENT_ID_RE = /^[0-9a-f]{64}$/i;

  function participantsFromRumor(rumor) {
    if (!rumor || !KEY_RE.test(rumor.pubkey || '') || !Array.isArray(rumor.tags)) return [];
    if (rumor.tags.some(tag => !Array.isArray(tag) || tag.length !== 2 || tag[0] !== 'p' || !KEY_RE.test(tag[1] || ''))) return [];
    const members = new Set([rumor.pubkey.toLowerCase()]);
    for (const tag of rumor.tags) {
      if (Array.isArray(tag) && tag[0] === 'p' && KEY_RE.test(tag[1] || '')) members.add(tag[1].toLowerCase());
    }
    return members.size >= 2 && members.size <= MAX_PARTICIPANTS ? [...members].sort() : [];
  }

  function validateCrypto(nostr) {
    if (!nostr?.nip59?.createRumor || !nostr?.nip59?.createSeal || !nostr?.nip44?.encrypt ||
        !nostr?.nip44?.getConversationKey || !nostr?.generateSecretKey || !nostr?.finalizeEvent) {
      throw new TypeError('Nostr tools do not support encrypted ephemeral chat signals.');
    }
  }

  function normalizeParticipants(nostr, secret, participantKeys) {
    const sender = nostr.getPublicKey(secret).toLowerCase();
    const participants = [...new Set((participantKeys || []).map(key => String(key).toLowerCase()))].sort();
    if (participants.length < 2 || participants.length > MAX_PARTICIPANTS ||
        participants.some(key => !KEY_RE.test(key)) || !participants.includes(sender)) {
      throw new TypeError('Invalid chat signal participants.');
    }
    return { sender, participants };
  }

  function createEnvelopes(nostr, secret, sender, participants, payload, recipients) {
    const tags = participants.filter(key => key !== sender).map(key => ['p', key]);
    const rumor = nostr.nip59.createRumor({
      kind: RUMOR_KIND,
      tags,
      content: JSON.stringify(payload)
    }, secret);

    return recipients.map(recipient => {
      const seal = nostr.nip59.createSeal(rumor, secret, recipient);
      const wrapperSecret = nostr.generateSecretKey();
      const conversationKey = nostr.nip44.getConversationKey(wrapperSecret, recipient);
      const age = Math.floor(Math.random() * TWO_DAYS_SECONDS);
      const event = nostr.finalizeEvent({
        kind: EPHEMERAL_GIFT_WRAP_KIND,
        content: nostr.nip44.encrypt(JSON.stringify(seal), conversationKey),
        created_at: Math.floor(Date.now() / 1000) - age,
        tags: [['p', recipient]]
      }, wrapperSecret);
      return { recipient, event };
    });
  }

  function create(nostr, secret, participantKeys, action, sequence) {
    validateCrypto(nostr);
    if (!['typing', 'thinking', 'stop'].includes(action) || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw new TypeError('Invalid typing signal action or sequence.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    return createEnvelopes(nostr, secret, sender, participants, { v: 1, action, sequence }, participants.filter(key => key !== sender));
  }

  function createReadReceipt(nostr, secret, participantKeys, recipientKey, messageId, sequence, group = false) {
    validateCrypto(nostr);
    if (!EVENT_ID_RE.test(messageId || '') || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw new TypeError('Invalid read receipt message reference or sequence.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    const recipient = String(recipientKey || '').toLowerCase();
    if (recipient === sender || !participants.includes(recipient)) throw new TypeError('Invalid read receipt recipient.');
    if (typeof group !== 'boolean') throw new TypeError('Invalid read receipt conversation type.');
    return createEnvelopes(nostr, secret, sender, participants, { v: 1, action: 'read', messageId: messageId.toLowerCase(), sequence, group }, [recipient]);
  }

  function createPresence(nostr, secret, participantKeys, active, sequence) {
    validateCrypto(nostr);
    if (typeof active !== 'boolean' || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw new TypeError('Invalid active status or sequence.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    if (participants.length !== 2) throw new TypeError('Active status is available only in direct conversations.');
    const recipient = participants.find(key => key !== sender);
    return createEnvelopes(nostr, secret, sender, participants, { v: 1, action: 'presence', active, sequence }, [recipient]);
  }

  function unwrap(nostr, event, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!event || event.kind !== EPHEMERAL_GIFT_WRAP_KIND || !nostr.verifyEvent(event) ||
        !Array.isArray(event.tags) || typeof event.content !== 'string' || event.content.length > 4096) return null;
    const recipient = nostr.getPublicKey(secret).toLowerCase();
    const recipientTags = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'p');
    if (event.tags.length !== 1 || recipientTags.length !== 1 || recipientTags[0].length !== 2 || recipientTags[0][1]?.toLowerCase() !== recipient) return null;
    try {
      const wrapperKey = nostr.nip44.getConversationKey(secret, event.pubkey);
      const seal = JSON.parse(nostr.nip44.decrypt(event.content, wrapperKey));
      if (!seal || seal.kind !== 13 || !Array.isArray(seal.tags) || seal.tags.length !== 0 ||
          typeof seal.content !== 'string' || !nostr.verifyEvent(seal)) return null;
      const messageKey = nostr.nip44.getConversationKey(secret, seal.pubkey);
      const rumor = JSON.parse(nostr.nip44.decrypt(seal.content, messageKey));
      if (!rumor || rumor.kind !== RUMOR_KIND || rumor.pubkey !== seal.pubkey || rumor.id !== nostr.getEventHash(rumor) ||
          typeof rumor.created_at !== 'number' || rumor.created_at > nowSeconds + 5 || typeof rumor.content !== 'string') return null;
      const participants = participantsFromRumor(rumor);
      if (!participants.includes(recipient) || participants.length < 2) return null;
      const payload = JSON.parse(rumor.content);
      if (payload?.v !== 1 || !['typing', 'thinking', 'stop', 'read', 'presence'].includes(payload.action) ||
          !Number.isSafeInteger(payload.sequence) || payload.sequence < 1) return null;
      if (payload.action === 'read' && (!EVENT_ID_RE.test(payload.messageId || '') || typeof payload.group !== 'boolean')) return null;
      if (payload.action === 'presence' && (typeof payload.active !== 'boolean' || participants.length !== 2)) return null;
      const maxAgeSeconds = payload.action === 'read' ? MAX_READ_AGE_SECONDS
        : payload.action === 'presence' ? MAX_PRESENCE_AGE_SECONDS
        : payload.action === 'thinking' ? MAX_THINKING_AGE_SECONDS : MAX_SIGNAL_AGE_SECONDS;
      if (nowSeconds - rumor.created_at > maxAgeSeconds) return null;
      return { sender: rumor.pubkey.toLowerCase(), participants, action: payload.action, sequence: payload.sequence, maxAgeSeconds,
        ...(payload.action === 'read' ? { messageId: payload.messageId.toLowerCase(), group: payload.group } : {}),
        ...(payload.action === 'presence' ? { active: payload.active } : {}) };
    } catch {
      return null;
    }
  }

  window.PropertyTypingSignals = Object.freeze({ RUMOR_KIND, EPHEMERAL_GIFT_WRAP_KIND, MAX_SIGNAL_AGE_SECONDS, MAX_THINKING_AGE_SECONDS, MAX_READ_AGE_SECONDS, MAX_PRESENCE_AGE_SECONDS, create, createReadReceipt, createPresence, unwrap });
})();
