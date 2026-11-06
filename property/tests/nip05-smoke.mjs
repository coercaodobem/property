import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/nip05.js'), 'utf8');
const context = vm.createContext({ TextEncoder, TextDecoder, URL, AbortController, setTimeout, clearTimeout });
vm.runInContext(source, context, { timeout: 5000 });
const nip05 = context.PropertyNip05;
const pubkey = 'ab'.repeat(32);

assert.equal(nip05.MAX_RESPONSE_BYTES, 65_536);
assert.equal(nip05.REQUEST_TIMEOUT_MS, 8_000);
const parsed = nip05.parseIdentifier('alice@Example.COM');
assert.equal(parsed.identifier, 'alice@example.com');
assert.equal(parsed.domain, 'example.com');
assert.equal(new URL(parsed.url).pathname, '/.well-known/nostr.json');
assert.equal(new URL(parsed.url).searchParams.get('name'), 'alice');
assert.equal(nip05.parseIdentifier('Alice@Example.COM').identifier, 'alice@example.com', 'NIP-05 names are requested in lowercase');
assert.throws(() => nip05.parseIdentifier('alice@example.com/path'), { code: 'nip05-invalid-identifier' });
assert.throws(() => nip05.parseIdentifier('alice@localhost'), { code: 'nip05-invalid-identifier' });
assert.throws(() => nip05.parseIdentifier('alice@example.com@evil.example'), { code: 'nip05-invalid-identifier' });

let request;
const match = await nip05.check('alice@example.com', pubkey, async (url, options) => {
  request = { url, options };
  return new Response(JSON.stringify({ names: { alice: pubkey }, relays: { [pubkey]: ['wss://relay.example'] } }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
});
assert.equal(match.matches, true);
assert.equal(match.identifier, 'alice@example.com');
assert.equal(new URL(request.url).origin, 'https://example.com');
assert.equal(request.options.method, 'GET');
assert.equal(request.options.mode, 'cors');
assert.equal(request.options.credentials, 'omit');
assert.equal(request.options.cache, 'no-store');
assert.equal(request.options.redirect, 'manual');
assert.equal(request.options.referrerPolicy, 'no-referrer');
assert.equal(request.options.headers.Accept, 'application/json');

let resolveRequest;
const resolved = await nip05.resolve('Alice@Example.COM', async (url, options) => {
  resolveRequest = { url, options };
  return new Response(JSON.stringify({ names: { alice: pubkey } }), { status: 200, headers: { 'content-type': 'application/json' } });
});
assert.deepEqual(JSON.parse(JSON.stringify(resolved)), { pubkey, identifier: 'alice@example.com', domain: 'example.com' });
assert.equal(new URL(resolveRequest.url).searchParams.get('name'), 'alice');
assert.equal(resolveRequest.options.credentials, 'omit');
assert.equal(resolveRequest.options.referrerPolicy, 'no-referrer');
await assert.rejects(nip05.resolve('alice@example.com', async () =>
  new Response(JSON.stringify({ names: {} }), { status: 200 })
), { code: 'nip05-not-found' }, 'missing names are reported without guessing a key');
await assert.rejects(nip05.resolve('alice@example.com', async () =>
  new Response(JSON.stringify({ names: { alice: 'AB'.repeat(32) } }), { status: 200 })
), { code: 'nip05-invalid-response' }, 'resolved keys must be lowercase hex');

const mismatch = await nip05.check('alice@example.com', pubkey, async () =>
  new Response(JSON.stringify({ names: { alice: 'cd'.repeat(32) } }), { status: 200 })
);
assert.equal(mismatch.matches, false);
await assert.rejects(nip05.check('alice@example.com', pubkey, async () => Response.redirect('https://elsewhere.example/')),
  { code: 'nip05-http-error' }, 'redirect responses are rejected');
await assert.rejects(nip05.check('alice@example.com', pubkey, async () => ({
  ok: true, type: 'opaqueredirect', redirected: false, headers: { get: () => null },
  body: null, text: async () => '{}'
})), { code: 'nip05-http-error' }, 'opaque redirects are rejected');
await assert.rejects(nip05.check('alice@example.com', pubkey, async () => new Response('x'.repeat(65_537), { status: 200 })),
  { code: 'nip05-response-too-large' }, 'oversized responses are rejected');
await assert.rejects(nip05.check('alice@example.com', pubkey, async () => new Response('{"names": []}', { status: 200 })),
  { code: 'nip05-invalid-response' }, 'malformed NIP-05 mappings are rejected');
await assert.rejects(nip05.check('alice@example.com', pubkey, async () => { throw new Error('offline'); }),
  { code: 'nip05-network-error' }, 'network and browser CORS failures are surfaced without details');
await assert.rejects(nip05.check('alice@example.com', 'not-a-key', async () => assert.fail('invalid keys must not send requests')),
  { code: 'nip05-invalid-request' });

console.log('PASS: NIP-05 checks are explicit, HTTPS-only, bounded, redirect-safe, credential-free, and compare only the requested public key');
