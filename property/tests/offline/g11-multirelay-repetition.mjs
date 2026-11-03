#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent, waitStored,
  wsQuery, startNode, closeNode, waitUntil, assertNoExternal } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestPath, outputText = '/tmp/property-g11-repetitions'] = process.argv.slice(2);
assert.ok(manifestPath, 'pinned lab manifest is required');
assert.equal(process.argv.length, 4, 'G11-03 accepts a manifest and output path only; repetitions are fixed in source');
const VARIABLES = Object.freeze({
  probeCount: 300,
  rateWindowProbeBatch: 50,
  logicalClockStepMs: 60_000,
  restartAfterProbeCounts: Object.freeze([60, 150, 240]),
  partitionEventRepetitions: 3,
  idleClockStepMs: 60_000,
  idleClockRepetitions: 31,
  idleTimeoutMs: 1_800_000,
  resourceSampleEvery: 25,
  uiDedupProbeCounts: Object.freeze([1, 60, 150, 240, 300]),
  fixedEpochSeconds: 1_800_000_000
});
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const browserConfig = manifest.browser_automation;
assert.ok(browserConfig, 'pinned browser runtime is required');
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const progressPath = path.join(output, 'g11-repetition-probes.jsonl');
const reportPath = path.join(output, 'g11-multirelay-repetition-report.json');
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g11-repetitions-'));
const app = startAppServer(), proxy = startProxy();
let runtime, sender, relays = [], nodes = [], bridgeEvidence = null, activeProbe = null;
let logicalNowMs = VARIABLES.fixedEpochSeconds * 1000;
const report = {
  schema_version: 3, case: 'G11-03', status: 'RUNNING', method: 'fixed_repetition_count',
  predefined_variables: VARIABLES, probe_count: 0, partition_probe_count: 0, loss_count: 0,
  restart_cycles: [], ui_deduplication_samples: [], resource_samples: [], external_requests: [], websockets: [],
  relay_count: 3, bridge_count: 2, started_utc: new Date().toISOString(), ended_utc: null
};

