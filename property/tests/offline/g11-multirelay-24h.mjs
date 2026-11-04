#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, chmod, mkdir, mkdtemp, readFile, readlink, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  assertNoExternal, loadRuntime, publishEvent, startAppServer, startGeode, startNode,
  startProxy, stopGeode, closeNode, waitStored, waitUntil
} from './browser-g05-smoke.mjs';

// This goal-specific long run supplements the central plan's fixed-count G11 cases.
// Its duration and cadence are deliberately fixed in source; command-line input cannot
// shorten the acceptance window or change the topology.
const VARIABLES = Object.freeze({
  requiredDurationSeconds: 86_400,
  probeIntervalSeconds: 60,
  expectedProbeCount: 1_441,
  maximumProbeGapSeconds: 120,
  relayCount: 3,
  bridgeCount: 2,
  middleRelayIndex: 1,
  partitionEventsPerRestart: 3,
  restartElapsedSeconds: Object.freeze([28_800, 57_600]),
  resourceSampleEveryProbes: 60,
  uiSampleProbeCounts: Object.freeze([1, ...Array.from({ length: 24 }, (_, index) => (index + 1) * 60), 1_441]),
  maximumRelayRssFraction: 0.70,
  maximumScratchBytes: 2 * 1024 ** 3,
  reconciliationBatchSize: 50,
  fixedPortOffset: 300
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestText, outputText, modeText] = process.argv.slice(2);
assert.ok(manifestText && outputText && process.argv.length >= 4 && process.argv.length <= 5,
  'Usage: node g11-multirelay-24h.mjs <manifest.json> <evidence-output-dir> --preflight-only');
assert.equal(modeText, '--preflight-only',
  'The duration-based runner is archived and disabled; only its non-gating diagnostic preflight remains available.');
const preflightOnly = modeText === '--preflight-only';
const manifestPath = path.resolve(manifestText);
const output = path.resolve(outputText);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(typeof manifest.candidate_commit, 'string');
assert.match(manifest.candidate_commit, /^[0-9a-f]{40}$/i);
assert.ok(manifest.browser_automation, 'the pinned browser runtime is required');
assert.ok(Number.isInteger(manifest.ports?.seven_relay_base), 'the pinned relay port range is required');

const RUN_ID = `${manifest.run_id}-g11-03-24h`;
const REPORT_PATH = path.join(output, 'g11-multirelay-24h-report.json');
const PROBES_PATH = path.join(output, 'g11-multirelay-24h-probes.jsonl');
const SOURCE_PATH = fileURLToPath(import.meta.url);
const PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'
];
const portBase = Number(manifest.ports.seven_relay_base) + VARIABLES.fixedPortOffset;
const relayUrls = Array.from({ length: VARIABLES.relayCount }, (_, index) => `ws://127.0.0.1:${portBase + index}`);

await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
await appendFile(PROBES_PATH, '', { mode: 0o600 });

const report = {
  schema_version: 1,
  case: 'G11-03-24H',
  run_id: RUN_ID,
  status: 'PREFLIGHT',
  method: 'real_wall_clock_multirelay_window',
  candidate_commit: manifest.candidate_commit,
  requested_executor: manifest.requested_executor,
  actual_executor: manifest.actual_executor,
  actual_executor_source: manifest.actual_executor_source,
  predefined_variables: VARIABLES,
  relay_count: VARIABLES.relayCount,
  bridge_count: VARIABLES.bridgeCount,
  allowed_relay_urls: relayUrls,
  browser: null,
  isolation: null,
  topology: [],
  start_utc: null,
  end_utc: null,
  duration_required_seconds: VARIABLES.requiredDurationSeconds,
  duration_wall_seconds: null,
  duration_boot_seconds: null,
  duration_monotonic_seconds: null,
  probe_count: 0,
  missed_probe_intervals: 0,
  maximum_observed_probe_gap_seconds: 0,
  loss_count: 0,
  duplicate_storage_count: 0,
  probes: [],
  restart_cycles: [],
  partition_events: [],
  ui_deduplication_samples: [],
  resource_samples: [],
  final_reconciliation: [],
  external_requests: [],
  denied_proxy_attempts: [],
  page_errors: [],
  websockets: [],
  reason: null
};

