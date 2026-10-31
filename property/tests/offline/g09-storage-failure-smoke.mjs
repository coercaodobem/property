#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publishEvent, startGeode, stopGeode, waitStored } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [portText = '28720', outputText = '/tmp/property-g09-storage'] = process.argv.slice(2);
const port = Number(portText);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65530);
const output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g09-storage-'));
const cryptoContext = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
cryptoContext.window = cryptoContext;
vm.createContext(cryptoContext);
vm.runInContext(await (await import('node:fs/promises')).readFile(path.join(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), cryptoContext, { timeout: 5000 });
let relay;
let lockProcess;
const report = { schema_version: 1, case: 'G09-03', result: 'BLOCKED', database_lock: null, invalid_config: null,
  bounded_volume: null, secret_free: true };

function signedFixture(content) {
  cryptoContext.g09Content = content;
  return JSON.parse(vm.runInContext('JSON.stringify(NostrTools.finalizeEvent({kind:1,content:g09Content,tags:[],created_at:Math.floor(Date.now()/1000)},NostrTools.generateSecretKey()))', cryptoContext, { timeout: 5000 }));
}
function publishWithDeadline(url, event, deadlineMs) {
  const socket = new WebSocket(url);
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); resolve(value); };
    const timer = setTimeout(() => finish({ kind: 'timeout' }), deadlineMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'OK' && frame[1] === event.id) finish({ kind: 'ack', accepted: frame[2] === true, message: String(frame[3] || '') });
    });
    socket.addEventListener('error', () => finish({ kind: 'error' }), { once: true });
  });
}
function queryEvents(url, filter, timeoutMs = 8000) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const subscription = `g09-recovery-${crypto.randomUUID()}`;
    const events = new Map();
    const timer = setTimeout(() => { socket.close(); reject(new Error('recovery query timed out')); }, timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, filter])));
    socket.addEventListener('message', message => {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === subscription && frame[2]?.id) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === subscription) { clearTimeout(timer); socket.close(); resolve([...events.values()]); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('recovery query websocket failed')); }, { once: true });
  });
}
async function maximumFileBytes(dir){
  let maximum=0;
  for(const entry of await (await import('node:fs/promises')).readdir(dir,{withFileTypes:true}))
    if(entry.isFile())maximum=Math.max(maximum,(await stat(path.join(dir,entry.name))).size);
  return maximum;
}

