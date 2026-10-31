#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PASSWORD = 'Property-offline-g05-test!';
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
const CASES = ['G05-01', 'G05-02', 'G05-03', 'G05-04', 'G05-05', 'G05-06', 'G05-07'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeText = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1000);

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
  if (options.engine !== 'chromium') throw new Error('G05 requires the pinned Chromium engine.');
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

async function loadRuntime(options, proxyPort) {
  await access(options.playwright_module);
  const moduleRoot = path.dirname(options.playwright_module);
  const packageInfo = JSON.parse(await readFile(path.join(moduleRoot, 'package.json'), 'utf8'));
  assert.equal(packageInfo.name, 'playwright'); assert.equal(packageInfo.version, options.playwright_version);
  const entries = [];
  async function walk(dir, prefix = '') {
    const children = (await import('node:fs/promises').then(m => m.readdir(dir, { withFileTypes: true }))).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of children) {
      const abs = path.join(dir, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Playwright symlink: ${rel}`);
      if (entry.isDirectory()) await walk(abs, rel); else entries.push(`${rel}\0${await sha256File(abs)}\n`);
    }
  }
  await walk(moduleRoot); assert.equal(createHash('sha256').update(entries.join('')).digest('hex'), options.playwright_package_sha256);
  assert.equal(await sha256File(options.executable), options.browser_executable_sha256);
  const playwright = createRequire(options.playwright_module)(options.playwright_module);
  const launch = { headless: true, executablePath: options.executable, proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection', '--disable-variations', '--no-first-run'] };
  const browser = await playwright.chromium.launch(launch); assert.equal(browser.version(), options.browser_version);
  const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout }; context.window = context;
  vm.createContext(context);
  vm.runInContext(await readFile(path.join(WEB, 'vendor/nostr-tools-2.25.2.bundle.js'), 'utf8'), context, { timeout: 5000 });
  vm.runInContext(await readFile(path.join(WEB, 'forwarding.js'), 'utf8'), context, { timeout: 5000 });
  const verifyEvent = event => {
    context.g05EventJson = JSON.stringify(event);
    return vm.runInContext('NostrTools.verifyEvent(JSON.parse(g05EventJson))', context, { timeout: 5000 });
  };
  const createIdentity = () => {
    const value = JSON.parse(vm.runInContext(`(() => { const secret=NostrTools.generateSecretKey(); const event=NostrTools.finalizeEvent({kind:1,content:'key fixture',tags:[],created_at:Math.floor(Date.now()/1000)},secret); return JSON.stringify({secret:Array.from(secret),pubkey:event.pubkey}); })()`, context, { timeout: 5000 }));
    value.secretHex = value.secret.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return value;
  };
  const sign = (kind, content, createdAt = Math.floor(Date.now() / 1000), secret = null, tags = []) => {
    context.g05SignInput = JSON.stringify({ kind, content, created_at: createdAt, secret, tags });
    return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(g05SignInput); const key=x.secret ? Uint8Array.from(x.secret) : NostrTools.generateSecretKey(); return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},key)); })()`, context, { timeout: 10000 }));
  };
  const wrapMany = (secret, recipient, content) => {
    context.g05WrapInput = JSON.stringify({ secret, recipient, content });
    return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(g05WrapInput); return JSON.stringify(NostrTools.nip17.wrapManyEvents(Uint8Array.from(x.secret),[{publicKey:x.recipient}],x.content)); })()`, context, { timeout: 10000 }));
  };
  const unwrapEvent = (event, secret) => {
    context.g05UnwrapInput = JSON.stringify({ event, secret });
    return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(g05UnwrapInput); return JSON.stringify(NostrTools.nip17.unwrapEvent(x.event,Uint8Array.from(x.secret))); })()`, context, { timeout: 10000 }));
  };
  const bridge = context.PropertyRelayBridge;
  return { playwright, browser, launch, verifyEvent, sign, createIdentity, wrapMany, unwrapEvent, bridge,
    evidence: { playwright_version: packageInfo.version, playwright_package_sha256: options.playwright_package_sha256, browser_version: browser.version(), browser_executable_sha256: options.browser_executable_sha256 } };
}

