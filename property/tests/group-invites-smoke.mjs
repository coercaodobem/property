import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams };
context.window = context;
vm.createContext(context);
const nostrTools = await readFile(join(root, 'web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8');
const inviteSource = await readFile(join(root, 'web/group-invites.js'), 'utf8');
vm.runInContext(nostrTools, context, { filename: 'nostr-tools-2.25.2.bundle.js' });
vm.runInContext(inviteSource, context, { filename: 'group-invites.js' });

const N = context.NostrTools;
const Invites = context.PropertyGroupInvites;
const secret = value => new Uint8Array(32).fill(value);
const senderSecret = secret(11);
const memberTwoSecret = secret(12);
const memberThreeSecret = secret(13);
const inviteeSecret = secret(14);
const outsiderSecret = secret(15);
const sender = N.getPublicKey(senderSecret);
const memberTwo = N.getPublicKey(memberTwoSecret);
const memberThree = N.getPublicKey(memberThreeSecret);
const invitee = N.getPublicKey(inviteeSecret);
const outsider = N.getPublicKey(outsiderSecret);
const oldMembers = [sender, memberTwo, memberThree].sort();
const encryptFor = (secretKey, recipient, plaintext) => N.nip44.v2.encrypt(plaintext, N.nip44.v2.utils.getConversationKey(secretKey, recipient));
const decryptFrom = (secretKey, senderKey, ciphertext) => N.nip44.v2.decrypt(ciphertext, N.nip44.v2.utils.getConversationKey(secretKey, senderKey));
const invite = Invites.createInvitation({
  baseUrl: 'https://property.example/app?utm_source=private#old=route',
  senderPubkey: sender,
  inviteePubkey: invitee,
  members: oldMembers,
  title: 'Friends room',
  createdAt: 1_800_000_000,
  sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext),
  verify: event => N.verifyEvent(event)
});

const link = new URL(invite.url);
const packed = new URLSearchParams(link.hash.slice(1)).get('groupInvite');
assert.equal(link.pathname, '/app');
assert.equal(link.search, '', 'invite links do not carry page query parameters');
assert.equal([...new URLSearchParams(link.hash.slice(1)).keys()].join(','), 'groupInvite', 'the encrypted invitation stays in the URL fragment');
assert.ok(packed.startsWith(`${sender}.`), 'only the inviter public key is visible outside the ciphertext');
assert.ok(!invite.url.includes('Friends%20room') && !invite.url.includes(invitee) && !invite.url.includes(memberTwo), 'group title, invitee, and members stay encrypted');
assert.equal(invite.members.length, 4, 'the invite adds exactly one participant to a new room');

const opened = Invites.openInvitation(packed, {
  recipientPubkey: invitee,
  decrypt: (senderKey, ciphertext) => decryptFrom(inviteeSecret, senderKey, ciphertext),
  verify: event => N.verifyEvent(event)
});
assert.deepEqual(JSON.parse(JSON.stringify(opened.members)), [...oldMembers, invitee].sort());
assert.equal(opened.title, 'Friends room');
assert.equal(opened.senderPubkey, sender);
assert.equal(opened.recipientPubkey, invitee);
assert.equal(opened.eventId.length, 64);

assert.throws(() => Invites.openInvitation(packed, {
  recipientPubkey: outsider,
  decrypt: (senderKey, ciphertext) => decryptFrom(outsiderSecret, senderKey, ciphertext),
  verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'only the intended local identity can decrypt and accept');

const tamperedCipher = `${packed.slice(0, -1)}${packed.endsWith('A') ? 'B' : 'A'}`;
assert.throws(() => Invites.openInvitation(tamperedCipher, {
  recipientPubkey: invitee,
  decrypt: (senderKey, ciphertext) => decryptFrom(inviteeSecret, senderKey, ciphertext),
  verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'ciphertext alteration is rejected');

const [senderKey, ciphertext] = packed.split('.');
const recipientConversationKey = N.nip44.v2.utils.getConversationKey(inviteeSecret, senderKey);
const alteredEvent = JSON.parse(N.nip44.v2.decrypt(ciphertext, recipientConversationKey));
alteredEvent.content = alteredEvent.content.replace('Friends room', 'Forged room');
const forged = N.nip44.v2.encrypt(JSON.stringify(alteredEvent), recipientConversationKey);
assert.throws(() => Invites.openInvitation(`${senderKey}.${forged}`, {
  recipientPubkey: invitee,
  decrypt: (from, body) => decryptFrom(inviteeSecret, from, body),
  verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'a re-encrypted but unsigned content change is rejected');

assert.throws(() => Invites.createInvitation({
  baseUrl: 'https://property.example/', senderPubkey: sender, inviteePubkey: invitee,
  members: [sender, memberTwo, memberTwo], title: 'Friends room', sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext), verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'duplicate group participants are rejected');
assert.throws(() => Invites.createInvitation({
  baseUrl: 'https://property.example/', senderPubkey: sender, inviteePubkey: invitee,
  members: [sender, memberTwo], title: 'Friends room', sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext), verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'an invitation cannot create a group below the protocol participant minimum');
assert.throws(() => Invites.createInvitation({
  baseUrl: 'https://property.example/', senderPubkey: sender, inviteePubkey: invitee,
  members: [...oldMembers, invitee], title: 'Friends room', sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext), verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'a current member cannot receive a duplicate invite');
assert.throws(() => Invites.createInvitation({
  baseUrl: 'http://property.example/', senderPubkey: sender, inviteePubkey: invitee,
  members: oldMembers, title: 'Friends room', sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext), verify: event => N.verifyEvent(event)
}), /Invalid group invitation/, 'non-local insecure HTTP link origins are rejected');

const fullRoomMembers = [sender, memberTwoSecret, memberThreeSecret, secret(16), secret(17), secret(18), secret(19), secret(20), secret(21)]
  .map(value => value instanceof Uint8Array ? N.getPublicKey(value) : value);
assert.doesNotThrow(() => Invites.createInvitation({
  baseUrl: 'https://property.example/app', senderPubkey: sender, inviteePubkey: invitee,
  members: fullRoomMembers, title: 'Room of ten', createdAt: 1_800_000_000,
  sign: template => N.finalizeEvent(template, senderSecret),
  encrypt: (recipient, plaintext) => encryptFor(senderSecret, recipient, plaintext), verify: event => N.verifyEvent(event)
}), 'the ten-participant boundary is accepted');

console.log('PASS: local NIP-44 group invite round-trip, recipient binding, signature verification, fragment privacy, strict membership and size checks');
