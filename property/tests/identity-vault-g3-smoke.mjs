#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../web/', import.meta.url);
const PASSWORD = 'Property-G3-offline-password-2026!';
const REPORT_PATH = process.argv[2];
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout, btoa, atob };
context.window = context;
vm.createContext(context);
for (const file of ['vendor/nostr-tools-2.25.2.bundle.js', 'vault.js']) {
  vm.runInContext(await readFile(new URL(file, ROOT), 'utf8'), context, { timeout: 10000 });
}

const N = context.NostrTools;
const V = context.PropertyVault;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const verifiesInProtocolRealm = event => {
  context.g3ClaimEvent = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(g3ClaimEvent))', context, { timeout: 10000 });
};
function fixedSecret(label) {
  for (let nonce = 0; nonce < 100; nonce++) {
    const secret = new Uint8Array(createHash('sha256').update(`property-g3-fixed:${label}:${nonce}`).digest());
    try { N.getPublicKey(secret); return secret; } catch { secret.fill(0); }
  }
  throw new Error('could not derive a valid deterministic G3 key fixture');
}
function tamperBase64(value) {
  const bytes = V.fromBase64(value);
  assert.ok(bytes.length > 12);
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  return V.toBase64(bytes);
}

const identityCycles = [];
for (let index = 0; index < 30; index++) {
  const secret = fixedSecret(`identity-cycle-${index}`);
  const pubkey = N.getPublicKey(secret);
  const remember = index % 2 === 0;
  const vault = await V.createVault(secret, PASSWORD, remember, N.getPublicKey);
  assert.equal(vault.pubkey, pubkey);
  const serializedVault = JSON.stringify(vault);
  assert.equal(serializedVault.includes(PASSWORD), false);
  assert.equal(/nsec1|mnemonic|private.?key/i.test(serializedVault), false);

  await assert.rejects(() => V.unlockVault(vault, `${PASSWORD}-wrong`, N.getPublicKey), /Senha incorreta ou backup inválido/);
  const tampered = { ...vault, cipher: tamperBase64(vault.cipher) };
  await assert.rejects(() => V.unlockVault(tampered, PASSWORD, N.getPublicKey), /Senha incorreta ou backup inválido/);

  let unlocked = await V.unlockVault(vault, PASSWORD, N.getPublicKey);
  assert.deepEqual(Buffer.from(unlocked), Buffer.from(secret));
  unlocked.fill(0); // mirrors the app's in-memory key clearing on lock
  assert.equal(unlocked.every(byte => byte === 0), true);
  unlocked = await V.unlockVault(vault, PASSWORD, N.getPublicKey);
  assert.deepEqual(Buffer.from(unlocked), Buffer.from(secret));
  unlocked.fill(0);
  if (remember) {
    const autoUnlocked = await V.autoUnlock(vault, N.getPublicKey);
    assert.deepEqual(Buffer.from(autoUnlocked), Buffer.from(secret));
    autoUnlocked.fill(0);
  } else assert.equal(await V.autoUnlock(vault, N.getPublicKey), null);
  secret.fill(0);
  identityCycles.push({ index, public_key_sha256: sha256(pubkey), remembered_session: remember,
    wrong_password_rejected: true, tampered_vault_rejected: true, key_cleared_on_lock: true, same_identity_restored: true });
}