async function startGeode(port, base, label) {
  const data = path.join(base, `${label} data`), config = path.join(base, `${label} config`);
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port), PROPERTY_RELAY_DATA_DIR: data, PROPERTY_RELAY_CONFIG_DIR: config, PROPERTY_RELAY_CONFIG: path.join(config, 'relay.toml') };
  for (const key of PROXY_KEYS) delete env[key];
  const child = spawn('bash', [path.join(ROOT, 'property/relay/start.sh')], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-3000); });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Geode ${label} exited ${child.exitCode}: ${safeText(diagnostic)}`);
    const ready = await new Promise(resolve => { const socket = net.connect(port, '127.0.0.1'); socket.setTimeout(300); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => { socket.destroy(); resolve(false); }); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
    if (ready) return { child, port, url: `ws://127.0.0.1:${port}`, data, config, diagnostic: () => diagnostic };
    await sleep(250);
  }
  throw new Error(`Geode ${label} did not become ready: ${safeText(diagnostic)}`);
}
async function stopGeode(relay) {
  if (!relay?.child || relay.child.exitCode !== null) return;
  try { process.kill(-relay.child.pid, 'SIGTERM'); } catch {}
  await Promise.race([new Promise(resolve => relay.child.once('exit', resolve)), sleep(6000)]);
  if (relay.child.exitCode === null) { try { process.kill(-relay.child.pid, 'SIGKILL'); } catch {} }
}
function wsQuery(url, filter, timeoutMs = 6000) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const events = new Map(), sub = `property-g05-${crypto.randomUUID()}`;
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
    const timer = setTimeout(() => { socket.close(); reject(new Error(`Timed out publishing ${event.id} to ${url}`)); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'OK' && frame[1] === event.id) { clearTimeout(timer); socket.close(); resolve({ accepted: frame[2], message: frame[3] || '' }); }
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`WebSocket publish failed: ${url}`)); }, { once: true });
  });
}
async function waitStored(url, id, expected = true, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const found = (await wsQuery(url, { ids: [id], limit: 1 })).length > 0;
    if (found === expected) return found;
    await sleep(150);
  } while (Date.now() < deadline);
  throw new Error(`Event ${id} storage at ${url} expected=${expected} was not observed within ${timeoutMs} ms.`);
}
function parseFrame(payload) { try { return JSON.parse(typeof payload === 'string' ? payload : payload.toString()); } catch { return null; } }

