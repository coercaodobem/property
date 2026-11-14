import assert from 'node:assert/strict';
import { createEncryptedXnoThresholdStore, emptyXnoThresholdState, validateXnoThresholdState } from '../agent/xno-threshold-store.mjs';

const owner = 'a'.repeat(64);
const password = 'synthetic-threshold-store-password';
const file = '/offline-fixture/property/xno-threshold.json';
let envelope;
const storage = {
  async read(path) { if (path !== file || !envelope) { const error = new Error('missing'); error.code = 'ENOENT'; throw error; } return structuredClone(envelope); },
  async write(path, value) { assert.equal(path, file); envelope = structuredClone(value); },
};
const store = createEncryptedXnoThresholdStore({ file, pubkey: owner, password, ...storage });
assert.deepEqual(await store.load(), emptyXnoThresholdState());
const state = emptyXnoThresholdState();
state.sessions['b'.repeat(32)] = { session_id: 'b'.repeat(32), creator: owner, created_at: 12, status: 'dkg',
  key_package: { secret: { identifier: 'fixture-id', signingShare: { $bytes: 'd'.repeat(64) } } } };
await store.save(state);
assert.equal(envelope.context, 'xno-threshold');
assert.equal(JSON.stringify(envelope).includes('d'.repeat(64)), false, 'stored threshold secret material is AES-GCM ciphertext');
assert.deepEqual(await store.load(), state, 'encrypted threshold state survives process restart and decodes intact');
const wrongPassword = createEncryptedXnoThresholdStore({ file, pubkey: owner, password: `${password}-wrong`, ...storage });
await assert.rejects(wrongPassword.load(), /Senha incorreta ou payload cifrado adulterado/);
const tampered = structuredClone(envelope);
tampered.auth_tag = Buffer.alloc(16, 0).toString('base64');
envelope = tampered;
await assert.rejects(store.load(), /Senha incorreta ou payload cifrado adulterado/);
assert.throws(() => validateXnoThresholdState({ ...emptyXnoThresholdState(), sessions: { ['c'.repeat(32)]: {
  session_id: 'c'.repeat(32), creator: owner, created_at: -1, status: 'dkg',
} } }), /xno-threshold-session-invalid/);
process.stdout.write(JSON.stringify({ gate: 'XNO-T3a-encrypted-share-storage', profile: 'offline-synthetic', seed: 'property-xno-threshold-store-fixed-v1',
  cases: ['empty-store-load', 'AES-GCM-threshold-share-at-rest', 'restart-recovery', 'wrong-password-fails-closed', 'tamper-detection', 'invalid-session-state-rejected']
    .map(id => ({ id, result: 'PASS' })), caseCount: 6, fundsUsed: false, relayAccess: false, secretValuesInReport: false }, null, 2) + '\n');
