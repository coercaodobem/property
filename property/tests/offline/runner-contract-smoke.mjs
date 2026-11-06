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
import { validateNativePlatformReport } from './native-platform-report.mjs';
import { summarizeRoutes } from '../platform/native-network-isolation.mjs';
import { downstreamCaseIds, gateRowsPassed } from './gate-sequencing.mjs';
import { missingEvidenceReferences } from './evidence-audit.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const plan = await readFile(path.join(root, 'property/docs/plano-de-testes-central.md'), 'utf8');
const runnerSource = await readFile(path.join(root, 'property/tests/offline/run-offline.mjs'), 'utf8');
const browserG03Source = await readFile(path.join(root, 'property/tests/offline/browser-g03-smoke.mjs'), 'utf8');
const viewportSource = await readFile(path.join(root, 'property/tests/offline/g10-viewport-smoke.mjs'), 'utf8');
const laterGatesSource = await readFile(path.join(root, 'property/tests/offline/later-gates.mjs'), 'utf8');
const resilienceSource = await readFile(path.join(root, 'property/tests/offline/g11-multirelay-resilience.mjs'), 'utf8');
const platformBrowserSource = await readFile(path.join(root, 'property/tests/platform/platform-browser-smoke.mjs'), 'utf8');
assert.match(runnerSource, /-Djava\.io\.tmpdir=\$\{os\.tmpdir\(\)\}/,
  'Java children use the isolated run scratch directory for temporary native libraries');
assert.match(runnerSource, /browser-g05-smoke\.mjs/, 'full profile executes the G05 multi-relay harness');
assert.match(runnerSource, /const g05Ids = \['G05-01', 'G05-02', 'G05-03', 'G05-04', 'G05-05', 'G05-06', 'G05-07', 'G05-08'\]/,
  'runner records every G05 case individually');
