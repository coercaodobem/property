'use strict';
(() => {
  const KIND = 30078;
  const DISCRIMINATOR = 'property-group-invite-v1';
  const PARAMETER = 'groupInvite';
  const MAX_MEMBERS = 10;
  const MAX_LINK_LENGTH = 8192;
  const EVENT_FIELDS = ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags'];
  const CONTENT_FIELDS = ['invitee', 'members', 'title', 'version'];

  function invalid() { throw new Error('Invalid group invitation.'); }
  function isHex(value, length) { return typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(value); }
  function cleanTitle(value) {
    if (typeof value !== 'string') invalid();
    const title = value.trim();
    if (!title || title.length > 80 || /[\u0000-\u001f\u007f]/.test(title)) invalid();
    return title;
  }
  function sortedGroup(members, min, max) {
    if (!Array.isArray(members) || members.length < min || members.length > max || members.some(member => !isHex(member, 64))) invalid();
    const normalized = members.map(member => member.toLowerCase());
    if (new Set(normalized).size !== normalized.length) invalid();
    return normalized.sort();
  }
  function checkedBaseUrl(value) {
    let base;
    try { base = new URL(value); } catch { invalid(); }
    const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password) invalid();
    base.search = '';
    base.hash = '';
    return base;
  }
  function exactKeys(value, expected) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === [...expected].sort().join(',');
  }
  function checkSignedEvent(event, senderPubkey, recipientPubkey, verify) {
    if (!exactKeys(event, EVENT_FIELDS) || event.kind !== KIND || !Number.isSafeInteger(event.created_at) || event.created_at < 1 ||
        !isHex(event.id, 64) || !isHex(event.pubkey, 64) || !isHex(event.sig, 128) ||
        event.pubkey.toLowerCase() !== senderPubkey || typeof event.content !== 'string' ||
        !Array.isArray(event.tags) || event.tags.length !== 2 ||
        JSON.stringify(event.tags) !== JSON.stringify([['d', DISCRIMINATOR], ['p', recipientPubkey]])) invalid();
    let signatureValid = false;
    try { signatureValid = verify(event) === true; } catch { signatureValid = false; }
    if (!signatureValid) invalid();
    let content;
    try { content = JSON.parse(event.content); } catch { invalid(); }
    if (!exactKeys(content, CONTENT_FIELDS) || content.version !== 1 || content.invitee !== recipientPubkey) invalid();
    const title = cleanTitle(content.title);
    const members = sortedGroup(content.members, 4, MAX_MEMBERS);
    if (members.some((member, index) => member !== content.members[index]) ||
        !members.includes(senderPubkey) || !members.includes(recipientPubkey) || senderPubkey === recipientPubkey) invalid();
    return Object.freeze({ senderPubkey, recipientPubkey, members: Object.freeze(members), title,
      createdAt: event.created_at, eventId: event.id.toLowerCase() });
  }

  function createInvitation({ baseUrl, senderPubkey, inviteePubkey, members, title, createdAt = Math.floor(Date.now() / 1000), sign, encrypt, verify }) {
    senderPubkey = typeof senderPubkey === 'string' ? senderPubkey.toLowerCase() : '';
    inviteePubkey = typeof inviteePubkey === 'string' ? inviteePubkey.toLowerCase() : '';
    if (!isHex(senderPubkey, 64) || !isHex(inviteePubkey, 64) || senderPubkey === inviteePubkey ||
        !Number.isSafeInteger(createdAt) || createdAt < 1 || typeof sign !== 'function' ||
        typeof encrypt !== 'function' || typeof verify !== 'function') invalid();
    const currentMembers = sortedGroup(members, 3, MAX_MEMBERS - 1);
    if (!currentMembers.includes(senderPubkey) || currentMembers.includes(inviteePubkey)) invalid();
    const participants = [...currentMembers, inviteePubkey].sort();
    const content = JSON.stringify({ version: 1, title: cleanTitle(title), members: participants, invitee: inviteePubkey });
    const template = { kind: KIND, created_at: createdAt, tags: [['d', DISCRIMINATOR], ['p', inviteePubkey]], content };
    let event;
    try { event = sign(template); } catch { invalid(); }
    const normalized = checkSignedEvent(event, senderPubkey, inviteePubkey, verify);
    if (normalized.members.length !== participants.length || normalized.members.some((member, index) => member !== participants[index])) invalid();
    let ciphertext;
    try { ciphertext = encrypt(inviteePubkey, JSON.stringify(event)); } catch { invalid(); }
    if (typeof ciphertext !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)) invalid();
    const base = checkedBaseUrl(baseUrl);
    base.hash = new URLSearchParams([[PARAMETER, `${senderPubkey}.${ciphertext}`]]).toString();
    const url = base.toString();
    if (url.length > MAX_LINK_LENGTH) invalid();
    return Object.freeze({ url, inviteePubkey, senderPubkey, members: normalized.members, title: normalized.title });
  }

  function openInvitation(value, { recipientPubkey, decrypt, verify }) {
    recipientPubkey = typeof recipientPubkey === 'string' ? recipientPubkey.toLowerCase() : '';
    if (!isHex(recipientPubkey, 64) || typeof value !== 'string' || value.length > MAX_LINK_LENGTH ||
        typeof decrypt !== 'function' || typeof verify !== 'function') invalid();
    const separator = value.indexOf('.');
    if (separator !== 64 || value.indexOf('.', separator + 1) !== -1) invalid();
    const senderPubkey = value.slice(0, separator).toLowerCase();
    const ciphertext = value.slice(separator + 1);
    if (!isHex(senderPubkey, 64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)) invalid();
    let plaintext;
    try { plaintext = decrypt(senderPubkey, ciphertext); } catch { invalid(); }
    if (typeof plaintext !== 'string' || plaintext.length > 4096) invalid();
    let event;
    try { event = JSON.parse(plaintext); } catch { invalid(); }
    return checkSignedEvent(event, senderPubkey, recipientPubkey, verify);
  }

  window.PropertyGroupInvites = Object.freeze({ createInvitation, openInvitation, KIND, DISCRIMINATOR, PARAMETER, MAX_MEMBERS });
})();
