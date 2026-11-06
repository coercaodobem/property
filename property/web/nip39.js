'use strict';
(() => {
  const KIND = 10011;
  const MAX_EVENT_BYTES = 16_384;
  const MAX_TAGS = 64;
  const MAX_IDENTITY_LENGTH = 512;
  const MAX_PROOF_LENGTH = 2_048;
  const MAX_GIST_RESPONSE_BYTES = 131_072;
  const encoder = new TextEncoder();

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function normalizePlatformIdentity(value) {
    if (typeof value !== 'string' || value.length > MAX_IDENTITY_LENGTH + 40) fail('nip39-invalid-identity', 'Invalid NIP-39 platform identity.');
    const separator = value.indexOf(':');
    if (separator < 1 || separator === value.length - 1) fail('nip39-invalid-identity', 'Invalid NIP-39 platform identity.');
    const platform = value.slice(0, separator).toLowerCase();
    const identity = value.slice(separator + 1).trim();
    if (!/^[a-z0-9._/-]{1,32}$/.test(platform) || /[\u0000-\u001f\u007f]/.test(identity) || !identity || identity.length > MAX_IDENTITY_LENGTH) {
      fail('nip39-invalid-identity', 'Invalid NIP-39 platform identity.');
    }
    return { platform, identity };
  }

  function normalizeClaim(claim) {
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) fail('nip39-invalid-claim', 'Invalid NIP-39 identity claim.');
    const identity = normalizePlatformIdentity(typeof claim.platform === 'string' && typeof claim.identity === 'string'
      ? `${claim.platform}:${claim.identity}` : claim.platformIdentity);
    if (typeof claim.proof !== 'string' || !claim.proof.trim() || claim.proof.length > MAX_PROOF_LENGTH || /[\u0000-\u001f\u007f]/.test(claim.proof)) {
      fail('nip39-invalid-proof', 'Invalid NIP-39 identity proof.');
    }
    const normalizedIdentity = identity.platform === 'github' ? identity.identity.toLowerCase() : identity.identity;
    return { platform: identity.platform, identity: normalizedIdentity, proof: claim.proof.trim() };
  }

  function claimFromTag(tag) {
    if (!Array.isArray(tag) || tag[0] !== 'i' || tag.length < 3 || typeof tag[1] !== 'string' || typeof tag[2] !== 'string') return null;
    try {
      return { ...normalizeClaim({ platformIdentity: tag[1], proof: tag[2] }), extra: tag.slice(3).filter(value => typeof value === 'string').slice(0, 8) };
    } catch { return null; }
  }

  function parseEvent(event, expectedPubkey, verifyEvent) {
    const pubkey = typeof expectedPubkey === 'string' ? expectedPubkey.toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(pubkey) || !event || event.kind !== KIND || event.pubkey !== pubkey ||
        !Number.isSafeInteger(event.created_at) || event.created_at < 0 || typeof event.content !== 'string' ||
        encoder.encode(event.content).byteLength > MAX_EVENT_BYTES || !/^[0-9a-f]{64}$/.test(event.id || '') ||
        !/^[0-9a-f]{128}$/.test(event.sig || '') || !Array.isArray(event.tags) || event.tags.length > MAX_TAGS || typeof verifyEvent !== 'function') return null;
    try {
      if (!verifyEvent(event)) return null;
      const claims = [];
      const seen = new Set();
      for (const tag of event.tags) {
        const claim = claimFromTag(tag);
        if (!claim) continue;
        const key = `${claim.platform}:${claim.identity}`;
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push(claim);
      }
      return { kind: KIND, pubkey, eventId: event.id, createdAt: event.created_at, claims };
    } catch { return null; }
  }

  function latestRecord(events, expectedPubkey, verifyEvent) {
    const ordered = (Array.isArray(events) ? events : [])
      .filter(event => event && Number.isSafeInteger(event.created_at) && typeof event.id === 'string')
      .sort((left, right) => right.created_at - left.created_at || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    for (const event of ordered) {
      const record = parseEvent(event, expectedPubkey, verifyEvent);
      if (record) return { ...record, event };
    }
    return null;
  }

  function eventTags(claims) {
    if (!Array.isArray(claims) || claims.length > MAX_TAGS) fail('nip39-too-many-claims', 'Use no more than 64 identity claims.');
    const tags = [];
    const seen = new Set();
    for (const input of claims) {
      const claim = normalizeClaim(input);
      const key = `${claim.platform}:${claim.identity}`;
      if (seen.has(key)) fail('nip39-duplicate-claim', 'Each platform identity can appear only once.');
      seen.add(key);
      tags.push(['i', key, claim.proof]);
    }
    return tags;
  }

  function githubClaim(username, gistId) {
    const identity = String(username || '').trim();
    const proof = String(gistId || '').trim().toLowerCase();
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(identity) || identity.includes('--')) {
      fail('nip39-invalid-github-username', 'Enter a valid GitHub username.');
    }
    if (!/^[0-9a-f]{20,64}$/.test(proof)) fail('nip39-invalid-github-gist', 'Enter the public Gist ID.');
    return { platform: 'github', identity: identity.toLowerCase(), proof };
  }

  function githubGistUrl(claim) {
    const normalized = normalizeClaim(claim);
    if (normalized.platform !== 'github' || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(normalized.identity) ||
        normalized.identity.includes('--') || !/^[0-9a-f]{20,64}$/.test(normalized.proof)) return '';
    return `https://gist.github.com/${normalized.identity}/${normalized.proof}`;
  }

  function verificationText(npub) {
    if (typeof npub !== 'string' || !/^npub1[0-9a-z]{20,80}$/i.test(npub)) fail('nip39-invalid-npub', 'Invalid Nostr public key.');
    return `Verifying that I control the following Nostr public key: ${npub}`;
  }

  async function readBounded(response) {
    const announced = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(announced) && announced > MAX_GIST_RESPONSE_BYTES) return null;
    if (typeof response.arrayBuffer === 'function') {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_GIST_RESPONSE_BYTES) return null;
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
    }
    if (typeof response.json === 'function') {
      try { return await response.json(); } catch { return null; }
    }
    return null;
  }

  async function verifyGitHubClaim(input, npub, fetcher = globalThis.fetch) {
    let claim;
    let text;
    try {
      claim = normalizeClaim(input);
      if (claim.platform !== 'github' || !githubGistUrl(claim)) return { status: 'invalid', reason: 'claim' };
      text = verificationText(npub);
    } catch { return { status: 'invalid', reason: 'claim' }; }
    if (typeof fetcher !== 'function') return { status: 'unavailable', reason: 'fetch' };
    const options = { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(8_000);
    let response;
    try { response = await fetcher(`https://api.github.com/gists/${encodeURIComponent(claim.proof)}`, options); }
    catch { return { status: 'unavailable', reason: 'network' }; }
    if (!response || !response.ok || response.redirected || response.type === 'opaqueredirect') return { status: 'unavailable', reason: 'http' };
    const gist = await readBounded(response);
    if (!gist || gist.public !== true || typeof gist.owner?.login !== 'string' || !gist.files || typeof gist.files !== 'object' || Array.isArray(gist.files)) {
      return { status: 'unverified', reason: 'gist-shape' };
    }
    const files = Object.values(gist.files);
    if (files.length !== 1) return { status: 'unverified', reason: 'gist-shape' };
    const ownerMatches = gist.owner.login.toLowerCase() === claim.identity;
    const file = files[0];
    if (!ownerMatches) return { status: 'unverified', reason: 'owner' };
    if (!file || file.truncated === true || typeof file.content !== 'string' || encoder.encode(file.content).byteLength > 65_536) {
      return { status: 'unverified', reason: 'gist-content' };
    }
    return file.content.includes(text) || file.content.includes(npub)
      ? { status: 'verified', reason: 'npub-found', claim }
      : { status: 'unverified', reason: 'npub-missing', claim };
  }

  globalThis.PropertyNip39 = Object.freeze({ KIND, MAX_EVENT_BYTES, MAX_TAGS, normalizeClaim, claimFromTag, parseEvent, latestRecord, eventTags, githubClaim, githubGistUrl, verificationText, verifyGitHubClaim });
})();
