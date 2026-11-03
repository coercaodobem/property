import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { createHash, webcrypto } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TESTS_ROOT = path.join(PROPERTY_ROOT, 'tests');
const REPO_ROOT = path.resolve(PROPERTY_ROOT, '..');
const PARTS_ROOT = path.join(PROPERTY_ROOT, 'relay/dist-parts');
const PART_COUNT = 130;
const GEODE_SHA256 = '9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7';
const SEED = 'property-agent-g3-geode-fixed-v1';
const LOGICAL_NOW = 1_900_000_000;
function readArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) throw new Error('Use pares --nome valor para o browser fixado.');
    result[argv[index].slice(2).replaceAll('-', '_')] = argv[index + 1];
  }
  for (const name of ['playwright_module', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256']) if (!result[name]) throw new Error(`Parâmetro obrigatório ausente: --${name.replaceAll('_', '-')}`);
  result.engine ||= 'firefox';
  if (!['chromium', 'firefox', 'webkit'].includes(result.engine)) throw new Error('Engine do browser inválida.');
  return result;
}
const browserOptions = readArgs(process.argv.slice(2));
const tempBase = process.env.PROPERTY_AGENT_G3_TMPDIR || PROPERTY_ROOT;
const temp = await mkdtemp(path.join(tempBase, '.property-agent-g3-'));
await chmod(temp, 0o700);
const cases = [];
const relayChildren = [];
const Nctx = { crypto: webcrypto, TextEncoder, TextDecoder };
Nctx.window = Nctx; vm.createContext(Nctx);
vm.runInContext(await readFile(path.join(PROPERTY_ROOT, 'web/vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), Nctx, { timeout: 5000 });
vm.runInContext(await readFile(path.join(PROPERTY_ROOT, 'web/agent-messaging.js'), 'utf8'), Nctx, { timeout: 5000 });
const N = Nctx.NostrTools, AgentMessages = Nctx.PropertyAgentMessages;
let geodeBinary = '', alpha = null, beta = null, partitionCount = 0;

function record(id, result = 'PASS') {
  cases.push({ id, result });
  if (cases.length % 20 === 0) process.stderr.write(`G3 checkpoint ${cases.length}: ${id}\n`);
}
function verifyNostrEvent(event) {
  Nctx.g3EventJson = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(g3EventJson))', Nctx, { timeout: 5000 });
}
function observerCannotDecrypt(event) {
  Nctx.g3ObserverEventJson = JSON.stringify(event);
  Nctx.g3ObserverSecretHex = `${'00'.repeat(31)}cb`;
  return vm.runInContext(`(() => {
    const wrapped = JSON.parse(g3ObserverEventJson);
    const secret = Uint8Array.from(g3ObserverSecretHex.match(/.{2}/g), value => parseInt(value, 16));
    try { NostrTools.nip17.unwrapEvent(wrapped, secret); return false; }
    catch { return true; }
  })()`, Nctx, { timeout: 5000 });
}
function fixtureId(prefix, index) { return `${prefix}${Number(index).toString(16).padStart(31, '0')}`; }
function recipientTag(event) { return event.tags?.find(tag => tag[0] === 'p')?.[1] || ''; }
async function hashFile(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function hashTree(directory) {
  const lines = [];
  async function walk(root, prefix = '') {
    for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(root, entry.name), relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Link inesperado no runtime de teste: ${relative}`);
      if (entry.isDirectory()) await walk(absolute, relative);
      else lines.push(`${relative}\0${await hashFile(absolute)}\n`);
    }
  }
  await walk(directory); return createHash('sha256').update(lines.join('')).digest('hex');
}
async function startPwaServer() {
  const webRoot = path.join(PROPERTY_ROOT, 'web');
  const requests = [];
  const types = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json'], ['.svg', 'image/svg+xml'], ['.png', 'image/png']]);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const relative = url.pathname === '/' || url.pathname === '/property/' ? 'index.html' : url.pathname.replace(/^\/property\//, '');
      const target = path.resolve(webRoot, decodeURIComponent(relative));
      if (target !== webRoot && !target.startsWith(`${webRoot}${path.sep}`)) return response.writeHead(403).end();
      const body = await readFile(target);
      if (requests.length < 80) requests.push({ path: url.pathname, status: 200, bytes: body.length });
      response.writeHead(200, { 'content-type': types.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { if (requests.length < 80) requests.push({ path: request.url, status: 404 }); response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, requests };
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function prepareGeode() {
  const parts = await Promise.all(Array.from({ length: PART_COUNT }, (_, index) => readFile(path.join(PARTS_ROOT, `part-${String(index).padStart(3, '0')}`))));
  const archive = Buffer.concat(parts);
  assert.equal(archive.length, 67_845_545);
  assert.equal(createHash('sha256').update(archive).digest('hex'), GEODE_SHA256);
  const runtimeDir = path.join(temp, 'runtime');
  await mkdir(runtimeDir, { mode: 0o700 });
  const unpack = spawnSync('tar', ['--no-same-owner', '-xz', '-C', runtimeDir], { input: archive, encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(unpack.status, 0, `${unpack.stdout}\n${unpack.stderr}`);
  geodeBinary = path.join(runtimeDir, 'geode/bin/geode'); await access(geodeBinary);
  return { sha256: GEODE_SHA256, bytes: archive.length };
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
async function startRelay(index) {
  const port = await freePort(), root = path.join(temp, `relay-${index}`);
  const data = path.join(root, 'data'), configDir = path.join(root, 'config'), javaTemp = path.join(root, 'java-tmp');
  await mkdir(data, { recursive: true, mode: 0o700 }); await mkdir(configDir, { recursive: true, mode: 0o700 }); await mkdir(javaTemp, { recursive: true, mode: 0o700 });
  const config = path.join(configDir, 'geode.toml');
  const db = path.join(data, 'events.db');
  await writeFile(config, `[info]\nname = "Property G3 ${index}"\ndescription = "Local isolated G3 fixture"\n\n[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[database]\nin_memory = false\nfile = "${db}"\n\n[options]\nverify_signatures = true\nrequire_auth = false\n`, { mode: 0o600 });
  const child = spawn(geodeBinary, ['--config', config, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: REPO_ROOT, detached: process.platform !== 'win32',
    env: { ...process.env, TMPDIR: javaTemp, TMP: javaTemp, TEMP: javaTemp, JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir=${javaTemp} -Xms64m -Xmx512m -XX:MaxDirectMemorySize=128m -XX:ActiveProcessorCount=2 -XX:+UseSerialGC -Djava.util.concurrent.ForkJoinPool.common.parallelism=2` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; const collect = chunk => { output = `${output}${chunk}`.slice(-3000); };
  child.propertyTestLog = () => output.slice(-1200);
  child.stdout.on('data', collect); child.stderr.on('data', collect); relayChildren.push(child);
  await waitForRelay(port, child, () => output);
  assert.equal((await stat(data)).mode & 0o777, 0o700); assert.equal((await stat(configDir)).mode & 0o777, 0o700); assert.equal((await stat(config)).mode & 0o777, 0o600);
  return { url: `ws://127.0.0.1:${port}`, port, data };
}
async function stopRelay(child) {
  if (!child || child.exitCode !== null) return;
  try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 8000))]);
  if (child.exitCode === null) { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {} }
}

class Agent {
  constructor(role) { this.role = role; this.seq = 0; this.pending = new Map(); this.stderr = ''; this.child = null; this.pubkey = ''; }
  start() {
    const script = path.join(TESTS_ROOT, 'fixtures/agent-process.mjs');
    const state = path.join(temp, `agent-${this.role}`, 'seen-message-ids.json');
    this.child = spawn(process.execPath, [script], { cwd: REPO_ROOT, env: { ...process.env, PROPERTY_G3_AGENT_ROLE: this.role, PROPERTY_G3_AGENT_STATE: state, PROPERTY_G3_PROPERTY_ROOT: PROPERTY_ROOT }, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      let response; try { response = JSON.parse(line); } catch { this.stderr = 'invalid synthetic-agent output'; return; }
      const pending = this.pending.get(response.id); if (!pending) return;
      this.pending.delete(response.id); clearTimeout(pending.timer);
      const relayTail = relayChildren.map((child, index) => `r${index + 1}=${child.propertyTestLog?.() || ''}`).join(' | ');
      response.error ? pending.reject(new Error(`${this.role}.${pending.op} after ${cases.length} cases (${cases.at(-1)?.id || 'startup'}): ${response.error}; relay=${relayTail}`)) : pending.resolve(response.result);
    });
    this.child.stderr.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-3000); });
    this.child.on('exit', code => { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(`agent ${this.role} exited ${code}: ${this.stderr}`)); } this.pending.clear(); });
    return this;
  }
  call(op, fields = {}) {
    if (!this.child || this.child.exitCode !== null) return Promise.reject(new Error(`agent ${this.role} is not running`));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`agent operation incomplete: ${op}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer, op });
      this.child.stdin.write(`${JSON.stringify({ id, op, ...fields })}\n`, error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    try { await this.call('shutdown'); } catch {}
    this.child.stdin.end();
    await Promise.race([new Promise(resolve => this.child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (this.child.exitCode === null) this.child.kill('SIGKILL');
  }
}
async function runPwaIntegration(agent, relayUrl) {
  const modulePath = path.resolve(browserOptions.playwright_module), executable = path.resolve(browserOptions.executable);
  await access(modulePath); await access(executable);
  const packageDir = path.dirname(modulePath), pkg = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  assert.equal(pkg.version, browserOptions.playwright_version);
  assert.equal(await hashTree(packageDir), browserOptions.playwright_package_sha256);
  assert.equal(await hashFile(executable), browserOptions.browser_executable_sha256);
  const playwright = createRequire(modulePath)(modulePath);
  const localServer = await startPwaServer();
  const profile = path.join(temp, 'firefox-profile'); await mkdir(profile, { mode: 0o700 });
  const blockedRequests = [], websocketUrls = [], pageErrors = [], failedRequests = [], observedRelayEventIds = new Set(), relayEventWaiters = new Map();
  const relayOrigin = relayUrl.replace(/^ws:/, 'ws:');
  let context, serverClosed = false;
  try {
    context = await playwright[browserOptions.engine].launchPersistentContext(profile, {
      headless: true, executablePath: executable, viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
      ...(browserOptions.engine === 'firefox' ? { firefoxUserPrefs: { 'toolkit.telemetry.enabled': false, 'datareporting.healthreport.uploadEnabled': false, 'app.update.enabled': false, 'browser.newtabpage.enabled': false, 'browser.shell.checkDefaultBrowser': false } } : {}),
      ...(browserOptions.engine === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--no-first-run'] } : {}),
    });
    assert.equal(context.browser().version(), browserOptions.browser_version);
    await context.route('**/*', route => {
      let origin; try { origin = new URL(route.request().url()).origin; } catch { origin = ''; }
      if (origin === localServer.origin || origin === relayOrigin) return route.continue();
      blockedRequests.push(origin || 'invalid-url'); return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' }));
    let rendererCrash = null; page.on('crash', error => { rendererCrash = error.message; });
    page.on('websocket', socket => {
      websocketUrls.push(socket.url());
      socket.on('framereceived', ({ payload }) => {
        let frame; try { frame = JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : payload); } catch { return; }
        if (frame[0] !== 'EVENT' || typeof frame[2]?.id !== 'string') return;
        observedRelayEventIds.add(frame[2].id);
        relayEventWaiters.get(frame[2].id)?.();
      });
    });
    try { await page.goto(`${localServer.origin}/property/`, { waitUntil: 'domcontentloaded' }); }
    catch (error) { throw new Error(`${error.message}; browser-diagnostic=${JSON.stringify({ rendererCrash, pwaRequests: localServer.requests, failedRequests, blockedRequests })}`); }
    await page.locator('#create-account-button:not([disabled])').waitFor({ timeout: 15000 });
    await page.locator('#create-account-button').click();
    await page.locator('#new-password').fill('Property-G3-offline-fixture-2026!');
    await page.locator('#confirm-password').fill('Property-G3-offline-fixture-2026!');
    await page.locator('#finish-create-button').click();
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
    const humanPubkey = await page.evaluate(() => NostrTools.nip19.decode(document.querySelector('#profile-npub').textContent.trim()).data);
    const friend = await page.evaluate(async () => {
      const secret = new Uint8Array(32); secret[31] = 243; const pubkey = NostrTools.getPublicKey(secret);
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise((resolve, reject) => { const tx = db.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put({ pubkey, title: 'Pessoa preservada', lastAt: 0, lastMessage: '' }); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      return pubkey;
    });

    await page.locator('#open-settings').click();
    await page.locator('#relay-dialog[open]').waitFor();
    await page.locator('#relay-input').fill([relayUrl].join('\n'));
    await page.locator('#save-relays').click();
    await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
    await page.locator('#open-settings').click();
    await page.locator('#dm-relay-input').fill(relayUrl);
    await page.locator('#publish-inbox-list').click();
    await page.getByText('Sua lista pública de recebimento NIP-17 foi publicada.', { exact: true }).waitFor();
    await page.locator('#relay-dialog button[aria-label="Fechar"]').click();
    await page.locator('#relay-dialog').waitFor({ state: 'hidden' });

    await agent.call('publish-inbox-list', { urls: [relayUrl] });
    const invite = await agent.call('make-invite', { name: 'Agente G3', recipientPubkey: humanPubkey, relayHints: [relayUrl] });
    await page.locator('#profile-button').click();
    await page.locator('#open-agent-manager').click();
    await page.locator('#agent-invite-input').fill(invite.invite);
    await page.locator('#inspect-agent-invite').click();
    await page.locator('#agent-invite-review:not(.hidden)').waitFor();
    const scopes = page.locator('#agent-permission-list input[type="checkbox"]');
    for (let index = 0; index < await scopes.count(); index++) assert.equal(await scopes.nth(index).isChecked(), false, 'agent scopes remain opt-in');
    await page.locator('#approve-agent-invite').click();
    await page.getByText('AGENTE · ACESSO ATIVO', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Abrir conversa' }).click();
    assert.match(await page.locator('#chat-subtitle').textContent(), /^AGENTE · npub1/);
    assert.ok((await page.locator('#conversation-list').textContent()).includes('Pessoa preservada'), 'the pre-existing human conversation remains in the list');

    const conversation = await AgentMessages.conversationId(humanPubkey, agent.pubkey);
    const unsolicitedMessageId = fixtureId('d', 0), unsolicitedBody = 'Mensagem sem iniciar a conversa';
    const unsolicited = await wrap(agent, humanPubkey, conversation, unsolicitedMessageId, unsolicitedBody);
    await publish(agent, unsolicited.recipient, [relayUrl]);
    if (!observedRelayEventIds.has(unsolicited.recipient.id)) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { relayEventWaiters.delete(unsolicited.recipient.id); reject(new Error('PWA não recebeu o envelope local do ensaio antes de validar o bloqueio de mensagem não solicitada.')); }, 10000);
        relayEventWaiters.set(unsolicited.recipient.id, () => { clearTimeout(timer); relayEventWaiters.delete(unsolicited.recipient.id); resolve(); });
      });
    }
    for (let repetition = 0; repetition < 3; repetition++) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
    const unsolicitedStored = await page.evaluate(async ({ peer, messageId }) => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      return await new Promise((resolve, reject) => { const tx = db.transaction('messages', 'readonly'), request = tx.objectStore('messages').get(`agent:${peer}:${messageId}`); tx.oncomplete = () => resolve(Boolean(request.result)); tx.onerror = () => reject(tx.error); });
    }, { peer: agent.pubkey, messageId: unsolicitedMessageId });
    assert.equal(unsolicitedStored, false); assert.equal((await page.locator('#messages').textContent()).includes(unsolicitedBody), false);
    record('G3-pwa-unsolicited-agent-message-ignored-before-human-initiation');

    const humanBody = 'Resposta humana local G3';
    await page.locator('#message-input').fill(humanBody);
    await page.locator('#send-form button[type="submit"]').click();
    await page.locator('.message-row.mine').filter({ hasText: humanBody }).waitFor();
    await page.waitForFunction(async body => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      return await new Promise((resolve, reject) => { const tx = db.transaction('messages', 'readonly'), request = tx.objectStore('messages').getAll(); tx.oncomplete = () => resolve(request.result.some(item => item.direction === 'sent' && item.text === body && item.status === 'sent')); tx.onerror = () => reject(tx.error); });
    }, humanBody, { timeout: 15000 });
    const humanEvents = await query(agent, [relayUrl], { kinds: [1059], '#p': [agent.pubkey], limit: 500 });
    const humanMessages = [];
    for (const event of humanEvents.events) humanMessages.push(await agent.call('receive-human-text', { event, expectedSender: humanPubkey, conversationId: conversation }));
    const acceptedHumanRequests = humanMessages.filter(item => item.status === 'accepted-human-text' && item.body === humanBody);
    assert.equal(acceptedHumanRequests.length, 1,
      `queried=${humanEvents.events.length}; receiveStates=${humanMessages.map(item => item.status).join(',')}`);
    record('G3-pwa-human-initiates-direct-agent-conversation');

    const agentBody = 'Resposta do agente local G3';
    const outgoing = await wrap(agent, humanPubkey, conversation, fixtureId('d', 1), agentBody, acceptedHumanRequests[0].messageId);
    await publish(agent, outgoing.recipient, [relayUrl]);
    await page.locator('#messages .message-bubble').filter({ hasText: agentBody }).waitFor({ timeout: 15000 });
    assert.equal((await page.locator('.message-row').filter({ hasText: agentBody }).locator('.agent-message-author').textContent()).trim(), 'Agente');
    const stored = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      return await new Promise((resolve, reject) => { const tx = db.transaction('messages', 'readonly'), request = tx.objectStore('messages').getAll(); tx.oncomplete = () => resolve(request.result.filter(item => item.fromAgent).map(item => ({ fromAgent: item.fromAgent, agentMessageId: item.agentMessageId, inReplyTo: item.inReplyTo }))); tx.onerror = () => reject(tx.error); });
    });
    assert.equal(stored.length, 1); assert.equal(stored[0].agentMessageId, fixtureId('d', 1)); assert.equal(stored[0].inReplyTo, acceptedHumanRequests[0].messageId);

    const screenshotDir = path.join(PROPERTY_ROOT, 'docs/evidence/agent-messaging/G3-browser');
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'agent-direct-conversation.png'), fullPage: false });
    await page.locator('#conversation-list .conversation-item').filter({ hasText: 'Pessoa preservada' }).click();
    assert.equal((await page.locator('#chat-title').textContent()).trim(), 'Pessoa preservada');
    assert.doesNotMatch(await page.locator('#chat-subtitle').textContent(), /^AGENTE ·/);
    assert.deepEqual(pageErrors, []);
    assert.equal(blockedRequests.length, 0);
    assert.ok(websocketUrls.length >= 1 && websocketUrls.every(url => new URL(url).origin === relayOrigin));
    record('G3-pwa-human-identity-and-relay-inbox');
    record('G3-pwa-agent-invite-and-label');
    record('G3-pwa-unsolicited-agent-message-ignored');
    record('G3-pwa-receives-decrypted-agent-envelope');
    record('G3-pwa-human-initiates-over-nip17-and-agent-replies');
    record('G3-pwa-human-conversation-preserved');
    return { engine: browserOptions.engine, browser: context.browser().version(), playwright: pkg.version, websocketConnections: websocketUrls.length, blockedExternalRequests: blockedRequests.length, pageErrors: pageErrors.length, pwaIdentityPreserved: true, agentConversationLabeled: true, unsolicitedMessageIgnoredBeforeHumanInitiation: true, humanInitiatedDirectAgentConversation: true, decryptedAgentMessage: true, agentReplyCorrelatedToHumanRequest: true, humanReplyDecryptedByAgentProcess: true, existingHumanConversationPreserved: true, serviceWorkerControlled: false, screenshot: 'docs/evidence/agent-messaging/G3-browser/agent-direct-conversation.png' };
  } finally {
    if (context) await context.close();
    if (!serverClosed) await new Promise(resolve => localServer.server.close(resolve));
  }
}
async function publish(agent, event, urls) {
  const results = await Promise.all(urls.map(url => agent.call('publish', { url, event })));
  assert.ok(results.every(item => item.accepted));
}
async function query(agent, urls, filter) {
  const pages = await Promise.all(urls.map(url => agent.call('query', { url, filter })));
  const events = new Map(); let relayDuplicates = 0;
  for (const page of pages) { assert.equal(page.eose, true); for (const event of page.events) { if (events.has(event.id)) relayDuplicates++; else events.set(event.id, event); } }
  return { events: [...events.values()], relayDuplicates };
}
async function wrap(agent, recipientPubkey, conversationId, messageId, body, inReplyTo = null) {
  const { wraps } = await agent.call('make-envelope', { recipientPubkey, conversationId, messageId, body, inReplyTo });
  assert.equal(wraps.length, 2); for (const event of wraps) assert.equal(verifyNostrEvent(event), true, 'NIP-17 signature verifies after JSON IPC');
  const recipient = wraps.find(event => recipientTag(event) === recipientPubkey);
  const sender = wraps.find(event => recipientTag(event) === agent.pubkey);
  assert.ok(recipient && sender);
  return { recipient, sender };
}
async function transmit(agent, item, ownRelays, peerRelays, partitionTarget = '') {
  await publish(agent, item.sender, ownRelays);
  for (const url of peerRelays) {
    if (url !== partitionTarget) { await publish(agent, item.recipient, [url]); continue; }
    await agent.call('disconnect', { urls: [url] });
    await assert.rejects(() => agent.call('publish', { url, event: item.recipient }), /not connected/);
    const receiver = recipientTag(item.recipient) === alpha?.pubkey ? alpha : beta;
    assert.equal((await query(receiver, [url], { ids: [item.recipient.id] })).events.length, 0);
    record(`G3-partition-before-reconnect-${String(partitionCount + 1).padStart(2, '0')}`);
    await publish(agent, item.recipient, peerRelays.filter(candidate => candidate !== url));
    await agent.call('connect', { urls: [url] });
    await publish(agent, item.recipient, [url]);
    assert.equal((await query(receiver, [url], { ids: [item.recipient.id] })).events.length, 1);
    partitionCount++; record(`G3-partition-after-reconnect-${String(partitionCount).padStart(2, '0')}`);
  }
}

try {
  const runtime = await prepareGeode();
  const relays = []; for (let index = 1; index <= 3; index++) relays.push(await startRelay(index));
  const relayUrls = relays.map(item => item.url);
  alpha = new Agent('alpha').start(); beta = new Agent('beta').start();
  alpha.pubkey = (await alpha.call('identity')).pubkey; beta.pubkey = (await beta.call('identity')).pubkey;
  assert.notEqual(alpha.pubkey, beta.pubkey); record('G3-two-independent-agent-identities');
  const conversation = await AgentMessages.conversationId(alpha.pubkey, beta.pubkey);
  assert.equal(conversation, await AgentMessages.conversationId(beta.pubkey, alpha.pubkey));
  await Promise.all([alpha.call('connect', { urls: relayUrls }), beta.call('connect', { urls: relayUrls })]);
  record('G3-three-isolated-Geode-relays');
  const inboxA = [relayUrls[0], relayUrls[1]], inboxB = [relayUrls[1], relayUrls[2]];
  const alphaPackets = [], betaPackets = [];
  let partitionsUsed = 0;

  for (let index = 1; index <= 50; index++) {
    const messageId = fixtureId('a', index);
    const body = `fixture A-to-B ${String(index).padStart(2, '0')}`;
    const packet = await wrap(alpha, beta.pubkey, conversation, messageId, body);
    const senderView = await alpha.call('inspect-agent-envelope', { event: packet.sender, expectedSender: alpha.pubkey, conversationId: conversation });
    assert.equal(senderView.status, 'accepted'); assert.equal(senderView.messageId, messageId); assert.equal(senderView.body, body);
    record(`G3-sender-decrypt-alpha-to-beta-${String(index).padStart(2, '0')}`);
    if (index <= 10) {
      assert.equal(observerCannotDecrypt(packet.recipient), true); assert.equal(observerCannotDecrypt(packet.sender), true);
      record(`G3-third-party-cannot-decrypt-alpha-to-beta-${String(index).padStart(2, '0')}`);
    }
    alphaPackets.push({ messageId, packet, body });
    const partition = partitionsUsed < 5 ? inboxB[(partitionsUsed++) % 2] : '';
    await transmit(alpha, packet, inboxA, inboxB, partition);
    record(`G3-message-alpha-to-beta-${String(index).padStart(2, '0')}`);
  }

  const foundB = await query(beta, inboxB, { kinds: [1059], '#p': [beta.pubkey], limit: 500 });
  const eventsB = new Map(foundB.events.map(event => [event.id, event]));
  assert.ok(foundB.relayDuplicates >= 1);
  assert.ok(alphaPackets.every(item => eventsB.has(item.packet.recipient.id)));
  assert.ok(alphaPackets.every(item => !JSON.stringify(eventsB.get(item.packet.recipient.id)).includes('fixture A-to-B')));
  record('G3-query-both-relays-dedupes-and-hides-plaintext');

  const acceptedB = new Map();
  for (let index = 10; index < 50; index++) {
    const item = alphaPackets[index], result = await beta.call('receive', { event: item.packet.recipient, expectedSender: alpha.pubkey, conversationId: conversation });
    assert.equal(result.status, 'accepted'); assert.equal(result.messageId, item.messageId); acceptedB.set(result.messageId, result);
    record(`G3-decrypt-alpha-to-beta-${String(index + 1).padStart(2, '0')}`);
  }
  const reversed = alphaPackets.slice(0, 10).reverse(); const reversedIds = [];
  for (const item of reversed) { const result = await beta.call('receive', { event: item.packet.recipient, expectedSender: alpha.pubkey, conversationId: conversation }); assert.equal(result.status, 'accepted'); reversedIds.push(result.messageId); acceptedB.set(result.messageId, result); record(`G3-reordered-${String(reversedIds.length).padStart(2, '0')}`); }
  assert.deepEqual(reversedIds, alphaPackets.slice(0, 10).reverse().map(item => item.messageId)); assert.equal(acceptedB.size, 50);
  record('G3-fifty-messages-alpha-to-beta');

  for (let index = 1; index <= 20; index++) {
    const messageId = fixtureId('b', index), requestId = fixtureId('a', index);
    const body = `fixture correlated response ${String(index).padStart(2, '0')}`;
    const packet = await wrap(beta, alpha.pubkey, conversation, messageId, body, requestId);
    const senderView = await beta.call('inspect-agent-envelope', { event: packet.sender, expectedSender: beta.pubkey, conversationId: conversation });
    assert.equal(senderView.status, 'accepted'); assert.equal(senderView.messageId, messageId); assert.equal(senderView.body, body);
    record(`G3-sender-decrypt-beta-to-alpha-${String(index).padStart(2, '0')}`);
    if (index <= 10) {
      assert.equal(observerCannotDecrypt(packet.recipient), true); assert.equal(observerCannotDecrypt(packet.sender), true);
      record(`G3-third-party-cannot-decrypt-beta-to-alpha-${String(index).padStart(2, '0')}`);
    }
    betaPackets.push({ messageId, packet, inReplyTo: requestId, body });
    const partition = partitionsUsed < 9 ? inboxA[(partitionsUsed++ + 1) % 2] : '';
    await transmit(beta, packet, inboxB, inboxA, partition);
    record(`G3-correlated-response-${String(index).padStart(2, '0')}`);
  }
  for (let index = 21; index <= 50; index++) {
    const messageId = fixtureId('b', index), body = `fixture B-to-A ${String(index).padStart(2, '0')}`;
    const packet = await wrap(beta, alpha.pubkey, conversation, messageId, body);
    const senderView = await beta.call('inspect-agent-envelope', { event: packet.sender, expectedSender: beta.pubkey, conversationId: conversation });
    assert.equal(senderView.status, 'accepted'); assert.equal(senderView.messageId, messageId); assert.equal(senderView.body, body);
    betaPackets.push({ messageId, packet, inReplyTo: null, body }); await transmit(beta, packet, inboxB, inboxA);
    record(`G3-message-beta-to-alpha-${String(index).padStart(2, '0')}`);
  }
  assert.equal(partitionsUsed, 9); assert.equal(partitionCount, 9);

  const foundA = await query(alpha, inboxA, { kinds: [1059], '#p': [alpha.pubkey], limit: 500 });
  const eventsA = new Map(foundA.events.map(event => [event.id, event]));
  assert.ok(betaPackets.every(item => eventsA.has(item.packet.recipient.id)));
  assert.ok([...eventsA.values()].every(event => [...alphaPackets, ...betaPackets].every(item => !JSON.stringify(event).includes(item.body))));
  record('G3-query-beta-to-alpha-ciphertext-only');

  const allMeshEvents = await query(alpha, relayUrls, { kinds: [1059], limit: 500 });
  const allMeshIds = new Set(allMeshEvents.events.map(event => event.id));
  const expectedWrapIds = [...alphaPackets, ...betaPackets].flatMap(item => [item.packet.sender.id, item.packet.recipient.id]);
  assert.equal(allMeshIds.size, 200);
  assert.ok(expectedWrapIds.every(id => allMeshIds.has(id)));
  assert.ok(allMeshEvents.events.every(event => [...alphaPackets, ...betaPackets].every(item => !JSON.stringify(event).includes(item.body))));
  record('G3-all-relays-store-only-200-encrypted-wraps');

  const acceptedA = new Map();
  for (let index = 0; index < 50; index++) {
    const item = betaPackets[index], result = await alpha.call('receive', { event: item.packet.recipient, expectedSender: beta.pubkey, conversationId: conversation });
    assert.equal(result.status, 'accepted'); assert.equal(result.messageId, item.messageId); assert.equal(result.inReplyTo, item.inReplyTo); acceptedA.set(result.messageId, result);
    record(`G3-decrypt-beta-to-alpha-${String(index + 1).padStart(2, '0')}`);
  }
  assert.equal([...acceptedA.values()].filter(item => item.inReplyTo !== null).length, 20);
  for (let index = 1; index <= 20; index++) assert.equal(acceptedA.get(fixtureId('b', index)).inReplyTo, fixtureId('a', index));
  record('G3-twenty-correlated-responses');

  for (let index = 1; index <= 10; index++) {
    const item = alphaPackets[index - 1], duplicate = await beta.call('receive', { event: item.packet.recipient, expectedSender: alpha.pubkey, conversationId: conversation });
    assert.equal(duplicate.status, 'duplicate'); assert.equal(duplicate.messageId, item.messageId); record(`G3-duplicate-${String(index).padStart(2, '0')}`);
  }
  for (let index = 1; index <= 10; index++) {
    const original = alphaPackets[index - 1].packet.recipient, altered = { ...original, content: `${original.content}x` };
    assert.deepEqual(await beta.call('receive', { event: altered, expectedSender: alpha.pubkey, conversationId: conversation }), { status: 'rejected', code: 'invalid-signature' });
    record(`G3-tampered-${String(index).padStart(2, '0')}`);
  }
  for (let index = 1; index <= 10; index++) {
    const messageId = fixtureId('c', index);
    const content = JSON.stringify({ protocol: 'property-agent-message/v999', version: 999, conversation_id: conversation, message_id: messageId, in_reply_to: null, body: `unknown schema ${index}` });
    const { wraps } = await alpha.call('make-raw-fixture', { recipientPubkey: beta.pubkey, content });
    const event = wraps.find(item => recipientTag(item) === beta.pubkey); await publish(alpha, event, inboxB);
    assert.deepEqual(await beta.call('receive', { event, expectedSender: alpha.pubkey, conversationId: conversation }), { status: 'rejected', code: 'unknown-version' });
    record(`G3-unknown-schema-${String(index).padStart(2, '0')}`);
  }

  const stablePubkeys = { alpha: alpha.pubkey, beta: beta.pubkey };
  await beta.stop();
  await alpha.call('disconnect', { urls: relayUrls.slice(1) });
  record('G3-pwa-resource-isolation-after-mesh-cases');
  const pwa = await runPwaIntegration(alpha, relayUrls[0]);

  for (let cycle = 1; cycle <= 3; cycle++) {
    await alpha.stop(); await beta.stop(); alpha = new Agent('alpha').start(); beta = new Agent('beta').start();
    assert.equal((await alpha.call('identity')).pubkey, stablePubkeys.alpha); assert.equal((await beta.call('identity')).pubkey, stablePubkeys.beta);
    alpha.pubkey = stablePubkeys.alpha; beta.pubkey = stablePubkeys.beta;
    await Promise.all([alpha.call('connect', { urls: relayUrls }), beta.call('connect', { urls: relayUrls })]);
    const aReplay = await alpha.call('receive', { event: betaPackets[0].packet.recipient, expectedSender: beta.pubkey, conversationId: conversation });
    const bReplay = await beta.call('receive', { event: alphaPackets[0].packet.recipient, expectedSender: alpha.pubkey, conversationId: conversation });
    assert.equal(aReplay.status, 'duplicate'); assert.equal(bReplay.status, 'duplicate');
    record(`G3-restart-alpha-${cycle}`); record(`G3-restart-beta-${cycle}`);
  }

  const report = {
    gate: 'G3', status: 'PASS_TECHNICAL_OFFLINE', seed: SEED, logicalNow: LOGICAL_NOW,
    environment: { os: `${process.platform}/${process.arch}`, node: process.version, externalRelayConnections: 0, externalModelCalls: 0, realParticipants: 0, syntheticPwaIdentities: 1, geodePackageSha256: runtime.sha256, geodePackageBytes: runtime.bytes, isolatedGeodeRelays: 3, independentAgentProcesses: 2, pwaEngine: pwa.engine, pwaBrowser: pwa.browser, pwaPlaywright: pwa.playwright },
    counts: { alphaToBeta: 50, betaToAlpha: 50, senderDecryptsEachDirection: 50, thirdPartyDecryptAttempts: 20, thirdPartyDecryptions: 0, correlatedResponses: 20, restartsPerAgent: 3, partitionReconnectEvents: partitionCount, duplicates: 10, tampered: 10, reordered: 10, unknownSchemas: 10, acceptedRelayAcks: 400, partitionedPublishAttempts: 9 },
    evidence: { senderCanDecryptOwnWrap: true, recipientCanDecryptOwnWrap: true, thirdPartyCannotDecryptFixedSamples: true, allMessagesQueriedByRecipient: true, allRelaysStoreOnlyEncryptedWraps: true, relaysSawNoFixturePlaintext: true, duplicateRelayResponsesCollapsedByEventId: true, messageIdDedupSurvivesRestart: true, tamperedSignaturesRejectedBeforeParsing: true, unknownSchemasRejected: true, privateKeysInReport: false, messageBodiesInReport: false },
    pwa,
    caseCount: cases.length, cases,
  };
  const reportPath = path.join(PROPERTY_ROOT, 'docs/evidence/agent-messaging/G3-geode-offline-report.json');
  await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ gate: report.gate, status: report.status, seed: report.seed, environment: report.environment, counts: report.counts, caseCount: report.caseCount, reportPath: 'property/docs/evidence/agent-messaging/G3-geode-offline-report.json' }, null, 2)}\n`);
} finally {
  await Promise.all([alpha?.stop(), beta?.stop()]);
  await Promise.all(relayChildren.map(stopRelay));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
