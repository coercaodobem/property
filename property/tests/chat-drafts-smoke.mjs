import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/chat-drafts.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window }, { filename: 'chat-drafts.js' });
const drafts = window.PropertyChatDrafts;
const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);
const carol = 'c'.repeat(64);

const record = drafts.createRecord(alice, bob, 'unfinished message');
assert.equal(drafts.readRecord(record, alice, bob), 'unfinished message');
assert.equal(drafts.readRecord(record, alice.toUpperCase(), bob.toUpperCase()), 'unfinished message', 'public keys normalize case');
assert.equal(drafts.readRecord(record, carol, bob), '', 'drafts are isolated by local identity');
assert.equal(drafts.readRecord(record, alice, carol), '', 'drafts are isolated by conversation');
assert.equal(drafts.readRecord({ ...record, owner: carol }, alice, bob), '', 'tampered owner metadata is rejected');
assert.equal(drafts.createRecord(alice, bob, ''), null, 'an empty draft removes its local record');
assert.throws(() => drafts.createRecord('nsec1secret', bob, 'secret'), /Invalid local chat-draft identity/, 'private keys cannot be used as draft namespaces');
assert.throws(() => drafts.createRecord(alice, 'not-a-conversation', 'text'), /Invalid local chat-draft identity/);
assert.throws(() => drafts.createRecord(alice, bob, null), /Chat draft must be text/);

const group = `group:${alice}:${bob}:${carol}`;
const groupRecord = drafts.createRecord(alice, group, 'group draft');
assert.equal(drafts.readRecord(groupRecord, alice, group), 'group draft');
assert.notEqual(record.id, groupRecord.id);

const bounded = drafts.createRecord(alice, bob, 'x'.repeat(drafts.MAX_DRAFT_CHARS + 1));
assert.equal(bounded.text.length, drafts.MAX_DRAFT_CHARS, 'draft records stay within the composer character limit');
const emojiAtBoundary = drafts.createRecord(alice, bob, `${'x'.repeat(drafts.MAX_DRAFT_CHARS - 1)}😀`);
assert.equal(emojiAtBoundary.text, 'x'.repeat(drafts.MAX_DRAFT_CHARS - 1), 'truncation never splits a surrogate pair');

console.log('PASS: local drafts restore per identity and chat, reject mismatched records, isolate groups, and preserve Unicode bounds');
