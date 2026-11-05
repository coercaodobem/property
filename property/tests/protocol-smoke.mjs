import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const bundle = new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url);
const source = await readFile(bundle, 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { timeout: 5000 });
const nostr = context.NostrTools;
assert.ok(nostr?.nip17?.wrapManyEvents, 'local bundle must expose NIP-17');
vm.runInContext(await readFile(new URL('../web/routing.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const routing = context.PropertyNostrRouting;
function signEvent(template, secret) {
  context.eventTemplateJson = JSON.stringify(template);
  context.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(eventTemplateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}

const alice = nostr.generateSecretKey();
const bob = nostr.generateSecretKey();
const eve = nostr.generateSecretKey();
const carol = nostr.generateSecretKey();
const dave = nostr.generateSecretKey();
const alicePub = nostr.getPublicKey(alice);
const bobPub = nostr.getPublicKey(bob);
const carolPub = nostr.getPublicKey(carol);
const davePub = nostr.getPublicKey(dave);
const evePub = nostr.getPublicKey(eve);
const plaintext = `teste-property-${crypto.randomUUID()}`;
const wraps = nostr.nip17.wrapManyEvents(alice, [{ publicKey: bobPub }], plaintext);
assert.equal(wraps.length, 2, 'NIP-17 sends a sender copy and a recipient copy');
for (const wrap of wraps) {
  assert.equal(wrap.kind, 1059);
  assert.equal(nostr.verifyEvent(wrap), true, 'gift wrap signature verifies');
  assert.equal(wrap.content.includes(plaintext), false, 'plaintext must not appear in relay-visible content');
}
const recipientWrap = wraps.find(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === bobPub));
const senderWrap = wraps.find(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === alicePub));
assert.ok(recipientWrap && senderWrap);
const aliceInbox = ['wss://alice-inbox.example'];
const bobInbox = ['wss://bob-inbox.example'];
const routed = routing.planGiftWraps(wraps, alicePub, bobPub, aliceInbox, bobInbox, nostr.verifyEvent);
assert.equal(routed.ready, true, 'valid sender and recipient inbox metadata gives a complete route');
assert.equal([...routed.deliveries.find(item => item.recipient === alicePub).relays].join(','), aliceInbox.join(','));
assert.equal([...routed.deliveries.find(item => item.recipient === bobPub).relays].join(','), bobInbox.join(','));
assert.equal(routing.planGiftWraps(wraps, alicePub, bobPub, aliceInbox, [], nostr.verifyEvent).reason, 'missing-inbox');
const malformed = signEvent({ kind: 10050, pubkey: bobPub, tags: [['relay', 'https://not-websocket.example']], content: '', created_at: Math.floor(Date.now() / 1000) }, bob);
assert.equal([...routing.inboxRelays(malformed, nostr.verifyEvent, value => {
  const url = new URL(value);
  if (url.protocol !== 'wss:') throw new Error('wss required');
  return url.toString().replace(/\/$/, '');
})].join(','), '');
const listEvent = signEvent({ kind: 10050, pubkey: bobPub, tags: [['relay', 'wss://bob-inbox.example/'], ['relay', 'wss://second.example']], content: '', created_at: Math.floor(Date.now() / 1000) }, bob);
assert.equal([...routing.inboxRelays(listEvent, nostr.verifyEvent, value => new URL(value).toString().replace(/\/$/, ''))].join(','), 'wss://bob-inbox.example,wss://second.example');
const unwrapped = nostr.nip17.unwrapEvent(recipientWrap, bob);
assert.equal(unwrapped.kind, 14);
assert.equal(unwrapped.pubkey, alicePub);
assert.equal(unwrapped.content, plaintext);
assert.throws(() => nostr.nip17.unwrapEvent(recipientWrap, eve), 'a non-recipient must not decrypt the message');
assert.equal(nostr.nip17.unwrapEvent(senderWrap, alice).content, plaintext, 'sender can read their own copy');

const reactionTarget = signEvent({ kind: 1, pubkey: alicePub, tags: [], content: 'offline reaction target', created_at: Math.floor(Date.now() / 1000) }, alice);
const customReaction = '🪿';
const directReactionRumor = nostr.nip59.createRumor({
  kind: 7,
  tags: [['e', reactionTarget.id, '', alicePub], ['p', alicePub], ['k', '14']],
  content: customReaction,
}, alice);
const directReactionWraps = [alicePub, bobPub].map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(directReactionRumor, alice, recipient), recipient));
const directReactionPlan = routing.planGiftWraps(directReactionWraps, alicePub, bobPub, aliceInbox, bobInbox, nostr.verifyEvent);
assert.equal(directReactionPlan.ready, true, 'custom emoji reactions use the normal private NIP-17 recipient route');
for (const delivery of directReactionPlan.deliveries) {
  assert.equal(delivery.event.kind, 1059);
  assert.equal(delivery.event.content.includes(customReaction), false, 'relay-visible reaction envelope hides the emoji payload');
  const secretForRecipient = delivery.recipient === alicePub ? alice : bob;
  const reaction = nostr.nip17.unwrapEvent(delivery.event, secretForRecipient);
  assert.equal(reaction.kind, 7);
  assert.equal(reaction.content, customReaction);
  assert.equal(reaction.tags.find(tag => tag[0] === 'e')?.[1], reactionTarget.id);
}
assert.throws(() => nostr.nip17.unwrapEvent(directReactionWraps[0], eve), 'a non-recipient cannot read a custom emoji reaction');

