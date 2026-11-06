import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { console };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/message-forwards.js', import.meta.url), 'utf8'), context, { timeout: 5000 });

const forwards = context.PropertyMessageForwards;
assert.equal(forwards.fromTags([['p', 'a'.repeat(64)], ['forwarded', '1']]), 1);
assert.equal(forwards.fromTags([['forwarded', '255']]), 255);
assert.equal(forwards.fromTags([]), null);
for (const tags of [
  [['forwarded', '0']], [['forwarded', '-1']], [['forwarded', '01']], [['forwarded', '256']],
  [['forwarded', '1.5']], [['forwarded', '1', 'unexpected']], [['forwarded', '1'], ['forwarded', '2']]
]) assert.equal(forwards.fromTags(tags), null, 'malformed or ambiguous hop tags stay unlabelled');

assert.deepEqual(Array.from(forwards.toTag(1)), ['forwarded', '1']);
assert.equal(forwards.next(undefined), 1);
assert.equal(forwards.next(1), 2);
assert.equal(forwards.next(254), 255);
assert.equal(forwards.next(255), 255, 'hop count remains bounded');
assert.throws(() => forwards.toTag(0), error => error?.name === 'RangeError');
assert.throws(() => forwards.toTag(256), error => error?.name === 'RangeError');

assert.equal(forwards.label(1), 'Forwarded');
assert.equal(forwards.label(4), 'Forwarded');
assert.equal(forwards.label(5), 'Forwarded many times');
assert.equal(forwards.label(5, 'pt-BR'), 'Encaminhada várias vezes');
assert.equal(forwards.label(1, 'pt-BR'), 'Encaminhada');
assert.equal(forwards.label(null), '');

console.log('PASS: encrypted-message forward markers have bounded hop counts, reject ambiguous tags, and localize without attributing the original author');
