import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/rich-text.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window, URL }, { filename: 'rich-text.js' });
const rich = window.PropertyRichText;
const plain = value => JSON.parse(JSON.stringify(value));

const inline = plain(rich.tokenizeInline('*bold* _italic_ ~~strike~~ ||secret|| `*literal*`'));
assert.deepEqual(inline.map(part => part.type === 'span' ? [part.style, part.children.map(child => child.text || child.style)] : [part.type, part.text]), [
  ['bold', ['bold']], ['text', ' '], ['italic', ['italic']], ['text', ' '], ['strike', ['strike']], ['text', ' '], ['spoiler', ['secret']], ['text', ' '], ['code', '*literal*']
]);
assert.equal(rich.plainText('snake_case_name, 2*3*4, __init__.py, ~5 min'), 'snake_case_name, 2*3*4, __init__.py, ~5 min', 'ordinary underscores, arithmetic and single tildes remain unchanged');
assert.equal(rich.plainText('**open with no close'), '**open with no close', 'unpaired formatting markers remain visible text');
assert.equal(rich.plainText('**bold _and nested_**'), 'bold and nested', 'paired markers may be nested');
assert.equal(rich.preview('||private words||'), '▒▒▒', 'conversation previews do not reveal spoiler text');

function fakeInput(value, start, end) {
  return {
    value, selectionStart: start, selectionEnd: end,
    setRangeText(replacement, from, to) {
      this.value = `${this.value.slice(0, from)}${replacement}${this.value.slice(to)}`;
      this.selectionStart = from;
      this.selectionEnd = from + replacement.length;
    },
    setSelectionRange(from, to) { this.selectionStart = from; this.selectionEnd = to; }
  };
}
const selectedDraft = fakeInput('hello world', 6, 11);
assert.equal(rich.wrapSelection(selectedDraft, '**'), true);
assert.equal(selectedDraft.value, 'hello **world**');
assert.deepEqual([selectedDraft.selectionStart, selectedDraft.selectionEnd], [6, 15]);
const emptyDraft = fakeInput('hello world', 5, 5);
assert.equal(rich.wrapSelection(emptyDraft, '||'), true);
assert.equal(emptyDraft.value, 'hello|||| world');
assert.deepEqual([emptyDraft.selectionStart, emptyDraft.selectionEnd], [7, 7], 'empty formatting pair leaves the caret inside');
assert.equal(rich.wrapSelection(emptyDraft, '<img>'), false, 'unsupported markers are rejected');

const blocks = plain(rich.parseMessage('**Title**\n\n# Heading\n\n- first\n- second\n  - nested\n\n> quoted *words*\n\n```js\nalert(1)\n```'));
assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'heading', 'list', 'quote', 'codeblock']);
assert.equal(blocks[2].items[1].children[0].items[0].marker, '•', 'indented list items are represented as a nested list');
assert.equal(blocks[4].language, 'js');
assert.equal(blocks[4].text, 'alert(1)');
assert.equal(rich.plainText('> quoted *words*'), '> quoted words');
assert.equal(rich.plainText('```\nnot closed\nstill text'), '```\nnot closed\nstill text', 'an unmatched code fence is kept literal');
assert.equal(rich.plainText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>', 'HTML-looking text stays text');
assert.equal(rich.plainText('*https://example.test*'), 'https://example.test', 'formatting markers adjacent to an autolink remain formatting, not part of its URL');
const manyBlocks = Array.from({ length: 520 }, (_, index) => `# Heading ${index}`).join('\n');
assert.equal(rich.plainText(manyBlocks).split('\n').length, 520, 'the block limit preserves the remaining message as plain text');

const links = plain(rich.tokenizeInline('Open https://example.test/a(b)). and `https://hidden.test`'));
const link = links.find(part => part.type === 'link');
assert.ok(link);
assert.equal(link.text, 'https://example.test/a(b)');
assert.equal(link.href, 'https://example.test/a(b)');
assert.ok(links.some(part => part.type === 'code' && part.text === 'https://hidden.test'), 'links inside inline code are inert');
assert.equal(rich.tokenizeInline('javascript:alert(1)').some(part => part.type === 'link'), false, 'non-HTTP schemes are never links');
assert.equal(rich.tokenizeInline('https://user:secret@example.test/').some(part => part.type === 'link'), false, 'credential-bearing URLs remain text');
assert.equal(rich.tokenizeInline('https://exa\u200bmple.test').some(part => part.type === 'link'), false, 'hidden Unicode characters cannot create deceptive links');
const longUrlTail = rich.tokenizeInline(`https://example.test/path${')'.repeat(8192)}`);
assert.equal(longUrlTail[0].text, 'https://example.test/path', 'unmatched trailing URL punctuation is separated without rescanning the whole link');
assert.equal(longUrlTail[1].text, ')'.repeat(8192));
assert.equal(rich.parseMessage('x'.repeat(rich.MAX_FORMATTED_CHARS + 1))[0].type, 'plain', 'oversized text bypasses formatting work and remains intact');

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this._text = '';
    this._classes = new Set();
    this.classList = {
      contains: value => this._classes.has(value),
      add: value => this._classes.add(value),
      toggle: value => { if (this._classes.has(value)) { this._classes.delete(value); return false; } this._classes.add(value); return true; }
    };
  }
  set className(value) { this._classes = new Set(String(value).split(/\s+/u).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  set href(value) { this.attributes.href = String(value); }
  set target(value) { this.attributes.target = String(value); }
  set rel(value) { this.attributes.rel = String(value); }
  set referrerPolicy(value) { this.attributes.referrerpolicy = String(value); }
  append(...nodes) { this._text = ''; this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}
const document = {
  createElement(tagName) { return new FakeNode(tagName.toUpperCase(), document); },
  createTextNode(value) { const node = new FakeNode('#text', document); node.textContent = value; return node; }
};
const target = document.createElement('div');
rich.renderInto(target, 'Literal <img src=x> **bold** https://example.test ||secret||', 'en');
const nodes = [];
const visit = node => { nodes.push(node); node.children.forEach(visit); };
visit(target);
assert.equal(nodes.some(node => node.tagName === 'IMG' || node.tagName === 'SCRIPT'), false, 'rendering never turns message content into HTML elements');
const anchor = nodes.find(node => node.tagName === 'A');
assert.equal(anchor?.attributes.target, '_blank');
assert.equal(anchor?.attributes.rel, 'noopener noreferrer');
assert.equal(anchor?.attributes.referrerpolicy, 'no-referrer');
const spoiler = nodes.find(node => node.tagName === 'BUTTON' && node.classList.contains('message-spoiler'));
assert.equal(spoiler?.attributes['aria-expanded'], 'false');
spoiler.listeners.click();
assert.equal(spoiler.attributes['aria-expanded'], 'true', 'spoilers are revealed through a keyboard-accessible button');
assert.ok(target.textContent.includes('<img src=x>'), 'HTML-like message text is rendered as literal text nodes');

console.log('PASS: Ghostly-style rich text stays local, safely renders formatting and HTTP(S) links, preserves plain-message semantics, and hides spoilers in previews');
