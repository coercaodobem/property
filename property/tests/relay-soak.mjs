import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const [durationText = '86400', intervalText = '60', portText = '17447'] = process.argv.slice(2);
const durationSeconds = Number(durationText);
const intervalSeconds = Number(intervalText);
const port = Number(portText);
assert.ok(Number.isSafeInteger(durationSeconds) && durationSeconds >= 5 && durationSeconds <= 86400,
  'duration must be between 5 seconds and the 24-hour limit (86400 seconds)');
assert.ok(Number.isSafeInteger(intervalSeconds) && intervalSeconds >= 1, 'interval must be at least 1 second');
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, 'port must be a non-privileged TCP port');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..', '..');
const relayLauncher = join(repoRoot, 'property', 'relay', 'start.sh');
const relayUrl = `ws://127.0.0.1:${port}`;
const testRoot = await mkdtemp(join(tmpdir(), 'property-relay-soak-'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const nostr = context.NostrTools;
const secret = nostr.generateSecretKey();
const pubkey = nostr.getPublicKey(secret);
const runId = crypto.randomUUID();
let relayProcess;
let relayDiagnostics = '';
let interrupted = false;
let lastEvent;
let checks = 0;
let soakWindowStart;
const storedEventIds = [];

function log(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

function signPublicEvent(content) {
  context.eventTemplateJson = JSON.stringify({ kind: 1, pubkey, content, tags: [], created_at: Math.floor(Date.now() / 1000) });
  context.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext(
    'NostrTools.finalizeEvent(JSON.parse(eventTemplateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))',
    context,
    { timeout: 5000 }
  );
}

function openSocket(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let socket;
    try { socket = new WebSocket(relayUrl); } catch (error) { reject(error); return; }
    const timer = setTimeout(() => { socket.close(); reject(new Error('WebSocket connect timeout')); }, timeoutMs);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connect failed')); }, { once: true });
  });
}

function waitForFrame(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('relay response timeout')); }, timeoutMs);
    function listener(message) {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (!predicate(frame)) return;
      clearTimeout(timer);
      socket.removeEventListener('message', listener);
      resolve(frame);
    }
    socket.addEventListener('message', listener);
  });
}

async function publishAndVerify(event) {
  const socket = await openSocket();
  try {
    const ackPromise = waitForFrame(socket, frame => frame[0] === 'OK' && frame[1] === event.id);
    socket.send(JSON.stringify(['EVENT', event]));
    const ack = await ackPromise;
    assert.equal(ack[2], true, `relay rejected event: ${ack[3] || 'no reason'}`);

    const subscription = `soak-${crypto.randomUUID()}`;
    const events = [];
    const completion = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.removeEventListener('message', listener);
        reject(new Error('query EOSE timeout'));
      }, 7000);
      function listener(message) {
        let frame;
        try { frame = JSON.parse(message.data); } catch { return; }
        if (frame[0] === 'EVENT' && frame[1] === subscription) events.push(frame[2]);
        if (frame[0] === 'EOSE' && frame[1] === subscription) {
          clearTimeout(timer);
          socket.removeEventListener('message', listener);
          resolve();
        }
      }
      socket.addEventListener('message', listener);
    });
    socket.send(JSON.stringify(['REQ', subscription, { ids: [event.id], limit: 2 }]));
    await completion;
    socket.send(JSON.stringify(['CLOSE', subscription]));
    assert.equal(events.filter(value => value.id === event.id).length, 1, 'event must be stored once and queryable by ID');
  } finally {
    socket.close();
  }
}

async function verifyStored(event) {
  const socket = await openSocket();
  try {
    const subscription = `persist-${crypto.randomUUID()}`;
    const events = [];
    const completion = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.removeEventListener('message', listener);
        reject(new Error('persistence query EOSE timeout'));
      }, 7000);
      function listener(message) {
        let frame;
        try { frame = JSON.parse(message.data); } catch { return; }
        if (frame[0] === 'EVENT' && frame[1] === subscription) events.push(frame[2]);
        if (frame[0] === 'EOSE' && frame[1] === subscription) {
          clearTimeout(timer);
          socket.removeEventListener('message', listener);
          resolve();
        }
      }
      socket.addEventListener('message', listener);
    });
    socket.send(JSON.stringify(['REQ', subscription, { ids: [event.id], limit: 2 }]));
    await completion;
    socket.send(JSON.stringify(['CLOSE', subscription]));
    assert.equal(events.filter(value => value.id === event.id).length, 1, 'persisted event remains queryable exactly once');
  } finally {
    socket.close();
  }
}

