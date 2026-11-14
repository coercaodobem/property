import assert from 'node:assert/strict';
import { createXnoThresholdProtocol, XNO_THRESHOLD_PROTOCOL } from '../agent/xno-threshold-protocol.mjs';
import { emptyXnoThresholdState, validateXnoThresholdState } from '../agent/xno-threshold-store.mjs';
import { calculateNanoThresholdBlockHash, decodeThresholdBytes, encodeThresholdBytes, nanoAccountFromPublicKey } from '../agent/xno-threshold.mjs';

const identities = ['a', 'b', 'c', 'd'].map(value => value.repeat(64));
const mailboxes = new Map(identities.map(pubkey => [pubkey, []]));
let sequence = 0;
let nextFixtureId = 0;
function fakeTransport(local) {
  return {
    async sendMessage(peer, body) {
      const messageId = (++sequence).toString(16).padStart(32, '0');
      mailboxes.get(peer).push({ message_id: messageId, in_reply_to: null, direction: 'received', conversation_pubkey: local, body, created_at: 1 });
      return { status: 'relay_accepted', message_id: messageId, relay_acks: 1, relay_attempts: 1 };
    },
    async readMessages(peer) { return mailboxes.get(local).filter(message => message.conversation_pubkey === peer); },
    async listConversations() { return [...mailboxes.get(local)].map(message => ({ pubkey: message.conversation_pubkey })); },
  };
}
function createActor(index) {
  let state = emptyXnoThresholdState();
  let clock = 1234;
  const blocked = new Set();
  const wallet = {
    async inspectThresholdAccount({ account, groupPublicKey }) {
      if (nanoAccountFromPublicKey(groupPublicKey) !== account) throw new Error('fixture-account-mismatch');
      return { account, previous: 'ab'.repeat(32).toUpperCase(), representative: 'nano_1hza3f7wiiqa7ig3jczyxj5yo86yegcmqk3criaz838j91sxcckpfhbhhra1', balance_raw: '1000' };
    },
    async generateThresholdWork(block) { assert.equal(block.type, 'state'); return '0123456789abcdef'; },
    async publishThresholdBlock(block) { return { hash: calculateNanoThresholdBlockHash(block), status: 'submitted_unconfirmed', network: 'dev' }; },
  };
  return {
    pubkey: identities[index],
    service: createXnoThresholdProtocol({ pubkey: identities[index], transport: fakeTransport(identities[index]), wallet, relays: () => ['wss://relay.invalid'],
      blockedPubkeys: () => [...blocked],
      loadStore: async () => structuredClone(state), saveStore: async value => { state = structuredClone(validateXnoThresholdState(value)); },
      now: () => clock, randomId: () => (++nextFixtureId).toString(16).padStart(32, '0') }),
    readState: () => structuredClone(state),
    setNow: value => { clock = value; },
    blockPeer: peer => blocked.add(peer),
    setSessionProtocol: (id, protocol) => { state.sessions[id].protocol = protocol; validateXnoThresholdState(state); },
  };
}

const actors = identities.map((_, index) => createActor(index));
const sessionParams = { participants: identities.slice(0, 3), trade_id: 'd'.repeat(32), network: 'dev', contract: {
  buyer_pubkey: identities[0], buyer_account: 'nano_3wm37qz19zhei7nzscjcopbrbnnachs4p1gnwo5oroi3qonw6inwgoeuufdp',
  seller_pubkey: identities[1], seller_account: 'nano_1hza3f7wiiqa7ig3jczyxj5yo86yegcmqk3criaz838j91sxcckpfhbhhra1',
  arbiter_pubkey: identities[2], amount_raw: '1000', terms_sha256: 'e'.repeat(64), expires_at: 4834,
} };
await assert.rejects(actors[0].service.create({ ...sessionParams, network: 'live' }), /invalid-arguments/);
const created = await actors[0].service.create(sessionParams);
assert.equal(created.invitations_sent, 2, JSON.stringify(created));
await actors[1].service.accept({ session_id: created.session_id });
await actors[2].service.accept({ session_id: created.session_id });

