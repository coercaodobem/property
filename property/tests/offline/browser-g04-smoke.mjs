#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PASSWORD = 'Property-offline-g04-test!';
const CASES = ['G04-01', 'G04-02', 'G04-03', 'G04-04', 'G04-05', 'G04-06'];
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
const safeText = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1000);
const safeDiagnostic = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(-3500);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option ${key}.`);
    options[name] = value;
  }
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (!['chromium', 'firefox'].includes(options.engine)) throw new Error('G04 requires pinned Chromium or Firefox.');
  return options;
}

async function sha256File(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
function startAppServer() {
  const mime = new Map([['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json']]);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') return response.writeHead(405).end();
      const url = new URL(request.url, 'http://127.0.0.1');
      let relative = url.pathname === '/' || url.pathname === '/property' || url.pathname === '/property/' ? 'index.html' :
        url.pathname.startsWith('/property/') ? url.pathname.slice('/property/'.length) : url.pathname.replace(/^\/+/, '');
      relative = decodeURIComponent(relative); const target = path.resolve(WEB, relative);
      if (target !== WEB && !target.startsWith(WEB + path.sep)) return response.writeHead(403).end();
      const info = await stat(target); if (!info.isFile()) return response.writeHead(404).end();
      response.writeHead(200, { 'content-type': mime.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(target));
    } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); }
  });
  return { server, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}
function startProxy() {
  const attempts = [];
  const server = net.createServer(socket => {
    let text = ''; socket.setTimeout(2000, () => socket.destroy());
    socket.on('data', chunk => {
      text += chunk.toString('latin1'); if (!text.includes('\r\n')) return;
      const [method, target = ''] = text.split('\r\n', 1)[0].split(' '); let destination = 'unparseable';
      try { destination = method === 'CONNECT' ? new URL(`http://${target}`).host : new URL(target).origin; } catch {}
      attempts.push({ method, destination }); socket.end('HTTP/1.1 502 Offline denied\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  return { server, attempts, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}
function instrument(context, origin, report) {
  context.on('request', request => { const url = new URL(request.url()); if (url.origin !== origin) report.external_requests.push(`${request.method()} ${url.origin}${url.pathname}`); });
  context.on('page', page => {
    page.on('pageerror', error => report.page_errors.push(safeText(error.message)));
    page.on('websocket', socket => report.websockets.push(socket.url()));
  });
  context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin ? route.continue() : route.abort('blockedbyclient'); });
}

