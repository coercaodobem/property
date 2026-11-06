'use strict';
(() => {
  const HEX_32 = /^[0-9a-f]{64}$/i;
  const MAX_GROUP_ID_LENGTH = 128;
  const MAX_POST_LENGTH = 4000;

  function firstTag(event, name) {
    return Array.isArray(event?.tags)
      ? event.tags.find(tag => Array.isArray(tag) && tag[0] === name && typeof tag[1] === 'string')?.[1] || ''
      : '';
  }

  function validGroupId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_GROUP_ID_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
  }

  function groupKey(relayUrl, groupId) {
    if (typeof relayUrl !== 'string' || !relayUrl || !validGroupId(groupId)) throw new TypeError('Invalid NIP-29 group origin.');
    return `${relayUrl}\u0000${groupId}`;
  }

  function parseGroupReference(input, decodeAddress, normalizeRelay) {
    if (typeof input !== 'string' || input.length > 2000 || typeof decodeAddress !== 'function' || typeof normalizeRelay !== 'function') return null;
    const match = /^([^?]+)(?:\?invite=([^?]*))?$/.exec(input.trim());
    if (!match) return null;
    let inviteCode = '';
    try { inviteCode = match[2] ? decodeURIComponent(match[2]) : ''; } catch { return null; }
    if (inviteCode.length > 200 || /[\u0000-\u001f\u007f]/.test(inviteCode)) return null;
    let decoded;
    try { decoded = decodeAddress(match[1]); } catch { return null; }
    const data = decoded?.data;
    if (decoded?.type !== 'naddr' || data?.kind !== 39000 || !validGroupId(data.identifier) || !HEX_32.test(data.pubkey || '') || !Array.isArray(data.relays)) return null;
    const relays = [];
    for (const relay of data.relays) {
      if (typeof relay !== 'string') continue;
      try {
        const normalized = normalizeRelay(relay);
        if (!relays.includes(normalized)) relays.push(normalized);
      } catch { /* Ignore unusable relay hints; the naddr itself may include more than one. */ }
    }
    return Object.freeze({ groupId: data.identifier, relayPubkey: data.pubkey.toLowerCase(), relays: Object.freeze(relays), inviteCode });
  }

  function parseRelaySelfDocument(value) {
    let document = value;
    if (typeof value === 'string') {
      try { document = JSON.parse(value); } catch { return null; }
    }
    const self = String(document?.self || '').toLowerCase();
    return HEX_32.test(self) ? self : null;
  }

  function parseMetadata(event, relayUrl, verifyEvent) {
    if (!event || event.kind !== 39000 || !Array.isArray(event.tags) || !Number.isSafeInteger(event.created_at) || event.created_at < 0 ||
        typeof verifyEvent !== 'function' || !verifyEvent(event)) return null;
    const identifiers = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'd');
    if (identifiers.length !== 1 || typeof identifiers[0][1] !== 'string') return null;
    const id = identifiers[0][1];
    if (!validGroupId(id)) return null;
    const flag = name => event.tags.some(tag => Array.isArray(tag) && tag[0] === name);
    const supportedTag = event.tags.find(tag => Array.isArray(tag) && tag[0] === 'supported_kinds');
    const supportedKinds = supportedTag ? supportedTag.slice(1).map(value => Number(value))
      .filter(value => Number.isSafeInteger(value) && value >= 0 && value <= 65535) : null;
    return Object.freeze({
      key: groupKey(relayUrl, id), relayUrl, id,
      name: firstTag(event, 'name').slice(0, 120) || id,
      about: firstTag(event, 'about').slice(0, 1000),
      private: flag('private'), hidden: flag('hidden'), restricted: flag('restricted'), closed: flag('closed'),
      supportedKinds: supportedKinds === null ? null : Object.freeze(supportedKinds), createdAt: event.created_at,
      relayPubkey: String(event.pubkey || '').toLowerCase(), eventId: String(event.id || '').toLowerCase()
    });
  }

  function discoverableGroups(eventsByRelay, verifyEvent) {
    const groups = new Map();
    for (const source of eventsByRelay || []) {
      if (!source || !Array.isArray(source.events)) continue;
      for (const event of source.events) {
        const group = parseMetadata(event, source.relayUrl, signed => verifyEvent(signed, source.selfPubkey, source.relayUrl));
        if (!group || group.private || group.hidden) continue;
        const current = groups.get(group.key);
        if (!current || group.createdAt > current.createdAt || (group.createdAt === current.createdAt && group.eventId > current.eventId)) {
          groups.set(group.key, group);
        }
      }
    }
    return [...groups.values()].sort((a, b) => a.relayUrl.localeCompare(b.relayUrl) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function createJoinRequest({ pubkey, groupId, reason = '', inviteCode = '', createdAt = Math.floor(Date.now() / 1000) }) {
    if (!HEX_32.test(pubkey || '') || !validGroupId(groupId) || !Number.isSafeInteger(createdAt) || createdAt < 0 ||
        typeof reason !== 'string' || reason.length > 500 || typeof inviteCode !== 'string' || inviteCode.length > 200) {
      throw new TypeError('Invalid NIP-29 join request.');
    }
    const tags = [['h', groupId]];
    if (inviteCode) tags.push(['code', inviteCode]);
    return Object.freeze({ kind: 9021, created_at: createdAt, pubkey: pubkey.toLowerCase(), content: reason, tags });
  }

  function createLeaveRequest({ pubkey, groupId, reason = '', createdAt = Math.floor(Date.now() / 1000) }) {
    if (!HEX_32.test(pubkey || '') || !validGroupId(groupId) || !Number.isSafeInteger(createdAt) || createdAt < 0 ||
        typeof reason !== 'string' || reason.length > 500) {
      throw new TypeError('Invalid NIP-29 leave request.');
    }
    return Object.freeze({ kind: 9022, created_at: createdAt, pubkey: pubkey.toLowerCase(), content: reason, tags: [['h', groupId]] });
  }

  function latestStateEvent(events, groupId, pubkey, verifyEvent, authorizedAuthors) {
    const own = String(pubkey || '').toLowerCase();
    if (!validGroupId(groupId) || !HEX_32.test(own) || typeof verifyEvent !== 'function') return null;
    const stateEvents = (events || []).filter(event => event && firstTag(event, 'h') === groupId && Number.isSafeInteger(event.created_at) && verifyEvent(event) &&
      (([9000, 9001].includes(event.kind) && Array.isArray(event.tags) && event.tags.some(tag => Array.isArray(tag) && tag[0] === 'p' && String(tag[1] || '').toLowerCase() === own)) ||
       (event.kind === 9022 && event.pubkey?.toLowerCase() === own)) &&
      (!authorizedAuthors || event.kind === 9022 || authorizedAuthors.has(String(event.pubkey || '').toLowerCase())))
      .sort((a, b) => a.created_at - b.created_at || String(a.id || '').localeCompare(String(b.id || '')));
    return stateEvents.at(-1) || null;
  }

  function membership(events, groupId, pubkey, verifyEvent, authorizedAuthors = null) {
    if (!validGroupId(groupId) || !HEX_32.test(String(pubkey || '')) || typeof verifyEvent !== 'function') return 'unknown';
    const latest = latestStateEvent(events, groupId, pubkey, verifyEvent, authorizedAuthors);
    if (!latest || latest.kind === 9022) return 'not-member';
    return latest.kind === 9000 ? 'member' : 'not-member';
  }

  function hasPendingJoin(events, groupId, pubkey, verifyEvent, authorizedAuthors = null) {
    const own = String(pubkey || '').toLowerCase();
    if (!validGroupId(groupId) || !HEX_32.test(own) || typeof verifyEvent !== 'function') return false;
    const request = (events || []).filter(event => event?.kind === 9021 && event.pubkey?.toLowerCase() === own && firstTag(event, 'h') === groupId &&
      Number.isSafeInteger(event.created_at) && verifyEvent(event))
      .sort((a, b) => a.created_at - b.created_at || String(a.id || '').localeCompare(String(b.id || ''))).at(-1);
    if (!request) return false;
    const latestDecision = latestStateEvent(events, groupId, own, verifyEvent, authorizedAuthors);
    return !latestDecision || request.created_at > latestDecision.created_at ||
      (request.created_at === latestDecision.created_at && String(request.id || '') > String(latestDecision.id || ''));
  }

  function hasPendingLeave(events, groupId, pubkey, verifyEvent, authorizedAuthors = null) {
    const own = String(pubkey || '').toLowerCase();
    if (!validGroupId(groupId) || !HEX_32.test(own) || typeof verifyEvent !== 'function') return false;
    const leave = latestStateEvent((events || []).filter(event => event?.kind === 9022), groupId, own, verifyEvent, authorizedAuthors);
    if (!leave) return false;
    const decision = latestStateEvent((events || []).filter(event => [9000, 9001].includes(event?.kind)), groupId, own, verifyEvent, authorizedAuthors);
    return !decision || leave.created_at > decision.created_at || (leave.created_at === decision.created_at && String(leave.id || '') > String(decision.id || ''));
  }

  function createPublicPost({ pubkey, groupId, content, previousIds = [], createdAt = Math.floor(Date.now() / 1000), membershipStatus = 'unknown', restricted = false }) {
    if (!HEX_32.test(pubkey || '') || !validGroupId(groupId) || typeof content !== 'string' || !content.trim() || content.length > MAX_POST_LENGTH ||
        !Number.isSafeInteger(createdAt) || createdAt < 0 || (restricted && membershipStatus !== 'member')) {
      throw new TypeError(restricted && membershipStatus !== 'member' ? 'Membership is not confirmed for this restricted group.' : 'Invalid NIP-29 public post.');
    }
    const previous = [...new Set((previousIds || []).filter(id => HEX_32.test(id || '')).map(id => id.toLowerCase().slice(0, 8)))].slice(0, 3);
    const tags = [['h', groupId]];
    if (previous.length) tags.push(['previous', ...previous]);
    return Object.freeze({ kind: 1, created_at: createdAt, pubkey: pubkey.toLowerCase(), content: content.trim(), tags });
  }

  function markParallelOrigins(groups) {
    const byId = new Map();
    for (const group of groups || []) {
      if (!group || !validGroupId(group.id) || typeof group.relayUrl !== 'string') continue;
      const relays = byId.get(group.id) || new Set();
      relays.add(group.relayUrl);
      byId.set(group.id, relays);
    }
    return (groups || []).map(group => Object.freeze({ ...group, parallelOrigin: (byId.get(group.id)?.size || 0) > 1 }));
  }

  function groupListReferences(events, trustedAuthors, verifyEvent, normalizeRelay) {
    const trusted = new Set([...(trustedAuthors || [])].map(value => String(value || '').toLowerCase()).filter(value => HEX_32.test(value)));
    if (!trusted.size || typeof verifyEvent !== 'function' || typeof normalizeRelay !== 'function') return [];
    const latestByAuthor = new Map();
    for (const event of events || []) {
      const author = String(event?.pubkey || '').toLowerCase();
      if (event?.kind !== 10009 || !trusted.has(author) || !Number.isSafeInteger(event.created_at) || event.created_at < 0 || !verifyEvent(event)) continue;
      const previous = latestByAuthor.get(author);
      if (!previous || event.created_at > previous.created_at || (event.created_at === previous.created_at && String(event.id || '') > String(previous.id || ''))) latestByAuthor.set(author, event);
    }
    const references = new Map();
    for (const [author, event] of latestByAuthor) {
      for (const tag of (Array.isArray(event.tags) ? event.tags.slice(0, 500) : [])) {
        if (!Array.isArray(tag) || tag[0] !== 'group' || (tag.length !== 3 && tag.length !== 4) || !validGroupId(tag[1])) continue;
        let relayUrl;
        try { relayUrl = normalizeRelay(tag[2]); } catch { continue; }
        if (typeof relayUrl !== 'string' || !relayUrl.startsWith('wss://')) continue;
        const key = groupKey(relayUrl, tag[1]);
        const reference = {
          key, id: tag[1], relayUrl, name: typeof tag[3] === 'string' ? tag[3].slice(0, 120) : '',
          author, eventId: String(event.id || '').toLowerCase(), createdAt: event.created_at
        };
        const current = references.get(key);
        if (!current || reference.createdAt > current.createdAt || (reference.createdAt === current.createdAt && reference.eventId > current.eventId)) references.set(key, Object.freeze(reference));
      }
    }
    return [...references.values()].sort((a, b) => a.relayUrl.localeCompare(b.relayUrl) || a.id.localeCompare(b.id) || a.author.localeCompare(b.author));
  }

  function migrationCandidates(events, group, trustedAuthors, verifyEvent, normalizeRelay) {
    if (!group || !validGroupId(group.id) || typeof group.relayUrl !== 'string') return [];
    let currentRelay;
    try { currentRelay = normalizeRelay(group.relayUrl); } catch { return []; }
    return groupListReferences(events, trustedAuthors, verifyEvent, normalizeRelay)
      .filter(reference => reference.id === group.id && reference.relayUrl !== currentRelay)
      .slice(0, 20)
      .map(reference => Object.freeze({ ...reference, possibleMigrationOrFork: true }));
  }

  globalThis.PropertyCommunityGroups = Object.freeze({
    MAX_GROUP_ID_LENGTH, MAX_POST_LENGTH, validGroupId, groupKey, parseGroupReference, parseRelaySelfDocument, parseMetadata, discoverableGroups,
    createJoinRequest, createLeaveRequest, membership, hasPendingJoin, hasPendingLeave, createPublicPost, markParallelOrigins,
    groupListReferences, migrationCandidates
  });
})();
