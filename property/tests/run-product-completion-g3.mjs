#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = value => createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate option ${key}.`);
    args[name] = value;
  }
  for (const name of ['playwright_module', 'browser_executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'evidence_dir']) {
    if (!args[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  for (const name of ['playwright_module', 'browser_executable', 'evidence_dir']) {
    if (!path.isAbsolute(args[name])) throw new Error(`--${name.replaceAll('_', '-')} must be an absolute path.`);
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    timeout: 180_000, windowsHide: true, env: { ...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC' }, ...options });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || result.status || 'unknown').replaceAll(/[\r\n]+/g, ' ').slice(0, 900);
    throw new Error(`${command} failed: ${detail}`);
  }
  return result.stdout || '';
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.match(await readFile('/etc/os-release', 'utf8'), /^ID=ubuntu$/m);
  const evidence = path.resolve(args.evidence_dir);
  try { assert.equal((await readdir(evidence)).length, 0, 'G3 evidence directory must be empty'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const candidate = run('git', ['rev-parse', 'HEAD']).trim();
  assert.equal(run('git', ['status', '--porcelain', '--untracked-files=no']).trim(), '', 'G3 requires the committed candidate');
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-product-g3-'));
  try {
    const unitPath = path.join(scratch, 'identity-vault-report.json');
    const unitRun = run('node', ['property/tests/identity-vault-g3-smoke.mjs', unitPath]);
    const unitSummary = JSON.parse(unitRun.trim().split('\n').at(-1));
    const { report_path: _temporaryReportPath, ...sanitizedUnitSummary } = unitSummary;
    const unit = JSON.parse(await readFile(unitPath, 'utf8'));
    assert.equal(unit.gate, 'G3'); assert.equal(unit.result, 'PASS');
    assert.equal(unit.identity_cycles.completed, 30);
    assert.equal(unit.identity_cycles.wrong_password_fail_closed, 30);
    assert.equal(unit.identity_cycles.tampered_vault_fail_closed, 30);
    assert.equal(unit.backup_restore_cycles.completed, 20);
    assert.equal(unit.backup_restore_cycles.relay_preference_hashes_preserved, 20);
    assert.equal(unit.backup_restore_cycles.opted_in_local_contact_hashes_preserved, 20);
    assert.equal(unit.signed_handle_collisions.completed, 20);

    const browserDirectory = path.join(scratch, 'browser');
    const browserOutput = run('node', ['property/tests/offline/browser-g03-smoke.mjs',
      '--playwright-module', args.playwright_module, '--engine', 'chromium', '--executable', args.browser_executable,
      '--playwright-version', args.playwright_version, '--browser-version', args.browser_version,
      '--playwright-package-sha256', args.playwright_package_sha256,
      '--browser-executable-sha256', args.browser_executable_sha256, '--output', browserDirectory]);
    const browserSummary = JSON.parse(browserOutput.trim().split('\n').at(-1));
    const browser = JSON.parse(await readFile(path.join(browserDirectory, 'browser-g03-report.json'), 'utf8'));
    assert.equal(browserSummary.result, 'PASS'); assert.equal(browser.result, 'PASS');
    assert.equal(browser.cases.length, 9); assert.ok(browser.cases.every(item => item.status === 'PASS'));
    assert.equal(browser.journey_matrix.required, 25); assert.equal(browser.journey_matrix.completed, 25);
    assert.deepEqual(browser.journey_matrix.categories, { fresh_install: 4, returning_session: 4, manual_lock_unlock: 4,
      encrypted_backup_restore: 4, corrupted_vault: 4, no_relays_offline_send: 3, storage_denied: 2 });
    assert.equal(browser.identity_accessibility.english_portuguese_label_parity, true);
    assert.equal(browser.identity_accessibility.unnamed_identity_controls, 0);
    assert.equal(browser.external_requests.length, 0);
    assert.equal(browser.page_errors.length, 0);
    assert.equal(browser.privacy.completed_external_requests, 0);
    assert.equal(browser.privacy.denied_proxy_blocked_all_observed_egress, true);
    const reportText = JSON.stringify({ unit, browser });
    assert.doesNotMatch(reportText, /nsec1|github_pat_|gh[pousr]_[A-Za-z0-9_]{20,}/i, 'evidence must not contain credentials or private-key encodings');

    await mkdir(evidence, { recursive: true, mode: 0o700 });
    await writeJson(evidence, 'identity-vault-report.json', unit);
    await writeJson(evidence, 'browser-g03-report.json', browser);
    const evidenceFiles = [];
    for (const file of ['identity-vault-report.json', 'browser-g03-report.json']) {
      const bytes = await readFile(path.join(evidence, file));
      evidenceFiles.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
    }
    const manifest = { schema_version: 1, gate: 'G3', result: 'PASS', source_commit: candidate,
      operating_system: 'Ubuntu Linux x86_64', runtime: { node: process.version, browser: browser.browser },
      criteria: { fixed_identity_password_and_tamper_cycles: 'PASS', encrypted_backup_and_restore_cycles: 'PASS',
        signed_display_name_collision_fixtures: 'PASS', '25_fixed_browser_journeys': 'PASS',
        identity_and_recovery_accessibility_en_pt: 'PASS', keyboard_navigation: 'PASS',
        fail_closed_with_no_relays_or_denied_storage: 'PASS', offline_egress_and_secret_checks: 'PASS' },
      counts: { identity_cycles: unit.identity_cycles.completed, backup_restore_cycles: unit.backup_restore_cycles.completed,
        signed_handle_collisions: unit.signed_handle_collisions.completed, browser_journeys: browser.journey_matrix.completed },
      evidence_files: evidenceFiles, unit_summary: sanitizedUnitSummary, browser_cases: browser.cases.map(item => item.case) };
    await writeJson(evidence, 'manifest.json', manifest);
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
  } finally { await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
