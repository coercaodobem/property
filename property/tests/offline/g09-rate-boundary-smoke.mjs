#!/usr/bin/env node
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publishEvent, startGeode, stopGeode } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RELAY_VALID_EVENT_EPOCH_SECONDS = Math.floor(Date.now() / 1000);
const [portText = '28780', outputText = '/tmp/property-g09-rate-boundary'] = process.argv.slice(2);
const firstPort = Number(portText);
assert.ok(Number.isInteger(firstPort) && firstPort >= 1024 && firstPort <= 65525);
const output = path.resolve(outputText);
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-rate-boundary-'));
await mkdir(output, { recursive: true, mode: 0o700 });

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), context, { timeout: 5000 });
const secret = JSON.parse(vm.runInContext('JSON.stringify(Array.from(NostrTools.generateSecretKey()))', context, { timeout: 5000 }));

function signedEvent(sequence) {
  context.g09RateFixture = JSON.stringify({ sequence, secret });
  return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(g09RateFixture); return JSON.stringify(NostrTools.finalizeEvent({kind:1,content:'G09 fixed rate fixture '+x.sequence,tags:[],created_at:${RELAY_VALID_EVENT_EPOCH_SECONDS}},Uint8Array.from(x.secret))); })()`, context, { timeout: 5000 }));
}

function requestBurst(url, count) {
  const socket = new WebSocket(url);
  const results = [];
  return new Promise((resolve, reject) => {
    let next = 0;
    const timer = setTimeout(() => { socket.close(); reject(new Error('REQ harness watchdog expired')); }, 15000);
    const finish = error => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error); else resolve(results);
    };
    const sendNext = () => {
      const sub = `g09-rate-${next}`;
      socket.send(JSON.stringify(['REQ', sub, { kinds: [1], limit: 1 }]));
    };
    socket.addEventListener('open', sendNext, { once: true });
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if ((frame[0] !== 'EOSE' && frame[0] !== 'CLOSED') || frame[1] !== `g09-rate-${next}`) return;
      results.push({ accepted: frame[0] === 'EOSE', reason: String(frame[2] || '') });
      next++;
      if (next === count) finish(); else sendNext();
    });
    socket.addEventListener('error', () => finish(new Error('REQ websocket failed')), { once: true });
  });
}

const report = { schema_version: 1, case: 'G09-04-rate-boundaries', result: 'BLOCKED', offline: true,
  event_rate_configurations: 0, req_rate_configurations: 0, fixed_boundary_checks: 0, configurations: [] };

try {
  for (let burst = 2; burst <= 6; burst++) {
    const port = firstPort + burst - 2;
    const config = `[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[rate_limits]\nevents_per_minute = 1\nevent_burst = ${burst}\nreqs_per_minute = 1\nreq_burst = ${burst}\n`;
    const relay = await startGeode(port, temp, `rate-boundary-${burst}`, config);
    try {
      const eventResults = [];
      for (let index = 0; index <= burst; index++) {
        eventResults.push(await publishEvent(relay.url, signedEvent(burst * 100 + index)));
      }
      assert.ok(eventResults.slice(0, burst - 1).every(result => result.accepted), `event burst ${burst}: limit-1 accepted`);
      assert.ok(eventResults.slice(0, burst).every(result => result.accepted), `event burst ${burst}: exact limit accepted`);
      assert.equal(eventResults[burst].accepted, false, `event burst ${burst}: limit+1 rejected`);
      assert.match(eventResults[burst].message, /rate-limited:/);

      const reqResults = await requestBurst(relay.url, burst + 1);
      assert.equal(reqResults.length, burst + 1);
      assert.ok(reqResults.slice(0, burst - 1).every(result => result.accepted), `REQ burst ${burst}: limit-1 accepted`);
      assert.ok(reqResults.slice(0, burst).every(result => result.accepted), `REQ burst ${burst}: exact limit accepted`);
      assert.equal(reqResults[burst].accepted, false, `REQ burst ${burst}: limit+1 rejected`);
      assert.match(reqResults[burst].reason, /rate-limited:/);

      report.configurations.push({ event_burst: burst, req_burst: burst,
        event_attempts: eventResults.length, event_accepted_at_limit: burst, event_rejected_at_limit_plus_one: 1,
        req_attempts: reqResults.length, req_accepted_at_limit: burst, req_rejected_at_limit_plus_one: 1 });
      report.event_rate_configurations++;
      report.req_rate_configurations++;
      report.fixed_boundary_checks += 6;
    } finally {
      await stopGeode(relay);
    }
  }
  report.configured_limits = report.event_rate_configurations + report.req_rate_configurations;
  report.event_timestamp_note = 'Current epoch is used only to satisfy relay event freshness; rate acceptance depends on fixed burst counts.';
  assert.equal(report.configured_limits, 10);
  report.result = 'PASS';
  await writeFile(path.join(output, 'g09-rate-boundary-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.reason = String(error?.message || error).slice(0, 500);
  await writeFile(path.join(output, 'g09-rate-boundary-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n');
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
