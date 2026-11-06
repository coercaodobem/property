import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const bundle = await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../web/community-groups.js', import.meta.url), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(source, context, { timeout: 5000 });

const N = context.NostrTools;
const Groups = context.PropertyCommunityGroups;
const keys = [21, 22, 23].map(value => new Uint8Array(32).fill(value));
const pubs = keys.map(key => N.getPublicKey(key));
const groupId = 'project-hall';
const relayA = 'wss://relay-a.example';
const relayB = 'wss://relay-b.example';
const relayKeys = new Map([[relayA, keys[1]], [relayB, keys[2]]]);
const sign = (template, secret) => {
  context.__signTemplate = JSON.stringify(template);
  context.__signSecret = [...secret];
  return JSON.parse(vm.runInContext('JSON.stringify(NostrTools.finalizeEvent(JSON.parse(__signTemplate), Uint8Array.from(__signSecret)))', context, { timeout: 5000 }));
};
const makeEvent = (kind, secret, tags, content = '', createdAt = 100) => sign({ kind, content, tags, created_at: createdAt }, secret);
const verify = event => {
  context.__verifyEvent = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(__verifyEvent))', context, { timeout: 5000 });
};
const metadata = (relay, name, createdAt = 100, flags = []) => ({
  relayUrl: relay,
  selfPubkey: N.getPublicKey(relayKeys.get(relay)),
  events: [makeEvent(39000, relayKeys.get(relay), [['d', groupId], ['name', name], ['about', `${name} description`], ...flags], '', createdAt)]
});

assert.equal(Groups.groupKey(relayA, groupId), `${relayA}\u0000${groupId}`);
assert.throws(() => Groups.groupKey(relayA, ''), /Invalid NIP-29 group origin/);
assert.equal(Groups.parseRelaySelfDocument(JSON.stringify({ self: pubs[1].toUpperCase() })), pubs[1]);
assert.equal(Groups.parseRelaySelfDocument('{"self":"wrong"}'), null);
assert.equal(Groups.parseRelaySelfDocument('not-json'), null);
const reference = Groups.parseGroupReference('naddr1example?invite=blue%20bird', value => ({
  type: 'naddr', data: { kind: 39000, identifier: groupId, pubkey: pubs[1], relays: [relayA, relayA, 'https://bad.example'] }
}), value => {
  if (!value.startsWith('wss://')) throw new TypeError('bad relay');
  return value;
});
assert.deepEqual(JSON.parse(JSON.stringify(reference)), { groupId, relayPubkey: pubs[1], relays: [relayA], inviteCode: 'blue bird' });
assert.equal(Groups.parseGroupReference('naddr1example?unexpected=1', () => ({}), value => value), null);
const referenceWithoutRelayHint = Groups.parseGroupReference('naddr1withoutrelay', () => ({
  type: 'naddr', data: { kind: 39000, identifier: groupId, pubkey: pubs[1], relays: [] }
}), value => value);
assert.deepEqual(JSON.parse(JSON.stringify(referenceWithoutRelayHint.relays)), [], 'a link without relay hints can use an already selected relay in the app');

const groupA = Groups.parseMetadata(metadata(relayA, 'Original', 100).events[0], relayA, verify);
assert.equal(groupA.name, 'Original');
assert.equal(groupA.private, false);
assert.equal(groupA.supportedKinds, null, 'an absent supported_kinds tag means the relay does not restrict kinds');
const audioOnly = Groups.parseMetadata(metadata(relayA, 'Audio room', 100, [['supported_kinds']]).events[0], relayA, verify);
assert.deepEqual(JSON.parse(JSON.stringify(audioOnly.supportedKinds)), [], 'an explicitly empty supported_kinds tag allows no text posts');
assert.equal(Groups.parseMetadata(metadata(relayA, 'Private', 100, [['private']]).events[0], relayA, verify).private, true);
assert.equal(Groups.parseMetadata(metadata(relayA, 'Hidden', 100, [['hidden']]).events[0], relayA, verify).hidden, true);
assert.equal(Groups.parseMetadata({ ...metadata(relayA, 'Forged').events[0], content: 'tampered' }, relayA, verify), null);
assert.equal(Groups.parseMetadata(makeEvent(39000, relayKeys.get(relayA), [['d', groupId], ['d', 'duplicate']], '', 105), relayA, verify), null);
assert.equal(Groups.parseMetadata(makeEvent(39000, relayKeys.get(relayA), [['d', groupId]], '', -1), relayA, verify), null);

const wrongRelaySigner = makeEvent(39000, keys[2], [['d', 'spoofed-group'], ['name', 'Spoof']], '', 105);
const discovered = Groups.discoverableGroups([
  metadata(relayA, 'Old name', 100),
  metadata(relayA, 'New name', 101),
  metadata(relayB, 'Forked name', 102),
  metadata(relayA, 'Private', 103, [['private']]),
  metadata(relayB, 'Hidden', 104, [['hidden']]),
  { relayUrl: relayA, selfPubkey: N.getPublicKey(keys[1]), events: [wrongRelaySigner] }
], (event, relaySelf) => verify(event) && event.pubkey === relaySelf);
assert.equal(discovered.length, 2, 'private and hidden groups do not appear in public discovery');
assert.equal(discovered.find(group => group.relayUrl === relayA).name, 'New name', 'same-relay metadata updates converge to the newest event');
const parallel = Groups.markParallelOrigins(discovered);
assert.deepEqual(JSON.parse(JSON.stringify(parallel.map(group => group.parallelOrigin))), [true, true], 'same id on disconnected relays remains two explicit relay-scoped origins');
assert.equal(Groups.markParallelOrigins([groupA])[0].parallelOrigin, false);