assert.match(viewportSource, /page\.screenshot\(/, 'G10-05 captures viewport screenshots for visual review');
assert.match(viewportSource, /required_screenshots: 8/, 'G10-05 requires captures for all fixed viewport/zoom cases');
assert.match(laterGatesSource, /viewportScreenshots/, 'the G10-05 gate records its screenshot evidence paths');
assert.match(laterGatesSource, /if\(!gatePassed\('G11'\)\)/, 'G12 does not start before the complete G11 gate passes');
assert.match(laterGatesSource, /g11-multirelay-resilience\.mjs/, 'G11-06 uses the fixed-count multi-relay resilience harness');
assert.match(runnerSource, /evidence: \['isolation\.json'\]/, 'G00-02 links its observed network-isolation evidence');
assert.doesNotMatch(laterGatesSource, /g11-24h-soak|monotonic_duration_ms|required_duration_ms|24-hour-soak/i,
  'G11-06 has no duration-based harness or eligibility check');
assert.match(laterGatesSource, /missingEvidenceReferences\(allRows,evidenceFileExists\)/,
  'G11-05 audits that every PASS case has evidence references');
assert.deepEqual(await missingEvidenceReferences([
  { case: 'G00-02', status: 'PASS', evidence: [] },
  { case: 'G00-03', status: 'PASS', evidence: ['isolation.json'] },
  { case: 'G00-04', status: 'PENDING', evidence: [] }
], async reference => reference === 'isolation.json'), [
  { case: 'G00-02', evidence: null, reason: 'PASS case has no evidence references' }
], 'PASS rows without evidence are rejected; existing references and PENDING rows are handled correctly');
assert.match(resilienceSource, /probe_count:\s*96/, 'G11-06 declares exactly 96 fixed-count probes');
assert.match(resilienceSource, /restart_after_probe_counts:\s*Object\.freeze\(\[24, 48, 72, 96\]\)/,
  'G11-06 declares four restart checkpoints by completed probe count');
assert.match(resilienceSource, /partition_events_per_restart:\s*3/, 'G11-06 declares exactly three partition events per restart');
assert.match(resilienceSource, /fixed_event_epoch_seconds:\s*1_800_000_000/, 'G11-06 uses a predefined logical event epoch');
assert.match(resilienceSource, /epochMs:\s*VARIABLES\.fixed_event_epoch_seconds\s*\*\s*1000/,
  'all six relay bridges share the predefined event epoch');
assert.match(resilienceSource, /logical_clock_step_ms_per_event:\s*1000/,
  'the synthetic clock advances by one predefined logical second per signed event');
assert.match(resilienceSource, /fixed_event_epoch_seconds\s*\+\s*eventSequence/,
  'each event timestamp advances only by the fixed event sequence');
assert.match(resilienceSource, /window\.__propertyTestClock\.advance\(1,\s*stepMs\)/,
  'all six relay bridges advance their logical clock by the same fixed count');
assert.doesNotMatch(resilienceSource, /monotonic|probe_interval|failure_offsets|scheduled_offset|elapsed_ms|required_duration_ms|24.hour/i,
  'G11-06 has no elapsed-time, interval, or 24-hour acceptance logic');
assert.doesNotMatch(platformBrowserSource, /https:\/\/example\.com|browserOfflineProbe|blocked_external_probe/,
  'native platform journeys do not send external probes to verify network isolation');
assert.ok(laterGatesSource.indexOf("if(!gatePassed('G11'))") < laterGatesSource.lastIndexOf('await runG1201(prior)'),
  'G11 reconciliation barrier precedes every G12 case');
assert.ok(laterGatesSource.indexOf("if(!gatePassed('G10'))") < laterGatesSource.indexOf("const g04Args="),
  'G11 cases do not start before G10 passes');
const gate09Rows = ['G09-01', 'G09-02'].map(caseId => ({ case: caseId, status: 'PASS', gate_eligible: true }));
assert.equal(gateRowsPassed(gate09Rows, ['G09-01', 'G09-02']), true);
assert.equal(gateRowsPassed([...gate09Rows, { case: 'G09-03', status: 'NOT_RUN', gate_eligible: false }],
  ['G09-01', 'G09-02', 'G09-03']), false, 'NOT_RUN keeps a gate closed');
assert.equal(gateRowsPassed([{ ...gate09Rows[0], gate_eligible: false }, gate09Rows[1]], ['G09-01', 'G09-02']), false,
  'a PASS status without gate eligibility keeps a gate closed');
assert.equal(gateRowsPassed([...gate09Rows, gate09Rows[0]], ['G09-01', 'G09-02']), false,
  'duplicate case records keep a gate closed');
assert.deepEqual(downstreamCaseIds(['G09-01', 'G10-01', 'G11-01', 'G12-01'], 'G10'), ['G11-01', 'G12-01']);
await access(path.join(root, 'property/tests/offline/browser-g05-smoke.mjs'));
assert.match(runnerSource, /browser-g06-smoke\.mjs/, 'full profile executes the G06 Hangout and marketplace harness');
assert.match(runnerSource, /const g03Ids = \['G03-01', 'G03-02', 'G03-03', 'G03-04', 'G03-05', 'G03-06', 'G03-07'\]/,
  'runner records contact sharing and QR intake in G03');
assert.match(browserG03Source, /G03-07: share an identity as URL\/nprofile\/QR/,
  'G03 browser journey generates a QR and tests active and locked-start contact links');
assert.match(browserG03Source, /decodeQrMatrix\(qrMatrix\)/,
  'G03 QR payload is decoded independently of the browser QR generator');
assert.match(browserG03Source, /local_relay_selection_unchanged_by_received_hints/,
  'G03 verifies that incoming profile hints do not replace the saved relay selection');
assert.match(browserG03Source, /denied_proxy_limited_to_bundled_relays/,
  'G03 records blocked relay attempts separately from completed external requests');
assert.match(plan, /G03-06 \|[^\n]*local deny proxy[^\n]*bundled relay list/,
  'G03-06 requires locally denied relay attempts and restricts them to bundled candidates');
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
assert.equal(cases.length, 87);
assert.equal(details.size, 87);
assert.ok([...details.values()].every(value => value.trim().length > 0));
assert.equal(new Set(cases).size, 87);
assert.equal(cases[0], 'G00-01');
assert.equal(cases.at(-1), 'G12-06');
const registryStart = plan.indexOf('## 6. Mandatory cases by gate');
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
assert.equal(ubuntuSummary.executor_identity_is_gating, false, 'executor selection is provenance, not a test gate');

const fullyPassingRows = new Map(cases.map(caseId => [caseId, { case: caseId, status: 'PASS', gate_eligible: true }]));
const completeSummary = buildSummary(fullyPassingRows, 'full', {
  requested_executor: 'Luna Max', actual_executor: 'Codex GPT-6'
}, {}, { verdict: 'PASS' });
assert.equal(completeSummary.executor_matches_request, false);
assert.equal(completeSummary.scope_result, 'PROPERTY_SCOPE_OFFLINE_PASS',
  'a maintainer-selected model different from an old prompt label must not block a fully passing test matrix');

const parentBeforeLaterGates = [
  ...Array.from({ length: 7 }, (_, index) => ({ case: `G08-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G09-0${index + 1}`, status: 'NOT_RUN', gate_eligible: false })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G10-0${index + 1}`, status: 'NOT_RUN', gate_eligible: false }))
];
const laterGatesReport = [
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G09-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G10-0${index + 1}`, status: 'PASS', gate_eligible: true })),
  ...Array.from({ length: 6 }, (_, index) => ({ case: `G11-0${index + 1}`, status: 'BLOCKED', gate_eligible: true }))
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