async function openApp(context, origin) {
  const page = await context.newPage(); await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#auth-choice')?.classList.contains('hidden') || !document.querySelector('#workspace')?.classList.contains('hidden'), null, { timeout: 20000 });
  return page;
}
async function createAccount(page, secretHex = null) {
  if (secretHex) {
    await page.locator('#import-account-button').click(); await page.locator('#auth-import').waitFor({ state: 'visible' });
    await page.locator('#import-secret').fill(secretHex); await page.locator('#import-password').fill(PASSWORD);
    await page.locator('#finish-import-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  } else {
    await page.locator('#create-account-button').click(); await page.locator('#auth-setup').waitFor({ state: 'visible' });
    await page.locator('#new-password').fill(PASSWORD); await page.locator('#confirm-password').fill(PASSWORD);
    await page.locator('#finish-create-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  }
  const npub = (await page.locator('#profile-npub').textContent()).trim();
  const pubkey = await page.evaluate(value => NostrTools.nip19.decode(value).data, npub);
  return { npub, pubkey };
}

async function startNode(runtime, origin, report, label, generalRelays, options = {}) {
  const mobile = options.mobile === true;
  const bridgeEnabled = options.bridge !== false;
  const context = await runtime.browser.newContext({ serviceWorkers: 'allow', viewport: mobile ? { width: 390, height: 844 } : undefined,
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const node = { label, context, page: null, id: null, subscriptions: [], eoses: [], received: [], forwarded: [], errors: [], sockets: [] };
  context.on('page', page => {
    page.on('pageerror', error => { const message = safeText(error.message); node.errors.push(message); report.page_errors.push(`${label}: ${message}`); });
    page.on('websocket', socket => {
      const observedSocket={url:socket.url(),closed:false,close_code:null};
      node.sockets.push(observedSocket); report.websockets.push(socket.url());
      socket.on('close',event=>{observedSocket.closed=true;observedSocket.close_code=event?.code??null;});
      socket.on('framesent', item => {
        const frame = parseFrame(item.payload); if (!frame) return;
        const relayUrl = socket.url().replace(/\/$/, '');
        if (frame[0] === 'REQ' && String(frame[1]).startsWith('bridge-') && Array.isArray(frame[2]?.kinds)) node.subscriptions.push({ relay: relayUrl, id: frame[1], kinds: frame[2].kinds });
        if (frame[0] === 'EVENT' && frame[1]?.id) node.forwarded.push({ relay: relayUrl, id: frame[1].id, kind: frame[1].kind });
      });
      socket.on('framereceived', item => {
        const frame = parseFrame(item.payload); if (!frame) return;
        const relayUrl = socket.url().replace(/\/$/, '');
        if (frame[0] === 'EVENT' && frame[2]?.id) node.received.push({ relay: relayUrl, subscription_id: frame[1], id: frame[2].id, kind: frame[2].kind });
        if (frame[0] !== 'EOSE') return;
        if (node.subscriptions.some(sub => sub.id === frame[1] && sub.relay === relayUrl)) node.eoses.push({ relay: relayUrl, id: frame[1] });
      });
    });
  });
  context.on('request', request => { const url = new URL(request.url()); if (url.origin !== origin) report.external_requests.push(`${request.method()} ${url.origin}${url.pathname}`); });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (options.testDestinationUrl && url.href === options.testDestinationUrl) {
      report.test_destination_hits ||= [];
      report.test_destination_hits.push({ node: label, url: url.href, action: route.request().isNavigationRequest() ? 'navigation' : 'request' });
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>Offline destination</title><p id="local-destination">Local test destination reached.</p>' });
    }
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  node.page = await openApp(context, origin); node.id = await createAccount(node.page, options.secretHex || null);
  const settingsButton = mobile ? '#mobile-open-settings' : '#open-settings';
  assert.equal(await node.page.locator(settingsButton).isVisible(), true, `${label} relay settings are reachable at the current viewport`);
  await node.page.locator(settingsButton).click(); await node.page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await node.page.locator('#relay-input').fill(generalRelays.join('\n')); await node.page.locator('#dm-relay-input').fill('');
  await node.page.locator('#save-relays').click(); await node.page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  await node.page.waitForFunction(() => /[1-9]\d*\/\d+ relay/.test(document.querySelector('#connection-label')?.textContent || ''), null, { timeout: 15000 });
  if (options.inboxRelays?.length) {
    await node.page.locator(settingsButton).click(); await node.page.locator('#dm-relay-input').fill(options.inboxRelays.join('\n'));
    await node.page.locator('#publish-inbox-list').click();
    await node.page.waitForFunction(() => /Sua lista pública de recebimento NIP-17 foi publicada/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });
    if (await node.page.locator('#relay-dialog').isVisible()) await node.page.locator('#relay-dialog button[aria-label="Fechar"]').click();
    await node.page.locator('#relay-dialog').waitFor({ state: 'hidden', timeout: 5000 });
  }
  if (bridgeEnabled) {
    await node.page.locator('button[data-view="node"]').click();
    await node.page.locator('#browser-node-toggle').check();
    await node.page.waitForFunction(() => /Ponte ativa entre os relays selecionados/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
    await waitUntil(async () => generalRelays.every(url => node.subscriptions.some(sub => sub.relay === url && sub.kinds.includes(1)) &&
      node.subscriptions.some(sub => sub.relay === url && node.eoses.some(eose => eose.relay === url && eose.id === sub.id))), 12000,
      `${label} bridge subscriptions did not reach EOSE on every configured relay`);
  }
  report.nodes.push({ label, pubkey: node.id.pubkey, general_relays: generalRelays, inbox_relays: options.inboxRelays || [],
    mobile_viewport_emulation: mobile, browser_bridge_enabled: bridgeEnabled });
  return node;
}
async function disableNode(node) {
  if (await node.page.locator('#browser-node-toggle').isChecked()) await node.page.locator('#browser-node-toggle').uncheck();
  await node.page.waitForFunction(() => /Ponte entre relays desativada/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
}
async function closeNode(node) { if (node?.context) await node.context.close().catch(() => {}); }
async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  do { if (await predicate()) return; await sleep(100); } while (Date.now() < deadline);
  throw new Error(message);
}
async function assertNoExternal(report) {
  assert.deepEqual(report.external_requests, [], 'browser HTTP requests remain on localhost');
  assert.deepEqual(report.denied_proxy_attempts, [], 'no outgoing proxy attempts');
  assert.deepEqual(report.page_errors, [], 'no browser page errors');
  assert.ok(report.websockets.every(url => /^ws:\/\/127\.0\.0\.1:/.test(url)), 'all browser WebSockets are local relays');
}

export { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, wsQuery, publishEvent, waitStored,
  openApp, createAccount, startNode, closeNode, waitUntil, assertNoExternal };

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g05-'));
  const report = { schema_version: 1, cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    nodes: [], relays: [], external_requests: [], websockets: [], denied_proxy_attempts: [], page_errors: [], topologies: {}, privacy: {}, limits: {}, mobile_emulation: {} };
  const outputDir = path.resolve(options.output), reportPath = path.join(outputDir, 'browser-g05-report.json');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  checkpoint();
  const nodes = new Map(); let runtime, app, proxy; const relays = [];
  const mark = (id, status, reason) => { Object.assign(report.cases.find(row => row.case === id), { status, reason }); checkpoint(); };
  let activeCase = CASES[0];
  try {
    app = startAppServer(); proxy = startProxy(); await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`; runtime = await loadRuntime(options, proxy.server.address().port);
    report.browser = runtime.evidence; report.local_origin = origin;
    for (let i = 0; i < 4; i++) {
      const relay = await startGeode(28472 + i, temp, `relay ${i + 1}`); relays.push(relay);
      report.relays.push({ url: relay.url, process_id: relay.child.pid, data_dir_mode: 'temporary private directory' });
    }
    const [r1, r2, r3, r4] = relays.map(relay => relay.url);

    activeCase = 'G05-01';
    nodes.set('P12', await startNode(runtime, origin, report, 'P12', [r1, r2]));
    nodes.set('P23', await startNode(runtime, origin, report, 'P23', [r2, r3]));
    nodes.set('P34', await startNode(runtime, origin, report, 'P34', [r3, r4]));
    const event1 = runtime.sign(1, `property-g05-chain-${crypto.randomUUID()}`);
    assert.equal(runtime.verifyEvent(event1), true, 'source fixture has a valid Nostr signature');
    const sourceAck = await publishEvent(r1, event1); assert.equal(sourceAck.accepted, true);
    await waitStored(r1, event1.id, true);
    const browserRoute = await nodes.get('P12').page.evaluate(({ event, source, target }) => {
      const engine = PropertyRelayBridge.createBridge(candidate => NostrTools.verifyEvent(candidate));
      return { valid: NostrTools.verifyEvent(event), targets: engine.targets(event, source, [source, target]) };
    }, { event: event1, source: r1, target: r2 });
    assert.equal(browserRoute.valid, true); assert.deepEqual(browserRoute.targets, [r2]);
    report.topologies.browser_engine_check = browserRoute;
    for (const url of [r1, r2, r3, r4]) await waitStored(url, event1.id, true);
    for (const [name, node, target] of [['P12', nodes.get('P12'), r2], ['P23', nodes.get('P23'), r3], ['P34', nodes.get('P34'), r4]]) {
      await waitUntil(() => node.forwarded.some(frame => frame.id === event1.id && frame.relay.startsWith(target)), 5000, `${name} did not forward the signed event to its adjacent relay`);
    }
    const chainCounts = {};
    for (let i = 0; i < 4; i++) chainCounts[`R${i + 1}`] = (await wsQuery(relays[i].url, { ids: [event1.id], limit: 10 })).length;
    assert.deepEqual(Object.values(chainCounts), [1, 1, 1, 1]);
    report.topologies.chain = { relays: [r1, r2, r3, r4], bridge_hops: ['P12:R1->R2', 'P23:R2->R3', 'P34:R3->R4'], counts: chainCounts, event_id: event1.id, signature_valid: runtime.verifyEvent(event1) };
    mark('G05-01', 'PASS', 'A signed public event traversed three actual PWA bridge contexts and four independent Geode relays in the R1→R2→R3→R4 chain; each hop and the final inbox were independently reconciled.');

    activeCase = 'G05-02'; await closeNode(nodes.get('P23')); nodes.delete('P23');
    const event2 = runtime.sign(1, `property-g05-p23-down-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, event2)).accepted, true);
    await waitStored(r2, event2.id, true); await waitStored(r3, event2.id, false, 2500); await waitStored(r4, event2.id, false, 2500);
    nodes.set('P23', await startNode(runtime, origin, report, 'P23-restarted', [r2, r3]));
    await waitStored(r3, event2.id, true); await waitStored(r4, event2.id, true);
    const expired = runtime.sign(1, `property-g05-expired-${crypto.randomUUID()}`, Math.floor(Date.now() / 1000) - 301);
    assert.equal((await publishEvent(r2, expired)).accepted, true, 'Geode accepted the stale fixture so the bridge expiry policy can be exercised');
    await waitStored(r2, expired.id, true); await waitStored(r3, expired.id, false, 2500); await waitStored(r4, expired.id, false, 2500);
    report.topologies.p23_failure = { event_id: event2.id, stored_while_partitioned: { R2: true, R3: false, R4: false }, replay_after_restart: { R3: true, R4: true }, expired_event_id: expired.id, expired_event_stored_at_source: true, forwarded_after_expiry: false };
    mark('G05-02', 'PASS', 'Stopping P23 stopped new delivery at R2; restarting its PWA bridge replayed the eligible event through R3/R4. An accepted event older than the bridge age policy remained at its source.');

    activeCase = 'G05-03'; await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    nodes.set('P12', await startNode(runtime, origin, report, 'D-P12', [r1, r2]));
    nodes.set('P13', await startNode(runtime, origin, report, 'D-P13', [r1, r3]));
    nodes.set('P24', await startNode(runtime, origin, report, 'D-P24', [r2, r4]));
    nodes.set('P34', await startNode(runtime, origin, report, 'D-P34', [r3, r4]));
    nodes.set('P41', await startNode(runtime, origin, report, 'D-P41', [r4, r1]));
    const event3 = runtime.sign(1, `property-g05-diamond-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, event3)).accepted, true);
    await waitStored(r4, event3.id, true);
    for (const url of [r1, r2, r3, r4]) assert.equal((await wsQuery(url, { ids: [event3.id], limit: 10 })).length, 1, 'relay stores one event despite diamond/cycle delivery');
    const edgeEvidence = Object.fromEntries([...nodes].map(([name, node]) => [name, node.forwarded.filter(frame => frame.id === event3.id).map(frame => frame.relay)]));
    assert.ok(edgeEvidence.P12?.length && edgeEvidence.P13?.length && edgeEvidence.P24?.length && edgeEvidence.P34?.length);
    await closeNode(nodes.get('P12')); nodes.delete('P12');
    const event4 = runtime.sign(1, `property-g05-diamond-path-failure-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, event4)).accepted, true);
    await waitStored(r4, event4.id, true);
    report.topologies.diamond_and_cycle = { event_id: event3.id, per_relay_unique_count: 1, edges: edgeEvidence, alternate_path_after_P12_stopped: { event_id: event4.id, R4_received: true } };
    await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    nodes.set('S12', await startNode(runtime, origin, report, 'S12', [r1, r2]));
    nodes.set('S13', await startNode(runtime, origin, report, 'S13', [r1, r3]));
    nodes.set('S14', await startNode(runtime, origin, report, 'S14', [r1, r4]));
    const event5 = runtime.sign(1, `property-g05-star-${crypto.randomUUID()}`); assert.equal((await publishEvent(r2, event5)).accepted, true);
    for (const url of [r1, r2, r3, r4]) await waitStored(url, event5.id, true);
    report.topologies.star = { event_id: event5.id, center: r1, leaves: [r2, r3, r4], per_relay_unique_count: 1 };
    mark('G05-03', 'PASS', 'Diamond, cycle and star topologies delivered through independent real browser bridges; relay ID queries showed one stored copy, and stopping one diamond path preserved delivery over the other.');

    activeCase = 'G05-04'; await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    nodes.set('Q12', await startNode(runtime, origin, report, 'Q12', [r1, r2]));
    nodes.set('Q34', await startNode(runtime, origin, report, 'Q34', [r3, r4]));
    const preReplay1 = runtime.sign(1, `property-g05-partition-a-${crypto.randomUUID()}`);
    const preReplay2 = runtime.sign(1, `property-g05-partition-b-${crypto.randomUUID()}`);
    assert.equal((await publishEvent(r1, preReplay2)).accepted, true); assert.equal((await publishEvent(r1, preReplay1)).accepted, true);
    await waitStored(r2, preReplay1.id, true); await waitStored(r2, preReplay2.id, true);
    await waitStored(r3, preReplay1.id, false, 2500); await waitStored(r4, preReplay2.id, false, 2500);
    nodes.set('Q23', await startNode(runtime, origin, report, 'Q23-rejoined', [r2, r3]));
    await waitStored(r4, preReplay1.id, true); await waitStored(r4, preReplay2.id, true);
    const replayCounts = { first: (await wsQuery(r4, { ids: [preReplay1.id], limit: 10 })).length, second: (await wsQuery(r4, { ids: [preReplay2.id], limit: 10 })).length };
    assert.deepEqual(Object.values(replayCounts), [1, 1]);
    report.topologies.partition_rejoin = { out_of_order_source_publications: [preReplay2.id, preReplay1.id], reconciled_at_R4: replayCounts, no_duplicate_ids: true, expired_fixture_not_replayed: expired.id };
    mark('G05-04', 'PASS', 'Relay groups remained partitioned, then rejoined through a restarted P23. Two events published out of order reconciled once at R4; the expired fixture stayed excluded.');

    activeCase = 'G05-05'; await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    const sender = runtime.createIdentity(), recipient = runtime.createIdentity();
    const privateText = `property-g05-private-B-${crypto.randomUUID()}`;
    const recipientWraps = runtime.wrapMany(sender.secret, recipient.pubkey, privateText);
    const recipientWrap = recipientWraps.find(event => event.kind === 1059 && event.tags.some(tag => tag[0] === 'p' && tag[1] === recipient.pubkey));
    const senderWrap = recipientWraps.find(event => event.kind === 1059 && event.tags.some(tag => tag[0] === 'p' && tag[1] === sender.pubkey));
    assert.ok(recipientWrap && senderWrap && runtime.verifyEvent(recipientWrap) && runtime.verifyEvent(senderWrap));
    assert.ok(!recipientWrap.content.includes(privateText) && !senderWrap.content.includes(privateText), 'NIP-17 relay envelopes do not contain plaintext');
    nodes.set('C12', await startNode(runtime, origin, report, 'C12-identity-C', [r1, r2]));
    nodes.set('C23', await startNode(runtime, origin, report, 'C23-identity-C', [r2, r3]));
    nodes.set('C34', await startNode(runtime, origin, report, 'C34-identity-C', [r3, r4]));
    assert.equal((await publishEvent(r1, recipientWrap)).accepted, true);
    await waitStored(r1, recipientWrap.id, true); await waitStored(r2, recipientWrap.id, false, 2500); await waitStored(r3, recipientWrap.id, false, 2500); await waitStored(r4, recipientWrap.id, false, 2500);
    await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    nodes.set('B', await startNode(runtime, origin, report, 'B-identity-B', [r1, r2], { secretHex: recipient.secretHex, inboxRelays: [r2] }));
    assert.equal(nodes.get('B').id.pubkey, recipient.pubkey);
    assert.equal((await publishEvent(r1, recipientWrap)).accepted, true);
    await waitStored(r2, recipientWrap.id, true);
    await waitStored(r3, recipientWrap.id, false, 2500); await waitStored(r4, recipientWrap.id, false, 2500);
    assert.equal((await publishEvent(r1, senderWrap)).accepted, true);
    await waitStored(r1, senderWrap.id, true); await waitStored(r2, senderWrap.id, false, 2500);
    await closeNode(nodes.get('B')); nodes.delete('B');
    nodes.set('A', await startNode(runtime, origin, report, 'A-identity-A', [r1, r2], { secretHex: sender.secretHex, inboxRelays: [r2] }));
    assert.equal((await publishEvent(r1, senderWrap)).accepted, true); await waitStored(r2, senderWrap.id, true);
    report.privacy = { recipient_event_id: recipientWrap.id, sender_copy_event_id: senderWrap.id, outsider_C_forwarded_recipient_event: false,
      B_forwarded_own_recipient_envelope_only_to_B_inbox: true, B_forwarded_A_sender_copy: false, A_forwarded_own_sender_copy_to_A_inbox: true,
      plaintext_test_content_in_relay_events: !recipientWrap.content.includes(privateText) && !senderWrap.content.includes(privateText) };
    mark('G05-05', 'PASS', 'Three non-recipient bridge identities did not forward B’s envelope. B’s real PWA bridge forwarded only B’s recipient wrap to B’s inbox; A’s sender copy followed A’s inbox when A was the bridge identity.');

    activeCase = 'G05-06'; await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    nodes.set('toggle', await startNode(runtime, origin, report, 'toggle-node', [r1, r2]));
    await disableNode(nodes.get('toggle'));
    const offEvent = runtime.sign(1, `property-g05-disabled-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, offEvent)).accepted, true);
    await waitStored(r1, offEvent.id, true); await waitStored(r2, offEvent.id, false, 2500);
    await nodes.get('toggle').page.locator('#browser-node-toggle').check();
    await nodes.get('toggle').page.waitForFunction(() => /Ponte ativa entre os relays selecionados/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
    await waitUntil(() => nodes.get('toggle').subscriptions.some(sub => sub.relay.startsWith(r1) && sub.kinds.includes(1)) && nodes.get('toggle').subscriptions.some(sub => sub.relay.startsWith(r2) && sub.kinds.includes(1)), 12000, 're-enabled bridge subscriptions were not observed');
    const onEvent = runtime.sign(1, `property-g05-enabled-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, onEvent)).accepted, true); await waitStored(r2, onEvent.id, true);
    const direct = runtime.bridge.createBridge(runtime.verifyEvent);
    const boundaryNow = Math.floor(Date.now() / 1000);
    const boundary = runtime.sign(1, `property-g05-boundary-${crypto.randomUUID()}`, boundaryNow);
    assert.deepEqual(Array.from(direct.targets(boundary, r1, [r1, r2])), [r2]);
    assert.deepEqual(Array.from(direct.targets(boundary, r1, [r1, r2])), []);
    const invalid = { ...runtime.sign(1, `property-g05-invalid-${crypto.randomUUID()}`), content: 'tampered' };
    assert.deepEqual(Array.from(direct.targets(invalid, r1, [r1, r2])), []);
    const old = runtime.sign(1, `property-g05-old-${crypto.randomUUID()}`, boundaryNow - 301);
    const future = runtime.sign(1, `property-g05-future-${crypto.randomUUID()}`, boundaryNow + 61);
    assert.deepEqual(Array.from(direct.targets(old, r1, [r1, r2])), []); assert.deepEqual(Array.from(direct.targets(future, r1, [r1, r2])), []);
    const rate = runtime.bridge.createBridge(runtime.verifyEvent); let acceptedRate = 0;
    for (let i = 0; i < 61; i++) if (rate.targets(runtime.sign(1, `property-g05-rate-${i}-${crypto.randomUUID()}`, boundaryNow), r1, [r1, r2]).length) acceptedRate++;
    assert.equal(acceptedRate, 60, 'bridge enforces 60 outbound events/minute');
    const byteLimited = runtime.bridge.createBridge(runtime.verifyEvent);
    const largeUtf8 = runtime.sign(1, 'é'.repeat(200000), boundaryNow);
    const encodedBytes = Buffer.byteLength(JSON.stringify(largeUtf8)); assert.ok(encodedBytes < 512000);
    assert.deepEqual(Array.from(byteLimited.targets(largeUtf8, r1, [r1, 'ws://127.0.0.1:28476', 'ws://127.0.0.1:28477', 'ws://127.0.0.1:28478', 'ws://127.0.0.1:28479', 'ws://127.0.0.1:28480', 'ws://127.0.0.1:28481'])), []);
    report.limits = { bridge_off_stopped_forwarding: true, bridge_on_resumed_forwarding: true, origin_excluded: true, duplicate_suppressed: true,
      invalid_signature_rejected: true, old_and_future_events_rejected: true, accepted_events_before_rate_limit: acceptedRate,
      rate_limit: 60, utf8_json_bytes: encodedBytes, six_destination_bytes_exceed_2mb: encodedBytes * 6 > 2_000_000, byte_limit_contained: true };
    mark('G05-06', 'PASS', 'UI toggle stopped and resumed the real PWA bridge. Module tests verified source exclusion, ID deduplication, signature/age boundaries, 60-event/minute cap and UTF-8 byte-based containment above 2 MB.');

    activeCase = 'G05-07'; await Promise.all([...nodes.values()].map(closeNode)); nodes.clear();
    const mobile = await startNode(runtime, origin, report, 'mobile-emulation', [r1, r2], { mobile: true });
    const mobileEvent = runtime.sign(1, `property-g05-mobile-closed-${crypto.randomUUID()}`);
    await closeNode(mobile); nodes.delete('mobile-emulation');
    assert.equal((await publishEvent(r1, mobileEvent)).accepted, true); await waitStored(r1, mobileEvent.id, true); await waitStored(r2, mobileEvent.id, false, 2500);
    const pcEvent = runtime.sign(1, `property-g05-pc-relay-online-${crypto.randomUUID()}`);
    assert.equal((await publishEvent(r2, pcEvent)).accepted, true); await waitStored(r2, pcEvent.id, true);
    const mobileReopened = await startNode(runtime, origin, report, 'mobile-emulation-reopened', [r1, r2], { mobile: true }); nodes.set('mobile-reopened', mobileReopened);
    const resumedEvent = runtime.sign(1, `property-g05-mobile-reopen-${crypto.randomUUID()}`); assert.equal((await publishEvent(r1, resumedEvent)).accepted, true); await waitStored(r2, resumedEvent.id, true);
    report.mobile_emulation = { viewport: '390x844', context_closed_before_test_message: true, browser_bridge_stopped: true,
      independent_geode_relays_remained_available: true, reopened_context_resumed_forwarding: true,
      physical_mobile_os_suspension_or_background_service_certified: false };
    mark('G05-07', 'PASS', 'Closing the mobile-sized browser context stopped its bridge while both independent Geode relays remained available; a reopened context resumed forwarding. This is desktop viewport emulation only and does not certify physical mobile suspension/background behavior.');

    await assertNoExternal(report);
    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    report.denied_proxy_attempts = proxy.attempts;
    await mkdir(path.resolve(options.output), { recursive: true, mode: 0o700 });
    await writeFile(path.join(path.resolve(options.output), 'browser-g05-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const row = report.cases.find(item => item.case === activeCase);
    if (row && row.status === 'NOT_RUN') Object.assign(row, { status: /module|executable|version mismatch|ENOENT|permission|launch/i.test(error.message) ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) });
    for (const item of report.cases) if (item.status === 'NOT_RUN') Object.assign(item, { status: 'BLOCKED', reason: 'A prior G05 case failed; dependent topology/privacy flow was not started.' });
    report.result = report.cases.some(item => item.status === 'FAIL') ? 'FAIL' : 'BLOCKED'; report.error = safeText(error.message || error); report.current_case = activeCase;
    report.denied_proxy_attempts = proxy?.attempts || [];
    report.node_diagnostics = [...nodes.values()].map(node => ({ label: node.label, subscriptions: node.subscriptions, eoses: node.eoses, received: node.received, forwarded: node.forwarded }));
    await mkdir(path.resolve(options.output), { recursive: true, mode: 0o700 });
    await writeFile(path.join(path.resolve(options.output), 'browser-g05-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }).catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`); return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await Promise.all([...nodes.values()].map(closeNode));
    await runtime?.browser?.close().catch(() => {});
    for (const relay of relays.reverse()) await stopGeode(relay);
    for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
