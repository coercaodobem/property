#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  deriveGateStatus,
  deriveLaterGateEligibility,
  buildSummary,
  evaluateNetworkNamespace,
  buildResumeFingerprint,
  beginAttempt,
  compareResumeFingerprints,
  iptablesBlocksEgress,
  iptablesOutputCounters,
  nftBlocksEgress,
  nftOutputCounters,
  parsePlanCaseDetails,
  parsePlanCases,
  routesAreLoopbackOnly,
  sanitizeText,
  validateManifest,
  verifyInterruptionHarness
} from './run-offline.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const plan = await readFile(path.join(root, 'property/docs/plano-de-testes-central.md'), 'utf8');
const runnerSource = await readFile(path.join(root, 'property/tests/offline/run-offline.mjs'), 'utf8');
assert.match(runnerSource, /-Djava\.io\.tmpdir=\$\{os\.tmpdir\(\)\}/,
  'Java children use the isolated run scratch directory for temporary native libraries');
assert.match(runnerSource, /browser-g05-smoke\.mjs/, 'full profile executes the G05 multi-relay harness');
assert.match(runnerSource, /const g05Ids = \['G05-01', 'G05-02', 'G05-03', 'G05-04', 'G05-05', 'G05-06', 'G05-07'\]/,
  'runner records every G05 case individually');
await access(path.join(root, 'property/tests/offline/browser-g05-smoke.mjs'));
assert.match(runnerSource, /browser-g06-smoke\.mjs/, 'full profile executes the G06 Hangout and marketplace harness');
assert.match(runnerSource, /const g06Ids = \['G06-01', 'G06-02', 'G06-03', 'G06-04', 'G06-05'\]/,
  'runner records every G06 case individually');
await access(path.join(root, 'property/tests/offline/browser-g06-smoke.mjs'));
assert.match(runnerSource, /browser-g07-smoke\.mjs/, 'full profile executes the G07 campaign engine and privacy harness');
assert.match(runnerSource, /const g07Ids = \['G07-01', 'G07-02', 'G07-03', 'G07-04', 'G07-05', 'G07-06', 'G07-07'\]/,
  'runner records every G07 case individually');
await access(path.join(root, 'property/tests/offline/browser-g07-smoke.mjs'));
assert.match(runnerSource, /g08-ledger-smoke\.mjs/, 'full profile executes the real BTC/XMR/XNO settlement harness');
assert.match(runnerSource, /const g08Ids = \['G08-01', 'G08-02', 'G08-03', 'G08-04', 'G08-05', 'G08-06', 'G08-07'\]/,
  'runner records every G08 case individually');
await access(path.join(root, 'property/tests/offline/g08-ledger-smoke.mjs'));
await access(path.join(root, 'property/relay/campaign-engine.mjs'));
const cases = parsePlanCases(plan);
const details = parsePlanCaseDetails(plan);
assert.equal(cases.length, 74);
assert.equal(details.size, 74);
assert.ok([...details.values()].every(value => value.trim().length > 0));
assert.equal(new Set(cases).size, 74);
assert.equal(cases[0], 'G00-01');
assert.equal(cases.at(-1), 'G12-06');
const registryStart = plan.indexOf('## 6. Casos obrigatórios por gate');
const registryEnd = plan.indexOf('\n## 7.', registryStart);
const registry = plan.slice(registryStart, registryEnd);
const prefix = plan.slice(0, registryStart);
const suffix = plan.slice(registryEnd);
const firstCaseRow = registry.split('\n').find(line => line.startsWith('| G00-01 |'));
assert.throws(() => parsePlanCases(prefix + registry.replace(firstCaseRow, `${firstCaseRow}\n${firstCaseRow}`) + suffix),
  /duplicate IDs/);
assert.throws(() => parsePlanCases(prefix + registry.replace(/^\| G12-\d{2} \|.*$/gm, '') + suffix),
  /missing gates/);

