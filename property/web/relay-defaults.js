'use strict';
(() => {
  const TRUSTED_PUBKEY = '0a4c3a0a72ca53b077b4fabb68a932f9c0bd766eb11f66e65a61c1c364e74509';
  const BUNDLED_EVENT = Object.freeze({
    kind: 10002,
    created_at: 1794791000,
    content: '',
    tags: Object.freeze([
      Object.freeze(['property-defaults', 'v1']),
      Object.freeze(['expiration', '1924992000']),
      Object.freeze(['r', 'wss://relay.damus.io']),
      Object.freeze(['r', 'wss://nos.lol']),
      Object.freeze(['r', 'wss://relay.primal.net']),
      Object.freeze(['r', 'wss://relay.nostr.band']),
      Object.freeze(['r', 'wss://nostr.mom']),
      Object.freeze(['r', 'wss://relay.snort.social'])
    ]),
    pubkey: TRUSTED_PUBKEY,
    id: '3e82333b0fbbaa2e80f32ce1f467ef70fa49cd5d44beca9f04aa50eda09c7e1f',
    sig: '76c4ee1df36a4bf6cce9e9114f60e6fcd326e291dfc56b81fbf91ad80dd4a5199631660fe4ff9aa3deacf6fc2c9eb5399faf389a8425b55eb3d91b2953ff2cb1'
  });
  const MAX_TAGS = 32;
  const MAX_RELAY_URL = 2048;

  function safeVerify(event, verifyEvent) {
    try {
      if (typeof verifyEvent !== 'function') return false;
      const candidate = {
        kind: event?.kind,
        created_at: event?.created_at,
        content: event?.content,
        tags: Array.isArray(event?.tags) ? event.tags.map(tag => Array.isArray(tag) ? [...tag] : tag) : event?.tags,
        pubkey: event?.pubkey,
        id: event?.id,
        sig: event?.sig
      };
      return verifyEvent(candidate) === true;
    }
    catch { return false; }
  }

  function normalizeRelayUrl(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > MAX_RELAY_URL || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
      const normalized = url.href.replace(/\/$/, '');
      return normalized.length <= MAX_RELAY_URL ? normalized : null;
    } catch { return null; }
  }

  function validateSignedList(event, verifyEvent = globalThis.NostrTools?.verifyEvent,
    nowSeconds = Math.floor(Date.now() / 1000), revokedEventIds = [], trustedPubkey = TRUSTED_PUBKEY) {
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return { status: 'invalid', relays: [], reason: 'invalid-clock' };
    if (typeof trustedPubkey !== 'string' || !/^[0-9a-f]{64}$/.test(trustedPubkey)) return { status: 'invalid', relays: [], reason: 'invalid-trust-key' };
    if (!event || typeof event !== 'object' || Array.isArray(event) || event.kind !== 10002 ||
      event.pubkey !== trustedPubkey || !/^[0-9a-f]{64}$/.test(event.id || '') || !/^[0-9a-f]{128}$/.test(event.sig || '') ||
      !Number.isSafeInteger(event.created_at) || event.created_at < 1 || typeof event.content !== 'string' ||
      !Array.isArray(event.tags) || event.tags.length > MAX_TAGS || !safeVerify(event, verifyEvent)) {
      return { status: 'invalid', relays: [], reason: 'signature-or-shape' };
    }
    const revoked = revokedEventIds instanceof Set ? revokedEventIds : new Set(Array.isArray(revokedEventIds) ? revokedEventIds : []);
    if (revoked.has(event.id)) return { status: 'revoked', relays: [], reason: 'revoked-event' };
    if (event.created_at > nowSeconds + 300) return { status: 'invalid', relays: [], reason: 'future-event' };

    const tags = event.tags;
    const versions = tags.filter(tag => Array.isArray(tag) && tag[0] === 'property-defaults');
    if (versions.length !== 1 || versions[0].length !== 2 || versions[0][1] !== 'v1') {
      return { status: 'invalid', relays: [], reason: 'unknown-or-ambiguous-version' };
    }
    if (tags.some(tag => Array.isArray(tag) && tag[0] === 'property-defaults-critical')) {
      return { status: 'invalid', relays: [], reason: 'unknown-critical-version' };
    }
    const expirations = tags.filter(tag => Array.isArray(tag) && tag[0] === 'expiration');
    if (expirations.length !== 1 || expirations[0].length !== 2 || !/^[0-9]{1,12}$/.test(expirations[0][1])) {
      return { status: 'invalid', relays: [], reason: 'invalid-expiration' };
    }
    const expiresAt = Number(expirations[0][1]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= event.created_at) return { status: 'invalid', relays: [], reason: 'invalid-expiration' };
    const relayTags = tags.filter(tag => Array.isArray(tag) && tag[0] === 'r');
    if (relayTags.length < 2 || relayTags.length > 20) return { status: 'invalid', relays: [], reason: 'relay-count' };
    const relays = [];
    for (const tag of relayTags) {
      if (tag.length < 2 || tag.length > 3) return { status: 'invalid', relays: [], reason: 'malformed-relay-tag' };
      const normalized = normalizeRelayUrl(tag[1]);
      if (!normalized || relays.includes(normalized)) return { status: 'invalid', relays: [], reason: 'unsafe-or-duplicate-relay' };
      relays.push(normalized);
    }
    return { status: expiresAt <= nowSeconds ? 'stale' : 'valid', relays, expiresAt, eventId: event.id };
  }

  function defaultState(verifyEvent, nowSeconds, revokedEventIds) {
    return validateSignedList(BUNDLED_EVENT, verifyEvent, nowSeconds, revokedEventIds);
  }

  function pick(count = 2, randomIntBelow = max => {
    if (globalThis.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      globalThis.crypto.getRandomValues(value);
      return Math.floor((value[0] / 0x1_0000_0000) * max);
    }
    return Math.floor(Math.random() * max);
  }, verifyEvent = globalThis.NostrTools?.verifyEvent, nowSeconds = Math.floor(Date.now() / 1000), revokedEventIds = []) {
    const state = defaultState(verifyEvent, nowSeconds, revokedEventIds);
    if (!['valid', 'stale'].includes(state.status)) throw new Error('Bundled relay recommendations did not verify.');
    if (!Number.isSafeInteger(count) || count < 1 || count > state.relays.length) throw new RangeError('Invalid number of default relays.');
    const pool = [...state.relays];
    const selected = [];
    while (selected.length < count) {
      const index = randomIntBelow(pool.length);
      if (!Number.isSafeInteger(index) || index < 0 || index >= pool.length) throw new RangeError('Random relay selection returned an invalid index.');
      selected.push(pool.splice(index, 1)[0]);
    }
    return selected;
  }

  function initialSelection(savedSettings, randomIntBelow, verifyEvent = globalThis.NostrTools?.verifyEvent,
    nowSeconds = Math.floor(Date.now() / 1000), revokedEventIds = []) {
    if (Array.isArray(savedSettings?.values) && savedSettings.values.length === 0 && savedSettings.autoSelected === false) {
      return { values: [], autoSelected: false, shouldPersist: false, status: defaultState(verifyEvent, nowSeconds, revokedEventIds).status };
    }
    if (Array.isArray(savedSettings?.values) && savedSettings.values.length) {
      return { values: [...savedSettings.values], autoSelected: savedSettings.autoSelected === true, shouldPersist: false,
        status: defaultState(verifyEvent, nowSeconds, revokedEventIds).status };
    }
    const state = defaultState(verifyEvent, nowSeconds, revokedEventIds);
    if (!['valid', 'stale'].includes(state.status)) return { values: [], autoSelected: false, shouldPersist: false, status: state.status };
    return { values: pick(2, randomIntBelow, verifyEvent, nowSeconds, revokedEventIds), autoSelected: true, shouldPersist: true, status: state.status };
  }

  function statusText(status) {
    if (status === 'stale') return {
      en: 'The signed bundled relay list is past its refresh date. These last verified suggestions are still available; you can replace them or stay offline.',
      pt: 'A lista assinada de relays incluída passou da data de atualização. As últimas sugestões verificadas continuam disponíveis; você pode trocá-las ou ficar offline.'
    };
    if (status !== 'valid') return {
      en: 'The bundled relay list did not verify. No default relay was added; enter a relay you trust or stay offline.',
      pt: 'A lista de relays incluída não foi validada. Nenhum relay padrão foi adicionado; digite um relay em que confia ou fique offline.'
    };
    return {
      en: 'The bundled relay list is signed and included with Property. Selected relays may be unavailable; remove them here or add relays you trust.',
      pt: 'A lista de relays assinada está incluída no Property. Alguns podem estar indisponíveis; remova-os aqui ou adicione relays em que confia.'
    };
  }

  const CANDIDATES = Object.freeze(BUNDLED_EVENT.tags.filter(tag => tag[0] === 'r').map(tag => tag[1]));
  window.PropertyRelayDefaults = Object.freeze({ TRUSTED_PUBKEY, BUNDLED_EVENT, candidates: CANDIDATES,
    normalizeRelayUrl, validateSignedList, defaultState, pick, initialSelection, statusText });
})();
