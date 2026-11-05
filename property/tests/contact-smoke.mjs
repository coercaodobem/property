import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/contact.js'), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.PropertyI18n = { language: 'pt-BR' };
context.window = context;
vm.createContext(context);
const vendor = await readFile(join(root, 'web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8');
vm.runInContext(vendor, context, { filename: 'nostr-tools-2.25.2.bundle.js' });
vm.runInContext(source, context, { filename: 'contact.js' });
const parse = context.PropertyContact.parsePublicKey;

const hex = 'A'.repeat(64);
assert.deepEqual(JSON.parse(JSON.stringify(parse(hex))), { pubkey: hex.toLowerCase(), relayHints: [] });
const encodedNpub = context.NostrTools.nip19.npubEncode(hex.toLowerCase());
const encodedNprofile = context.NostrTools.nip19.nprofileEncode({ pubkey: hex.toLowerCase(), relays: ['wss://relay.example'] });
assert.deepEqual(JSON.parse(JSON.stringify(parse(encodedNpub))), { pubkey: hex.toLowerCase(), relayHints: [] });
assert.deepEqual(JSON.parse(JSON.stringify(parse(encodedNprofile))), { pubkey: hex.toLowerCase(), relayHints: ['wss://relay.example'] });

for (const [input, expected] of [
  ['', /Informe o contato público/],
  ['coercaodobem', /não busca nomes de usuário/],
  ['nsec1secret', /chave privada nsec/],
  ['npub1truncated', /Não foi possível validar este npub/],
  ['nprofile1truncated', /Não foi possível validar este nprofile/]
]) {
  assert.throws(() => parse(input), expected, `safe Portuguese validation for ${input || 'empty input'}`);
}

assert.throws(() => parse('nprofile1valid', () => ({ type: 'nprofile', data: { pubkey: 'bad', relays: [] } })), /Este campo não busca nomes de usuário/);
assert.throws(() => parse('nprofile1valid', () => ({ type: 'nprofile', data: { pubkey: hex, relays: 'wss://relay.example' } })), /lista de relays inválida/);
assert.throws(() => parse('npub1truncated', () => { throw new Error('Letter "1" must be present between prefix and data only'); }), error => /Não foi possível validar este npub/.test(error.message) && !/Letter/.test(error.message));
console.log('PASS: hex/npub/nprofile reais; nome livre, vazio, nsec, bech32 truncado e hints inválidos recebem validação segura em português');
