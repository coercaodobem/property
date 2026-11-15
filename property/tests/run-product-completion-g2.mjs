#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
  const required = ['signing_key', 'playwright_module', 'browser_executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'evidence_dir'];
  for (const name of required) if (!args[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  for (const name of ['signing_key', 'playwright_module', 'browser_executable', 'evidence_dir']) {
    if (!path.isAbsolute(args[name])) throw new Error(`--${name.replaceAll('_', '-')} must be an absolute path.`);
  }
  return args;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 1_800_000,
    windowsHide: true, env: { ...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC', ...options.env }, ...options });
  if (result.error || result.status !== 0) {
    const message = `${result.stderr || result.error?.message || result.status || 'unknown'}`.replaceAll(/[\r\n]+/g, ' ').slice(0, 800);
    throw new Error(`${command} failed: ${message}`);
  }
  return result.stdout || '';
}
async function ensureEmpty(target) {
  try {
    const entries = await readdir(target);
    assert.equal(entries.length, 0, `Evidence directory must be empty: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function hashFiles(directory) {
  const rows = [];
  for (const name of (await readdir(directory)).sort()) {
    const bytes = await readFile(path.join(directory, name));
    rows.push({ name, bytes: bytes.length, sha256: sha(bytes) });
  }
  return rows;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  const osRelease = await readFile('/etc/os-release', 'utf8');
  assert.match(osRelease, /^ID=ubuntu$/m, 'G2 release packaging runs only on Ubuntu');
  const evidence = path.resolve(args.evidence_dir);
  await ensureEmpty(evidence);

  const candidate = run('git', ['-C', ROOT, 'rev-parse', 'HEAD']).trim();
  const worktreeStatus = run('git', ['-C', ROOT, 'status', '--porcelain', '--untracked-files=no']);
  assert.equal(worktreeStatus.trim(), '', 'G2 requires a committed candidate; unrelated untracked files stay outside both release worktrees.');
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-product-g2-'));
  const firstSource = path.join(scratch, 'worktree-a');
  const secondSource = path.join(scratch, 'worktree-b');
  const firstBundle = path.join(scratch, 'bundle-a');
  const secondBundle = path.join(scratch, 'bundle-b');
  const evidenceFiles = [];
  let worktreesAdded = [];
  try {
    run('git', ['-C', ROOT, 'worktree', 'add', '--detach', firstSource, candidate]);
    worktreesAdded.push(firstSource);
    run('git', ['-C', ROOT, 'worktree', 'add', '--detach', secondSource, candidate]);
    worktreesAdded.push(secondSource);
    for (const source of [firstSource, secondSource]) {
      assert.equal(run('git', ['-C', source, 'rev-parse', 'HEAD']).trim(), candidate);
      assert.equal(run('git', ['-C', source, 'status', '--porcelain', '--untracked-files=all']).trim(), '');
    }

    const build = source => run('node', [path.join(source, 'property/release/build-offline-bundle.mjs'),
      '--source', source, '--output', source === firstSource ? firstBundle : secondBundle, '--signing-key', args.signing_key]);
    const firstBuild = JSON.parse(build(firstSource).trim());
    const secondBuild = JSON.parse(build(secondSource).trim());
    assert.equal(firstBuild.result, 'PASS');
    assert.equal(secondBuild.result, 'PASS');
    const firstHashes = await hashFiles(firstBundle);
    const secondHashes = await hashFiles(secondBundle);
    assert.deepEqual(secondHashes, firstHashes, 'all reproducible release artifacts must match byte-for-byte');
    evidenceFiles.push({ file: 'reproducible-builds.json', data: { result: 'PASS', worktrees: 2, source_commit: candidate,
      artifact_hashes: firstHashes, byte_identical: true, build_a: firstBuild, build_b: secondBuild } });

    const publicKey = path.join(firstBundle, 'release-signing-public.pem');
    run('node', [path.join(firstSource, 'property/release/verify-offline-bundle.mjs'), '--bundle', firstBundle, '--public-key', publicKey]);

    const unpacked = path.join(scratch, 'unpacked');
    await mkdir(unpacked, { mode: 0o700 });
    run('tar', ['--extract', '--gzip', '--file', path.join(firstBundle, 'property-ubuntu-x86_64.tar.gz'), '--directory', unpacked,
      '--no-same-owner', '--no-same-permissions']);
    const releaseManifest = path.join(firstBundle, 'release-manifest.json');
    const browserOutput = path.join(scratch, 'browser-report');
    const browserReport = JSON.parse(run('node', [path.join(firstSource, 'property/tests/offline/release-browser-egress-smoke.mjs'),
      '--web-root', path.join(unpacked, 'property/web'), '--manifest', releaseManifest,
      '--playwright-module', args.playwright_module, '--executable', args.browser_executable,
      '--playwright-version', args.playwright_version, '--browser-version', args.browser_version,
      '--playwright-package-sha256', args.playwright_package_sha256, '--browser-executable-sha256', args.browser_executable_sha256,
      '--output', browserOutput]).trim());
    evidenceFiles.push({ file: 'browser-egress-report.json', data: browserReport });

    const packageOutput = path.join(scratch, 'package-report');
    const packageReport = JSON.parse(run('node', [path.join(firstSource, 'property/tests/release-offline-package-smoke.mjs'),
      '--bundle', firstBundle, '--trusted-key', publicKey, '--output', packageOutput]).trim());
    evidenceFiles.push({ file: 'offline-package-report.json', data: packageReport });

    const policyOutput = JSON.parse(run('node', [path.join(firstSource, 'property/tests/release-metadata-policy-smoke.mjs')]).trim());
    evidenceFiles.push({ file: 'metadata-policy-report.json', data: policyOutput });

    await mkdir(evidence, { recursive: true, mode: 0o700 });
    for (const entry of evidenceFiles) await writeFile(path.join(evidence, entry.file), `${JSON.stringify(entry.data, null, 2)}\n`, { mode: 0o600 });
    const report = { schema_version: 1, gate: 'G2', result: 'PASS', source_commit: candidate, operating_system: 'Ubuntu Linux x86_64',
      criteria: { two_clean_worktree_builds: 'PASS', artifact_hashes_identical: 'PASS', local_browser_egress_and_executable_loads: 'PASS',
        missing_bundle_member_rejected_before_install: 'PASS', altered_checksum_rejected_before_install: 'PASS',
        sbom_license_provenance_coverage: 'PASS', fail_closed_metadata_policy: 'PASS', offline_install_update_cli_and_uninstall: 'PASS',
        secret_and_generated_file_scan: 'PASS' },
      artifact_hashes: firstHashes, evidence_files: evidenceFiles.map(entry => entry.file) };
    await writeFile(path.join(evidence, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    for (const worktree of [...worktreesAdded].reverse()) {
      try { run('git', ['-C', ROOT, 'worktree', 'remove', '--force', worktree]); } catch {}
    }
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
