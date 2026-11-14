import assert from 'node:assert/strict';
import {
  decodeThresholdBytes,
  encodeThresholdBytes,
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

const message = Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 255);
const chosen = [0, 2];
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

process.stdout.write('PASS: Nano 2-of-3 threshold DKG, distinct participant shares, one-shot nonce tickets, signature aggregation, altered-message rejection, threshold rejection, address encoding, and wire serialization. Offline simulation only; no Nano node or funds used.\n');
