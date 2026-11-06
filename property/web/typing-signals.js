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
  const MAX_CALL_SIGNAL_AGE_SECONDS = 120;
  const MAX_FILE_SIGNAL_AGE_SECONDS = 120;
  const MAX_EPHEMERAL_CONTENT_CHARS = 32768;
  const CALL_ID_RE = /^[0-9a-f]{32}$/i;
  const FILE_TRANSFER_ID_RE = /^[0-9a-f]{32}$/i;
  const MAX_CALL_SDP_CHARS = 16384;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_FILE_BATCH_BYTES = 4 * 1024 * 1024;
  const FILE_CHUNK_BYTES = 12000;
  const MAX_FILE_BATCH_COUNT = 5;
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
    if (!['typing', 'recording', 'thinking', 'stop'].includes(action) || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw new TypeError('Invalid typing signal action or sequence.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    return createEnvelopes(nostr, secret, sender, participants, { v: 1, action, sequence }, participants.filter(key => key !== sender));
  }

  function summarizeActivity(actions) {
    if (!Array.isArray(actions) || !actions.length || actions.some(action => !['typing', 'recording', 'thinking'].includes(action))) return null;
    return actions.every(action => action === actions[0]) ? actions[0] : 'typing';
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

  function validCallDescription(type, sdp, media) {
    return (type === 'offer' || type === 'answer') && typeof sdp === 'string' && sdp.length > 0 &&
      sdp.length <= MAX_CALL_SDP_CHARS && sdp.startsWith('v=0\r\n') &&
      /(?:^|\r?\n)m=audio\s/.test(sdp) && (media !== 'video' || /(?:^|\r?\n)m=video\s/.test(sdp));
  }

  function validDataChannelDescription(type, sdp) {
    return (type === 'offer' || type === 'answer') && typeof sdp === 'string' && sdp.length > 0 &&
      sdp.length <= MAX_CALL_SDP_CHARS && sdp.startsWith('v=0\r\n') &&
      /(?:^|\r?\n)m=application\s/.test(sdp) && /webrtc-datachannel|a=sctp-port:/i.test(sdp);
  }

  function normalizeFileManifests(files) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILE_BATCH_COUNT) return null;
    const seen = new Set();
    let totalBytes = 0;
    const normalized = [];
    for (const file of files) {
      if (!file || !FILE_TRANSFER_ID_RE.test(file.transferId || '') || seen.has(file.transferId.toLowerCase()) ||
          typeof file.name !== 'string' || file.name.length < 1 || file.name.length > 128 ||
          file.name !== file.name.trim() || /[\\/\u0000-\u001f\u007f]/u.test(file.name) ||
          typeof file.mime !== 'string' || file.mime.length > 128 ||
          !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(file.mime) ||
          !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_FILE_BYTES ||
          !Number.isSafeInteger(file.totalChunks) || file.totalChunks !== Math.max(1, Math.ceil(file.sizeBytes / FILE_CHUNK_BYTES)) ||
          !/^[0-9a-f]{64}$/i.test(file.sha256 || '')) return null;
      seen.add(file.transferId.toLowerCase());
      totalBytes += file.sizeBytes;
      if (totalBytes > MAX_FILE_BATCH_BYTES) return null;
      normalized.push(Object.freeze({ transferId: file.transferId.toLowerCase(), name: file.name, mime: file.mime,
        sizeBytes: file.sizeBytes, totalChunks: file.totalChunks, sha256: file.sha256.toLowerCase() }));
    }
    return Object.freeze(normalized);
  }

  function createFileSignal(nostr, secret, participantKeys, recipientKey, transferId, action, sequence, details = {}) {
    validateCrypto(nostr);
    if (!FILE_TRANSFER_ID_RE.test(transferId || '') || !Number.isSafeInteger(sequence) || sequence < 1 ||
        !['file-offer', 'file-answer', 'file-reject', 'file-cancel'].includes(action)) {
      throw new TypeError('Invalid direct file signal action or identifier.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    if (participants.length !== 2) throw new TypeError('Direct file transfer is available only in one-to-one chats.');
    const recipient = String(recipientKey || '').toLowerCase();
    if (recipient === sender || !participants.includes(recipient)) throw new TypeError('Invalid direct file signal recipient.');
    const payload = { v: 1, action, transferId: transferId.toLowerCase(), sequence };
    if (action === 'file-offer') {
      const files = normalizeFileManifests(details.files);
      if (!files || !validDataChannelDescription('offer', details.sdp)) throw new TypeError('Invalid direct file offer.');
      payload.files = files;
      payload.sdp = details.sdp;
    } else if (action === 'file-answer') {
      if (!validDataChannelDescription('answer', details.sdp)) throw new TypeError('Invalid direct file answer.');
      payload.sdp = details.sdp;
    } else if (details && Object.keys(details).length) {
      throw new TypeError('Direct file ending signals cannot contain extra data.');
    }
    return createEnvelopes(nostr, secret, sender, participants, payload, [recipient]);
  }

  function createCallSignal(nostr, secret, participantKeys, recipientKey, callId, action, sequence, details = {}) {
    validateCrypto(nostr);
    if (!CALL_ID_RE.test(callId || '') || !Number.isSafeInteger(sequence) || sequence < 1 ||
        !['call-offer', 'call-answer', 'call-decline', 'call-busy', 'call-hangup'].includes(action)) {
      throw new TypeError('Invalid call signal action or identifier.');
    }
    const { sender, participants } = normalizeParticipants(nostr, secret, participantKeys);
    if (participants.length !== 2) throw new TypeError('Calls are available only in direct conversations.');
    const recipient = String(recipientKey || '').toLowerCase();
    if (recipient === sender || !participants.includes(recipient)) throw new TypeError('Invalid call signal recipient.');
    const payload = { v: 1, action, callId: callId.toLowerCase(), sequence };
    if (action === 'call-offer' || action === 'call-answer') {
      const type = action === 'call-offer' ? 'offer' : 'answer';
      if (!['audio', 'video'].includes(details.media) || !validCallDescription(type, details.sdp, details.media)) {
        throw new TypeError('Invalid call media or session description.');
      }
      payload.media = details.media;
      payload.sdp = details.sdp;
    } else if (details && Object.keys(details).length) {
      throw new TypeError('Call ending signals cannot contain extra data.');
    }
    return createEnvelopes(nostr, secret, sender, participants, payload, [recipient]);
  }

  function unwrap(nostr, event, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!event || event.kind !== EPHEMERAL_GIFT_WRAP_KIND || !nostr.verifyEvent(event) ||
        !Array.isArray(event.tags) || typeof event.content !== 'string' || event.content.length > MAX_EPHEMERAL_CONTENT_CHARS) return null;
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
      if (payload?.v !== 1 || !['typing', 'recording', 'thinking', 'stop', 'read', 'presence', 'call-offer', 'call-answer', 'call-decline', 'call-busy', 'call-hangup', 'file-offer', 'file-answer', 'file-reject', 'file-cancel'].includes(payload.action) ||
          !Number.isSafeInteger(payload.sequence) || payload.sequence < 1) return null;
      if (payload.action === 'read' && (!EVENT_ID_RE.test(payload.messageId || '') || typeof payload.group !== 'boolean')) return null;
      if (payload.action === 'presence' && (typeof payload.active !== 'boolean' || participants.length !== 2)) return null;
      const callAction = payload.action.startsWith('call-');
      const fileAction = payload.action.startsWith('file-');
      if (callAction && (participants.length !== 2 || !CALL_ID_RE.test(payload.callId || ''))) return null;
      if ((payload.action === 'call-offer' || payload.action === 'call-answer') &&
          (!['audio', 'video'].includes(payload.media) || !validCallDescription(payload.action === 'call-offer' ? 'offer' : 'answer', payload.sdp, payload.media))) return null;
      if (callAction && !['call-offer', 'call-answer'].includes(payload.action) && Object.keys(payload).some(key => !['v', 'action', 'callId', 'sequence'].includes(key))) return null;
      if (fileAction && (participants.length !== 2 || !FILE_TRANSFER_ID_RE.test(payload.transferId || ''))) return null;
      if (payload.action === 'file-offer' && (!normalizeFileManifests(payload.files) || !validDataChannelDescription('offer', payload.sdp))) return null;
      if (payload.action === 'file-answer' && !validDataChannelDescription('answer', payload.sdp)) return null;
      if (fileAction) {
        const allowed = payload.action === 'file-offer' ? ['v', 'action', 'transferId', 'sequence', 'files', 'sdp']
          : payload.action === 'file-answer' ? ['v', 'action', 'transferId', 'sequence', 'sdp']
          : ['v', 'action', 'transferId', 'sequence'];
        if (Object.keys(payload).some(key => !allowed.includes(key))) return null;
      }
      const maxAgeSeconds = fileAction ? MAX_FILE_SIGNAL_AGE_SECONDS : callAction ? MAX_CALL_SIGNAL_AGE_SECONDS
        : payload.action === 'read' ? MAX_READ_AGE_SECONDS
        : payload.action === 'presence' ? MAX_PRESENCE_AGE_SECONDS
        : payload.action === 'thinking' ? MAX_THINKING_AGE_SECONDS : MAX_SIGNAL_AGE_SECONDS;
      if (nowSeconds - rumor.created_at > maxAgeSeconds) return null;
      return { sender: rumor.pubkey.toLowerCase(), participants, action: payload.action, sequence: payload.sequence, maxAgeSeconds,
        ...(payload.action === 'read' ? { messageId: payload.messageId.toLowerCase(), group: payload.group } : {}),
        ...(payload.action === 'presence' ? { active: payload.active } : {}),
        ...(callAction ? { callId: payload.callId.toLowerCase() } : {}),
        ...(['call-offer', 'call-answer'].includes(payload.action) ? { media: payload.media, sdp: payload.sdp } : {}),
        ...(fileAction ? { transferId: payload.transferId.toLowerCase() } : {}),
        ...(payload.action === 'file-offer' ? { files: normalizeFileManifests(payload.files), sdp: payload.sdp } : {}),
        ...(payload.action === 'file-answer' ? { sdp: payload.sdp } : {}) };
    } catch {
      return null;
    }
  }

  window.PropertyTypingSignals = Object.freeze({ RUMOR_KIND, EPHEMERAL_GIFT_WRAP_KIND, MAX_SIGNAL_AGE_SECONDS, MAX_THINKING_AGE_SECONDS, MAX_READ_AGE_SECONDS, MAX_PRESENCE_AGE_SECONDS, MAX_CALL_SIGNAL_AGE_SECONDS, MAX_FILE_SIGNAL_AGE_SECONDS, MAX_CALL_SDP_CHARS, MAX_FILE_BYTES, MAX_FILE_BATCH_BYTES, MAX_FILE_BATCH_COUNT, FILE_CHUNK_BYTES, normalizeFileManifests, validDataChannelDescription, create, summarizeActivity, createReadReceipt, createPresence, createCallSignal, createFileSignal, unwrap });
})();
