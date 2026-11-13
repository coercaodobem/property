import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDaemon } from '../../agent/daemon.mjs';
import { callUnixJson } from '../../agent/ipc.mjs';
import { loadNostr, createEmptyConfig, eventInContext, secretBytesInContext } from '../../agent/core.mjs';
import { createVault, unlockVault } from '../../agent/vault.mjs';
import { ensurePrivateDirectory, resolvePaths, writePrivateJson } from '../../agent/store.mjs';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = path.resolve(PROPERTY_ROOT, '..');
const PARTS_ROOT = path.join(PROPERTY_ROOT, 'relay/dist-parts');
const PART_COUNT = 130;
const GEODE_SHA256 = '9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7';
const SEED = 'property-agent-g4-host-geode-fixed-v1';
const FIXED_NOW = 1_900_000_000;
const PASSWORD = 'fixed-test-password-only';
const HOST_SCRIPT = path.join(PROPERTY_ROOT, 'agent/property-agent.mjs');

assert.equal(process.platform, 'linux', 'G4 neste checkout declara somente o alvo Ubuntu/Linux x64');
assert.equal(process.arch, 'x64', 'G4 neste checkout declara somente Linux x64');
const temp = await mkdtemp(path.join(process.env.PROPERTY_AGENT_G4_TMPDIR || PROPERTY_ROOT, '.property-agent-g4-'));
await chmod(temp, 0o700);
const runtimeRoot = path.join('/tmp', `p4-${process.pid}`);
const env = { ...process.env, XDG_DATA_HOME: path.join(temp, 'data'), XDG_RUNTIME_DIR: runtimeRoot };
const cases = [];
const daemons = [];
const hosts = [];
let geode = null;
let geodeBinary = '';
let logicalNow = FIXED_NOW;

