import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, btoa, atob };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
vm.runInContext(await readFile(new URL('../web/agent-pairing.js', import.meta.url), 'utf8'), context, { timeout: 5000 });

const decisions = new Map();
const access = new Map();
const storage = {
  async getInvite(id) { return decisions.get(id); },
  async getAccess(pubkey) { return access.get(pubkey); },
  async listAccess() { return [...access.values()]; },
  async commitDecision(record, next) {
    if (decisions.has(record.id)) throw new Error('duplicate fixture invite');
    const existing = access.get(record.agentPubkey);
    if (existing?.status === 'blocked' || existing?.status === 'approved') throw new Error('fixture agent state conflict');
    decisions.set(record.id, record);
    if (next) access.set(next.pubkey, next);
  },
  async transitionAccess(pubkey, action, now) {
    const current = access.get(pubkey);
    if (!current) throw new Error('fixture access missing');
    if (action === 'revoked' && current.status !== 'approved') throw new Error('fixture invalid revoke');
    if (action === 'unblocked' && current.status !== 'blocked') throw new Error('fixture invalid unblock');
    if (action === 'blocked' && !['approved', 'revoked', 'blocked'].includes(current.status)) throw new Error('fixture invalid block');
    const next = { ...current, status: action === 'unblocked' ? 'revoked' : action, permissions: { read: [], send: [] }, updatedAt: now, revocationNotice: 'not-sent' };
    access.set(pubkey, next);
    return next;
  },
};
context.storage = storage;
context.g2Clock = 1_900_000_000;
context.g2NonceCounter = 0;
vm.runInContext(`globalThis.pairing = PropertyAgentPairing.createPairing({
  nostr: NostrTools, storage,
  now: () => g2Clock,
  randomBytes: length => { const bytes = new Uint8Array(length); for (let i = 0; i < length; i++) bytes[i] = (17 + g2NonceCounter * 31 + i * 7) & 255; g2NonceCounter++; return bytes; }
});`, context);
const pairing = context.pairing;

function secretFor(number) {
  context.fixtureScalar = number;
  return vm.runInContext('(() => { const key = new Uint8Array(32); key[31] = fixtureScalar; return key; })()', context);
}
function publicFor(number) { context.fixtureScalar = number; return vm.runInContext('NostrTools.getPublicKey((() => { const key = new Uint8Array(32); key[31] = fixtureScalar; return key; })())', context); }
function inviteOptions({ expiresAt = context.g2Clock + 600, recipientPubkey = '', relayHints = ['wss://relay-selected.example'] } = {}) {
  context.fixtureOptionsJson = JSON.stringify({ name: 'Agente Fixture', expiresAt, recipientPubkey, relayHints });
  return vm.runInContext('JSON.parse(fixtureOptionsJson)', context);
}
function makeInvite(number, options) { return pairing.makeInvite(secretFor(number), inviteOptions(options)); }
const humanPubkeys = [publicFor(240), publicFor(241)];
const humanPubkey = humanPubkeys[0];
const contactPubkey = publicFor(242);
const allowedRelays = ['wss://relay-selected.example'];
function permission(read = true, send = false) {
  context.fixturePermissionsJson = JSON.stringify([{ conversationPubkey: contactPubkey, read, send }]);
  return vm.runInContext('JSON.parse(fixturePermissionsJson)', context);
}
async function rejects(work, pattern) { await assert.rejects(work, pattern); }
const validCount = 10;
const invalidCount = 10;
const declinedCount = 10;
const revokedCount = 10;
const replayCount = 10;
const blockedCount = 10;
const usedInviteStrings = [];
const distinctAgentKeys = new Set();
const caseResults = [];
function record(category, index) { caseResults.push({ id: `G2-${category}-${String(index).padStart(2, '0')}`, result: 'PASS' }); }