async function reconcileStoredEvents(ids) {
  let reconciled = 0;
  const batchSize = 50;
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    const socket = await openSocket();
    try {
      const subscription = `reconcile-${crypto.randomUUID()}`;
      const received = [];
      const completion = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.removeEventListener('message', listener);
          reject(new Error(`reconciliation EOSE timeout at offset ${offset}`));
        }, 10_000);
        function listener(message) {
          let frame;
          try { frame = JSON.parse(message.data); } catch { return; }
          if (frame[0] === 'EVENT' && frame[1] === subscription) received.push(frame[2]);
          if (frame[0] === 'EOSE' && frame[1] === subscription) {
            clearTimeout(timer);
            socket.removeEventListener('message', listener);
            resolve();
          }
        }
        socket.addEventListener('message', listener);
      });
      socket.send(JSON.stringify(['REQ', subscription, { ids: batch, limit: batch.length + 1 }]));
      await completion;
      socket.send(JSON.stringify(['CLOSE', subscription]));
      for (const id of batch) {
        assert.equal(received.filter(event => event.id === id).length, 1,
          `final reconciliation expected exactly one stored copy of ${id}`);
      }
      assert.equal(received.length, batch.length, `unexpected event count in reconciliation batch at offset ${offset}`);
      reconciled += received.length;
    } finally {
      socket.close();
    }
  }
  return reconciled;
}

async function startRelay() {
  relayDiagnostics = '';
  const javaOptions = [process.env.JAVA_TOOL_OPTIONS, `-Djava.io.tmpdir=${testRoot}`].filter(Boolean).join(' ');
  relayProcess = spawn(relayLauncher, [], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JAVA_TOOL_OPTIONS: javaOptions,
      PROPERTY_RELAY_HOST: '127.0.0.1',
      PROPERTY_RELAY_PORT: String(port),
      PROPERTY_RELAY_DATA_DIR: join(testRoot, 'data'),
      PROPERTY_RELAY_CONFIG_DIR: join(testRoot, 'config')
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  relayProcess.stderr.on('data', chunk => { relayDiagnostics = `${relayDiagnostics}${chunk}`.slice(-6000); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (relayProcess.exitCode !== null) throw new Error(`relay exited during startup: ${relayDiagnostics}`);
    try {
      const socket = await openSocket(1000);
      socket.close();
      log('relay-ready', { port });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error(`relay did not become ready: ${relayDiagnostics}`);
}

async function stopRelay(signal = 'SIGTERM') {
  if (!relayProcess || relayProcess.exitCode !== null) return;
  const current = relayProcess;
  const exited = new Promise(resolve => current.once('exit', resolve));
  current.kill(signal);
  let exitedInTime = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 10000))]);
  if (!exitedInTime && current.exitCode === null) {
    current.kill('SIGKILL');
    await exited;
    exitedInTime = true;
  }
  log('relay-stopped', { requestedSignal: signal, exitedInTime });
}

async function assertRelayUnavailable() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const socket = await openSocket(300);
      socket.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch {
      log('relay-outage-observed', { attempt: attempt + 1 });
      return;
    }
  }
  throw new Error('planned relay failure was not observable on the loopback port');
}