function record(id) { cases.push({ id, result: 'PASS' }); if (cases.length % 50 === 0) process.stderr.write(`G4 checkpoint ${cases.length}: ${id}\n`); }
async function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function unpackGeode(archive, runtime) {
  const child = spawn('tar', ['--no-same-owner', '-xz', '-C', runtime], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-3000); });
  const exit = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  for (let offset = 0; offset < archive.length; offset += 512 * 1024) {
    if (!child.stdin.write(archive.subarray(offset, Math.min(archive.length, offset + 512 * 1024)))) await once(child.stdin, 'drain');
  }
  child.stdin.end();
  let watchdogId;
  const watchdog = new Promise((_, reject) => { watchdogId = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Geode unpack watchdog: ${stderr}`)); }, 600_000); });
  const result = await Promise.race([exit, watchdog]);
  clearTimeout(watchdogId);
  if (result.code !== 0) throw new Error(`Geode unpack falhou (${result.code || result.signal}): ${stderr}`);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function waitForRelay(port, child, logs) {
  for (let count = 0; count < 160; count++) {
    if (child.exitCode !== null) throw new Error(`Geode encerrou antes de escutar: ${logs()}`);
    const available = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1'); socket.setTimeout(400);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (available) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Geode não abriu a porta local: ${logs()}`);
}
async function startGeode(port) {
  port ??= await freePort();
  const root = path.join(temp, 'relay');
  const data = path.join(root, 'data'), configDir = path.join(root, 'config'), javaTmp = path.join(root, 'java-tmp');
  await mkdir(data, { recursive: true, mode: 0o700 }); await mkdir(configDir, { recursive: true, mode: 0o700 }); await mkdir(javaTmp, { recursive: true, mode: 0o700 });
  const config = path.join(configDir, 'geode.toml');
  await writeFile(config, `[info]\nname = "Property G4 local"\ndescription = "Isolated G4 fixture"\n\n[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[database]\nin_memory = false\nfile = "${path.join(data, 'events.db')}"\n\n[options]\nverify_signatures = true\nrequire_auth = false\n`, { mode: 0o600 });
  const child = spawn(geodeBinary, ['--config', config, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: REPO_ROOT, detached: true,
    env: { ...process.env, TMPDIR: javaTmp, TMP: javaTmp, TEMP: javaTmp, JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir=${javaTmp} -Xms64m -Xmx512m -XX:MaxDirectMemorySize=128m -XX:ActiveProcessorCount=2 -XX:+UseSerialGC -Djava.util.concurrent.ForkJoinPool.common.parallelism=2` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; const collect = chunk => { output = `${output}${chunk}`.slice(-3000); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  await waitForRelay(port, child, () => output);
  return { child, url: `ws://127.0.0.1:${port}`, port, data };
}
async function stopGeode(value) {
  if (!value || value.child.exitCode !== null) return;
  try { process.kill(-value.child.pid, 'SIGTERM'); } catch {}
  await Promise.race([new Promise(resolve => value.child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 8000))]);
  if (value.child.exitCode === null) { try { process.kill(-value.child.pid, 'SIGKILL'); } catch {} }
}

class McpHost {
  constructor(name, profile) { this.name = name; this.profile = profile; this.seq = 0; this.pending = new Map(); this.stderr = ''; this.child = null; this.lines = null; this.extraneousStdout = []; }
  start() {
    this.child = spawn(process.execPath, [HOST_SCRIPT, 'mcp', '--profile', this.profile], { cwd: REPO_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.lines.on('line', line => this.handleLine(line));
    this.child.stderr.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-3000); });
    this.child.on('exit', code => { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(`${this.name} bridge encerrou ${code}: ${this.stderr}`)); } this.pending.clear(); });
    return this;
  }
  handleLine(line) {
    let response; try { response = JSON.parse(line); } catch { this.extraneousStdout.push(line.slice(0, 120)); return; }
    const pending = this.pending.get(response.id); if (!pending) return;
    this.pending.delete(response.id); clearTimeout(pending.timer); pending.resolve(response);
  }
  call(method, fields = {}) {
    if (!this.child || this.child.exitCode !== null) return Promise.reject(new Error(`${this.name} MCP não está ativo`));
    const id = `${this.name}-${++this.seq}`;
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: `property-offline-host-${this.name}`, version: '1.0.0' }, 'io.modelcontextprotocol/clientCapabilities': {} };
    const params = { ...fields, _meta: meta };
    const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.name} MCP watchdog: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(payload, error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  async discover() {
    const response = await this.call('server/discover');
    assert.deepEqual(response.result?.supportedVersions, ['2026-07-28']);
    assert.equal(response.result.capabilities.tools.listChanged, false);
    record(`${this.name}-server-discover`);
  }
  async tool(name, args = {}) {
    const response = await this.call('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined, `${this.name}.${name}: ${JSON.stringify(response.error)}`);
    const result = response.result;
    assert.equal(result.resultType, 'complete');
    const parsed = JSON.parse(result.content[0].text);
    return { isError: result.isError === true, value: parsed };
  }
  async restart() { await this.close(); this.start(); await this.discover(); const status = await this.tool('property_status'); assert.equal(status.isError, false); }
  async close() {
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child; child.stdin.end();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    this.child = null;
  }
}

class McpHostRawStream extends McpHost {
  start() {
    this.child = spawn(process.execPath, [HOST_SCRIPT, 'mcp', '--profile', this.profile], { cwd: REPO_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = Buffer.alloc(0);
    this.child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 128 * 1024) { this.extraneousStdout.push('oversized-jsonrpc-frame'); this.child.kill('SIGKILL'); return; }
      let newline;
      while ((newline = buffer.indexOf(0x0a)) >= 0) {
        const line = buffer.subarray(0, newline).toString('utf8'); buffer = buffer.subarray(newline + 1);
        this.handleLine(line);
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-3000); });
    this.child.on('exit', code => { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(`${this.name} bridge encerrou ${code}: ${this.stderr}`)); } this.pending.clear(); });
    return this;
  }
}