let runtime;
let app;
let proxy;
let temp;
let relays = [];
let bridges = [];
let bridgeEvidence;
let sender;
let bootStartSeconds = null;
let wallStartMs = null;
let monotonicStartMs = null;
let interruptedBy = null;
const cleanupFailures = [];
const expectedEvents = new Map();
process.once('SIGINT', () => { interruptedBy = 'SIGINT'; });
process.once('SIGTERM', () => { interruptedBy = 'SIGTERM'; });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeText(value) {
  return String(value)
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
    .replace(/\/home\/[^/\s]+/g, '/home/<USER>')
    .slice(0, 2_000);
}

function commandJson(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${safeText(result.stderr || result.error?.message || result.status)}`);
  return JSON.parse(result.stdout);
}

async function readBootSeconds() {
  const value = await readFile('/proc/uptime', 'utf8');
  const seconds = Number(value.trim().split(/\s+/)[0]);
  assert.ok(Number.isFinite(seconds) && seconds > 0, 'Linux boot-time clock is readable');
  return seconds;
}

async function proveIsolation() {
  assert.equal(process.env.PROPERTY_NETWORK_ISOLATION, 'unshared-netns', 'test requires the isolated network namespace');
  const parentNamespaceId = process.env.PROPERTY_PARENT_NETNS_ID || null;
  const namespaceId = await readlink('/proc/self/ns/net');
  assert.ok(parentNamespaceId && namespaceId !== parentNamespaceId, 'test network namespace differs from its parent');

  const interfaces = commandJson('ip', ['-json', 'link', 'show']);
  assert.equal(interfaces.length, 1, 'only one interface is present in the test namespace');
  assert.equal(interfaces[0]?.ifname, 'lo', 'the only test interface is loopback');
  assert.ok(interfaces[0]?.flags?.includes('UP'), 'loopback is up');

  const routes = {};
  for (const family of ['-4', '-6']) {
    const rows = commandJson('ip', [family, '-json', 'route', 'show', 'table', 'all']);
    assert.ok(rows.every(row => row.dev === 'lo' && !row.gateway && !row.via), `${family} routes stay on loopback`);
    routes[family] = rows.map(row => ({ dst: row.dst || null, dev: row.dev || null, table: row.table || null }));
  }
  const resolvConf = await readFile('/etc/resolv.conf', 'utf8');
  const nameservers = [...resolvConf.matchAll(/^\s*nameserver\s+(\S+)/gm)].map(match => match[1]);
  assert.ok(nameservers.length > 0 && nameservers.every(value => ['127.0.0.1', '127.0.0.53', '::1'].includes(value)),
    'DNS resolvers are loopback only');
  const configuredProxyKeys = PROXY_KEYS.filter(key => Boolean(process.env[key]));
  assert.deepEqual(configuredProxyKeys, [], 'no HTTP or SOCKS proxy is available to the test process');

  return {
    status: 'PASS',
    parent_namespace_id: parentNamespaceId,
    namespace_id: namespaceId,
    interface_names: interfaces.map(row => row.ifname),
    routes,
    nameservers,
    configured_proxy_keys: configuredProxyKeys,
    public_endpoints_configured: false,
    probe_to_public_network_sent: false
  };
}

async function saveReport() {
  const temporary = `${REPORT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, REPORT_PATH);
}

async function appendRecord(kind, fields = {}) {
  await appendFile(PROBES_PATH, `${JSON.stringify({ record: kind, run_id: RUN_ID, ...fields })}\n`, { mode: 0o600 });
}