const manifest = {
  schema_version: 1,
  run_id: 'contract-smoke-001',
  requested_executor: 'Luna Max',
  actual_executor: 'Luna Max',
  actual_executor_source: 'contract fixture declaration',
  candidate_commit: 'a'.repeat(40),
  test_seed: 'contract-seed',
  case_timeout_ms: 60_000,
  resource_budget: { min_cpus: 4, min_ram_bytes: 8_589_934_592, min_tmp_bytes: 6_442_450_944 },
  ports: { bridge_source: 17450, bridge_target: 17451, seven_relay_base: 17460, native_relay: 17470 }
};
assert.equal(validateManifest(manifest), manifest);
assert.throws(() => validateManifest({ ...manifest, actual_executor_source: '' }), /actual_executor_source must not be empty/);
assert.throws(() => validateManifest({ ...manifest, ports: { ...manifest.ports, native_relay: 17460 } }), /distinct/);
assert.throws(() => validateManifest({ ...manifest, api_token: 'must-not-be-recorded' }), /credential field/);
const browserAutomation = {
  playwright_module: '/opt/property-test-tools/playwright/index.js',
  engine: 'chromium',
  executable: '/opt/property-test-tools/chromium/chrome',
  playwright_version: '1.62.1',
  browser_version: '123.0.0.0',
  playwright_package_sha256: 'b'.repeat(64),
  browser_executable_sha256: 'c'.repeat(64)
};
assert.deepEqual(validateManifest({ ...manifest, browser_automation: browserAutomation }).browser_automation, browserAutomation);
assert.throws(() => validateManifest({ ...manifest, browser_automation: { ...browserAutomation, engine: 'safari' } }), /engine is invalid/);
assert.throws(() => validateManifest({ ...manifest, browser_automation: { ...browserAutomation, browser_executable_sha256: 'not-a-hash' } }), /must be SHA-256/);
const ledgerTools = {
  bitcoin: { bitcoind: '/opt/ledger/bitcoind', bitcoind_sha256: '1'.repeat(64), bitcoin_cli: '/opt/ledger/bitcoin-cli', bitcoin_cli_sha256: '2'.repeat(64) },
  monero: { monerod: '/opt/ledger/monerod', monerod_sha256: '3'.repeat(64), monero_wallet_rpc: '/opt/ledger/monero-wallet-rpc', monero_wallet_rpc_sha256: '4'.repeat(64) },
  nano: { nano_node: '/opt/ledger/nano_node', nano_node_sha256: '5'.repeat(64) }
};
assert.deepEqual(validateManifest({ ...manifest, ledger_tools: ledgerTools }).ledger_tools, ledgerTools);
assert.throws(() => validateManifest({ ...manifest, ledger_tools: { ...ledgerTools, nano: { nano_node: '/opt/ledger/nano_node' } } }), /nano_node_sha256 must be SHA-256/);

assert.equal(deriveGateStatus([
  { status: 'PASS', gate_eligible: true }, { status: 'PASS', gate_eligible: true }
]), 'PASS');
assert.equal(deriveGateStatus([
  { status: 'PASS', gate_eligible: true }, { status: 'NOT_RUN', gate_eligible: false }
]), 'NOT_RUN');
assert.equal(deriveGateStatus([
  { status: 'BLOCKED', gate_eligible: false }, { status: 'FAIL', gate_eligible: false }
]), 'FAIL');
assert.equal(deriveGateStatus([{ status: 'PASS', gate_eligible: false }]), 'BLOCKED');
assert.equal(deriveGateStatus([
  { status: 'PASS', gate_eligible: true }, { status: 'PENDING', gate_eligible: false }
]), 'PENDING', 'intentionally deferred platform coverage must not be reported as an environmental block');

const ubuntuRows = new Map();
for (let index = 0; index <= 11; index++) {
  const gate = `G${String(index).padStart(2, '0')}`;
  ubuntuRows.set(`${gate}-01`, { case: `${gate}-01`, status: 'PASS', gate_eligible: true });
}
ubuntuRows.set('G12-01', { case: 'G12-01', status: 'PASS', gate_eligible: true });
ubuntuRows.set('G12-02', { case: 'G12-02', status: 'PENDING', gate_eligible: false });
ubuntuRows.set('G12-03', { case: 'G12-03', status: 'PENDING', gate_eligible: false });
ubuntuRows.set('G12-04', { case: 'G12-04', status: 'PENDING', gate_eligible: false });
ubuntuRows.set('G12-05', { case: 'G12-05', status: 'PENDING', gate_eligible: false });
ubuntuRows.set('G12-06', { case: 'G12-06', status: 'PASS', gate_eligible: true });
const ubuntuSummary = buildSummary(ubuntuRows, 'full', {
  requested_executor: 'Luna Max', actual_executor: 'Codex GPT-6'
}, {}, { verdict: 'PASS' });
assert.equal(ubuntuSummary.gate_status.G12, 'PENDING');
assert.equal(ubuntuSummary.scope_result, 'PROPERTY_UBUNTU_OFFLINE_PASS');
assert.equal(ubuntuSummary.exit_code, 0, 'deferred non-Ubuntu cases must not block the completed Ubuntu profile');
assert.equal(ubuntuSummary.executor_matches_request, false, 'actual executor identity remains reported transparently');

