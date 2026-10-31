#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-mutation-sensitivity-'));
const readProduct = file => readFile(path.join(root, 'property', file), 'utf8');
const makeContext = extra => {
  const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout, btoa, atob, ...extra };
  context.window = context;
  vm.createContext(context);
  return context;
};

try {
  const signatureContext = makeContext();
  vm.runInContext(await readProduct('web/vendor/nostr-tools-2.25.2.bundle.js'), signatureContext, { timeout: 5000 });
  const nostr = signatureContext.NostrTools;
  const secret = nostr.generateSecretKey();
  signatureContext.eventTemplateJson = JSON.stringify({ kind: 1, pubkey: nostr.getPublicKey(secret), created_at: 1_900_000_000, tags: [], content: 'fixture original' });
  signatureContext.secretHex = Buffer.from(secret).toString('hex');
  const signed = vm.runInContext('NostrTools.finalizeEvent(JSON.parse(eventTemplateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', signatureContext, { timeout: 5000 });
  assert.equal(nostr.verifyEvent(signed), true);
  const changedSignatureFixture = JSON.parse(JSON.stringify(signed));
  changedSignatureFixture.content = 'fixture changed without resigning';
  assert.equal(nostr.verifyEvent(changedSignatureFixture), false, 'signature mutation is rejected by event verification');

  const moneyContext = makeContext();
  for (const file of ['web/money.js', 'web/marketplace.js']) {
    vm.runInContext(await readProduct(file), moneyContext, { timeout: 5000 });
  }
  assert.throws(() => moneyContext.PropertyMoney.validateAtomic('1x', 'BTC'),
    /Valor atômico inválido/, 'malformed atomic amount is rejected');
  assert.equal(moneyContext.PropertyMarketplace.displayPrice({ currency: 'XNO', price_atomic: '1x' }), 'Preço inválido',
    'mutated atomic-price fixture cannot display as a valid price');

  const vaultContext = makeContext();
  vm.runInContext(await readProduct('web/vendor/nostr-tools-2.25.2.bundle.js'), vaultContext, { timeout: 5000 });
  vm.runInContext(await readProduct('web/vault.js'), vaultContext, { timeout: 5000 });
  const vaultSecret = vaultContext.NostrTools.generateSecretKey();
  const vaultPassword = 'senha-offline-fixture-com-12';
  const vault = await vaultContext.PropertyVault.createVault(vaultSecret, vaultPassword, false, vaultContext.NostrTools.getPublicKey);
  const backup = vaultContext.PropertyVault.exportBackup(vault);
  const cipher = backup.cipher.split('');
  cipher[0] = cipher[0] === 'A' ? 'B' : 'A';
  const changedBackup = { ...backup, cipher: cipher.join('') };
  await assert.rejects(() => vaultContext.PropertyVault.unlockVault(changedBackup, vaultPassword, vaultContext.NostrTools.getPublicKey),
    /Senha incorreta ou backup inválido/, 'corrupted encrypted backup is rejected');

  const fixtureRoot = path.join(temp, 'bundle-fixture');
  const vendorDir = path.join(fixtureRoot, 'property/web/vendor');
  const webDir = path.join(fixtureRoot, 'property/web');
  const testsDir = path.join(fixtureRoot, 'property/tests');
  await mkdir(vendorDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  const originalBundle = path.join(root, 'property/web/vendor/nostr-tools-2.25.2.bundle.js');
  const mutatedBundle = Buffer.concat([await readFile(originalBundle), Buffer.from('\n// intentional isolated hash fixture mutation\n')]);
  await writeFile(path.join(vendorDir, 'nostr-tools-2.25.2.bundle.js'), mutatedBundle);
  await copyFile(path.join(root, 'property/web/routing.js'), path.join(webDir, 'routing.js'));
  await copyFile(path.join(root, 'property/tests/protocol-smoke.mjs'), path.join(testsDir, 'protocol-smoke.mjs'));
  const hashCheck = spawnSync(process.execPath, [path.join(testsDir, 'protocol-smoke.mjs')], {
    cwd: fixtureRoot, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024
  });
  const hashFailure = (hashCheck.stdout || '') + '\n' + (hashCheck.stderr || '');
  assert.notEqual(hashCheck.status, 0, 'mutated bundle fixture must fail its existing validation');
  assert.match(hashFailure, /vendored runtime hash matches recorded provenance/,
    'bundle mutation fails specifically at the recorded hash assertion');

  process.stdout.write('PASS: G01-03 detected signature, bundle hash, atomic-price and encrypted-backup mutations for the expected reasons\n');
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
