import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/app-badge.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, TypeError, Number, Math, Object });
const badge = window.PropertyAppBadge;
const identityA = 'a'.repeat(64);
const identityB = 'b'.repeat(64);

assert.equal(badge.preferenceId(identityA), `property-app-badge:${identityA}`);
assert.notEqual(badge.preferenceId(identityA), badge.preferenceId(identityB), 'badge preferences are scoped to each identity');
assert.throws(() => badge.preferenceId('bad'), TypeError);
assert.equal(badge.normalizeCount(3), 3);
assert.equal(badge.normalizeCount(99999), 9999, 'badge counts are bounded');
assert.equal(badge.normalizeCount(-1), 0);
assert.equal(badge.normalizeCount(1.5), 0);
assert.equal(badge.unreadCount([
  { unreadCount: 2 }, { unreadCount: 3 }, { unreadCount: -2 }, { unreadCount: '4' }
]), 5, 'only valid local unread counts are aggregated');
assert.equal(badge.unreadCount([{ unreadCount: 9000 }, { unreadCount: 5000 }]), 9999);
assert.equal(badge.canBadge({ setAppBadge() {} }), true);
assert.equal(badge.canBadge({}), false);

const calls = [];
const api = {
  async setAppBadge(count) { calls.push(['set', count]); },
  async clearAppBadge() { calls.push(['clear']); }
};
assert.equal(await badge.apply(5, api), true);
assert.equal(await badge.apply(0, api), true);
assert.deepEqual(calls, [['set', 5], ['clear']]);
assert.equal(await badge.apply(0, { async setAppBadge(count) { calls.push(['set-zero', count]); } }), true,
  'zero falls back to setAppBadge(0) where clearAppBadge is unavailable');
assert.deepEqual(calls.at(-1), ['set-zero', 0]);
assert.equal(await badge.apply(1, {}), false, 'unsupported browsers are a no-op');
assert.equal(await badge.apply(1, { async setAppBadge() { throw new Error('unavailable'); } }), false,
  'browser API failures never break the app');

console.log('PASS: app icon badge is optional, identity-local, bounded, derived from local unread counts, and fails closed without relay events');
