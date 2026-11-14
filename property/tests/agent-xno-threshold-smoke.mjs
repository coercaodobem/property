import assert from 'node:assert/strict';
import {
  decodeThresholdBytes,
  encodeThresholdBytes,
  attachNanoThresholdSignature,
  buildNanoThresholdSendBlock,
  calculateNanoThresholdBlockHash,
  nanoAccountFromPublicKey,
  nanoPublicKeyFromAccount,
  nanoThresholdFrost as frost,
  nanoThresholdIdentifier,
  verifyNanoThresholdSignature,
} from '../agent/xno-threshold.mjs';

const sampleAccount = 'nano_3wm37qz19zhei7nzscjcopbrbnnachs4p1gnwo5oroi3qonw6inwgoeuufdp';
assert.equal('combineSecret' in frost, false, 'public API does not combine signing shares into a key');
assert.equal('trustedDealer' in frost, false, 'public API does not expose trusted-dealer key generation');
assert.equal('sign' in frost, false, 'public API does not expose single-key signing');
const samplePublicKey = nanoPublicKeyFromAccount(sampleAccount);
assert.equal(nanoAccountFromPublicKey(samplePublicKey), sampleAccount);
assert.throws(() => nanoPublicKeyFromAccount(`${sampleAccount.slice(0, -1)}1`), /xno-account-checksum-invalid/);
assert.throws(() => nanoThresholdIdentifier('short'), /xno-threshold-participant-invalid/);

const participantPubkeys = ['a', 'b', 'c'].map(character => character.repeat(64));
const identifiers = participantPubkeys.map(nanoThresholdIdentifier);
assert.equal(new Set(identifiers).size, 3, 'Nostr keys map to distinct FROST participants');
const signers = { min: 2, max: 3 };
assert.equal(frost.DKG.round1.length, 2, 'round one accepts only a public identity and the fixed 2-of-3 threshold');
assert.throws(() => frost.DKG.round1(participantPubkeys[0], { min: 3, max: 3 }), /configuration-unsupported/);

// Simulate three isolated participants exchanging authenticated DKG messages.
const round1 = participantPubkeys.map(publicKey => frost.DKG.round1(publicKey, signers));
const round2 = round1.map((participant, index) => frost.DKG.round2(
  participant.secret,
  round1.filter((_, other) => other !== index).map(other => other.public),
));
const keyPackages = round1.map((participant, recipient) => {
  const publicRound1 = round1.filter((_, other) => other !== recipient).map(other => other.public);
  const privateRound2 = round2
    .filter((_, sender) => sender !== recipient)
    .map(sharesForRecipient => sharesForRecipient[identifiers[recipient]]);
  const key = frost.DKG.round3(participant.secret, publicRound1, privateRound2);
  frost.validateSecret(key.secret, key.public);
  return key;
});

const groupPublicKey = keyPackages[0].public.commitments[0];
for (const key of keyPackages) assert.deepEqual(key.public.commitments[0], groupPublicKey, 'all parties derive one group public key');
assert.equal(nanoPublicKeyFromAccount(nanoAccountFromPublicKey(groupPublicKey)).length, 32);

const sampleStateBlock = { type: 'state', account: 'nano_3qgmh14nwztqw4wmcdzy4xpqeejey68chx6nciczwn9abji7ihhum9qtpmdr',
  previous: 'F47B23107E5F34B2CE06F562B5C435DF72A533251CB414C51B2B62A8F63A00E4',
  representative: 'nano_1hza3f7wiiqa7ig3jczyxj5yo86yegcmqk3criaz838j91sxcckpfhbhhra1', balance: '1000000000000000000000',
  link: '19D3D919475DEED4696B5D13018151D1AF88B2BD3BCFF048B45031C1F36D1858' };
assert.equal(calculateNanoThresholdBlockHash(sampleStateBlock), 'FF0144381CFF0B2C079A115E7ADA7E96F43FD219446E7524C48D1CC9900C4F17',
  'state block hash matches the Nano RPC reference vector');
const thresholdAccount = nanoAccountFromPublicKey(groupPublicKey);
const chosen = [0, 2];
const proposal = buildNanoThresholdSendBlock({ account: thresholdAccount, groupPublicKey, previous: 'ab'.repeat(32),
  representative: sampleStateBlock.representative, balanceRaw: '900', destination: sampleStateBlock.account, amountRaw: '250', work: '0123456789abcdef' });
