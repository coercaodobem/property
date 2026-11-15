#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const value = argv[++i];
    if (!raw?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = raw.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate option ${raw}.`);
    args[name] = value;
  }
  for (const name of ['bundle', 'trusted_key', 'output']) if (!args[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  if (![args.bundle, args.trusted_key, args.output].every(path.isAbsolute)) throw new Error('Bundle, trusted key, and output must be absolute paths.');
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 1_800_000, windowsHide: true, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || null };
}

function requirePass(result, label) {
  assert.equal(result.status, 0, `${label} failed: ${(result.stderr || result.error || '').replaceAll(/[\r\n]+/g, ' ').slice(0, 500)}`);
  return result.stdout.trim();
}

async function assertAbsent(target, label) {
  await assert.rejects(lstat(target), error => error.code === 'ENOENT', `${label} must not be created before bundle verification`);
}

async function prepareTamperedChecksumFixture(source, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const name of ['release-manifest.json', 'release-manifest.sig', 'release-signing-public.pem', 'release-archive.sha256']) {
    await copyFile(path.join(source, name), path.join(destination, name));
  }
  await copyFile(path.join(source, 'release-manifest.sha256'), path.join(destination, 'release-manifest.sha256'));
  const sourceArchive = path.join(source, 'property-ubuntu-x86_64.tar.gz');
  const destinationArchive = path.join(destination, 'property-ubuntu-x86_64.tar.gz');
  try { await link(sourceArchive, destinationArchive); }
  catch { await copyFile(sourceArchive, destinationArchive); }
  await writeFile(path.join(destination, 'release-manifest.sha256'), `${'0'.repeat(64)}  release-manifest.json\n`, { mode: 0o600 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert.equal(process.platform, 'linux', 'offline package smoke is scoped to Linux');
  assert.equal(process.arch, 'x64', 'offline package smoke is scoped to Linux x86_64');
  const bundle = await import('node:fs/promises').then(fs => fs.realpath(args.bundle));
  const manifest = JSON.parse(await readFile(path.join(bundle, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.product, 'Property');
  assert.equal(manifest.profile, 'ubuntu-linux-x86_64');
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-g2-package-'));
  const report = { schema_version: 1, gate: 'G2', result: 'FAIL', source_commit: manifest.source_commit, cases: [] };
  try {
    const missingFixture = path.join(scratch, 'missing-required-signature');
    await mkdir(missingFixture, { mode: 0o700 });
    await copyFile(path.join(bundle, 'release-manifest.json'), path.join(missingFixture, 'release-manifest.json'));
    const missingPrefix = path.join(scratch, 'missing-prefix');
    const extracted = path.join(scratch, 'payload');
    await mkdir(extracted, { mode: 0o700 });
    const extract = run('tar', ['--extract', '--gzip', '--file', path.join(bundle, 'property-ubuntu-x86_64.tar.gz'), '--directory', extracted,
      '--no-same-owner', '--no-same-permissions']);
    requirePass(extract, 'valid release archive extraction');
    const installScript = path.join(extracted, 'property/release/install-offline.sh');
    const verifier = path.join(extracted, 'property/release/verify-offline-bundle.mjs');
    const uninstallScript = path.join(extracted, 'property/release/uninstall-offline.sh');
    assert.ok((await stat(installScript)).mode & 0o111, 'release installer is not executable in the archive');

    const invalidEnv = { ...process.env, HOME: path.join(scratch, 'home-invalid') };
    const missingInstall = run('bash', [installScript, '--bundle', missingFixture, '--trusted-key', args.trusted_key,
      '--prefix', missingPrefix], { env: invalidEnv });
    assert.notEqual(missingInstall.status, 0, 'installer accepted a bundle missing a required signature file');
    await assertAbsent(missingPrefix, 'invalid signature fixture prefix');
    report.cases.push({ id: 'missing-required-signature', result: 'PASS', installer_rejected: true, prefix_created: false });

    const checksumFixture = path.join(scratch, 'altered-manifest-checksum');
    await prepareTamperedChecksumFixture(bundle, checksumFixture);
    const checksumPrefix = path.join(scratch, 'checksum-prefix');
    const checksumInstall = run('bash', [installScript, '--bundle', checksumFixture, '--trusted-key', args.trusted_key,
      '--prefix', checksumPrefix], { env: invalidEnv });
    assert.notEqual(checksumInstall.status, 0, 'installer accepted a changed manifest checksum');
    await assertAbsent(checksumPrefix, 'altered checksum fixture prefix');
    report.cases.push({ id: 'altered-manifest-checksum', result: 'PASS', installer_rejected: true, prefix_created: false });

    const policyModule = path.join(extracted, 'property/release/metadata-policy.mjs');
    const policy = await import(pathToFileURL(policyModule).href);
    assert.throws(() => policy.assertKnownLicense('NOASSERTION', 'negative test fixture'), /Unknown license blocks release/);
    assert.throws(() => policy.assertCompleteProvenance({ component: 'fixture', license: 'MIT' }, 'negative test fixture'), /Missing source provenance blocks release/);
    report.cases.push({ id: 'unknown-license-or-provenance', result: 'PASS', license_rejected: true, missing_provenance_rejected: true });

    const home = path.join(scratch, 'home');
    const dataHome = path.join(scratch, 'xdg-data');
    const configHome = path.join(scratch, 'xdg-config');
    const relayData = path.join(scratch, 'relay-data');
    const relayConfig = path.join(scratch, 'relay-config');
    const prefix = path.join(scratch, 'prefix');
    const env = { ...process.env, HOME: home, XDG_DATA_HOME: dataHome, XDG_CONFIG_HOME: configHome,
      PROPERTY_RELAY_DATA_DIR: relayData, PROPERTY_RELAY_CONFIG_DIR: relayConfig };
    await mkdir(home, { recursive: true, mode: 0o700 });
    requirePass(run('bash', [installScript, '--bundle', bundle, '--trusted-key', args.trusted_key, '--prefix', prefix], { env }), 'first offline install');
    const agentVersion = requirePass(run(path.join(prefix, 'bin/property-agent'), ['--version'], { env }), 'installed agent CLI');
    assert.match(agentVersion, /^property-agent /);
    const geodeVersion = requirePass(run(path.join(prefix, 'share/property/relay/dist/geode/bin/geode'), ['--version'], { env }), 'bundled relay CLI');
    assert.match(geodeVersion, /geode 1\.20\.0/i);
    const agentData = path.join(dataHome, 'property/agents/default');
    await mkdir(agentData, { recursive: true, mode: 0o700 });
    await writeFile(path.join(agentData, 'test-preserved-marker'), 'synthetic-agent-state\n', { mode: 0o600 });
    await mkdir(relayData, { recursive: true, mode: 0o700 });
    await writeFile(path.join(relayData, 'test-preserved-marker'), 'synthetic-relay-state\n', { mode: 0o600 });
    requirePass(run('bash', [installScript, '--bundle', bundle, '--trusted-key', args.trusted_key, '--prefix', prefix], { env }), 'offline update');
    assert.equal(await readFile(path.join(agentData, 'test-preserved-marker'), 'utf8'), 'synthetic-agent-state\n');
    assert.equal(await readFile(path.join(relayData, 'test-preserved-marker'), 'utf8'), 'synthetic-relay-state\n');
    const uninstall = run('bash', [uninstallScript, prefix], { env });
    requirePass(uninstall, 'offline uninstall');
    await assertAbsent(path.join(prefix, 'share/property/web'), 'installed PWA after uninstall');
    await assertAbsent(path.join(prefix, 'share/property/relay'), 'installed relay after uninstall');
    assert.equal(await readFile(path.join(agentData, 'test-preserved-marker'), 'utf8'), 'synthetic-agent-state\n');
    assert.equal(await readFile(path.join(relayData, 'test-preserved-marker'), 'utf8'), 'synthetic-relay-state\n');
    report.cases.push({ id: 'offline-install-update-uninstall', result: 'PASS', installs: 2, agent_cli: agentVersion,
      relay_cli: geodeVersion, agent_state_preserved: true, relay_state_preserved: true, uninstall_preserved_data: true });
    report.result = 'PASS';
    await mkdir(args.output, { recursive: true, mode: 0o700 });
    await writeFile(path.join(args.output, 'offline-package-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 900)}\n`);
  process.exitCode = 1;
});