const conflictingA = makeEvent(9000, relayKeys.get(relayA), [['h', groupId], ['p', pubs[0]]], '', 150);
const conflictingB = makeEvent(9001, relayKeys.get(relayB), [['h', groupId], ['p', pubs[0]]], '', 151);
const adminsA = new Set([N.getPublicKey(relayKeys.get(relayA))]);
const adminsB = new Set([N.getPublicKey(relayKeys.get(relayB))]);
assert.equal(Groups.membership([conflictingA], groupId, pubs[0], verify, adminsA), 'member');
assert.equal(Groups.membership([conflictingB], groupId, pubs[0], verify, adminsB), 'not-member', 'conflicting membership remains scoped to each relay after a split');

const unsignedJoin = Groups.createJoinRequest({ pubkey: pubs[0], groupId, reason: 'I would like to join.', inviteCode: 'invite-7', createdAt: 200 });
const join = sign({ kind: unsignedJoin.kind, content: unsignedJoin.content, tags: unsignedJoin.tags, created_at: unsignedJoin.created_at }, keys[0]);
assert.equal(join.kind, 9021);
assert.equal(verify(join), true);
assert.deepEqual(JSON.parse(JSON.stringify(join.tags)), [['h', groupId], ['code', 'invite-7']]);
assert.equal(Groups.hasPendingJoin([join], groupId, pubs[0], verify), true, 'relay acknowledgment alone is not treated as membership');

const accepted = makeEvent(9000, keys[1], [['h', groupId], ['p', pubs[0]]], '', 201);
const rejected = makeEvent(9001, keys[1], [['h', groupId], ['p', pubs[0]]], '', 201);
const forgedMembership = makeEvent(9000, keys[2], [['h', groupId], ['p', pubs[0]]], '', 203);
const unsignedLeave = Groups.createLeaveRequest({ pubkey: pubs[0], groupId, createdAt: 202 });
const left = sign({ kind: unsignedLeave.kind, content: unsignedLeave.content, tags: unsignedLeave.tags, created_at: unsignedLeave.created_at }, keys[0]);
assert.equal(Groups.membership([join, accepted], groupId, pubs[0], verify), 'member');
assert.equal(Groups.membership([accepted], groupId, pubs[0], verify, new Set([pubs[1]])), 'member');
assert.equal(Groups.membership([forgedMembership], groupId, pubs[0], verify, new Set([pubs[1]])), 'not-member', 'restricted access is based only on relay/admin membership events');
assert.equal(Groups.membership([accepted, rejected], groupId, pubs[0], verify), 'not-member');
assert.equal(Groups.hasPendingJoin([join, accepted], groupId, pubs[0], verify), false);
assert.equal(Groups.hasPendingJoin([join, rejected], groupId, pubs[0], verify), false, 'a later relay membership decision resolves a pending request');
assert.equal(Groups.hasPendingJoin([join, left], groupId, pubs[0], verify), false, 'a later leave request clears an older pending request');
assert.equal(Groups.hasPendingLeave([accepted, left], groupId, pubs[0], verify), true, 'leave requests remain pending until the relay removes membership');
assert.equal(Groups.membership([rejected, accepted], groupId, pubs[0], verify), Groups.membership([accepted, rejected], groupId, pubs[0], verify), 'membership is independent of relay arrival order');

assert.throws(() => Groups.createJoinRequest({ pubkey: 'bad', groupId }), /Invalid NIP-29 join request/);
assert.throws(() => Groups.createLeaveRequest({ pubkey: pubs[0], groupId: 'x'.repeat(129) }), /Invalid NIP-29 leave request/);
const post = Groups.createPublicPost({
  pubkey: pubs[0], groupId, content: 'Hello group', previousIds: ['ab'.repeat(32), 'cd'.repeat(32), 'ef'.repeat(32), '12'.repeat(32)],
  createdAt: 300, membershipStatus: 'not-member', restricted: false
});
const signedPost = sign({ kind: post.kind, content: post.content, tags: post.tags, created_at: post.created_at }, keys[0]);
assert.equal(verify(signedPost), true);
assert.equal(signedPost.kind, 1);
assert.equal(signedPost.content, 'Hello group');
assert.deepEqual(JSON.parse(JSON.stringify(signedPost.tags)), [['h', groupId], ['previous', 'abababab', 'cdcdcdcd', 'efefefef']]);
assert.throws(() => Groups.createPublicPost({ pubkey: pubs[0], groupId, content: 'No membership', restricted: true, membershipStatus: 'pending' }), /Membership is not confirmed/);

console.log('PASS: NIP-29 public discovery, relay-scoped forks, pending membership, and group-local post references.');
