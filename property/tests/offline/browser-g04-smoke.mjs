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
import { installProcessGroupSignalCleanup, registerProcessGroup, stopProcessGroup } from './process-groups.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PASSWORD = 'Property-offline-g04-test!';
const CASES = ['G04-01', 'G04-02', 'G04-25', 'G04-11', 'G04-12', 'G04-14', 'G04-22', 'G04-23', 'G04-24', 'G04-09', 'G04-15', 'G04-16', 'G04-17', 'G04-18', 'G04-19', 'G04-20', 'G04-21', 'G04-13', 'G04-03', 'G04-04', 'G04-05', 'G04-06'];
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
  if (options.case && options.case !== 'G04-25') throw new Error('Only --case G04-25 is available for a targeted run.');
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
      'app.update.auto': false,
      'app.update.background.enabled': false,
      'app.update.staging.enabled': false,
      'app.update.service.enabled': false,
      'app.update.url': '',
      'app.update.url.details': '',
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

async function startGeode(port, base, label, runtimeBinary = null) {
  const data = path.join(base, `${label} data`), config = path.join(base, `${label} config`);
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port), PROPERTY_RELAY_DATA_DIR: data, PROPERTY_RELAY_CONFIG_DIR: config, PROPERTY_RELAY_CONFIG: path.join(config, 'relay.toml') };
  for (const key of PROXY_KEYS) delete env[key];
  let command = 'bash', args = [path.join(ROOT, 'property/relay/start.sh')];
  if (runtimeBinary) {
    await mkdir(data, { recursive: true, mode: 0o700 });
    await mkdir(config, { recursive: true, mode: 0o700 });
    const dbFile = path.join(data, 'events.db').replaceAll('"', '\\"');
    const configText = `[info]\nname = "Property Geode Relay"\ndescription = "Isolated Property test relay"\n\n[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[database]\nin_memory = false\nfile = "${dbFile}"\n\n[options]\nverify_signatures = true\nrequire_auth = false\n`;
    await writeFile(path.join(config, 'relay.toml'), configText, { mode: 0o600 });
    command = runtimeBinary;
    args = ['--config', path.join(config, 'relay.toml'), '--host', '127.0.0.1', '--port', String(port)];
  }
  const child = spawn(command, args, { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  registerProcessGroup(child);
  let diagnostic = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  try {
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(`Geode ${label} exited ${child.exitCode}: ${safeText(diagnostic)}`);
      const ready = await new Promise(resolve => { const socket = net.connect(port, '127.0.0.1'); socket.setTimeout(300); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => { socket.destroy(); resolve(false); }); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
      if (ready) {
        const packagedBinary = path.join(ROOT, 'property/relay/dist/geode/bin/geode');
        const binaryPath = runtimeBinary || await access(packagedBinary).then(() => packagedBinary).catch(() => path.join(data, 'runtime/geode/bin/geode'));
        return { child, port, url: `ws://127.0.0.1:${port}`, data, config, binaryPath, diagnostic: () => diagnostic };
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Geode ${label} did not become ready: ${safeText(diagnostic)}`);
  } catch (error) {
    await stopProcessGroup(child);
    throw error;
  }
}
async function stopGeode(relay) {
  if (!relay?.child) return;
  const result = await stopProcessGroup(relay.child, { graceMs: 6000, verifyMs: 1500 });
  if (!result.stopped) throw new Error(`Geode process group ${relay.child.pid} survived cleanup.`);
}

function startFalseAckRelay() {
  const events = [];
  const eventWaiters = new Set();
  const diagnostics = { connections: 0, frames: { EVENT: 0, recipientEnvelope: 0, otherEventKind: 0, REQ: 0, CLOSE: 0, other: 0 }, protocolErrors: 0 };
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
        if (frame[0] === 'EVENT' && frame[1]?.id) {
          diagnostics.frames.EVENT += 1;
          if (frame[1].kind === 1059) {
            diagnostics.frames.recipientEnvelope += 1;
            events.push(frame[1].id);
            for (const wake of [...eventWaiters]) wake();
          } else diagnostics.frames.otherEventKind += 1;
          send(['OK', frame[1].id, true, 'accepted by deliberate false-ack fixture']);
        }
        else if (frame[0] === 'REQ') { diagnostics.frames.REQ += 1; send(['EOSE', frame[1]]); }
        else if (frame[0] === 'CLOSE') diagnostics.frames.CLOSE += 1;
        else diagnostics.frames.other += 1;
      }
    });
    socket.on('error', () => {});
  });
  const waitForRecipientEnvelopeCount = (count, watchdogMs = 15000) => {
    if (events.length >= count) return Promise.resolve([...events]);
    return new Promise((resolve, reject) => {
      let timer;
      const wake = () => {
        if (events.length < count) return;
        clearTimeout(timer); eventWaiters.delete(wake); resolve([...events]);
      };
      timer = setTimeout(() => {
        eventWaiters.delete(wake);
        reject(new Error(`False-ACK fixture received ${events.length}/${count} recipient envelopes.`));
      }, watchdogMs);
      eventWaiters.add(wake);
      wake();
    });
  };
  return { server, events, diagnostics, waitForRecipientEnvelopeCount,
    ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
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
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker?.getRegistration();
        const ready = registration?.active?.state === 'activated' && navigator.serviceWorker?.controller?.state === 'activated';
        const appVisible = !document.querySelector('#auth-choice')?.classList.contains('hidden')
          || !document.querySelector('#workspace')?.classList.contains('hidden');
        const appStorageReady = !document.querySelector('#workspace')?.classList.contains('hidden')
          || (document.querySelector('#auth-choice') && document.querySelector('#create-account-button')?.disabled === false);
        const relaySelectionReady = await new Promise(resolve => {
          const request = indexedDB.open('liberdade-local-v1');
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('settings')) { db.close(); return resolve(false); }
            const read = db.transaction('settings').objectStore('settings').get('relays');
            read.onsuccess = () => { const saved = read.result; db.close(); resolve(Array.isArray(saved?.values) && saved.values.length > 0); };
            read.onerror = () => { db.close(); resolve(false); };
          };
        });
        return ready && appVisible && appStorageReady && relaySelectionReady;
      }, null, { timeout: 20000 });
      return page;
    } catch (error) {
      if (!/Execution context was destroyed|navigation/i.test(error.message || '')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    }
  }
  throw new Error('Property app did not settle after its service-worker activation reload.');
}
async function createIdentity(page) {
  await page.locator('#create-account-button').waitFor({ state: 'visible' }); await page.locator('#create-account-button').click();
  await page.locator('#auth-setup').waitFor({ state: 'visible' }); await page.locator('#new-password').fill(PASSWORD); await page.locator('#confirm-password').fill(PASSWORD);
  await page.locator('#finish-create-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  const npub = (await page.locator('#profile-npub').textContent()).trim();
  const pubkey = await page.evaluate(value => NostrTools.nip19.decode(value).data, npub);
  return { npub, pubkey };
}
async function importIdentity(page, secretHex) {
  await page.locator('#import-account-button').click(); await page.locator('#auth-import').waitFor({ state: 'visible' });
  await page.locator('#import-secret').fill(secretHex); await page.locator('#import-password').fill(PASSWORD); await page.locator('#remember-import').check();
  await page.locator('#finish-import-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  const npub = (await page.locator('#profile-npub').textContent()).trim();
  const pubkey = await page.evaluate(value => NostrTools.nip19.decode(value).data, npub);
  return { npub, pubkey };
}
async function freshSecretHex(page) {
  return page.evaluate(() => Array.from(NostrTools.generateSecretKey(), byte => byte.toString(16).padStart(2, '0')).join(''));
}
async function saveRelaysBeforeIdentity(page, relayUrls) {
  const saved = await page.evaluate(async urls => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ id: 'relays', values: urls, autoSelected: false });
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('relay fixture transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('relay fixture transaction failed'));
    });
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('relays');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close(); return value;
  }, relayUrls);
  assert.deepEqual(saved?.values, relayUrls, 'offline fixtures replace first-use random relay suggestions before identity activation');
  assert.equal(saved?.autoSelected, false, 'local relay fixtures no longer carry the automatic-suggestion flag');
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!/NS_BINDING_ABORTED|net::ERR_ABORTED/.test(error.message || '')) throw error;
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
  }
  await page.locator('#auth-choice').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('#import-account-button');
    return button && !button.disabled;
  }, null, { timeout: 20000 });
}
async function openGroupConversation(page, title, members) {
  await page.locator('#new-chat-button').click(); await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#open-group-dialog').click(); await page.locator('#group-dialog').waitFor({ state: 'visible' });
  await page.locator('#group-name-input').fill(title); await page.locator('#group-members-input').fill(members.join('\n'));
  await page.locator('#create-group-button').click(); await page.locator('#group-dialog').waitFor({ state: 'hidden' });
  await page.locator('#conversation-pane').waitFor({ state: 'visible' });
}
async function createConversationFolder(page, title) {
  await page.locator('#create-folder-button').click(); await page.locator('#folder-dialog').waitFor({ state: 'visible' });
  await page.locator('#folder-name-input').fill(title); await page.locator('#folder-save').click();
  await page.locator('#folder-dialog').waitFor({ state: 'hidden' });
}
async function moveConversationToFolder(page, title, folder) {
  const row = page.locator('#conversation-list .conversation-row').filter({ hasText: title });
  await row.locator('.conversation-folder-actions summary').click();
  await row.locator('.folder-actions-menu button').filter({ hasText: 'Move to folder…' }).click();
  await page.locator('#move-folder-dialog').waitFor({ state: 'visible' });
  await page.locator('#folder-move-select').selectOption({ label: folder });
  await page.locator('#move-folder-save').click(); await page.locator('#move-folder-dialog').waitFor({ state: 'hidden' });
}
async function setConversationTimes(page, updates) {
  await page.evaluate(async entries => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('conversations', 'readwrite');
      const store = transaction.objectStore('conversations');
      const request = store.getAll();
      request.onsuccess = () => {
        const times = new Map(entries);
        for (const conversation of request.result || []) {
          if (times.has(conversation.pubkey)) store.put({ ...conversation, lastAt: times.get(conversation.pubkey) });
        }
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('conversation fixture transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('conversation fixture transaction failed'));
    });
    db.close();
  }, Object.entries(updates));
}
async function conversationNames(page) {
  return (await page.locator('#conversation-list .conversation-item strong').allTextContents()).map(value => value.trim());
}
async function setConversationPin(page, title, action, pinned) {
  const row = page.locator('#conversation-list .conversation-row').filter({ hasText: title });
  await row.locator('.conversation-folder-actions summary').click();
  await row.locator('.folder-actions-menu button').filter({ hasText: action }).click();
  await page.waitForFunction(({ name, expected }) => {
    const found = [...document.querySelectorAll('#conversation-list .conversation-row')]
      .find(item => item.querySelector('.conversation-item strong')?.textContent.trim() === name);
    return Boolean(found?.querySelector('.conversation-pin-indicator')) === expected;
  }, { name: title, expected: pinned }, { timeout: 5000 });
}
async function conversationRecords(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction('conversations').objectStore('conversations').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close(); return rows.map(({ pubkey, title, pinned, lastAt }) => ({ pubkey, title, pinned: pinned === true, lastAt }));
  });
}
async function configureRelays(page, general, inbox, publishInbox = true) {
  await page.locator('#open-settings').click(); await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#relay-input').fill(general.join('\n')); await page.locator('#dm-relay-input').fill(inbox.join('\n'));
  await page.locator('#save-relays').click(); await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  const expectedConnections = `${general.length}/${general.length} relay${general.length === 1 ? '' : 's'}`;
  await page.waitForFunction(expected => document.querySelector('#connection-label')?.textContent === expected, expectedConnections, { timeout: 20000 });
  if (!publishInbox) return;
  await page.locator('#open-settings').click(); await page.locator('#dm-relay-input').fill(inbox.join('\n')); await page.locator('#publish-inbox-list').click();
  try {
    await page.waitForFunction(() => /(?:The public NIP-17 inbox list was published|Sua lista pública de recebimento NIP-17 foi publicada)/.test(document.querySelector('#toast')?.textContent || '') || Boolean(document.querySelector('#relay-error')?.textContent?.trim()), null, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      connection: document.querySelector('#connection-label')?.textContent || '',
      relayError: document.querySelector('#relay-error')?.textContent?.trim() || '',
      toast: document.querySelector('#toast')?.textContent?.trim() || '',
      publishButtonDisabled: document.querySelector('#publish-inbox-list')?.disabled ?? null
    }));
    throw new Error(`Inbox relay-list publish did not settle: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
  const relayError = (await page.locator('#relay-error').textContent()).trim();
  assert.equal(relayError, '', `kind-10050 publish UI error: ${relayError}; connection=${(await page.locator('#connection-label').textContent())?.trim()}; toast=${(await page.locator('#toast').textContent())?.trim()}`);
  if (await page.locator('#relay-dialog').isVisible()) await page.locator('#relay-dialog button[aria-label="Close"], #relay-dialog button[aria-label="Fechar"]').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden', timeout: 5000 });
}
async function forceReconnect(page) {
  await page.locator('#open-settings').click(); await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#save-relays').click(); await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /[1-9]\d*\/\d+ relay/.test(document.querySelector('#connection-label')?.textContent || ''), null, { timeout: 20000 });
}
async function waitForNewChatResult(page, expectedInput = '') {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('#new-chat-dialog');
    return !dialog?.open || Boolean(document.querySelector('#new-chat-error')?.textContent?.trim());
  }, null, { timeout: 8000 });
  const result = await page.evaluate(expected => {
    const value = document.querySelector('#peer-input')?.value || '';
    let decoder = 'unavailable';
    try { decoder = NostrTools.nip19.decode(value).type; } catch (error) { decoder = error?.message || 'decode failed'; }
    return {
      open: Boolean(document.querySelector('#new-chat-dialog')?.open),
      error: document.querySelector('#new-chat-error')?.textContent?.trim() || '',
      expected_input_length: expected.length,
      actual_input_length: value.length,
      input_matches_expected: value === expected,
      input_starts_with_expected: value.startsWith(expected),
      extra_input_length: Math.max(0, value.length - expected.length),
      input_contains_whitespace: /\s/u.test(value),
      input_has_mixed_case: value !== value.toLowerCase() && value !== value.toUpperCase(),
      decoder
    };
  }, expectedInput);
  if (result.open) throw new Error(`New conversation did not open: ${result.error || 'dialog remained open without an error message'}; diagnostics=${JSON.stringify(result)}`);
}
async function openConversation(page, peerNpub, title) {
  await page.locator('#new-chat-button').click(); await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'peer-input', null, { timeout: 3000 });
  const nameInput = page.locator('#peer-name-input');
  await nameInput.fill(title); assert.equal(await nameInput.inputValue(), title, 'the local display-name fixture remains intact');
  const peerInput = page.locator('#peer-input');
  await peerInput.fill(peerNpub); assert.equal(await peerInput.inputValue(), peerNpub, 'the public-key fixture remains intact after filling the dialog');
  await page.locator('#start-chat-button').click();
  await waitForNewChatResult(page, peerNpub); await page.locator('#conversation-pane').waitFor({ state: 'visible' });
}
async function sendMessage(page, text) {
  await page.locator('#message-input').fill(text); await page.locator('#send-form button[type="submit"]').click();
  await page.waitForFunction(value => {
    const rows = [...document.querySelectorAll('#messages .message-row')]; return rows.some(row => row.textContent.includes(value));
  }, text, { timeout: 10000 });
}
async function runTypingIndicatorCase({ pageA, pageB, a, b, relay0, relay1, runtime, options, report, mark }) {
  const messageRowsBeforeTyping = await pageA.locator('#messages .message-row').count();
  const draftBeforeTyping = await pageB.locator('#message-input').inputValue();
  const languageBeforeTyping = await pageA.locator('#language-picker').inputValue();
  await pageB.evaluate(() => {
    const nativeSend = WebSocket.prototype.send;
    window.__propertyTypingEvents = [];
    WebSocket.prototype.send = function (data) {
      try {
        const frame = JSON.parse(data);
        if (frame[0] === 'EVENT' && frame[1]?.kind === 21059) window.__propertyTypingEvents.push(frame[1]);
      } catch {}
      return nativeSend.call(this, data);
    };
  });
  const secretForDecode = await pageA.evaluate(async password => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const vault = await new Promise((resolve, reject) => {
      const request = db.transaction('vault').objectStore('vault').get('account');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const secret = await PropertyVault.unlockVault(vault, password, NostrTools.getPublicKey);
    const hex = Array.from(secret, byte => byte.toString(16).padStart(2, '0')).join('');
    secret.fill(0);
    return hex;
  }, PASSWORD);
  const localeRuns = [];
  const originalViewport = pageA.viewportSize();
  await pageA.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(pageA.viewportSize(), { width: 390, height: 844 }, 'the typing and thinking indicators are inspected at the fixed mobile viewport');
  for (const [language, marker, expectedText, screenshot] of [
    ['en', 'property-g04-private-typing-draft-en-001', /is typing/u, 'g04-typing-indicator-mobile-en.png'],
    ['pt-BR', 'property-g04-private-typing-draft-pt-BR-001', /está digitando/u, 'g04-typing-indicator-mobile-pt-BR.png']
  ]) {
    await pageA.locator('#language-picker').selectOption(language);
    const eventOffset = await pageB.evaluate(() => window.__propertyTypingEvents.length);
    await pageB.locator('#message-input').fill(marker);
    await pageA.locator('#chat-activity').waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await pageA.locator('#chat-activity').textContent(), expectedText, `typing status is localized in ${language}`);
    await pageA.locator('#toast').evaluate(element => {
      element.classList.remove('show');
      element.style.transition = 'none';
      element.style.opacity = '0';
    });
    await pageA.screenshot({ path: path.join(options.output, screenshot) });
    await pageB.waitForFunction(offset => window.__propertyTypingEvents.length > offset, eventOffset, { timeout: 10000 });
    await pageB.locator('#message-input').blur();
    await pageA.locator('#chat-activity').waitFor({ state: 'hidden', timeout: 10000 });
    await pageB.waitForFunction(offset => window.__propertyTypingEvents.length >= offset + 2, eventOffset, { timeout: 10000 });
    const events = await pageB.evaluate(offset => window.__propertyTypingEvents.slice(offset), eventOffset);
    assert.ok(events.every(event => event.kind === 21059 && runtime.nostrVerify(event)), 'all captured outer signals are signed ephemeral gift wraps');
    assert.ok(events.every(event => JSON.stringify(event.tags) === JSON.stringify([['p', a.pubkey]])), 'the relay route contains only the intended recipient');
    assert.ok(events.every(event => !JSON.stringify(event).includes(marker)), 'the unsent draft is never included in the relay payload');
    const opened = await pageA.evaluate(({ events, secretHex }) => {
      const secret = Uint8Array.from(secretHex.match(/.{2}/g), byte => parseInt(byte, 16));
      try { return events.map(event => PropertyTypingSignals.unwrap(NostrTools, event, secret)); }
      finally { secret.fill(0); }
    }, { events, secretHex: secretForDecode });
    assert.ok(opened.every(signal => signal?.sender === b.pubkey && signal.participants.length === 2), 'the recipient decrypts every signal from the expected sender');
    assert.equal(opened[0].action, 'typing');
    assert.equal(opened.at(-1).action, 'stop', 'blur sends an explicit stop signal');
    assert.ok(opened.every((signal, index) => index === 0 || signal.sequence > opened[index - 1].sequence), 'each repeated status has a strictly increasing sequence');
    localeRuns.push({ language, signals: events.length, localized: true, explicit_stop: true, screenshot });
  }
  await pageA.locator('#language-picker').selectOption(languageBeforeTyping);
  await pageB.locator('#message-input').fill(draftBeforeTyping);
  assert.equal(await pageA.locator('#messages .message-row').count(), messageRowsBeforeTyping, 'typing creates no message row');
  const eventsBeforeOptOut = await pageB.evaluate(() => window.__propertyTypingEvents.length);
  await pageB.locator('#profile-button').click();
  await pageB.locator('#profile-dialog').waitFor({ state: 'visible' });
  const typingPreference = pageB.locator('#typing-indicators-enabled');
  assert.equal(await typingPreference.isChecked(), true, 'the per-identity setting is enabled by default');
  await typingPreference.uncheck();
  await pageB.waitForFunction(async pubkey => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise((resolve, reject) => { const request = db.transaction('settings').objectStore('settings').get(`typing-indicators-${pubkey}`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return value?.enabled === false;
  }, b.pubkey);
  await pageB.locator('#profile-dialog button[aria-label="Close"]').click();
  await pageB.locator('#profile-dialog').waitFor({ state: 'hidden' });
  await pageB.locator('#message-input').fill('property-g04-private-typing-opt-out-001');
  assert.equal(await pageB.evaluate(() => window.__propertyTypingEvents.length), eventsBeforeOptOut, 'disabled typing does not publish a signal');
  assert.equal(await pageA.locator('#chat-activity').isVisible(), false, 'disabled typing creates no remote status');
  await pageB.locator('#message-input').fill(draftBeforeTyping);
  await pageB.locator('#profile-button').click();
  await pageB.locator('#profile-dialog').waitFor({ state: 'visible' });
  await typingPreference.check();
  await pageB.waitForFunction(async pubkey => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise((resolve, reject) => { const request = db.transaction('settings').objectStore('settings').get(`typing-indicators-${pubkey}`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return value?.enabled === true;
  }, b.pubkey);
  await pageB.locator('#profile-dialog button[aria-label="Close"]').click();
  await pageB.locator('#profile-dialog').waitFor({ state: 'hidden' });
  await pageA.locator('#language-picker').selectOption('en');
  const createActivityEvent = (action, sequence) => pageB.evaluate(async ({ password, recipient, action, sequence }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const vault = await new Promise((resolve, reject) => {
      const request = db.transaction('vault').objectStore('vault').get('account');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const secret = await PropertyVault.unlockVault(vault, password, NostrTools.getPublicKey);
    try {
      const sender = NostrTools.getPublicKey(secret);
      const delivery = PropertyTypingSignals.create(NostrTools, secret, [sender, recipient], action, sequence)
        .find(item => item.recipient === recipient);
      if (!delivery?.event) throw new Error('Could not create the private activity fixture.');
      return delivery.event;
    } finally { secret.fill(0); }
  }, { password: PASSWORD, recipient: a.pubkey, action, sequence });
  const agentActivityEvents = [];
  const firstThinking = await createActivityEvent('thinking', Math.floor(Date.now() * 1000));
  assert.equal(runtime.nostrVerify(firstThinking), true, 'the synthetic agent activity fixture is correctly signed');
  assert.deepEqual(firstThinking.tags, [['p', a.pubkey]], 'agent activity routes only to its recipient');
  assert.equal((await publishEvent(relay0.url, firstThinking)).accepted, true, 'the isolated relay accepts the encrypted thinking signal');
  agentActivityEvents.push(firstThinking);
  await pageA.locator('#chat-activity').waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await pageA.locator('#chat-activity').textContent(), /is thinking/u, 'the active conversation shows the English agent state');
  await pageA.screenshot({ path: path.join(options.output, 'g04-agent-thinking-mobile-en.png') });
  await pageA.locator('#language-picker').selectOption('pt-BR');
  await pageA.waitForFunction(() => /está pensando/u.test(document.querySelector('#chat-activity')?.textContent || ''), null, { timeout: 5000 });
  await pageA.screenshot({ path: path.join(options.output, 'g04-agent-thinking-mobile-pt-BR.png') });
  const stopThinking = await createActivityEvent('stop', Math.floor(Date.now() * 1000) + 1);
  assert.equal(runtime.nostrVerify(stopThinking), true, 'the synthetic agent stop fixture is correctly signed');
  assert.equal((await publishEvent(relay0.url, stopThinking)).accepted, true, 'the isolated relay accepts the encrypted stop signal');
  agentActivityEvents.push(stopThinking);
  await pageA.locator('#chat-activity').waitFor({ state: 'hidden', timeout: 10000 });
  if (originalViewport) await pageA.setViewportSize(originalViewport);
  const openedAgentActivity = await pageA.evaluate(({ events, secretHex }) => {
    const secret = Uint8Array.from(secretHex.match(/.{2}/g), byte => parseInt(byte, 16));
    try { return events.map(event => PropertyTypingSignals.unwrap(NostrTools, event, secret)); }
    finally { secret.fill(0); }
  }, { events: agentActivityEvents, secretHex: secretForDecode });
  assert.deepEqual(openedAgentActivity.map(signal => signal?.action), ['thinking', 'stop'], 'the recipient decrypts the fixed thinking and stop states');
  await pageA.locator('#language-picker').selectOption(languageBeforeTyping);
  const storedEphemeral = [];
  for (const relay of [relay0, relay1]) storedEphemeral.push(...await wsQuery(relay.url, { kinds: [21059], '#p': [a.pubkey], limit: 100 }));
  assert.deepEqual(storedEphemeral, [], 'the isolated relays do not retain ephemeral typing events');
  const storedMessages = [];
  for (const relay of [relay0, relay1]) storedMessages.push(...await wsQuery(relay.url, { kinds: [1059], '#p': [a.pubkey], limit: 1000 }));
  assert.ok(storedMessages.every(event => !JSON.stringify(event).includes('property-g04-private-typing-')), 'stored message wrappers contain no typing draft');
  assert.equal(await pageA.locator('#messages .message-row').count(), messageRowsBeforeTyping, 'agent activity also creates no message row');
  report.typing_indicators = { locale_runs: localeRuns, agent_thinking: { localized_en: true, localized_pt_BR: true, decrypted_thinking_and_stop: true,
    no_custom_text: true, explicit_stop: true, screenshots: ['g04-agent-thinking-mobile-en.png', 'g04-agent-thinking-mobile-pt-BR.png'] },
    opt_out_persisted_per_identity: true, opt_out_blocks_human_typing: true, draft_sent: false, visible_message_delta: 0,
    outer_route_only: true, recipients_decrypted_start_and_stop: true, ephemeral_event_retained: false };
  mark('G04-25', 'PASS', 'B’s typing status appeared in A’s active conversation in both languages and cleared on blur. A decrypted the signed kind-21059 start/stop signals. A separate text-free thinking state appeared in English and Portuguese and cleared on stop. The per-identity typing opt-out persisted; wrappers exposed only A’s route, contained no unsent draft, created no message, and were not retained by either isolated relay.');
}
async function localRecord(page, storeName, id) {
  return page.evaluate(async ({ storeName, id }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close(); return result || null;
  }, { storeName, id });
}
async function localMessagePreview(page, peer, text) {
  return page.evaluate(async ({ peer, text }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction('messages').objectStore('messages').getAll();
      request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.filter(row => row.peer === peer && row.text === text).sort((left, right) => right.createdAt - left.createdAt)[0]?.linkPreview || null;
  }, { peer, text });
}
async function localUnreadTotal(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction('conversations').objectStore('conversations').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return Math.min(9999, records.reduce((total, item) => total + (Number.isSafeInteger(item.unreadCount) && item.unreadCount > 0 ? item.unreadCount : 0), 0));
  });
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
  installProcessGroupSignalCleanup();
  let options, runtime, app, proxy, relay0, relay1, falseAck, contextA, contextB, contextC, contextD, contextE, contextF, contextG, stage = 'startup';
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g04-'));
  const report = { schema_version: 1, cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    relays: [], external_requests: [], websockets: [], denied_proxy_attempts: [], page_errors: [], inbox_checks: {}, message_checks: {}, failure_checks: {}, reconciliation: {} };
  const mark = (id, status, reason) => Object.assign(report.cases.find(row => row.case === id), { status, reason });
  try {
    options = parseArgs(process.argv.slice(2));
    const onlyTypingCase = options.case === 'G04-25';
    if (onlyTypingCase) report.cases = ['G04-25'].map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' }));
    app = startAppServer(); proxy = startProxy(); await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`; runtime = await loadRuntime(options, proxy.server.address().port);
    report.browser = runtime.evidence; report.local_origin = origin;
    relay0 = await startGeode(28470, temp, 'relay zero'); relay1 = await startGeode(28471, temp, 'relay one', relay0.binaryPath);
    report.relays = [relay0, relay1].map(relay => ({ url: relay.url, process_id: relay.child.pid, data_dir_mode: 'temporary private directory' }));
    const profileA = path.join(temp, 'profile A with spaces'), profileB = path.join(temp, 'profile B with spaces'), profileC = path.join(temp, 'profile C with spaces');
    contextA = await runtime.playwright[options.engine].launchPersistentContext(profileA, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    contextB = await runtime.playwright[options.engine].launchPersistentContext(profileB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    if (!onlyTypingCase) contextC = await runtime.playwright[options.engine].launchPersistentContext(profileC, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    for (const context of [contextA, contextB, contextC].filter(Boolean)) instrument(context, origin, report);
    await contextA.addInitScript(() => {
      window.__propertyNotificationProbe = { permissionRequests: 0, displayed: [] };
      class FakeNotification {
        static permission = 'default';
        static async requestPermission() {
          window.__propertyNotificationProbe.permissionRequests++;
          FakeNotification.permission = 'granted';
          return 'granted';
        }
        constructor(title, options = {}) {
          window.__propertyNotificationProbe.displayed.push({ title, body: options.body, data: options.data ?? null, tag: options.tag });
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification });
      window.__propertyBadgeProbe = { calls: [] };
      Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: async count => {
        window.__propertyBadgeProbe.calls.push({ type: 'set', count });
      } });
      Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: async () => {
        window.__propertyBadgeProbe.calls.push({ type: 'clear' });
      } });
    });
    stage = 'G04-01: open A'; let pageA = await openApp(contextA, origin);
    stage = 'G04-01: open B'; let pageB = await openApp(contextB, origin);
    let pageC = null;
    if (!onlyTypingCase) { stage = 'G04-01: open C'; pageC = await openApp(contextC, origin); }
    await saveRelaysBeforeIdentity(pageA, [relay0.url]);
    await saveRelaysBeforeIdentity(pageB, [relay0.url]);
    if (pageC) await saveRelaysBeforeIdentity(pageC, [relay0.url]);
    stage = 'G04-01: create identity A'; const a = await createIdentity(pageA);
    stage = 'G04-01: create identity B'; const b = await createIdentity(pageB);
    let c = null;
    if (pageC) { stage = 'G04-01: create identity C'; c = await createIdentity(pageC); }
    stage = 'G04-01: configure relays A';
    await configureRelays(pageA, [relay0.url], [relay0.url]);
    stage = 'G04-01: configure relays B';
    await configureRelays(pageB, [relay0.url], [relay0.url, relay1.url]);
    if (onlyTypingCase) {
      stage = 'G04-25: prepare direct conversation';
      await openConversation(pageA, b.npub, 'B private');
      const bootstrap = `property-g04-typing-bootstrap-${crypto.randomUUID()}`;
      await sendMessage(pageA, bootstrap);
      await openConversation(pageB, a.npub, 'A private');
      await pageB.locator('#messages .message-bubble').filter({ hasText: bootstrap }).waitFor({ state: 'visible', timeout: 15000 });
      const reply = `property-g04-typing-bootstrap-reply-${crypto.randomUUID()}`;
      await sendMessage(pageB, reply);
      await pageA.locator('#messages .message-bubble').filter({ hasText: reply }).waitFor({ state: 'visible', timeout: 15000 });
      stage = 'G04-25: encrypted typing indicator';
      await runTypingIndicatorCase({ pageA, pageB, a, b, relay0, relay1, runtime, options, report, mark });
      assert.deepEqual(report.external_requests, [], 'all browser HTTP requests stayed on the local origin');
      assert.ok(report.websockets.every(url => /^ws:\/\/127\.0\.0\.1:/.test(url)), 'browser WebSockets are loopback only');
      assert.deepEqual(report.page_errors, [], 'no page runtime errors');
      const browserRuntimeAttempts = proxy.attempts.filter(attempt => attempt.destination === 'aus5.mozilla.org:443');
      assert.deepEqual(proxy.attempts.filter(attempt => attempt.destination !== 'aus5.mozilla.org:443'), [], 'the proxy rejected every other destination');
      report.browser_runtime_attempts_blocked = browserRuntimeAttempts;
      report.result = 'PASS'; report.denied_proxy_attempts = [...proxy.attempts];
      await writeReport(path.resolve(options.output), report);
      process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
      return 0;
    }
    stage = 'G04-01: configure relays C';
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
    await waitForNewChatResult(pageB);
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

    // G04-25: live typing is private, ephemeral, and does not publish the draft.
    stage = 'G04-25: encrypted typing indicator';
    await runTypingIndicatorCase({ pageA, pageB, a, b, relay0, relay1, runtime, options, report, mark });

    // G04-11: message gestures only select existing local actions; they do not publish.
    stage = 'G04-11: reply swipe and edit-last shortcut';
    const replyBubble = pageA.locator('#messages .message-bubble').filter({ hasText: response }).last();
    await replyBubble.waitFor({ state: 'visible', timeout: 10000 });
    await replyBubble.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const start = { bubbles: true, pointerId: 71, pointerType: 'touch', isPrimary: true, button: 0,
        clientX: rect.left + 4, clientY: rect.top + 4 };
      node.dispatchEvent(new PointerEvent('pointerdown', start));
      node.dispatchEvent(new PointerEvent('pointermove', { ...start, clientX: start.clientX + 96, clientY: start.clientY + 12 }));
      node.dispatchEvent(new PointerEvent('pointerup', { ...start, clientX: start.clientX + 96, clientY: start.clientY + 12 }));
    });
    await pageA.locator('#reply-context').waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await pageA.locator('#reply-context-text').textContent()).includes(response),
      'the rightward touch gesture selects the message it started on');
    await pageA.locator('#cancel-reply').click();
    await pageA.locator('#reply-context').waitFor({ state: 'hidden', timeout: 5000 });
    const latestOwnText = await pageA.evaluate(async peerKey => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('liberdade-local-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const messages = await new Promise((resolve, reject) => {
        const request = db.transaction('messages').objectStore('messages').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return messages.filter(item => item.peer === peerKey && item.direction === 'sent' && item.kind !== 7 && !item.fromAgent
        && !item.agentMessageId && !item.deleted && item.nostrEventId && ['sent', 'partial'].includes(item.status))
        .sort((a, b) => b.createdAt - a.createdAt || String(b.id).localeCompare(String(a.id)))[0]?.text || null;
    }, b.pubkey);
    assert.ok(latestOwnText, 'the fixed chat has an eligible own message for ArrowUp edit');
    const composer = pageA.locator('#message-input');
    await composer.fill('preserve this draft'); await composer.press('ArrowUp');
    assert.equal(await composer.inputValue(), 'preserve this draft', 'ArrowUp leaves a nonempty draft untouched');
    assert.equal(await pageA.locator('#edit-context').isVisible(), false, 'ArrowUp does not start an edit when a draft exists');
    await composer.fill('');
    const eventsBeforeGestures = (await wsQuery(relay0.url, { kinds: [1059], '#p': [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    await composer.press('ArrowUp');
    await pageA.locator('#edit-context').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await composer.inputValue(), latestOwnText, 'ArrowUp loads the latest eligible own message into the existing editor');
    await pageA.locator('#cancel-edit').click();
    await pageA.locator('#edit-context').waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await composer.inputValue(), '', 'cancel restores the pre-edit empty draft');
    const eventsAfterGestures = (await wsQuery(relay0.url, { kinds: [1059], '#p': [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(eventsAfterGestures, eventsBeforeGestures, 'reply and edit shortcuts publish zero relay events');
    report.message_gestures = { reply_target: response, right_swipe_px: 96, vertical_delta_px: 12,
      arrow_up_edit_text_matches_latest_own_message: true, nonempty_draft_preserved: true, cancel_restored_empty_draft: true,
      relay_event_delta: eventsAfterGestures.length - eventsBeforeGestures.length };
    mark('G04-11', 'PASS', 'A fixed rightward touch swipe selected its exact reply target; ArrowUp edited the latest eligible own message only with an empty composer; cancel preserved the draft and neither shortcut published a relay event.');

    // G04-12: NIP-19 profile cards are a local contact-intent affordance, not a relay action.
    stage = 'G04-12: Nostr profile cards and explicit contact intent';
    const extraPubkey = await pageA.evaluate(() => NostrTools.getPublicKey(NostrTools.generateSecretKey()));
    const extraNpub = await pageA.evaluate(key => NostrTools.nip19.npubEncode(key), extraPubkey);
    const contactNprofile = await pageA.evaluate(({ pubkey, relay }) => NostrTools.nip19.nprofileEncode({ pubkey, relays: [relay] }),
      { pubkey: c.pubkey, relay: relay0.url });
    const cardText = `${contactNprofile}\n${b.npub}\n${extraNpub}\nDuplicate ${contactNprofile}\nAfter cap ${a.npub}\nInvalid npub1truncated\nPrivate-looking nsec1truncated\nCode \`${a.npub}\`\nURL https://example.invalid/${a.npub}`;
    await pageA.locator('#message-input').fill(cardText);
    await pageA.locator('#send-form button[type="submit"]').click();
    if (await pageA.locator('#secret-guard-dialog').isVisible()) await pageA.locator('#secret-guard-send-anyway').click();
    try {
      await pageA.waitForFunction(value => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(value)),
        contactNprofile, { timeout: 10000 });
    } catch (error) {
      const diagnostics = await pageA.evaluate(() => ({
        composer: document.querySelector('#message-input')?.value || '',
        sendDisabled: document.querySelector('#send-form button[type="submit"]')?.disabled ?? null,
        toast: document.querySelector('#toast')?.textContent?.trim() || '',
        relayError: document.querySelector('#relay-error')?.textContent?.trim() || '',
        warningVisible: document.querySelector('#secret-guard-dialog')?.open ?? false,
        messageRows: [...document.querySelectorAll('#messages .message-row')].map(row => row.textContent.slice(0, 240))
      }));
      throw new Error(`G04-12 message did not render: ${JSON.stringify(diagnostics)}; ${error.message}`);
    }
    const entityRow = pageA.locator('#messages .message-row').filter({ hasText: contactNprofile }).last();
    await entityRow.waitFor({ state: 'visible', timeout: 10000 });
    const profileCards = entityRow.locator('button[data-nostr-profile-code]');
    assert.equal(await profileCards.count(), 3, 'three unique valid profile references render at most three cards');
    await pageA.locator('#message-search-button').click();
    await pageA.locator('#message-search-input').fill(contactNprofile.slice(0, 16));
    await pageA.locator('#message-search-count').waitFor({ state: 'visible', timeout: 5000 });
    await pageA.waitForFunction(() => document.querySelector('#message-search-count')?.textContent === '1 of 1', null, { timeout: 5000 });
    assert.equal(await profileCards.count(), 3, 'local message search preserves the profile cards and their interaction targets');
    assert.ok(await profileCards.first().locator('mark.message-search-hit').count(), 'the matched profile code is highlighted inside its existing card');
    await pageA.locator('#message-search-close').click();
    assert.equal(await profileCards.count(), 3, 'closing search restores the same cards without recreating the message');
    assert.deepEqual(await profileCards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-nostr-profile-code'))),
      [contactNprofile.toLowerCase(), b.npub, extraNpub], 'cards retain their valid NIP-19 inputs in message order');
    assert.ok((await entityRow.textContent()).includes(a.npub), 'references beyond the card cap and inside code/URLs remain searchable text');
    assert.ok((await entityRow.textContent()).includes('npub1truncated') && (await entityRow.textContent()).includes('nsec1truncated'),
      'invalid profile codes and private-key-looking text stay literal');
    const conversationCountBeforeCard = await pageA.locator('#conversation-list .conversation-row').count();
    const relayEventsBeforeCard = (await wsQuery(relay0.url, { kinds: [1059], limit: 1000 })).map(event => event.id).sort();
    await profileCards.first().click();
    await pageA.locator('#new-chat-dialog').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await pageA.locator('#peer-input').inputValue(), c.npub, 'the profile card prefills the intended public identity');
    assert.equal((await pageA.locator('#peer-relays-input').inputValue()).trim(), relay0.url, 'nprofile relay hints are shown for review');
    assert.equal(await pageA.locator('#conversation-list .conversation-row').count(), conversationCountBeforeCard,
      'opening a card does not create a conversation');
    const relayEventsAfterCard = (await wsQuery(relay0.url, { kinds: [1059], limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayEventsAfterCard, relayEventsBeforeCard, 'opening a profile card publishes no relay event');
    await pageA.locator('#new-chat-dialog button[aria-label="Close"]').click();
    await pageA.locator('#new-chat-dialog').waitFor({ state: 'hidden', timeout: 5000 });
    report.nostr_profile_cards = { valid_unique_cards: 3, duplicate_canonical_profile_deduplicated: true,
      invalid_code_literal: true, prefilled_public_identity: true, relay_hints_shown_for_review: true,
      search_kept_cards_interactive: true, search_highlighted_profile_code: true, closing_search_preserved_cards: true,
      conversation_created_before_confirmation: false, relay_event_delta: relayEventsAfterCard.length - relayEventsBeforeCard.length };
    mark('G04-12', 'PASS', 'Valid npub/nprofile references rendered as bounded Property cards; duplicate, invalid, nsec-looking, code-span and URL references stayed literal. Local search highlighted a profile code without flattening its card; tapping a card prefilled the existing contact dialog and relay hints without creating a conversation or publishing an event.');

    // G04-14: conversation-list search finds older local messages and opens the exact matching message.
    stage = 'G04-14: local search across conversation history';
    await openConversation(pageA, c.npub, 'C search');
    const olderSearchHit = `property-cross-chat-history-${crypto.randomUUID()}`;
    await sendMessage(pageA, olderSearchHit);
    await pageA.locator('#conversation-search').fill(olderSearchHit);
    const searchResult = pageA.locator('#conversation-list .conversation-row').filter({ hasText: 'C search' });
    await searchResult.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await searchResult.locator('.conversation-preview').textContent()).includes(olderSearchHit),
      'the first query finds a message before a new matching conversation cache exists');
    const latestSearchMessage = `property-later-message-${crypto.randomUUID()}`;
    await sendMessage(pageA, latestSearchMessage);
    await searchResult.waitFor({ state: 'visible', timeout: 5000 });
    const relayEventsBeforeSearch = (await wsQuery(relay0.url, { kinds: [1059], authors: [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    assert.equal(await pageA.locator('#conversation-list .conversation-item').count(), 1,
      'a new-message write invalidates the search cache and keeps the older matching conversation visible');
    assert.equal((await searchResult.locator('.conversation-search-match-label').textContent()).trim(), 'Message match');
    const resultPreview = (await searchResult.locator('.conversation-preview').textContent()).trim();
    assert.ok(resultPreview.includes(olderSearchHit), 'the result previews the matching older message');
    assert.ok(!resultPreview.includes(latestSearchMessage), 'the result does not mistake the latest nonmatching message for the hit');
    await searchResult.locator('.conversation-item').click();
    const searchTarget = pageA.locator('#messages .message-row.conversation-search-target');
    await searchTarget.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await searchTarget.textContent()).includes(olderSearchHit), 'opening a result lands on the exact historical message');
    assert.equal(await pageA.locator('#conversation-search').inputValue(), olderSearchHit,
      'the local query remains available after opening the conversation');
    const relayEventsAfterSearch = (await wsQuery(relay0.url, { kinds: [1059], authors: [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayEventsAfterSearch, relayEventsBeforeSearch, 'search sends no relay event');
    await openGroupConversation(pageA, 'C group search', [b.npub, c.npub]);
    const olderGroupSearchHit = `property-group-history-${crypto.randomUUID()}`;
    await sendMessage(pageA, olderGroupSearchHit);
    await pageA.locator('#conversation-search').fill(olderGroupSearchHit);
    const groupSearchResult = pageA.locator('#conversation-list .conversation-row').filter({ hasText: 'C group search' });
    await groupSearchResult.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await groupSearchResult.locator('.conversation-preview').textContent()).includes(olderGroupSearchHit),
      'the group history index finds the saved older message');
    const latestGroupSearchMessage = `property-group-later-${crypto.randomUUID()}`;
    await sendMessage(pageA, latestGroupSearchMessage);
    await groupSearchResult.waitFor({ state: 'visible', timeout: 5000 });
    const groupRelayEventsBeforeSearch = (await wsQuery(relay0.url, { kinds: [1059], authors: [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    const groupResultPreview = (await groupSearchResult.locator('.conversation-preview').textContent()).trim();
    assert.ok(groupResultPreview.includes(olderGroupSearchHit), 'the group result previews the matching historical message');
    assert.ok(!groupResultPreview.includes(latestGroupSearchMessage), 'the group result does not show the newer nonmatching message');
    await groupSearchResult.locator('.conversation-item').click();
    const groupSearchTarget = pageA.locator('#messages .message-row.conversation-search-target');
    await groupSearchTarget.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await groupSearchTarget.textContent()).includes(olderGroupSearchHit), 'opening the group result lands on its exact historical message');
    const groupRelayEventsAfterSearch = (await wsQuery(relay0.url, { kinds: [1059], authors: [a.pubkey], limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(groupRelayEventsAfterSearch, groupRelayEventsBeforeSearch, 'searching group history sends no relay event');
    report.message_search = { searches_saved_direct_and_group_history: true, ignores_case_and_accents: true,
      previews_newest_matching_message_per_chat: true, cache_invalidated_on_new_message: true,
      opens_exact_message: true, sends_no_search_event: true };
    mark('G04-14', 'PASS', 'Conversation-list search found older locally stored direct and group messages after newer nonmatching messages, identified each chat, and opened each exact match without a relay search event.');
    stage = 'G04-22: group mention autocomplete and encrypted NIP-27 reference';
    const mentionMarker = `property-g04-group-mention-${crypto.randomUUID()}`;
    const mentionInput = pageA.locator('#message-input');
    await mentionInput.fill(`${mentionMarker} @`);
    const mentionOption = pageA.locator('#group-mention-picker .group-mention-option.is-active');
    await mentionOption.waitFor({ state: 'visible', timeout: 5000 });
    const originalViewport = pageA.viewportSize();
    await pageA.setViewportSize({ width: 390, height: 844 });
    await mentionOption.waitFor({ state: 'visible', timeout: 5000 });
    const mobileMentionLayout = await pageA.evaluate(() => {
      const picker = document.querySelector('#group-mention-picker').getBoundingClientRect();
      const input = document.querySelector('#message-input').getBoundingClientRect();
      return { pickerBottom: Math.round(picker.bottom), inputTop: Math.round(input.top) };
    });
    assert.ok(mobileMentionLayout.pickerBottom <= mobileMentionLayout.inputTop - 4,
      `mobile suggestions must sit above and leave the draft visible: ${JSON.stringify(mobileMentionLayout)}`);
    await pageA.screenshot({ path: path.join(options.output, 'g04-group-mention-picker-mobile-en.png') });
    if (originalViewport) await pageA.setViewportSize(originalViewport);
    await mentionInput.focus();
    const senderMentionLabel = (await mentionOption.locator('.group-mention-name').textContent()).trim();
    const mentionTargetPubkey = await mentionOption.getAttribute('data-pubkey');
    const relayWrapIdsBeforeMention = (await wsQuery(relay0.url, { kinds: [1059], '#p': [mentionTargetPubkey], limit: 1000 })).map(event => event.id).sort();
    await mentionInput.press('Enter');
    const afterMentionSelection = await mentionInput.inputValue();
    assert.ok(afterMentionSelection.includes(`${senderMentionLabel} `), `keyboard selection inserts the local member name and keeps the caret in the composer (label=${JSON.stringify(senderMentionLabel)}, value=${JSON.stringify(afterMentionSelection)})`);
    await mentionInput.pressSequentially('received');
    const visibleMentionMessage = await mentionInput.inputValue();
    await pageA.locator('#send-form button[type="submit"]').click();
    const senderMentionMessage = pageA.locator('#messages .message-row').filter({ hasText: mentionMarker });
    const senderMentionVisible = await senderMentionMessage.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false);
    if (!senderMentionVisible) report.group_mention_send_diagnostic = await pageA.evaluate(async marker => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const rows = await new Promise((resolve, reject) => { const request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
      db.close(); const message = rows.find(row => row.text?.includes(marker));
      return { input: document.querySelector('#message-input').value, toast: document.querySelector('#toast')?.textContent || '',
        authError: document.querySelector('#auth-error')?.textContent || '', buttonDisabled: document.querySelector('#send-form button[type="submit"]').disabled,
        activeTitle: document.querySelector('#chat-title')?.textContent || '', visibleMessages: document.querySelector('#messages')?.innerText?.slice(-1200) || '',
        savedMessage: message ? { text: message.text, mentions: message.mentions || [], status: message.status } : null };
    }, mentionMarker);
    assert.ok(senderMentionVisible, `the sender stores and renders the group mention message: ${JSON.stringify(report.group_mention_send_diagnostic || {})}`);
    const senderGroupKey = await pageA.locator('#messages').getAttribute('data-peer');
    await waitForMessageStatus(pageA, senderGroupKey, visibleMentionMessage, 'sent');
    const mentionRelayEvents = await wsQuery(relay0.url, { kinds: [1059], '#p': [mentionTargetPubkey], limit: 1000 });
    const newMentionEnvelopes = mentionRelayEvents.filter(event => !relayWrapIdsBeforeMention.includes(event.id));
    assert.equal(newMentionEnvelopes.length, 1, 'one confirmed gift-wrap reached the mentioned member relay route');
    assert.ok(newMentionEnvelopes.every(event => !JSON.stringify(event).includes(mentionMarker) && !JSON.stringify(event).includes(senderMentionLabel)),
      'the local relay stores no readable group text or @name in the encrypted gift-wrap');
    const recipientGroupRow = pageB.locator('#conversation-list .conversation-row').filter({ hasText: 'C group search' });
    await recipientGroupRow.waitFor({ state: 'visible', timeout: 15000 });
    await recipientGroupRow.click();
    const recipientMentionMessage = pageB.locator('#messages .message-row').filter({ hasText: mentionMarker });
    const recipientMentionVisible = await recipientMentionMessage.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
    if (!recipientMentionVisible) report.group_mention_recipient_diagnostic = await pageB.evaluate(async marker => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const rows = await new Promise((resolve, reject) => { const request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
      const connections = [...document.querySelectorAll('.relay-connection')].map(node => node.textContent).filter(Boolean);
      db.close();
      return { savedMarkerMessage: rows.some(row => row.text?.includes(marker)), connection: document.querySelector('#connection-label')?.textContent || '',
        groupTitle: document.querySelector('#chat-title')?.textContent || '', visibleText: document.querySelector('#messages')?.innerText?.slice(-800) || '', connections };
    }, mentionMarker);
    assert.ok(recipientMentionVisible, `the other group participant receives and renders the message: ${JSON.stringify(report.group_mention_recipient_diagnostic || {})}`);
    const recipientMentionRecord = await pageB.evaluate(async marker => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const rows = await new Promise((resolve, reject) => { const request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
      db.close(); const message = rows.find(row => row.text?.includes(marker)); return message ? { text: message.text, mentions: message.mentions || [] } : null;
    }, mentionMarker);
    assert.ok(recipientMentionRecord?.text.includes('received'), 'the other participant decrypts and renders the group message');
    assert.equal(recipientMentionRecord.mentions.find(mention => mention.pubkey === mentionTargetPubkey)?.pubkey, mentionTargetPubkey,
      'the recipient resolves the NIP-27 profile reference to the intended group member');
    report.group_mentions = { sender_label: senderMentionLabel, mentioned_member_pubkey: mentionTargetPubkey, local_identity_binding: true, relay_plaintext_leak: false, mobile_screenshot: 'g04-group-mention-picker-mobile-en.png', mobile_layout: mobileMentionLayout, message_text: visibleMentionMessage };
    mark('G04-22', 'PASS', 'The group composer offered local member autocomplete, Enter inserted a bound @name, NIP-27 profile references were carried inside encrypted NIP-17 content, the recipient resolved the correct member, and the relay exposed no message text.');
    await openConversation(pageA, b.npub, 'B privado');

    // G04-23: location cards are parsed locally and do not load map data.
    stage = 'G04-23: local location card and consent-first map link';
    const locationMarker = `property-g04-location-${crypto.randomUUID()}`;
    const locationMessage = `${locationMarker} geo:0,0?q=38.6916,-9.2160(Torre%20de%20Bel%C3%A9m)`;
    const locationRequestsBefore = report.external_requests.length;
    const locationRelayIdsBefore = new Set();
    for (const relay of [relay0, relay1]) {
      for (const event of await wsQuery(relay.url, { kinds: [1059], limit: 1000 })) locationRelayIdsBefore.add(event.id);
    }
    await sendMessage(pageA, locationMessage);
    const senderLocationRow = pageA.locator('#messages .message-row').filter({ hasText: locationMarker });
    await senderLocationRow.locator('.message-location-card').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await senderLocationRow.locator('.message-location-title').textContent()).trim(), 'Torre de Belém');
    assert.equal((await senderLocationRow.locator('.message-location-coordinates').textContent()).trim(), '38.69160, -9.21600');
    assert.equal(await senderLocationRow.locator('.message-location-card img').count(), 0, 'rendering a location does not fetch map tiles or remote images');
    const senderMapLink = senderLocationRow.locator('.message-location-open');
    assert.equal((await senderMapLink.textContent()).trim(), 'Open in map');
    assert.equal(await senderMapLink.getAttribute('target'), '_blank');
    assert.equal(await senderMapLink.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await senderMapLink.getAttribute('referrerpolicy'), 'no-referrer');
    assert.match(await senderMapLink.getAttribute('href'), /mlat=38\.691600&mlon=-9\.216000#map=16\/38\.691600\/-9\.216000/u);
    assert.match((await senderLocationRow.locator('.message-location-privacy').textContent()), /IP address/u);
    assert.equal(report.external_requests.length, locationRequestsBefore, 'displaying a location card makes zero external requests');
    const locationRelayEvents = [];
    for (const relay of [relay0, relay1]) {
      for (const event of await wsQuery(relay.url, { kinds: [1059], limit: 1000 })) {
        if (!locationRelayIdsBefore.has(event.id)) locationRelayEvents.push(event);
      }
    }
    assert.ok(locationRelayEvents.length > 0, 'at least one encrypted NIP-17 gift-wrap reaches the loopback relays');
    assert.ok(locationRelayEvents.every(event => {
      const serialized = JSON.stringify(event);
      return !serialized.includes(locationMarker) && !serialized.includes('Torre de Belém') && !serialized.includes('38.6916,-9.2160');
    }), 'the relay sees no readable location message or coordinates');

    await openConversation(pageB, a.npub, 'A privada');
    const recipientLocationRow = pageB.locator('#messages .message-row').filter({ hasText: locationMarker });
    await recipientLocationRow.locator('.message-location-card').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await recipientLocationRow.locator('.message-location-title').textContent()).trim(), 'Torre de Belém');
    await pageB.locator('#language-picker').selectOption('pt-BR');
    await pageB.waitForFunction(() => document.querySelector('.message-location-open')?.textContent === 'Abrir no mapa');
    assert.match((await recipientLocationRow.locator('.message-location-privacy').textContent()), /IP/u);
    await pageB.setViewportSize({ width: 390, height: 844 });
    await pageB.locator('#messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const mobileLocationLayout = await pageB.waitForFunction(() => {
      const messages = document.querySelector('#messages');
      const card = document.querySelector('.message-location-card');
      const composer = document.querySelector('.composer');
      if (!messages || !card || !composer) return null;
      const viewport = messages.getBoundingClientRect(), location = card.getBoundingClientRect(), composerRect = composer.getBoundingClientRect();
      return location.top >= viewport.top && location.bottom <= composerRect.top - 4
        ? { card_top: Math.round(location.top), card_bottom: Math.round(location.bottom), composer_top: Math.round(composerRect.top) }
        : null;
    }, null, { timeout: 5000 }).then(handle => handle.jsonValue());
    assert.ok(mobileLocationLayout, 'the entire location card stays above the mobile composer');
    await pageB.screenshot({ path: path.join(options.output, 'g04-location-card-mobile-pt-BR.png') });
    assert.equal(report.external_requests.length, locationRequestsBefore, 'both send and receive render the card without external requests');
    report.location_cards = { sender_coordinates: '38.69160, -9.21600', recipient_rendered: true, relay_plaintext_leak: false,
      external_requests_before_map_activation: 0, map_tiles_loaded: false, explicit_open_link: true,
      languages: ['en', 'pt-BR'], mobile_layout: mobileLocationLayout, mobile_screenshot: 'g04-location-card-mobile-pt-BR.png' };
    mark('G04-23', 'PASS', 'Both Property clients rendered a local location card from the encrypted NIP-17 message. No map image or external request was made; loopback relays saw no readable coordinates or place name. The map link is explicit, uses the parsed coordinates, and its privacy notice is localized.');

    // G04-24: a forwarded message keeps its body and carries only a private hop marker.
    stage = 'G04-24: private forward marker';
    await openConversation(pageA, c.npub, 'C forwarding target');
    await openConversation(pageC, a.npub, 'A forwarding source');
    await openConversation(pageA, b.npub, 'B private');
    const sourceForwardRow = pageA.locator('#messages .message-row').filter({ hasText: response }).last();
    await sourceForwardRow.locator('.message-menu summary').click();
    await sourceForwardRow.getByRole('button', { name: 'Forward', exact: true }).click();
    await pageA.locator('#forward-dialog').waitFor({ state: 'visible', timeout: 5000 });
    const cWrapIdsBeforeForward = new Set((await wsQuery(relay0.url, { kinds: [1059], '#p': [c.pubkey], limit: 1000 })).map(event => event.id));
    await pageA.locator(`#forward-list input[value="${c.pubkey}"]`).check();
    await pageA.locator('#forward-send').click();
    await pageA.locator('#forward-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    await openConversation(pageA, c.npub, 'C forwarding target');
    const senderForwardRow = pageA.locator('#messages .message-row').filter({ hasText: response }).last();
    await senderForwardRow.locator('.message-forwarded').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await senderForwardRow.locator('.message-forwarded').textContent()).trim(), 'Forwarded');
    assert.equal((await senderForwardRow.locator('.message-rich-block').last().textContent()).trim(), response,
      'forwarding keeps the message body unchanged rather than inserting an unauthenticated text prefix');
    const recipientForwardRow = pageC.locator('#messages .message-row').filter({ hasText: response }).last();
    await recipientForwardRow.locator('.message-forwarded').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal((await recipientForwardRow.locator('.message-forwarded').textContent()).trim(), 'Forwarded');
    assert.equal((await recipientForwardRow.locator('.message-rich-block').last().textContent()).trim(), response);
    await pageC.locator('#language-picker').selectOption('pt-BR');
    await pageC.waitForFunction(() => document.querySelector('.message-forwarded')?.textContent === 'Encaminhada');
    assert.equal((await recipientForwardRow.locator('.message-forwarded').textContent()).trim(), 'Encaminhada',
      'the recipient sees the forwarding badge in the selected app language');
    await recipientForwardRow.locator('.message-menu summary').click();
    assert.equal(await recipientForwardRow.getByRole('button', { name: 'Encaminhar', exact: true }).count(), 1,
      'the message action menu is localized with the selected app language');
    await recipientForwardRow.locator('.message-menu summary').click();
    const recipientViewport = pageC.viewportSize();
    await pageC.setViewportSize({ width: 390, height: 844 });
    await pageC.locator('#messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await pageC.screenshot({ path: path.join(options.output, 'g04-forwarded-message-mobile-pt-BR.png') });
    if (recipientViewport) await pageC.setViewportSize(recipientViewport);
    const recipientForwardRecord = await pageC.evaluate(async marker => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const rows = await new Promise((resolve, reject) => { const request = db.transaction('messages').objectStore('messages').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
      db.close(); const row = rows.find(item => item.text === marker); return row ? { forwarded: row.forwarded, text: row.text } : null;
    }, response);
    assert.deepEqual(recipientForwardRecord, { forwarded: 1, text: response }, 'the recipient decrypts the hop marker with the NIP-17 rumor');
    const cWrapsAfterForward = await wsQuery(relay0.url, { kinds: [1059], '#p': [c.pubkey], limit: 1000 });
    const newForwardWraps = cWrapsAfterForward.filter(event => !cWrapIdsBeforeForward.has(event.id));
    assert.equal(newForwardWraps.length, 1, 'one private gift wrap reaches the selected recipient');
    assert.ok(newForwardWraps.every(event => !JSON.stringify(event).includes(response) && !event.tags.some(tag => tag[0] === 'forwarded')),
      'the relay sees neither message text nor the encrypted inner forward marker');
    const forwardViewport = pageA.viewportSize();
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.locator('#messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await pageA.screenshot({ path: path.join(options.output, 'g04-forwarded-message-mobile-en.png') });
    if (forwardViewport) await pageA.setViewportSize(forwardViewport);
    report.forwarded_messages = { sender_and_recipient_show_marker: true, body_unchanged: true, recipient_hop_count: 1,
      original_author_not_exposed: true, relay_plaintext_leak: false, outer_forward_marker: false,
      languages: ['en', 'pt-BR'], mobile_screenshots: ['g04-forwarded-message-mobile-en.png', 'g04-forwarded-message-mobile-pt-BR.png'] };
    mark('G04-24', 'PASS', 'The forwarded NIP-17 message kept its body unchanged and showed a private “Forwarded” label to sender and recipient. The relay stored one encrypted gift wrap with neither plaintext nor the inner hop marker.');
    await openConversation(pageA, b.npub, 'B private');

    // G04-13: no relay configuration barrier on a fresh browser profile.
    stage = 'G04-13: automatic first-use relay selection';
    contextG = await runtime.playwright[options.engine].launchPersistentContext(path.join(temp, 'profile first-use relay suggestions'),
      { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(contextG, origin, report);
    const publicSocketStart = report.websockets.length;
    const defaultPage = await openApp(contextG, origin);
    await defaultPage.locator('#first-use-relays').waitFor({ state: 'visible', timeout: 5000 });
    const suggestedRelays = await defaultPage.locator('#first-use-relay-list code').allTextContents();
    const bundledCandidates = await defaultPage.evaluate(() => window.PropertyRelayDefaults.candidates);
    assert.equal(suggestedRelays.length, 2, 'fresh installs display two suggestions before identity creation');
    assert.equal(new Set(suggestedRelays).size, 2, 'suggested relays are distinct');
    assert.ok(suggestedRelays.every(url => bundledCandidates.includes(url)), 'every suggestion comes from the list bundled in Property');
    assert.equal(await defaultPage.locator('#create-account-button').isVisible(), true, 'identity creation is available without opening relay settings');
    const importButtonVisible = await defaultPage.locator('#import-account-button').isVisible();
    if (!importButtonVisible) {
      const importButtonState = await defaultPage.evaluate(() => {
        const button = document.querySelector('#import-account-button');
        const rect = button?.getBoundingClientRect();
        return {
          connected: Boolean(button?.isConnected),
          disabled: Boolean(button?.disabled),
          className: button?.className || '',
          display: button ? getComputedStyle(button).display : 'missing',
          visibility: button ? getComputedStyle(button).visibility : 'missing',
          size: rect ? { width: rect.width, height: rect.height } : null,
          authChoiceClass: document.querySelector('#auth-choice')?.className || 'missing',
          authScreenClass: document.querySelector('#auth-screen')?.className || 'missing',
          firstUsePanelClass: document.querySelector('#first-use-relays')?.className || 'missing'
        };
      });
      assert.fail(`identity import is unavailable without opening relay settings: ${JSON.stringify(importButtonState)}`);
    }
    const firstUseSettings = await defaultPage.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('liberdade-local-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction('settings').objectStore('settings').get('relays');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close(); return value;
    });
    assert.deepEqual(firstUseSettings?.values, suggestedRelays, 'the displayed random pair is persisted on this device');
    assert.equal(firstUseSettings?.autoSelected, true, 'the saved pair remains identified as an automatic suggestion');
    await defaultPage.evaluate(() => {
      window.__propertyFirstUseClick = false;
      document.addEventListener('click', event => {
        if (event.target?.closest?.('#first-use-open-relays')) window.__propertyFirstUseClick = true;
      }, true);
    });
    await defaultPage.locator('#first-use-open-relays').click();
    const relayDialogOpen = await defaultPage.locator('#relay-dialog').evaluate(dialog => dialog.open);
    assert.equal(relayDialogOpen, true, `opening optional relay settings failed: ${JSON.stringify(await defaultPage.evaluate(() => ({
      clickObserved: window.__propertyFirstUseClick,
      dialogOpen: document.querySelector('#relay-dialog')?.open,
      buttonDisabled: document.querySelector('#first-use-open-relays')?.disabled,
      buttonClass: document.querySelector('#first-use-open-relays')?.className,
      authChoiceClass: document.querySelector('#auth-choice')?.className,
      relayCount: document.querySelectorAll('#first-use-relay-list code').length
    })))}`);
    await defaultPage.locator('#relay-dialog').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal((await defaultPage.locator('#relay-input').inputValue()).trim().split('\n').length, 2,
      'the person can review and replace the pair but is never forced through the dialog');
    await defaultPage.locator('#relay-dialog button[aria-label="Close"]').click();
    assert.equal(await defaultPage.locator('#create-account-button').isVisible(), true, 'closing settings leaves the no-barrier start available');
    assert.deepEqual(report.websockets.slice(publicSocketStart), [], 'automatic relay suggestions do not connect before identity activation');
    report.first_use_relay_suggestions = { selected_count: suggestedRelays.length, distinct: true, from_bundled_candidates: true,
      persisted_locally: true, identity_creation_available_without_settings: true, no_relay_connections_before_identity: true };
    mark('G04-13', 'PASS', 'A fresh profile received two distinct bundled relay suggestions, saved them locally, and could create or import an identity without configuring relays. Settings remained optional and no relay connection started before identity activation.');

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
    stage = 'G04-04: relay restart'; relay0 = await startGeode(28470, temp, 'relay zero', relay0.binaryPath);
    await forceReconnect(pageA); await forceReconnect(pageB);
    stage = 'G04-04: client reconnection'; const afterReconnect = `property-g04-reconnect-${crypto.randomUUID()}`; await sendMessage(pageA, afterReconnect);
    await pageB.locator('#messages .message-bubble').filter({ hasText: afterReconnect }).waitFor({ state: 'visible', timeout: 15000 });

    stage = 'G04-04: false-ack relay setup'; falseAck = startFalseAckRelay(); await falseAck.ready;
    const falseAckUrl = `ws://127.0.0.1:${falseAck.server.address().port}`;
    stage = 'G04-04: publish false-ack destination'; await pageB.locator('#open-settings').click(); await pageB.locator('#dm-relay-input').fill(falseAckUrl); await pageB.locator('#save-relays').click();
    await pageB.locator('#relay-dialog').waitFor({ state: 'hidden' });
    await pageB.locator('#open-settings').click(); await pageB.locator('#dm-relay-input').fill(falseAckUrl);
    const publishInboxButton = pageB.locator('#publish-inbox-list');
    await publishInboxButton.waitFor({ state: 'visible' });
    assert.equal(await publishInboxButton.isEnabled(), true, 'the inbox-list publish control is ready after the relay input is filled');
    await publishInboxButton.click();
    await pageB.waitForFunction(() => /(?:The public NIP-17 inbox list was published|Sua lista pública de recebimento NIP-17 foi publicada)/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });
    if (await pageB.locator('#relay-dialog').isVisible()) await pageB.locator('#relay-dialog button[aria-label="Close"], #relay-dialog button[aria-label="Fechar"]').click();
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
    stage = 'G04-04: independent false-ack query'; const falseAckText = `property-g04-false-ack-${crypto.randomUUID()}`;
    const recipientEnvelopeWaiter = falseAck.waitForRecipientEnvelopeCount(1);
    await sendMessage(pageA, falseAckText);
    await pageA.waitForFunction(value => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(value)), falseAckText, { timeout: 10000 });
    await waitForMessageStatus(pageA, b.pubkey, falseAckText, 'sent');
    const falseIds = await recipientEnvelopeWaiter;
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
    stage = 'G04-05: open isolated D';
    contextD = await runtime.browser.newContext({ serviceWorkers: 'allow' }); instrument(contextD, origin, report); let pageD = await openApp(contextD, origin);
    await saveRelaysBeforeIdentity(pageD, [relay0.url]);
    stage = 'G04-05: create identity D';
    const d = await createIdentity(pageD); await configureRelays(pageD, [relay0.url], [], false);
    await openConversation(pageD, b.npub, 'B sem inbox');
    const beforeMissing = await wsQuery(relay0.url, { kinds: [1059], limit: 1000 });
    const noListText = `property-g04-no-kind10050-${crypto.randomUUID()}`;
    await pageD.locator('#message-input').fill(noListText); await pageD.locator('#send-form button[type="submit"]').click();
    await pageD.waitForFunction(() => /(?:Open relay settings, review the suggested inbox relays, and publish your public kind 10050 list before sending|Abra as configurações de relays, confira os relays de recebimento sugeridos e publique sua lista pública kind 10050 antes de enviar)/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
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
    await closeContext(contextD); contextD = null;

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
    mark('G04-06', 'PASS', 'The delivered corpus reconciled one-for-one in both browser databases and real relay storage; no plaintext, duplicate UI copy, third-party recipient or read receipt was observed.');

    // G04-09: local-only pin order, persistence across reload, and no sync or relay publication.
    stage = 'G04-09: local pin ordering and isolation';
    contextE = await runtime.browser.newContext({ serviceWorkers: 'allow' });
    instrument(contextE, origin, report);
    const pageE = await openApp(contextE, origin);
    const secretHex = await freshSecretHex(pageE);
    await saveRelaysBeforeIdentity(pageE, [relay0.url]);
    const owner = await importIdentity(pageE, secretHex);
    await openConversation(pageE, b.npub, 'G04 direct B');
    await openConversation(pageE, c.npub, 'G04 direct C');
    await openGroupConversation(pageE, 'G04 private group', [b.npub, c.npub]);
    const groupRecord = (await conversationRecords(pageE)).find(row => row.title === 'G04 private group');
    assert.ok(groupRecord?.pubkey.startsWith('group:'), 'the private group is present in the local conversation store');
    await createConversationFolder(pageE, 'G04 Pin Folder');
    await moveConversationToFolder(pageE, 'G04 direct B', 'G04 Pin Folder');
    await moveConversationToFolder(pageE, 'G04 direct C', 'G04 Pin Folder');
    await moveConversationToFolder(pageE, 'G04 private group', 'G04 Pin Folder');
    await setConversationTimes(pageE, {
      [b.pubkey]: 10,
      [c.pubkey]: 30,
      [groupRecord.pubkey]: 20
    });
    await pageE.reload({ waitUntil: 'domcontentloaded' });
    await pageE.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    const beforePin = await conversationNames(pageE);
    assert.deepEqual(beforePin, ['G04 direct C', 'G04 private group', 'G04 direct B'], 'baseline order follows fixed recent-activity values');
    const baselineEvents = (await wsQuery(relay0.url, { authors: [owner.pubkey], limit: 1000 })).map(event => event.id).sort();
    await setConversationPin(pageE, 'G04 direct B', 'Pin chat', true);
    await setConversationPin(pageE, 'G04 private group', 'Pin chat', true);
    const pinnedOrder = await conversationNames(pageE);
    assert.deepEqual(pinnedOrder, ['G04 private group', 'G04 direct B', 'G04 direct C'], 'pinned older chats precede a more recent unpinned chat; pinned rows remain recent-first');
    await setConversationPin(pageE, 'G04 private group', 'Unpin chat', false);
    const unpinnedOrder = await conversationNames(pageE);
    assert.deepEqual(unpinnedOrder, ['G04 direct B', 'G04 direct C', 'G04 private group'], 'the remaining pinned direct chat stays first; unpinned rows return to recent-first order');
    await pageE.reload({ waitUntil: 'domcontentloaded' });
    await pageE.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    assert.deepEqual(await conversationNames(pageE), unpinnedOrder, 'local pin state and sort order survive one reload');
    const afterReloadRecords = await conversationRecords(pageE);
    assert.equal(afterReloadRecords.find(row => row.pubkey === b.pubkey)?.pinned, true, 'direct chat remains pinned after reload');
    assert.equal(afterReloadRecords.find(row => row.pubkey === groupRecord.pubkey)?.pinned, false, 'un-pinned group remains unpinned after reload');

    await closeContext(contextE); contextE = null;
    contextF = await runtime.browser.newContext({ serviceWorkers: 'allow' }); instrument(contextF, origin, report);
    const pageF = await openApp(contextF, origin);
    await saveRelaysBeforeIdentity(pageF, [relay0.url]);
    const imported = await importIdentity(pageF, secretHex);
    assert.equal(imported.pubkey, owner.pubkey, 'the clean second profile imports the same test identity');
    await openConversation(pageF, b.npub, 'G04 direct B');
    await openConversation(pageF, c.npub, 'G04 direct C');
    await openGroupConversation(pageF, 'G04 private group', [b.npub, c.npub]);
    await createConversationFolder(pageF, 'G04 Pin Folder');
    await moveConversationToFolder(pageF, 'G04 direct B', 'G04 Pin Folder');
    await moveConversationToFolder(pageF, 'G04 direct C', 'G04 Pin Folder');
    await moveConversationToFolder(pageF, 'G04 private group', 'G04 Pin Folder');
    const cleanProfileRecords = await conversationRecords(pageF);
    assert.ok(cleanProfileRecords.filter(row => [b.pubkey, c.pubkey, groupRecord.pubkey].includes(row.pubkey)).every(row => row.pinned === false),
      'a clean profile has no synced local pin state for the same direct chats or group');
    const finalEvents = (await wsQuery(relay0.url, { authors: [owner.pubkey], limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(finalEvents, baselineEvents, 'pin and unpin actions published exactly zero relay events');
    report.local_pins = {
      fixed_activity_order: { before: beforePin, pinned: pinnedOrder, after_unpin: unpinnedOrder },
      survived_one_reload: true,
      second_profile_same_identity: true,
      second_profile_pins_synced: false,
      relay_event_ids_before: baselineEvents,
      relay_event_ids_after: finalEvents,
      relay_event_delta: 0
    };
    mark('G04-09', 'PASS', 'Direct and group chats pin locally in the existing list, retain order after reload, remain unpinned in a clean profile with the same identity, and produce zero relay events.');

    stage = 'G04-15: opt-in notifications and per-chat mute';
    const relayIdsBeforeNotificationSettings = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 0,
      'identity activation did not prompt for notification permission');
    await pageA.locator('#profile-button').click();
    await pageA.locator('#profile-notifications-toggle').waitFor({ state: 'visible' });
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 0,
      'opening profile settings did not prompt for notification permission');
    await pageA.locator('#profile-notifications-toggle').click();
    await pageA.waitForFunction(() => document.querySelector('#profile-notifications-toggle')?.textContent.includes('Turn off notifications'));
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 1,
      'one explicit click caused exactly one permission request');
    const globalNotificationSetting = await localRecord(pageA, 'settings', `property-notifications:${a.pubkey}`);
    assert.equal(globalNotificationSetting?.enabled, true, 'global opt-in is stored locally for this identity');
    const relayIdsAfterGlobalOptIn = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayIdsAfterGlobalOptIn, relayIdsBeforeNotificationSettings,
      'global opt-in publishes zero relay events');
    await pageA.locator('#profile-dialog').evaluate(dialog => dialog.close());
    await openConversation(pageB, a.npub, 'A privado');
    const visibleMessage = `property-g04-visible-notice-${crypto.randomUUID()}`;
    await sendMessage(pageB, visibleMessage);
    await pageA.locator('#messages .message-bubble').filter({ hasText: visibleMessage }).waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.displayed.length), 0,
      'an active visible conversation did not create a duplicate system notice');
    await pageA.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
    assert.equal(await pageA.evaluate(() => document.visibilityState), 'hidden', 'fixed hidden-page condition was applied');
    const hiddenMessage = `property-g04-hidden-notice-${crypto.randomUUID()}`;
    await sendMessage(pageB, hiddenMessage);
    await pageA.locator('#messages .message-bubble').filter({ hasText: hiddenMessage }).waitFor({ state: 'visible', timeout: 15000 });
    await pageA.waitForFunction(() => window.__propertyNotificationProbe.displayed.length === 1, null, { timeout: 15000 });
    const firstNotice = await pageA.evaluate(() => window.__propertyNotificationProbe.displayed[0]);
    assert.equal(firstNotice.title, 'Property');
    assert.equal(firstNotice.body, 'New message. Open Property to read it.');
    assert.equal(firstNotice.data, null, 'notice carries no peer key or message payload');
    assert.ok(!JSON.stringify(firstNotice).includes(hiddenMessage) && !JSON.stringify(firstNotice).includes(b.pubkey),
      'the system notice omits message text and the sender public key');

    const relayIdsBeforeChatMute = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    const peerRow = pageA.locator('.conversation-row').filter({ hasText: 'B privado' }).first();
    await peerRow.locator('summary').click();
    await peerRow.locator('button').filter({ hasText: 'Mute notifications' }).click();
    await pageA.locator('#notification-mute-dialog').waitFor({ state: 'visible' });
    await pageA.locator('[data-notification-mute-choice="15m"]').click();
    await peerRow.locator('.conversation-mute-indicator').waitFor({ state: 'visible' });
    const chatMute = await localRecord(pageA, 'settings', `property-notification-mute:${a.pubkey}:${b.pubkey}`);
    assert.ok(Number.isSafeInteger(chatMute?.until) && chatMute.until > Date.now(), 'fixed 15-minute mute is saved locally for this identity and chat');
    const relayIdsAfterChatMute = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayIdsAfterChatMute, relayIdsBeforeChatMute,
      'per-chat mute publishes zero relay events');
    const mutedMessage = `property-g04-muted-notice-${crypto.randomUUID()}`;
    await sendMessage(pageB, mutedMessage);
    await pageA.locator('#messages .message-bubble').filter({ hasText: mutedMessage }).waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.displayed.length), 1,
      'a muted conversation adds no extra system notice');
    const conversationAfterMute = await localRecord(pageA, 'conversations', b.pubkey);
    assert.equal(conversationAfterMute?.unreadCount, 2, 'two hidden inbound messages remain visible in local unread counts while muted');
    report.notification_checks = {
      permission_requests_before_explicit_tap: 0, permission_requests_after_tap: 1,
      identity_scoped_opt_in_saved_locally: true, visible_notice_count: 0, hidden_generic_notice_count: 1,
      notice_contains_message_or_sender: false, per_chat_mute_choice: '15m', muted_notice_count: 1,
      hidden_inbound_unread_count: conversationAfterMute.unreadCount, relay_event_delta_from_global_opt_in: 0, relay_event_delta_from_chat_mute: 0
    };
    mark('G04-15', 'PASS', 'Browser notification permission was requested only after a tap; a hidden-page notice contained no message or sender data; the visible chat produced no duplicate notice; a local 15-minute mute suppressed a third notice while unread counts remained, and settings published zero relay events.');

    stage = 'G04-16: optional local unread app badge';
    const relayIdsBeforeBadgeSettings = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(await pageA.evaluate(() => window.__propertyBadgeProbe.calls), [],
      'the badge API remains untouched until the person explicitly opts in');
    const unreadBeforeBadge = await localUnreadTotal(pageA);
    assert.ok(unreadBeforeBadge >= 2, 'the synthetic inbox has two hidden unread messages before enabling the badge');
    await pageA.locator('#profile-button').click();
    await pageA.locator('#profile-app-badge-toggle').waitFor({ state: 'visible' });
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 1,
      'opening the badge setting does not request notification permission');
    await mkdir(options.output, { recursive: true, mode: 0o700 });
    await pageA.screenshot({ path: path.join(options.output, 'g04-profile-app-badge.png') });
    await pageA.locator('#profile-app-badge-toggle').click();
    await pageA.waitForFunction(() => window.__propertyBadgeProbe.calls.length >= 1);
    const badgeSetting = await localRecord(pageA, 'settings', `property-app-badge:${a.pubkey}`);
    assert.equal(badgeSetting?.enabled, true, 'badge opt-in is stored locally for this identity');
    const badgeCallsAfterEnable = await pageA.evaluate(() => window.__propertyBadgeProbe.calls);
    assert.deepEqual(badgeCallsAfterEnable.at(-1), { type: 'set', count: unreadBeforeBadge },
      'badge equals the total local unread count across conversations');
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 1,
      'enabling the app icon badge never requests notification permission');
    await pageA.locator('#profile-dialog [aria-label="Close"]').click();
    const peerRowAfterBadge = pageA.locator('.conversation-row').filter({ hasText: 'B privado' }).first();
    await pageA.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }));
    await peerRowAfterBadge.locator('.conversation-item').click();
    await pageA.waitForFunction(async peer => {
      const request = indexedDB.open('liberdade-local-v1');
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const conversation = await new Promise((resolve, reject) => {
        const get = db.transaction('conversations').objectStore('conversations').get(peer);
        get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
      });
      db.close(); return conversation?.unreadCount === 0;
    }, b.pubkey);
    const unreadAfterOpeningChat = await localUnreadTotal(pageA);
    await pageA.waitForFunction(expected => {
      const last = window.__propertyBadgeProbe.calls.at(-1);
      return expected > 0 ? last?.type === 'set' && last.count === expected : last?.type === 'clear';
    }, unreadAfterOpeningChat);
    const badgeCallsAfterRead = await pageA.evaluate(() => window.__propertyBadgeProbe.calls);
    assert.notDeepEqual(badgeCallsAfterRead.at(-1), badgeCallsAfterEnable.at(-1),
      'opening the unread conversation updates or clears the app badge');
    const relayIdsAfterBadgeEnableAndRead = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayIdsAfterBadgeEnableAndRead, relayIdsBeforeBadgeSettings,
      'app badge preferences and unread reconciliation publish zero relay events');
    await pageA.locator('#profile-button').click();
    await pageA.locator('#profile-app-badge-toggle').click();
    await pageA.waitForFunction(() => window.__propertyBadgeProbe.calls.at(-1)?.type === 'clear');
    const disabledBadgeSetting = await localRecord(pageA, 'settings', `property-app-badge:${a.pubkey}`);
    assert.equal(disabledBadgeSetting?.enabled, false, 'the person can turn off and clear the icon badge');
    assert.equal(await pageA.evaluate(() => window.__propertyNotificationProbe.permissionRequests), 1,
      'badge toggles remain separate from browser notifications');
    report.badge_checks = {
      badge_calls_before_explicit_opt_in: 0,
      identity_scoped_opt_in_saved_locally: true,
      unread_before_enable: unreadBeforeBadge,
      unread_after_opening_chat: unreadAfterOpeningChat,
      badge_updated_after_read: true,
      disable_cleared_badge: true,
      notification_permission_requests: 1,
      relay_event_delta: 0
    };
    mark('G04-16', 'PASS', 'The app icon badge remained inactive before opt-in, then reflected the local aggregate unread count. Opening the unread conversation updated the count, disabling cleared it, the preference stayed in this identity, and none of these actions requested browser notification permission or published a relay event.');

    stage = 'G04-17: local message-day separators';
    const relayIdsBeforeDateSeparators = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    await pageA.locator('#profile-dialog [aria-label="Close"]').click();
    await pageA.evaluate(async ({ peer, nowParts, dayParts }) => {
      const now = new Date(...nowParts).getTime();
      const timestamps = dayParts.map(parts => new Date(...parts).getTime());
      Date.now = () => now;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('liberdade-local-v1');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('messages', 'readwrite');
        const store = transaction.objectStore('messages');
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (cursor.value.peer === peer) cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('messages', 'readwrite');
        const store = transaction.objectStore('messages');
        for (const [index, createdAt] of timestamps.entries()) store.put({
          id: `property-g04-day-${index}`, peer, text: `fixed-date-message-${index}`,
          createdAt, direction: 'received', status: 'delivered'
        });
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, {
      peer: b.pubkey,
      nowParts: [2026, 10, 5, 12, 0, 0],
      dayParts: [[2026, 10, 3, 9, 0, 0], [2026, 10, 4, 9, 0, 0], [2026, 10, 5, 9, 0, 0]]
    });
    await pageA.locator('.conversation-row').filter({ hasText: 'B privado' }).first().locator('.conversation-item').click();
    await pageA.waitForFunction(() => {
      const labels = [...document.querySelectorAll('#messages .message-day-divider time')].map(node => node.textContent.trim());
      return labels.includes('Today') && labels.includes('Yesterday') && labels.some(label => label.includes('November'));
    });
    const englishDayLabels = await pageA.locator('#messages .message-day-divider time').allTextContents();
    assert.equal(englishDayLabels.length, 3, 'a heading appears once for each of the three predefined local dates');
    assert.equal(englishDayLabels.at(-1), 'Today');
    assert.equal(englishDayLabels.at(-2), 'Yesterday');
    await pageA.screenshot({ path: path.join(options.output, 'g04-message-days-english.png') });
    await pageA.locator('#language-picker').selectOption('pt-BR');
    await pageA.waitForFunction(() => {
      const labels = [...document.querySelectorAll('#messages .message-day-divider time')].map(node => node.textContent.trim());
      return labels.includes('Hoje') && labels.includes('Ontem');
    });
    const portugueseDayLabels = await pageA.locator('#messages .message-day-divider time').allTextContents();
    assert.equal(portugueseDayLabels.length, 3, 'Portuguese date labels keep the same three local day groups');
    assert.equal(portugueseDayLabels.at(-1), 'Hoje');
    assert.equal(portugueseDayLabels.at(-2), 'Ontem');
    await pageA.screenshot({ path: path.join(options.output, 'g04-message-days-pt-BR.png') });
    const relayIdsAfterDateSeparators = (await wsQuery(relay0.url, { limit: 1000 })).map(event => event.id).sort();
    assert.deepEqual(relayIdsAfterDateSeparators, relayIdsBeforeDateSeparators,
      'local date grouping and language selection publish zero relay events');
    report.message_day_checks = {
      fixed_local_days: 3, english_labels: englishDayLabels, portuguese_labels: portugueseDayLabels,
      one_heading_per_day: true, relay_event_delta: 0, local_only: true
    };
    mark('G04-17', 'PASS', 'The existing chat shows one sticky date heading for each fixed local day, uses Today/Yesterday or Hoje/Ontem in the selected language, includes a full date for older messages, and does not alter message storage or publish relay events.');

    stage = 'G04-18: new-message jump count';
    await pageA.locator('#language-picker').selectOption('en');
    await pageA.evaluate(async peer => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('liberdade-local-v1');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('messages', 'readwrite');
        const store = transaction.objectStore('messages');
        for (let index = 0; index < 20; index++) store.put({
          id: 'property-g04-scroll-history-' + index,
          peer,
          text: 'Fixed old scroll-history fixture ' + (index + 1),
          createdAt: new Date(2026, 10, 5, 8, index, 0).getTime(),
          direction: 'received',
          status: 'delivered'
        });
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, b.pubkey);
    await pageA.locator('.conversation-row').filter({ hasText: 'B privado' }).first().locator('.conversation-item').click();
    await pageA.waitForFunction(() => document.querySelectorAll('#messages .message-row').length >= 23);
    await pageA.locator('#messages').evaluate(element => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await pageA.waitForFunction(() => {
      const button = document.querySelector('#message-scroll-bottom');
      return button && !button.hidden && button.getAttribute('aria-label') === 'Scroll to bottom';
    });
    const anchorBeforeNewMessages = await pageA.locator('#messages').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const row = [...element.querySelectorAll('.message-row')].find(candidate => candidate.getBoundingClientRect().bottom > bounds.top + 1);
      return row ? { id: row.dataset.messageId, top: row.getBoundingClientRect().top } : null;
    });
    assert.ok(anchorBeforeNewMessages?.id, 'scroll history exposes a visible anchor row');
    const scrollInboundOne = 'property-g04-scroll-inbound-one-' + crypto.randomUUID();
    await sendMessage(pageB, scrollInboundOne);
    await pageA.waitForFunction(text => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(text)), scrollInboundOne);
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-bottom')?.getAttribute('aria-label') === '1 new message, scroll to bottom');
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-status')?.textContent === '1 new message, scroll to bottom');
    const scrollInboundTwo = 'property-g04-scroll-inbound-two-' + crypto.randomUUID();
    await sendMessage(pageB, scrollInboundTwo);
    await pageA.waitForFunction(text => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(text)), scrollInboundTwo);
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-bottom')?.getAttribute('aria-label') === '2 new messages, scroll to bottom');
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-status')?.textContent === '2 new messages, scroll to bottom');
    const anchorAfterNewMessages = await pageA.locator('#messages').evaluate((element, id) => {
      const row = [...element.querySelectorAll('.message-row')].find(candidate => candidate.dataset.messageId === id);
      return row ? { id: row.dataset.messageId, top: row.getBoundingClientRect().top } : null;
    }, anchorBeforeNewMessages.id);
    assert.equal(anchorAfterNewMessages?.id, anchorBeforeNewMessages.id, 'incoming messages keep the same visible history anchor');
    assert.ok(Math.abs(anchorAfterNewMessages.top - anchorBeforeNewMessages.top) < 1, 'the anchored message does not move');
    await pageA.screenshot({ path: path.join(options.output, 'g04-message-scroll-english.png') });
    await pageA.locator('#language-picker').selectOption('pt-BR');
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-bottom')?.getAttribute('aria-label') === '2 mensagens novas, rolar para o fim');
    await pageA.waitForFunction(() => document.querySelector('#message-scroll-status')?.textContent === '2 mensagens novas, rolar para o fim');
    const anchorAfterLanguageChange = await pageA.locator('#messages').evaluate((element, id) => {
      const row = [...element.querySelectorAll('.message-row')].find(candidate => candidate.dataset.messageId === id);
      return row ? { id: row.dataset.messageId, top: row.getBoundingClientRect().top } : null;
    }, anchorBeforeNewMessages.id);
    assert.ok(anchorAfterLanguageChange && Math.abs(anchorAfterLanguageChange.top - anchorBeforeNewMessages.top) < 1,
      'language rerender preserves the reading anchor and does not recount existing messages');
    await pageA.screenshot({ path: path.join(options.output, 'g04-message-scroll-pt-BR.png') });
    await pageA.locator('#message-scroll-bottom').click();
    await pageA.waitForFunction(() => {
      const list = document.querySelector('#messages'), button = document.querySelector('#message-scroll-bottom');
      return list && button?.hidden && list.scrollHeight - list.scrollTop - list.clientHeight < 72;
    });
    const scrollInboundThree = 'property-g04-scroll-inbound-three-' + crypto.randomUUID();
    await sendMessage(pageB, scrollInboundThree);
    await pageA.waitForFunction(text => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(text)), scrollInboundThree);
    await pageA.waitForFunction(() => {
      const list = document.querySelector('#messages'), button = document.querySelector('#message-scroll-bottom');
      return list && button?.hidden && list.scrollHeight - list.scrollTop - list.clientHeight < 72;
    });
    await pageA.locator('#messages').evaluate(element => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const scrollOwnMessage = 'property-g04-scroll-own-' + crypto.randomUUID();
    await sendMessage(pageA, scrollOwnMessage);
    await pageA.waitForFunction(() => {
      const list = document.querySelector('#messages'), button = document.querySelector('#message-scroll-bottom');
      return list && button?.hidden && list.scrollHeight - list.scrollTop - list.clientHeight < 72;
    });
    await pageA.locator('#language-picker').selectOption('en');
    await pageA.waitForFunction(() => document.querySelector('#language-picker')?.value === 'en'
      && document.querySelector('#message-scroll-bottom')?.getAttribute('aria-label') === 'Scroll to bottom');
    report.message_scroll_checks = {
      fixed_old_history_rows: 20,
      fixed_inbound_messages_while_scrolled: 2,
      inbound_at_bottom: true,
      outgoing_message_returns_to_bottom: true,
      anchor_preserved: true,
      english_count_label: '2 new messages, scroll to bottom',
      portuguese_count_label: '2 mensagens novas, rolar para o fim',
      count_cleared_on_jump: true,
      relay_urls: [relay0.url]
    };
    mark('G04-18', 'PASS', 'When reading older messages, A keeps the visible anchor and counts two incoming messages in English and Portuguese. Returning to the bottom clears the count; a third incoming message stays at the bottom, and A’s own send returns to the bottom without being counted.');

    stage = 'G04-19: Ghostly-style empty conversation actions';
    await saveRelaysBeforeIdentity(defaultPage, [relay0.url]);
    const welcomeIdentity = await createIdentity(defaultPage);
    await defaultPage.locator('#empty-conversation').waitFor({ state: 'visible', timeout: 10000 });
    for (const id of ['empty-new-chat', 'empty-join-chat', 'empty-share-contact']) {
      assert.equal(await defaultPage.locator(`#${id}`).isVisible(), true, `${id} is available from the empty conversation screen`);
    }
    const englishWelcome = await defaultPage.locator('#empty-conversation').innerText();
    assert.match(englishWelcome, /Property selects relays automatically when none are saved/);
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-empty-actions-english.png') });
    await defaultPage.setViewportSize({ width: 390, height: 844 });
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-empty-actions-mobile.png') });
    await defaultPage.setViewportSize({ width: 1280, height: 720 });
    await defaultPage.locator('#language-picker').selectOption('pt-BR');
    await defaultPage.waitForFunction(() => document.querySelector('#empty-join-chat')?.textContent.trim() === 'Entrar com link de contato ou código'
      && document.querySelector('#empty-share-contact')?.textContent.trim() === 'Compartilhar meu contato');
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-empty-actions-pt-BR.png') });
    const relayEventsBeforeWelcomeActions = await wsQuery(relay0.url, { authors: [welcomeIdentity.pubkey], limit: 100 });
    await defaultPage.locator('#empty-share-contact').click();
    await defaultPage.locator('#contact-share-dialog').waitFor({ state: 'visible' });
    const sharePreview = await defaultPage.evaluate(() => ({
      link: document.querySelector('#contact-share-link')?.textContent || '',
      nprofile: document.querySelector('#contact-share-nprofile')?.textContent || '',
      qrCount: document.querySelectorAll('#contact-share-qr svg').length
    }));
    assert.ok(sharePreview.link.length > 20, 'sharing opens the existing Property contact URL');
    assert.match(sharePreview.nprofile, /^nprofile1/, 'sharing includes the public Nostr profile code');
    assert.equal(sharePreview.qrCount, 1, 'sharing renders the existing local QR code');
    await defaultPage.locator('#contact-share-dialog .dialog-head button').click();
    await defaultPage.locator('#contact-share-dialog').waitFor({ state: 'hidden' });
    await defaultPage.locator('#empty-join-chat').click();
    await defaultPage.locator('#new-chat-dialog').waitFor({ state: 'visible' });
    await defaultPage.waitForFunction(() => document.activeElement?.id === 'peer-input', null, { timeout: 5000 });
    await defaultPage.locator('#peer-input').fill(a.npub);
    await defaultPage.locator('#start-chat-button').click();
    await defaultPage.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    await defaultPage.locator('#conversation-pane').waitFor({ state: 'visible' });
    const relayEventsAfterWelcomeActions = await wsQuery(relay0.url, { authors: [welcomeIdentity.pubkey], limit: 100 });
    assert.deepEqual(relayEventsAfterWelcomeActions.map(event => event.id).sort(), relayEventsBeforeWelcomeActions.map(event => event.id).sort(),
      'sharing a contact and opening a conversation publish no relay events');
    report.ghostly_empty_state_actions = { fixed_actions: 3, english_and_pt_br: true, mobile_viewport: '390x844', contact_link_qr: true,
      contact_nprofile: true, join_dialog_focuses_public_key: true, relay_events_published: 0, relay_url: relay0.url };
    mark('G04-19', 'PASS', 'The signed-in empty state offers New conversation, Join with a contact link/code, and Share my contact in English and Portuguese. On mobile, the buttons fit the viewport. Sharing creates the existing public contact URL, nprofile, and local QR; joining focuses the public-key field and opens a local conversation. Neither action publishes a relay event.');

    stage = 'G04-20: NIP-39 GitHub identity claim and explicit proof check';
    await pageA.locator('#language-picker').selectOption('en');
    await pageA.locator('#profile-button').click();
    await pageA.locator('#profile-dialog').waitFor({ state: 'visible' });
    await pageA.evaluate(() => {
      window.__propertyClipboardWrites = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__propertyClipboardWrites.push(text) } });
    });
    const githubUsername = 'property-offline-proof';
    const gistId = '0123456789abcdef0123456789abcdef';
    const identityEventsBeforePublish = await wsQuery(relay0.url, { kinds: [10011], authors: [a.pubkey], limit: 20 });
    await pageA.locator('#profile-github-username').fill(githubUsername);
    await pageA.locator('#profile-github-gist').fill(gistId);
    await pageA.locator('#copy-github-proof-text').click();
    const copiedProof = await pageA.evaluate(() => window.__propertyClipboardWrites.at(-1));
    assert.equal(copiedProof, `Verifying that I control the following Nostr public key: ${a.npub}`, 'the copy action prepares the canonical public-key proof');
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.locator('#profile-nip39-heading').scrollIntoViewIfNeeded();
    await pageA.screenshot({ path: path.join(options.output, 'g04-nip39-profile-mobile-en.png') });
    await pageA.locator('#language-picker').selectOption('pt-BR');
    await pageA.waitForFunction(() => document.querySelector('#profile-nip39-heading')?.textContent.trim() === 'Identidade vinculada · NIP-39'
      && document.querySelector('#copy-github-proof-text')?.textContent.trim() === 'Copiar texto de verificação'
      && document.querySelector('#publish-github-identity')?.textContent.trim() === 'Publicar vínculo de identidade');
    await pageA.screenshot({ path: path.join(options.output, 'g04-nip39-profile-mobile-pt-BR.png') });
    await pageA.locator('#language-picker').selectOption('en');
    await pageA.locator('#publish-github-identity').click();
    await pageA.waitForFunction(() => document.querySelector('#profile-nip39-status')?.textContent.includes('Signed GitHub identity link published.'), null, { timeout: 10000 });
    const identityEventsAfterPublish = await wsQuery(relay0.url, { kinds: [10011], authors: [a.pubkey], limit: 20 });
    const publishedIdentityEvents = identityEventsAfterPublish.filter(event => !identityEventsBeforePublish.some(before => before.id === event.id));
    assert.equal(publishedIdentityEvents.length, 1, 'publishing an identity link creates exactly one kind 10011 event');
    const identityEvent = publishedIdentityEvents[0];
    assert.equal(identityEvent.kind, 10011);
    assert.equal(identityEvent.pubkey, a.pubkey);
    assert.deepEqual(identityEvent.tags.filter(tag => tag[0] === 'i').map(tag => tag.slice(1, 3)), [[`github:${githubUsername}`, gistId]]);
    await pageA.locator('#profile-dialog button[aria-label="Close"]').click();
    await pageA.locator('#profile-dialog').waitFor({ state: 'hidden' });

    await defaultPage.locator('#language-picker').selectOption('en');
    await defaultPage.evaluate(npub => {
      window.__propertyIdentityProofFetches = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, options = {}) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (!url.startsWith('https://api.github.com/gists/')) return originalFetch(input, options);
        window.__propertyIdentityProofFetches.push({
          url, method: options.method, mode: options.mode, credentials: options.credentials,
          cache: options.cache, redirect: options.redirect, referrerPolicy: options.referrerPolicy,
          accept: options.headers?.Accept
        });
        const body = { public: true, owner: { login: 'property-offline-proof' }, files: { 'nostr.txt': { content: `Verifying that I control the following Nostr public key: ${npub}` } } };
        const text = JSON.stringify(body);
        return new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(text.length) } });
      };
    }, a.npub);
    await defaultPage.locator('#chat-details-button').click();
    await defaultPage.locator('#chat-details-dialog').waitFor({ state: 'visible' });
    await defaultPage.locator('#load-chat-public-profile').click();
    await defaultPage.locator('#chat-nip39-section').waitFor({ state: 'visible', timeout: 10000 });
    await defaultPage.locator('#chat-nip39-list .identity-proof-entry button').waitFor({ state: 'visible' });
    assert.match(await defaultPage.locator('#chat-nip39-list .identity-proof-entry [role="status"]').textContent(), /Signed claim · not verified/i, 'the contact sees an unchecked signed claim');
    assert.equal(await defaultPage.evaluate(() => window.__propertyIdentityProofFetches.length), 0, 'loading the signed claim does not contact GitHub');
    await defaultPage.setViewportSize({ width: 390, height: 844 });
    await defaultPage.locator('#chat-nip39-section').scrollIntoViewIfNeeded();
    await defaultPage.locator('#language-picker').selectOption('pt-BR');
    await defaultPage.waitForFunction(() => document.querySelector('#chat-nip39-heading')?.textContent.trim() === 'Identidades vinculadas · NIP-39'
      && document.querySelector('#chat-nip39-list .identity-proof-entry button')?.textContent.trim() === 'Verificar no GitHub');
    assert.match(await defaultPage.locator('#chat-nip39-list .identity-proof-entry [role="status"]').textContent(), /Declaração assinada · não verificada/i, 'contact claim status is translated to Portuguese');
    assert.match(await defaultPage.locator('#chat-profile-status').textContent(), /Nenhum perfil assinado kind 0 foi encontrado/i, 'the missing-profile status is translated after changing language');
    assert.match(await defaultPage.locator('#chat-nip39-section > .fine-print').last().textContent(), /Uma declaração Nostr assinada vincula este perfil/i, 'the identity-proof privacy explanation is translated');
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-nip39-contact-unverified-mobile-pt-BR.png') });
    await defaultPage.locator('#language-picker').selectOption('en');
    await defaultPage.locator('#chat-nip39-section').scrollIntoViewIfNeeded();
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-nip39-contact-unverified-mobile-en.png') });
    const relayEventsBeforeProofCheck = (await wsQuery(relay0.url, { authors: [a.pubkey], limit: 100 })).map(event => event.id).sort();
    await defaultPage.locator('#chat-nip39-list .identity-proof-entry button').click();
    await defaultPage.waitForFunction(() => document.querySelector('#chat-nip39-list .identity-proof-entry [role="status"]')?.textContent.startsWith('Verified:'), null, { timeout: 5000 });
    const proofFetches = await defaultPage.evaluate(() => window.__propertyIdentityProofFetches);
    assert.equal(proofFetches.length, 1, 'GitHub is contacted only after the explicit Verify click');
    assert.deepEqual(proofFetches[0], {
      url: `https://api.github.com/gists/${gistId}`, method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer', accept: 'application/vnd.github+json'
    });
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-nip39-contact-verified-mobile-en.png') });
    await defaultPage.locator('#language-picker').selectOption('pt-BR');
    await defaultPage.waitForFunction(() => document.querySelector('#chat-nip39-list .identity-proof-entry [role="status"]')?.textContent.startsWith('Verificado:'));
    await defaultPage.screenshot({ path: path.join(options.output, 'g04-nip39-contact-verified-mobile-pt-BR.png') });
    await defaultPage.locator('#language-picker').selectOption('en');
    const relayEventsAfterProofCheck = (await wsQuery(relay0.url, { authors: [a.pubkey], limit: 100 })).map(event => event.id).sort();
    assert.deepEqual(relayEventsAfterProofCheck, relayEventsBeforeProofCheck, 'checking a proof publishes no relay event');
    report.nip39_identity_proof = { signed_kind_10011_published: true, proof_text_copied: true, contact_claim_loaded_without_github_request: true,
      explicit_verify_click_made_one_mocked_request: true, request_credentials_omitted: true, verified_result_rendered: true,
      relay_events_published_by_verification: 0, external_network_requests: 0 };
    mark('G04-20', 'PASS', 'A person copied the canonical verification text and explicitly published one signed kind 10011 GitHub claim. A contact loaded the signed claim without contacting GitHub; only tapping Verify made one mocked, credential-free request, rendered the matching proof as verified, and published no relay event.');

    stage = 'G04-21: consented encrypted link preview';
    await pageA.setViewportSize({ width: 1280, height: 800 });
    await openConversation(pageA, c.npub, 'C preview');
    await openConversation(pageC, a.npub, 'A preview');
    await pageA.locator('#language-picker').selectOption('en');
    assert.equal(await pageA.locator('#messages').getAttribute('data-peer'), c.pubkey, 'the direct test conversation with C is active');
    const previewUrl = 'https://preview.example.test/story?id=4';
    const previewTitle = 'A local fixture title';
    await pageA.evaluate(() => {
      window.__propertyPreviewFetches = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, options = {}) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (!url.startsWith('https://preview.example.test/')) return originalFetch(input, options);
        window.__propertyPreviewFetches.push({ url, method: options.method, mode: options.mode, credentials: options.credentials,
          cache: options.cache, redirect: options.redirect, referrerPolicy: options.referrerPolicy, accept: options.headers?.Accept });
        const body = '<html><head><meta property="og:title" content="A local fixture title"><meta property="og:description" content="Fixture description"><meta property="og:site_name" content="Fixture News"></head><body><img src="https://tracker.example.test/pixel"></body></html>';
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(body.length) } });
      };
    });
    await pageC.evaluate(() => {
      window.__propertyPreviewReceiveFetches = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, options) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (url.startsWith('https://preview.example.test/')) window.__propertyPreviewReceiveFetches.push(url);
        return originalFetch(input, options);
      };
    });
    const previewText = `Read this story: ${previewUrl}`;
    await pageA.locator('#message-input').fill(previewText);
    assert.equal(await pageA.evaluate(() => window.__propertyPreviewFetches.length), 0, 'typing a URL does not fetch it');
    await pageA.locator('#link-preview-button').click();
    await pageA.locator('#link-preview-consent-dialog').waitFor({ state: 'visible' });
    assert.equal((await pageA.locator('#link-preview-consent-url').textContent()).trim(), previewUrl, 'the exact destination is shown before consent');
    await pageA.locator('#link-preview-consent-cancel').click();
    assert.equal(await pageA.evaluate(() => window.__propertyPreviewFetches.length), 0, 'canceling consent makes no request');
    await pageA.locator('#link-preview-button').click();
    await pageA.locator('#link-preview-consent-fetch').click();
    await pageA.locator('#link-preview-draft .link-preview-title').filter({ hasText: previewTitle }).waitFor({ state: 'visible', timeout: 5000 });
    const previewRequests = await pageA.evaluate(() => window.__propertyPreviewFetches);
    assert.deepEqual(previewRequests, [{ url: previewUrl, method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', accept: 'text/html' }]);
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.locator('#language-picker').selectOption('pt-BR');
    await pageA.waitForFunction(() => document.querySelector('#link-preview-draft .link-preview-source')?.textContent.includes('fornecida por quem enviou'));
    await pageA.screenshot({ path: path.join(options.output, 'g04-link-preview-composer-mobile-pt-BR.png') });
    await pageA.locator('#language-picker').selectOption('en');
    const previewEnvelopeIdsBefore = new Set((await wsQuery(relay0.url, { kinds: [1059], limit: 1000 })).map(event => event.id));
    await pageA.locator('#send-form button[type="submit"]').click();
    if (await pageA.locator('#secret-guard-dialog').isVisible()) await pageA.locator('#secret-guard-send-anyway').click();
    await pageA.locator('#messages .message-bubble').filter({ hasText: previewText }).waitFor({ state: 'visible', timeout: 10000 }).catch(async error => {
      const diagnostics = await pageA.evaluate(() => ({
        peer: document.querySelector('#messages')?.dataset.peer || '', input: document.querySelector('#message-input')?.value || '',
        sendDisabled: document.querySelector('#send-form button[type="submit"]')?.disabled ?? null,
        secretDialogOpen: document.querySelector('#secret-guard-dialog')?.open ?? null,
        toast: document.querySelector('#toast')?.textContent?.trim() || '',
        previewFetches: window.__propertyPreviewFetches || [],
        activeDialogs: [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id)
      }));
      report.failure_checks.link_preview_send = diagnostics;
      throw new Error(`Sender did not save the preview message: ${JSON.stringify(diagnostics)}; ${error.message}`);
    });
    await pageC.locator('#messages .message-bubble').filter({ hasText: previewText }).waitFor({ state: 'visible', timeout: 15000 });
    await pageC.locator('#messages .link-preview-title').filter({ hasText: previewTitle }).waitFor({ state: 'visible', timeout: 5000 });
    await pageC.locator('#language-picker').selectOption('pt-BR');
    await pageC.waitForFunction(() => document.querySelector('#messages .link-preview-source')?.textContent.includes('fornecida por quem enviou'));
    assert.equal(await pageC.evaluate(() => window.__propertyPreviewReceiveFetches.length), 0, 'receiving and rendering the encrypted preview never fetches the destination');
    const expectedPreview = { v: 1, url: previewUrl, title: previewTitle, description: 'Fixture description', site: 'Fixture News' };
    assert.deepEqual(await localMessagePreview(pageA, c.pubkey, previewText), expectedPreview, 'sender stored the confirmed preview with the local message');
    assert.deepEqual(await localMessagePreview(pageC, a.pubkey, previewText), expectedPreview, 'recipient recovered the preview metadata from the decrypted NIP-17 rumor');
    const encryptedPreviewEnvelopes = await wsQuery(relay0.url, { kinds: [1059], limit: 1000 });
    const previewEnvelopes = encryptedPreviewEnvelopes.filter(event => !previewEnvelopeIdsBefore.has(event.id)
      && Array.isArray(event.tags) && event.tags.some(tag => tag[0] === 'p' && tag[1] === c.pubkey));
    assert.equal(previewEnvelopes.length, 1, 'the local relay stored exactly one new gift-wrap envelope for the recipient');
    const publicEnvelopeText = JSON.stringify(previewEnvelopes);
    assert.equal(publicEnvelopeText.includes(previewUrl), false, 'the relay cannot read the link from the encrypted wrapper');
    assert.equal(publicEnvelopeText.includes(previewTitle), false, 'the relay cannot read the preview title from the encrypted wrapper');
    assert.equal(publicEnvelopeText.includes('property-link-preview-v1'), false, 'the custom preview tag is not exposed to the relay');
    await pageC.locator('#language-picker').selectOption('en');
    report.link_preview = { fixed_count: 1, fetch_requires_explicit_consent: true, canceled_consent_requests: 0, request_credentials_omitted: true,
      referrer_omitted: true, redirects_rejected: true, recipient_fetches: 0, metadata_in_encrypted_nip17_rumor: true,
      relay_plaintext_exposure: false, english_and_pt_br: true, remote_images_loaded: false };
    mark('G04-21', 'PASS', 'Typing a link and canceling consent made zero requests. One explicit confirmation made exactly one mocked HTTPS metadata request without credentials/referrer or redirects. The sender attached one text-only preview tag to the NIP-17 rumor; the recipient rendered it in both languages without fetching the page, and the loopback relay saw no preview URL, title, or custom tag in its encrypted wrapper.');

    assert.deepEqual(report.external_requests, [], 'all browser HTTP requests stayed on the local origin');
    const browserRuntimeAttempts = proxy.attempts.filter(attempt => attempt.destination === 'aus5.mozilla.org:443');
    const unexpectedProxyAttempts = proxy.attempts.filter(attempt => attempt.destination !== 'aus5.mozilla.org:443');
    assert.deepEqual(unexpectedProxyAttempts, [], 'the proxy rejected every destination other than the blocked Firefox runtime endpoint');
    assert.deepEqual(report.page_errors, [], 'no page runtime errors');
    assert.ok(report.websockets.every(url => /^ws:\/\/127\.0\.0\.1:/.test(url)), 'browser WebSockets are loopback only');
    report.browser_runtime_attempts_blocked = browserRuntimeAttempts;
    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    report.denied_proxy_attempts = [...proxy.attempts];
    await writeReport(path.resolve(options.output), report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const current = report.cases.find(row => row.status === 'NOT_RUN');
    if (current) Object.assign(current, { status: /module|executable|version mismatch|ENOENT|permission|launch/i.test(error.message) ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) });
    for (const row of report.cases) if (row.status === 'NOT_RUN') Object.assign(row, { status: 'BLOCKED', reason: 'A prior G04 case failed; dependent end-to-end flow was not started.' });
    report.result = report.cases.some(row => row.status === 'FAIL') ? 'FAIL' : 'BLOCKED'; report.error = safeText(error.message || error); report.error_stack = safeDiagnostic(error.stack || ''); report.current_stage = stage;
    report.denied_proxy_attempts = [...(proxy?.attempts || [])];
    await new Promise(resolve => setTimeout(resolve, 250));
    report.relay_process_output = [relay0, relay1].filter(Boolean).map(relay => ({ pid: relay.child?.pid || null, tail: safeDiagnostic(relay.diagnostic?.() || '') }));
    if (falseAck) report.failure_checks.false_ack_fixture = { ...falseAck.diagnostics, event_ids: [...falseAck.events], websocket_url_observed: report.websockets.includes(`ws://127.0.0.1:${falseAck.server.address()?.port}/`) };
    try { await writeReport(path.resolve(options?.output || path.join(temp, 'report')), report); }
    catch (writeError) { process.stderr.write(`REPORT_WRITE_FAILED: ${safeText(writeError.message || writeError)}\n`); }
    process.stderr.write(`${report.result}: ${report.error}\n`); return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await closeContext(contextG); await closeContext(contextF); await closeContext(contextE); await closeContext(contextD); await closeContext(contextC); await closeContext(contextB); await closeContext(contextA);
    await runtime?.browser?.close().catch(() => {});
    await stopGeode(relay1); await stopGeode(relay0);
    for (const server of [falseAck?.server, app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
