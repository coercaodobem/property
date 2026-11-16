#!/usr/bin/env node
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startGeode, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [portText = '28850', outputText = '/tmp/property-g09-write-send-edit-crash'] = process.argv.slice(2);
const port = Number(portText);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65530);
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-event-crash-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), context, { timeout: 5000 });
vm.runInContext(await readFile(path.join(ROOT, 'property/web/message-edits.js'), 'utf8'), context, { timeout: 5000 });

function runJson(source, value) {
  context.g09Input = JSON.stringify(value);
  return JSON.parse(vm.runInContext(source, context, { timeout: 10000 }));
}
function makeIdentity() {
  return runJson('(() => {const secret=NostrTools.generateSecretKey();return JSON.stringify({secret:[...secret],pubkey:NostrTools.getPublicKey(secret)});})()');
}
function makeEvent(identity, kind, content, tags = []) {
  return runJson('(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret)));})()',
    { secret: identity.secret, kind, content, tags, created_at: Math.floor(Date.now() / 1000) });
}
function makeDirectWraps(identity, recipientPubkey, content) {
  return runJson('(() => {const x=JSON.parse(g09Input);const secret=Uint8Array.from(x.secret);const rumor=NostrTools.nip59.createRumor({kind:14,created_at:x.created_at,tags:[["p",x.recipient]],content:x.content},secret);return JSON.stringify([x.self,x.recipient].map(pubkey=>NostrTools.nip59.createWrap(NostrTools.nip59.createSeal(rumor,secret,pubkey),pubkey)));})()',
    { secret: identity.secret, self: identity.pubkey, recipient: recipientPubkey, content, created_at: Math.floor(Date.now() / 1000) });
}
function verifyAll(events) {
  for (const event of events) {
    context.g09Event = JSON.stringify(event);
    assert.equal(vm.runInContext('NostrTools.verifyEvent(JSON.parse(g09Event))', context, { timeout: 5000 }), true, 'crash corpus contains only valid signed events');
  }
}
function publish(url, event) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('G09 event publish watchdog expired')); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] !== 'OK' || frame[1] !== event.id) return;
      clearTimeout(timer); socket.close(); resolve({ accepted: frame[2] === true, reason: String(frame[3] || '') });
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('G09 event publish websocket failed')); }, { once: true });
  });
}
function queryEvents(url, ids) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const sub = `g09-crash-${crypto.randomUUID()}`;
    const events = [];
    const timer = setTimeout(() => { socket.close(); reject(new Error('G09 recovery query watchdog expired')); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, { ids, limit: ids.length + 1 }])));
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub) events.push(frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(timer); socket.close(); resolve(events); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('G09 recovery websocket failed')); }, { once: true });
  });
}
async function abruptStop(relay) {
  const closed = new Promise(resolve => relay.child.once('close', (code, signal) => resolve({ code, signal })));
  process.kill(-relay.child.pid, 'SIGKILL');
  const result = await closed;
  assert.equal(result.signal, 'SIGKILL', 'relay process group stopped abruptly');
  return result;
}
async function restartAndReconcile(relay, expected, phase) {
  await abruptStop(relay);
  relay = await startGeode(port, temp, 'G09 event relay');
  const recovered = await queryEvents(relay.url, expected.map(event => event.id));
  const counts = Object.fromEntries(expected.map(event => [event.id, recovered.filter(item => item.id === event.id).length]));
  assert.ok(Object.values(counts).every(count => count === 1), `${phase}: every acknowledged event is queryable exactly once after SIGKILL`);
  assert.equal(recovered.length, expected.length, `${phase}: no unrelated events were introduced`);
  return { relay, counts };
}

let relay = null;
const report = { schema_version: 1, case: 'G09-01', result: 'BLOCKED', abrupt_recovery_cycles: [],
  operations: { write: false, send: false, edit: false }, campaign_recovery: 'PASS via g09-campaign-crash-report.json',
  public_relays_used: false, mainnet_used: false, secrets_recorded: false };
try {
  const sender = makeIdentity(), recipient = makeIdentity();
  const now = Math.floor(Date.now() / 1000);
  const note = makeEvent(sender, 1, 'G09 write fixture', []);
  relay = await startGeode(port, temp, 'G09 event relay');
  assert.equal((await publish(relay.url, note)).accepted, true);
  let cycle = await restartAndReconcile(relay, [note], 'write');
  relay = cycle.relay;
  report.operations.write = true;
  report.abrupt_recovery_cycles.push({ operation: 'write', accepted_events: 1, exact_once_after_sigkill: true });

  const directWraps = makeDirectWraps(sender, recipient.pubkey, 'G09 NIP-17 send fixture');
  assert.ok(Array.isArray(directWraps) && directWraps.length >= 1);
  verifyAll(directWraps);
  for (const event of directWraps) assert.equal((await publish(relay.url, event)).accepted, true);
  const sendCorpus = [note, ...directWraps];
  cycle = await restartAndReconcile(relay, sendCorpus, 'send');
  relay = cycle.relay;
  report.operations.send = true;
  report.abrupt_recovery_cycles.push({ operation: 'send', accepted_events: directWraps.length, exact_once_after_sigkill: true });

  const root = makeEvent(sender, 14, 'G09 edit root fixture', [['p', recipient.pubkey]]);
  const edit = runJson('(() => {const x=JSON.parse(g09Input);return JSON.stringify(PropertyMessageEdits.createNip17Edit({nostr:NostrTools,secret:Uint8Array.from(x.secret),selfPubkey:x.self,participants:[x.self,x.peer],rootId:x.root,priorEventIds:[x.root],sequence:1,createdAt:x.createdAt,text:"G09 edited fixture"}));})()',
    { secret: sender.secret, self: sender.pubkey, peer: recipient.pubkey, root: root.id, createdAt: now });
  const editEvents = [...edit.editWraps, ...edit.deleteWraps];
  verifyAll([root, ...editEvents]);
  for (const event of [root, ...editEvents]) assert.equal((await publish(relay.url, event)).accepted, true);
  const editCorpus = [...sendCorpus, root, ...editEvents];
  cycle = await restartAndReconcile(relay, editCorpus, 'edit');
  relay = cycle.relay;
  report.operations.edit = true;
  report.abrupt_recovery_cycles.push({ operation: 'edit', accepted_events: 1 + editEvents.length, exact_once_after_sigkill: true });
  assert.equal(report.operations.write && report.operations.send && report.operations.edit, true);
  report.result = 'PASS';
  report.total_unique_events_after_final_recovery = editCorpus.length;
  await writeFile(path.join(output, 'g09-write-send-edit-crash-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.result = 'FAIL'; report.reason = String(error?.message || error).slice(0, 900);
  await writeFile(path.join(output, 'g09-write-send-edit-crash-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n');
  process.exitCode = 1;
} finally {
  if (relay) await (await import('./browser-g05-smoke.mjs')).stopGeode(relay).catch(() => {});
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