const parentBeforeLaterGates = [
  ...Array.from({ length: 7 }, (_, index) => ({ case: `G08-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G09-0${index + 1}`, status: 'NOT_RUN', gate_eligible: false })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G10-0${index + 1}`, status: 'NOT_RUN', gate_eligible: false }))
];
const laterGatesReport = [
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G09-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G10-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 5 }, (_, index) => ({ case: `G11-0${index + 1}`, status: 'BLOCKED', gate_eligible: true }))
];
assert.deepEqual(deriveLaterGateEligibility(parentBeforeLaterGates, laterGatesReport), {
  G09: true, G10: true, G11: true, G12: false
}, 'later-gate eligibility is derived from the child report, not stale NOT_RUN parent rows');

const resumeInventory = { candidate_state_sha256: 'a'.repeat(64) };
const firstResumeFingerprint = buildResumeFingerprint(manifest, resumeInventory, plan, 'core', { core_report_sha256: null });
const sameConfigFingerprint = buildResumeFingerprint({ ...manifest, started_utc: '2026-01-01T00:00:00Z', attempt_number: 2,
  resumed_from_attempt: 'history/attempt-001' }, resumeInventory, plan, 'core', { core_report_sha256: null });
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint, sameConfigFingerprint), [],
  'resume ignores generated timestamps/attempt pointers but requires the same candidate inputs');
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint,
  buildResumeFingerprint(manifest, { candidate_state_sha256: 'b'.repeat(64) }, plan, 'core', { core_report_sha256: null })),
['candidate_state_sha256'], 'resume rejects a changed working tree');
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint,
  buildResumeFingerprint(manifest, resumeInventory, plan + '\nchanged', 'core', { core_report_sha256: null })),
['plan_sha256'], 'resume rejects a changed test plan');
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint,
  buildResumeFingerprint({ ...manifest, test_seed: 'different-seed' }, resumeInventory, plan, 'core', { core_report_sha256: null })),
['manifest_config_sha256'], 'resume rejects changed lab configuration');
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint,
  buildResumeFingerprint(manifest, resumeInventory, plan, 'platforms', { core_report_sha256: null })),
['profile'], 'resume rejects a different profile');
assert.deepEqual(compareResumeFingerprints(firstResumeFingerprint,
  buildResumeFingerprint(manifest, resumeInventory, plan, 'core', { core_report_sha256: 'c'.repeat(64) })),
['external_inputs'], 'resume rejects a changed report dependency');

async function makePriorAttempt(dir, sourceInventory = resumeInventory) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const priorRows = [...details].map(([id, requirement]) => ({ case: id, requirement, status: 'NOT_RUN', gate_eligible: false }));
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(dir, 'inventory.json'), JSON.stringify(sourceInventory, null, 2) + '\n');
  await writeFile(path.join(dir, 'resume-state.json'), JSON.stringify({
    ...buildResumeFingerprint(manifest, sourceInventory, plan, 'core', { core_report_sha256: null }),
    attempt_number: 1, resumed_from_attempt: null
  }, null, 2) + '\n');
  await writeFile(path.join(dir, 'cases.latest.jsonl'), priorRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(path.join(dir, 'case-events.jsonl'), JSON.stringify({ case: 'G00-01', status: 'NOT_RUN' }) + '\n');
  await writeFile(path.join(dir, 'gate-checkpoints.jsonl'), '');
  await writeFile(path.join(dir, 'summary.json'), JSON.stringify({ scope_result: 'BLOCKED', gate_status: { G00: 'BLOCKED' } }));
  const names = await readdir(dir);
  const checksums = [];
  for (const name of names) {
    const bytes = await readFile(path.join(dir, name));
    checksums.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  }
  await writeFile(path.join(dir, 'SHA256SUMS'), checksums.sort().join('\n') + '\n');
  return priorRows;
}

const resumeRoot = await mkdtemp(path.join(os.tmpdir(), 'property-resume-contract-'));
try {
  const previousRows = await makePriorAttempt(resumeRoot);
  const casesForResume = new Map([...details].map(([id, requirement]) => [id, { case: id, requirement }]));
  const resumed = await beginAttempt(resumeRoot, { ...manifest }, resumeInventory, plan, 'core',
    { core_report_sha256: null }, casesForResume, true);
  assert.equal(resumed.attempt_number, 2);
  assert.equal((await readdir(path.join(resumeRoot, 'history'))).join(','), 'attempt-001');
  const review = JSON.parse(await readFile(path.join(resumeRoot, 'resume-review.json'), 'utf8'));
  assert.equal(review.prior_evidence_checksums.valid, true);
  assert.equal(review.pending_case_ids.length, previousRows.length);
  assert.equal(review.restart_policy, 'Rerun from G00; no previous PASS is carried into the resumed attempt.');
  await access(path.join(resumeRoot, 'history/attempt-001/case-events.jsonl'));
} finally {
  await rm(resumeRoot, { recursive: true, force: true });
}

const refusedResumeRoot = await mkdtemp(path.join(os.tmpdir(), 'property-resume-refused-'));
try {
  await makePriorAttempt(refusedResumeRoot);
  const casesForResume = new Map([...details].map(([id, requirement]) => [id, { case: id, requirement }]));
  await assert.rejects(() => beginAttempt(refusedResumeRoot, { ...manifest },
    { candidate_state_sha256: 'b'.repeat(64) }, plan, 'core', { core_report_sha256: null }, casesForResume, true),
  /resume refused because these inputs changed: candidate_state_sha256/);
  await access(path.join(refusedResumeRoot, 'manifest.json'));
  assert.equal((await readdir(refusedResumeRoot)).includes('history'), false, 'mismatched resume leaves the prior attempt untouched');
} finally {
  await rm(refusedResumeRoot, { recursive: true, force: true });
}

const corruptedResumeRoot = await mkdtemp(path.join(os.tmpdir(), 'property-resume-corrupt-'));
try {
  await makePriorAttempt(corruptedResumeRoot);
  await writeFile(path.join(corruptedResumeRoot, 'summary.json'), '{"scope_result":"tampered"}');
  const casesForResume = new Map([...details].map(([id, requirement]) => [id, { case: id, requirement }]));
  await assert.rejects(() => beginAttempt(corruptedResumeRoot, { ...manifest }, resumeInventory, plan, 'core',
    { core_report_sha256: null }, casesForResume, true), /prior evidence failed hash verification/);
  assert.equal((await readdir(corruptedResumeRoot)).includes('history'), false, 'corrupt prior evidence is not archived or overwritten');
} finally {
  await rm(corruptedResumeRoot, { recursive: true, force: true });
}

const nftDropLoopback = `table inet filter {
  chain out {
    type filter hook output priority filter; policy drop;
    oifname "lo" accept
  }
}`;
assert.equal(nftBlocksEgress(nftDropLoopback), true);
assert.equal(nftBlocksEgress(nftDropLoopback.replace('oifname "lo"', 'oifname "eth0"')), false);
assert.equal(nftBlocksEgress(nftDropLoopback.replace('oifname "lo" accept', 'jump allow_more')), false);
const nftCounters = nftOutputCounters(nftDropLoopback.replace('oifname "lo" accept', 'oifname "lo" counter packets 4 bytes 256 accept'));
assert.equal(nftCounters.length, 1);
assert.deepEqual({ chain_index: nftCounters[0].chain_index, rule_index: nftCounters[0].rule_index, packets: nftCounters[0].packets, bytes: nftCounters[0].bytes },
  { chain_index: 0, rule_index: 2, packets: 4, bytes: 256 });
assert.match(nftCounters[0].rule_sha256, /^[a-f0-9]{64}$/);

const iptablesDropLoopback = `*filter
:OUTPUT DROP [0:0]
-A OUTPUT -o lo -j ACCEPT
-A OUTPUT -j DROP
COMMIT`;
assert.equal(iptablesBlocksEgress(iptablesDropLoopback), true);
assert.equal(iptablesBlocksEgress(iptablesDropLoopback.replace('-o lo', '-o eth0')), false);
assert.equal(iptablesBlocksEgress(iptablesDropLoopback.replace(':OUTPUT DROP', ':OUTPUT ACCEPT')), false);
assert.deepEqual(iptablesOutputCounters(iptablesDropLoopback.replace('-A OUTPUT -o lo', '[5:320] -A OUTPUT -o lo'))[0].packets, 5);

assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[{"dst":"127.0.0.0/8","dev":"lo"}]' }).ok, true);
assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[{"dst":"127.0.0.0/8","dev":"lo"},{"dst":"127.0.0.1","dev":"lo"},{"dst":"127.255.255.255","dev":"lo"}]' }).ok, true);
assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[{"dst":"::1","dev":"lo"}]' }).ok, true);
assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[{"dst":"128.0.0.0/8","dev":"lo"}]' }).ok, false);
assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[{"dst":"default","gateway":"192.0.2.1","dev":"eth0"}]' }).ok, false);
assert.equal(routesAreLoopbackOnly({ status: 0, stdout: '[]' }).ok, false);
const isolatedNetworkNamespace = {
  requested: true,
  parent_namespace_id: 'net:[100]',
  current_namespace_id: 'net:[200]',
  interfaces: { status: 0, stdout: '[{"ifname":"lo","flags":["LOOPBACK","UP","LOWER_UP"]}]' },
  ipv4_routes: { status: 0, stdout: '[{"dst":"127.0.0.0/8","dev":"lo"},{"dst":"127.0.0.1","dev":"lo"},{"dst":"127.255.255.255","dev":"lo"}]' },
  ipv6_routes: { status: 0, stdout: '[{"dst":"::1","dev":"lo"}]' },
  ipv4_rules: { status: 0, stdout: '[{"priority":0,"table":"local"}]' },
  ipv6_rules: { status: 0, stdout: '[{"priority":0,"table":"local"}]' }
};
assert.equal(evaluateNetworkNamespace(isolatedNetworkNamespace).verified, true);
assert.equal(evaluateNetworkNamespace({ ...isolatedNetworkNamespace, current_namespace_id: 'net:[100]' }).verified, false);
assert.equal(evaluateNetworkNamespace({ ...isolatedNetworkNamespace, interfaces: { status: 0, stdout: '[{"ifname":"lo","flags":["LOOPBACK","UP"]},{"ifname":"eth0","flags":["UP"]}]' } }).verified, false);
assert.equal(evaluateNetworkNamespace({ ...isolatedNetworkNamespace, ipv4_routes: { status: 0, stdout: '[{"dst":"default","gateway":"192.0.2.1","dev":"eth0"}]' } }).verified, false);
assert.equal(evaluateNetworkNamespace({ ...isolatedNetworkNamespace, ipv6_rules: { status: 1, stdout: '', stderr: 'permission denied' } }).verified, false);
assert.equal(evaluateNetworkNamespace({ ...isolatedNetworkNamespace, requested: false }).verified, false);
const sanitized = sanitizeText('token=secret-value\ncredential ghp_abcdefghijklmnopqrstuvwxyz0123456789\n/home/alice/file');
assert.equal(sanitized.includes('secret-value'), false);
assert.equal(sanitized.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), false);
assert.equal(sanitized.includes('/home/alice'), false);

const temp = await mkdtemp(path.join(os.tmpdir(), 'property-runner-contract-'));
try {
  const interruption = await verifyInterruptionHarness(temp);
  assert.equal(interruption.status, 'PASS');
  const evidence = JSON.parse(await readFile(path.join(temp, 'g00-04/harness-verification.json'), 'utf8'));
  assert.equal(evidence.observed_ready, true);
  assert.equal(evidence.child_cleanup_verified, true);
  assert.equal(evidence.checksums_verified, true);
} finally {
  await rm(temp, { recursive: true, force: true });
}

process.stdout.write('PASS: offline runner contract, resume safety and G00-04 interruption verified\n');