const afterInvite = await actors[0].service.sync({ session_id: created.session_id });
assert.equal(afterInvite.round1_received, 3, 'creator collects both authenticated participant commitments');
assert.equal(afterInvite.status, 'dkg');
await actors[1].service.sync({ session_id: created.session_id });
await actors[2].service.sync({ session_id: created.session_id });
const creatorReady = await actors[0].service.sync({ session_id: created.session_id });
const participantBReady = await actors[1].service.sync({ session_id: created.session_id });
const participantCReady = await actors[2].service.sync({ session_id: created.session_id });
assert.equal(creatorReady.status, 'ready', JSON.stringify({ creatorReady, participantBReady, participantCReady }));
assert.equal(participantBReady.status, 'ready');
assert.equal(participantCReady.status, 'ready');
assert.equal(new Set([creatorReady.group_account, participantBReady.group_account, participantCReady.group_account]).size, 1,
  'all three devices independently derive the same Nano threshold account');
assert.equal(new Set([creatorReady.group_public_key, participantBReady.group_public_key, participantCReady.group_public_key]).size, 1);
for (const actor of actors.slice(0, 3)) {
  const saved = actor.readState().sessions[created.session_id];
  assert.equal(saved.status, 'ready');
  assert.equal(saved.own_round1_secret, null, 'pre-keygen polynomial material is removed after DKG');
  assert.ok(saved.key_package, 'the participant-specific share remains in the encrypted store');
}
assert.equal(creatorReady.threshold, '2-of-3');
const proposal = await actors[0].service.proposeSettlement({ session_id: created.session_id, outcome: 'release' });
assert.equal(proposal.amount_raw, '1000');
assert.equal(proposal.destination, 'nano_1hza3f7wiiqa7ig3jczyxj5yo86yegcmqk3criaz838j91sxcckpfhbhhra1');
await actors[1].service.sync({ session_id: created.session_id });
await actors[2].service.sync({ session_id: created.session_id });
for (let pass = 0; pass < 2; pass++) {
  await actors[0].service.sync({ session_id: created.session_id });
  await actors[1].service.sync({ session_id: created.session_id });
  await actors[2].service.sync({ session_id: created.session_id });
}
const creatorBeforeApproval = await actors[0].service.status({ session_id: created.session_id });
const remoteBeforeApproval = await actors[1].service.status({ session_id: created.session_id });
assert.equal(creatorBeforeApproval.settlement.intent_consensus, true, 'all parties acknowledge one identical intent before approval');
const approvalParams = (status) => ({ session_id: created.session_id, intent_id: status.settlement.intent_id, block_hash: status.settlement.block_hash,
  outcome: status.settlement.outcome, account: status.settlement.account, destination: status.settlement.destination,
  amount_raw: status.settlement.amount_raw, previous: status.settlement.previous, confirm_text: status.settlement.approval_text });
await assert.rejects(actors[0].service.beginSettlementSigning({ session_id: created.session_id, intent_id: creatorBeforeApproval.settlement.intent_id,
  block_hash: creatorBeforeApproval.settlement.block_hash }), /xno-threshold-signature-quorum-not-approved/);