for (let index = 1; index <= validCount; index++) {
  const recipient = humanPubkeys[(index - 1) % humanPubkeys.length];
  const made = makeInvite(index, { recipientPubkey: recipient });
  const inspected = pairing.inspectInvite(made.invite, { humanPubkey: recipient, allowedRelays });
  assert.equal(inspected.agentPubkey, publicFor(index), 'invite is bound to the signing agent key');
  assert.notEqual(inspected.agentPubkey, humanPubkey, 'agent identity is separate from the human');
  assert.ok(!distinctAgentKeys.has(inspected.agentPubkey), 'each synthetic agent has a distinct key');
  distinctAgentKeys.add(inspected.agentPubkey);
  const granted = await pairing.approve(made.invite, { humanPubkey: recipient, allowedRelays, contacts: [contactPubkey], permissions: permission(true, false) });
  assert.deepEqual(JSON.parse(JSON.stringify(granted.permissions)), { read: [contactPubkey], send: [] });
  assert.equal(await pairing.canRead(inspected.agentPubkey, contactPubkey), true);
  assert.equal(await pairing.canSend(inspected.agentPubkey, contactPubkey), false, 'send stays off when the human did not select it');
  assert.equal(await pairing.canRead(inspected.agentPubkey, publicFor(243)), false, 'unlisted conversations are denied');
  usedInviteStrings.push(made.invite);
  record('valid', index);
}

for (let index = 1; index <= invalidCount; index++) {
  const number = 20 + index;
  const made = makeInvite(number, { recipientPubkey: humanPubkey });
  let candidate = made.invite;
  if (index <= 4) {
    const changed = JSON.parse(JSON.stringify(made.event));
    const content = JSON.parse(changed.content); content.agent_name = `Adulterado ${index}`; changed.content = JSON.stringify(content);
    context.fixtureTamperedEventJson = JSON.stringify(changed);
    candidate = vm.runInContext('PropertyAgentPairing.encodeInvite(JSON.parse(fixtureTamperedEventJson))', context);
  } else if (index === 5) {
    const changed = JSON.parse(JSON.stringify(made.event)); changed.sig = `${changed.sig.slice(0, -1)}${changed.sig.endsWith('0') ? '1' : '0'}`;
    context.fixtureTamperedEventJson = JSON.stringify(changed);
    candidate = vm.runInContext('PropertyAgentPairing.encodeInvite(JSON.parse(fixtureTamperedEventJson))', context);
  } else if (index === 6) {
    candidate = makeInvite(number, { recipientPubkey: publicFor(242) }).invite;
  } else if (index === 7) {
    candidate = makeInvite(number, { relayHints: ['wss://relay-not-selected.example'] }).invite;
  } else if (index === 8) {
    const changed = JSON.parse(JSON.stringify(made.event)); changed.tags.push(['x', 'unexpected']);
    context.fixtureTamperedEventJson = JSON.stringify(changed);
    candidate = vm.runInContext('PropertyAgentPairing.encodeInvite(JSON.parse(fixtureTamperedEventJson))', context);
  } else if (index === 9) {
    const secret = secretFor(number); context.fixtureSecret = secret;
    context.fixtureBadContent = JSON.stringify({ protocol: 'property-agent-invite/v1', agent_name: 'Agente', nonce: '11'.repeat(16), expires_at: context.g2Clock + 600, recipient_pubkey: null, relay_hints: [], unknown: true });
    candidate = vm.runInContext(`(() => { const event=NostrTools.finalizeEvent({kind:30078,created_at:g2Clock,tags:[['d','property-agent-invite-v1']],content:fixtureBadContent},fixtureSecret); return PropertyAgentPairing.encodeInvite(event); })()`, context);
  } else {
    const secret = secretFor(number); context.fixtureSecret = secret;
    context.fixtureBadContent = JSON.stringify({ protocol: 'property-agent-invite/v1', agent_name: 'Agente', nonce: '22'.repeat(16), expires_at: context.g2Clock - 1, recipient_pubkey: null, relay_hints: [] });
    candidate = vm.runInContext(`(() => { const event=NostrTools.finalizeEvent({kind:30078,created_at:g2Clock,tags:[['d','property-agent-invite-v1']],content:fixtureBadContent},fixtureSecret); return PropertyAgentPairing.encodeInvite(event); })()`, context);
  }
  assert.throws(() => pairing.inspectInvite(candidate, { humanPubkey, allowedRelays }), /inválid|adulterado|outra identidade|não autoriz|validade/i);
  record('invalid', index);
}