assert.equal(proposal.block.balance, '650');
assert.match(proposal.block.link, /^[0-9A-F]{64}$/);
const proposalHash = Uint8Array.from(Buffer.from(proposal.block_hash, 'hex'));
const blockNoncePackages = chosen.map(index => frost.commit(keyPackages[index].secret));
const blockCommitments = blockNoncePackages.map(item => item.commitments);
const blockShares = chosen.map((index, position) => frost.signShare(keyPackages[index].secret, keyPackages[index].public,
  blockNoncePackages[position], blockCommitments, proposalHash));
const blockSignature = frost.aggregate(keyPackages[0].public, blockCommitments, proposalHash,
  Object.fromEntries(chosen.map((index, position) => [keyPackages[index].secret.identifier, blockShares[position]])));
const signedProposal = attachNanoThresholdSignature(proposal.block, blockSignature, groupPublicKey);
assert.equal(signedProposal.block_hash, proposal.block_hash, 'signature is attached to the exact Nano send-block hash');
assert.equal(signedProposal.block.signature.length, 128);
assert.throws(() => attachNanoThresholdSignature({ ...proposal.block, balance: '649' }, blockSignature, groupPublicKey), /xno-threshold-signature-invalid/);
assert.throws(() => buildNanoThresholdSendBlock({ account: thresholdAccount, groupPublicKey, previous: 'ab'.repeat(32),
  representative: sampleStateBlock.representative, balanceRaw: '900', destination: sampleStateBlock.account, amountRaw: '901' }), /xno-threshold-send-amount-invalid/);

const message = Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 255);
const noncePackages = chosen.map(index => frost.commit(keyPackages[index].secret));
const commitmentList = noncePackages.map(item => item.commitments);
const signatureShares = chosen.map((index, position) => frost.signShare(
  keyPackages[index].secret,
  keyPackages[index].public,
  noncePackages[position],
  commitmentList,
  message,
));
assert.equal('nonces' in noncePackages[0], false, 'secret nonces are hidden behind an in-memory one-shot ticket');
assert.throws(() => frost.signShare(
  keyPackages[chosen[0]].secret,
  keyPackages[chosen[0]].public,
  noncePackages[0],
  commitmentList,
  message,
), /nonce-missing-or-used/, 'a signing nonce ticket cannot be reused');
const signature = frost.aggregate(
  keyPackages[0].public,
  commitmentList,
  message,
  Object.fromEntries(chosen.map((index, position) => [keyPackages[index].secret.identifier, signatureShares[position]])),
);

assert.equal(signature.length, 64, 'aggregate has Nano Ed25519 signature size');
assert.equal(verifyNanoThresholdSignature(signature, message, groupPublicKey), true, 'two of three shares verify under the Nano challenge');
const changedMessage = new Uint8Array(message);
changedMessage[31] ^= 1;
assert.equal(verifyNanoThresholdSignature(signature, changedMessage, groupPublicKey), false);
const changedSignature = new Uint8Array(signature);
changedSignature[63] ^= 1;
assert.equal(verifyNanoThresholdSignature(changedSignature, message, groupPublicKey), false);
const loneNonce = frost.commit(keyPackages[1].secret);
assert.throws(() => frost.signShare(keyPackages[1].secret, keyPackages[1].public, loneNonce,
  [loneNonce.commitments], message), /commitments/i, 'one signer cannot create a valid partial signature below the threshold');
assert.throws(() => frost.aggregate(keyPackages[0].public, commitmentList.slice(0, 1), message, {}), /aggregation failed/i,
  'one participant cannot meet the two-of-three signing threshold');
const discardedNonce = frost.commit(keyPackages[1].secret);
assert.equal(frost.discardNonce(discardedNonce), true, 'restarting a signing round discards the process-memory nonce');
assert.throws(() => frost.signShare(keyPackages[1].secret, keyPackages[1].public, discardedNonce,
  [discardedNonce.commitments], message), /nonce-missing-or-used/);

const wireRoundTrip = decodeThresholdBytes(encodeThresholdBytes({
  publicKey: groupPublicKey,
  signature,
  identifier: keyPackages[0].secret.identifier,
  nested: [new Uint8Array([0, 1, 255]), 3n],
}));
assert.deepEqual(wireRoundTrip.publicKey, groupPublicKey);
assert.deepEqual(wireRoundTrip.signature, signature);
assert.equal(wireRoundTrip.identifier, keyPackages[0].secret.identifier);
assert.deepEqual(wireRoundTrip.nested, [new Uint8Array([0, 1, 255]), 3n]);

process.stdout.write('PASS: Nano 2-of-3 threshold DKG and block signature, one-shot nonce tickets, altered-message and threshold rejection, Nano account encoding, published state-block hash vector, exact send construction, and wire serialization. Offline simulation only; no Nano node or funds used.\n');