function requestStop() { interrupted = true; }
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  log('soak-preflight', { relay: relayUrl, requiredSeconds: durationSeconds, intervalSeconds, runId,
    reconciliationBatchSize: 50, plannedFailureSignals: ['SIGTERM', 'SIGKILL'] });
  await startRelay();
  const marker = signPublicEvent(`property-soak:${runId}:persistence-marker`);
  await publishAndVerify(marker);
  lastEvent = marker;
  checks += 1;
  storedEventIds.push(marker.id);
  const startUtc = new Date().toISOString();
  const startedAt = performance.now();
  soakWindowStart = startedAt;
  const deadline = startedAt + durationSeconds * 1000;
  const restartAt = [Math.floor(durationSeconds / 3), Math.floor((durationSeconds * 2) / 3)].filter(value => value > 0);
  assert.equal(new Set(restartAt).size, 2, 'the configured duration must schedule two distinct failure points');
  let restartIndex = 0;
  let nextProbeAt = startedAt + intervalSeconds * 1000;
  log('soak-window-start', { startUtc, monotonicStartMs: startedAt, requiredSeconds: durationSeconds,
    persistenceMarkerId: marker.id });

  while (!interrupted && (performance.now() < deadline || restartIndex < restartAt.length)) {
    const now = performance.now();
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    if (restartIndex < restartAt.length && elapsedSeconds >= restartAt[restartIndex]) {
      const failureNumber = restartIndex + 1;
      const signal = failureNumber === 1 ? 'SIGTERM' : 'SIGKILL';
      log('planned-failure-injected', { failureNumber, signal, elapsedSeconds });
      await stopRelay(signal);
      await assertRelayUnavailable();
      await startRelay();
      await verifyStored(marker);
      await verifyStored(lastEvent);
      log('planned-failure-recovery-pass', { failureNumber, signal, elapsedSeconds,
        persistenceMarkerId: marker.id, latestEventId: lastEvent.id });
      restartIndex += 1;
      nextProbeAt = performance.now() + intervalSeconds * 1000;
      continue;
    }
    if (now < deadline && now >= nextProbeAt) {
      const event = signPublicEvent(`property-soak:${runId}:probe:${checks}`);
      await publishAndVerify(event);
      await verifyStored(marker);
      lastEvent = event;
      storedEventIds.push(event.id);
      checks += 1;
      log('probe-pass', { elapsedSeconds, checks, eventId: event.id });
      nextProbeAt = performance.now() + intervalSeconds * 1000;
      continue;
    }
    const nextRestartMs = restartIndex < restartAt.length
      ? startedAt + restartAt[restartIndex] * 1000
      : deadline;
    const nextWakeAt = now < deadline ? Math.min(nextProbeAt, nextRestartMs, deadline) : nextRestartMs;
    const delay = Math.max(100, nextWakeAt - performance.now());
    await new Promise(resolve => setTimeout(resolve, Math.min(delay, 1000)));
  }

  if (interrupted) {
    log('soak-interrupted', { checks, completedFailures: restartIndex, requiredSeconds: durationSeconds,
      observedSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)) });
    process.exitCode = 130;
  } else {
    assert.equal(restartIndex, 2, 'both scheduled failures must complete and recover');
    const reconciledEvents = await reconcileStoredEvents(storedEventIds);
    assert.equal(reconciledEvents, storedEventIds.length, 'every published event must reconcile exactly once');
    assert.equal(new Set(storedEventIds).size, storedEventIds.length, 'published event IDs must be unique');
    if (interrupted) {
      log('soak-interrupted', { checks, completedFailures: restartIndex, requiredSeconds: durationSeconds,
        publishedEvents: storedEventIds.length, reconciledEvents });
      process.exitCode = 130;
    } else {
    const observedSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(3));
    assert.ok(observedSeconds >= durationSeconds, '24-hour soak must run for the complete requested real duration');
    assert.equal(checks > 1, true, 'soak should complete multiple successful probes');
    const endUtc = new Date().toISOString();
    log('final-reconciliation-pass', { publishedEvents: storedEventIds.length, reconciledEvents,
      exactOnce: true, batchSize: 50 });
    log('soak-pass', { startUtc, endUtc, requiredSeconds: durationSeconds, observedSeconds,
      checks, plannedFailures: 2, completedRecoveries: restartIndex, publishedEvents: storedEventIds.length,
      reconciledEvents, clock: 'performance.now monotonic' });
    }
  }
} catch (error) {
  log('soak-fail', { checks, error: error instanceof Error ? error.message : String(error), relayDiagnostics,
    publishedEvents: storedEventIds.length, observedSeconds: soakWindowStart === undefined
      ? null : Number(((performance.now() - soakWindowStart) / 1000).toFixed(3)) });
  process.exitCode = 1;
} finally {
  await stopRelay();
  await rm(testRoot, { recursive: true, force: true });
}
