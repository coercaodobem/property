#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startGeode, stopGeode, wsQuery } from './browser-g05-smoke.mjs';

const require = createRequire(import.meta.url);
const { WebSocket: WsClient, WebSocketServer } = require('ws');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [portText = '28900', outputText = '/tmp/property-g09-proxy-faults'] = process.argv.slice(2);
const basePort = Number(portText);
assert.ok(Number.isInteger(basePort) && basePort >= 1024 && basePort <= 64000);
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-proxy-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), context, { timeout: 5000 });

function makeIdentity() {
  return JSON.parse(vm.runInContext('(() => {const s=NostrTools.generateSecretKey();return JSON.stringify({secret:[...s],pubkey:NostrTools.getPublicKey(s)});})()', context, { timeout: 5000 }));
}
function sign(identity, content, tags = []) {
  context.g09Input = JSON.stringify({ secret: identity.secret, content, tags, created_at: Math.floor(Date.now() / 1000) });
  return JSON.parse(vm.runInContext('(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.finalizeEvent({kind:1,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret)));})()', context, { timeout: 5000 }));
}
function connectUntilClosed(url, watchdogMs = 5000) {
  const socket = new WsClient(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('proxy connection watchdog expired')); }, watchdogMs);
    socket.once('open', () => { clearTimeout(timer); resolve({ socket, state: 'connected' }); });
    socket.once('error', error => { clearTimeout(timer); resolve({ socket, state: 'unavailable', error: String(error.message || error) }); });
  });
}
function awaitClose(socket, watchdogMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('proxy close watchdog expired')); }, watchdogMs);
    socket.once('close', (code, reason) => { clearTimeout(timer); resolve({ code, reason: reason.toString() }); });
    socket.once('error', error => { clearTimeout(timer); resolve({ code: null, reason: String(error.message || error) }); });
  });
}
function publishBatch(socket, events, rawFrames = []) {
  return new Promise((resolve, reject) => {
    const acknowledgements = new Map();
    const wanted = new Set(events.map(event => event.id));
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('proxy publish watchdog expired')); }, 8000);
    socket.on('message', data => {
      let frame;
      try { frame = JSON.parse(data.toString()); } catch { return; }
      if (frame[0] === 'OK' && wanted.has(frame[1])) acknowledgements.set(frame[1], { accepted: frame[2] === true, reason: String(frame[3] || '') });
      if (acknowledgements.size === wanted.size) { clearTimeout(timer); socket.close(); resolve(acknowledgements); }
    });
    const sendFrames = () => {
      for (const frame of rawFrames) socket.send(frame);
      for (const event of events) socket.send(JSON.stringify(['EVENT', event]));
    };
    if (socket.readyState === WsClient.OPEN) sendFrames();
    else socket.once('open', sendFrames);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}