function queryRaw(url, filter, timeoutMs = 12_000) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const events = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error); else resolve(value);
    };
    const subscription = `property-24h-${crypto.randomUUID()}`;
    const timer = setTimeout(() => finish(new Error(`Query watchdog expired for ${url}`)), timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, filter])), { once: true });
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === subscription && frame[2]?.id) events.push(frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === subscription) finish(null, events);
    });
    socket.addEventListener('error', () => finish(new Error(`Query WebSocket failed for ${url}`)), { once: true });
    socket.addEventListener('close', () => {
      if (!settled) finish(new Error(`Query WebSocket closed before EOSE for ${url}`));
    }, { once: true });
  });
}

async function assertStoredExactlyOnce(url, event, label) {
  await waitStored(url, event.id, true, 30_000);
  const frames = await queryRaw(url, { ids: [event.id], limit: 2 });
  const matches = frames.filter(item => item.id === event.id);
  assert.equal(matches.length, 1, `${label}: event is returned exactly once at storage layer`);
  return matches[0];
}

function signEvent(content) {
  const createdAt = Math.floor(Date.now() / 1000);
  return runtime.sign(1, content, createdAt, sender.secret);
}

async function waitForProbeTarget(targetBootSeconds) {
  while (!interruptedBy) {
    const remainingMs = (targetBootSeconds - await readBootSeconds()) * 1000;
    if (remainingMs <= 0) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(5_000, remainingMs)));
  }
  throw new Error(`24-hour run interrupted by ${interruptedBy}`);
}

async function treeBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += await treeBytes(file);
    else if (entry.isFile()) total += (await stat(file)).size;
  }
  return total;
}

async function sampleResources(label, probeIndex) {
  const relayProcesses = relays.map(relay => {
    const output = execFileSync('ps', ['-o', 'rss=', '-p', String(relay.child.pid)], { encoding: 'utf8' }).trim();
    const rssKb = Number(output.split(/\s+/)[0]);
    return { label: relay.label, process_id: relay.child.pid, rss_bytes: Number.isFinite(rssKb) ? rssKb * 1024 : 0 };
  });
  const totalRss = relayProcesses.reduce((sum, item) => sum + item.rss_bytes, 0);
  const scratchBytes = await treeBytes(temp);
  const sample = {
    label,
    probe_index: probeIndex,
    sampled_utc: new Date().toISOString(),
    relay_processes: relayProcesses,
    total_relay_rss_bytes: totalRss,
    scratch_bytes: scratchBytes,
    harness_rss_bytes: process.memoryUsage().rss
  };
  report.resource_samples.push(sample);
  assert.ok(relayProcesses.every(item => item.rss_bytes > 0), 'all three relay processes have a measurable RSS');
  assert.ok(totalRss <= report.resource_budget.maximum_aggregate_relay_rss_bytes,
    'aggregate relay RSS stays within the fixed run budget');
  assert.ok(scratchBytes <= VARIABLES.maximumScratchBytes, 'persistent relay data stays within the fixed scratch limit');
  await appendRecord('resource_sample', sample);
}

async function verifyBridgeSubscriptionsAfterRestart(url, previousCounts) {
  const adjacent = bridges.filter(bridge => bridge.subscriptions.some(item => item.relay === url && item.kinds.includes(1)));
  assert.equal(adjacent.length, 2, 'both adjacent browser bridges use the interrupted relay');
  await waitUntil(async () => adjacent.every(bridge => {
    const current = bridge.subscriptions.filter(item => item.relay === url && item.kinds.includes(1));
    const latest = current.at(-1);
    return current.length > previousCounts.get(bridge) && Boolean(latest &&
      bridge.eoses.some(item => item.relay === url && item.id === latest.id));
  }), 45_000, 'both browser bridges did not resubscribe and receive EOSE after relay restart');
}

async function verifyUiOnce(probeIndex, event, reason) {
  const results = [];
  for (const bridge of bridges) {
    await bridge.page.locator('button[data-view="hangout"]').click();
    await bridge.page.locator('#refresh-hangout').click();
    await bridge.page.waitForFunction(id => document.querySelectorAll(`[data-event-id="${id}"]`).length >= 1,
      event.id, { timeout: 20_000 });
    const cards = await bridge.page.locator(`[data-event-id="${event.id}"]`).count();
    assert.equal(cards, 1, `${bridge.label}: sampled event renders as exactly one UI card`);
    results.push({ bridge: bridge.label, card_count: cards });
  }
  const sample = { probe_index: probeIndex, reason, event_id: event.id, bridges: results };
  report.ui_deduplication_samples.push(sample);
  await appendRecord('ui_deduplication', sample);
}

