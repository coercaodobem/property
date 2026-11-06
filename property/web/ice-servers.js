'use strict';
(() => {
  const DEFAULT_ICE_SERVERS = Object.freeze([
    Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
    Object.freeze({ urls: 'stun:stun1.l.google.com:19302' })
  ]);
  const EMPTY = Object.freeze({ urls: '', username: '', credential: '', relayOnly: false });
  const PUBKEY_RE = /^[0-9a-f]{64}$/i;
  const MAX_URLS = 8;
  const MAX_URL_LENGTH = 512;
  const MAX_USERNAME_LENGTH = 256;
  const MAX_CREDENTIAL_LENGTH = 512;
  const RECORD_FORMAT = 'property-encrypted-webrtc-v1';

  function iceSettingsId(pubkey) {
    if (!PUBKEY_RE.test(pubkey || '')) throw new TypeError('Invalid Property identity.');
    return `property-webrtc:${pubkey.toLowerCase()}`;
  }

  function invalid(message) { throw new TypeError(message); }

  function inspectUrl(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH) invalid('Enter a valid STUN or TURN server address.');
    const match = /^(stun|turn|turns):([^/?#\s]+)(?:\?transport=(udp|tcp))?$/i.exec(value);
    if (!match || /[@\\%]/.test(match[2])) invalid('Use a STUN/TURN URL such as turn:turn.example.org:3478?transport=udp.');
    let authority;
    try { authority = new URL(`https://${match[2]}`); }
    catch { invalid('The STUN/TURN server address is invalid.'); }
    if (!authority.hostname || authority.username || authority.password || authority.pathname !== '/' || authority.search || authority.hash) {
      invalid('The STUN/TURN server address is invalid.');
    }
    if (authority.port && (Number(authority.port) < 1 || Number(authority.port) > 65535)) invalid('The STUN/TURN port must be between 1 and 65535.');
    const scheme = match[1].toLowerCase();
    return { url: value, turn: scheme === 'turn' || scheme === 'turns', stun: scheme === 'stun' };
  }

  function normalize(config = {}) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) invalid('WebRTC settings are invalid.');
    const rawUrls = config.urls === undefined ? '' : config.urls;
    if (typeof rawUrls !== 'string' || typeof (config.username ?? '') !== 'string' || typeof (config.credential ?? '') !== 'string') {
      invalid('Server URLs, username, and credential must be text.');
    }
    const urls = rawUrls.trim() ? rawUrls.trim().split(/[\s,]+/) : [];
    if (urls.length > MAX_URLS) invalid(`Use no more than ${MAX_URLS} STUN/TURN URLs.`);
    const inspected = urls.map(inspectUrl);
    if (new Set(inspected.map(item => item.url.toLowerCase())).size !== inspected.length) invalid('Remove duplicate STUN/TURN URLs.');
    const username = (config.username || '').trim();
    const credential = config.credential || '';
    if (username.length > MAX_USERNAME_LENGTH || credential.length > MAX_CREDENTIAL_LENGTH || /[\u0000-\u001f\u007f]/.test(username + credential)) {
      invalid('The TURN username or credential is too long or contains control characters.');
    }
    const hasTurn = inspected.some(item => item.turn);
    if (hasTurn && (!username || !credential.trim())) invalid('A TURN server needs both a username and a credential.');
    if (!hasTurn && (username || credential)) invalid('Add a TURN URL before entering TURN credentials.');
    if (config.relayOnly !== undefined && typeof config.relayOnly !== 'boolean') invalid('Relay-only mode must be on or off.');
    const relayOnly = config.relayOnly === true;
    if (relayOnly && !hasTurn) invalid('Relay-only mode requires a configured TURN server.');
    return Object.freeze({ urls: urls.join('\n'), username, credential, relayOnly });
  }

  function classify(config = {}) {
    const value = normalize(config);
    const urls = value.urls ? value.urls.split('\n').map(inspectUrl) : [];
    return Object.freeze({
      usesDefaultStun: urls.length === 0,
      hasStun: urls.some(item => item.stun),
      hasTurn: urls.some(item => item.turn),
      relayOnly: value.relayOnly
    });
  }

  function peerConfiguration(config = {}) {
    const value = normalize(config);
    const urls = value.urls ? value.urls.split('\n').map(inspectUrl) : [];
    let iceServers;
    if (!urls.length) iceServers = DEFAULT_ICE_SERVERS.map(server => ({ urls: server.urls }));
    else {
      const selected = value.relayOnly ? urls.filter(item => item.turn) : urls;
      const stun = selected.filter(item => item.stun).map(item => item.url);
      const turn = selected.filter(item => item.turn).map(item => item.url);
      iceServers = [];
      if (stun.length) iceServers.push({ urls: stun });
      if (turn.length) iceServers.push({ urls: turn, username: value.username, credential: value.credential });
    }
    return Object.freeze({
      iceServers: Object.freeze(iceServers.map(server => Object.freeze(server))),
      ...(value.relayOnly ? { iceTransportPolicy: 'relay' } : {})
    });
  }

  function encryptionKey(nostr, secret, pubkey) {
    if (!nostr?.nip44?.v2?.utils?.getConversationKey || typeof nostr.nip44.v2.encrypt !== 'function' ||
        typeof nostr.nip44.v2.decrypt !== 'function' || typeof nostr.getPublicKey !== 'function' || !PUBKEY_RE.test(pubkey || '') ||
        nostr.getPublicKey(secret)?.toLowerCase() !== pubkey.toLowerCase()) {
      throw new TypeError('Could not encrypt WebRTC settings for this identity.');
    }
    return nostr.nip44.v2.utils.getConversationKey(secret, pubkey.toLowerCase());
  }

  function seal(nostr, secret, pubkey, config) {
    const value = normalize(config);
    const cipher = nostr.nip44.v2.encrypt(JSON.stringify(value), encryptionKey(nostr, secret, pubkey));
    if (typeof cipher !== 'string' || !cipher) throw new Error('Could not encrypt the TURN credential.');
    return Object.freeze({ id: iceSettingsId(pubkey), format: RECORD_FORMAT, pubkey: pubkey.toLowerCase(), cipher });
  }

  function open(nostr, secret, pubkey, record) {
    if (!record) return { ...EMPTY };
    if (record.format !== RECORD_FORMAT || record.id !== iceSettingsId(pubkey) || record.pubkey !== pubkey.toLowerCase() ||
        typeof record.cipher !== 'string' || !record.cipher) {
      throw new Error('Saved WebRTC settings are invalid. Re-enter or clear them before calling.');
    }
    try {
      const plaintext = nostr.nip44.v2.decrypt(record.cipher, encryptionKey(nostr, secret, pubkey));
      return normalize(JSON.parse(plaintext));
    } catch {
      throw new Error('Saved WebRTC settings could not be unlocked. Re-enter or clear them before calling.');
    }
  }

  window.PropertyIceServers = Object.freeze({
    DEFAULT_ICE_SERVERS, MAX_URLS, MAX_URL_LENGTH, MAX_USERNAME_LENGTH, MAX_CREDENTIAL_LENGTH,
    iceSettingsId, normalize, classify, peerConfiguration, seal, open
  });
})();