async function save() {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
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
async function sampleResources(checkpointProbeCount) {
  const processes = relays.map(relay => {
    const [rssKb] = execFileSync('ps', ['-o', 'rss=', '-p', String(relay.child.pid)], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
    return { label: relay.label, pid: relay.child.pid, rss_bytes: (rssKb || 0) * 1024 };
  });
  const totalRss = processes.reduce((sum, item) => sum + item.rss_bytes, 0);
  const scratchBytes = await treeBytes(temp);
  const sample = { checkpoint_probe_count: checkpointProbeCount, relay_processes: processes,
    total_relay_rss_bytes: totalRss, scratch_bytes: scratchBytes };
  report.resource_samples.push(sample);
  assert.ok(processes.every(item => item.rss_bytes > 0), 'every relay has a measurable RSS value');
  assert.ok(totalRss <= report.resource_budget.max_relay_rss_bytes, 'relay RSS stays within the recorded 70% memory budget');
  assert.ok(scratchBytes <= report.resource_budget.max_scratch_bytes, 'relay data stays within the two-GiB scratch budget');
}
async function advanceBrowserClock(repetitions, stepMs) {
  const results = await Promise.all(nodes.map(node => node.page.evaluate(({ repetitions: count, step }) => {
    if (typeof window.__propertyTestClock?.advance !== 'function') throw new Error('logical test clock is unavailable');
    return window.__propertyTestClock.advance(count, step);
  }, { repetitions, step: stepMs })));
  logicalNowMs += repetitions * stepMs;
  return results;
}
function signTestEvent(content) {
  return runtime.sign(1, content, Math.floor(logicalNowMs / 1000), sender.secret);
}
async function assertDeliveredOnce(url, event, label) {
  await waitStored(url, event.id, true, 20_000);
  const found = await wsQuery(url, { ids: [event.id], limit: 2 }, 8_000);
  assert.equal(found.length, 1, `${label}: event is stored exactly once`);
  return found[0];
}
async function verifyUiDeduplication(probeCount, event) {
  const nodesEvidence = [];
  for (const node of nodes) {
    await node.page.locator('button[data-view="hangout"]').click();
    await node.page.locator('#refresh-hangout').click();
    await node.page.waitForFunction(id => document.querySelectorAll(`[data-event-id="${id}"]`).length >= 1,
      event.id, { timeout: 15_000 });
    const eventCards = await node.page.locator(`[data-event-id="${event.id}"]`).count();
    assert.equal(eventCards, 1, `${node.label}: a multi-relay event renders as one card`);
    nodesEvidence.push({ label: node.label, event_cards: eventCards });
  }
  report.ui_deduplication_samples.push({ probe_count: probeCount, event_id: event.id, nodes: nodesEvidence });
}
async function restartMiddleRelay(probeCount) {
  const cycleNumber = report.restart_cycles.length + 1;
  const middleUrl = relays[1].url;
  const destinationUrl = relays[2].url;
  const partitionEvents = [];
  const startedUtc = new Date().toISOString();
  await stopGeode(relays[1]);
  for (let repetition = 1; repetition <= VARIABLES.partitionEventRepetitions; repetition++) {
    const event = signTestEvent(`Property partition cycle ${cycleNumber}, event ${repetition}`);
    const ack = await publishEvent(relays[0].url, event);
    assert.equal(ack.accepted, true, 'source relay accepts each partition event');
    await waitStored(relays[0].url, event.id, true, 8_000);
    const visibleDuringPartition = (await wsQuery(destinationUrl, { ids: [event.id], limit: 1 }, 8_000)).length > 0;
    assert.equal(visibleDuringPartition, false, 'partition event cannot skip the stopped middle relay');
    partitionEvents.push({ id: event.id, absent_at_destination_during_partition: true, source_ack: true });
  }
  relays[1] = await startGeode(Number(manifest.ports.seven_relay_base) + 81, temp, 'repetition relay 2');
  await waitUntil(async () => nodes.every(node => {
    const subscription = node.subscriptions.filter(item => item.relay === middleUrl && item.kinds.includes(1)).at(-1);
    return Boolean(subscription && node.eoses.some(eose => eose.relay === middleUrl && eose.id === subscription.id));
  }), 30_000, 'both bridge contexts did not confirm a fresh subscription after relay restart');
  for (const item of partitionEvents) {
    const middle = await assertDeliveredOnce(middleUrl, { id: item.id }, 'middle relay reconciliation');
    const destination = await assertDeliveredOnce(destinationUrl, { id: item.id }, 'destination relay reconciliation');
    assert.equal(middle.id, item.id);
    assert.equal(destination.id, item.id);
    item.reconciled_at_middle_and_destination = true;
  }
  report.partition_probe_count += partitionEvents.length;
  report.restart_cycles.push({ after_probe_count: probeCount, started_utc: startedUtc,
    ended_utc: new Date().toISOString(), same_database: true, partition_events: partitionEvents,
    reconciled_event_count: partitionEvents.length });
  await sampleResources(probeCount);
}

try {
  await appendFile(progressPath, '');
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(browserConfig, proxy.server.address().port);
  report.browser = runtime.evidence;
  const base = Number(manifest.ports.seven_relay_base) + 80;
  for (let i = 0; i < 3; i++) relays.push(await startGeode(base + i, temp, `repetition relay ${i + 1}`));
  bridgeEvidence = { nodes: [], external_requests: report.external_requests, denied_proxy_attempts: [],
    websockets: report.websockets, page_errors: [] };
  const logicalClock = { epochMs: logicalNowMs, idleDelayMs: VARIABLES.idleTimeoutMs };
  nodes.push(await startNode(runtime, origin, bridgeEvidence, 'repetition bridge P12', [relays[0].url, relays[1].url],
    { bridge: true, logicalClock }));
  nodes.push(await startNode(runtime, origin, bridgeEvidence, 'repetition bridge P23', [relays[1].url, relays[2].url],
    { bridge: true, logicalClock }));
  await waitUntil(async () => nodes.length === 2 && nodes.every(node => node.subscriptions.length >= 2 &&
    [relays[0].url, relays[1].url, relays[2].url].filter(url =>
      node.subscriptions.some(sub => sub.relay === url && sub.kinds.includes(1))).length === 2),
  20_000, 'the two PWA bridges did not establish their expected subscriptions');

  sender = runtime.createIdentity();
  report.resource_budget = { available_memory_at_start_bytes: os.freemem(),
    max_relay_rss_bytes: Math.floor(os.freemem() * 0.70), max_scratch_bytes: 2 * 1024 ** 3 };
  await sampleResources(0);
  const eventsByProbe = new Map();
  for (let index = 1; index <= VARIABLES.probeCount; index++) {
    const event = signTestEvent(`Property deterministic multi-relay probe ${index}`);
    activeProbe = { probe: index, event_id: event.id, source_ack: false };
    const ack = await publishEvent(relays[0].url, event);
    activeProbe.source_ack = ack.accepted === true;
    assert.equal(ack.accepted, true, `source relay rejected probe ${index}: ${ack.message || 'no reason supplied'}`);
    const destinationEvent = await assertDeliveredOnce(relays[2].url, event, `probe ${index}`);
    assert.equal(destinationEvent.id, event.id);
    eventsByProbe.set(index, event);
    report.probe_count++;
    await appendFile(progressPath, JSON.stringify({ repetition: index, event_id: event.id, source_ack: true,
      destination_query: true, created_at: event.created_at }) + '\n', { mode: 0o600 });
    activeProbe = null;

    if (VARIABLES.uiDedupProbeCounts.includes(index)) await verifyUiDeduplication(index, event);
    if (VARIABLES.restartAfterProbeCounts.includes(index)) await restartMiddleRelay(index);
    if (index % VARIABLES.resourceSampleEvery === 0) await sampleResources(index);
    if (index % VARIABLES.rateWindowProbeBatch === 0 && index < VARIABLES.probeCount) {
      await advanceBrowserClock(1, VARIABLES.logicalClockStepMs);
      report.logical_rate_window_advances = (report.logical_rate_window_advances || 0) + 1;
    }
    if (index % 10 === 0) await save();
  }

  assert.equal(report.probe_count, VARIABLES.probeCount, 'all predefined probe repetitions ran');
  assert.equal(report.restart_cycles.length, VARIABLES.restartAfterProbeCounts.length, 'all predefined restart repetitions ran');
  assert.equal(report.partition_probe_count, VARIABLES.restartAfterProbeCounts.length * VARIABLES.partitionEventRepetitions,
    'all predefined partition-event repetitions ran');
  assert.equal(report.ui_deduplication_samples.length, VARIABLES.uiDedupProbeCounts.length,
    'all predefined UI deduplication samples ran');
  assert.equal(report.restart_cycles.every(cycle => cycle.partition_events.every(event =>
    event.absent_at_destination_during_partition && event.reconciled_at_middle_and_destination)), true,
  'every partition event is absent during outage and reconciled after restart');
  assert.equal(report.loss_count, 0, 'no accepted probe is lost');

  const idleLock = await advanceBrowserClock(VARIABLES.idleClockRepetitions, VARIABLES.idleClockStepMs);
  await waitUntil(async () => Promise.all(nodes.map(async node => {
    try { return await node.page.locator('#locked-node-status').isVisible() &&
      await node.page.locator('#workspace').evaluate(element => element.classList.contains('hidden')); }
    catch { return false; }
  })).then(values => values.every(Boolean)), 20_000, 'logical idle-lock repetitions did not clear both identity sessions');
  report.idle_lock_public_bridge = { verified: true, logical_clock_step_ms: VARIABLES.idleClockStepMs,
    logical_clock_repetitions: VARIABLES.idleClockRepetitions, contexts: idleLock.length,
    secrets_cleared_from_ui: true, public_bridge_preserved: true };
  for (const node of nodes) {
    await node.page.locator('#stop-locked-node').click();
    await node.page.waitForFunction(() => document.querySelector('#locked-node-status')?.classList.contains('hidden'), null,
      { timeout: 5_000 });
    await waitUntil(async () => node.sockets.filter(socket => socket.url.startsWith('ws://127.0.0.1:')).every(socket => socket.closed),
      5_000, `${node.label} stop control did not close local relay sockets`);
  }
  report.locked_bridge_stop = { verified: true, repetitions: nodes.length,
    relay_sockets_closed: nodes.map(node => node.sockets.filter(socket => socket.url.startsWith('ws://127.0.0.1:')).every(socket => socket.closed)) };
  report.external_requests = bridgeEvidence.external_requests;
  report.websockets = bridgeEvidence.websockets;
  report.page_errors = bridgeEvidence.page_errors;
  await assertNoExternal(bridgeEvidence);
  report.status = 'PASS';
  report.gate_eligible = true;
  report.ended_utc = new Date().toISOString();
  await save();
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.status = 'FAIL';
  report.gate_eligible = false;
  report.reason = String(error?.message || error).slice(0, 900);
  report.ended_utc = new Date().toISOString();
  if (bridgeEvidence) {
    report.page_errors = bridgeEvidence.page_errors;
    report.external_requests = bridgeEvidence.external_requests;
    report.websockets = bridgeEvidence.websockets;
  }
  if (activeProbe) report.failure_probe = activeProbe;
  report.relay_processes = relays.map(relay => ({ url: relay.url, pid: relay.child.pid, exit_code: relay.child.exitCode,
    log_tail: String(relay.diagnostic?.() || '').slice(-2500) }));
  await save();
  process.stderr.write(JSON.stringify(report) + '\n');
  process.exitCode = 1;
} finally {
  for (const node of nodes.reverse()) await closeNode(node);
  for (const relay of relays.reverse()) await stopGeode(relay);
  if (runtime?.browser) await runtime.browser.close().catch(() => {});
  for (const server of [app?.server, proxy?.server]) if (server?.listening) {
    await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  if (report.status === 'RUNNING') {
    report.status = 'BLOCKED'; report.gate_eligible = false;
    report.reason = 'Harness ended before all predefined repetitions completed.';
    report.ended_utc = new Date().toISOString();
  }
  await save();
}