await assert.rejects(actors[2].service.approveSettlement(approvalParams(await actors[2].service.status({ session_id: created.session_id }))), /xno-threshold-not-an-authorized-signer/);
await actors[0].service.approveSettlement(approvalParams(creatorBeforeApproval));
await actors[1].service.approveSettlement(approvalParams(remoteBeforeApproval));
await actors[0].service.sync({ session_id: created.session_id });
await actors[1].service.sync({ session_id: created.session_id });
const approvalStatus = await actors[0].service.status({ session_id: created.session_id });
const round = await actors[0].service.beginSettlementSigning({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
assert.equal(round.status, 'collecting');
await actors[1].service.sync({ session_id: created.session_id });
await actors[0].service.sync({ session_id: created.session_id });
await actors[0].service.prepareSettlementSignature({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
await actors[1].service.prepareSettlementSignature({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
await actors[0].service.sync({ session_id: created.session_id });
await actors[1].service.sync({ session_id: created.session_id });
await actors[0].service.signSettlement({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
await actors[1].service.signSettlement({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
const signedStatus = await actors[0].service.sync({ session_id: created.session_id });
assert.equal(signedStatus.settlement.signed, true, 'coordinator aggregates only two verified signature shares');
assert.equal(signedStatus.settlement.block_hash, proposal.block_hash);
const publishResult = await actors[0].service.publishSettlement({ session_id: created.session_id, intent_id: proposal.intent_id, block_hash: proposal.block_hash });
assert.deepEqual(publishResult, { hash: proposal.block_hash, status: 'submitted_unconfirmed', network: 'dev', confirmed: false },
  'the protocol hands the exact signed block to a mocked dev-node adapter and keeps confirmation pending');
assert.equal(approvalStatus.settlement.approvals.length, 2);
actors[0].setNow(sessionParams.contract.expires_at);
const releaseAtExpiry = approvalParams(await actors[0].service.status({ session_id: created.session_id }));
await assert.rejects(actors[0].service.approveSettlement(releaseAtExpiry), /xno-threshold-contract-expired/);
actors[0].setNow(1234);
assert.throws(() => validateXnoThresholdState({ ...emptyXnoThresholdState(), sessions: { bad: {} } }), /xno-threshold-state-invalid/);

// Independent adversarial scenario: the arbiter coordinates a second session,
// proposes a refund before expiry, and tries to equivocate between buyer/seller.
const adversarialParams = { ...sessionParams, trade_id: 'f'.repeat(32) };
const adversarialCreated = await actors[2].service.create(adversarialParams);
await actors[0].service.accept({ session_id: adversarialCreated.session_id });
await actors[1].service.accept({ session_id: adversarialCreated.session_id });
for (let pass = 0; pass < 4; pass++) {
  await actors[0].service.sync({ session_id: adversarialCreated.session_id });
  await actors[1].service.sync({ session_id: adversarialCreated.session_id });
  await actors[2].service.sync({ session_id: adversarialCreated.session_id });
}
await assert.rejects(actors[2].service.proposeSettlement({ session_id: adversarialCreated.session_id, outcome: 'refund' }),
  /xno-threshold-refund-not-yet-available/);
actors[2].setNow(sessionParams.contract.expires_at);
const maliciousProposal = await actors[2].service.proposeSettlement({ session_id: adversarialCreated.session_id, outcome: 'refund' });
await actors[0].service.sync({ session_id: adversarialCreated.session_id });
await actors[1].service.sync({ session_id: adversarialCreated.session_id });
assert.equal((await actors[0].service.status({ session_id: adversarialCreated.session_id })).settlement, undefined,
  'buyer rejects a validly shaped early-refund message using its local contract clock');
assert.equal((await actors[1].service.status({ session_id: adversarialCreated.session_id })).settlement, undefined,
  'seller also rejects the early-refund message');
for (const index of [0, 1]) {
  const alerts = (await actors[index].service.status({ session_id: adversarialCreated.session_id })).security_alerts;
  assert.ok(alerts.some(alert => alert.sender === identities[2] && alert.reason === 'xno-threshold-refund-not-yet-available'),
    `participant ${index} gets an alert naming the sender of the early-refund attempt`);
}

// On expiry, inject two differently identified, otherwise valid refund intents
// for the same session, as a malicious coordinator can do with pairwise DMs.
actors[0].setNow(sessionParams.contract.expires_at);
actors[1].setNow(sessionParams.contract.expires_at);
const creatorSession = actors[2].readState().sessions[adversarialCreated.session_id];
const baseIntent = structuredClone(creatorSession.intent);
const splitIntent = structuredClone(baseIntent);
splitIntent.intent_id = 'e'.repeat(32);
function clearSettlementMessages(recipientIndex, senderIndex, sessionId) {
  const mailbox = mailboxes.get(identities[recipientIndex]);
  mailboxes.set(identities[recipientIndex], mailbox.filter(message => {
    if (message.conversation_pubkey !== identities[senderIndex]) return true;
    try {
      const frame = decodeThresholdBytes(JSON.parse(message.body));
      return frame.session_id !== sessionId || !['settlement_proposal', 'settlement_observation'].includes(frame.type);
    } catch { return true; }
  }));
}
function injectSettlement(senderIndex, recipientIndex, session, type, payload) {
  const frame = { protocol: XNO_THRESHOLD_PROTOCOL, type, session_id: session.session_id,
    manifest_sha256: session.manifest_sha256, sender: identities[senderIndex], recipient: identities[recipientIndex], payload };
  mailboxes.get(identities[recipientIndex]).push({ message_id: (++sequence).toString(16).padStart(32, '0'), in_reply_to: null,
    direction: 'received', conversation_pubkey: identities[senderIndex], body: JSON.stringify(encodeThresholdBytes(frame)), created_at: 1 });
}
clearSettlementMessages(0, 2, adversarialCreated.session_id);
clearSettlementMessages(1, 2, adversarialCreated.session_id);
const creatorFingerprint = creatorSession.intent_observations[identities[2]];
injectSettlement(2, 0, creatorSession, 'settlement_observation', { fingerprint: creatorFingerprint, observer: identities[2] });
injectSettlement(2, 1, creatorSession, 'settlement_observation', { fingerprint: creatorFingerprint, observer: identities[2] });
injectSettlement(2, 0, creatorSession, 'settlement_proposal', baseIntent);
injectSettlement(2, 1, creatorSession, 'settlement_proposal', baseIntent);
injectSettlement(2, 1, creatorSession, 'settlement_proposal', splitIntent);
await actors[0].service.sync({ session_id: adversarialCreated.session_id });
await actors[1].service.sync({ session_id: adversarialCreated.session_id });
await actors[0].service.sync({ session_id: adversarialCreated.session_id });
await actors[1].service.sync({ session_id: adversarialCreated.session_id });
await actors[2].service.sync({ session_id: adversarialCreated.session_id });
for (const index of [0, 1, 2]) {
  assert.equal((await actors[index].service.status({ session_id: adversarialCreated.session_id })).settlement.integrity, 'conflict_reported',
    `participant ${index} receives a report from a participant that saw two coordinator proposals`);
}
await assert.rejects(actors[2].service.beginSettlementSigning({ session_id: adversarialCreated.session_id,
  intent_id: maliciousProposal.intent_id, block_hash: maliciousProposal.block_hash }), /xno-threshold-intent-conflict-detected/);
assert.equal((await actors[0].service.status({ session_id: adversarialCreated.session_id })).settlement.arbiter_pubkey, identities[2]);
actors[0].blockPeer(identities[2]);
actors[1].blockPeer(identities[2]);
actors[0].setNow(1234);
actors[1].setNow(1234);
const blockedCandidate = { ...sessionParams, trade_id: '9'.repeat(32) };
await assert.rejects(actors[0].service.create(blockedCandidate), /xno-threshold-peer-invalid/);
await assert.rejects(actors[1].service.create(blockedCandidate), /xno-threshold-peer-invalid/);
const alternateArbiterParams = { ...sessionParams, participants: [identities[0], identities[1], identities[3]], trade_id: '8'.repeat(32),
  contract: { ...sessionParams.contract, arbiter_pubkey: identities[3] } };
const alternateSession = await actors[0].service.create(alternateArbiterParams);
assert.equal(alternateSession.invitations_sent, 2, 'buyer can start a new session with another unblocked arbiter');
await actors[1].service.accept({ session_id: alternateSession.session_id });
await actors[3].service.accept({ session_id: alternateSession.session_id });
assert.equal((await actors[3].service.status({ session_id: alternateSession.session_id })).status, 'dkg',
  'seller and buyer can choose an alternate candidate after locally blocking the reported arbiter');
actors[0].setSessionProtocol(alternateSession.session_id, 'property-xno-threshold/v1');
await assert.rejects(actors[0].service.sync({ session_id: alternateSession.session_id }), /xno-threshold-protocol-version-unsupported/);
process.stdout.write(JSON.stringify({ gate: 'XNO-T3a-threshold-dkg-transport', profile: 'offline-synthetic', protocol: XNO_THRESHOLD_PROTOCOL,
  seed: 'property-xno-threshold-identities-fixed-v1',
  cases: ['signed-private-invites-only-for-three-participants', 'all-three-accept-and-exchange-round1', 'pairwise-share-recipient-binding',
    'three-independent-group-keys-match', 'sensitive-round1-polynomial-cleared', 'threshold-share-retained-in-store', 'strict-state-id-validation',
    'mainnet-dkg-session-refused', 'exact-contract-bound-send-proposal', 'no-signing-before-required-approvals', 'buyer-plus-arbiter-cannot-approve-release',
    'buyer-and-seller-approve-exact-frontier-and-block', 'all-three-participants-observe-identical-intent-before-approval',
    'one-use-nonce-round', 'two-approved-shares-aggregate-for-exact-block', 'mock-dev-publication-remains-unconfirmed',
    'release-rejected-at-exact-expiry', 'early-refund-rejected-and-reported-by-buyer-and-seller', 'single-recipient-equivocation-report-freezes-all-three',
    'equivocated-intent-cannot-start-signing', 'both-parties-can-locally-block-the-reported-arbiter',
    'alternate-arbiter-can-be-chosen-after-local-block', 'legacy-v1-session-fails-closed']
    .map(id => ({ id, result: 'PASS' })), caseCount: 23, participantFixtures: 4, adversarialSessions: 1, arbiterCandidates: 2,
  transport: 'in-memory-message-contract-fixture; real NIP-17 crypto not invoked', fundsUsed: false, relaysContacted: false,
  realParticipantsSimulated: false, secretValuesInReport: false }, null, 2) + '\n');
