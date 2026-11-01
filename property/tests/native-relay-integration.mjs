import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const testRoot = await mkdtemp(join(tmpdir(), 'Property relay '));
const port = 17457;
const relayUrl = `ws://127.0.0.1:${port}`;
const integrationSummary = join(testRoot, 'accepted-events.json');
const noJavaPath = join(testRoot, 'tools without Java');
const unixUtilities = ['bash', 'sh', 'dirname', 'basename', 'uname', 'mkdir', 'chmod', 'cat', 'sed', 'mv', 'tar', 'gzip', 'unzip', 'readlink', 'realpath', 'env', 'rm', 'mktemp', 'grep', 'awk', 'head', 'tail', 'sleep', 'which', process.platform === 'darwin' ? 'shasum' : 'sha256sum'];
await mkdir(noJavaPath, { mode: 0o700 });
if (!process.platform.startsWith('win')) {
  for (const utility of unixUtilities) {
    const found = spawnSync('which', [utility], { encoding: 'utf8' });
    assert.equal(found.status, 0, `required launcher utility is unavailable: ${utility}`);
    await symlink(found.stdout.trim().split('\n')[0], join(noJavaPath, utility));
  }
  const javaLookup = spawnSync(join(noJavaPath, 'bash'), ['-c', 'command -v java'], {
    encoding: 'utf8', env: { PATH: noJavaPath }
  });
  assert.notEqual(javaLookup.status, 0, 'the relay launcher PATH fixture must not expose java');
}
const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port),
  PROPERTY_RELAY_DATA_DIR: join(testRoot, 'dados persistentes'), PROPERTY_RELAY_CONFIG_DIR: join(testRoot, 'config privada'),
  ...(process.platform.startsWith('win') ? {} : { PATH: noJavaPath, JAVA_HOME: '' }) };
const windows = process.platform === 'win32';
const command = windows ? 'powershell.exe' : 'bash';
const args = windows ? ['-NoProfile', '-File', join(root, 'property/relay/start.ps1')] : [join(root, 'property/relay/start.sh')];
let child;
let diagnostic = '';
async function stop({ crash = false } = {}) {
  if (!child || child.exitCode !== null) return;
  if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-child.pid, crash ? 'SIGKILL' : 'SIGTERM'); } catch {} }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (crash && !windows) assert.equal(child.signalCode, 'SIGKILL', 'the relay must be terminated abruptly for crash-recovery coverage');
}
async function start() {
  child = spawn(command, args, { env, cwd: root, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', error => { diagnostic += error.message; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { diagnostic = (diagnostic + data.toString()).slice(-10000); });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Relay exited ${child.exitCode}: ${diagnostic}`);
    const ready = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1');
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Relay not ready: ${diagnostic}`);
}
function eventFingerprint(event) {
  return createHash('sha256').update(JSON.stringify({
    id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind,
    tags: event.tags, content: event.content
  })).digest('hex');
}
async function queryEvents(expected) {
  assert.ok(expected.length > 0, 'integration must provide acknowledged event IDs');
  const socket = new WebSocket(relayUrl);
  try {
    return await new Promise((resolve, reject) => {
      const events = new Map();
      const duplicates = new Set();
      const subscription = `persisted-${crypto.randomUUID()}`;
      const timer = setTimeout(() => reject(new Error('Persistência: timeout')), 10000);
      socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, { ids: expected.map(event => event.id), limit: expected.length }])));
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Persistência: conexão falhou')); });
      socket.addEventListener('message', event => {
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (frame[0] === 'EVENT' && frame[1] === subscription && frame[2]?.id) {
          if (events.has(frame[2].id)) duplicates.add(frame[2].id);
          events.set(frame[2].id, frame[2]);
        }
        if (frame[0] === 'EOSE' && frame[1] === subscription) { clearTimeout(timer); resolve({ events, duplicates }); }
      });
    });
  } finally { socket.close(); }
}
try {
  await start();
  if (!windows) {
    const dataMode = (await stat(env.PROPERTY_RELAY_DATA_DIR)).mode & 0o777;
    const configMode = (await stat(env.PROPERTY_RELAY_CONFIG_DIR)).mode & 0o777;
    const fileMode = (await stat(join(env.PROPERTY_RELAY_CONFIG_DIR, 'geode.toml'))).mode & 0o777;
    assert.equal(dataMode, 0o700, 'relay data directory must be private');
    assert.equal(configMode, 0o700, 'relay config directory must be private');
    assert.equal(fileMode, 0o600, 'relay configuration must be private');
    await access(join(env.PROPERTY_RELAY_DATA_DIR, 'events.db'));
  }
  const test = spawnSync(process.execPath, [join(root, 'property/tests/relay-integration.mjs'), relayUrl, integrationSummary], { encoding: 'utf8', timeout: 90000 });
  assert.equal(test.status, 0, `${test.stdout}\n${test.stderr}\n${diagnostic}`);
  process.stdout.write(test.stdout);
  const report = JSON.parse(await readFile(integrationSummary, 'utf8'));
  const acknowledged = report.accepted_events;
  const expected = report.persisted_events;
  const excludedAfterMutation = report.excluded_after_protocol_mutation;
  assert.ok(acknowledged.length >= 7, 'integration records every positively acknowledged event');
  assert.ok(expected.length >= 7, 'integration records events expected to remain stored by Nostr semantics');
  assert.equal(new Set(acknowledged.map(event => event.id)).size, acknowledged.length, 'acknowledged event IDs are unique');
  assert.equal(new Set(expected.map(event => event.id)).size, expected.length, 'persisted event IDs are unique');
  assert.ok(Array.isArray(excludedAfterMutation) && excludedAfterMutation.length > 0, 'replaceable/deleted events are separately tracked');
  const before = await queryEvents(acknowledged);
  assert.deepEqual([...before.duplicates], [], 'relay query returns each acknowledged event once');
  assert.deepEqual([...before.events.keys()].sort(), expected.map(event => event.id).sort(), 'stable events remain queryable; superseded or NIP-09-deleted events are excluded');
  for (const item of expected) assert.equal(eventFingerprint(before.events.get(item.id)), item.sha256, `pre-restart event ${item.id} round-trips exactly`);
  await stop({ crash: true });
  await start();
  const after = await queryEvents(acknowledged);
  assert.deepEqual([...after.duplicates], [], 'relay query returns each acknowledged event once after restart');
  assert.deepEqual([...after.events.keys()].sort(), expected.map(event => event.id).sort(), 'the expected retained event ID set survives native relay restart');
  for (const item of expected) assert.equal(eventFingerprint(after.events.get(item.id)), item.sha256, `post-restart event ${item.id} is unchanged in its signed fields`);
  for (const item of excludedAfterMutation) assert.equal(after.events.has(item.id), false, `protocol mutation remains applied after restart: ${item.reason}`);
  console.log(`PASS: native ${process.platform}/${process.arch}, ${expected.length} retained events round-trip across restart; private paths/config; ${windows ? 'platform PATH' : 'no Java in relay PATH'}; replaceable/deleted events follow Nostr semantics; NIP-17/NIP-15 BTC/XMR/XNO`);
} finally {
  await stop();
  await rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