function startProxy(targetUrl, port, options = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port });
  const active = new Set();
  const metrics = { client_connections: 0, forwarded_events: [], released_events: [], forwarded_raw_frames: 0, ack_transformations: 0, closes: 0 };
  server.on('connection', client => {
    metrics.client_connections++;
    const upstream = new WsClient(targetUrl);
    const queued = [];
    const pair = { client, upstream };
    active.add(pair);
    const sendUpstream = frame => {
      if (upstream.readyState === WsClient.OPEN) upstream.send(frame);
      else queued.push(frame);
    };
    upstream.once('open', () => { while (queued.length) upstream.send(queued.shift()); });
    upstream.once('error', () => { if (client.readyState === WsClient.OPEN) client.close(1013, 'relay unavailable'); });
    client.on('message', data => {
      const raw = data.toString();
      let frame;
      try { frame = JSON.parse(raw); } catch { frame = null; }
      if (frame?.[0] === 'EVENT') {
        metrics.forwarded_events.push(frame[1]?.id || 'invalid-event');
        if (options.reorderTwoEvents) {
          metrics.reorderBuffer ??= [];
          metrics.reorderBuffer.push(raw);
          if (metrics.reorderBuffer.length === 2) {
            const secondFrame = metrics.reorderBuffer.pop();
            const firstFrame = metrics.reorderBuffer.pop();
            metrics.released_events.push(JSON.parse(secondFrame)[1].id, JSON.parse(firstFrame)[1].id);
            sendUpstream(secondFrame);
            sendUpstream(firstFrame);
          }
          return;
        }
      } else if (raw === 'not-json') metrics.forwarded_raw_frames++;
      sendUpstream(raw);
    });
    upstream.on('message', data => {
      let frame;
      try { frame = JSON.parse(data.toString()); } catch { client.send(data); return; }
      if (frame[0] === 'OK' && frame[1] === options.transformAckId) {
        frame[2] = options.transformAckTo;
        metrics.ack_transformations++;
      }
      client.send(JSON.stringify(frame));
    });
    const close = () => {
      metrics.closes++;
      active.delete(pair);
      if (upstream.readyState === WsClient.OPEN || upstream.readyState === WsClient.CONNECTING) upstream.close();
    };
    client.once('close', close);
    upstream.once('close', () => { if (client.readyState === WsClient.OPEN) client.close(1012, 'upstream closed'); });
  });
  return {
    url: `ws://127.0.0.1:${port}`,
    metrics,
    ready: new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }),
    disconnectAll() { for (const pair of active) { pair.client.close(1012, 'fixed disconnect injection'); pair.upstream.close(); } },
    close() { this.disconnectAll(); return new Promise(resolve => server.close(() => resolve())); }
  };
}
async function checkStored(url, eventId, expected) {
  const socket = new WebSocket(url);
  const found = await new Promise((resolve, reject) => {
    const sub = `g09-count-${crypto.randomUUID()}`;
    let count = 0;
    const timer = setTimeout(() => { socket.close(); reject(new Error('independent relay query watchdog expired')); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, { ids: [eventId], limit: 5 }])));
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub && frame[2]?.id === eventId) count++;
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(timer); socket.close(); resolve(count); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('independent relay query failed')); }, { once: true });
  });
  assert.equal(found, expected, `independent relay query for ${eventId}`);
  return found;
}

let relay = null;
const proxies = [];
const report = { schema_version: 1, case: 'G09-02', result: 'BLOCKED', offline: true, fixed_proxy_faults: [],
  client_status_transitions: [], retry_count: 0, relay_events_reconciled: 0, public_relays_used: false, mainnet_used: false, secrets_recorded: false };
