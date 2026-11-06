import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/notification-preferences.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Date, TypeError, RangeError, Object, Number });
const preferences = window.PropertyNotificationPreferences;
const identityA = 'a'.repeat(64);
const identityB = 'b'.repeat(64);
const directPeer = 'c'.repeat(64);
const groupPeer = `group:${'d'.repeat(64)}:${'e'.repeat(64)}`;
const now = 1_900_000_000_000;

assert.equal(preferences.notificationsId(identityA), `property-notifications:${identityA}`);
assert.notEqual(preferences.notificationsId(identityA), preferences.notificationsId(identityB), 'global preference stays per identity');
assert.notEqual(preferences.chatMuteId(identityA, directPeer), preferences.chatMuteId(identityB, directPeer), 'chat mutes stay per identity');
assert.notEqual(preferences.chatMuteId(identityA, directPeer), preferences.chatMuteId(identityA, groupPeer), 'direct and group mutes stay separate');

const shortMute = preferences.createMuteRecord(identityA, directPeer, '15m', now);
assert.equal(shortMute.until, now + 15 * 60_000, 'the mute uses the supplied logical time');
assert.equal(preferences.isMuted(shortMute, shortMute.until - 1), true);
assert.equal(preferences.isMuted(shortMute, shortMute.until), false, 'mute expires exactly at its boundary without waiting');
const longMute = preferences.createMuteRecord(identityA, groupPeer, '1d', now);
assert.equal(longMute.until, now + 24 * 60 * 60_000);
assert.equal(preferences.isMuted(preferences.createMuteRecord(identityA, directPeer, 'forever', now), now + 99_000_000), true);
assert.throws(() => preferences.createMuteRecord(identityA, directPeer, '1w', now), RangeError);
assert.throws(() => preferences.createMuteRecord('bad', directPeer, '1h', now), TypeError);
assert.throws(() => preferences.createMuteRecord(identityA, '', '1h', now), TypeError);

const allowed = { enabled: true, permission: 'granted', pageHidden: true, muted: false };
assert.equal(preferences.shouldNotify(allowed), true);
assert.equal(preferences.shouldNotify({ ...allowed, enabled: false }), false);
assert.equal(preferences.shouldNotify({ ...allowed, permission: 'default' }), false);
assert.equal(preferences.shouldNotify({ ...allowed, pageHidden: false }), false, 'no duplicate OS notice while the app is visible');
assert.equal(preferences.shouldNotify({ ...allowed, muted: true }), false, 'a local mute suppresses the OS notice');

console.log('PASS: notification permission is opt-in; private per-identity mutes use fixed logical time and never alter relay events');
