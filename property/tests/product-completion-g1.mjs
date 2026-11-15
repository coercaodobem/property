import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/evidence/product-completion/G1/fixed-run-01'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const requiredFiles = [
  'agent/protocol-contract.mjs', 'agent/manifest.json', 'agent/relay.mjs', 'agent/xno-trades.mjs', 'agent/xno-threshold-protocol.mjs',
  'agent/xno-escrow.mjs',
  'relay/campaign-engine.mjs', 'web/protocol-contract.js', 'web/app.js', 'web/campaigns.js', 'web/index.html', 'web/marketplace.js',
  'web/nip39.js', 'web/routing.js', 'web/sw.js', 'docs/protocol-versions.json', 'docs/protocol-contract-v1.md',
  'docs/protocol-contract-v1.pt-BR.md', 'tests/protocol-contract-g1.mjs', 'tests/agent-xno-trades-smoke.mjs',
  'tests/campaign-engine-smoke.mjs', 'tests/campaigns-smoke.mjs', 'tests/marketplace-smoke.mjs', 'tests/nip39-smoke.mjs', 'tests/agent-xno-escrow-smoke.mjs',
  'tests/protocol-smoke.mjs', 'tests/app-contract-smoke.mjs', 'tests/agent-package-smoke.mjs', 'tests/agent-package-smoke.sh',
  'tests/offline/agent-security-g5.mjs', 'tests/product-completion-g1.mjs', 'tests/run-smoke.sh',
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed (${result.status}): ${output.slice(-2_000)}`);
  return { command: [command, ...args], exit_code: result.status, stdout_sha256: sha256(result.stdout || ''), output_sha256: sha256(output),
    sections: [...output.matchAll(/^== (.+) ==$/gm)].map(match => match[1]), output_tail: output.trim().split('\n').slice(-4), stdout: result.stdout || '' };
}

assert.equal(process.platform, 'linux', 'G1 is executed only on Ubuntu/Linux');
assert.equal(process.arch, 'x64', 'G1 is executed only on x86_64');
assert.match(await readFile('/etc/os-release', 'utf8'), /^ID=ubuntu$/m, 'G1 is executed only on Ubuntu');
await mkdir(OUT, { recursive: true, mode: 0o700 });
const protocolRun = run(process.execPath, ['tests/protocol-contract-g1.mjs', OUT]);
const tradeRun = run(process.execPath, ['tests/agent-xno-trades-smoke.mjs']);
const tradeReport = JSON.parse(tradeRun.stdout);
assert.equal(tradeReport.stateful_replay_counts.duplicate_payment_commands, 50);
assert.equal(tradeReport.stateful_replay_counts.duplicate_receipt_commands, 50);
const campaignRun = run(process.execPath, ['tests/campaign-engine-smoke.mjs']);
const campaignSummary = JSON.parse(campaignRun.stdout.trim());
assert.equal(campaignSummary.gate, 'G1-campaign-integration');
assert.equal(campaignSummary.result, 'PASS');
assert.equal(campaignSummary.duplicate_offer_decisions, 50);
assert.equal(campaignSummary.duplicate_payment_reconciliations, 50);
assert.equal(campaignSummary.duplicate_refund_requests, 50);
const fullSuiteRun = run('bash', ['tests/run-smoke.sh']);
assert.ok(fullSuiteRun.output_tail.some(line => line.includes('PASS: suíte smoke local concluída.')));

const protocolReport = JSON.parse(await readFile(path.join(OUT, 'protocol-contract-report.json'), 'utf8'));
assert.equal(protocolReport.result, 'PASS');
assert.equal(protocolReport.counts.total_event_vectors, 700);
assert.equal(protocolReport.counts.total_malformed_inputs, 700);
assert.equal(protocolReport.counts.duplicate_copies_per_family, 50);
assert.equal(protocolReport.counts.reordered_batches_per_family, 50);
const sourceFiles = [];
for (const relativePath of requiredFiles) {
  const bytes = await readFile(path.join(ROOT, relativePath));
  sourceFiles.push({ path: `property/${relativePath}`, sha256: sha256(bytes), bytes: bytes.length });
}

const requirements = {
  schema_version: 1,
  gate: 'G1',
  result: 'PASS',
  cases: [
    { id: 'G1-01', requirement: 'versioned contract covers all seven event families and interoperable Nostr kinds', result: 'PASS', evidence: 'protocol-contract-report.json' },
    { id: 'G1-02', requirement: '100 valid/invalid signed vectors per family across browser and agent parsers', result: 'PASS', evidence: 'protocol-contract-report.json' },
    { id: 'G1-03', requirement: '100 malformed inputs per family return typed rejection without mutation', result: 'PASS', evidence: 'protocol-contract-report.json' },
    { id: 'G1-04', requirement: '50 duplicate and 50 reordered copies per family produce byte-identical state', result: 'PASS', evidence: 'protocol-contract-report.json' },
    { id: 'G1-05', requirement: 'BTC, XMR, and XNO atomic limits and ambiguity rejections', result: 'PASS', evidence: 'protocol-contract-report.json' },
    { id: 'G1-06', requirement: '50 repeated XNO payment/receipt commands do not duplicate transfers; campaign offer/payment/refund repeats are idempotent', result: 'PASS', evidence: 'integration-summary.json' },
    { id: 'G1-07', requirement: 'full offline smoke suite passes on Ubuntu Linux x86_64', result: 'PASS', evidence: 'execution-report.json' },
  ],
};
await writeFile(path.join(OUT, 'requirements.json'), `${JSON.stringify(requirements, null, 2)}\n`, { mode: 0o600 });
const integrationSummary = {
  schema_version: 1,
  result: 'PASS',
  xno_trade: { gate: tradeReport.gate, case_count: tradeReport.caseCount, transfer_count: tradeReport.actualNanoTransfers,
    receive_count: tradeReport.actualNanoReceiveBlocks, fixed_replays: tradeReport.stateful_replay_counts,
    no_funds: tradeReport.fundsUsed === false, relays: tradeReport.relayUsed },
  campaign: campaignSummary,
  complete_smoke_suite: fullSuiteRun,
};
await writeFile(path.join(OUT, 'integration-summary.json'), `${JSON.stringify(integrationSummary, null, 2)}\n`, { mode: 0o600 });
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
assert.equal(head.status, 0);
const report = {
  schema_version: 1,
  gate: 'G1',
  result: 'PASS',
  source_commit: head.stdout.trim(),
  platform: { os: 'Ubuntu Linux', architecture: 'x86_64', node: process.version },
  execution_scope: { network: 'offline local fixtures and loopback mocks only', public_relays: false, mainnet: false, funds: false, human_review: false, other_os: false },
  event_contract_counts: protocolReport.counts,
  integration_runs: [protocolRun, { ...tradeRun, stdout: undefined }, { ...campaignRun, stdout: undefined }, fullSuiteRun],
  smoke_test_sections: fullSuiteRun.sections,
  integration_metrics: campaignSummary,
  source_files: sourceFiles,
};
await writeFile(path.join(OUT, 'execution-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const manifest = {
  schema_version: 1,
  gate: 'G1',
  result: 'PASS',
  source_commit: report.source_commit,
  source_files: sourceFiles,
  evidence_files: [],
};
for (const name of ['protocol-contract-report.json', 'requirements.json', 'integration-summary.json', 'execution-report.json']) {
  const bytes = await readFile(path.join(OUT, name));
  manifest.evidence_files.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
}
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ gate: 'G1', result: 'PASS', source_commit: report.source_commit, cases: requirements.cases.length,
  event_vectors: protocolReport.counts.total_event_vectors, malformed_inputs: protocolReport.counts.total_malformed_inputs,
  full_smoke_sections: fullSuiteRun.sections.length }, null, 2)}\n`);
