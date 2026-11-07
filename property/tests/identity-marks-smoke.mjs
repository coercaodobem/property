import assert from 'node:assert/strict';

globalThis.window = {};
await import('../web/identity-marks.js');
const { checkKey, verifiedIdentityClaims, verifiedGitHubClaims, nip05CheckKey, verifiedNip05Profile } = window.PropertyIdentityMarks;

const peer = 'a'.repeat(64);
const eventId = 'b'.repeat(64);
const verified = { platform: 'github', identity: 'alice', proof: 'gist:1234' };
const unverified = { platform: 'github', identity: 'bob', proof: 'gist:5678' };
const unsupported = { platform: 'ssh', identity: 'key:abcd', proof: 'signature:xyz' };
const bluesky = { platform: 'bluesky', identity: 'alice.bsky.social', proof: '3abcde' };
const record = { eventId, claims: [verified, unverified, unsupported, bluesky] };
const checks = new Map([
  [checkKey(peer, record, verified), { status: 'verified' }],
  [checkKey(peer, record, unverified), { status: 'unverified' }],
  [checkKey(peer, record, unsupported), { status: 'verified' }],
  [checkKey(peer, record, bluesky), { status: 'verified' }]
]);

assert.deepEqual(verifiedGitHubClaims(peer, record, checks), [verified], 'only an explicitly verified supported GitHub claim for the exact signed event becomes a contact mark');
assert.deepEqual(verifiedIdentityClaims(peer, record, checks), [verified, bluesky], 'explicitly verified GitHub and Bluesky claims can mark a contact while unknown providers fail closed');
assert.deepEqual(verifiedGitHubClaims(peer, { ...record, eventId: 'c'.repeat(64) }, checks), [], 'a newer identity event invalidates the old in-session mark');
assert.deepEqual(verifiedGitHubClaims(peer, record, null), [], 'missing check state fails closed');
assert.deepEqual(verifiedGitHubClaims('invalid', record, checks), [], 'invalid public keys never receive marks');
assert.equal(checkKey(peer, record, verified), [peer, eventId, 'github', 'alice', 'gist:1234'].join(':'));

const profile = { eventId, nip05: 'Alice@Example.COM' };
const nip05Checks = new Map([[nip05CheckKey(peer, profile), { status: 'verified', matches: true }]]);
assert.equal(verifiedNip05Profile(peer, profile, nip05Checks), true, 'an explicit successful NIP-05 check can mark the exact signed profile for this session');
assert.equal(verifiedNip05Profile(peer, { ...profile, eventId: 'c'.repeat(64) }, nip05Checks), false, 'a newer signed profile invalidates a previous NIP-05 mark');
assert.equal(verifiedNip05Profile(peer, { ...profile, nip05: 'bob@example.com' }, nip05Checks), false, 'a different NIP-05 identifier cannot reuse a check');
assert.equal(verifiedNip05Profile('invalid', profile, nip05Checks), false, 'invalid public keys never receive NIP-05 marks');
assert.equal(verifiedNip05Profile(peer, profile, new Map([[nip05CheckKey(peer, profile), { status: 'verified', matches: false }]])), false, 'a non-matching lookup never receives a NIP-05 mark');

console.log('PASS: identity marks require explicit successful checks for exact signed GitHub, Bluesky, or NIP-05 claims and fail closed on stale or missing state');
