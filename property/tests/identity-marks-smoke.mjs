import assert from 'node:assert/strict';

globalThis.window = {};
await import('../web/identity-marks.js');
const { checkKey, verifiedGitHubClaims } = window.PropertyIdentityMarks;

const peer = 'a'.repeat(64);
const eventId = 'b'.repeat(64);
const verified = { platform: 'github', identity: 'alice', proof: 'gist:1234' };
const unverified = { platform: 'github', identity: 'bob', proof: 'gist:5678' };
const unsupported = { platform: 'ssh', identity: 'key:abcd', proof: 'signature:xyz' };
const record = { eventId, claims: [verified, unverified, unsupported] };
const checks = new Map([
  [checkKey(peer, record, verified), { status: 'verified' }],
  [checkKey(peer, record, unverified), { status: 'unverified' }],
  [checkKey(peer, record, unsupported), { status: 'verified' }]
]);

assert.deepEqual(verifiedGitHubClaims(peer, record, checks), [verified], 'only an explicitly verified supported GitHub claim for the exact signed event becomes a contact mark');
assert.deepEqual(verifiedGitHubClaims(peer, { ...record, eventId: 'c'.repeat(64) }, checks), [], 'a newer identity event invalidates the old in-session mark');
assert.deepEqual(verifiedGitHubClaims(peer, record, null), [], 'missing check state fails closed');
assert.deepEqual(verifiedGitHubClaims('invalid', record, checks), [], 'invalid public keys never receive marks');
assert.equal(checkKey(peer, record, verified), [peer, eventId, 'github', 'alice', 'gist:1234'].join(':'));

console.log('PASS: identity marks require an explicit verified GitHub check for the exact signed claim and fail closed on stale or missing state');