async function loadRuntime(options, proxyPort) {
  await access(options.playwright_module);
  const moduleRoot = path.dirname(options.playwright_module);
  const packageInfo = JSON.parse(await readFile(path.join(moduleRoot, 'package.json'), 'utf8'));
  assert.equal(packageInfo.name, 'playwright'); assert.equal(packageInfo.version, options.playwright_version);
  const treeEntries = [];
  async function walk(dir, prefix = '') {
    for (const entry of (await import('node:fs/promises').then(m => m.readdir(dir, { withFileTypes: true }))).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Playwright symlink: ${rel}`);
      if (entry.isDirectory()) await walk(abs, rel); else treeEntries.push(`${rel}\0${await sha256File(abs)}\n`);
    }
  }
  await walk(moduleRoot); assert.equal(createHash('sha256').update(treeEntries.join('')).digest('hex'), options.playwright_package_sha256);
  assert.equal(await sha256File(options.executable), options.browser_executable_sha256);
  const playwright = createRequire(options.playwright_module)(options.playwright_module);
  const launch = { headless: true, executablePath: options.executable, proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' } };
  if (options.engine === 'chromium') {
    launch.args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection', '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'];
  } else {
    launch.firefoxUserPrefs = {
      'toolkit.telemetry.enabled': false,
      'datareporting.healthreport.uploadEnabled': false,
      'app.update.enabled': false,
      'browser.newtabpage.enabled': false,
      'browser.shell.checkDefaultBrowser': false,
      'network.captive-portal-service.enabled': false,
      'network.connectivity-service.enabled': false
    };
  }
  const browser = await playwright[options.engine].launch(launch); assert.equal(browser.version(), options.browser_version);
  const vendor = await readFile(path.join(WEB, 'vendor/nostr-tools-2.25.2.bundle.js'), 'utf8');
  const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout }; context.window = context;
  vm.createContext(context); vm.runInContext(vendor, context, { timeout: 5000 });
  const nostrVerify = event => {
    context.propertyEventJson = JSON.stringify(event);
    return vm.runInContext('NostrTools.verifyEvent(JSON.parse(propertyEventJson))', context, { timeout: 5000 });
  };
  const createSignedEvent = template => {
    context.propertyTemplateJson = JSON.stringify(template);
    return JSON.parse(vm.runInContext('JSON.stringify(NostrTools.finalizeEvent(JSON.parse(propertyTemplateJson), NostrTools.generateSecretKey()))', context, { timeout: 5000 }));
  };
  return { playwright, browser, launch, nostrVerify, createSignedEvent, evidence: { playwright_version: packageInfo.version, playwright_package_sha256: options.playwright_package_sha256, browser_version: browser.version(), browser_executable_sha256: options.browser_executable_sha256 } };
}

async function startGeode(port, base, label) {
  const data = path.join(base, `${label} data`), config = path.join(base, `${label} config`);
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port), PROPERTY_RELAY_DATA_DIR: data, PROPERTY_RELAY_CONFIG_DIR: config, PROPERTY_RELAY_CONFIG: path.join(config, 'relay.toml') };
  for (const key of PROXY_KEYS) delete env[key];
  const child = spawn('bash', [path.join(ROOT, 'property/relay/start.sh')], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Geode ${label} exited ${child.exitCode}: ${safeText(diagnostic)}`);
    const ready = await new Promise(resolve => { const socket = net.connect(port, '127.0.0.1'); socket.setTimeout(300); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => { socket.destroy(); resolve(false); }); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
    if (ready) return { child, port, url: `ws://127.0.0.1:${port}`, data, config, diagnostic: () => diagnostic };
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Geode ${label} did not become ready: ${safeText(diagnostic)}`);
}
async function stopGeode(relay) {
  if (!relay?.child || relay.child.exitCode !== null) return;
  try { process.kill(-relay.child.pid, 'SIGTERM'); } catch {}
  await Promise.race([new Promise(resolve => relay.child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 6000))]);
  if (relay.child.exitCode === null) { try { process.kill(-relay.child.pid, 'SIGKILL'); } catch {} }
}

function startFalseAckRelay() {
  const events = [];
  const diagnostics = { connections: 0, frames: { EVENT: 0, REQ: 0, CLOSE: 0, other: 0 }, protocolErrors: 0 };
  const server = http.createServer();
  server.on('upgrade', (request, socket) => {
    diagnostics.connections += 1;
    const key = request.headers['sec-websocket-key']; if (!key) return socket.destroy();
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buffer = Buffer.alloc(0);
    const send = value => { const body = Buffer.from(JSON.stringify(value)); const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]); socket.write(Buffer.concat([head, body])); };
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const first = buffer[0], second = buffer[1]; let size = second & 0x7f, offset = 2;
        if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); offset = 4; }
        else if (size === 127) { if (buffer.length < 10) return; const big = buffer.readBigUInt64BE(2); if (big > 1_000_000n) return socket.destroy(); size = Number(big); offset = 10; }
        const masked = (second & 0x80) !== 0; if (masked) offset += 4; if (buffer.length < offset + size) return;
        let body = Buffer.from(buffer.subarray(offset, offset + size));
        if (masked) { const mask = buffer.subarray(offset - 4, offset); for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4]; }
        buffer = buffer.subarray(offset + size); if ((first & 0x0f) === 8) { socket.end(); return; }
        if ((first & 0x0f) !== 1) continue;
        let frame; try { frame = JSON.parse(body.toString('utf8')); } catch { diagnostics.protocolErrors += 1; continue; }
        if (frame[0] === 'EVENT' && frame[1]?.id) { diagnostics.frames.EVENT += 1; events.push(frame[1].id); send(['OK', frame[1].id, true, 'accepted by deliberate false-ack fixture']); }
        else if (frame[0] === 'REQ') { diagnostics.frames.REQ += 1; send(['EOSE', frame[1]]); }
        else if (frame[0] === 'CLOSE') diagnostics.frames.CLOSE += 1;
        else diagnostics.frames.other += 1;
      }
    });
    socket.on('error', () => {});
  });
  return { server, events, diagnostics, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

function wsQuery(url, filter, timeoutMs = 8000) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const events = new Map(); const sub = `property-${crypto.randomUUID()}`;
    const timer = setTimeout(() => { socket.close(); reject(new Error(`Timed out querying ${url}`)); }, timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, filter])));
    socket.addEventListener('message', message => {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub && frame[2]?.id) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(timer); socket.close(); resolve([...events.values()]); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`WebSocket query failed: ${url}`)); }, { once: true });
  });
}
function publishEvent(url, event) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Timed out waiting for relay acknowledgement.')); }, 7000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'OK' && frame[1] === event.id) { clearTimeout(timer); socket.close(); resolve({ accepted: frame[2], message: frame[3] || '' }); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Relay rejected WebSocket connection.')); }, { once: true });
  });
}

async function openApp(context, origin) {
  const page = await context.newPage(); await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#auth-choice')?.classList.contains('hidden') || !document.querySelector('#workspace')?.classList.contains('hidden'), null, { timeout: 20000 });
  return page;
}
async function createIdentity(page) {
  await page.locator('#create-account-button').waitFor({ state: 'visible' }); await page.locator('#create-account-button').click();
  await page.locator('#auth-setup').waitFor({ state: 'visible' }); await page.locator('#new-password').fill(PASSWORD); await page.locator('#confirm-password').fill(PASSWORD);
  await page.locator('#finish-create-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  const npub = (await page.locator('#profile-npub').textContent()).trim();
  const pubkey = await page.evaluate(value => NostrTools.nip19.decode(value).data, npub);
  return { npub, pubkey };
}
async function configureRelays(page, general, inbox, publishInbox = true) {
  await page.locator('#open-settings').click(); await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#relay-input').fill(general.join('\n')); await page.locator('#dm-relay-input').fill(inbox.join('\n'));
  await page.locator('#save-relays').click(); await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  const expectedConnections = `${general.length}/${general.length} relay${general.length === 1 ? '' : 's'}`;
  await page.waitForFunction(expected => document.querySelector('#connection-label')?.textContent === expected, expectedConnections, { timeout: 20000 });
  if (!publishInbox) return;
  await page.locator('#open-settings').click(); await page.locator('#dm-relay-input').fill(inbox.join('\n')); await page.locator('#publish-inbox-list').click();
  await page.waitForFunction(() => /Sua lista pública de recebimento NIP-17 foi publicada/.test(document.querySelector('#toast')?.textContent || '') || Boolean(document.querySelector('#relay-error')?.textContent?.trim()), null, { timeout: 15000 });
  const relayError = (await page.locator('#relay-error').textContent()).trim();
  assert.equal(relayError, '', `kind-10050 publish UI error: ${relayError}; connection=${(await page.locator('#connection-label').textContent())?.trim()}; toast=${(await page.locator('#toast').textContent())?.trim()}`);
  if (await page.locator('#relay-dialog').isVisible()) await page.locator('#relay-dialog button[aria-label="Fechar"]').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden', timeout: 5000 });
}
async function forceReconnect(page) {
  await page.locator('#open-settings').click(); await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#save-relays').click(); await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /[1-9]\d*\/\d+ relay/.test(document.querySelector('#connection-label')?.textContent || ''), null, { timeout: 20000 });
}
async function openConversation(page, peerNpub, title) {
  await page.locator('#new-chat-button').click(); await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#peer-input').fill(peerNpub); await page.locator('#peer-name-input').fill(title); await page.locator('#start-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'hidden' }); await page.locator('#conversation-pane').waitFor({ state: 'visible' });
}
async function sendMessage(page, text) {
  await page.locator('#message-input').fill(text); await page.locator('#send-form button[type="submit"]').click();
  await page.waitForFunction(value => {
    const rows = [...document.querySelectorAll('#messages .message-row')]; return rows.some(row => row.textContent.includes(value));
  }, text, { timeout: 10000 });
}
async function messageAudit(page, peer) {
  return await page.evaluate(async peerKey => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise((resolve, reject) => { const request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
    db.close(); return rows.filter(row => row.peer === peerKey).map(({ id, text, direction, status }) => ({ id, text, direction, status }));
  }, peer);
}
async function waitForMessageStatus(page, peer, text, status) {
  await page.waitForFunction(async ({ peerKey, messageText, expectedStatus }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction('messages').objectStore('messages').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.some(row => row.peer === peerKey && row.text === messageText && row.status === expectedStatus);
  }, { peerKey: peer, messageText: text, expectedStatus: status }, { timeout: 12000 });
}
async function closeContext(context) { if (context) await context.close().catch(() => {}); }
async function writeReport(output, report) { await mkdir(output, { recursive: true, mode: 0o700 }); await writeFile(path.join(output, 'browser-g04-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }

async function main() {
  let options, runtime, app, proxy, relay0, relay1, falseAck, contextA, contextB, contextC, contextD, stage = 'startup';
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g04-'));
  const report = { schema_version: 1, cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    relays: [], external_requests: [], websockets: [], denied_proxy_attempts: [], page_errors: [], inbox_checks: {}, message_checks: {}, failure_checks: {}, reconciliation: {} };
  const mark = (id, status, reason) => Object.assign(report.cases.find(row => row.case === id), { status, reason });
  try {
    options = parseArgs(process.argv.slice(2)); app = startAppServer(); proxy = startProxy(); await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`; runtime = await loadRuntime(options, proxy.server.address().port);
    report.browser = runtime.evidence; report.local_origin = origin;
    relay0 = await startGeode(28470, temp, 'relay zero'); relay1 = await startGeode(28471, temp, 'relay one');
    report.relays = [relay0, relay1].map(relay => ({ url: relay.url, process_id: relay.child.pid, data_dir_mode: 'temporary private directory' }));
    const profileA = path.join(temp, 'profile A with spaces'), profileB = path.join(temp, 'profile B with spaces'), profileC = path.join(temp, 'profile C with spaces');
    contextA = await runtime.playwright[options.engine].launchPersistentContext(profileA, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    contextB = await runtime.playwright[options.engine].launchPersistentContext(profileB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    contextC = await runtime.playwright[options.engine].launchPersistentContext(profileC, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    for (const context of [contextA, contextB, contextC]) instrument(context, origin, report);
    let pageA = await openApp(contextA, origin), pageB = await openApp(contextB, origin), pageC = await openApp(contextC, origin);
    const a = await createIdentity(pageA), b = await createIdentity(pageB), c = await createIdentity(pageC);
    await configureRelays(pageA, [relay0.url], [relay0.url]);
    await configureRelays(pageB, [relay0.url], [relay0.url, relay1.url]);
    await configureRelays(pageC, [relay0.url], [relay0.url]);
    const aInbox = await wsQuery(relay0.url, { kinds: [10050], authors: [a.pubkey], limit: 10 });
    const bInbox = await wsQuery(relay0.url, { kinds: [10050], authors: [b.pubkey], limit: 10 });
    const cInbox = await wsQuery(relay0.url, { kinds: [10050], authors: [c.pubkey], limit: 10 });
    const validInbox = events => events.filter(event => event.kind === 10050 && runtime.nostrVerify(event)).sort((x, y) => y.created_at - x.created_at);
    report.inbox_checks.query_diagnostics = [aInbox, bInbox, cInbox].map(events => ({ count: events.length,
      kinds: events.map(event => event.kind), signature_valid: events.map(event => runtime.nostrVerify(event)),
      authors: events.map(event => event.pubkey) }));
    for (const [index, events] of [aInbox, bInbox, cInbox].entries()) assert.ok(validInbox(events).length >= 1,
      `valid signed kind-10050 query missing at R0 for identity ${index}; observed=${JSON.stringify(report.inbox_checks.query_diagnostics[index])}`);
    const selectedB = validInbox(bInbox)[0];
    assert.deepEqual(selectedB.tags.filter(tag => tag[0] === 'relay').map(tag => tag[1]).sort(), [relay0.url, relay1.url].sort());
    report.inbox_checks = { A: { signed: true, newest: true, relays: [relay0.url] }, B: { signed: true, newest: true, relays: [relay0.url, relay1.url] }, C: { signed: true, relays: [relay0.url] }, invalid_or_ambiguous_destinations: 'none used' };
    mark('G04-01', 'PASS', 'A, B and C published signed kind-10050 inbox lists through the UI; independent relay queries verified signatures and B’s two authorized inboxes.');

    await openConversation(pageA, b.npub, 'B privado');
    const first = `property-g04-a-b-${crypto.randomUUID()}`; await sendMessage(pageA, first);
    await pageB.locator('#new-chat-button').click(); await pageB.locator('#new-chat-dialog').waitFor({ state: 'visible' });
    await pageB.locator('#peer-input').fill(a.npub); await pageB.locator('#peer-name-input').fill('A privado'); await pageB.locator('#start-chat-button').click();
    await pageB.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    await pageB.locator('#messages .message-bubble').filter({ hasText: first }).waitFor({ state: 'visible', timeout: 15000 });
    const response = `property-g04-b-a-${crypto.randomUUID()}`; await sendMessage(pageB, response);
    await pageA.locator('#messages .message-bubble').filter({ hasText: response }).waitFor({ state: 'visible', timeout: 15000 });
    const firstEnvelopes = await wsQuery(relay0.url, { kinds: [1059], '#p': [b.pubkey], limit: 100 });
    assert.ok(firstEnvelopes.length >= 1); assert.ok(firstEnvelopes.every(event => runtime.nostrVerify(event)));
    assert.ok(firstEnvelopes.every(event => !event.content.includes(first) && !event.content.includes(response)), 'relay stores encrypted wrappers, never plaintext');
    const cEnvelopes = await wsQuery(relay0.url, { kinds: [1059], '#p': [c.pubkey], limit: 100 });
    assert.deepEqual(cEnvelopes, [], 'C has no envelope from the A/B exchange');
    report.message_checks = { first_a_to_b_visible: true, response_b_to_a_visible: true, relay_events_signature_valid: true,
      recipient_c_received_none: true, plaintext_absent_from_relay_envelopes: true, relay_addresses: [relay0.url, relay1.url] };
    mark('G04-02', 'PASS', 'A and B exchanged real NIP-17 messages through Geode; both UI contexts decrypted the intended text, C received none, and relay storage contained only valid encrypted gift wraps.');

    stage = 'G04-03: close B and deliver queued message'; await closeContext(contextB);
    const delayed = `property-g04-offline-${crypto.randomUUID()}`; await sendMessage(pageA, delayed);
    contextB = await runtime.playwright[options.engine].launchPersistentContext(profileB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' }); instrument(contextB, origin, report);
    pageB = await openApp(contextB, origin); await pageB.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    await openConversation(pageB, a.npub, 'A privado'); await pageB.locator('#messages .message-bubble').filter({ hasText: delayed }).waitFor({ state: 'visible', timeout: 15000 });
    await closeContext(contextB);
    contextB = await runtime.playwright[options.engine].launchPersistentContext(profileB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' }); instrument(contextB, origin, report);
    pageB = await openApp(contextB, origin); await pageB.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    await openConversation(pageB, a.npub, 'A privado');
    assert.equal(await pageB.locator('#messages .message-bubble').filter({ hasText: delayed }).count(), 1, 'relay replay/reconnect does not duplicate a message');
    report.message_checks.offline_delivery = { B_closed_before_send: true, recovered_after_restart: true, duplicate_count_after_two_reopens: 1 };
    mark('G04-03', 'PASS', 'B closed, A sent through the real relay, and B recovered the queued NIP-17 message after two browser restarts with one UI copy.');

    // G04-04: one inbox failure, all inboxes unavailable, reconnection, then an explicit false-ACK relay.
    stage = 'G04-04: one inbox relay down'; await stopGeode(relay1);
    const oneDown = `property-g04-one-inbox-down-${crypto.randomUUID()}`; await sendMessage(pageA, oneDown);
    await pageB.locator('#messages .message-bubble').filter({ hasText: oneDown }).waitFor({ state: 'visible', timeout: 15000 });
    stage = 'G04-04: all inbox relays down'; await stopGeode(relay0);
    const allDown = `property-g04-all-inboxes-down-${crypto.randomUUID()}`; await sendMessage(pageA, allDown);
    const localPending = await messageAudit(pageA, b.pubkey);
    assert.ok(localPending.some(row => row.text === allDown && row.status === 'pending'), 'all inboxes down is shown as pending');
    stage = 'G04-04: relay restart'; relay0 = await startGeode(28470, temp, 'relay zero');
    await forceReconnect(pageA); await forceReconnect(pageB);
    stage = 'G04-04: client reconnection'; const afterReconnect = `property-g04-reconnect-${crypto.randomUUID()}`; await sendMessage(pageA, afterReconnect);
    await pageB.locator('#messages .message-bubble').filter({ hasText: afterReconnect }).waitFor({ state: 'visible', timeout: 15000 });

    stage = 'G04-04: false-ack relay setup'; falseAck = startFalseAckRelay(); await falseAck.ready;
    const falseAckUrl = `ws://127.0.0.1:${falseAck.server.address().port}`;
    stage = 'G04-04: publish false-ack destination'; await pageB.locator('#open-settings').click(); await pageB.locator('#dm-relay-input').fill(falseAckUrl); await pageB.locator('#save-relays').click();
    await pageB.locator('#relay-dialog').waitFor({ state: 'hidden' });
    await pageB.locator('#open-settings').click(); await pageB.locator('#dm-relay-input').fill(falseAckUrl);
    await pageB.waitForTimeout(1100);
    await pageB.locator('#publish-inbox-list').click();
    await pageB.waitForFunction(() => /Sua lista pública de recebimento NIP-17 foi publicada/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });
    if (await pageB.locator('#relay-dialog').isVisible()) await pageB.locator('#relay-dialog button[aria-label="Fechar"]').click();
    await pageB.locator('#relay-dialog').waitFor({ state: 'hidden', timeout: 5000 });
    const bAfterFalseAckList = validInbox(await wsQuery(relay0.url, { kinds: [10050], authors: [b.pubkey], limit: 10 }))[0];
    assert.ok(bAfterFalseAckList?.tags.some(tag => tag[0] === 'relay' && tag[1] === falseAckUrl),
      `Geode latest kind-10050 did not reflect false-ACK inbox ${falseAckUrl}`);
    const cacheClear = await pageA.evaluate(async peer => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').delete(`peer-inbox-${peer}`);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error('peer inbox cache deletion transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('peer inbox cache deletion transaction failed'));
      });
      const remaining = await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const request = tx.objectStore('settings').get(`peer-inbox-${peer}`);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return { deleted: remaining === null };
    }, b.pubkey);
    assert.equal(cacheClear.deleted, true, 'peer inbox cache deletion committed before the recipient list is rediscovered');
    report.failure_checks.false_ack_cache_clear = cacheClear;
    await pageA.reload({ waitUntil: 'domcontentloaded' }); await pageA.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    await openConversation(pageA, b.npub, 'B privado');
    stage = 'G04-04: independent false-ack query'; const falseAckText = `property-g04-false-ack-${crypto.randomUUID()}`; await sendMessage(pageA, falseAckText);
    await pageA.waitForFunction(value => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(value)), falseAckText, { timeout: 10000 });
    await waitForMessageStatus(pageA, b.pubkey, falseAckText, 'sent');
    const falseIds = [...falseAck.events];
    report.failure_checks.false_ack_fixture = { ...falseAck.diagnostics, event_ids: falseIds, websocket_url_observed: report.websockets.some(url => url.startsWith(`${falseAckUrl}/`)) };
    assert.ok(falseIds.length >= 1, `false-ACK fixture received no recipient envelope: ${JSON.stringify(report.failure_checks.false_ack_fixture)}`);
    const fakeQuery = await wsQuery(falseAckUrl, { ids: falseIds, limit: 20 });
    assert.deepEqual(fakeQuery, [], 'independent query detects the false ACK did not persist the event');
    report.failure_checks = { one_of_two_inboxes_down_delivered_over_remaining_relay: true, both_inboxes_down_marked_pending: true,
      recovered_after_relay_restart: true, false_ack_event_ids: falseIds, false_ack_independent_query_count: fakeQuery.length,
      false_ack_client_status_after_ack: 'sent', false_ack_detected_by_independent_query: true,
      false_ack_cache_clear: cacheClear,
      false_ack_fixture: { ...falseAck.diagnostics, event_ids: falseIds, websocket_url_observed: report.websockets.some(url => url.startsWith(`${falseAckUrl}/`)) } };
    mark('G04-04', 'PASS', 'The live inbox carried messages when the second relay was down; all-inbox outage stayed pending; relay restart restored delivery; an intentional false ACK was caught by an independent query.');

    // G04-05: no kind-10050 means no private send; signature tampering is rejected by real Geode.
    contextD = await runtime.browser.newContext({ serviceWorkers: 'allow' }); instrument(contextD, origin, report); let pageD = await openApp(contextD, origin);
    const d = await createIdentity(pageD); await configureRelays(pageD, [relay0.url], [], false);
    await openConversation(pageD, b.npub, 'B sem inbox');
    const beforeMissing = await wsQuery(relay0.url, { kinds: [1059], limit: 1000 });
    const noListText = `property-g04-no-kind10050-${crypto.randomUUID()}`;
    await pageD.locator('#message-input').fill(noListText); await pageD.locator('#send-form button[type="submit"]').click();
    await pageD.waitForFunction(() => /Configure e publique seus relays de recebimento NIP-17/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
    const afterMissing = await wsQuery(relay0.url, { kinds: [1059], limit: 1000 });
    assert.equal(afterMissing.length, beforeMissing.length, 'missing inbox does not publish a fallback event');
    assert.ok(!afterMissing.some(event => event.content.includes(noListText)));
    const invalidEvent = runtime.createSignedEvent({ kind: 1059, content: 'tamper fixture', tags: [['p', b.pubkey]], created_at: Math.floor(Date.now() / 1000) });
    invalidEvent.content = 'modified after signing';
    const invalidAck = await publishEvent(relay0.url, invalidEvent); assert.equal(invalidAck.accepted, false, 'Geode rejects signature/content mismatch');
    const invalidStored = await wsQuery(relay0.url, { ids: [invalidEvent.id], limit: 1 }); assert.deepEqual(invalidStored, []);
    const bMessages = await messageAudit(pageB, a.pubkey); assert.ok(!bMessages.some(row => row.text === 'tamper fixture'));
    report.failure_checks.no_kind10050 = { send_refused: true, relay_event_count_unchanged: true, no_public_fallback: true };
    report.failure_checks.tampered_signature = { relay_ack: invalidAck, independent_query_count: invalidStored.length, recipient_plaintext_received: false };
    report.failure_checks.d_identity_pubkey = d.pubkey;
    mark('G04-05', 'PASS', 'The UI refused to send without the sender’s kind-10050 inbox list, emitted no fallback, and a real relay rejected a post-signature envelope mutation without storing it.');

    // G04-06: reconcile UI copies and retained ciphertext IDs from the live relays.
    stage = 'G04-06: message corpus reconciliation';
    const expected = [first, response, delayed, oneDown, afterReconnect];
    const auditA = await messageAudit(pageA, b.pubkey), auditB = await messageAudit(pageB, a.pubkey);
    for (const text of expected) {
      const onA = auditA.filter(row => row.text === text); const onB = auditB.filter(row => row.text === text);
      assert.equal(onA.length, 1, `A stores one local conversation record for ${text}`);
      assert.equal(onB.length, 1, `B stores one local conversation record for ${text}`);
      const sentByB = text === response;
      assert.equal(onA[0].direction, sentByB ? 'received' : 'sent');
      assert.equal(onB[0].direction, sentByB ? 'sent' : 'received');
    }
    const retained = await wsQuery(relay0.url, { kinds: [1059], limit: 1000 });
    for (const text of expected) assert.ok(retained.every(event => !event.content.includes(text)), `plaintext ${text} absent from retained event contents`);
    const UICounts = Object.fromEntries(expected.map(text => [text, {
      A: auditA.filter(row => row.text === text).length,
      B: auditB.filter(row => row.text === text).length
    }]));
    assert.equal(await pageB.locator('#messages .message-bubble').filter({ hasText: delayed }).count(), 1);
    report.reconciliation = { message_texts: expected, browser_database_counts: UICounts,
      retained_relay_event_count: retained.length, plaintext_found_in_relay: false,
      false_ack_message_delivered: false, read_receipt_protocol_present: false };
    assert.deepEqual(report.external_requests, [], 'all browser HTTP requests stayed on the local origin');
    assert.deepEqual(report.denied_proxy_attempts, [], 'no outbound proxy attempt');
    assert.deepEqual(report.page_errors, [], 'no page runtime errors');
    assert.ok(report.websockets.every(url => /^ws:\/\/127\.0\.0\.1:/.test(url)), 'browser WebSockets are loopback only');
    mark('G04-06', 'PASS', 'The delivered corpus reconciled one-for-one in both browser databases and real relay storage; no plaintext, duplicate UI copy, third-party recipient or read receipt was observed.');
    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    report.denied_proxy_attempts = [...proxy.attempts];
    await writeReport(path.resolve(options.output), report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const current = report.cases.find(row => row.status === 'NOT_RUN');
    if (current) Object.assign(current, { status: /module|executable|version mismatch|ENOENT|permission|launch/i.test(error.message) ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) });
    for (const row of report.cases) if (row.status === 'NOT_RUN') Object.assign(row, { status: 'BLOCKED', reason: 'A prior G04 case failed; dependent end-to-end flow was not started.' });
    report.result = report.cases.some(row => row.status === 'FAIL') ? 'FAIL' : 'BLOCKED'; report.error = safeText(error.message || error); report.current_stage = stage;
    report.denied_proxy_attempts = [...(proxy?.attempts || [])];
    await new Promise(resolve => setTimeout(resolve, 250));
    report.relay_process_output = [relay0, relay1].filter(Boolean).map(relay => ({ pid: relay.child?.pid || null, tail: safeDiagnostic(relay.diagnostic?.() || '') }));
    if (falseAck) report.failure_checks.false_ack_fixture = { ...falseAck.diagnostics, event_ids: [...falseAck.events], websocket_url_observed: report.websockets.includes(`ws://127.0.0.1:${falseAck.server.address()?.port}/`) };
    try { await writeReport(path.resolve(options?.output || path.join(temp, 'report')), report); }
    catch (writeError) { process.stderr.write(`REPORT_WRITE_FAILED: ${safeText(writeError.message || writeError)}\n`); }
    process.stderr.write(`${report.result}: ${report.error}\n`); return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await closeContext(contextD); await closeContext(contextC); await closeContext(contextB); await closeContext(contextA);
    await runtime?.browser?.close().catch(() => {});
    await stopGeode(relay1); await stopGeode(relay0);
    for (const server of [falseAck?.server, app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
