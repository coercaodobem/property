import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/relay-defaults.js'), 'utf8');
const window = {};
const context = { window, Uint32Array, Math, RangeError, globalThis: { crypto: { getRandomValues: values => { values[0] = 0; return values; } } } };
vm.runInNewContext(source, context);
const defaults = window.PropertyRelayDefaults;

assert.equal(defaults.candidates.length, 6);
assert.equal(new Set(defaults.candidates).size, defaults.candidates.length, 'bundled relay candidates are unique');
assert.ok(defaults.candidates.every(url => url.startsWith('wss://')), 'default relays use secure WebSockets');
const draws = [5, 0];
const selected = [...defaults.pick(2, max => draws.shift() % max)];
assert.deepEqual(selected, [defaults.candidates[5], defaults.candidates[0]]);
assert.equal(new Set(selected).size, 2, 'random selection does not repeat a relay');
assert.equal(defaults.pick(1, () => 0).length, 1);
assert.throws(() => defaults.pick(0, () => 0), RangeError);
assert.throws(() => defaults.pick(7, () => 0), RangeError);
assert.throws(() => defaults.pick(1, () => 6), RangeError, 'random index must fit the current pool');

console.log('PASS: bundled relay recommendations choose a unique random subset and validate bounds');
