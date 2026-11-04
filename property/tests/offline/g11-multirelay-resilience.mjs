#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent,
  waitStored, wsQuery, startNode, closeNode, waitUntil, assertNoExternal } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestText, outputText] = process.argv.slice(2);
assert.ok(manifestText && outputText, 'a pinned manifest and output directory are required');
assert.equal(process.argv.length, 4, 'G11-06 uses only the fixed variables below');
const manifest = JSON.parse(await readFile(path.resolve(manifestText), 'utf8'));
const browserConfig = manifest.browser_automation;
assert.ok(browserConfig, 'the pinned browser runtime is required');

const VARIABLES = Object.freeze({
  probe_count: 96,
  restart_after_probe_counts: Object.freeze([24, 48, 72, 96]),
  restart_relay_index: 3,
  partition_events_per_restart: 3,
  relay_count: 7,
  bridge_count: 6,
  resource_sample_every_probes: 6,
  resource_max_scratch_bytes: 2 * 1024 ** 3,
  ui_deduplication_probe_counts: Object.freeze([1, 24, 48, 96]),
  fixed_event_epoch_seconds: 1_800_000_000,
  resource_max_memory_fraction: 0.70
});
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const reportPath = path.join(output, 'g11-multirelay-resilience-report.json');
const probesPath = path.join(output, 'g11-multirelay-resilience-probes.jsonl');
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g11-counted-relays-'));
const app = startAppServer(), proxy = startProxy();
let runtime, sender, relays = [], bridges = [], bridgeEvidence = null, failure = null;
const portsBase = Number(manifest.ports.seven_relay_base) + 200;
const relayUrls = Array.from({ length: VARIABLES.relay_count }, (_, index) => `ws://127.0.0.1:${portsBase + index}`);
const logicalClock = { epochMs: VARIABLES.fixed_event_epoch_seconds * 1000, idleDelayMs: 2_000_000_000 };
const report = {
  schema_version: 1,
  case: 'G11-06',
  status: 'RUNNING',
  gate_eligible: false,
  candidate_commit: manifest.candidate_commit,
  method: 'fixed_count_multirelay_resilience',
  predefined_variables: VARIABLES,
  completed_probe_count: 0,
  expected_probe_count: VARIABLES.probe_count,
  relay_count: VARIABLES.relay_count,
  bridge_count: VARIABLES.bridge_count,
  relays: [],
  bridges: [],
  failure_cycles: [],
  probe_ids: [],
  ui_deduplication_samples: [],
  resource_samples: [],
  external_requests: [],
  denied_proxy_attempts: [],
  websockets: [],
  page_errors: []
};

