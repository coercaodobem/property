import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const [path, name] of [
  ['web/vendor/nostr-tools-2.25.2.bundle.js', 'nostr-tools'],
  ['web/contact.js', 'contact'],
  ['web/nostr-entities.js', 'nostr-entities'],
  ['web/rich-text.js', 'rich-text']
]) vm.runInContext(await readFile(join(root, path), 'utf8'), context, { filename: name });

const nostr = context.NostrTools;
const rich = context.PropertyRichText;
const pubkeys = ['a', 'b', 'c', 'd'].map(char => char.repeat(64));
const npubs = pubkeys.map(pubkey => nostr.nip19.npubEncode(pubkey));
const nprofile = nostr.nip19.nprofileEncode({ pubkey: pubkeys[0], relays: ['wss://relay.example'] });
const inline = JSON.parse(JSON.stringify(rich.tokenizeInline(`Contact ${npubs[0]} and nostr:${nprofile}`)));
const cards = inline.filter(segment => segment.type === 'nostr-profile');
assert.equal(cards.length, 1, 'npub and nprofile aliases of one key produce only one card');
assert.equal(cards[0].code, npubs[0], 'the first usable public code is retained for the contact action');
assert.equal(cards[0].pubkey, pubkeys[0]);
assert.equal(rich.plainText(`Contact ${npubs[0]}`), `Contact ${npubs[0]}`, 'text previews preserve the original NIP-19 code');
assert.equal(rich.tokenizeInline(`\`${npubs[0]}\``).some(segment => segment.type === 'nostr-profile'), false, 'profile-looking code in inline code stays literal');
assert.equal(rich.tokenizeInline(`https://example.test/${npubs[0]}`).some(segment => segment.type === 'nostr-profile'), false, 'profile-looking URL paths stay links');
assert.equal(rich.tokenizeInline('npub1truncated').some(segment => segment.type === 'nostr-profile'), false, 'invalid checksums stay plain text');
const uriProfileCode = npubs[1];
const uriProfile = rich.tokenizeInline(`Contact nostr:${uriProfileCode}`).find(segment => segment.type === 'nostr-profile');
assert.equal(uriProfile?.text, `nostr:${uriProfileCode}`, 'the visible URI prefix stays attached to its card');
assert.equal(uriProfile?.code, uriProfileCode, 'the contact action receives a valid public code without the URI prefix');
assert.equal(rich.tokenizeInline(`prefix${npubs[1]}`).some(segment => segment.type === 'nostr-profile'), false, 'profile-looking text embedded in an identifier stays literal');

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.attributes = {}; this.dataset = {};
    this._text = ''; this._classes = new Set();
    this.classList = { contains: value => this._classes.has(value), add: value => this._classes.add(value), toggle: value => { if (this._classes.has(value)) { this._classes.delete(value); return false; } this._classes.add(value); return true; } };
  }
  set className(value) { this._classes = new Set(String(value).split(/\s+/u).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  append(...nodes) { this._text = ''; this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
const document = { createElement: name => new FakeNode(name, document), createTextNode: value => { const node = new FakeNode('#text', document); node.textContent = value; return node; } };
const target = document.createElement('div');
rich.renderInto(target, [npubs[0], npubs[1], npubs[2], npubs[3]].join('\n'), 'en');
const rendered = [];
const visit = node => { rendered.push(node); node.children.forEach(visit); };
visit(target);
const renderedCards = rendered.filter(node => node.tagName === 'BUTTON' && node.classList.contains('message-nostr-profile'));
assert.equal(renderedCards.length, 3, 'at most three cards render in one message');
assert.equal(renderedCards[0].textContent, npubs[0], 'the rendered button retains the full public code as searchable text');
assert.equal(renderedCards[0].attributes['data-nostr-profile-code'], npubs[0], 'the button action carries only the public profile code');
assert.match(renderedCards[0].attributes['aria-label'], /Nostr profile/u);
assert.equal(target.textContent.includes(npubs[3]), true, 'references after the per-message cap remain readable plain text');

const localized = document.createElement('div');
rich.renderInto(localized, npubs[0], 'pt-BR');
const portugueseCard = [];
const visitPortuguese = node => { portugueseCard.push(node); node.children.forEach(visitPortuguese); };
visitPortuguese(localized);
assert.equal(portugueseCard.find(node => node.classList.contains('message-nostr-profile'))?.attributes['data-entity-label'], 'Contato Nostr');

console.log('PASS: valid npub/nprofile references become bounded local contact cards; malformed, code and link text stay inert; previews and PT-BR retain the source code');