// Parser-only fixtures prove rejection/acceptance branches. They are never written as gate evidence.
const nativeHostIsolation = { schema_version: 1, kind: 'native-egress-isolation', result: 'PASS',
  platform: 'win32/x64', policy: 'no-public-default-routes-local-lab-allowed-no-external-proxies',
  ipv4: { usable_non_loopback_route_count: 0, rejected_non_loopback_route_count: 0, route_table_sha256: '1'.repeat(64) },
  ipv6: { usable_non_loopback_route_count: 0, rejected_non_loopback_route_count: 0, route_table_sha256: '2'.repeat(64) },
  proxy_variable_names: [], loopback_probe: 'PASS', reasons: [] };
const nativeHostIsolationProof = { schema_version: 1, kind: 'native-egress-isolation-checkpoints', result: 'PASS',
  platform: 'win32/x64', policy: 'no-public-default-routes-local-lab-allowed-no-external-proxies',
  start: nativeHostIsolation, end: nativeHostIsolation };
const nativePlatformSchemaFixture = {
  schema_version: 3, case: 'G12-02', candidate_commit: 'd'.repeat(40), result: 'PASS',
  platform: { os: 'win32', arch: 'x64' }, native_relay: { status: 'PASS', platform: 'win32/x64' },
  toolchain: { node: '22.22.1', appium: '3.9.0', package_lock_sha256: 'f'.repeat(64),
    drivers: [{ package: 'appium-chromium-driver', version: '3.2.0', registered: true }] },
  browser_driver_warmup: { status: 'PASS', browser_count: 2, browsers: [{ name: 'Chrome' }, { name: 'Edge' }] },
  network_isolation: { verdict: 'PASS', policy: 'deny-all loopback HTTP proxy and no usable IPv4/IPv6 default route',
    host_egress_blocked: true, host_egress: nativeHostIsolationProof,
    intentional_external_probe_count: 0, external_proxy_request_count: 0, local_loopback_preserved: true,
    deny_proxy_requests: [], runner_processes_remain_online_for_ci: false },
  browsers: ['Edge', 'Chrome'].map(browser => ({ browser, status: 'PASS', identity: 'PASS', messaging: 'PASS',
    capabilities: { platformName: 'windows', browserName: browser === 'Edge' ? 'microsoftedge' : 'chrome' }, external_probe_performed: false, pwa: {
      secureContext: true, serviceWorkerSupported: true, manifest: './manifest.webmanifest'
    }, cycles: [{ cycle: 1, delivered_once: true }] })),
  local_asset_requests: 6, physical_installation_proven: false,
  installability: [{ physical_add_to_home_screen_proven: false }, { physical_add_to_home_screen_proven: false }],
  evidence: ['g12-platform-toolchain-preparation.json', 'g12-platform-driver-warmup.json', 'g12-platform-network-isolation.json', 'g12-platform-preflight.json', 'g12-platform-relay.log',
    'appium-server.log', 'g12-platform-evidence.json']
};
assert.equal(validateNativePlatformReport(nativePlatformSchemaFixture, {
  caseId: 'G12-02', candidateCommit: 'd'.repeat(40)
}).status, 'PASS');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture, schema_version: 1 }, {
  caseId: 'G12-02', candidateCommit: 'd'.repeat(40)
}).status, 'FAIL', 'legacy native platform report schemas are not accepted');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture, schema_version: 2 }, {
  caseId: 'G12-02', candidateCommit: 'd'.repeat(40)
}).status, 'FAIL', 'schema 2 reports without the browser driver warmup proof are not accepted');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture, browser_driver_warmup: undefined }, {
  caseId: 'G12-02', candidateCommit: 'd'.repeat(40)
}).status, 'FAIL', 'native browser driver warmup proof is mandatory');
assert.equal(validateNativePlatformReport(nativePlatformSchemaFixture, {
  caseId: 'G12-02', candidateCommit: 'e'.repeat(40)
}).status, 'BLOCKED');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture, platform: { os: 'linux', arch: 'x64' } }, {
  caseId: 'G12-02', candidateCommit: 'd'.repeat(40)
}).status, 'FAIL');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture,
  network_isolation: { ...nativePlatformSchemaFixture.network_isolation,
    deny_proxy_requests: [{ method: 'CONNECT', host: 'external.example:443' }], external_proxy_request_count: 1 }
}, { caseId: 'G12-02', candidateCommit: 'd'.repeat(40) }).status, 'FAIL');
assert.equal(validateNativePlatformReport({ ...nativePlatformSchemaFixture,
  network_isolation: { ...nativePlatformSchemaFixture.network_isolation,
    host_egress: { ...nativePlatformSchemaFixture.network_isolation.host_egress,
      start: { ...nativePlatformSchemaFixture.network_isolation.host_egress.start,
        ipv4: { ...nativePlatformSchemaFixture.network_isolation.host_egress.start.ipv4, usable_non_loopback_route_count: 1 } } } }
}, { caseId: 'G12-02', candidateCommit: 'd'.repeat(40) }).status, 'FAIL');
const androidHostIsolation = { ...nativeHostIsolation, platform: 'linux/x64' };
const androidHostIsolationProof = { ...nativeHostIsolationProof, platform: 'linux/x64',
  start: androidHostIsolation, end: androidHostIsolation };