try {
  relay = await startGeode(basePort, temp, 'G09 proxy target');
  const identity = makeIdentity();

  const reorder = startProxy(relay.url, basePort + 1, { reorderTwoEvents: true }); proxies.push(reorder); await reorder.ready;
  const first = sign(identity, 'G09 reorder event 1');
  const second = sign(identity, 'G09 reorder event 2');
  const connected = await connectUntilClosed(reorder.url);
  assert.equal(connected.state, 'connected');
  report.client_status_transitions.push('connected');
  const orderedAcks = await publishBatch(connected.socket, [first, second]);
  assert.equal(orderedAcks.get(first.id).accepted, true); assert.equal(orderedAcks.get(second.id).accepted, true);
  assert.deepEqual(reorder.metrics.released_events, [second.id, first.id]);
  assert.equal(await checkStored(relay.url, first.id, 1), 1); assert.equal(await checkStored(relay.url, second.id, 1), 1);
  report.fixed_proxy_faults.push({ fault: 'queue-release-reorder', queued_events: 2, release_order_reversed: true, server_storage_each_once: true });
  report.relay_events_reconciled += 2;
  await reorder.close();

  const statusProxy = startProxy(relay.url, basePort + 2); proxies.push(statusProxy); await statusProxy.ready;
  const statusClient = await connectUntilClosed(statusProxy.url); assert.equal(statusClient.state, 'connected');
  const dropped = awaitClose(statusClient.socket); statusProxy.disconnectAll();
  const downState = await dropped;
  assert.equal(statusClient.socket.readyState, WsClient.CLOSED);
  report.client_status_transitions.push('connected', 'disconnected');
  const recovered = await connectUntilClosed(statusProxy.url); assert.equal(recovered.state, 'connected');
  report.retry_count = 1;
  const recoveredEvent = sign(identity, 'G09 connection recovery event');
  const recoveredAck = await publishBatch(recovered.socket, [recoveredEvent]);
  assert.equal(recoveredAck.get(recoveredEvent.id).accepted, true); assert.equal(await checkStored(relay.url, recoveredEvent.id, 1), 1);
  report.client_status_transitions.push('reconnected'); report.relay_events_reconciled++;
  report.fixed_proxy_faults.push({ fault: 'forced-disconnect-and-single-reconnect', close_code: downState.code, reconnect_attempts: 1, recovered_event_stored_once: true });
  await statusProxy.close();

  const invalidProxy = startProxy(relay.url, basePort + 3); proxies.push(invalidProxy); await invalidProxy.ready;
  const invalidSocket = new WsClient(invalidProxy.url);
  const invalidAckEvent = sign(identity, 'G09 valid event after invalid frame');
  const invalidAcks = publishBatch(invalidSocket, [invalidAckEvent], ['not-json']);
  const invalidAck = await invalidAcks;
  assert.equal(invalidAck.get(invalidAckEvent.id).accepted, true);
  assert.equal(invalidProxy.metrics.forwarded_raw_frames, 1);
  assert.equal(await checkStored(relay.url, invalidAckEvent.id, 1), 1);
  report.fixed_proxy_faults.push({ fault: 'invalid-frame', invalid_frames_forwarded: 1, connection_recovered: true, following_valid_event_stored_once: true });
  report.relay_events_reconciled++;
  await invalidProxy.close();

  const invalidSignature = sign(identity, 'G09 signed content before mutation'); invalidSignature.content = 'G09 changed after signature';
  const liePositive = startProxy(relay.url, basePort + 4, { transformAckId: invalidSignature.id, transformAckTo: true }); proxies.push(liePositive); await liePositive.ready;
  const lyingClient = await connectUntilClosed(liePositive.url);
  const falsePositiveAck = await publishBatch(lyingClient.socket, [invalidSignature]);
  assert.equal(falsePositiveAck.get(invalidSignature.id).accepted, true, 'proxy deliberately changed a negative server ACK into a false positive');
  assert.equal(await checkStored(relay.url, invalidSignature.id, 0), 0, 'the independent query disproves the false positive ACK');
  report.fixed_proxy_faults.push({ fault: 'false-positive-ack', client_ack: true, independently_stored: false, client_conclusion: 'unconfirmed; reject success until storage reconciliation' });

  const validButDenied = sign(identity, 'G09 valid event with false negative ACK');
  const negativeProxy = startProxy(relay.url, basePort + 5, { transformAckId: validButDenied.id, transformAckTo: false }); proxies.push(negativeProxy); await negativeProxy.ready;
  const negativeClient = await connectUntilClosed(negativeProxy.url);
  const falseNegativeAck = await publishBatch(negativeClient.socket, [validButDenied]);
  assert.equal(falseNegativeAck.get(validButDenied.id).accepted, false, 'proxy deliberately changed a positive server ACK into a negative response');
  assert.equal(await checkStored(relay.url, validButDenied.id, 1), 1, 'independent query recovers the committed event despite false negative ACK');
  report.fixed_proxy_faults.push({ fault: 'false-negative-ack', client_ack: false, independently_stored: true, client_conclusion: 'committed; reconcile before retry' });
  report.relay_events_reconciled++;

  const unavailableProxy = startProxy(`ws://127.0.0.1:${basePort + 20}`, basePort + 6); proxies.push(unavailableProxy); await unavailableProxy.ready;
  const unavailable = await connectUntilClosed(unavailableProxy.url);
  if (unavailable.state === 'connected') {
    const closed = await awaitClose(unavailable.socket);
    assert.equal(unavailable.socket.readyState, WsClient.CLOSED);
    report.fixed_proxy_faults.push({ fault: 'unavailable-relay', state: 'unavailable', close_code: closed.code, retry_count: 0 });
  } else report.fixed_proxy_faults.push({ fault: 'unavailable-relay', state: 'unavailable', retry_count: 0 });
  report.client_status_transitions.push('unavailable');

  assert.equal(report.fixed_proxy_faults.length, 6);
  assert.equal(report.retry_count, 1);
  assert.equal(report.relay_events_reconciled, 5);
  report.result = 'PASS';
  await (await import('node:fs/promises')).writeFile(path.join(output, 'g09-proxy-fault-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.result = 'FAIL'; report.reason = String(error?.message || error).slice(0, 900);
  await (await import('node:fs/promises')).writeFile(path.join(output, 'g09-proxy-fault-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally {
  for (const proxy of proxies.reverse()) await proxy.close().catch(() => {});
  if (relay) await stopGeode(relay).catch(() => {});
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
