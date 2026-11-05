import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(await readFile(join(root, 'web/vendor/emoji-data-15.json'), 'utf8'));
const source = await readFile(join(root, 'web/emoji-picker.js'), 'utf8');
const license = await readFile(join(root, 'web/vendor/licenses/emoji-mart-data-MIT.txt'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, document: {}, fetch: async () => ({ ok: true, json: async () => raw }) });
const picker = window.PropertyEmojiPicker;

assert.match(license, /MIT License/);
assert.ok(raw.categories.length >= 8, 'the bundled reference dataset includes the full category set');
assert.ok(Object.keys(raw.emojis).length >= 1800, 'the bundled reference dataset includes the full emoji catalog');

const catalog = picker.catalogFrom(raw);
assert.deepEqual(Array.from(catalog.categories, category => category.id), ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags']);
assert.ok(catalog.all.length >= 1800);
assert.ok(picker.searchEmoji(catalog, 'smile').some(emoji => emoji.id === 'smiley'));
assert.ok(picker.searchEmoji(catalog, 'coração', 'pt-BR').some(emoji => emoji.id === 'heart'));
assert.equal(await picker.supportsEmoji('🪿'), true, 'custom reactions are limited to the bundled Unicode catalog');
assert.equal(await picker.supportsEmoji('not-an-emoji'), false, 'unsupported reaction payloads are rejected');
assert.equal(picker.withSkin(catalog.all.find(emoji => emoji.id === 'wave'), 1), '👋🏻');
assert.deepEqual({ ...picker.insertAtSelection('abcd', 0, 0, '🙂') }, { value: '🙂abcd', selectionStart: 2, selectionEnd: 2 });
assert.deepEqual({ ...picker.insertAtSelection('abcd', 2, 2, '🙂') }, { value: 'ab🙂cd', selectionStart: 4, selectionEnd: 4 });
assert.deepEqual({ ...picker.insertAtSelection('abcd', 4, 4, '🙂') }, { value: 'abcd🙂', selectionStart: 6, selectionEnd: 6 });
assert.equal(picker.insertAtSelection('abcd', 1, 3, '🙂').value, 'a🙂d', 'an emoji replaces the selected draft text');
assert.equal(picker.insertAtSelection('1234', 4, 4, '🙂', 5), null, 'the picker cannot exceed the composer limit');

const legacyDevice = picker.catalogFrom(raw, { maxVersion: 14, flagsSupported: false });
assert.ok(legacyDevice.all.every(emoji => emoji.version <= 14));
const legacyFlags = legacyDevice.categories.find(category => category.id === 'flags');
assert.ok(!legacyFlags?.emojis.some(emoji => /[\u{1F1E6}-\u{1F1FF}]/u.test(emoji.skins[0])));

console.log('PASS: local Ghostly emoji catalog, Portuguese search, skin tone, and older-device filtering');