async function saveReport() {
  const tempPath = `${reportPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await (await import('node:fs/promises')).rename(tempPath, reportPath);
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

async function sampleResources(checkpoint) {
  const relayProcesses = relays.map(relay => ({ label: relay.label, pid: relay.child.pid, rss_bytes: processRss(relay.child) }));
  const sample = {
    checkpoint,
    relay_processes: relayProcesses,
    aggregate_relay_rss_bytes: relayProcesses.reduce((sum, relay) => sum + relay.rss_bytes, 0),
    available_memory_bytes: os.freemem(),
    scratch_bytes: await treeBytes(temp)
  };
  assert.equal(relayProcesses.length, VARIABLES.relay_count, 'all seven relays must be present at each resource checkpoint');
  assert.ok(relayProcesses.every(relay => relay.rss_bytes > 0), 'all seven relay processes must have measurable RSS');
  assert.ok(sample.aggregate_relay_rss_bytes <= Math.floor(report.resource_budget.available_memory_at_start_bytes * VARIABLES.resource_max_memory_fraction),
    'aggregate relay RSS exceeded the fixed memory budget');
  assert.ok(sample.scratch_bytes <= VARIABLES.resource_max_scratch_bytes, 'relay scratch exceeded the fixed two GiB budget');
  report.resource_samples.push(sample);
}

function signEvent(content) {
  return runtime.sign(1, content, VARIABLES.fixed_event_epoch_seconds, sender.secret);
}

async function assertStoredExactlyOnce(url, event, context) {
  await waitStored(url, event.id, true, 30_000); // Watchdog only; PASS depends on exact event counts below.
  const matches = await wsQuery(url, { ids: [event.id], limit: 2 }, 10_000);
  assert.equal(matches.length, 1, `${context}: event must be stored once at ${url}`);
  assert.equal(matches[0].id, event.id);
}

async function probe(index) {
  const event = signEvent(`Property fixed-count relay probe ${index + 1}`);
  const ack = await publishEvent(relayUrls[0], event);
  assert.equal(ack.accepted, true, `source relay rejected probe ${index + 1}`);
  for (const [relayIndex, url] of relayUrls.entries()) {
    await assertStoredExactlyOnce(url, event, `probe ${index + 1}, relay ${relayIndex + 1}`);
  }
  report.completed_probe_count++;
  report.probe_ids.push(event.id);
  await appendFile(probesPath, JSON.stringify({
    probe: index + 1,
    event_id: event.id,
    accepted_at_source: true,
    stored_once_at_all_seven_relays: true
  }) + '\n', { mode: 0o600 });
  if ((index + 1) % VARIABLES.resource_sample_every_probes === 0) await sampleResources(`probe-${index + 1}`);
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
      event.id, { timeout: 20_000 }); // UI readiness watchdog; not a duration assertion.
    const cards = await bridge.page.locator(`[data-event-id="${event.id}"]`).count();
    assert.equal(cards, 1, `${bridge.label}: each sampled probe must render exactly once`);
    results.push({ bridge: bridge.label, card_count: cards });
  }
  report.ui_deduplication_samples.push({ probe_count: probeCount, event_id: event.id, bridges: results });
}

async function restartAndReconcile(cycleNumber, probeCount) {
  const index = VARIABLES.restart_relay_index;
  const relay = relays[index];
  const cycle = {
    cycle: cycleNumber,
    after_probe_count: probeCount,
    relay_index: index,
    relay_label: relay.label,
    partition_events: [],
    same_database_on_restart: true
  };
  const oldUrl = relay.url;
  const affectedBridges = bridges.filter(bridge => bridge.subscriptions.some(item => item.relay === oldUrl && item.kinds.includes(1)));
  assert.equal(affectedBridges.length, 2, 'exactly two adjacent bridges must use the interrupted relay');
  const oldSubscriptionCounts = new Map(affectedBridges.map(bridge => [bridge,
    bridge.subscriptions.filter(item => item.relay === oldUrl).length]));
  await stopGeode(relay);

  for (let repetition = 1; repetition <= VARIABLES.partition_events_per_restart; repetition++) {
    const event = signEvent(`Property fixed-count partition ${cycleNumber}, event ${repetition}`);
    const ack = await publishEvent(relayUrls[0], event);
    assert.equal(ack.accepted, true, 'source relay must accept each outage event');
    await assertStoredExactlyOnce(relayUrls[0], event, 'partition source');
    const destinationMatches = await wsQuery(relayUrls.at(-1), { ids: [event.id], limit: 2 }, 10_000);
    assert.equal(destinationMatches.length, 0, 'partition event must be absent at the destination while the central relay is stopped');
    cycle.partition_events.push({ id: event.id, source_ack: true, absent_at_destination_during_outage: true });
  }

  relays[index] = await startGeode(portsBase + index, temp, relay.label);
  report.relays[index] = { ...report.relays[index], process_id: relays[index].child.pid, restart_count: cycleNumber };
  await waitUntil(async () => affectedBridges.every(bridge => {
    const subscriptions = bridge.subscriptions.filter(item => item.relay === oldUrl && item.kinds.includes(1));
    const latest = subscriptions.at(-1);
    return subscriptions.length > oldSubscriptionCounts.get(bridge) && Boolean(latest &&
      bridge.eoses.some(item => item.relay === oldUrl && item.id === latest.id));
  }), 45_000, 'adjacent bridges did not resubscribe to the restarted relay'); // Readiness watchdog only.

  for (const item of cycle.partition_events) {
    const event = { id: item.id };
    for (const [relayIndex, url] of relayUrls.entries()) {
      await assertStoredExactlyOnce(url, event, `recovered partition event at relay ${relayIndex + 1}`);
    }
    item.reconciled_at_all_seven_relays = true;
  }
  cycle.reconciled_event_count = cycle.partition_events.length;
  report.failure_cycles.push(cycle);
  await sampleResources(`restart-${cycleNumber}-after-probe-${probeCount}`);
  await saveReport();
}

try {
  assert.equal(process.env.PROPERTY_NETWORK_ISOLATION, 'unshared-netns', 'G11-06 must run inside the verified offline network namespace');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(head, manifest.candidate_commit, 'the resilience source tree must match the manifest candidate commit');
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(browserConfig, proxy.server.address().port);
  report.browser = runtime.evidence;

  for (let index = 0; index < VARIABLES.relay_count; index++) {
    const label = `resilience relay ${index + 1}`;
    relays.push({ ...await startGeode(portsBase + index, temp, label), label });
  }
  bridgeEvidence = { nodes: [], external_requests: report.external_requests, denied_proxy_attempts: report.denied_proxy_attempts,
    websockets: report.websockets, page_errors: report.page_errors };
  for (let index = 0; index < VARIABLES.bridge_count; index++) {
    bridges.push(await startNode(runtime, origin, bridgeEvidence, `resilience bridge ${index + 1}`,
      [relayUrls[index], relayUrls[index + 1]], { bridge: true, logicalClock }));
  }
  await waitUntil(async () => bridges.length === VARIABLES.bridge_count && bridges.every((bridge, index) => {
    const expected = [relayUrls[index], relayUrls[index + 1]];
    return expected.every(url => bridge.subscriptions.some(item => item.relay === url && item.kinds.includes(1)));
  }), 45_000, 'six real PWA bridge nodes did not establish the seven-relay chain'); // Readiness watchdog only.

  sender = runtime.createIdentity();
  report.relays = relays.map((relay, index) => ({ index, url: relay.url, process_id: relay.child.pid,
    data_dir_mode: 'temporary private directory' }));
  report.bridges = bridges.map((bridge, index) => ({ index, label: bridge.label,
    connected_relays: [relayUrls[index], relayUrls[index + 1]], unique_node_identity: Boolean(bridge.id?.npub) }));
  assert.equal(new Set(bridges.map(bridge => bridge.id?.npub).filter(Boolean)).size, VARIABLES.bridge_count,
    'each bridge must have a distinct node identity');
  report.resource_budget = {
    available_memory_at_start_bytes: os.freemem(),
    maximum_aggregate_relay_rss_fraction: VARIABLES.resource_max_memory_fraction,
    maximum_scratch_bytes: VARIABLES.resource_max_scratch_bytes
  };
  await sampleResources('initial');
  await saveReport();

  let restartIndex = 0;
  for (let index = 0; index < VARIABLES.probe_count; index++) {
    const event = await probe(index);
    const probeCount = index + 1;
    if (VARIABLES.ui_deduplication_probe_counts.includes(probeCount)) await verifyUiOnce(probeCount, event);
    if (VARIABLES.restart_after_probe_counts[restartIndex] === probeCount) {
      await restartAndReconcile(restartIndex + 1, probeCount);
      restartIndex++;
    }
  }

  assert.equal(report.completed_probe_count, VARIABLES.probe_count, 'all 96 fixed-count probes must complete');
  assert.equal(report.failure_cycles.length, VARIABLES.restart_after_probe_counts.length, 'all four fixed-count restart cycles must complete');
  assert.deepEqual(report.failure_cycles.map(cycle => cycle.after_probe_count), [...VARIABLES.restart_after_probe_counts]);
  assert.ok(report.failure_cycles.every(cycle => cycle.partition_events.length === VARIABLES.partition_events_per_restart &&
    cycle.reconciled_event_count === VARIABLES.partition_events_per_restart &&
    cycle.partition_events.every(item => item.absent_at_destination_during_outage && item.reconciled_at_all_seven_relays)),
  'each of the twelve partition events must be absent during outage and reconciled once across all relays');
  assert.equal(report.ui_deduplication_samples.length, VARIABLES.ui_deduplication_probe_counts.length,
    'all four predefined UI deduplication checkpoints must complete');
  assert.ok(report.ui_deduplication_samples.every(sample => sample.bridges.length === VARIABLES.bridge_count &&
    sample.bridges.every(bridge => bridge.card_count === 1)), 'each sampled probe must appear once on all six bridges');
  const probeResourceCheckpoints = report.resource_samples.filter(sample => /^probe-/.test(sample.checkpoint));
  assert.deepEqual(probeResourceCheckpoints.map(sample => Number(sample.checkpoint.slice(6))),
    Array.from({ length: VARIABLES.probe_count / VARIABLES.resource_sample_every_probes }, (_, index) => (index + 1) * VARIABLES.resource_sample_every_probes),
    'resource probes must match the exact six-probe checkpoints');
  assert.equal(report.resource_samples.filter(sample => /^restart-/.test(sample.checkpoint)).length,
    VARIABLES.restart_after_probe_counts.length, 'each restart must have one post-reconciliation resource sample');
  await assertNoExternal(bridgeEvidence);
  report.external_requests = bridgeEvidence.external_requests;
  report.denied_proxy_attempts = proxy.attempts;
  report.websockets = bridgeEvidence.websockets;
  report.page_errors = bridgeEvidence.page_errors;
  assert.equal(report.external_requests.length, 0, 'no external HTTP requests may escape the browser harness');
  assert.ok(report.websockets.every(url => url.startsWith('ws://127.0.0.1:')), 'all observed WebSockets must remain on loopback');
  report.status = 'PASS';
  report.gate_eligible = true;
} catch (error) {
  failure = error;
  report.status = 'FAIL';
  report.gate_eligible = false;
  report.failure = String(error?.message || error).slice(0, 1000);
} finally {
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
  await import('node:fs/promises').then(fs => fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  if (failure) {
    report.status = 'FAIL';
    report.gate_eligible = false;
    ['later-gates/g11-06/g11-multirelay-resilience-report.json',
      'later-gates/g11-06/g11-multirelay-resilience-probes.jsonl'].forEach(file => {
      report.evidence ||= [];
      report.evidence.push(file);
    });
  }
  await saveReport();
}

process.stdout.write(JSON.stringify({ status: report.status, gate_eligible: report.gate_eligible,
  probes: report.completed_probe_count, restarts: report.failure_cycles.length,
  partition_events_reconciled: report.failure_cycles.reduce((total, cycle) => total + (cycle.reconciled_event_count || 0), 0) }) + '\n');
process.exitCode = report.status === 'PASS' ? 0 : 1;