context.fixtureSecret = secretFor(31);
context.fixtureBadContent = JSON.stringify({ protocol: 'property-agent-invite/v1', agent_name: 'Agente', nonce: '33'.repeat(16), expires_at: context.g2Clock + 24 * 60 * 60 + 1, recipient_pubkey: humanPubkey, relay_hints: [] });
const tooLongInvite = vm.runInContext(`(() => { const event=NostrTools.finalizeEvent({kind:30078,created_at:g2Clock,tags:[['d','property-agent-invite-v1']],content:fixtureBadContent},fixtureSecret); return PropertyAgentPairing.encodeInvite(event); })()`, context);
assert.throws(() => pairing.inspectInvite(tooLongInvite, { humanPubkey, allowedRelays }), /validade/i, 'invites cannot exceed the 24-hour lifetime policy');
record('max-lifetime-boundary', 1);

for (let index = 1; index <= declinedCount; index++) {
  const made = makeInvite(50 + index, { recipientPubkey: humanPubkey });
  const result = await pairing.decline(made.invite, { humanPubkey, allowedRelays });
  assert.equal(result.status, 'declined');
  await rejects(() => pairing.approve(made.invite, { humanPubkey, allowedRelays, contacts: [], permissions: [] }), /já foi usado/i);
  record('decline', index);
}

for (let index = 1; index <= revokedCount; index++) {
  const made = makeInvite(80 + index, { recipientPubkey: humanPubkey });
  const pubkey = publicFor(80 + index);
  await pairing.approve(made.invite, { humanPubkey, allowedRelays, contacts: [contactPubkey], permissions: permission(true, true) });
  assert.equal(await pairing.canSend(pubkey, contactPubkey), true);
  await pairing.revoke(pubkey);
  assert.equal(await pairing.canRead(pubkey, contactPubkey), false);
  assert.equal(await pairing.canSend(pubkey, contactPubkey), false);
  assert.equal((await pairing.list()).find(item => item.pubkey === pubkey).status, 'revoked');
  record('revoke', index);
}

for (let index = 1; index <= replayCount; index++) {
  const made = makeInvite(110 + index, { recipientPubkey: humanPubkey });
  const options = { humanPubkey, allowedRelays, contacts: [], permissions: [] };
  await pairing.approve(made.invite, options);
  await rejects(() => pairing.approve(made.invite, options), /já foi usado|já está pareado/i);
  record('replay', index);
}

for (let index = 1; index <= blockedCount; index++) {
  const number = 140 + index;
  const made = makeInvite(number, { recipientPubkey: humanPubkey });
  const pubkey = publicFor(number);
  await pairing.approve(made.invite, { humanPubkey, allowedRelays, contacts: [contactPubkey], permissions: permission(true, true) });
  await pairing.block(pubkey);
  assert.equal(await pairing.canRead(pubkey, contactPubkey), false);
  const newInvite = makeInvite(number, { recipientPubkey: humanPubkey });
  await rejects(() => pairing.approve(newInvite.invite, { humanPubkey, allowedRelays, contacts: [], permissions: [] }), /bloqueado/i);
  await pairing.unblock(pubkey);
  assert.equal(await pairing.canRead(pubkey, contactPubkey), false, 'unblocking never restores previous permissions');
  record('block-unblock', index);
}

assert.equal(distinctAgentKeys.size, validCount);
assert.equal(usedInviteStrings.length, validCount);
const serializedEvidence = JSON.stringify({ decisions: [...decisions.values()], access: [...access.values()] });
assert.doesNotMatch(serializedEvidence, /property-agent-invite:v1:|"nonce"|secret|private.?key/i, 'local evidence stores only hashed replay IDs and permission metadata');
assert.ok([...decisions.keys()].every(id => /^[0-9a-f]{64}$/.test(id)), 'replay records use a SHA-256 digest, not the invitation nonce');

console.log(JSON.stringify({
  gate: 'G2', status: 'PASS_TECHNICAL', seed: 'property-agent-g2-fixed-fixtures-v1', logicalNow: 1_900_000_000,
  cases: { validInvites: validCount, invalidOrTamperedInvites: invalidCount, declines: declinedCount, revocations: revokedCount, replays: replayCount, blocks: blockedCount },
  caseResults,
  assertions: ['separate agent keys', 'selected scopes only', 'local block/revoke', 'unblock does not restore permissions', 'recipient/relay/signature/schema/expired invite/maximum lifetime validation', 'hashed replay storage', 'no invitation or private key in evidence'],
}, null, 2));
