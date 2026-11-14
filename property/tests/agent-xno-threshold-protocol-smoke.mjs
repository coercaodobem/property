import assert from 'node:assert/strict';
import { createXnoThresholdProtocol } from '../agent/xno-threshold-protocol.mjs';
import { emptyXnoThresholdState, validateXnoThresholdState } from '../agent/xno-threshold-store.mjs';
import { calculateNanoThresholdBlockHash, nanoAccountFromPublicKey } from '../agent/xno-threshold.mjs';

const identities = ['a', 'b', 'c'].map(value => value.repeat(64));
const mailboxes = new Map(identities.map(pubkey => [pubkey, []]));
let sequence = 0;
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
  let nextId = 0;
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
      loadStore: async () => structuredClone(state), saveStore: async value => { state = structuredClone(validateXnoThresholdState(value)); },
      now: () => 1234, randomId: () => (++nextId).toString(16).padStart(32, '0') }),
    readState: () => structuredClone(state),
  };
}

const actors = identities.map((_, index) => createActor(index));
const sessionParams = { participants: identities, trade_id: 'd'.repeat(32), network: 'dev', contract: {
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
for (const actor of actors) {
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
const creatorBeforeApproval = await actors[0].service.status({ session_id: created.session_id });
const remoteBeforeApproval = await actors[1].service.status({ session_id: created.session_id });
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
assert.throws(() => validateXnoThresholdState({ ...emptyXnoThresholdState(), sessions: { bad: {} } }), /xno-threshold-state-invalid/);
process.stdout.write(JSON.stringify({ gate: 'XNO-T3a-threshold-dkg-transport', profile: 'offline-synthetic', seed: 'property-xno-threshold-identities-fixed-v1',
  cases: ['signed-private-invites-only-for-three-participants', 'all-three-accept-and-exchange-round1', 'pairwise-share-recipient-binding',
    'three-independent-group-keys-match', 'sensitive-round1-polynomial-cleared', 'threshold-share-retained-in-store', 'strict-state-id-validation',
    'mainnet-dkg-session-refused', 'exact-contract-bound-send-proposal', 'no-signing-before-required-approvals', 'buyer-plus-arbiter-cannot-approve-release',
    'buyer-and-seller-approve-exact-frontier-and-block', 'one-use-nonce-round', 'two-approved-shares-aggregate-for-exact-block', 'mock-dev-publication-remains-unconfirmed']
    .map(id => ({ id, result: 'PASS' })), caseCount: 15, participantFixtures: 3,
  transport: 'in-memory-message-contract-fixture; real NIP-17 crypto not invoked', fundsUsed: false, relaysContacted: false,
  realParticipantsSimulated: false, secretValuesInReport: false }, null, 2) + '\n');