async function restartMiddleRelay(probeIndex, elapsedSeconds) {
  const cycleNumber = report.restart_cycles.length + 1;
  const relay = relays[VARIABLES.middleRelayIndex];
  const relayUrl = relay.url;
  const previousCounts = new Map(bridges
    .filter(bridge => bridge.subscriptions.some(item => item.relay === relayUrl && item.kinds.includes(1)))
    .map(bridge => [bridge, bridge.subscriptions.filter(item => item.relay === relayUrl && item.kinds.includes(1)).length]));
  assert.equal(previousCounts.size, 2, 'both bridge contexts are connected to the middle relay before its outage');

  const cycle = {
    cycle: cycleNumber,
    planned_elapsed_seconds: VARIABLES.restartElapsedSeconds[cycleNumber - 1],
    observed_elapsed_seconds: elapsedSeconds,
    trigger_delta_seconds: elapsedSeconds - VARIABLES.restartElapsedSeconds[cycleNumber - 1],
    relay_index: VARIABLES.middleRelayIndex,
    relay_label: relay.label,
    stopped_utc: new Date().toISOString(),
    restart_utc: null,
    same_database_directory: true,
    partition_events: []
  };
  await stopGeode(relay);
  relays[VARIABLES.middleRelayIndex] = null;

  for (let repetition = 1; repetition <= VARIABLES.partitionEventsPerRestart; repetition++) {
    const event = signEvent(`Property synthetic 24h partition ${cycleNumber} event ${repetition}`);
    const ack = await publishEvent(relayUrls[0], event);
    assert.equal(ack.accepted, true, 'source relay accepts each synthetic partition event');
    await assertStoredExactlyOnce(relayUrls[0], event, 'partition source relay');
    const absentAtDestination = await queryRaw(relayUrls.at(-1), { ids: [event.id], limit: 2 });
    assert.equal(absentAtDestination.length, 0, 'partition event does not bypass the stopped middle relay');
    expectedEvents.set(event.id, event);
    const item = { event_id: event.id, source_ack: true, absent_at_destination_during_partition: true };
    cycle.partition_events.push(item);
    report.partition_events.push({ cycle: cycleNumber, ...item });
    await appendRecord('partition_event', { cycle: cycleNumber, repetition, elapsed_seconds: elapsedSeconds, ...item });
  }

  relays[VARIABLES.middleRelayIndex] = await startGeode(portBase + VARIABLES.middleRelayIndex, temp, relay.label);
  cycle.restart_utc = new Date().toISOString();
  await verifyBridgeSubscriptionsAfterRestart(relayUrl, previousCounts);

  for (const item of cycle.partition_events) {
    const event = expectedEvents.get(item.event_id);
    for (const [index, url] of relayUrls.entries()) {
      await assertStoredExactlyOnce(url, event, `recovered partition event on relay ${index + 1}`);
    }
    item.reconciled_at_all_relays = true;
  }
  cycle.reconciled_event_count = cycle.partition_events.length;
  cycle.recovery_elapsed_seconds = (await readBootSeconds()) - bootStartSeconds;
  report.restart_cycles.push(cycle);
  await sampleResources(`restart-${cycleNumber}`, probeIndex);
  await verifyUiOnce(probeIndex, expectedEvents.get(cycle.partition_events.at(-1).event_id), `after restart ${cycleNumber}`);
  await appendRecord('relay_restart_reconciled', cycle);
  await saveReport();
}

