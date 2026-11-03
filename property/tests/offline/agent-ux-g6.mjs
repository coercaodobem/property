#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAIRING_TEST = path.join(PROPERTY_ROOT, 'tests/offline/browser-agent-pairing-smoke.mjs');
const PLAN = path.join(PROPERTY_ROOT, 'docs/plano-agentes-human-first.md');
const WRAPPER = fileURLToPath(import.meta.url);
const EXPECTED = [
  'accessible_dialog_name', 'visible_agent_controls_named', 'keyboard_focus_stayed_in_modal',
  'keyboard_cancel_did_not_consume_invite', 'keyboard_approved_exact_scope',
  'dialog_body_scrollable', 'revoke_control_reachable_after_scroll',
  'default_scopes_off', 'cancel_did_not_consume_invite', 'approved_scopes_exact',
  'indexeddb_persisted', 'revocation_cleared_scopes', 'all_requests_loopback'
];

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('Use pares --nome valor.');
    values[argv[i].slice(2).replaceAll('-', '_')] = argv[i + 1];
  }
  for (const key of ['playwright_module', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!values[key]) throw new Error(`Opção obrigatória ausente: --${key.replaceAll('_', '-')}`);
  }
  values.engine ||= 'firefox';
  if (!['chromium', 'firefox'].includes(values.engine)) throw new Error('--engine deve ser chromium ou firefox.');
  return values;
}

const options = parseArgs(process.argv.slice(2));
const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const output = path.resolve(options.output);
await mkdir(output, { recursive: true, mode: 0o700 });
const report = {
  schema_version: 1,
  gate: 'G6',
  status: 'RUNNING',
  host: 'Ubuntu/Linux x64',
  engine: options.engine,
  deterministic_cycles: { desktop: 5, mobile_viewport: 5, total: 10 },
  human_participants: 'PENDING; browser automation is not a participant substitute',
  screen_reader: 'PENDING; no real assistive-technology session was performed',
  physical_android_ios: 'PENDING; mobile is viewport/touch emulation only',
  baseline_comparison: 'PENDING; requires human task observations from G1/G6',
  independent_human_review: 'PENDING',
  exploratory_chromium_attempt: 'One desktop page attempt ended with renderer crash ERR_INSUFFICIENT_RESOURCES; the fixed repeated matrix below uses the pinned Firefox runtime and does not erase this diagnostic.',
  plan_sha256: await sha256(PLAN),
  wrapper_sha256: await sha256(WRAPPER),
  pairing_harness_sha256: await sha256(PAIRING_TEST),
  browser_toolchain: {
    playwright_version: options.playwright_version,
    playwright_package_sha256: options.playwright_package_sha256,
    browser_version: options.browser_version,
    browser_executable_sha256: options.browser_executable_sha256
  },
  cycles: []
};
const reportPath = path.join(output, 'g6-browser-report.json');
const checkpoint = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

for (const viewport of ['desktop', 'mobile']) {
  for (let cycle = 1; cycle <= 5; cycle++) {
    const name = `${viewport}-${String(cycle).padStart(2, '0')}`;
    const cycleOutput = path.join(output, 'cycles', name);
    await mkdir(cycleOutput, { recursive: true, mode: 0o700 });
    const childArgs = [PAIRING_TEST,
      '--playwright-module', options.playwright_module,
      '--executable', options.executable,
      '--playwright-version', options.playwright_version,
      '--browser-version', options.browser_version,
      '--playwright-package-sha256', options.playwright_package_sha256,
      '--browser-executable-sha256', options.browser_executable_sha256,
      '--output', cycleOutput,
      '--engine', options.engine, '--gate', 'G6', '--viewport', viewport, '--cycle', String(cycle)];
    const child = spawnSync(process.execPath, childArgs, { encoding: 'utf8', timeout: 180_000, maxBuffer: 256 * 1024 });
    const logFile = path.join(cycleOutput, 'runner.log');
    const log = `${child.stdout || ''}${child.stderr ? `\n${child.stderr}` : ''}`
      .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(-12000);
    await writeFile(logFile, log, { mode: 0o600 });
    let childReport = null;
    try { childReport = JSON.parse(await readFile(path.join(cycleOutput, 'agent-pairing-browser-report.json'), 'utf8')); } catch {}
    const evidence = childReport?.evidence || {};
    const missing = EXPECTED.filter(key => evidence[key] !== true);
    const passed = child.status === 0 && childReport?.status === 'PASS_TECHNICAL_BROWSER' && missing.length === 0;
    report.cycles.push({
      id: name,
      viewport: viewport === 'mobile' ? '390x844 viewport emulation' : '1280x900 desktop viewport',
      status: passed ? 'PASS' : 'FAIL',
      source_report: path.relative(output, path.join(cycleOutput, 'agent-pairing-browser-report.json')),
      screenshot: path.relative(output, path.join(cycleOutput, `agent-pairing-${viewport}.png`)),
      scrolled_screenshot: path.relative(output, path.join(cycleOutput, `agent-pairing-${viewport}-scrolled.png`)),
      checks: EXPECTED.map(key => ({ check: key, status: evidence[key] === true ? 'PASS' : 'FAIL' })),
      missing_checks: missing,
      process_exit_code: child.status,
      runner_log: path.relative(output, logFile)
    });
    report.status = report.cycles.every(item => item.status === 'PASS') ? 'RUNNING' : 'FAIL';
    await checkpoint();
    process.stdout.write(`${name}: ${passed ? 'PASS' : 'FAIL'}${missing.length ? ` (${missing.join(', ')})` : ''}\n`);
    if (!passed) break;
  }
  if (report.cycles.some(item => item.status === 'FAIL')) break;
}

const allTenPassed = report.cycles.length === 10 && report.cycles.every(item => item.status === 'PASS');
report.status = allTenPassed ? 'PASS_TECHNICAL_PENDING_HUMAN' : 'FAIL_OR_INCOMPLETE';
report.technical_scope = 'Signed invite review, default-deny scopes, keyboard activation/focus confinement, accessible naming, responsive internal scrolling/revocation reachability, local persistence, exact scope grant and cancellation in isolated Firefox contexts. No real participant, screen reader, device OS, or semantic model evaluation.';
await checkpoint();
assert.equal(allTenPassed, true, `G6 technical cycles incomplete: ${report.cycles.length}/10 passed`);
process.stdout.write(`${JSON.stringify({ status: report.status, cycles: report.cycles.length, human_participants: report.human_participants, output }, null, 2)}\n`);
