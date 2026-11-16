#!/usr/bin/env node
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publishEvent, startGeode, stopGeode, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [portText = '28930', outputText = '/tmp/property-g09-node-removal'] = process.argv.slice(2);
const basePort = Number(portText);
assert.ok(Number.isInteger(basePort) && basePort >= 1024 && basePort <= 64000);
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-node-removal-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const rel of ['vendor/nostr-tools-2.25.2.bundle.js', 'protocol-contract.js', 'money.js', 'campaigns.js', 'forwarding.js']) {
  vm.runInContext(await readFile(path.join(ROOT, 'property/web', rel), 'utf8'), context, { timeout: 5000 });
}
let logicalNow = Date.now();
const verifyEvent = event => {
  context.g09Event = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(g09Event))', context, { timeout: 5000 });
};
const bridgeA = context.PropertyRelayBridge.createBridge(verifyEvent, 4096, () => logicalNow);
let bridgeB = context.PropertyRelayBridge.createBridge(verifyEvent, 4096, () => logicalNow);

function makeIdentity() {
  context.g09Input = '';
  return JSON.parse(vm.runInContext('(() => {const secret=NostrTools.generateSecretKey();return JSON.stringify({secret:Array.from(secret),pubkey:NostrTools.getPublicKey(secret)});})()', context, { timeout: 5000 }));
}
function sign(identity, kind, content, tags = [], createdAt = Math.floor(logicalNow / 1000)) {
  context.g09Input = JSON.stringify({ secret: identity.secret, kind, content, tags, createdAt });
  return JSON.parse(vm.runInContext('(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.createdAt},Uint8Array.from(x.secret)));})()', context, { timeout: 5000 }));
}
async function countStored(url, eventId) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const sub = `g09-removal-${crypto.randomUUID()}`;
    let count = 0;
    const timer = setTimeout(() => { socket.close(); reject(new Error('G09 removal query watchdog expired')); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, { ids: [eventId], limit: 5 }])));
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub && frame[2]?.id === eventId) count++;
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(timer); socket.close(); resolve(count); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('G09 removal query failed')); }, { once: true });
  });
}
async function forward(bridge, event, source, relayUrls, privateRecipient = '') {
  const targets = privateRecipient
    ? bridge.privateTargets(event, source, relayUrls, privateRecipient)
    : bridge.targets(event, source, relayUrls);
  const results = [];
  for (const target of targets) {
    try { results.push({ target, ...(await publishEvent(target, event)) }); }
    catch (error) { results.push({ target, accepted: false, reason: String(error?.message || error).slice(0, 120) }); }
  }
  return { targets, results };
}

let relays = { a: null, b: null, h: null };
let step = 'setup';
const report = { schema_version: 1, case: 'G09-06', result: 'BLOCKED', offline: true,
  removals: {}, private_content_never_used_fallback: false, campaign_fixture_is_synthetic: true,
  public_relays_used: false, mainnet_used: false, secrets_recorded: false };