async function reconcileAllEvents() {
  const ids = [...expectedEvents.keys()];
  const perRelay = [];
  for (const [relayIndex, url] of relayUrls.entries()) {
    let reconciled = 0;
    for (let offset = 0; offset < ids.length; offset += VARIABLES.reconciliationBatchSize) {
      const batch = ids.slice(offset, offset + VARIABLES.reconciliationBatchSize);
      const frames = await queryRaw(url, { ids: batch, limit: batch.length * 2 + 1 }, 30_000);
      const counts = new Map(batch.map(id => [id, 0]));
      for (const event of frames) if (counts.has(event.id)) counts.set(event.id, counts.get(event.id) + 1);
      for (const [id, count] of counts) {
        assert.equal(count, 1, `final reconciliation on relay ${relayIndex + 1}: ${id} occurs exactly once`);
        reconciled += count;
      }
    }
    perRelay.push({ relay_index: relayIndex, event_count: reconciled, expected_event_count: ids.length });
  }
  report.final_reconciliation = perRelay;
  return { expected_unique_event_count: ids.length, relays: perRelay };
}

async function main() {
  await writeFile(path.join(output, 'run-inputs.json'), `${JSON.stringify({
    schema_version: 1,
    run_id: RUN_ID,
    candidate_commit: manifest.candidate_commit,
    requested_executor: manifest.requested_executor,
    actual_executor: manifest.actual_executor,
    actual_executor_source: manifest.actual_executor_source,
    test_seed: manifest.test_seed,
    plan_sha256: sha256(await readFile(path.join(ROOT, 'property/docs/plano-de-testes-central.md'))),
    runner_sha256: sha256(await readFile(SOURCE_PATH)),
    diagnostic_preflight_only: preflightOnly,
    browser: {
      engine: manifest.browser_automation.engine,
      version: manifest.browser_automation.browser_version,
      executable_sha256: manifest.browser_automation.browser_executable_sha256,
      playwright_version: manifest.browser_automation.playwright_version,
      playwright_sha256: manifest.browser_automation.playwright_package_sha256
    },
    variables: VARIABLES
  }, null, 2)}\n`, { mode: 0o600 });

  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(currentHead, manifest.candidate_commit, 'working tree HEAD equals the pinned candidate');
  report.isolation = await proveIsolation();
  await writeFile(path.join(output, 'isolation.json'), `${JSON.stringify(report.isolation, null, 2)}\n`, { mode: 0o600 });

  temp = await mkdtemp(path.join(os.tmpdir(), 'property-g11-24h-'));
  app = startAppServer();
  proxy = startProxy();
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(manifest.browser_automation, proxy.server.address().port);
  report.browser = runtime.evidence;

  for (let index = 0; index < VARIABLES.relayCount; index++) {
    const label = `goal 24h relay ${index + 1}`;
    relays.push({ ...await startGeode(portBase + index, temp, label), label });
  }
  bridgeEvidence = {
    nodes: [], external_requests: report.external_requests, denied_proxy_attempts: report.denied_proxy_attempts,
    websockets: report.websockets, page_errors: report.page_errors
  };
  for (let index = 0; index < VARIABLES.bridgeCount; index++) {
    bridges.push(await startNode(runtime, origin, bridgeEvidence, `goal 24h bridge ${index + 1}`,
      [relayUrls[index], relayUrls[index + 1]], { bridge: true }));
  }
  await waitUntil(async () => bridges.every((bridge, index) => [relayUrls[index], relayUrls[index + 1]].every(url =>
    bridge.subscriptions.some(item => item.relay === url && item.kinds.includes(1)) &&
    bridge.eoses.some(item => item.relay === url))), 45_000,
  'both browser bridges did not establish their two real Geode subscriptions');
  assert.equal(new Set(bridges.map(bridge => bridge.id?.npub)).size, VARIABLES.bridgeCount,
    'the two browser bridges use independent synthetic identities');

  sender = runtime.createIdentity();
  const availableMemory = os.freemem();
  report.resource_budget = {
    available_memory_at_start_bytes: availableMemory,
    maximum_aggregate_relay_rss_bytes: Math.floor(availableMemory * VARIABLES.maximumRelayRssFraction),
    maximum_relay_rss_fraction: VARIABLES.maximumRelayRssFraction,
    maximum_scratch_bytes: VARIABLES.maximumScratchBytes
  };
  report.topology = relays.map((relay, index) => ({ relay_index: index, url: relay.url,
    data_dir_mode: 'private temporary directory', process_id: relay.child.pid }));
  report.bridges = bridges.map((bridge, index) => ({ bridge_index: index,
    relay_urls: [relayUrls[index], relayUrls[index + 1]], identity_fingerprint: sha256(bridge.id.npub).slice(0, 16) }));
  await sampleResources('pre-window', 0);

  const marker = signEvent(`Property synthetic 24h persistence marker ${RUN_ID}`);
  const markerAck = await publishEvent(relayUrls[0], marker);
  assert.equal(markerAck.accepted, true, 'source relay accepts the 24-hour persistence marker');
  for (const [index, url] of relayUrls.entries()) await assertStoredExactlyOnce(url, marker, `initial marker on relay ${index + 1}`);
  expectedEvents.set(marker.id, marker);

  if (preflightOnly) {
    await assertNoExternal(bridgeEvidence);
    report.external_requests = bridgeEvidence.external_requests;
    report.denied_proxy_attempts = bridgeEvidence.denied_proxy_attempts;
    report.page_errors = bridgeEvidence.page_errors;
    report.websockets = bridgeEvidence.websockets;
    report.status = 'NOT_RUN';
    report.gate_eligible = false;
    report.reason = 'Diagnostic-only preflight used one synthetic event and did not execute the required 24-hour window.';
    report.end_utc = new Date().toISOString();
    await appendRecord('diagnostic_preflight_complete', { event_id: marker.id, relay_count: VARIABLES.relayCount,
      bridge_count: VARIABLES.bridgeCount, acceptance_status: 'NOT_RUN' });
    await saveReport();
    process.stdout.write(JSON.stringify({ run_id: RUN_ID, status: report.status, gate_eligible: false,
      relay_count: report.relay_count, bridge_count: report.bridge_count, output }) + '\n');
    return;
  }

  wallStartMs = Date.now();
  monotonicStartMs = performance.now();
  bootStartSeconds = await readBootSeconds();
  report.start_utc = new Date(wallStartMs).toISOString();
  report.boot_seconds_at_start = bootStartSeconds;
  report.monotonic_start_ms = monotonicStartMs;
  report.persistence_marker_id = marker.id;
  report.status = 'RUNNING';
  await appendRecord('run_started', { start_utc: report.start_utc, boot_seconds: bootStartSeconds,
    required_duration_seconds: VARIABLES.requiredDurationSeconds, persistence_marker_id: marker.id });
  await saveReport();
  process.stdout.write(JSON.stringify({ run_id: RUN_ID, status: 'RUNNING', start_utc: report.start_utc,
    candidate_commit: report.candidate_commit, output }) + '\n');

  let nextRestart = 0;
  let previousProbeBootSeconds = null;
  for (let index = 1; index <= VARIABLES.expectedProbeCount; index++) {
    const targetElapsedSeconds = (index - 1) * VARIABLES.probeIntervalSeconds;
    await waitForProbeTarget(bootStartSeconds + targetElapsedSeconds);
    const observedBootSeconds = await readBootSeconds();
    const elapsedSeconds = observedBootSeconds - bootStartSeconds;
    if (previousProbeBootSeconds !== null) {
      const gap = observedBootSeconds - previousProbeBootSeconds;
      report.maximum_observed_probe_gap_seconds = Math.max(report.maximum_observed_probe_gap_seconds, gap);
      if (gap > VARIABLES.maximumProbeGapSeconds) report.missed_probe_intervals++;
    }
    assert.equal(report.missed_probe_intervals, 0, 'no scheduled probe interval may be lost');

    while (nextRestart < VARIABLES.restartElapsedSeconds.length && elapsedSeconds >= VARIABLES.restartElapsedSeconds[nextRestart]) {
      await restartMiddleRelay(index, elapsedSeconds);
      nextRestart++;
    }

    const event = signEvent(`Property synthetic 24h probe ${String(index).padStart(4, '0')}`);
    const ack = await publishEvent(relayUrls[0], event);
    assert.equal(ack.accepted, true, `source relay rejected probe ${index}`);
    expectedEvents.set(event.id, event);
    for (const [relayIndex, url] of relayUrls.entries()) {
      await assertStoredExactlyOnce(url, event, `probe ${index} on relay ${relayIndex + 1}`);
    }

    const probe = {
      probe_index: index,
      scheduled_elapsed_seconds: targetElapsedSeconds,
      observed_elapsed_seconds: elapsedSeconds,
      observed_utc: new Date().toISOString(),
      event_id: event.id,
      source_ack: true,
      reconciled_relay_count: VARIABLES.relayCount,
      stored_once_at_each_relay: true,
      gap_from_previous_probe_seconds: previousProbeBootSeconds === null ? null : observedBootSeconds - previousProbeBootSeconds
    };
    report.probes.push(probe);
    report.probe_count++;
    previousProbeBootSeconds = observedBootSeconds;
    await appendRecord('probe_pass', probe);

    if (VARIABLES.uiSampleProbeCounts.includes(index)) await verifyUiOnce(index, event, 'scheduled sample');
    if (index % VARIABLES.resourceSampleEveryProbes === 0) await sampleResources(`probe-${index}`, index);

    if (index % 10 === 0 || index === 1 || index === VARIABLES.expectedProbeCount) await saveReport();
  }

  assert.equal(nextRestart, VARIABLES.restartElapsedSeconds.length, 'both planned restart/recovery windows completed');
  assert.equal(report.restart_cycles.length, VARIABLES.restartElapsedSeconds.length);
  assert.equal(report.probe_count, VARIABLES.expectedProbeCount, 'all 1,441 scheduled probes completed');
  assert.equal(report.missed_probe_intervals, 0, 'there were no missing scheduled probe windows');
  assert.equal(report.loss_count, 0, 'no acknowledged probe or partition event was lost');
  for (const cycle of report.restart_cycles) {
    assert.equal(cycle.partition_events.length, VARIABLES.partitionEventsPerRestart);
    assert.ok(cycle.partition_events.every(item => item.absent_at_destination_during_partition && item.reconciled_at_all_relays));
  }
  const reconciliation = await reconcileAllEvents();
  const endWallMs = Date.now();
  const endMonotonicMs = performance.now();
  const endBootSeconds = await readBootSeconds();
  report.end_utc = new Date(endWallMs).toISOString();
  report.boot_seconds_at_end = endBootSeconds;
  report.duration_wall_seconds = Number(((endWallMs - wallStartMs) / 1000).toFixed(3));
  report.duration_monotonic_seconds = Number(((endMonotonicMs - monotonicStartMs) / 1000).toFixed(3));
  report.duration_boot_seconds = Number((endBootSeconds - bootStartSeconds).toFixed(3));
  report.completed_probe_count = report.probe_count;
  report.reconciliation = reconciliation;
  assert.ok(report.duration_wall_seconds >= VARIABLES.requiredDurationSeconds, 'wall-clock duration reached 24 real hours');
  assert.ok(report.duration_monotonic_seconds >= VARIABLES.requiredDurationSeconds, 'monotonic duration reached 24 real hours');
  assert.ok(report.duration_boot_seconds >= VARIABLES.requiredDurationSeconds, 'Linux boot-time duration reached 24 real hours');
  assert.equal(reconciliation.expected_unique_event_count, report.probe_count + 1 + report.partition_events.length,
    'marker, probes and partition events reconciled as a unique corpus');
  await assertNoExternal(bridgeEvidence);
  report.external_requests = bridgeEvidence.external_requests;
  report.denied_proxy_attempts = bridgeEvidence.denied_proxy_attempts;
  report.page_errors = bridgeEvidence.page_errors;
  report.websockets = bridgeEvidence.websockets;
  assert.deepEqual(report.external_requests, [], 'no external browser requests occurred');
  assert.deepEqual(report.denied_proxy_attempts, [], 'no denied proxy attempt occurred');
  report.status = 'PASS';
  report.gate_eligible = true;
  report.reason = 'The complete real 24-hour multi-relay run passed every fixed topology, probe, recovery, UI, resource, privacy and reconciliation assertion.';
  await appendRecord('final_reconciliation_pass', { ...reconciliation, end_utc: report.end_utc,
    duration_wall_seconds: report.duration_wall_seconds, duration_monotonic_seconds: report.duration_monotonic_seconds,
    duration_boot_seconds: report.duration_boot_seconds });
  await saveReport();
  process.stdout.write(JSON.stringify({ run_id: RUN_ID, status: report.status, probe_count: report.probe_count,
    relay_count: report.relay_count, bridge_count: report.bridge_count, start_utc: report.start_utc,
    end_utc: report.end_utc, duration_wall_seconds: report.duration_wall_seconds, output }) + '\n');
}