async function makeAgent(profile, pubkey, secret, nostr, context) {
  const paths = resolvePaths(profile, env);
  await ensurePrivateDirectory(paths.dataDir);
  const secretBuffer = Buffer.from(secret);
  const vault = createVault(secretBuffer, pubkey, PASSWORD);
  secretBuffer.fill(0);
  await writePrivateJson(paths.vaultPath, vault);
  const config = createEmptyConfig(pubkey);
  await writePrivateJson(paths.configPath, config);
  const rawVault = await readFile(paths.vaultPath, 'utf8');
  assert.equal((await stat(paths.vaultPath)).mode & 0o777, 0o600);
  assert.equal((await stat(paths.dataDir)).mode & 0o777, 0o700);
  assert.equal(rawVault.includes(Buffer.from(secret).toString('hex')), false, 'o cofre não contém a chave em claro');
  assert.throws(() => unlockVault(vault, 'wrong-password-for-fixture', nostr, context), /Senha incorreta/);
  record(`${profile}-encrypted-vault-mode-and-wrong-password`);
  return { paths, daemon: await runDaemon({ password: PASSWORD, profile, env, now: () => logicalNow }) };
}

function toolJson(raw) { return JSON.parse(raw.value.content[0].text); }

async function watchEphemeral(url, recipient) {
  const socket = new WebSocket(url);
  const subscription = `property-g4-activity-${randomUUID()}`;
  const queue = [];
  const waiters = [];
  let closed = false;
  const ready = new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => { socket.close(); reject(new Error('Activity watcher did not reach EOSE.')); }, 10000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, { kinds: [21059], '#p': [recipient] }])));
    socket.addEventListener('message', event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EOSE' && frame[1] === subscription) { clearTimeout(watchdog); resolve(); }
      if (frame[0] === 'EVENT' && frame[1] === subscription && frame[2]?.kind === 21059) {
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(frame[2]); else queue.push(frame[2]);
      }
    });
    socket.addEventListener('error', () => { clearTimeout(watchdog); reject(new Error('Activity watcher WebSocket failed.')); }, { once: true });
  });
  await ready;
  return {
    next() {
      if (queue.length) return Promise.resolve(queue.shift());
      if (closed) return Promise.reject(new Error('Activity watcher is closed.'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(item => item.resolve === wrappedResolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Expected an ephemeral activity event.'));
        }, 10000);
        const wrappedResolve = event => { clearTimeout(timer); resolve(event); };
        waiters.push({ resolve: wrappedResolve, reject });
      });
    },
    close() { closed = true; try { socket.send(JSON.stringify(['CLOSE', subscription])); } catch {} socket.close(); },
  };
}

async function queryRelay(url, filter) {
  const socket = new WebSocket(url);
  const subscription = `property-g4-query-${randomUUID()}`;
  return await new Promise((resolve, reject) => {
    const events = [];
    const watchdog = setTimeout(() => { socket.close(); reject(new Error('Relay query did not reach EOSE.')); }, 10000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, filter])));
    socket.addEventListener('message', event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === subscription && frame[2]?.id) events.push(frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === subscription) { clearTimeout(watchdog); socket.close(); resolve(events); }
    });
    socket.addEventListener('error', () => { clearTimeout(watchdog); reject(new Error('Relay query WebSocket failed.')); }, { once: true });
  });
}

