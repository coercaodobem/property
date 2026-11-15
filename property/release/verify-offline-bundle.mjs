#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { assertCompleteProvenance } from './metadata-policy.mjs';

const ARCHIVE = 'property-ubuntu-x86_64.tar.gz';

function argsFor(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    const value = argv[++index];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected --bundle and --public-key values.');
    const key = name.slice(2);
    if (!['bundle', 'public-key'].includes(key) || Object.hasOwn(args, key)) throw new Error(`Unsupported or duplicate option ${name}`);
    args[key] = path.resolve(value);
  }
  if (!args.bundle || !args['public-key']) throw new Error('Usage: node property/release/verify-offline-bundle.mjs --bundle DIR --public-key TRUSTED_PEM');
  return { bundle: args.bundle, publicKeyPath: args['public-key'] };
}

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.error?.message || result.status || 'unknown').trim().slice(0, 600)}`);
  return result.stdout || '';
}

async function filesUnder(root) {
  const rows = [];
  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Bundle contains a symbolic link: ${relative}`);
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) {
        const bytes = await readFile(absolute);
        rows.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
      } else throw new Error(`Bundle contains a non-regular path: ${relative}`);
    }
  }
  await walk(root);
  return rows;
}

async function requireRegular(root, name) {
  const target = path.join(root, name);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Required bundle file is missing or unsafe: ${name}`);
  return target;
}

async function main() {
  const { bundle, publicKeyPath } = argsFor(process.argv.slice(2));
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This verifier runs only on Ubuntu/Linux x86_64.');
  const manifestPath = await requireRegular(bundle, 'release-manifest.json');
  const signaturePath = await requireRegular(bundle, 'release-manifest.sig');
  const archivePath = await requireRegular(bundle, ARCHIVE);
  const manifestHashPath = await requireRegular(bundle, 'release-manifest.sha256');
  const archiveHashPath = await requireRegular(bundle, 'release-archive.sha256');
  const bundledPublicKeyPath = await requireRegular(bundle, 'release-signing-public.pem');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.product, 'Property');
  assert.equal(manifest.profile, 'ubuntu-linux-x86_64');
  assert.equal(manifest.artifacts.find(item => item.name === ARCHIVE)?.name, ARCHIVE);
  const trustedPublicKey = createPublicKey(await readFile(publicKeyPath));
  const fingerprint = sha(trustedPublicKey.export({ type: 'spki', format: 'der' }));
  assert.equal(fingerprint, manifest.signer.public_key_sha256, 'trusted release key fingerprint differs');
  const bundledPublicKey = createPublicKey(await readFile(bundledPublicKeyPath));
  assert.equal(sha(bundledPublicKey.export({ type: 'spki', format: 'der' })), fingerprint, 'bundle public key differs from the separately trusted key');
  const signatureText = (await readFile(signaturePath, 'utf8')).trim();
  const signature = Buffer.from(signatureText, 'base64');
  assert.ok(signature.length === 64, 'Ed25519 signature has an invalid length');
  assert.equal(verify(null, manifestBytes, trustedPublicKey, signature), true, 'release manifest signature is invalid');
  assert.equal((await readFile(manifestHashPath, 'utf8')).trim(), `${sha(manifestBytes)}  release-manifest.json`, 'manifest checksum does not match');
  const archiveBytes = await readFile(archivePath);
  const archiveRecord = manifest.artifacts.find(item => item.name === ARCHIVE);
  assert.equal(archiveBytes.length, archiveRecord.bytes, 'release archive size differs from manifest');
  assert.equal(sha(archiveBytes), archiveRecord.sha256, 'release archive hash differs from signed manifest');
  assert.equal((await readFile(archiveHashPath, 'utf8')).trim(), `${archiveRecord.sha256}  ${ARCHIVE}`, 'detached release archive checksum differs');

  const names = run('tar', ['-tzf', archivePath]).split(/\r?\n/).filter(Boolean);
  for (const entry of names) {
    const normalized = entry.replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized || normalized === '.') continue;
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`Unsafe path in release archive: ${entry}`);
  }
  const verbose = run('tar', ['-tvzf', archivePath]).split(/\r?\n/).filter(Boolean);
  if (verbose.some(line => !['-', 'd'].includes(line[0]))) throw new Error('Release archive contains a link or non-regular entry.');
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-release-verify-'));
  try {
    run('tar', ['--extract', '--gzip', '--file', archivePath, '--directory', scratch, '--no-same-owner', '--no-same-permissions']);
    const actual = await filesUnder(scratch);
    const expected = [...manifest.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    assert.equal(actual.length, expected.length, 'release archive has a missing or unmanifested file');
    const actualByPath = new Map(actual.map(row => [row.path.replace(/^\.\//, ''), row]));
    for (const file of expected) {
      assertCompleteProvenance(file, file.path);
      const found = actualByPath.get(file.path);
      assert.ok(found, `release archive is missing ${file.path}`);
      assert.equal(found.bytes, file.bytes, `release file size mismatch: ${file.path}`);
      assert.equal(found.sha256, file.sha256, `release file hash mismatch: ${file.path}`);
    }
    assert.equal(manifest.file_count, expected.length, 'signed manifest file count differs');

    const sbomRecord = manifest.artifacts.find(item => item.name === 'SBOM.spdx.json');
    assert.ok(sbomRecord, 'signed manifest has no SBOM record');
    const sbomPath = path.join(scratch, 'property/release/SBOM.spdx.json');
    const sbomBytes = await readFile(sbomPath);
    assert.equal(sbomBytes.length, sbomRecord.bytes);
    assert.equal(sha(sbomBytes), sbomRecord.sha256, 'SBOM hash differs from signed manifest');
    const sbom = JSON.parse(sbomBytes.toString('utf8'));
    assert.equal(sbom.spdxVersion, 'SPDX-2.3');
    const sbomFiles = new Map(sbom.files.map(file => [file.fileName.replace(/^\.\//, ''), file]));
    assert.equal(sbomFiles.size, expected.length, 'SBOM file coverage differs from the release archive');
    for (const file of expected) {
      const listed = sbomFiles.get(file.path);
      assert.ok(listed, `SBOM omits release file ${file.path}`);
      assert.equal(listed.licenseConcluded, file.license, `SBOM license mismatch: ${file.path}`);
      assert.ok(listed.licenseInfoInFiles.includes(file.license), `SBOM file license is not explicit: ${file.path}`);
      if (file.path !== 'property/release/SBOM.spdx.json') {
        assert.equal(listed.checksums?.find(item => item.algorithm === 'SHA256')?.checksumValue, file.sha256,
          `SBOM file checksum mismatch: ${file.path}`);
      }
    }
    process.stdout.write(`${JSON.stringify({ result: 'PASS', source_commit: manifest.source_commit, profile: manifest.profile,
      public_key_sha256: fingerprint, manifest_sha256: sha(manifestBytes), archive_sha256: archiveRecord.sha256,
      files_verified: expected.length, sbom_files: sbomFiles.size, sbom_licenses: '100% explicit' })}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 900)}\n`);
  process.exitCode = 1;
});
