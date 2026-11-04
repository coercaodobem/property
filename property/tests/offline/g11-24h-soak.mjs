#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent, waitStored,
  wsQuery, startNode, closeNode, waitUntil, assertNoExternal } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestText, outputText] = process.argv.slice(2);
assert.ok(manifestText && outputText, 'a pinned manifest and output directory are required');
assert.equal(process.argv.length, 4, 'G11-06 timing and repetition values are fixed in source');
const manifest = JSON.parse(await readFile(path.resolve(manifestText), 'utf8'));
const browserConfig = manifest.browser_automation;
assert.ok(browserConfig, 'the pinned browser runtime is required');
const VARIABLES = Object.freeze({
  required_duration_ms: 86_400_000,
  probe_count: 96,
  probe_interval_ms: 900_000,
  failure_offsets_ms: Object.freeze([21_600_000, 43_200_000, 64_800_000, 82_800_000]),
  restart_relay_index: 3,
  partition_event_count_per_cycle: 3,
  resource_sample_every_probes: 6,
  resource_max_scratch_bytes: 2 * 1024 ** 3,
  idle_heartbeat_interval_ms: 300_000,
  schedule_lateness_limit_ms: 120_000,
  fixed_epoch_note: 'Event timestamps use the current UTC clock; duration uses the monotonic process clock.'
});
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const reportPath = path.join(output, 'g11-24h-soak-report.json');
const probesPath = path.join(output, 'g11-24h-probes.jsonl');
const heartbeatPath = path.join(output, 'g11-24h-heartbeats.jsonl');
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g11-24h-soak-'));
const app = startAppServer(), proxy = startProxy();
let runtime, sender, relays = [], bridges = [], bridgeEvidence = null, failure = null;
const portsBase = Number(manifest.ports.seven_relay_base) + 200;
const relayUrls = Array.from({ length: 7 }, (_, index) => `ws://127.0.0.1:${portsBase + index}`);
let monotonicStart = null;
const report = {
  schema_version: 1, case: 'G11-06', status: 'RUNNING', gate_eligible: false,
  candidate_commit: manifest.candidate_commit, method: 'real_monotonic_24_hour_soak',
  predefined_variables: VARIABLES, execution_started_utc: new Date().toISOString(), started_utc: null, ended_utc: null,
  monotonic_duration_ms: null, completed_probe_count: 0, expected_probe_count: VARIABLES.probe_count,
  relay_count: 7, bridge_count: 6, relays: [], bridges: [], failure_cycles: [],
  probe_ids: [], ui_deduplication_samples: [], resource_samples: [], external_requests: [], denied_proxy_attempts: [], websockets: [], page_errors: []
};

