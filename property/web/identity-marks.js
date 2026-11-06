'use strict';
(() => {
  const PUBLIC_KEY = /^[0-9a-f]{64}$/;
  const EVENT_ID = /^[0-9a-f]{64}$/;

  function checkKey(peer, record, claim) {
    if (!PUBLIC_KEY.test(peer || '') || !EVENT_ID.test(record?.eventId || '') || !claim || typeof claim !== 'object') return '';
    if (typeof claim.platform !== 'string' || typeof claim.identity !== 'string' || typeof claim.proof !== 'string') return '';
    return [peer, record.eventId, claim.platform, claim.identity, claim.proof].join(':');
  }

  function verifiedGitHubClaims(peer, record, checks) {
    if (!PUBLIC_KEY.test(peer || '') || !EVENT_ID.test(record?.eventId || '') || !Array.isArray(record.claims) || !(checks instanceof Map)) return [];
    return record.claims.filter(claim => {
      if (!claim || claim.platform !== 'github' || !claim.identity || !claim.proof) return false;
      return checks.get(checkKey(peer, record, claim))?.status === 'verified';
    });
  }

  window.PropertyIdentityMarks = Object.freeze({ checkKey, verifiedGitHubClaims });
})();