const androidCycle = cycle => ({ cycle, backgrounded: true, resumed: true, identity_recovered: true,
  relay_reconnected: true, message_delivered_once: true });
const androidPlatformFixture = {
  ...nativePlatformSchemaFixture, case: 'G12-04',
  platform: { os: 'linux', arch: 'x64' }, native_relay: { status: 'PASS', platform: 'linux/x64' },
  toolchain: { ...nativePlatformSchemaFixture.toolchain,
    drivers: [{ package: 'appium-uiautomator2-driver', version: '8.7.3', registered: true }] },
  browser_driver_warmup: { status: 'PASS', browser_count: 1, browsers: [{ name: 'Chrome Android' }] },
  network_isolation: { ...nativePlatformSchemaFixture.network_isolation, host_egress: androidHostIsolationProof },
  browsers: [{ browser: 'Chrome Android', status: 'PASS', identity: 'PASS', messaging: 'PASS', recovery: 'PASS', reconnect: 'PASS',
    capabilities: { platformName: 'Android', browserName: 'chrome' }, external_probe_performed: false,
    pwa: { secureContext: true, serviceWorkerSupported: true, manifest: './manifest.webmanifest' },
    cycles: [androidCycle(1), androidCycle(2), androidCycle(3)] }],
  installability: [{ physical_add_to_home_screen_proven: false }],
  android_guest_isolation: { verdict: 'PASS', emulator_verified: true, wifi_disabled: true,
    mobile_data_disabled: true, host_public_egress_blocked: true,
    guest_default_routes_observed: ['default via 10.0.2.2 dev eth0'] }
};
assert.equal(validateNativePlatformReport(androidPlatformFixture, {
  caseId: 'G12-04', candidateCommit: 'd'.repeat(40)
}).status, 'PASS', 'Android can retain a local emulator route when guest radios and host public egress are blocked');
assert.equal(validateNativePlatformReport({ ...androidPlatformFixture,
  android_guest_isolation: { ...androidPlatformFixture.android_guest_isolation, wifi_disabled: false }
}, { caseId: 'G12-04', candidateCommit: 'd'.repeat(40) }).status, 'FAIL');
assert.deepEqual(summarizeRoutes('linux', JSON.stringify([{ dst: '10.0.0.0/8', type: 'unreachable', dev: 'eth0' }] ), '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('linux', JSON.stringify([{ dst: '10.0.0.0/8', type: 'unicast', dev: 'eth0' }] ), '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('linux', JSON.stringify([{ dst: '127.0.0.0/8', type: 'local', dev: 'lo' }] ), '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('linux', JSON.stringify([{ dst: '127.255.255.255/32', type: 'broadcast', dev: 'lo' }] ), '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('linux', JSON.stringify([{ dst: '127.0.0.0/7', type: 'unicast', dev: 'lo' }] ), '4'), { usable: 1, rejected: 0 });
assert.deepEqual(summarizeRoutes('win32', '[]', '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('win32', '[{"DestinationPrefix":"0.0.0.0/0","InterfaceAlias":"Ethernet"}]', '4'), { usable: 1, rejected: 0 });
assert.deepEqual(summarizeRoutes('win32', '[{"DestinationPrefix":"127.0.0.0/8","InterfaceAlias":"Loopback Pseudo-Interface 1"}]', '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('win32', '[{"DestinationPrefix":"192.168.1.0/24","InterfaceAlias":"Ethernet"}]', '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('darwin', 'Destination Gateway Flags Netif\n127 127.0.0.1 UCS lo0', '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('darwin', 'Destination Gateway Flags Netif\n192.168.1/24 link#4 UCS en0', '4'), { usable: 0, rejected: 0 });
assert.deepEqual(summarizeRoutes('darwin', 'Destination Gateway Flags Netif\ndefault 192.0.2.1 UGSc en0', '4'), { usable: 1, rejected: 0 });
assert.deepEqual(summarizeRoutes('darwin', 'Destination Gateway Flags Netif\ndefault link#1 R en0', '4'), { usable: 0, rejected: 1 });

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