try {
  relays.a = await startGeode(basePort, temp, 'relay A');
  relays.b = await startGeode(basePort + 1, temp, 'relay B');
  relays.h = await startGeode(basePort + 2, temp, 'hub H');
  const a = makeIdentity(), b = makeIdentity(), campaignNode = makeIdentity();

  step = 'baseline two-bridge route';
  const chainEvent = sign(a, 1, 'G09 route through H and two bridges');
  assert.equal((await publishEvent(relays.a.url, chainEvent)).accepted, true);
  const firstHop = await forward(bridgeA, chainEvent, relays.a.url, [relays.a.url, relays.h.url]);
  assert.deepEqual([...firstHop.targets], [relays.h.url]); assert.equal(firstHop.results[0].accepted, true);
  const secondHop = await forward(bridgeB, chainEvent, relays.h.url, [relays.h.url, relays.b.url]);
  assert.deepEqual([...secondHop.targets], [relays.b.url]); assert.equal(secondHop.results[0].accepted, true);
  for (const relay of [relays.a, relays.h, relays.b]) assert.equal(await countStored(relay.url, chainEvent.id), 1);
  report.removals.two_bridge_chain_baseline = { relays: 3, bridge_hops: 2, unique_event_copies: 1 };

  step = 'remove bridge';
  const bridgeRemovalEvent = sign(a, 1, 'G09 bridge B removed');
  assert.equal((await publishEvent(relays.a.url, bridgeRemovalEvent)).accepted, true);
  const toHub = await forward(bridgeA, bridgeRemovalEvent, relays.a.url, [relays.a.url, relays.h.url]);
  assert.equal(toHub.results[0].accepted, true);
  bridgeB = null;
  assert.equal(await countStored(relays.h.url, bridgeRemovalEvent.id), 1);
  assert.equal(await countStored(relays.b.url, bridgeRemovalEvent.id), 0);
  const directStillWorks = sign(b, 1, 'G09 independent relay after bridge removal');
  assert.equal((await publishEvent(relays.b.url, directStillWorks)).accepted, true);
  assert.equal(await countStored(relays.b.url, directStillWorks.id), 1);
  assert.equal(await countStored(relays.h.url, directStillWorks.id), 0);
  report.removals.bridge = { removed_bridge: 'H-to-B', event_stops_at_hub: true, independent_relay_operation: true,
    browser_bridge_shutdown_and_alternate_path: 'covered by G5 final browser G05-02/G05-03 report' };

  step = 'private inbox and relay B removal';
  bridgeB = context.PropertyRelayBridge.createBridge(verifyEvent, 4096, () => logicalNow);
  const privateRumor = runPrivateRumor(a, b.pubkey, 'G09 private message must not use fallback');
  const privateEnvelope = runWrap(a, b.pubkey, privateRumor);
  assert.equal(verifyEvent(privateEnvelope), true);
  assert.equal((await publishEvent(relays.a.url, privateEnvelope)).accepted, true);
  await stopGeode(relays.b); relays.b = null;
  const privateDelivery = await forward(bridgeA, privateEnvelope, relays.a.url, [relays.b?.url || `ws://127.0.0.1:${basePort + 1}`], b.pubkey);
  assert.deepEqual([...privateDelivery.targets], [`ws://127.0.0.1:${basePort + 1}`]);
  assert.equal(privateDelivery.targets.length, 1);
  assert.equal(privateDelivery.results[0].accepted, false);
  assert.equal(await countStored(relays.h.url, privateEnvelope.id), 0, 'private envelope is not copied to H when intended inbox B is unavailable');
  const unrelatedPublic = sign(a, 1, 'G09 public route survives relay B removal');
  assert.equal((await publishEvent(relays.a.url, unrelatedPublic)).accepted, true);
  const survivingRoute = await forward(bridgeA, unrelatedPublic, relays.a.url, [relays.a.url, relays.h.url]);
  assert.equal(survivingRoute.results[0].accepted, true);
  assert.equal(await countStored(relays.h.url, unrelatedPublic.id), 1);
  report.private_content_never_used_fallback = true;
  report.removals.relay_b = { intended_inbox_down: true, targeted_delivery_failed: true, fallback_to_h: false,
    independent_relay_and_public_route_still_work: true };

  step = 'remove hub H';
  relays.b = await startGeode(basePort + 1, temp, 'relay B');
  const hubRemovalEvent = sign(a, 1, 'G09 direct route after hub removal');
  assert.equal((await publishEvent(relays.a.url, hubRemovalEvent)).accepted, true);
  await stopGeode(relays.h); relays.h = null;
  const afterHubRemoval = await forward(bridgeA, hubRemovalEvent, relays.a.url, [relays.a.url, `ws://127.0.0.1:${basePort + 2}`, relays.b.url]);
  assert.equal(afterHubRemoval.results.length, 2);
  assert.equal(afterHubRemoval.results.find(item => item.target === relays.b.url)?.accepted, true);
  assert.equal(afterHubRemoval.results.find(item => item.target !== relays.b.url)?.accepted, false);
  assert.equal(await countStored(relays.a.url, hubRemovalEvent.id), 1);
  assert.equal(await countStored(relays.b.url, hubRemovalEvent.id), 1);
  report.removals.hub_h = { hub_unavailable: true, dependent_hop_failed: true, independent_a_to_b_route_stored_once: true };

  step = 'remove campaign node';
  const nowSeconds = Math.floor(logicalNow / 1000);
  const campaignId = crypto.randomUUID();
  const expiresAt = nowSeconds + 5;
  const campaignPayload = {
    schema: 'property-sponsored-v2', title: 'G09 synthetic campaign node', body: 'Fixed logical expiry fixture',
    link: 'https://example.org/property', currency: 'XNO', amount_atomic: '1', expires_at: expiresAt,
    offer_event_id: 'a'.repeat(64), acceptance_event_id: 'b'.repeat(64), payment_tx_id: 'c'.repeat(64), node_pubkey: campaignNode.pubkey
  };
  const canonical = vm.runInContext(`PropertyProtocol.canonicalJson(${JSON.stringify(campaignPayload)})`, context, { timeout: 5000 });
  const campaignEvent = sign(campaignNode, 30078, canonical,
    [['t', 'property-sponsored-v2'], ['d', `property-sponsored-v2:${campaignId}`]], nowSeconds);
  assert.equal(verifyEvent(campaignEvent), true);
  assert.equal((await publishEvent(relays.a.url, campaignEvent)).accepted, true);
  const activeCampaigns = context.PropertyCampaigns.selectSponsoredCampaigns([campaignEvent], verifyEvent,
    { nowSeconds, blockedNodes: [], exposures: {}, maxCount: 1 });
  assert.equal(activeCampaigns.length, 1, 'synthetic campaign node is visible while its signed campaign is active');
  campaignNode.secret.fill(0);
  const afterExpiry = context.PropertyCampaigns.selectSponsoredCampaigns([campaignEvent], verifyEvent,
    { nowSeconds: expiresAt + 1, blockedNodes: [], exposures: {}, maxCount: 1 });
  assert.equal(afterExpiry.length, 0, 'a removed campaign node has no active campaign after fixed logical expiry');
  const ordinaryAfterCampaignRemoval = sign(a, 1, 'G09 ordinary communication after campaign-node removal');
  assert.equal((await publishEvent(relays.a.url, ordinaryAfterCampaignRemoval)).accepted, true);
  assert.equal(await countStored(relays.a.url, ordinaryAfterCampaignRemoval.id), 1);
  report.removals.campaign_node = { signed_fixture_visible_before_expiry: true, node_key_cleared: true,
    logical_clock_steps: 1, active_campaign_after_expiry: 0, ordinary_relay_communication_continued: true };

  report.result = 'PASS';
  await writeFile(path.join(output, 'g09-node-removal-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.result = 'FAIL'; report.failure_step = step; report.reason = String(error?.message || error).slice(0, 900);
  await writeFile(path.join(output, 'g09-node-removal-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally {
  for (const relay of Object.values(relays).reverse()) if (relay) await stopGeode(relay).catch(() => {});
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function runPrivateRumor(sender, recipientPubkey, content) {
  context.g09Input = JSON.stringify({ secret: sender.secret, recipient: recipientPubkey, content, createdAt: Math.floor(logicalNow / 1000) });
  return JSON.parse(vm.runInContext('(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.nip59.createRumor({kind:14,created_at:x.createdAt,tags:[["p",x.recipient]],content:x.content},Uint8Array.from(x.secret)));})()', context, { timeout: 5000 }));
}

function runWrap(sender, recipientPubkey, rumor) {
  context.g09Input = JSON.stringify({ secret: sender.secret, recipient: recipientPubkey, rumor });
  return JSON.parse(vm.runInContext('(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.nip59.createWrap(NostrTools.nip59.createSeal(x.rumor,Uint8Array.from(x.secret),x.recipient),x.recipient));})()', context, { timeout: 5000 }));
}
