#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OFFLINE = path.join(ROOT, 'property/tests/offline');
const G4_BROWSER_CASES = ['G04-01', 'G04-02', 'G04-25', 'G04-11', 'G04-12', 'G04-14', 'G04-22', 'G04-23', 'G04-24', 'G04-09',
  'G04-15', 'G04-16', 'G04-17', 'G04-18', 'G04-19', 'G04-20', 'G04-21', 'G04-13', 'G04-03', 'G04-04', 'G04-05', 'G04-06', 'G04-26', 'G04-27'];
const G4_RELAY_CASES = ['G04-PARTITION-40', 'G04-PUBLIC-100', 'G04-CONFLICT-20', 'G04-PRIVATE-1500', 'G04-FAILURES-10-EACH', 'G04-RESTART-10-RETRY-20'];
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
const redact = value => String(value || '').replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|nsec1[a-z0-9]{20,})/gi, '[REDACTED]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(-12000);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Use named options with values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option ${key}.`);
    options[name] = value;
  }
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (options.engine !== 'chromium') throw new Error('G4 requires the pinned Chromium test runner.');
  return options;
}

async function sha256(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function trackedChanges() {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not inspect candidate status: ${redact(result.stderr)}`);
  return result.stdout.trim();
}
function runStep(name, script, args, env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { step: name, exit_code: result.status ?? 1, signal: result.signal || null,
    stdout: redact(result.stdout), stderr: redact(result.stderr) };
}
async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new Error(`Missing or invalid report ${path.basename(file)}: ${redact(error.message)}`); }
}
function assertCases(report, expected, label) {
  assert.equal(report?.result, 'PASS', `${label} did not pass`);
  assert.deepEqual((report.cases || []).map(item => item.case).sort(), [...expected].sort(), `${label} case inventory differs from the G4 plan`);
  assert.ok(report.cases.every(item => item.status === 'PASS'), `${label} contains a non-PASS case`);
}

async function main() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.match(await readFile('/etc/os-release', 'utf8'), /^ID=ubuntu$/m, 'G4 is restricted to Ubuntu x86_64');
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'G4 uses Node.js 22 or newer');
  const options = parseArgs(process.argv.slice(2));
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  assert.deepEqual(await readdir(output), [], 'write G4 evidence only to a fresh empty directory');

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(head.status, 0);
  const candidate = head.stdout.trim();
  const workingTree = await trackedChanges();
  assert.equal(workingTree, '', 'commit the exact product/test candidate before running G4');
  const env = { ...process.env };
  for (const key of proxyKeys) delete env[key];
  const browserArgs = ['--playwright-module', options.playwright_module, '--engine', options.engine,
    '--executable', options.executable, '--playwright-version', options.playwright_version,
    '--browser-version', options.browser_version, '--playwright-package-sha256', options.playwright_package_sha256,
    '--browser-executable-sha256', options.browser_executable_sha256, '--output', output];
  const steps = [
    runStep('message-delivery', path.join(OFFLINE, 'message-delivery-g4-smoke.mjs'), [path.join(output, 'message-delivery-report.json')], env),
    runStep('isolated-relay-matrix', path.join(OFFLINE, 'product-completion-g4-relay-smoke.mjs'), ['--output', output], env),
    runStep('browser-and-pwa', path.join(OFFLINE, 'browser-g04-smoke.mjs'), browserArgs, env)
  ];
  const helper = await readJson(path.join(output, 'message-delivery-report.json'));
  const relay = await readJson(path.join(output, 'relay-fixed-count-report.json'));
  const browser = await readJson(path.join(output, 'browser-g04-report.json'));
  assertCases(helper, ['G04-ACK-01', 'G04-STATE-01', 'G04-RETRY-01', 'G04-BLOCK-10', 'G04-ROTATION-10'], 'message delivery helper');
  assertCases(relay, G4_RELAY_CASES, 'five-relay matrix');
  assert.equal(relay.predefined_variables.synthetic_identities, 6);
  assert.equal(relay.predefined_variables.isolated_relays, 5);
  assert.equal(relay.predefined_variables.private_messages_per_ordered_identity_pair, 50);
  assert.equal(relay.private_messages.total_private_messages, 1500);
  assert.equal(relay.private_messages.unauthorized_decryptions, 0);
  assert.equal(relay.public_events.count, 100);
  assert.equal(relay.partition_recovery.transitions_completed, 40);
  assert.equal(relay.conflicts.conflicting_update_count, 20);
  assert.equal(relay.restart_retry.total_restarts, 10);
  assert.equal(relay.restart_retry.retry_fixtures, 20);
  for (const category of ['malformed_envelope', 'unavailable_relay', 'oversized_event', 'duplicate_relay_response']) {
    assert.equal(relay.failure_fixtures[category].count, 10, `${category} fixture count`);
  }
  assertCases(browser, G4_BROWSER_CASES, 'browser suite');
  assert.equal(browser.offline_shell.shell_opens.length, 10);
  assert.equal(browser.local_relay_shell.shell_opens.length, 10);
  assert.equal(browser.offline_shell.application_host_removed, true);
  assert.equal(browser.local_relay_shell.application_host_removed, true);
  assert.equal(browser.local_relay_shell.available_relay_count, 1);
  assert.equal(browser.local_relay_shell.all_websocket_targets_loopback, true);

  for (const step of steps) assert.equal(step.exit_code, 0, `${step.step} subprocess failed`);
  assert.deepEqual(await trackedChanges(), '', 'tracked source changed while G4 was running');
  const currentHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(currentHead.stdout.trim(), candidate, 'all G4 reports must belong to one committed candidate');

  const sourcePaths = ['property/web/app.js', 'property/web/index.html', 'property/web/sw.js', 'property/web/routing.js',
    'property/web/protocol-contract.js', 'property/web/public-profile.js', 'property/web/marketplace.js', 'property/web/money.js',
    'property/tests/offline/browser-g04-smoke.mjs', 'property/tests/offline/message-delivery-g4-smoke.mjs',
    'property/tests/offline/product-completion-g4-relay-smoke.mjs'];
  const sourceDigests = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, await sha256(path.join(ROOT, file))])));
  const evidence = { schema_version: 1, gate: 'G4', result: 'PASS', candidate_commit: candidate,
    operating_system: 'Ubuntu Linux x86_64', node_version: process.version,
    browser: { engine: options.engine, playwright_version: options.playwright_version, browser_version: options.browser_version,
      playwright_package_sha256: options.playwright_package_sha256, browser_executable_sha256: options.browser_executable_sha256 },
    fixed_acceptance: { identities: 6, isolated_relays: 5, relay_groups: 3, private_messages_per_direction: 50,
      private_messages_total: 1500, public_events: 100, partitioned_transitions: 40, conflicting_profile_and_offer_updates: 20,
      restarts_per_relay: 2, retry_fixtures: 20, failure_fixtures_per_category: 10,
      pwa_opens_with_all_relays_offline: 10, pwa_opens_with_one_loopback_relay: 10 },
    steps, source_sha256: sourceDigests, relay_summary: relay, browser_summary: browser,
    message_delivery_summary: helper, egress: { browser_external_requests: browser.external_requests,
      browser_websocket_targets_loopback_only: browser.websockets.every(url => /^ws:\/\/127\.0\.0\.1:/.test(url)),
      relay_targets_loopback_only: relay.egress.relay_targets_loopback_only, relay_external_targets: relay.egress.external_targets } };
  const evidenceJson = JSON.stringify(evidence);
  assert.doesNotMatch(evidenceJson, /nsec1[a-z0-9]{20,}|secretHex|secretBytes|private_key/i, 'G4 evidence contains no signing key material');
  await writeFile(path.join(output, 'g4-summary.json'), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  const evidenceFiles = [];
  async function walk(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.isSymbolicLink()) throw new Error(`Evidence symlink is not allowed: ${prefix}${item.name}`);
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) await walk(path.join(dir, item.name), `${relative}/`);
      else if (relative !== 'SHA256SUMS') evidenceFiles.push(`${await sha256(path.join(dir, item.name))}  ${relative}`);
    }
  }
  await walk(output);
  await writeFile(path.join(output, 'SHA256SUMS'), `${evidenceFiles.join('\n')}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ result: 'PASS', candidate_commit: candidate, output, cases: steps.map(step => ({ step: step.step, exit_code: step.exit_code })) })}\n`);
  return 0;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  process.stderr.write(`G4 ${String(error?.message || error).replaceAll(/\s+/g, ' ').slice(0, 1600)}\n`);
  process.exitCode = 1;
});