try {
  await main();
} catch (error) {
  const wasInterrupted = Boolean(interruptedBy);
  report.status = wasInterrupted ? 'BLOCKED' : 'FAIL';
  report.gate_eligible = false;
  report.reason = safeText(error?.stack || error?.message || error);
  report.end_utc = new Date().toISOString();
  if (wallStartMs !== null) report.duration_wall_seconds = Number(((Date.now() - wallStartMs) / 1000).toFixed(3));
  if (monotonicStartMs !== null) report.duration_monotonic_seconds = Number(((performance.now() - monotonicStartMs) / 1000).toFixed(3));
  if (bootStartSeconds !== null) report.duration_boot_seconds = Number(((await readBootSeconds()) - bootStartSeconds).toFixed(3));
  if (relays.length) report.relay_processes_at_failure = relays.filter(Boolean).map(relay => ({
    label: relay.label, process_id: relay.child.pid, exit_code: relay.child.exitCode,
    diagnostic_tail: safeText(relay.diagnostic?.() || '').slice(-1_200)
  }));
  await appendRecord(wasInterrupted ? 'run_interrupted' : 'run_failed', { end_utc: report.end_utc,
    reason: report.reason, completed_probe_count: report.probe_count });
  await saveReport();
  process.stderr.write(JSON.stringify({ run_id: RUN_ID, status: report.status, reason: report.reason,
    completed_probe_count: report.probe_count, output }) + '\n');
  process.exitCode = wasInterrupted ? 130 : 1;
} finally {
  for (const bridge of [...bridges].reverse()) await closeNode(bridge).catch(error => cleanupFailures.push(`bridge cleanup: ${safeText(error.message)}`));
  for (const relay of [...relays].reverse()) if (relay) await stopGeode(relay).catch(error => cleanupFailures.push(`relay cleanup: ${safeText(error.message)}`));
  if (runtime?.browser) await runtime.browser.close().catch(error => cleanupFailures.push(`browser cleanup: ${safeText(error.message)}`));
  for (const server of [app?.server, proxy?.server]) if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections?.();
    }).catch(error => cleanupFailures.push(`local server cleanup: ${safeText(error.message)}`));
  }
  if (temp) await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    .catch(error => cleanupFailures.push(`private scratch cleanup: ${safeText(error.message)}`));
  if (cleanupFailures.length) {
    report.cleanup_failures = cleanupFailures;
    if (report.status === 'PASS') {
      report.status = 'FAIL';
      report.gate_eligible = false;
      report.reason = 'Cleanup did not prove every relay, browser and private scratch process was closed.';
      process.exitCode = 1;
    }
  }
  if (report.status === 'RUNNING' || report.status === 'PREFLIGHT') {
    report.status = 'BLOCKED';
    report.gate_eligible = false;
    report.reason ||= 'Harness ended before the real 24-hour acceptance window completed.';
    report.end_utc ||= new Date().toISOString();
  }
  await saveReport().catch(() => {});
}
