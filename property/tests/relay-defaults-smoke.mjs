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

const initialDraws = [4, 1];
const freshInstall = defaults.initialSelection(null, max => initialDraws.shift() % max);
assert.deepEqual([...freshInstall.values], [defaults.candidates[4], defaults.candidates[1]]);
assert.equal(new Set(freshInstall.values).size, 2, 'fresh install gets two unique suggested relays');
assert.equal(freshInstall.autoSelected, true, 'fresh install does not require a manual relay choice');
assert.equal(freshInstall.shouldPersist, true, 'suggested relays are persisted for the next launch');

const savedChoice = [defaults.candidates[2]];
const existingSettings = defaults.initialSelection({ values: savedChoice, autoSelected: false }, () => assert.fail('saved relays must not be replaced'));
assert.deepEqual([...existingSettings.values], savedChoice, 'an existing user relay choice is preserved');
assert.equal(existingSettings.autoSelected, false);
assert.equal(existingSettings.shouldPersist, false);

const emptySettings = defaults.initialSelection({ values: [], autoSelected: false }, max => 0);
assert.equal(emptySettings.values.length, 2, 'empty relay settings recover to the suggested pair');
assert.equal(emptySettings.autoSelected, true);
assert.equal(emptySettings.shouldPersist, true);

console.log('PASS: fresh installs get two persisted relay suggestions without a manual setup barrier');
