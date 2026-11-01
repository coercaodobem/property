'use strict';
(() => {
  const KINDS = Object.freeze([1, 5, 7, 10050, 30017, 30018, 30019]);
  const ALLOWED_KINDS = new Set(KINDS);
  const MAX_AGE_SECONDS = 300;
  const MAX_PRIVATE_AGE_SECONDS = 173100;
  const MAX_EVENTS_PER_MINUTE = 60;
  const MAX_BYTES_PER_MINUTE = 2_000_000;

  function createBridge(verifyEvent, maxSeen = 4096) {
    if (typeof verifyEvent !== 'function' || !Number.isSafeInteger(maxSeen) || maxSeen < 1) throw new Error('Configuração da ponte inválida');
    const seen = new Map();
    let windowStart = Date.now();
    let windowEvents = 0;
    let windowBytes = 0;
    function mark(eventId) {
      if (typeof eventId !== 'string' || !/^[0-9a-f]{64}$/i.test(eventId)) return false;
      if (seen.has(eventId)) return false;
      seen.set(eventId, true);
      while (seen.size > maxSeen) seen.delete(seen.keys().next().value);
      return true;
    }
    function filter(since = Math.floor(Date.now() / 1000) - 180) {
      if (!Number.isSafeInteger(since) || since < 0) throw new Error('since inválido');
      return { kinds: [...KINDS], since };
    }
    function markPublished(event) {
      return Boolean(event && mark(event.id));
    }
    function releaseForRetry(eventId) {
      if (typeof eventId !== 'string' || !/^[0-9a-f]{64}$/i.test(eventId)) return false;
      return seen.delete(eventId);
    }
    function route(event, sourceRelay, relayUrls, maxAgeSeconds) {
      if (!event || !Array.isArray(relayUrls)) return [];
      if (!Number.isSafeInteger(event.created_at)) return [];
      const now = Math.floor(Date.now() / 1000);
      if (event.created_at < now - maxAgeSeconds || event.created_at > now + 60) return [];
      const destinations = [...new Set(relayUrls.filter(url => typeof url === 'string' && url !== sourceRelay))];
      if (!destinations.length) return [];
      let bytes;
      try { bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength; } catch { return []; }
      if (bytes > 512_000) return [];
      if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); windowEvents = 0; windowBytes = 0; }
      const outboundBytes = bytes * destinations.length;
      if (!Number.isSafeInteger(outboundBytes) || windowEvents >= MAX_EVENTS_PER_MINUTE || windowBytes + outboundBytes > MAX_BYTES_PER_MINUTE) return [];
      try {
        if (!verifyEvent(event) || !mark(event.id)) return [];
      } catch { return []; }
      windowEvents += 1;
      windowBytes += outboundBytes;
      return destinations;
    }
    function targets(event, sourceRelay, relayUrls) {
      return event && ALLOWED_KINDS.has(event.kind) ? route(event, sourceRelay, relayUrls, MAX_AGE_SECONDS) : [];
    }
    function privateTargets(event, sourceRelay, relayUrls, recipientPubkey) {
      if (!event || event.kind !== 1059 || !Array.isArray(event.tags)) return [];
      const recipients = event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]);
      if (recipients.length !== 1 || recipients[0] !== recipientPubkey) return [];
      return route(event, sourceRelay, relayUrls, MAX_PRIVATE_AGE_SECONDS);
    }
    return Object.freeze({ filter, markPublished, releaseForRetry, targets, privateTargets, get seenCount() { return seen.size; } });
  }

  window.PropertyRelayBridge = Object.freeze({ createBridge, kinds: KINDS });
})();
