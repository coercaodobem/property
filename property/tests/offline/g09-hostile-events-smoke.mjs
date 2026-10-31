#!/usr/bin/env node
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publishEvent, startGeode, stopGeode, waitStored, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [portText = '28750', outputText = '/tmp/property-g09-hostile'] = process.argv.slice(2);
const port = Number(portText), output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-hostile-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context; vm.createContext(context);
vm.runInContext(await (await import('node:fs/promises')).readFile(path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), context, { timeout: 5000 });
vm.runInContext(await (await import('node:fs/promises')).readFile(path.join(ROOT, 'property/web/forwarding.js'), 'utf8'), context, { timeout: 5000 });
const identity = JSON.parse(vm.runInContext(`(() => {const secret=NostrTools.generateSecretKey();return JSON.stringify({secret:[...secret],pubkey:NostrTools.getPublicKey(secret)});})()`, context, { timeout: 5000 }));
function sign(content, createdAt = Math.floor(Date.now() / 1000)) {
  context.g09Input = JSON.stringify({ content, createdAt, secret: identity.secret });
  return JSON.parse(vm.runInContext(`(() => {const x=JSON.parse(g09Input);return JSON.stringify(NostrTools.finalizeEvent({kind:1,content:x.content,tags:[],created_at:x.createdAt},Uint8Array.from(x.secret)));})()`, context, { timeout: 10000 }));
}
const bridge = context.PropertyRelayBridge.createBridge(event => vm.runInContext(`NostrTools.verifyEvent(${JSON.stringify(event)})`, context, { timeout: 5000 }));
let relay;
try {
  relay = await startGeode(port, temp, 'hostile event relay');
  const normal = sign('post flood recovery corpus');
  assert.equal((await publishEvent(relay.url, normal)).accepted, true);
  assert.equal((await publishEvent(relay.url, normal)).accepted, true, 'duplicate re-publish receives protocol ACK');
  await waitStored(relay.url, normal.id, true);
  const duplicateCopies = await wsQuery(relay.url, { ids: [normal.id], limit: 10 });
  assert.equal(duplicateCopies.length, 1, 'repeated ID remains one stored event');

  const tampered = structuredClone(sign('original content'));
  tampered.content = 'mutated after signature';
  const rejected = await publishEvent(relay.url, tampered);
  assert.equal(rejected.accepted, false, 'real Geode rejects the invalid signature');
  await waitStored(relay.url, tampered.id, false);

  const oversized = sign('x'.repeat(512_001));
  assert.deepEqual(Array.from(bridge.targets(oversized, 'ws://127.0.0.1:1', ['ws://127.0.0.1:2'])), [], 'bridge excludes events above its size limit');
  const boundary = Math.floor(Date.now() / 1000);
  const quotaBridge = context.PropertyRelayBridge.createBridge(event => vm.runInContext(`NostrTools.verifyEvent(${JSON.stringify(event)})`, context, { timeout: 5000 }));
  let acceptedByBridge = 0;
  for (let index = 0; index < 61; index++) {
    const event = sign(`rate-limit-${index}`, boundary);
    if (quotaBridge.targets(event, 'ws://127.0.0.1:1', ['ws://127.0.0.1:2']).length === 1) acceptedByBridge++;
  }
  assert.equal(acceptedByBridge, 60, 'bridge enforces the real 60 events/minute forwarding cap');
  const recovery = sign('normal corpus remains usable after rejected and oversized traffic');
  assert.equal((await publishEvent(relay.url, recovery)).accepted, true);
  await waitStored(relay.url, recovery.id, true);
  const report = { schema_version: 1, case: 'G09-04', result: 'PASS', relay_duplicate_copies: duplicateCopies.length,
    invalid_signature_rejected: true, oversized_event_forwarded: false, bridge_events_accepted_before_quota: acceptedByBridge,
    corpus_recovered_after_hostile_input: true, persisted_event_ids: [normal.id, recovery.id] };
  await writeFile(path.join(output, 'g09-hostile-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  await writeFile(path.join(output, 'g09-hostile-report.json'), JSON.stringify({ schema_version: 1, case: 'G09-04', result: 'FAIL', reason: String(error?.message || error).slice(0, 700) }, null, 2) + '\n', { mode: 0o600 });
  throw error;
} finally { if (relay) await stopGeode(relay); await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
