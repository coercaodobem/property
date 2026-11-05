import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/conversation-folders.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Object, Array, Set, String, RegExp, Error });
const folders = window.PropertyConversationFolders;
const alice = 'a'.repeat(64), bob = 'b'.repeat(64), carol = 'c'.repeat(64);
const group = `group:${[alice, bob, carol].sort().join(':')}`;

assert.deepEqual(JSON.parse(JSON.stringify(folders.normalize(null))), { version: 1, folders: [], assignments: {} });
let config = folders.create(null, '  Personal   ', 'folder-personal');
assert.equal(config.folders[0].name, 'Personal', 'folder names are trimmed and internal spacing is normalized');
assert.throws(() => folders.create(config, 'personal', 'folder-duplicate'), /folder-name-duplicate/, 'folder names are case-insensitively unique');
assert.throws(() => folders.create(config, ' ', 'folder-empty'), /folder-name-required/);
assert.throws(() => folders.create(config, 'x'.repeat(41), 'folder-long'), /folder-name-too-long/);

config = folders.create(config, 'Work', 'folder-work');
config = folders.move(config, alice, 'folder-personal');
config = folders.move(config, group, 'folder-work');
assert.equal(config.assignments[alice], 'folder-personal');
assert.equal(config.assignments[group], 'folder-work', 'a private group can be assigned to a folder');
assert.throws(() => folders.move(config, 'not-a-conversation-id', 'folder-work'), /conversation-id-invalid/);
assert.throws(() => folders.move(config, bob, 'missing-folder'), /folder-not-found/);

config = folders.setCollapsed(config, 'folder-personal', true);
assert.equal(config.folders[0].collapsed, true, 'collapsed state is part of local persisted settings');
config = folders.reorder(config, 'folder-work', -1);
assert.equal(config.folders[0].id, 'folder-work', 'folder ordering is stable and user-controlled');
assert.equal(folders.reorder(config, 'folder-work', -1).folders[0].id, 'folder-work', 'moving the first folder farther up is a no-op');

const rows = [{ pubkey: alice }, { pubkey: bob }, { pubkey: group }, { pubkey: carol }];
const sections = folders.sections(rows, config);
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(sections.map(section => section.id)), ['folder-work', 'folder-personal', 'other-conversations']);
assert.deepEqual(plain(sections[0].conversations.map(row => row.pubkey)), [group]);
assert.deepEqual(plain(sections[1].conversations.map(row => row.pubkey)), [alice]);
assert.deepEqual(plain(sections[2].conversations.map(row => row.pubkey)), [bob, carol]);
assert.equal(folders.sections(rows.slice(0, 1), config, 'person').length, 1, 'search returns a flat result list instead of nesting results by folder');
assert.equal(folders.sections([], config).length, 2, 'empty folder definitions remain available for management');

config = folders.remove(config, 'folder-work');
assert.equal(config.assignments[group], undefined, 'deleting a folder returns its conversations to Other chats without deleting them');
assert.deepEqual(plain(folders.sections(rows, config)[1].conversations.map(row => row.pubkey)), [bob, group, carol]);

const malformed = folders.normalize({
  folders: [{ id: 'ok', name: 'Safe', collapsed: true }, { id: 'bad', name: 'safe' }, { id: 'invalid id', name: 'Bad' }, { id: 'x', name: 'x'.repeat(41) }],
  assignments: { [alice]: 'ok', [bob]: 'missing', 'not-a-conversation-id': 'ok', [group]: 'ok' }
});
assert.equal(malformed.folders.length, 1, 'invalid IDs, duplicate names, and invalid names are discarded');
assert.deepEqual(Object.keys(malformed.assignments).sort(), [alice, group].sort(), 'only valid conversation keys and existing folder IDs survive normalization');
assert.equal(malformed.folders[0].collapsed, true);

let limited = folders.normalize(null);
for (let index = 0; index < folders.MAX_FOLDERS; index++) limited = folders.create(limited, `Folder ${index}`, `f-${index}`);
assert.equal(limited.folders.length, 24);
assert.throws(() => folders.create(limited, 'One more', 'f-extra'), /folder-limit-reached/);

console.log('PASS: local conversation folders validate names, organize chats and groups, persist collapse/order, flatten search, and never delete conversations');