const groupMembers = [alicePub, bobPub, carolPub, davePub].sort();
const groupSecrets = new Map([[alicePub, alice], [bobPub, bob], [carolPub, carol], [davePub, dave]]);
const groupText = 'offline-group-payload-4-members';
const groupRumor = nostr.nip59.createRumor({
  kind: 14,
  tags: groupMembers.filter(pubkey => pubkey !== alicePub).map(pubkey => ['p', pubkey]).concat([['subject', 'Offline group']]),
  content: groupText,
}, alice);
assert.equal([...routing.groupParticipants(groupRumor)].join(','), groupMembers.join(','), 'NIP-17 p tags and sender resolve to the same canonical participant set');
assert.equal(routing.groupConversationId(groupMembers), routing.groupConversationId([...groupMembers].reverse()), 'all members derive the same room key independent of input order');
assert.ok(routing.groupConversationId(Array.from({ length: 10 }, () => nostr.getPublicKey(nostr.generateSecretKey()))), 'room keys accept the maximum 10 participants');
assert.equal(routing.groupConversationId(Array.from({ length: 11 }, () => nostr.getPublicKey(nostr.generateSecretKey()))), '', 'room keys reject more than 10 members');
assert.equal(routing.groupConversationId([alicePub, alicePub, bobPub]), '', 'room keys reject duplicate participants');
const groupWraps = groupMembers.map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(groupRumor, alice, recipient), recipient));
const groupRelays = Object.fromEntries(groupMembers.map((pubkey, index) => [pubkey, [`wss://member-${index + 1}.example`]]));
const groupPlan = routing.planGroupGiftWraps(groupWraps, groupMembers, groupRelays, nostr.verifyEvent);
assert.equal(groupPlan.ready, true, 'each member has one valid encrypted envelope and an inbox route');
assert.equal(groupPlan.deliveries.length, 4, 'one wrap is routed to each of four group members, including the sender copy');
for (const delivery of groupPlan.deliveries) {
  assert.equal([...delivery.relays].join(','), groupRelays[delivery.recipient].join(','), 'each member envelope uses that member’s inbox relays');
  assert.equal(delivery.event.content.includes(groupText), false, 'group plaintext is not visible in relay envelopes');
  const rumor = nostr.nip17.unwrapEvent(delivery.event, groupSecrets.get(delivery.recipient));
  assert.equal(rumor.content, groupText, 'each listed group member can decrypt the same room message');
  assert.equal(rumor.tags.filter(tag => tag[0] === 'p').length, 3, 'the room participant set names the other three members');
}
assert.throws(() => nostr.nip17.unwrapEvent(groupWraps[0], eve), 'a person outside the room cannot decrypt a member envelope');

const groupReactionRumor = nostr.nip59.createRumor({
  kind: 7,
  tags: [['e', groupRumor.id, '', bobPub], ['k', '14'], ...groupMembers.filter(pubkey => pubkey !== alicePub).map(pubkey => ['p', pubkey])],
  content: customReaction,
}, alice);
const groupReactionWraps = groupMembers.map(recipient => nostr.nip59.createWrap(nostr.nip59.createSeal(groupReactionRumor, alice, recipient), recipient));
const groupReactionPlan = routing.planGroupGiftWraps(groupReactionWraps, groupMembers, groupRelays, nostr.verifyEvent);
assert.equal(groupReactionPlan.ready, true, 'custom emoji group reaction has one NIP-17 envelope per member');
for (const delivery of groupReactionPlan.deliveries) {
  const reaction = nostr.nip17.unwrapEvent(delivery.event, groupSecrets.get(delivery.recipient));
  assert.equal(reaction.kind, 7);
  assert.equal(reaction.content, customReaction);
  assert.equal(reaction.tags.filter(tag => tag[0] === 'p').length, 3);
  assert.equal(delivery.event.content.includes(customReaction), false);
}
assert.throws(() => nostr.nip17.unwrapEvent(groupReactionWraps[0], eve), 'an outsider cannot read a custom emoji group reaction');
assert.equal(routing.planGroupGiftWraps(groupWraps.slice(1), groupMembers, groupRelays, nostr.verifyEvent).reason, 'missing-gift-wrap', 'a missing participant envelope fails closed');
assert.equal(routing.planGroupGiftWraps(groupWraps, groupMembers, { ...groupRelays, [carolPub]: [] }, nostr.verifyEvent).reason, 'missing-inbox', 'a participant without an inbox route fails closed');
assert.equal(routing.planGroupGiftWraps(groupWraps, [...groupMembers, evePub], Object.fromEntries([...groupMembers, evePub].map(pubkey => [pubkey, ['wss://member.example']])), nostr.verifyEvent).reason, 'missing-gift-wrap', 'incomplete recipient coverage fails closed');

const password = 'protecao-local-de-teste-42';
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const secret = webcrypto.getRandomValues(new Uint8Array(32));
const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secret);
const restored = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
assert.deepEqual(new Uint8Array(restored), secret, 'password-derived key decrypts local secret');
const digest = createHash('sha256').update(source).digest('hex');
assert.equal(digest, 'a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407', 'vendored runtime hash matches recorded provenance');
console.log('PASS: NIP-17 wrap/unwrap, recipient isolation, kind-10050 inbox routing, local AES-GCM, vendor hash');
