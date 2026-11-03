#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent, waitStored, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestPath, portText = '28540', outputText = '/tmp/property-g10-volume'] = process.argv.slice(2);
assert.ok(manifestPath);
const VARIABLES = Object.freeze({
  directMessageCount: 50,
  publicNoteCount: 100,
  bridgeCount: 3,
  notesPerLogicalRateWindow: 50,
  logicalClockStepMs: 60_000,
  fixedEpochSeconds: 1_800_000_000
});
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const config = manifest.browser_automation;
assert.ok(config);
const portBase = Number(portText), output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g10-volume-'));
const app = startAppServer(), proxy = startProxy();
const relays = [];
let runtime, browserContext;
let logicalNowMs = VARIABLES.fixedEpochSeconds * 1000;
const report = { schema_version: 2, case: 'G10-06', result: 'FAIL', predefined_variables: VARIABLES,
  initial_bundle_bytes: null, dm_count: 0, public_note_count: 0, relay_count: 4, bridge_count: VARIABLES.bridgeCount,
  dm_event_ids: [], public_event_ids: [], events_forwarded_per_bridge: [0, 0, 0],
  resource_checkpoints: [] };
async function folderBytes(root) {
  let total = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) total += (await stat(target)).size;
    }
  }
  await walk(root);
  return total;
}
async function rssFor(pid) {
  const { execFileSync } = await import('node:child_process');
  const result = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  return Number(result) * 1024 || 0;
}
async function save() {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(output, 'g10-volume-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
async function sampleResources(checkpoint) {
  report.resource_checkpoints.push({ checkpoint, child_rss_bytes: process.memoryUsage().rss,
    relay_rss_bytes: await Promise.all(relays.map(relay => rssFor(relay.child.pid))),
    relay_disk_bytes: await Promise.all(relays.map(relay => folderBytes(relay.data))) });
}
try {
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(config, proxy.server.address().port);
  browserContext = await runtime.browser.newContext({ serviceWorkers: 'allow' });
  await browserContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  const page = await browserContext.newPage();
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('#auth-choice').waitFor({ state: 'visible', timeout: 10_000 });
  report.initial_bundle_bytes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => new URL(entry.name).origin === location.origin)
    .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0));

  for (let index = 0; index < 4; index++) relays.push(await startGeode(portBase + index, temp, `G10 volume R${index + 1}`));
  const sender = runtime.createIdentity(), recipient = runtime.createIdentity();
  for (let index = 1; index <= VARIABLES.directMessageCount; index++) {
    const text = `Property offline deterministic direct message ${index}`;
    const wraps = runtime.wrapMany(sender.secret, recipient.pubkey, text);
    const wrap = wraps.find(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === recipient.pubkey));
    assert.ok(wrap, `NIP-17 creates recipient envelope ${index}`);
    assert.equal((await publishEvent(relays[3].url, wrap)).accepted, true, `inbox accepts message ${index}`);
    await waitStored(relays[3].url, wrap.id, true, 10_000);
    const found = await wsQuery(relays[3].url, { ids: [wrap.id], limit: 2 });
    assert.equal(found.length, 1, `message ${index} is stored exactly once`);
    assert.equal(runtime.unwrapEvent(found[0], recipient.secret).content, text, `recipient decrypts message ${index}`);
    report.dm_event_ids.push(wrap.id);
  }
  report.dm_count = report.dm_event_ids.length;
  assert.equal(report.dm_count, VARIABLES.directMessageCount, 'all private-message repetitions completed');
  await sampleResources('after-50-direct-messages');

  const now = () => logicalNowMs;
  const bridges = Array.from({ length: VARIABLES.bridgeCount }, () => runtime.bridge.createBridge(runtime.verifyEvent, 4096, now));
  for (let index = 1; index <= VARIABLES.publicNoteCount; index++) {
    const event = runtime.sign(1, `Property offline deterministic public note ${index}`,
      Math.floor(logicalNowMs / 1000), sender.secret);
    assert.equal((await publishEvent(relays[0].url, event)).accepted, true, `source accepts note ${index}`);
    let source = relays[0].url;
    for (let hop = 0; hop < bridges.length; hop++) {
      const target = relays[hop + 1].url;
      assert.deepEqual(Array.from(bridges[hop].targets(event, source, [target])), [target],
        `bridge ${hop + 1} forwards note ${index}`);
      assert.equal((await publishEvent(target, event)).accepted, true, `relay ${hop + 2} accepts note ${index}`);
      report.events_forwarded_per_bridge[hop]++;
      source = target;
    }
    await waitStored(relays[3].url, event.id, true, 10_000);
    const found = await wsQuery(relays[3].url, { ids: [event.id], limit: 2 });
    assert.equal(found.length, 1, `note ${index} is stored once at destination`);
    report.public_event_ids.push(event.id);
    if (index % VARIABLES.notesPerLogicalRateWindow === 0 && index < VARIABLES.publicNoteCount) {
      logicalNowMs += VARIABLES.logicalClockStepMs;
    }
    if (index % VARIABLES.notesPerLogicalRateWindow === 0) await sampleResources(`after-${index}-public-notes`);
  }
  report.public_note_count = report.public_event_ids.length;
  assert.equal(report.public_note_count, VARIABLES.publicNoteCount, 'all public-note repetitions completed');
  assert.deepEqual(report.events_forwarded_per_bridge, Array(VARIABLES.bridgeCount).fill(VARIABLES.publicNoteCount),
    'each bridge forwarded every note exactly once within the fixed logical windows');
  assert.equal(report.resource_checkpoints.length, 3, 'resource samples match the three predefined workload batches');
  report.result = 'PASS';
  await save();
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.reason = String(error?.message || error).slice(0, 800);
  await save();
  process.stderr.write(JSON.stringify(report) + '\n');
  process.exitCode = 1;
} finally {
  if (browserContext) await browserContext.close().catch(() => {});
  if (runtime?.browser) await runtime.browser.close().catch(() => {});
  for (const relay of relays.reverse()) await stopGeode(relay);
  for (const server of [app?.server, proxy?.server]) if (server?.listening) {
    await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
