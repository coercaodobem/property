#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CYCLES = 10;
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and absolute paths.');
    const name = key.slice(2).replaceAll('-', '_');
    if (!['older_bundle', 'newer_bundle', 'trusted_key', 'output'].includes(name) || Object.hasOwn(args, name)) throw new Error(`Unsupported or duplicate option: ${key}`);
    args[name] = value;
  }
  for (const name of ['older_bundle', 'newer_bundle', 'trusted_key', 'output']) {
    if (!args[name] || !path.isAbsolute(args[name])) throw new Error(`Missing absolute --${name.replaceAll('_', '-')} path.`);
  }
  return args;
}
function run(command, args, { env = process.env, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 180_000,
    windowsHide: true, env });
  const output = (result.stdout || '').trim();
  if (!allowFailure && (result.error || result.status !== 0)) {
    const detail = (result.stderr || result.error?.message || String(result.status)).replaceAll(/[\r\n]+/g, ' ').slice(0, 500);
    throw new Error(`${command} failed: ${detail}`);
  }
  return { status: result.status, stdout: output, stderr: (result.stderr || '').trim(), error: result.error?.message || null };
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = async file => sha(await readFile(file));
async function assertAbsent(file, reason) {
  await assert.rejects(lstat(file), error => error.code === 'ENOENT', reason);
}
async function prepareCorruptFixture(source, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const name of ['release-manifest.json', 'release-manifest.sig', 'release-signing-public.pem', 'release-archive.sha256', 'release-manifest.sha256']) {
    await copyFile(path.join(source, name), path.join(destination, name));
  }
  const sourceArchive = path.join(source, 'property-ubuntu-x86_64.tar.gz');
  try { await link(sourceArchive, path.join(destination, 'property-ubuntu-x86_64.tar.gz')); }
  catch { await copyFile(sourceArchive, path.join(destination, 'property-ubuntu-x86_64.tar.gz')); }
  await writeFile(path.join(destination, 'release-manifest.sha256'), `${'0'.repeat(64)}  release-manifest.json\n`, { mode: 0o600 });
}
async function installedSha(prefix, relative) { return shaFile(path.join(prefix, 'share/property', relative)); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  const osRelease = await readFile('/etc/os-release', 'utf8');
  assert.match(osRelease, /^ID=ubuntu$/m, 'release rollback test is scoped to Ubuntu Linux x86_64');
  const older = await import('node:fs/promises').then(fs => fs.realpath(args.older_bundle));
  const newer = await import('node:fs/promises').then(fs => fs.realpath(args.newer_bundle));
  const oldManifest = JSON.parse(await readFile(path.join(older, 'release-manifest.json'), 'utf8'));
  const newManifest = JSON.parse(await readFile(path.join(newer, 'release-manifest.json'), 'utf8'));
  assert.equal(oldManifest.product, 'Property'); assert.equal(newManifest.product, 'Property');
  assert.equal(oldManifest.profile, 'ubuntu-linux-x86_64'); assert.equal(newManifest.profile, oldManifest.profile);
  assert.notEqual(oldManifest.source_commit, newManifest.source_commit, 'rollback must switch between two real source commits');
  const oldAppSha = await shaFile(path.join(older, 'property-ubuntu-x86_64.tar.gz'));
  const newAppSha = await shaFile(path.join(newer, 'property-ubuntu-x86_64.tar.gz'));
  assert.notEqual(oldAppSha, newAppSha, 'older and newer release archives must contain different versioned payloads');

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-release-rollback-'));
  const verifier = path.join(path.dirname(newer), 'unused');
  const report = { schema_version: 1, gate: 'G10', case: 'release-install-upgrade-downgrade-rollback', result: 'FAIL',
    cycles_required: CYCLES, cycles: [], older_source_commit: oldManifest.source_commit, newer_source_commit: newManifest.source_commit,
    older_archive_sha256: oldAppSha, newer_archive_sha256: newAppSha, corrupted_bundle_rejected: 0 };
  try {
    const corruptFixture = path.join(scratch, 'corrupt-checksum');
    await prepareCorruptFixture(newer, corruptFixture);
    const newExtract = path.join(scratch, 'verified-newer-payload'), oldExtract = path.join(scratch, 'verified-older-payload');
    await mkdir(newExtract, { mode: 0o700 }); await mkdir(oldExtract, { mode: 0o700 });
    const tarNew = run('tar', ['--extract', '--gzip', '--file', path.join(newer, 'property-ubuntu-x86_64.tar.gz'), '--directory', newExtract,
      '--no-same-owner', '--no-same-permissions']);
    const tarOld = run('tar', ['--extract', '--gzip', '--file', path.join(older, 'property-ubuntu-x86_64.tar.gz'), '--directory', oldExtract,
      '--no-same-owner', '--no-same-permissions']);
    assert.equal(tarNew.status, 0); assert.equal(tarOld.status, 0);
    const installScript = path.join(newExtract, 'property/release/install-offline.sh');
    const uninstallScript = path.join(newExtract, 'property/release/uninstall-offline.sh');
    const verifyScript = path.join(newExtract, 'property/release/verify-offline-bundle.mjs');
    assert.ok((await stat(installScript)).mode & 0o111, 'installer remains executable in the release archive');
    const oldAppSha = await shaFile(path.join(oldExtract, 'property/web/app.js'));
    const newAppSha = await shaFile(path.join(newExtract, 'property/web/app.js'));
    assert.notEqual(oldAppSha, newAppSha, 'upgrade and rollback must change between different PWA payloads');
    report.older_app_js_sha256 = oldAppSha; report.newer_app_js_sha256 = newAppSha;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const root = path.join(scratch, `cycle-${String(cycle).padStart(2, '0')}`);
      const home = path.join(root, 'home'), xdgData = path.join(root, 'xdg-data'), xdgConfig = path.join(root, 'xdg-config');
      const relayData = path.join(root, 'relay-data'), relayConfig = path.join(root, 'relay-config'), prefix = path.join(root, 'prefix');
      const env = { ...process.env, HOME: home, XDG_DATA_HOME: xdgData, XDG_CONFIG_HOME: xdgConfig,
        PROPERTY_RELAY_DATA_DIR: relayData, PROPERTY_RELAY_CONFIG_DIR: relayConfig, LC_ALL: 'C', LANG: 'C', TZ: 'UTC' };
      await mkdir(home, { recursive: true, mode: 0o700 });
      const invalidPrefix = path.join(root, 'must-stay-absent');
      const corruptInstall = run('bash', [installScript, '--bundle', corruptFixture, '--trusted-key', args.trusted_key, '--prefix', invalidPrefix], { env, allowFailure: true });
      assert.notEqual(corruptInstall.status, 0, `cycle ${cycle} rejects the checksum-tampered package`);
      await assertAbsent(invalidPrefix, `cycle ${cycle} corrupt bundle must fail before creating an install prefix`);
      report.corrupted_bundle_rejected++;

      run('node', [verifyScript, '--bundle', older, '--public-key', args.trusted_key], { env });
      run('bash', [installScript, '--bundle', older, '--trusted-key', args.trusted_key, '--prefix', prefix], { env });
      const installedOldBefore = await installedSha(prefix, 'web/app.js');
      assert.equal(installedOldBefore, oldAppSha, `cycle ${cycle} installs exact old PWA asset`);

      const agentData = path.join(xdgData, 'property/agents/default');
      await mkdir(agentData, { recursive: true, mode: 0o700 });
      await writeFile(path.join(agentData, 'user-state'), `agent-state-${cycle}\n`, { mode: 0o600 });
      await mkdir(relayData, { recursive: true, mode: 0o700 });
      await mkdir(relayConfig, { recursive: true, mode: 0o700 });
      await writeFile(path.join(relayData, 'user-state'), `relay-state-${cycle}\n`, { mode: 0o600 });
      await writeFile(path.join(relayConfig, 'user-state'), `relay-config-${cycle}\n`, { mode: 0o600 });

      run('node', [verifyScript, '--bundle', newer, '--public-key', args.trusted_key], { env });
      run('bash', [installScript, '--bundle', newer, '--trusted-key', args.trusted_key, '--prefix', prefix], { env });
      const installedNewSha = await installedSha(prefix, 'web/app.js');
      assert.equal(installedNewSha, newAppSha, `cycle ${cycle} updates to exact new PWA asset`);

      run('node', [verifyScript, '--bundle', older, '--public-key', args.trusted_key], { env });
      run('bash', [installScript, '--bundle', older, '--trusted-key', args.trusted_key, '--prefix', prefix], { env });
      assert.equal(await installedSha(prefix, 'web/app.js'), installedOldBefore, `cycle ${cycle} rolls back to the previous PWA asset`);
      assert.equal(await readFile(path.join(agentData, 'user-state'), 'utf8'), `agent-state-${cycle}\n`);
      assert.equal(await readFile(path.join(relayData, 'user-state'), 'utf8'), `relay-state-${cycle}\n`);
      assert.equal(await readFile(path.join(relayConfig, 'user-state'), 'utf8'), `relay-config-${cycle}\n`);

      run('bash', [uninstallScript, prefix], { env });
      await assertAbsent(path.join(prefix, 'share/property/web'), `cycle ${cycle} uninstall removes installed PWA files`);
      await assertAbsent(path.join(prefix, 'share/property/relay'), `cycle ${cycle} uninstall removes installed relay files`);
      assert.equal(await readFile(path.join(agentData, 'user-state'), 'utf8'), `agent-state-${cycle}\n`, `cycle ${cycle} uninstall preserves agent data`);
      assert.equal(await readFile(path.join(relayData, 'user-state'), 'utf8'), `relay-state-${cycle}\n`, `cycle ${cycle} uninstall preserves relay data`);
      assert.equal(await readFile(path.join(relayConfig, 'user-state'), 'utf8'), `relay-config-${cycle}\n`, `cycle ${cycle} uninstall preserves relay config`);
      report.cycles.push({ cycle, profile_started_empty: true, install_older_verified: true, upgrade_newer_verified: true,
        downgrade_rollback_verified: true, agent_relay_data_and_config_preserved: true, corrupted_package_rejected_before_write: true,
        clean_uninstall: true });
    }
    assert.equal(report.cycles.length, CYCLES); assert.equal(report.corrupted_bundle_rejected, CYCLES);
    report.result = 'PASS';
    await mkdir(args.output, { recursive: true, mode: 0o700 });
    await writeFile(path.join(args.output, 'release-install-rollback-cycles.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => { process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 1000)}\n`); process.exitCode = 1; });
