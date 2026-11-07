import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const bundle = await readFile(new URL('web/vendor/nostr-tools-2.25.2.bundle.js', root), 'utf8');
const context = { console, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, AbortSignal };
context.window = context;
vm.createContext(context);
vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(await readFile(new URL('web/nip39.js', root), 'utf8'), context, { timeout: 5000 });
const nostr = context.NostrTools;
const nip39 = context.PropertyNip39;
const secret = nostr.generateSecretKey();
const pubkey = nostr.getPublicKey(secret);
const npub = nostr.nip19.npubEncode(pubkey);
function sign(template) {
  context.templateJson = JSON.stringify(template);
  context.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(templateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}

assert.equal(nip39.KIND, 10011);
assert.deepEqual(JSON.parse(JSON.stringify(nip39.githubClaim('Coercaodobem', '0123456789abcdef0123456789abcdef'))), {
  platform: 'github', identity: 'coercaodobem', proof: '0123456789abcdef0123456789abcdef'
});
assert.equal(nip39.githubGistUrl({ platform: 'github', identity: 'Coercaodobem', proof: '0123456789abcdef0123456789abcdef' }),
  'https://gist.github.com/coercaodobem/0123456789abcdef0123456789abcdef');
const blueskyClaim = nip39.blueskyClaim('@Alice.bsky.social', '3abcdeFG');
assert.deepEqual(JSON.parse(JSON.stringify(blueskyClaim)), { platform: 'bluesky', identity: 'alice.bsky.social', proof: '3abcdeFG' });
assert.equal(nip39.blueskyPostUrl(blueskyClaim), 'https://bsky.app/profile/alice.bsky.social/post/3abcdeFG');
assert.equal(nip39.verificationText(npub), `Verifying that I control the following Nostr public key: ${npub}`);
assert.throws(() => nip39.githubClaim('../evil', '0123456789abcdef0123456789abcdef'), { code: 'nip39-invalid-github-username' });
assert.throws(() => nip39.githubClaim('alice', 'https://evil.example'), { code: 'nip39-invalid-github-gist' });
assert.throws(() => nip39.blueskyClaim('alice.bsky.social/post/1', '3abcde'), { code: 'nip39-invalid-bluesky-handle' });
assert.throws(() => nip39.blueskyClaim('alice.bsky.social', '../evil'), { code: 'nip39-invalid-bluesky-record-key' });
assert.throws(() => nip39.eventTags([
  { platform: 'github', identity: 'alice', proof: '0123456789abcdef0123456789abcdef' },
  { platform: 'github', identity: 'ALICE', proof: '1123456789abcdef0123456789abcdef' }
]), { code: 'nip39-duplicate-claim' });
assert.deepEqual(JSON.parse(JSON.stringify(nip39.eventTags([{ platform: 'bluesky', identity: 'alice.bsky.social', proof: '3abcdeFG', extra: ['future-field'] }]))),
  [['i', 'bluesky:alice.bsky.social', '3abcdeFG', 'future-field']], 'republishing preserves future NIP-39 tag parameters');

const claim = { platform: 'github', identity: 'alice', proof: '0123456789abcdef0123456789abcdef' };
const event = sign({ kind: 10011, content: '', tags: [['i', 'github:alice', claim.proof], ['i', 'telegram:12345', 'nostrdirectory/770', 'future-field']], created_at: 1_800_000_000 });
const parsed = nip39.parseEvent(event, pubkey, nostr.verifyEvent);
assert.equal(parsed.pubkey, pubkey);
assert.equal(parsed.claims.length, 2);
assert.equal(parsed.claims[0].platform, 'github');
assert.deepEqual(JSON.parse(JSON.stringify(parsed.claims[1].extra)), ['future-field'], 'future NIP-39 tag fields are preserved');
assert.equal(nip39.parseEvent(event, 'ab'.repeat(32), nostr.verifyEvent), null, 'a signed event cannot be attributed to a different key');
context.mutatedEventJson = JSON.stringify({ ...event, sig: '00'.repeat(64) });
const mutatedEvent = vm.runInContext('JSON.parse(mutatedEventJson)', context, { timeout: 5000 });
assert.equal(nip39.parseEvent(mutatedEvent, pubkey, nostr.verifyEvent), null, 'invalid event signatures are rejected');
assert.equal(nip39.parseEvent({ ...event, kind: 0 }, pubkey, nostr.verifyEvent), null, 'only kind 10011 is accepted');
const duplicate = sign({ kind: 10011, content: '', tags: [['i', 'github:alice', claim.proof], ['i', 'github:ALICE', '1123456789abcdef0123456789abcdef']], created_at: 1_800_000_001 });
assert.equal(nip39.parseEvent(duplicate, pubkey, nostr.verifyEvent).claims.length, 1, 'duplicate provider identities are shown once');
const newer = sign({ kind: 10011, content: '', tags: [], created_at: 1_800_000_002 });
assert.equal(nip39.latestRecord([event, newer], pubkey, nostr.verifyEvent).claims.length, 0, 'a newer empty replaceable event removes old identity claims');

let capturedRequest;
const verified = await nip39.verifyGitHubClaim(claim, npub, async (url, options) => {
  capturedRequest = { url, options };
  return new Response(JSON.stringify({
    public: true, owner: { login: 'Alice' },
    files: { 'nostr.txt': { filename: 'nostr.txt', truncated: false, content: `proof\n${npub}\n` } }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
assert.equal(verified.status, 'verified');
assert.equal(capturedRequest.url, `https://api.github.com/gists/${claim.proof}`);
assert.equal(capturedRequest.options.credentials, 'omit');
assert.equal(capturedRequest.options.redirect, 'error');
assert.equal(capturedRequest.options.referrerPolicy, 'no-referrer');
assert.equal(capturedRequest.options.headers.Accept, 'application/vnd.github+json');

const badOwner = await nip39.verifyGitHubClaim(claim, npub, async () => new Response(JSON.stringify({
  public: true, owner: { login: 'someone-else' }, files: { 'nostr.txt': { content: npub } }
}), { status: 200 }));
assert.equal(badOwner.status, 'unverified');
assert.equal(badOwner.reason, 'owner');
const privateGist = await nip39.verifyGitHubClaim(claim, npub, async () => new Response(JSON.stringify({
  public: false, owner: { login: 'alice' }, files: { 'nostr.txt': { content: npub } }
}), { status: 200 }));
assert.equal(privateGist.reason, 'gist-shape');
const multipleFiles = await nip39.verifyGitHubClaim(claim, npub, async () => new Response(JSON.stringify({
  public: true, owner: { login: 'alice' }, files: { 'first.txt': { content: npub }, 'second.txt': { content: npub } }
}), { status: 200 }));
assert.equal(multipleFiles.reason, 'gist-shape');
const missingProof = await nip39.verifyGitHubClaim(claim, npub, async () => new Response(JSON.stringify({
  public: true, owner: { login: 'alice' }, files: { 'nostr.txt': { content: 'not a proof' } }
}), { status: 200 }));
assert.equal(missingProof.reason, 'npub-missing');
const redirected = await nip39.verifyGitHubClaim(claim, npub, async () => ({ ok: true, redirected: true, headers: { get: () => null } }));
assert.equal(redirected.reason, 'http');
const unavailable = await nip39.verifyGitHubClaim(claim, npub, async () => { throw new Error('offline'); });
assert.equal(unavailable.reason, 'network');
const oversized = await nip39.verifyGitHubClaim(claim, npub, async () => new Response('{}', {
  status: 200, headers: { 'content-length': '999999' }
}));
assert.equal(oversized.reason, 'gist-shape');
assert.equal((await nip39.verifyGitHubClaim(claim, 'not-an-npub', async () => { throw new Error('must not fetch'); })).status, 'invalid');

const blueskyDid = 'did:plc:abcdefghijklmnopqrstuvwx';
const expectedPostUri = `at://${blueskyDid}/app.bsky.feed.post/${blueskyClaim.proof}`;
const blueskyRequests = [];
const blueskyVerified = await nip39.verifyBlueskyClaim(blueskyClaim, npub, async (url, options) => {
  blueskyRequests.push({ url, options });
  if (url.includes('app.bsky.actor.getProfile')) return new Response(JSON.stringify({ did: blueskyDid, handle: 'alice.bsky.social' }), { status: 200 });
  return new Response(JSON.stringify({ thread: { post: {
    uri: expectedPostUri,
    author: { did: blueskyDid, handle: 'alice.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: `Proof: ${npub}` }
  } } }), { status: 200 });
});
assert.equal(blueskyVerified.status, 'verified');
assert.equal(blueskyRequests.length, 2, 'verification performs only a bounded profile resolution and one post lookup');
assert.match(blueskyRequests[0].url, /^https:\/\/public\.api\.bsky\.app\/xrpc\/app\.bsky\.actor\.getProfile\?actor=/);
assert.match(blueskyRequests[1].url, /^https:\/\/public\.api\.bsky\.app\/xrpc\/app\.bsky\.feed\.getPostThread\?uri=/);
for (const request of blueskyRequests) {
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.cache, 'no-store');
}
const blueskyWrongHandle = await nip39.verifyBlueskyClaim(blueskyClaim, npub, async () => new Response(JSON.stringify({ did: blueskyDid, handle: 'someone-else.bsky.social' }), { status: 200 }));
assert.deepEqual(JSON.parse(JSON.stringify(blueskyWrongHandle)), { status: 'unverified', reason: 'profile' });
const blueskyWrongRecord = await nip39.verifyBlueskyClaim(blueskyClaim, npub, async url => url.includes('getProfile')
  ? new Response(JSON.stringify({ did: blueskyDid, handle: 'alice.bsky.social' }), { status: 200 })
  : new Response(JSON.stringify({ thread: { post: {
    uri: `at://${blueskyDid}/app.bsky.feed.post/other`,
    author: { did: blueskyDid, handle: 'alice.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: npub }
  } } }), { status: 200 }));
assert.equal(blueskyWrongRecord.reason, 'post', 'the returned URI, author DID, handle, collection and record type must match the claim');
const blueskyMissingKey = await nip39.verifyBlueskyClaim(blueskyClaim, npub, async url => url.includes('getProfile')
  ? new Response(JSON.stringify({ did: blueskyDid, handle: 'alice.bsky.social' }), { status: 200 })
  : new Response(JSON.stringify({ thread: { post: {
    uri: expectedPostUri,
    author: { did: blueskyDid, handle: 'alice.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: 'not a proof' }
  } } }), { status: 200 }));
assert.equal(blueskyMissingKey.reason, 'npub-missing');
let blueskyCalls = 0;
const blueskyOversized = await nip39.verifyBlueskyClaim(blueskyClaim, npub, async () => {
  blueskyCalls += 1;
  return new Response('{}', { status: 200, headers: { 'content-length': '999999' } });
});
assert.equal(blueskyOversized.status, 'unavailable');
assert.equal(blueskyCalls, 1, 'an oversized profile response stops before the post request');
assert.equal((await nip39.verifyBlueskyClaim(blueskyClaim, 'not-an-npub', async () => { throw new Error('must not fetch'); })).status, 'invalid');

console.log('PASS: NIP-39 kind 10011 parsing, future-tag preservation, GitHub and Bluesky claims, bounded explicit proof checks');