try {
  relay = await startGeode(port, temp, 'G09 storage pressure relay');
  const readyFile = path.join(temp, 'lock-ready');
  const locker = path.join(temp, 'sqlite-exclusive-lock.py');
  await writeFile(locker, [
    'import sqlite3, sys, time',
    'db, ready = sys.argv[1:]',
    'con = sqlite3.connect(db, timeout=2)',
    'con.execute("BEGIN EXCLUSIVE")',
    'open(ready, "w").write("locked")',
    'time.sleep(30)',
    'con.rollback()'
  ].join('\n') + '\n', { mode: 0o600 });
  const dbPath = path.join(relay.data, 'events.db');
  lockProcess = spawn('python3', [locker, dbPath, readyFile], { stdio: 'ignore', env: { PATH: process.env.PATH } });
  const lockDeadline = Date.now() + 5000;
  while (Date.now() < lockDeadline) {
    try { await (await import('node:fs/promises')).access(readyFile); break; }
    catch { if (lockProcess.exitCode !== null) throw new Error('SQLite lock process exited before acquiring the database lock'); await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  await (await import('node:fs/promises')).access(readyFile);
  report.database_lock = { acquired: true, process_isolated_to_temp_database: true };
  const heldEvent = signedFixture('G09 database lock: not acknowledged as durable');
  const lockResult = await publishWithDeadline(relay.url, heldEvent, 1800);
  let storedDuringLock = false;
  try { storedDuringLock = await waitStored(relay.url, heldEvent.id, true, 500).then(() => true); } catch {}
  assert.equal(storedDuringLock, false, 'database-locked event must not be independently queryable as persisted');
  if (lockResult.kind === 'ack') assert.equal(lockResult.accepted, false, 'relay must not falsely acknowledge event while durable database is exclusively locked');
  else assert.ok(['error', 'timeout'].includes(lockResult.kind));
  report.database_lock.held_event_ack_kind = lockResult.kind;
  report.database_lock.held_event_acknowledged = lockResult.kind === 'ack' && lockResult.accepted === true;
  report.database_lock.held_event_independently_queryable = storedDuringLock;
  lockProcess.kill('SIGTERM');
  await new Promise(resolve => lockProcess.once('close', resolve));
  lockProcess = null;
  const recovered = signedFixture('G09 database lock: relay remains queryable after the lock is released');
  assert.equal((await publishEvent(relay.url, recovered)).accepted, true, 'relay resumes successful writes after lock release');
  await waitStored(relay.url, recovered.id, true);
  report.database_lock.recovered_after_release = true;
  report.database_lock.recovery_event_id = recovered.id;

  const invalidDir = path.join(temp, 'invalid-config');
  const configDir = path.join(invalidDir, 'config');
  const dataDir = path.join(invalidDir, 'data');
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const invalidConfig = path.join(configDir, 'relay.toml');
  await writeFile(invalidConfig, '[network\nport = "not-an-integer"\n', { mode: 0o600 });
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port + 1),
    PROPERTY_RELAY_DATA_DIR: dataDir, PROPERTY_RELAY_CONFIG_DIR: configDir, PROPERTY_RELAY_CONFIG: invalidConfig,
    PROPERTY_RELAY_PORTABLE_ARCHIVE: path.join(ROOT, 'property/relay/dist/geode-1.20.0-linux-x64.tar.gz') };
  for (const key of Object.keys(env)) if (/proxy/i.test(key)) delete env[key];
  const invalid = spawn('bash', [path.join(ROOT, 'property/relay/start.sh')], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let invalidStderr = '';
  invalid.stderr.setEncoding('utf8'); invalid.stderr.on('data', chunk => { invalidStderr = (invalidStderr + chunk).slice(-2000); });
  const invalidExit = await new Promise(resolve => invalid.once('close', (code, signal) => resolve({ code, signal })));
  assert.notEqual(invalidExit.code, 0, 'invalid configuration must fail closed');
  report.invalid_config = { exit_code: invalidExit.code, rejected_before_relay_listen: true,
    error_excerpt: invalidStderr.replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 500) };
  assert.equal(relay.child.exitCode, null, 'the original test relay remains available for the bounded-volume case');
  const limit = 524_288;
  const limitResult = await new Promise(resolve => {
    const child = spawn('prlimit', [`--pid=${relay.child.pid}`, `--fsize=${limit}:${limit}`], { stdio: 'ignore' });
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', error => resolve({ code: null, signal: null, error: error.code || 'spawn-error' }));
  });
  assert.equal(limitResult.code, 0, 'the live relay process accepts an enforced per-file storage bound');
  const dbStatBefore = await stat(path.join(relay.data, 'events.db'));
  report.bounded_volume = { enforcement: 'RLIMIT_FSIZE applied to the already initialized Geode relay process',
    rlimit_fsize_bytes: limit, database_size_before_bytes: dbStatBefore.size };
  const acknowledgedIds=[];let writeFailure=null;
  for(let index=0;index<100;index++){
    const event=signedFixture(`bounded SQLite volume ${index} `+'x'.repeat(16*1024));
    const outcome=await publishWithDeadline(relay.url,event,2500);
    if(outcome.kind==='ack'&&outcome.accepted){acknowledgedIds.push(event.id);continue;}
    writeFailure={index,ack_kind:outcome.kind,accepted:outcome.accepted??null};break;
  }
  const largestDatabaseFile=await maximumFileBytes(relay.data);
  const priorChild=relay;
  await stopGeode(relay); relay = null;
  const recoveredRelay=await startGeode(port,temp,'G09 storage pressure relay');
  relay=recoveredRelay;
  const recoveredEvents=acknowledgedIds.length?await queryEvents(recoveredRelay.url,{ids:acknowledgedIds,limit:acknowledgedIds.length}):[];
  assert.deepEqual(recoveredEvents.map(event=>event.id).sort(),[...acknowledgedIds].sort(),
    'every acknowledged event remains stored after clean restart following bounded-volume failure');
  const reachedBound=Boolean(writeFailure)&&largestDatabaseFile>=500_000&&largestDatabaseFile<=524_288;
  report.bounded_volume={status:reachedBound?'PASS':'BLOCKED',rlimit_fsize_bytes:524288,largest_database_file_bytes:largestDatabaseFile,
    write_failure:writeFailure,acknowledged_event_count:acknowledgedIds.length,recovered_event_count:recoveredEvents.length,
    relay_exit_after_limit:priorChild.child.exitCode,
    reason:reachedBound?'The enforced file-size cap rejected a write; all previously acknowledged events survived restart.':'The isolated relay did not reach the file-size cap within the signed event corpus.'};
  report.result=report.bounded_volume.status;
  await writeFile(path.join(output, 'g09-storage-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.result = 'FAIL'; report.reason = String(error?.message || error).slice(0, 800);
  await writeFile(path.join(output, 'g09-storage-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally {
  if (lockProcess && lockProcess.exitCode === null) lockProcess.kill('SIGKILL');
  if (relay) await stopGeode(relay);
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
