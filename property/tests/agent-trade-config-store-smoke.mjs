import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson } from '../agent/protocol-contract.mjs';
import { emptyTradeJournal } from '../agent/trade-state.mjs';
import { createTradeEvidenceSigner, createEncryptedTradeJournalStore } from '../agent/trade-state-store.mjs';
import { emptyTradeNodeConfig, validateTradeNodeConfig } from '../agent/trade-node-config.mjs';
import { createEncryptedPayload, openEncryptedPayload } from '../agent/vault.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'property-trade-config-store-'));
const owner = 'a'.repeat(64);
const password = 'fixed synthetic test-only password';
const secret = '1'.repeat(64);
const values = {
  schema: 'property-agent-trade-nodes/v1', version: 1, signing_seed: secret,
  adapters: {
    BTC: { rpc_url: 'http://127.0.0.1:18443/', username: 'regtest-user', password: 'btc-secret', wallet_name: 'property', network: 'regtest', min_confirmations: 1 },
    XMR: { wallet_rpc_url: 'http://127.0.0.1:18083/', daemon_rpc_url: 'http://127.0.0.1:18081/', username: 'wallet-user', password: 'wallet-secret',
      daemon_username: 'daemon-user', daemon_password: 'daemon-secret', network: 'fakechain', min_confirmations: 10 },
    XNO: { rpc_url: 'http://[::1]:7449/', username: 'gateway-user', password: 'gateway-secret', wallet: 'b'.repeat(64), network: 'dev', min_confirmations: 1 },
  },
};

try {
  const config = validateTradeNodeConfig(values);
  assert.deepEqual(Object.keys(config.adapters).sort(), ['BTC', 'XMR', 'XNO']);
  assert.deepEqual(emptyTradeNodeConfig(secret).adapters, {});

  const rejected = [];
  for (const mutate of [
    value => { value.adapters.BTC.network = 'mainnet'; },
    value => { value.adapters.BTC.rpc_url = 'http://192.168.1.10:18443/'; },
    value => { value.adapters.BTC.rpc_url = 'http://127.999.1.1:18443/'; },
    value => { value.adapters.XMR.daemon_rpc_url = 'http://localhost:18081/'; },
  ]) {
    const candidate = structuredClone(values);
    mutate(candidate);
    assert.throws(() => validateTradeNodeConfig(candidate));
    rejected.push(1);
  }

  const nodeFile = path.join(directory, 'trade-nodes.vault.json');
  const envelope = createEncryptedPayload(config, owner, password, 'trade-node-config');
  await writeFile(nodeFile, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
  const nodeText = await readFile(nodeFile, 'utf8');
  for (const clearValue of ['btc-secret', 'wallet-secret', 'gateway-secret', secret]) assert.equal(nodeText.includes(clearValue), false);
  assert.deepEqual(openEncryptedPayload(envelope, owner, password, 'trade-node-config'), config);
  assert.throws(() => openEncryptedPayload(envelope, owner, 'wrong synthetic password', 'trade-node-config'));
  assert.throws(() => openEncryptedPayload(envelope, 'c'.repeat(64), password, 'trade-node-config'));

  const signer = createTradeEvidenceSigner(secret);
  const payload = canonicalJson({ action: 'fixed-config-smoke', sequence: 1 });
  const signature = await signer.sign(payload);
  assert.equal(await signer.verify(signer.pubkey, payload, signature), true);
  assert.equal(await signer.verify('d'.repeat(64), payload, signature), false);
  assert.equal(await signer.verify(signer.pubkey, `${payload} `, signature), false);

  const journalFile = path.join(directory, 'trade-state.journal.vault.json');
  const store = createEncryptedTradeJournalStore({ file: journalFile, pubkey: owner, password });
  assert.deepEqual(await store.load(), emptyTradeJournal());
  await store.save(emptyTradeJournal());
  assert.deepEqual(await store.load(), emptyTradeJournal());
  const journalText = await readFile(journalFile, 'utf8');
  assert.equal(journalText.includes('property-trade-journal/v1'), false);
  assert.equal((await stat(journalFile)).mode & 0o777, 0o600);
  const wrongStore = createEncryptedTradeJournalStore({ file: journalFile, pubkey: owner, password: 'wrong synthetic password' });
  await assert.rejects(wrongStore.load());

  process.stdout.write(`${JSON.stringify({ gate: 'G7-trade-config-store', result: 'PASS', fixed_count: {
    test_network_adapters_validated: 3, unsafe_network_or_endpoint_configs_rejected: rejected.length,
    encrypted_config_round_trips: 1, wrong_password_or_identity_rejections: 2, evidence_signatures_verified: 1,
    encrypted_journal_round_trips: 1, journal_permissions_0600: true, mainnet_enabled: false,
  }, external_endpoints: 0 })}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
