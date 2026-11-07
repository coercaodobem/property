'use strict';
(() => {
  const PUBLIC_KEY = /^[0-9a-f]{64}$/;
  const EVENT_ID = /^[0-9a-f]{64}$/;

  function checkKey(peer, record, claim) {
    if (!PUBLIC_KEY.test(peer || '') || !EVENT_ID.test(record?.eventId || '') || !claim || typeof claim !== 'object') return '';
    if (typeof claim.platform !== 'string' || typeof claim.identity !== 'string' || typeof claim.proof !== 'string') return '';
    return [peer, record.eventId, claim.platform, claim.identity, claim.proof].join(':');
  }

  function verifiedIdentityClaims(peer, record, checks) {
    if (!PUBLIC_KEY.test(peer || '') || !EVENT_ID.test(record?.eventId || '') || !Array.isArray(record.claims) || !(checks instanceof Map)) return [];
    return record.claims.filter(claim => {
      if (!claim || !['github', 'bluesky'].includes(claim.platform) || !claim.identity || !claim.proof) return false;
      return checks.get(checkKey(peer, record, claim))?.status === 'verified';
    });
  }

  function verifiedGitHubClaims(peer, record, checks) {
    return verifiedIdentityClaims(peer, record, checks).filter(claim => claim.platform === 'github');
  }

  function nip05CheckKey(peer, profile) {
    if (!PUBLIC_KEY.test(peer || '') || !EVENT_ID.test(profile?.eventId || '') || typeof profile?.nip05 !== 'string' || !profile.nip05.trim()) return '';
    return [peer, profile.eventId, 'nip05', profile.nip05.trim().toLowerCase()].join(':');
  }

  function verifiedNip05Profile(peer, profile, checks) {
    if (!(checks instanceof Map)) return false;
    const key = nip05CheckKey(peer, profile);
    return Boolean(key && checks.get(key)?.status === 'verified' && checks.get(key)?.matches === true);
  }

  window.PropertyIdentityMarks = Object.freeze({ checkKey, verifiedIdentityClaims, verifiedGitHubClaims, nip05CheckKey, verifiedNip05Profile });
})();
