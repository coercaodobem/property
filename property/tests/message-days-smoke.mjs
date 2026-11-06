import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/message-days.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Date, Number, Intl, String, Object });
const days = window.PropertyMessageDays;
const now = new Date(2026, 10, 5, 12, 0, 0).getTime();
const today = new Date(2026, 10, 5, 8, 0, 0).getTime();
const yesterday = new Date(2026, 10, 4, 18, 0, 0).getTime();
const priorYear = new Date(2025, 10, 5, 10, 0, 0).getTime();

assert.equal(days.dayStart(today), new Date(2026, 10, 5, 0, 0, 0).getTime());
assert.equal(days.dayLabel(today, now, 'en'), 'Today');
assert.equal(days.dayLabel(yesterday, now, 'en'), 'Yesterday');
assert.equal(days.dayLabel(today, now, 'pt-BR'), 'Hoje');
assert.equal(days.dayLabel(yesterday, now, 'pt-BR'), 'Ontem');
assert.match(days.dayLabel(priorYear, now, 'en'), /2025/);
assert.match(days.dayLabel(priorYear, now, 'pt-BR'), /2025/);
assert.equal(days.dateTime(today), '2026-11-05');
const next = new Date(days.nextDayStart(today));
assert.equal(next.getFullYear(), 2026);
assert.equal(next.getMonth(), 10);
assert.equal(next.getDate(), 6);
assert.equal(next.getHours(), 0);
assert.ok(Number.isNaN(days.dayStart(NaN)));
assert.equal(days.dayLabel(NaN, now, 'en'), '');
assert.equal(days.dayLabel(today, NaN, 'en'), '');
assert.equal(days.dateTime(NaN), '');

console.log('PASS: message day separators format Today/Yesterday, localized dates and year boundaries without changing message timestamps');
