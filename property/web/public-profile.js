'use strict';
(() => {
  const MAX_EVENT_CHARACTERS = 16_384;
  const MAX_NAME_LENGTH = 80;
  const MAX_ABOUT_LENGTH = 1_000;
  const MAX_NIP05_LENGTH = 160;
  const MAX_WEBSITE_LENGTH = 2_048;

  function cleanText(value, limit, preserveLines = false) {
    if (typeof value !== 'string') return '';
    let text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
    if (preserveLines) text = text.replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n');
    else text = text.replace(/\s+/g, ' ');
    return text.trim().slice(0, limit);
  }

  function safeWebsite(value) {
    if (typeof value !== 'string' || value.length > MAX_WEBSITE_LENGTH) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function parseEvent(event, expectedPubkey, verifyEvent) {
    const pubkey = typeof expectedPubkey === 'string' ? expectedPubkey.toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(pubkey) || !event || event.kind !== 0 || event.pubkey !== pubkey ||
        !Number.isSafeInteger(event.created_at) || event.created_at < 0 || typeof event.content !== 'string' ||
        event.content.length > MAX_EVENT_CHARACTERS || typeof event.id !== 'string' || !/^[0-9a-f]{64}$/.test(event.id) ||
        typeof verifyEvent !== 'function') return null;
    try {
      if (!verifyEvent(event)) return null;
      if (new TextEncoder().encode(event.content).byteLength > MAX_EVENT_CHARACTERS) return null;
      const data = JSON.parse(event.content);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      const name = cleanText(data.name, MAX_NAME_LENGTH);
      const displayName = cleanText(data.display_name, MAX_NAME_LENGTH) || name;
      return {
        pubkey,
        eventId: event.id,
        createdAt: event.created_at,
        name,
        displayName,
        about: cleanText(data.about, MAX_ABOUT_LENGTH, true),
        nip05: cleanText(data.nip05, MAX_NIP05_LENGTH),
        website: safeWebsite(data.website)
      };
    } catch {
      return null;
    }
  }

  function latestRecord(events, expectedPubkey, verifyEvent) {
    const ordered = (Array.isArray(events) ? events : []).filter(event => event && Number.isSafeInteger(event.created_at) && typeof event.id === 'string')
      .sort((left, right) => right.created_at - left.created_at || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    for (const event of ordered) {
      const profile = parseEvent(event, expectedPubkey, verifyEvent);
      if (!profile) continue;
      try { return { profile, event, metadata: JSON.parse(event.content) }; }
      catch { continue; }
    }
    return null;
  }

  function latest(events, expectedPubkey, verifyEvent) {
    return latestRecord(events, expectedPubkey, verifyEvent)?.profile || null;
  }

  function fromCache(record, expectedPubkey) {
    const pubkey = typeof expectedPubkey === 'string' ? expectedPubkey.toLowerCase() : '';
    if (!record || record.pubkey !== pubkey || !/^[0-9a-f]{64}$/.test(pubkey) ||
        typeof record.eventId !== 'string' || !/^[0-9a-f]{64}$/.test(record.eventId) ||
        !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.checkedAt)) return null;
    return {
      pubkey,
      eventId: record.eventId,
      createdAt: record.createdAt,
      checkedAt: record.checkedAt,
      name: cleanText(record.name, MAX_NAME_LENGTH),
      displayName: cleanText(record.displayName, MAX_NAME_LENGTH),
      about: cleanText(record.about, MAX_ABOUT_LENGTH, true),
      nip05: cleanText(record.nip05, MAX_NIP05_LENGTH),
      website: safeWebsite(record.website)
    };
  }

  globalThis.PropertyPublicProfile = Object.freeze({ parseEvent, latest, latestRecord, fromCache, safeWebsite });
})();