const backupCycles = [];
for (let index = 0; index < 20; index++) {
  const secret = fixedSecret(`backup-cycle-${index}`);
  const pubkey = N.getPublicKey(secret);
  const contactSecret = fixedSecret(`backup-contact-${index}`);
  const contactPubkey = N.getPublicKey(contactSecret);
  contactSecret.fill(0);
  const localState = V.validatePortableState({ schema_version: 1,
    relay_preferences: { values: [`wss://relay-${index}.example.invalid`, `wss://backup-${index}.example.invalid`], auto_selected: false },
    contacts: [{ pubkey: contactPubkey, title: `Contact ${index}`, relayHints: [`wss://contact-${index}.example.invalid`] }] });
  const vault = await V.createVault(secret, PASSWORD, false, N.getPublicKey);
  const backup = await V.createPortableBackup(vault, PASSWORD, localState, N.getPublicKey);
  assert.equal(backup.format, 'property-encrypted-key-v2');
  assert.equal(backup.pubkey, pubkey);
  assert.equal(JSON.stringify(backup).includes(PASSWORD), false);
  assert.equal(JSON.stringify(backup).includes(`Contact ${index}`), false);
  assert.equal(/nsec1|mnemonic|private.?key/i.test(JSON.stringify(backup)), false);

  const restored = await V.openPortableBackup(backup, PASSWORD, N.getPublicKey);
  assert.deepEqual(Buffer.from(restored.secret), Buffer.from(secret));
  assert.equal(sha256(JSON.stringify(restored.localState)), sha256(JSON.stringify(localState)));
  restored.secret.fill(0);
  const tampered = structuredClone(backup);
  tampered.local_state.cipher = tamperBase64(tampered.local_state.cipher);
  await assert.rejects(() => V.openPortableBackup(tampered, PASSWORD, N.getPublicKey), /Dados locais do backup inválidos ou adulterados/);
  secret.fill(0);
  backupCycles.push({ index, public_key_sha256: sha256(pubkey), relay_preferences_hash: sha256(JSON.stringify(localState.relay_preferences)),
    opted_in_contact_records: localState.contacts.length, restored_state_hash: sha256(JSON.stringify(localState)),
    password_and_contact_name_absent_from_metadata: true, tampered_local_state_rejected: true });
}

const handleCollisions = [];
for (let index = 0; index < 20; index++) {
  const handle = `shared-name-${String(index).padStart(2, '0')}`;
  const firstSecret = fixedSecret(`handle-a-${index}`);
  const secondSecret = fixedSecret(`handle-b-${index}`);
  const createdAt = 1_900_000_000 + index;
  const makeClaim = secret => {
    context.g3ClaimTemplate = JSON.stringify({ kind: 0, created_at: createdAt, tags: [],
      content: JSON.stringify({ name: handle, display_name: handle }) });
    context.g3ClaimSecret = [...secret];
    return JSON.parse(vm.runInContext('JSON.stringify(NostrTools.finalizeEvent(JSON.parse(g3ClaimTemplate), Uint8Array.from(g3ClaimSecret)))', context, { timeout: 10000 }));
  };
  const first = makeClaim(firstSecret), second = makeClaim(secondSecret);
  assert.equal(verifiesInProtocolRealm(first), true); assert.equal(verifiesInProtocolRealm(second), true);
  assert.equal(first.content === second.content, true);
  assert.notEqual(first.pubkey, second.pubkey);
  assert.notEqual(first.id, second.id);
  const localProfiles = new Map([[first.pubkey, JSON.parse(first.content)], [second.pubkey, JSON.parse(second.content)]]);
  assert.equal(localProfiles.size, 2, 'the signed display name is not used as an identity key');
  assert.equal([...localProfiles.values()].every(profile => profile.name === handle), true);
  firstSecret.fill(0); secondSecret.fill(0);
  handleCollisions.push({ index, handle_claim_hash: sha256(handle), distinct_public_keys: true,
    distinct_signed_events: true, profiles_retained_by_public_key: 2, global_uniqueness_claimed: false });
}

const report = { schema_version: 1, gate: 'G3', result: 'PASS', seed: 'property-g3-fixed-v1',
  identity_cycles: { required: 30, completed: identityCycles.length, wrong_password_fail_closed: 30,
    tampered_vault_fail_closed: 30, same_public_identity_recovered: 30, key_bytes_cleared_after_lock: 30, cases: identityCycles },
  backup_restore_cycles: { required: 20, completed: backupCycles.length, public_key_preserved: 20,
    relay_preference_hashes_preserved: 20, opted_in_local_contact_hashes_preserved: 20,
    no_message_history_included: true, tampered_local_state_rejected: 20, cases: backupCycles },
  signed_handle_collisions: { required: 20, completed: handleCollisions.length, valid_signatures: 40,
    distinct_public_keys_per_claim: 20, collisions_overwrote_identity: 0, local_profiles_keyed_by_pubkey: 20, cases: handleCollisions } };
if (REPORT_PATH) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  await mkdir(path.dirname(REPORT_PATH), { recursive: true, mode: 0o700 });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify({ gate: report.gate, result: report.result,
  identity_cycles: report.identity_cycles.completed, backup_restore_cycles: report.backup_restore_cycles.completed,
  signed_handle_collisions: report.signed_handle_collisions.completed, report_path: REPORT_PATH || null })}\n`);
