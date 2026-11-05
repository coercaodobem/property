import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/secret-guard.js'), 'utf8');
const window = {};
const context = vm.createContext({ window, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, atob, btoa });
vm.runInContext(source, context, { timeout: 5000 });
const guard = window.PropertySecretGuard;
assert.equal(typeof guard?.findSecret, 'function', 'the offline bundle exposes local detection');

const nsec = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw';
const npub = 'npub1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs8j9gdm';
const englishBip39 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const portugueseBip39 = 'imitador vinheta sogro xerife veleiro pomar volumoso tratador imitador vinheta sogro xingar';
const englishMonero = 'velvet lymph giddy number token physics poetry unquoted nibs useful sabotage limits benches lifestyle eden nitrogen anvil fewest avoid batch vials washing fences goat unquoted';
const portugueseMonero = 'motriz teosofico fucsia eventualidade utilizar zefiro ragu tanzaniano jingle generoso jambo paciente unheiro sugestoes oblongo ducto caquizeiro jururu baforada software roer echarpe vulva jihad unheiro';
const wif = 'KwFfNUhSDaASSAwtG7ssQM1uVX8RgX5GHWnnLfhfiQDigjioWXHH';
const xprv = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi';
const cashu = 'cashuBo2FtcGh0dHA6Ly9taW50LnRlc3RhdWNzYXRhdIGiYWlIAJofKTJT5B5hcIKjYWEIYXNtdGVzdC1zZWNyZXQtYWFjWCECERERERERERERERERERERERERERERERERERERERERERGjYWENYXNtdGVzdC1iYWNjWCECIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI';
const kind = text => guard.findSecret(text)?.kind || null;

assert.equal(kind(nsec), 'nsec', 'recognizes Nostr private keys');
assert.equal(kind(englishBip39), 'mnemonic', 'recognizes BIP39 English');
assert.equal(kind(portugueseBip39), 'mnemonic', 'recognizes BIP39 Portuguese');
assert.equal(kind(englishMonero), 'mnemonic', 'recognizes Monero English');
assert.equal(kind(portugueseMonero), 'mnemonic', 'recognizes Monero Portuguese');
assert.equal(kind(wif), 'bitcoin-key', 'recognizes Bitcoin WIF keys');
assert.equal(kind(xprv), 'bitcoin-key', 'recognizes extended private keys');
assert.equal(kind(cashu), 'cashu', 'recognizes Cashu bearer tokens');
assert.equal(kind(`private key: ${'01'.repeat(32)}`), 'hex-key', 'recognizes contextual raw private-key hex');
assert.equal(kind(`${'01'.repeat(32)}`), null, 'does not flag a bare hash without secret context');
assert.equal(kind(npub), null, 'does not flag public Nostr keys');
assert.equal(kind('I will meet you at the cafe after work.'), null, 'ordinary conversation remains unflagged');
assert.equal(kind(englishBip39.replace('yellow', 'yard')), 'mnemonic', 'a whole phrase with one mistyped word still warns');
assert.equal(kind(nsec.replace('nsec1', 'nsec\u200b1')), 'nsec', 'invisible separators cannot hide a private key');
assert.equal(JSON.stringify(guard.findSecret(nsec)).includes(nsec), false, 'the detector returns no matched text');

console.log('PASS: local secret guard catches Nostr, Bitcoin, English/Portuguese recovery phrases and ecash without returning message text');
