import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { decodeQrMatrix } from './qr-decode-fixture.mjs';

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams };
context.window = context;
context.PropertyI18n = { language: 'en' };
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { filename: 'nostr-tools bundle' });
vm.runInContext(await readFile(new URL('../web/contact.js', import.meta.url), 'utf8'), context, { filename: 'contact.js' });
vm.runInContext(await readFile(new URL('../web/vendor/qr-code-generator.js', import.meta.url), 'utf8'), context, { filename: 'qr-code-generator.js' });

const { nip19 } = context.NostrTools;
const contact = context.PropertyContact;
const pubkey = 'a'.repeat(64);
const unsafeAndDuplicateHints = [
  'wss://relay.one', 'wss://relay.one/', 'wss://relay.two', 'https://insecure.example',
  'wss://user:secret@credentials.example', 'wss://query.example/?token=x', 'wss://fragment.example/#private',
  'not a relay URL', 'wss://relay.three', 'wss://relay.four'
];
const shared = contact.createShare({
  pubkey,
  relayUrls: unsafeAndDuplicateHints,
  nprofileEncode: nip19.nprofileEncode,
  npubEncode: nip19.npubEncode,
  baseUrl: 'https://coercaodobem.github.io/property/?launch=old#view=messages'
});
const decodedProfile = nip19.decode(shared.nprofile);
assert.equal(decodedProfile.type, 'nprofile');
assert.equal(decodedProfile.data.pubkey, pubkey);
const decodedRelayHints = JSON.parse(JSON.stringify(decodedProfile.data.relays));
assert.deepEqual(decodedRelayHints, ['wss://relay.one/', 'wss://relay.two/', 'wss://relay.three/'], 'share includes at most three unique secure selected relay hints');
assert.equal(shared.relayHints.length, 3);
assert.equal(shared.npub, nip19.npubEncode(pubkey));
const propertyUrl = new URL(shared.url);
assert.equal(propertyUrl.origin, 'https://coercaodobem.github.io');
assert.equal(propertyUrl.pathname, '/property/');
assert.equal(propertyUrl.search, '', 'contact link does not retain unrelated launch query parameters');
assert.equal(new URLSearchParams(propertyUrl.hash.slice(1)).get('contact'), shared.nprofile);
assert.equal(decodeQrMatrix(context.PropertyQrCode.encodeMatrix(shared.url)), shared.url, 'independent local jsQR decoder reads the exact Property contact link from the generated matrix');
assert.deepEqual(JSON.parse(JSON.stringify(contact.parsePublicKey(shared.url))), { pubkey, relayHints: decodedRelayHints });
assert.deepEqual(JSON.parse(JSON.stringify(contact.parsePublicKey(`nostr:${shared.nprofile}`))), { pubkey, relayHints: decodedRelayHints });
assert.deepEqual(JSON.parse(JSON.stringify(contact.parsePublicKey(`nostr:${shared.npub}`))), { pubkey, relayHints: [] });
assert.deepEqual(JSON.parse(JSON.stringify(contact.parsePublicKey(`#contact=${encodeURIComponent(shared.nprofile)}`))), { pubkey, relayHints: decodedRelayHints });
assert.ok(!shared.url.includes('secret') && !shared.url.includes('message'), 'link contains no private key, password, or conversation content');

context.PropertyI18n.language = 'en';
const malformedInputs = ['', 'coercaodobem', 'npub1truncated', 'nprofile1truncated', 'nsec1private', 'https://example.invalid/#contact=nsec1private', 'javascript:npub1invalid', 'x'.repeat(6000)];
assert.equal(malformedInputs.length, 8);
for (const input of malformedInputs) {
  assert.throws(() => contact.parsePublicKey(input), error => (!input || !error.message.includes(input)) && !/at parsePublicKey|Letter "/.test(error.message), 'bad/secret input has a bounded, safe error');
}
assert.throws(() => contact.parsePublicKey('nsec1private'), /private nsec/i, 'English contact validation is available by default');
assert.throws(() => contact.parsePublicKey('not-a-user'), /tap Resolve NIP-05 first; a name alone is not unique/i);
assert.throws(() => contact.parsePublicKey('nprofile1test', () => ({ type: 'nprofile', data: { pubkey, relays: 'invalid' } })), /invalid relay list/i,
  'malformed nprofile relay hints report in English by default');
context.PropertyI18n.language = 'pt-BR';
assert.throws(() => contact.parsePublicKey('nsec1private'), /chave privada nsec/i, 'Portuguese contact validation follows the selected language');
assert.throws(() => contact.parsePublicKey('nprofile1test', () => ({ type: 'nprofile', data: { pubkey, relays: 'invalid' } })), /lista de relays inválida/i);
assert.throws(() => contact.createShare({ pubkey: 'not-a-key', relayUrls: [], nprofileEncode: nip19.nprofileEncode, npubEncode: nip19.npubEncode, baseUrl: 'https://coercaodobem.github.io/property/' }), /Identidade pública inválida/);
assert.throws(() => contact.createShare({ pubkey, relayUrls: [], nprofileEncode: nip19.nprofileEncode, npubEncode: nip19.npubEncode, baseUrl: 'file:///property/index.html' }), /HTTP\(S\)/);
console.log('PASS: NIP-19 contact share, Property URL/QR payload, safe relay-hint filtering, paste formats, and bilingual validation');