async function saveReport() {
  report.last_checkpoint_utc = new Date().toISOString();
  report.monotonic_elapsed_ms = monotonicStart ? Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n) : 0;
  const tempPath = `${reportPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await rename(tempPath, reportPath);
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

function processRss(child) {
  const result = spawnSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8', timeout: 5000 });
  const value = Number((result.stdout || '').trim());
  return result.status === 0 && Number.isFinite(value) ? value * 1024 : 0;
}

async function sampleResources(probeCount) {
  const relayProcesses = relays.map(relay => ({ label: relay.label, pid: relay.child.pid, rss_bytes: processRss(relay.child) }));
  const sample = { probe_count: probeCount, sampled_utc: new Date().toISOString(), relay_processes: relayProcesses,
    aggregate_relay_rss_bytes: relayProcesses.reduce((sum, relay) => sum + relay.rss_bytes, 0),
    available_memory_bytes: os.freemem(), scratch_bytes: await treeBytes(temp) };
  assert.ok(relayProcesses.every(relay => relay.rss_bytes > 0), 'all seven relay processes must have measurable RSS');
  assert.ok(sample.aggregate_relay_rss_bytes <= Math.floor(report.resource_budget.available_memory_at_start_bytes * 0.70),
    'aggregate relay RSS exceeded 70 percent of available memory at soak start');
  assert.ok(sample.scratch_bytes <= VARIABLES.resource_max_scratch_bytes, 'relay scratch exceeded the two GiB budget');
  report.resource_samples.push(sample);
}

function signEvent(content) {
  return runtime.sign(1, content, Math.floor(Date.now() / 1000), sender.secret);
}

async function assertStoredExactlyOnce(url, event, context) {
  await waitStored(url, event.id, true, 30_000);
  const matches = await wsQuery(url, { ids: [event.id], limit: 2 }, 10_000);
  assert.equal(matches.length, 1, `${context}: event must be stored once at ${url}`);
  assert.equal(matches[0].id, event.id);
}

async function probe(index, scheduledOffsetMs) {
  const event = signEvent(`Property 24-hour relay soak probe ${index + 1}`);
  const ack = await publishEvent(relayUrls[0], event);
  assert.equal(ack.accepted, true, `source relay rejected soak probe ${index + 1}`);
  for (const [relayIndex, url] of relayUrls.entries()) await assertStoredExactlyOnce(url, event, `probe ${index + 1}, relay ${relayIndex + 1}`);
  report.completed_probe_count++;
  report.probe_ids.push(event.id);
  const row = { probe: index + 1, scheduled_offset_ms: scheduledOffsetMs,
    actual_offset_ms: Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n), event_id: event.id,
    accepted_at_source: true, stored_once_at_all_seven_relays: true, observed_utc: new Date().toISOString() };
  await appendFile(probesPath, JSON.stringify(row) + '\n', { mode: 0o600 });
  if ((index + 1) % VARIABLES.resource_sample_every_probes === 0) await sampleResources(index + 1);
  await assertNoExternal(bridgeEvidence);
  await saveReport();
  return event;
}

async function verifyUiOnce(probeCount, event) {
  const results = [];
  for (const bridge of bridges) {
    await bridge.page.locator('button[data-view="hangout"]').click();
    await bridge.page.locator('#refresh-hangout').click();
    await bridge.page.waitForFunction(id => document.querySelectorAll(`[data-event-id="${id}"]`).length >= 1,
      event.id, { timeout: 20_000 });
    const cards = await bridge.page.locator(`[data-event-id="${event.id}"]`).count();
    assert.equal(cards, 1, `${bridge.label}: the soak event must render once`);
    results.push({ bridge: bridge.label, card_count: cards });
  }
  report.ui_deduplication_samples.push({ probe_count: probeCount, event_id: event.id, bridges: results });
}

async function restartAndReconcile(offsetMs) {
  const index = VARIABLES.restart_relay_index;
  const relay = relays[index];
  const cycle = { cycle: report.failure_cycles.length + 1, scheduled_offset_ms: offsetMs,
    relay_index: index, relay_label: relay.label, started_utc: new Date().toISOString(),
    partition_events: [], same_database_on_restart: true };
  const oldUrl = relay.url;
  const affectedBridges = bridges.filter(bridge => bridge.subscriptions.some(item => item.relay === oldUrl && item.kinds.includes(1)));
  assert.equal(affectedBridges.length, 2, 'exactly two adjacent bridges must use the interrupted relay');
  const oldSubscriptionCounts = new Map(affectedBridges.map(bridge => [bridge, bridge.subscriptions.filter(item => item.relay === oldUrl).length]));
  await stopGeode(relay);
  for (let repetition = 1; repetition <= VARIABLES.partition_event_count_per_cycle; repetition++) {
    const event = signEvent(`Property 24-hour partition ${cycle.cycle}, event ${repetition}`);
    const ack = await publishEvent(relayUrls[0], event);
    assert.equal(ack.accepted, true, 'source relay must accept each outage event');
    await assertStoredExactlyOnce(relayUrls[0], event, 'partition source');
    await waitStored(relayUrls.at(-1), event.id, false, 10_000);
    cycle.partition_events.push({ id: event.id, source_ack: true, absent_at_destination_during_outage: true });
  }
  relays[index] = await startGeode(portsBase + index, temp, relay.label);
  report.relays[index] = { ...report.relays[index], process_id: relays[index].child.pid,
    restart_count: cycle.cycle, last_restarted_utc: new Date().toISOString() };
  await waitUntil(async () => affectedBridges.every(bridge => {
    const subscriptions = bridge.subscriptions.filter(item => item.relay === oldUrl && item.kinds.includes(1));
    const latest = subscriptions.at(-1);
    return subscriptions.length > oldSubscriptionCounts.get(bridge) && Boolean(latest &&
      bridge.eoses.some(item => item.relay === oldUrl && item.id === latest.id));
  }), 45_000, 'adjacent bridges did not resubscribe to the restarted relay');
  for (const item of cycle.partition_events) {
    const event = { id: item.id };
    for (const [relayIndex, url] of relayUrls.entries()) await assertStoredExactlyOnce(url, event, `recovered partition event at relay ${relayIndex + 1}`);
    item.reconciled_at_all_seven_relays = true;
  }
  cycle.ended_utc = new Date().toISOString();
  cycle.reconciled_event_count = cycle.partition_events.length;
  report.failure_cycles.push(cycle);
  await appendFile(heartbeatPath, JSON.stringify({ type: 'relay_restart_reconciled', cycle: cycle.cycle,
    observed_utc: cycle.ended_utc, offset_ms: Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n) }) + '\n', { mode: 0o600 });
  await sampleResources(report.completed_probe_count);
  await saveReport();
}

async function waitUntilOffset(targetOffsetMs) {
  const target = monotonicStart + BigInt(targetOffsetMs) * 1_000_000n;
  while (process.hrtime.bigint() < target) {
    const now = process.hrtime.bigint();
    const remainingMs = Number((target - now) / 1_000_000n);
    await new Promise(resolve => setTimeout(resolve, Math.min(remainingMs, VARIABLES.idle_heartbeat_interval_ms)));
    report.monotonic_elapsed_ms = Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n);
    report.last_checkpoint_utc = new Date().toISOString();
    await appendFile(heartbeatPath, JSON.stringify({ type: 'heartbeat', elapsed_ms: report.monotonic_elapsed_ms,
      observed_utc: report.last_checkpoint_utc, completed_probe_count: report.completed_probe_count }) + '\n', { mode: 0o600 });
    await assertNoExternal(bridgeEvidence);
    await saveReport();
  }
}

try {
  assert.equal(process.env.PROPERTY_NETWORK_ISOLATION, 'unshared-netns', 'G11-06 must run inside the verified offline network namespace');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(head, manifest.candidate_commit, 'the soak source tree must match the manifest candidate commit');
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(browserConfig, proxy.server.address().port);
  report.browser = runtime.evidence;
  for (let index = 0; index < 7; index++) {
    const label = `soak relay ${index + 1}`;
    relays.push({ ...await startGeode(portsBase + index, temp, label), label });
  }
  bridgeEvidence = { nodes: [], external_requests: report.external_requests, denied_proxy_attempts: report.denied_proxy_attempts,
    websockets: report.websockets, page_errors: report.page_errors };
  for (let index = 0; index < 6; index++) {
    bridges.push(await startNode(runtime, origin, bridgeEvidence, `soak bridge ${index + 1}`,
      [relayUrls[index], relayUrls[index + 1]], { bridge: true }));
  }
  await waitUntil(async () => bridges.length === 6 && bridges.every((bridge, index) => {
    const expected = [relayUrls[index], relayUrls[index + 1]];
    return expected.every(url => bridge.subscriptions.some(item => item.relay === url && item.kinds.includes(1)));
  }), 45_000, 'six real PWA bridge nodes did not establish the seven-relay chain');
  sender = runtime.createIdentity();
  monotonicStart = process.hrtime.bigint();
  report.started_utc = new Date().toISOString();
  report.relays = relays.map((relay, index) => ({ index, url: relay.url, process_id: relay.child.pid,
    data_dir_mode: 'temporary private directory' }));
  report.bridges = bridges.map((bridge, index) => ({ index, label: bridge.label,
    connected_relays: [relayUrls[index], relayUrls[index + 1]], unique_node_identity: Boolean(bridge.id?.npub) }));
  report.resource_budget = { available_memory_at_start_bytes: os.freemem(), maximum_aggregate_relay_rss_percent: 70,
    maximum_scratch_bytes: VARIABLES.resource_max_scratch_bytes };
  await sampleResources(0);
  await saveReport();

  const failureOffsets = new Set(VARIABLES.failure_offsets_ms);
  for (let index = 0; index < VARIABLES.probe_count; index++) {
    const offset = index * VARIABLES.probe_interval_ms;
    await waitUntilOffset(offset);
    const latenessMs = Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n) - offset;
    assert.ok(latenessMs <= VARIABLES.schedule_lateness_limit_ms, `probe ${index + 1} missed its fixed schedule tolerance`);
    const event = await probe(index, offset);
    if ([0, 24, 48, 72].includes(index)) await verifyUiOnce(index + 1, event);
    if (failureOffsets.has(offset)) await restartAndReconcile(offset);
  }
  await waitUntilOffset(VARIABLES.required_duration_ms);
  report.monotonic_duration_ms = Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n);
  assert.ok(report.monotonic_duration_ms >= VARIABLES.required_duration_ms, 'real monotonic soak duration was shorter than 24 hours');
  assert.equal(report.completed_probe_count, VARIABLES.probe_count, 'all 96 scheduled probes must complete');
  assert.equal(report.failure_cycles.length, VARIABLES.failure_offsets_ms.length, 'all four scheduled relay failure cycles must complete');
  assert.ok(report.failure_cycles.every(cycle => cycle.partition_events.length === 3 &&
    cycle.partition_events.every(item => item.absent_at_destination_during_outage && item.reconciled_at_all_seven_relays)),
  'every outage event must be absent during interruption and reconciled after restart');
  await assertNoExternal(bridgeEvidence);
  report.external_requests = bridgeEvidence.external_requests;
  report.denied_proxy_attempts = proxy.attempts;
  report.websockets = bridgeEvidence.websockets;
  report.page_errors = bridgeEvidence.page_errors;
  assert.ok(report.external_requests.length === 0, 'no external HTTP requests may escape the browser harness');
  assert.ok(report.websockets.every(url => url.startsWith('ws://127.0.0.1:')), 'all observed WebSockets must remain on loopback');
  report.status = 'PASS';
  report.gate_eligible = true;
} catch (error) {
  failure = error;
  report.status = 'FAIL';
  report.gate_eligible = false;
  report.failure = String(error?.message || error).slice(0, 1000);
} finally {
  report.ended_utc = new Date().toISOString();
  report.monotonic_duration_ms = monotonicStart ? Number((process.hrtime.bigint() - monotonicStart) / 1_000_000n) : 0;
  report.external_requests = bridgeEvidence?.external_requests || report.external_requests;
  report.denied_proxy_attempts = proxy.attempts;
  report.websockets = bridgeEvidence?.websockets || report.websockets;
  report.page_errors = bridgeEvidence?.page_errors || report.page_errors;
  for (const bridge of bridges.reverse()) await closeNode(bridge);
  await runtime?.browser?.close().catch(() => {});
  for (const relay of relays.reverse()) await stopGeode(relay).catch(error => { failure ||= error; });
  for (const server of [app.server, proxy.server]) if (server.listening) await new Promise(resolve => {
    server.close(() => resolve()); server.closeAllConnections?.();
  });
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (failure) {
    report.status = 'FAIL';
    report.gate_eligible = false;
    report.failure ||= String(failure?.message || failure).slice(0, 1000);
  }
  await saveReport();
}

const evidencePaths = [reportPath, probesPath, heartbeatPath];
report.evidence = [];
for (const file of evidencePaths) {
  try {
    const bytes = await readFile(file);
    report.evidence.push({ path: path.basename(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) {
    report.status = 'FAIL';
    report.gate_eligible = false;
    report.failure ||= `Missing soak evidence: ${path.basename(file)} (${error?.message || error})`;
  }
}
await saveReport();
process.stdout.write(JSON.stringify({ case: report.case, status: report.status,
  elapsed_ms: report.monotonic_duration_ms, probes: report.completed_probe_count, failures: report.failure_cycles.length }) + '\n');
if (failure || report.status !== 'PASS') process.exitCode = 1;
