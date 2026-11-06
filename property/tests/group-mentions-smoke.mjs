import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/group-mentions.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const mentions = window.PropertyGroupMentions;
const alice = 'a'.repeat(64), bob = 'b'.repeat(64), carol = 'c'.repeat(64);

assert.deepEqual(JSON.parse(JSON.stringify(mentions.queryAt('hello @al', 9))), { start: 6, end: 9, query: 'al' });
assert.equal(mentions.queryAt('mail@alice', 10), null, 'an email-like token does not open mention search');
assert.equal(mentions.queryAt('(@', 2)?.query, '', 'an empty @ query shows group members');
assert.deepEqual(mentions.filterCandidates([
  { name: 'Álice', pubkey: alice }, { name: 'Bob Smith', pubkey: bob }, { name: 'Carol', pubkey: carol }
], 'ali').map(item => item.pubkey), [alice], 'matching ignores accents');
assert.deepEqual(mentions.filterCandidates([
  { name: 'Carol', pubkey: carol }, { name: 'Alice', pubkey: alice }
], '').map(item => item.name), ['Alice', 'Carol'], 'the initial member list is predictable and alphabetic');

const query = mentions.queryAt('Hi @al, welcome', 6);
const inserted = mentions.insertMention('Hi @al, welcome', query, { name: 'Alice', pubkey: alice });
assert.equal(inserted.text, 'Hi @Alice, welcome');
const shifted = mentions.reconcileMentions([inserted.mention], inserted.text, `! ${inserted.text}`, 2);
assert.deepEqual(JSON.parse(JSON.stringify(shifted)), [{ pubkey: alice, label: 'Alice', start: 5 }], 'mention bindings move with text inserted before them');
assert.deepEqual(JSON.parse(JSON.stringify(mentions.reconcileMentions([inserted.mention], inserted.text, 'Hi @Alic, welcome', 8))), [], 'editing a mention label clears its identity binding');

const visible = 'Hi @Alice, welcome';
const wire = mentions.toWireText(visible, [inserted.mention], key => `npub1${key}`);
assert.equal(wire, `Hi nostr:npub1${alice}, welcome`);
assert.equal(mentions.toWireText('literal @Alice', [], () => assert.fail('unselected text must not become a profile reference')), 'literal @Alice');
assert.throws(() => mentions.toWireText('Hi @Alic, welcome', [inserted.mention], key => `npub1${key}`), /changed in the draft/);
const decoded = mentions.fromWireContent(wire, [alice, bob], code => ({ type: 'npub', data: code.slice(5) }), key => key === alice ? 'Alice' : '');
assert.deepEqual(JSON.parse(JSON.stringify(decoded)), { text: visible, mentions: [{ pubkey: alice, label: 'Alice', start: 3 }] });
const outsideGroup = mentions.fromWireContent(`Hi nostr:npub1${carol}`, [alice, bob], code => ({ type: 'npub', data: code.slice(5) }), () => 'Carol');
assert.equal(outsideGroup.text, `Hi nostr:npub1${carol}`, 'a profile outside the group is left as the original NIP-27 reference');
assert.throws(() => mentions.toWireText('x'.repeat(5001), [], () => ''), /exceeds 5000/);

console.log('PASS: group mention autocomplete logic, stable identity bindings, and NIP-27 wire round trips');
