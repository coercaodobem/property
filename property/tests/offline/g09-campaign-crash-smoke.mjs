#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publishEvent, startGeode, stopGeode, waitStored, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKER = path.join(ROOT, 'property/tests/offline/g09-campaign-crash-worker.mjs');
const VENDOR = path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js');
const [portText = '28500', outputText = '/tmp/property-g09-crash'] = process.argv.slice(2);
const port = Number(portText);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65530);
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-crash-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(VENDOR, 'utf8'), context, { timeout: 5000 });
function testIdentity() {
  context.g09Create = '';
  return JSON.parse(vm.runInContext('(() => {const secret=NostrTools.generateSecretKey();return JSON.stringify({secret:Array.from(secret),pubkey:NostrTools.getPublicKey(secret)});})()', context, { timeout: 5000 }));
}
function sign(identity, draft) {
  context.g09Sign = JSON.stringify({ identity: identity.secret, draft });
  return JSON.parse(vm.runInContext('(() => {const x=JSON.parse(g09Sign);return JSON.stringify(NostrTools.finalizeEvent(x.draft,Uint8Array.from(x.identity)));})()', context, { timeout: 5000 }));
}
function waitReady(child, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let outputText = '', errorText = '';
    const timer = setTimeout(() => reject(new Error(`worker readiness timed out: ${errorText.slice(-1000)}`)), timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { outputText += chunk; const match = outputText.split(/\r?\n/).find(predicate); if (match) { clearTimeout(timer); resolve({ line: match, stdout: outputText }); } });
    child.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-2000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { if (timer) { clearTimeout(timer); reject(new Error(`worker exited before readiness code=${code} signal=${signal}: ${errorText}`)); } });
  });
}
function launchWorker(mode, fixturePath, stateDir, relayUrl) {
  return spawn(process.execPath, [WORKER, mode, fixturePath, stateDir, relayUrl], {
    cwd: ROOT, detached: process.platform !== 'win32', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/proxy/i.test(key)))
  });
}
async function crashAfterReady(worker, line) {
  const result = await waitReady(worker, value => value.startsWith(line));
  if (process.platform === 'win32') worker.kill('SIGKILL');
  else process.kill(-worker.pid, 'SIGKILL');
  const exit = await new Promise(resolve => worker.once('exit', (code, signal) => resolve({ code, signal })));
  assert.equal(exit.signal, 'SIGKILL', 'the campaign worker was terminated abruptly after its durable operation');
  return result.line;
}

let relay;
try {
  relay = await startGeode(port, temp, 'campaign crash relay');
  const advertiser = testIdentity(), node = testIdentity();
  const campaignId = randomUUID(), createdAt = Math.floor(Date.now() / 1000);
  const offer = sign(advertiser, { kind: 30079, content: JSON.stringify({ schema: 'property-campaign-offer-v1',
    campaign_id: campaignId, advertiser_pubkey: advertiser.pubkey, title: 'Crash recovery fixture',
    body: 'Local process crash test.', link: 'https://campaign.test/property', currency: 'XNO', amount_atomic: '1',
    expires_at: createdAt + 300, refund_terms: 'Refund only after signed request.' }), created_at: createdAt,
    tags: [['t', 'property-campaign-offer-v1'], ['d', campaignId]] });
  assert.equal((await publishEvent(relay.url, offer)).accepted, true);
  await waitStored(relay.url, offer.id, true);
  const fixturePath = path.join(temp, 'campaign-fixture.json');
  const stateDir = path.join(temp, 'campaign state');
  const fixture = { advertiser, node, campaign_id: campaignId, offer };
  await writeFile(fixturePath, JSON.stringify(fixture) + '\n', { mode: 0o600 });

  const decide = launchWorker('accept', fixturePath, stateDir, relay.url);
  await crashAfterReady(decide, 'READY accepted awaiting_payment');
  const afterAccept = launchWorker('inspect-pending', fixturePath, stateDir, relay.url);
  const acceptedRecovery = await waitReady(afterAccept, value => value.startsWith('{'));
  const acceptedResult = JSON.parse(acceptedRecovery.line);
  await new Promise(resolve => afterAccept.once('exit', resolve));
  assert.equal(acceptedResult.status, 'awaiting_payment', 'the accepted campaign state survived process death');
  assert.equal(acceptedResult.publication_calls, 0, 'restart did not publish before the ledger confirmed payment');

  const publish = launchWorker('publish', fixturePath, stateDir, relay.url);
  const publishedLine = await crashAfterReady(publish, 'READY published ');
  const campaignEventId = publishedLine.slice('READY published '.length).trim();
  assert.match(campaignEventId, /^[0-9a-f]{64}$/);
  const finalRecover = launchWorker('inspect', fixturePath, stateDir, relay.url);
  const finalLine = await waitReady(finalRecover, value => value.startsWith('{'));
  const finalResult = JSON.parse(finalLine.line);
  await new Promise(resolve => finalRecover.once('exit', resolve));
  assert.equal(finalResult.status, 'published');
  assert.equal(finalResult.event_id, campaignEventId);
  assert.equal(finalResult.publication_calls, 0, 'restart did not issue a duplicate campaign publication');
  await waitStored(relay.url, campaignEventId, true);
  const copies = await wsQuery(relay.url, { ids: [campaignEventId], limit: 5 });
  assert.equal(copies.length, 1, 'the real relay contains exactly one campaign event after crash recovery');

  const report = { schema_version: 1, result: 'PASS', case: 'G09-01', abrupt_campaign_crashes: 2,
    state_after_first_crash: acceptedResult.status, state_after_second_crash: finalResult.status,
    publication_calls_after_recovery: finalResult.publication_calls, relay_campaign_copies: copies.length,
    campaign_event_id: campaignEventId, relay_url: relay.url, temp_state_private: true };
  await writeFile(path.join(output, 'g09-campaign-crash-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  const report = { schema_version: 1, result: 'FAIL', case: 'G09-01', reason: String(error?.message || error).slice(0, 1000) };
  await writeFile(path.join(output, 'g09-campaign-crash-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n');
  process.exitCode = 1;
} finally {
  if (relay) await stopGeode(relay);
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