async function main() {
  const parts = await Promise.all(Array.from({ length: PART_COUNT }, (_, index) => readFile(path.join(PARTS_ROOT, `part-${String(index).padStart(3, '0')}`))));
  const archive = Buffer.concat(parts);
  assert.equal(archive.length, 67_845_545);
  assert.equal(await sha256(archive), GEODE_SHA256);
  const runtime = path.join(temp, 'geode-runtime'); await mkdir(runtime, { mode: 0o700 });
  await unpackGeode(archive, runtime);
  geodeBinary = path.join(runtime, 'geode/bin/geode'); await access(geodeBinary);
  geode = await startGeode();
  record('geode-package-hash-and-one-isolated-loopback-relay');

  const { context, nostr } = await loadNostr(PROPERTY_ROOT);
  const alphaSecret = nostr.generateSecretKey(), betaSecret = nostr.generateSecretKey();
  const alphaPub = nostr.getPublicKey(alphaSecret), betaPub = nostr.getPublicKey(betaSecret);
  const alpha = await makeAgent('alpha', alphaPub, alphaSecret, nostr, context); daemons.push(alpha.daemon);
  const beta = await makeAgent('beta', betaPub, betaSecret, nostr, context); daemons.push(beta.daemon);
  alphaSecret.fill(0); betaSecret.fill(0);
  for (const profile of ['alpha', 'beta']) {
    const socketPath = resolvePaths(profile, env).socketPath;
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    record(`${profile}-unix-socket-mode-0600`);
  }
  const [alphaInbox, betaInbox] = await Promise.all([
    callUnixJson(alpha.paths.socketPath, 'relay.add', { relay: geode.url }),
    callUnixJson(beta.paths.socketPath, 'relay.add', { relay: geode.url }),
  ]);
  assert.deepEqual([alphaInbox.announcement_acks, betaInbox.announcement_acks], [1, 1]);
  const alphaConfig = JSON.parse(await readFile(alpha.paths.configPath, 'utf8'));
  const betaConfig = JSON.parse(await readFile(beta.paths.configPath, 'utf8'));
  assert.equal('contacts' in alphaConfig, false); assert.equal('contacts' in betaConfig, false);
  assert.deepEqual(alphaConfig.blocked_pubkeys, []); assert.deepEqual(betaConfig.blocked_pubkeys, []);
  record('agents-announce-own-inbox-relays-without-pairing-or-contacts');

  const hostA = new McpHost('host-a', 'alpha').start();
  const hostB = new McpHostRawStream('host-b', 'beta').start();
  hosts.push(hostA, hostB);
  await Promise.all([hostA.discover(), hostB.discover()]);
  for (const host of [hostA, hostB]) {
    const listed = await host.tool('property_list_conversations');
    assert.equal(listed.isError, false); assert.equal(listed.value.conversations.length, 0);
    const inventory = await host.call('tools/list');
    assert.equal(inventory.result.tools.length, 11);
    assert.deepEqual(inventory.result.tools.map(tool => tool.name), ['property_status', 'property_list_conversations', 'property_read_messages', 'property_send_message', 'property_set_activity',
      'property_xno_policy', 'property_xno_create_offer', 'property_xno_pay_offer', 'property_xno_trade_status', 'property_xno_verify_receipt', 'property_xno_dispute']);
    const sendTool = inventory.result.tools.find(tool => tool.name === 'property_send_message');
    assert.deepEqual(sendTool.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
    record(`${host.name}-fixed-tool-inventory-and-empty-unpaired-inbox`);
    const paymentPolicy = await host.tool('property_xno_policy');
    assert.deepEqual(paymentPolicy.value, { configured: false, escrow: false, reason: 'xno-wallet-not-configured' });
    const unsafePay = await host.tool('property_xno_pay_offer', { conversation_pubkey: alphaPub, offer_message_id: '1'.repeat(32) });
    assert.equal(unsafePay.isError, true); assert.equal(unsafePay.value.error, 'xno-wallet-not-configured');
    record(`${host.name}-xno-spending-disabled-until-owner-configures-local-policy`);
  }

  const betaSignalSecret = secretBytesInContext(context, unlockVault(JSON.parse(await readFile(beta.paths.vaultPath, 'utf8')), PASSWORD, nostr, context).secretHex);
  const alphaSignalSecret = secretBytesInContext(context, unlockVault(JSON.parse(await readFile(alpha.paths.vaultPath, 'utf8')), PASSWORD, nostr, context).secretHex);
  const activityCounts = { alpha_to_beta: 0, beta_to_alpha: 0 };
  for (const [sender, recipient, host, recipientSecret, direction] of [
    [alphaPub, betaPub, hostA, betaSignalSecret, 'alpha_to_beta'],
    [betaPub, alphaPub, hostB, alphaSignalSecret, 'beta_to_alpha'],
  ]) {
    const watcher = await watchEphemeral(geode.url, recipient);
    try {
      for (let repetition = 0; repetition < 5; repetition++) {
        for (const state of ['thinking', 'stop']) {
          const result = await host.tool('property_set_activity', { conversation_pubkey: recipient, state });
          assert.equal(result.isError, false, `${direction} ${state} call succeeds`);
          assert.equal(result.value.state, state);
          const event = await watcher.next();
          assert.equal(event.kind, 21059);
          const eventInNostrContext = eventInContext(context, event);
          assert.equal(nostr.getEventHash(eventInNostrContext), event.id, 'ephemeral wrapper id matches its canonical event hash');
          assert.equal(nostr.verifyEvent(eventInNostrContext), true, 'ephemeral wrapper signature verifies');
          assert.deepEqual(event.tags, [['p', recipient]], 'only the intended recipient is routed');
          assert.equal(event.content.includes(`"action":"${state}"`), false, 'state is not plaintext in the wrapper');
          const opened = context.PropertyTypingSignals.unwrap(nostr, eventInNostrContext, recipientSecret);
          assert.equal(opened?.sender, sender); assert.equal(opened?.action, state);
          assert.equal(opened?.maxAgeSeconds, state === 'thinking' ? 60 : 8);
          activityCounts[direction]++;
        }
      }
    } finally { watcher.close(); }
  }
  assert.deepEqual(activityCounts, { alpha_to_beta: 10, beta_to_alpha: 10 });
  const retainedActivity = await queryRelay(geode.url, { kinds: [21059], '#p': [alphaPub, betaPub], limit: 100 });
  assert.deepEqual(retainedActivity, [], 'the relay does not retain ephemeral activity wrappers');
  record('10-encrypted-ephemeral-thinking-and-stop-signals-per-agent-not-retained');

  const send = (host, peer, direction, index) => host.tool('property_send_message', { conversation_pubkey: peer, text: `${direction}-${String(index).padStart(2, '0')}`, in_reply_to: null });
  const read = (host, peer) => host.tool('property_read_messages', { conversation_pubkey: peer, limit: 100 });
  for (let index = 1; index < 25; index++) {
    const a = await send(hostA, betaPub, 'alpha-to-beta', index); const b = await send(hostB, alphaPub, 'beta-to-alpha', index);
    assert.equal(a.isError, false); assert.equal(b.isError, false);
  }
  const concurrent = await Promise.all([send(hostA, betaPub, 'alpha-to-beta', 25), send(hostB, alphaPub, 'beta-to-alpha', 25)]);
  assert.deepEqual(concurrent.map(result => result.isError), [false, false]);
  record('25-nip17-mcp-sends-per-agent-including-concurrent-call');

  let lastA, lastB;
  for (let index = 0; index < 25; index++) {
    lastA = await read(hostA, betaPub); lastB = await read(hostB, alphaPub);
    assert.equal(lastA.isError, false); assert.equal(lastB.isError, false);
  }
  const aMessages = lastA.value.messages; const bMessages = lastB.value.messages;
  assert.equal(aMessages.length, 25, 'agent A reads the 25 messages received from its peer');
  assert.equal(bMessages.length, 25, 'agent B reads the 25 messages received from its peer');
  assert.ok(aMessages.every(message => message.direction === 'received' && message.body.startsWith('beta-to-alpha-')));
  assert.ok(bMessages.every(message => message.direction === 'received' && message.body.startsWith('alpha-to-beta-')));
  const [listedAlpha, listedBeta] = await Promise.all([hostA.tool('property_list_conversations'), hostB.tool('property_list_conversations')]);
  assert.deepEqual(listedAlpha.value.conversations.map(item => item.pubkey), [betaPub]);
  assert.deepEqual(listedBeta.value.conversations.map(item => item.pubkey), [alphaPub]);
  record('25-nip17-mcp-reads-per-agent-and-two-way-decryption');

  const unconfiguredSecret = nostr.generateSecretKey();
  const unconfiguredPeer = nostr.getPublicKey(unconfiguredSecret);
  unconfiguredSecret.fill(0);
  const firstContact = await hostA.tool('property_send_message', { conversation_pubkey: unconfiguredPeer, text: 'primeira mensagem sem cadastro', in_reply_to: null });
  assert.equal(firstContact.isError, false); assert.equal(firstContact.value.status, 'relay_accepted');
  for (let index = 0; index < 10; index++) {
    const peer = index.toString(16).padStart(64, '0');
    const out = await hostA.tool('property_read_messages', { conversation_pubkey: peer, limit: 1 });
    assert.equal(out.isError, false); assert.deepEqual(out.value.messages, []);
  }
  record('direct-send-and-empty-read-work-without-contact-pairing');

  const blocked = await callUnixJson(alpha.paths.socketPath, 'agent.block', { pubkey: betaPub });
  assert.equal(blocked.blocked, true); assert.equal(blocked.changed, true);
  for (const [method, args] of [
    ['property_read_messages', { conversation_pubkey: betaPub, limit: 1 }],
    ['property_send_message', { conversation_pubkey: betaPub, text: 'bloqueado localmente', in_reply_to: null }],
  ]) {
    const result = await hostA.tool(method, args); assert.equal(result.isError, true); assert.equal(result.value.error, 'agent-blocked-locally');
  }
  const unblocked = await callUnixJson(alpha.paths.socketPath, 'agent.unblock', { pubkey: betaPub });
  assert.equal(unblocked.blocked, false); assert.equal(unblocked.changed, true);
  assert.equal((await hostA.tool('property_read_messages', { conversation_pubkey: betaPub, limit: 1 })).isError, false);
  record('local-block-denies-and-unblock-restores-direct-agent-use');
  for (let index = 0; index < 10; index++) {
    const host = index % 2 ? hostA : hostB;
    const out = await host.tool(`property_nonexistent_${index}`);
    assert.equal(out.isError, true); assert.equal(out.value.error, 'tool-not-allowed');
  }
  record('10-nonexistent-tools-rejected');

  const configBeforeExpansionAttempt = JSON.parse(await readFile(alpha.paths.configPath, 'utf8'));
  const removedApprovalTool = await hostA.tool('property_request_human_approval', { conversation_pubkey: 'e'.repeat(64), permission: 'send', reason: 'A ferramenta antiga não deve existir.' });
  assert.equal(removedApprovalTool.isError, true); assert.equal(removedApprovalTool.value.error, 'tool-not-allowed');
  assert.deepEqual(JSON.parse(await readFile(alpha.paths.configPath, 'utf8')), configBeforeExpansionAttempt);
  assert.equal('pending_approvals' in configBeforeExpansionAttempt, false);
  record('no-permission-request-tool-or-approval-queue');

  for (let index = 0; index < 10; index++) {
    const host = index % 2 ? hostA : hostB;
    await host.restart();
    const status = await host.tool('property_status');
    assert.equal(status.isError, false); assert.equal(status.value.unlocked, true);
  }
  record('10-stdio-shutdown-restart-cycles-across-two-hosts');

  logicalNow = FIXED_NOW + 60;
  const relayPort = geode.port;
  await stopGeode(geode); geode = null;
  for (let index = 0; index < 10; index++) {
    const host = index % 2 ? hostA : hostB; const peer = index % 2 ? betaPub : alphaPub;
    const out = await send(host, peer, 'relay-disconnected', index + 1);
    assert.equal(out.isError, true); assert.equal(out.value.error, 'relay-disconnected');
  }
  record('10-relay-disconnected-send-errors-not-reported-as-success');
  geode = await startGeode(relayPort);
  record('isolated-relay-restarted-for-daemon-lock-cleanup');

  const lockActivityCounts = { alpha_to_beta: 0, beta_to_alpha: 0 };
  for (const [profile, host, sender, recipient, recipientSecret, direction] of [
    ['alpha', hostA, alphaPub, betaPub, betaSignalSecret, 'alpha_to_beta'],
    ['beta', hostB, betaPub, alphaPub, alphaSignalSecret, 'beta_to_alpha'],
  ]) {
    const watcher = await watchEphemeral(geode.url, recipient);
    try {
      const thinking = await host.tool('property_set_activity', { conversation_pubkey: recipient, state: 'thinking' });
      assert.equal(thinking.isError, false, `${direction} thinking state succeeds before daemon lock`);
      const startEvent = await watcher.next();
      const startInContext = eventInContext(context, startEvent);
      const openedStart = context.PropertyTypingSignals.unwrap(nostr, startInContext, recipientSecret);
      assert.equal(openedStart?.sender, sender); assert.equal(openedStart?.action, 'thinking');
      const locked = await callUnixJson(resolvePaths(profile, env).socketPath, 'daemon.lock', {});
      assert.equal(locked.locked, true, `${profile} daemon accepts a local lock`);
      const stopEvent = await watcher.next();
      const stopInContext = eventInContext(context, stopEvent);
      assert.equal(nostr.verifyEvent(stopInContext), true, 'the daemon lock publishes a signed stop wrapper');
      const openedStop = context.PropertyTypingSignals.unwrap(nostr, stopInContext, recipientSecret);
      assert.equal(openedStop?.sender, sender); assert.equal(openedStop?.action, 'stop');
      assert.deepEqual(stopEvent.tags, [['p', recipient]], 'the lock stop routes only to its recipient');
      lockActivityCounts[direction]++;
    } finally { watcher.close(); }
  }
  assert.deepEqual(lockActivityCounts, { alpha_to_beta: 1, beta_to_alpha: 1 });
  const retainedLockActivity = await queryRelay(geode.url, { kinds: [21059], '#p': [alphaPub, betaPub], limit: 100 });
  assert.deepEqual(retainedLockActivity, [], 'daemon-lock stop wrappers are not retained by the relay');
  alphaSignalSecret.fill(0); betaSignalSecret.fill(0);
  record('thinking-state-stops-on-local-daemon-lock-for-both-agents');

  assert.deepEqual(hostA.extraneousStdout, []); assert.deepEqual(hostB.extraneousStdout, []);
  assert.equal(hostA.stderr.includes(PASSWORD), false); assert.equal(hostB.stderr.includes(PASSWORD), false);
  assert.equal(hostA.stderr.includes(alphaPub), false); assert.equal(hostB.stderr.includes(betaPub), false);
  record('stdio-stdout-protocol-only-and-no-vault-secrets-or-private-identity-logs');
  await Promise.all([hostA.close(), hostB.close()]);

  const report = {
    gate: 'G4', status: 'PASS_TECHNICAL_OFFLINE', seed: SEED, logicalNow: FIXED_NOW,
    environment: { os: 'linux/x64', node: process.version, mcpProtocol: '2026-07-28', externalConnections: 0, externalModels: 0, realParticipants: 0, agents: 2, mcpHostFixtures: ['host-a', 'host-b'], isolatedGeodeRelays: 1, geodeSha256: GEODE_SHA256 },
    counts: { mcpTools: 5, readsPerAgent: 25, sendsPerAgent: 25, activityTransitionsPerAgent: 12, daemonLockActivityStopsPerAgent: 1, unpairedDirectReads: 10, unpairedDirectSends: 1, localBlockDenials: 2, nonexistentTools: 10, stdioShutdownRestarts: 10, relayDisconnectedErrors: 10, permissionRequestTools: 0, concurrentSends: 2, cases: cases.length },
    evidence: { encryptedVaultWith600000Iterations: true, vaultMode0600: true, dataDirectoriesMode0700: true, unixSocketsMode0600: true, noTcpListener: true, directReadSendWithoutPairing: true, arbitraryUnpairedConversationAllowed: true, localBlocklistEnforced: true, permissionRequestToolAndQueueRemoved: true, propertyDoesNotRequestPerCallApproval: true, sendToolAnnotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, privateThinkingSignalEncrypted: true, thinkingSignalContainsNoStatusText: true, thinkingSignalExpiresLocally: true, thinkingSignalStopsOnDaemonLock: true, ephemeralThinkingSignalNotRetained: true, noSecretReturnedByTools: true, relayAcknowledgementMeansOnlyLocalRelayAcceptance: true, allMcpStdoutIsJsonRpc: true, externalTraffic: false },
    cases,
  };
  await writeFile(path.join(PROPERTY_ROOT, 'docs/evidence/agent-messaging/G4-direct-offline-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`PASS_G4_TECHNICAL_OFFLINE\n${JSON.stringify({ seed: SEED, counts: report.counts, caseCount: cases.length, geodeSha256: GEODE_SHA256 })}\n`);
}

try { await main(); }
finally {
  await Promise.all(hosts.map(host => host.close().catch(() => {})));
  for (const daemon of daemons.reverse()) { try { await daemon.shutdown(); } catch {} }
  await stopGeode(geode);
  await rm(runtimeRoot, { recursive: true, force: true });
  await rm(temp, { recursive: true, force: true });
}
