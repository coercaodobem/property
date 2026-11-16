import assert from 'node:assert/strict';
import { createEncryptedPayload, createVault, openEncryptedPayload, unlockVault } from '../agent/vault.mjs';

const password = 'fixed synthetic vault password';
const pubkey = 'a'.repeat(64);
const secretHex = '5c'.repeat(32);
const vault = createVault(Buffer.from(secretHex, 'hex'), pubkey, password);
const context = { propertyAgentSecretHex: '', Uint8Array };
const nostr = { getPublicKey: () => pubkey };
assert.equal(unlockVault(vault, password, nostr, context).secretHex, secretHex);
assert.throws(() => unlockVault({ ...vault, auth_tag: Buffer.alloc(8).toString('base64') }, password, nostr, context));

const payload = createEncryptedPayload({ fixture: 'synthetic' }, pubkey, password, 'trade-node-config');
assert.deepEqual(openEncryptedPayload(payload, pubkey, password, 'trade-node-config'), { fixture: 'synthetic' });
assert.throws(() => openEncryptedPayload({ ...payload, auth_tag: Buffer.alloc(8).toString('base64') }, pubkey, password, 'trade-node-config'));

process.stdout.write(`${JSON.stringify({ schema_version: 1, gate: 'G9', case: 'agent AES-GCM authentication tags', result: 'PASS', fixed_cases: 4, truncated_tags_rejected: 2 })}\n`);
