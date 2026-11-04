#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectNativeNetworkIsolation } from './native-network-isolation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const WEB = path.join(ROOT, 'property/web');
const APPIUM = (process.env.PROPERTY_APPIUM_URL || 'http://127.0.0.1:4723').replace(/\/$/, '');
const PASSWORD = 'Property-platform-offline-2026!';
const DEFAULT_CASE = process.env.PROPERTY_PLATFORM_CASE || '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const redact = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/(?:Users|home)\/[^/\s]+/g, '/<USER>')
  .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, '<USER>')
  .replaceAll(PASSWORD, '[REDACTED_TEST_PASSWORD]').slice(-2500);

function parseArgs(argv) {
  const options = { caseId: DEFAULT_CASE, output: '', preflight: false, warmup: false };
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (item === '--preflight') { options.preflight = true; continue; }
    if (item === '--warmup') { options.warmup = true; continue; }
    if (!['--case', '--output'].includes(item) || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${item}`);
    const value = argv[++index];
    if (item === '--case') options.caseId = value;
    else options.output = value;
  }
  assert.equal(options.preflight && options.warmup, false, '--preflight and --warmup are separate stages');
  assert.match(options.caseId, /^G12-0[2-5]$/, '--case must be G12-02 through G12-05');
  assert.ok(options.output, '--output is required');
  return options;
}

function browserSpecs(caseId) {
  if (caseId === 'G12-02') return [
    { name: 'Edge', platformName: 'windows', browserName: 'MicrosoftEdge', automationName: 'Chromium', mobile: false },
    { name: 'Chrome', platformName: 'windows', browserName: 'chrome', automationName: 'Chromium', mobile: false }
  ];
  if (caseId === 'G12-03') return [
    { name: 'Safari', platformName: 'mac', browserName: 'safari', automationName: 'Safari', mobile: false },
    { name: 'Chrome', platformName: 'mac', browserName: 'chrome', automationName: 'Chromium', mobile: false }
  ];
  if (caseId === 'G12-04') return [
    { name: 'Chrome Android', platformName: 'Android', browserName: 'Chrome', automationName: 'UiAutomator2', mobile: true,
      appId: 'com.android.chrome' }
  ];
  return [
    { name: 'Safari iOS Simulator', platformName: 'iOS', browserName: 'Safari', automationName: 'XCUITest', mobile: true,
      appId: 'com.apple.mobilesafari' }
  ];
}

function startAppServer() {
  const mime = new Map([
    ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json'], ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json'],
    ['.png', 'image/png'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2']
  ]);
  const requested = [];
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') return response.writeHead(405).end();
      const url = new URL(request.url, 'http://127.0.0.1');
      let relative = url.pathname === '/' || url.pathname === '/property' || url.pathname === '/property/' ? 'index.html' :
        url.pathname.startsWith('/property/') ? url.pathname.slice('/property/'.length) : url.pathname.replace(/^\/+/, '');
      relative = decodeURIComponent(relative);
      const target = path.resolve(WEB, relative);
      if (target !== WEB && !target.startsWith(WEB + path.sep)) return response.writeHead(403).end();
      const info = await stat(target);
      if (!info.isFile()) return response.writeHead(404).end();
      requested.push(url.pathname);
      response.writeHead(200, { 'content-type': mime.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(target));
    } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); }
  });
  return { server, requested, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

class WebDriver {
  constructor(spec, { allowDriverDownloads = false } = {}) {
    this.spec = spec; this.allowDriverDownloads = allowDriverDownloads; this.sessionId = null; this.capabilities = null;
  }
  async request(method, route, body) {
    const response = await fetch(`${APPIUM}${route}`, { method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const raw = await response.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error(`Appium returned non-JSON ${method} ${route}: ${redact(raw)}`); }
    const value = parsed.value ?? parsed;
    if (!response.ok || value?.error) throw new Error(`WebDriver ${method} ${route}: ${redact(value?.message || raw)}`);
    return value;
  }
  async create() {
    const alwaysMatch = { platformName: this.spec.platformName, browserName: this.spec.browserName,
      'appium:automationName': this.spec.automationName, 'appium:newCommandTimeout': 1200,
      'appium:noReset': true, 'appium:showXcodeLog': false };
    if (process.env.PROPERTY_BLOCK_EGRESS_PROXY) {
      const proxy = new URL(process.env.PROPERTY_BLOCK_EGRESS_PROXY);
      const endpoint = `${proxy.hostname}:${proxy.port}`;
      alwaysMatch.proxy = { proxyType: 'manual', httpProxy: endpoint, sslProxy: endpoint,
        noProxy: ['localhost', '127.0.0.1', '::1'] };
    }
    if (this.spec.mobile && process.env.PROPERTY_DEVICE_UDID) alwaysMatch['appium:udid'] = process.env.PROPERTY_DEVICE_UDID;
    if (process.env.PROPERTY_DEVICE_NAME) alwaysMatch['appium:deviceName'] = process.env.PROPERTY_DEVICE_NAME;
    if (process.env.PROPERTY_PLATFORM_VERSION) alwaysMatch['appium:platformVersion'] = process.env.PROPERTY_PLATFORM_VERSION;
    if (['Chromium', 'UiAutomator2'].includes(this.spec.automationName)) {
      alwaysMatch['appium:chromedriverAutodownload'] = this.allowDriverDownloads;
    }
    if (this.spec.automationName === 'UiAutomator2') {
      alwaysMatch['appium:avdLaunchTimeout'] = 180000;
      alwaysMatch['appium:skipDeviceInitialization'] = false;
    }
    const value = await this.request('POST', '/session', { capabilities: { alwaysMatch, firstMatch: [{}] } });
    this.sessionId = value.sessionId || value.value?.sessionId;
    this.capabilities = value.capabilities || value.value?.capabilities || {};
    assert.ok(this.sessionId, `Appium did not return a session id for ${this.spec.name}`);
    return this;
  }
  route(pathname) { return `/session/${encodeURIComponent(this.sessionId)}${pathname}`; }
  async go(url) { await this.request('POST', this.route('/url'), { url }); }
  async refresh() { await this.request('POST', this.route('/refresh'), {}); }
  async find(selector) {
    const result = await this.request('POST', this.route('/element'), { using: 'css selector', value: selector });
    return result['element-6066-11e4-a52e-4f735466cecf'] || result.ELEMENT;
  }
  async waitFor(selector, attempts = 160) {
    for (let index = 0; index < attempts; index++) {
      try {
        const id = await this.find(selector);
        const visible = await this.request('GET', this.route(`/element/${encodeURIComponent(id)}/displayed`));
        if (visible === true) return id;
      } catch {}
      await sleep(200);
    }
    throw new Error(`Selector not visible after ${attempts} fixed probes: ${selector}`);
  }
  async click(selector) {
    const id = await this.waitFor(selector);
    await this.request('POST', this.route(`/element/${encodeURIComponent(id)}/click`), {});
  }
  async fill(selector, value) {
    const id = await this.waitFor(selector);
    await this.request('POST', this.route(`/element/${encodeURIComponent(id)}/clear`), {});
    await this.request('POST', this.route(`/element/${encodeURIComponent(id)}/value`), { text: value, value: [...value] });
  }
  async text(selector) {
    const id = await this.waitFor(selector);
    return String(await this.request('GET', this.route(`/element/${encodeURIComponent(id)}/text`)) || '').trim();
  }
  async execute(script, args = []) { return await this.request('POST', this.route('/execute/sync'), { script, args }); }
  async executeAsync(script, args = []) { return await this.request('POST', this.route('/execute/async'), { script, args }); }
  async evaluate(expression) { return await this.execute(`return (${expression});`); }
  async waitUntil(expression, attempts = 160) {
    for (let index = 0; index < attempts; index++) {
      try { if (await this.evaluate(expression)) return index + 1; } catch {}
      await sleep(200);
    }
    throw new Error(`Browser condition did not become true after ${attempts} fixed probes.`);
  }
  async waitToast(expression) {
    return await this.waitUntil(`(${expression})`);
  }
  async delete() {
    if (!this.sessionId) return;
    await this.request('DELETE', this.route(''), {}).catch(() => {});
    this.sessionId = null;
  }
}

async function waitAppium(proc, attempts = 120) {
  for (let index = 0; index < attempts; index++) {
    if (proc.exitCode !== null) throw new Error(`Appium exited before readiness (code ${proc.exitCode}).`);
    try {
      const response = await fetch(`${APPIUM}/status`);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Appium server did not become ready after fixed probes.');
}

async function startAppium(outputDir) {
  const appiumEntry = path.join(HERE, 'node_modules', 'appium', 'index.js');
  await access(appiumEntry);
  const appiumHome = process.env.APPIUM_HOME;
  assert.ok(appiumHome, 'APPIUM_HOME must point to the preinstalled, pinned driver set');
  const appiumLog = path.join(outputDir, 'appium-server.log');
  const proc = spawn(process.execPath, [appiumEntry, '--address', '127.0.0.1', '--port', String(new URL(APPIUM).port || 4723),
    '--base-path', '/', '--log', appiumLog, '--log-level', 'warn'], {
    cwd: ROOT, env: { ...process.env, APPIUM_HOME: appiumHome }, stdio: 'ignore', windowsHide: true
  });
  try {
    await waitAppium(proc);
    return { proc, appiumLog };
  } catch (error) {
    await stopChild(proc);
    throw error;
  }
}

function startDenyProxy() {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, host: String(request.headers.host || '').slice(0, 120) });
    response.writeHead(403, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('Property offline test: external egress denied.');
  });
  server.on('connect', (request, socket) => {
    requests.push({ method: 'CONNECT', host: String(request.url || '').slice(0, 120) });
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, requests, ready };
}

async function relayReady(port, attempts = 80) {
  for (let index = 0; index < attempts; index++) {
    const connected = await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.setTimeout(300, () => { socket.destroy(); resolve(false); });
    });
    if (connected) return index + 1;
    await sleep(100);
  }
  throw new Error(`Bundled Property relay did not open port ${port} after fixed probes.`);
}

async function forwardToAndroid(port) {
  const udid = process.env.PROPERTY_DEVICE_UDID;
  const args = [...(udid ? ['-s', udid] : []), 'reverse', `tcp:${port}`, `tcp:${port}`];
  const result = await runChild(process.env.ADB || 'adb', args);
  assert.equal(result.code, 0, `adb reverse failed for local port ${port}: ${result.stderr || result.stdout}`);
  return { port, status: 'PASS' };
}

async function isolateAndroidGuest(hostNetworkIsolation) {
  const udid = process.env.PROPERTY_DEVICE_UDID;
  assert.ok(udid, 'Android platform test requires the exact emulator/device UDID');
  const adb = process.env.ADB || 'adb';
  assert.equal(hostNetworkIsolation?.result, 'PASS', 'Android guest isolation requires proven host egress blocking');
  let available = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await runChild(adb, ['-s', udid, 'get-state']);
    if (state.code === 0 && state.stdout.trim() === 'device') { available = true; break; }
    await sleep(250);
  }
  assert.equal(available, true, 'Android emulator did not become available over ADB');
  const qemu = await runChild(adb, ['-s', udid, 'shell', 'getprop', 'ro.kernel.qemu']);
  assert.equal(qemu.code, 0, `Cannot verify Android emulator transport: ${qemu.stderr || qemu.stdout}`);
  assert.equal(qemu.stdout.trim(), '1', 'G12-04 must use the isolated Android emulator, not a physical device');
  for (const service of ['wifi', 'data']) {
    const disabled = await runChild(adb, ['-s', udid, 'shell', 'svc', service, 'disable']);
    assert.equal(disabled.code, 0, `Android ${service} radio could not be disabled: ${disabled.stderr || disabled.stdout}`);
  }
  const wifiStatus = await runChild(adb, ['-s', udid, 'shell', 'cmd', 'wifi', 'status']);
  assert.equal(wifiStatus.code, 0, `Cannot verify Android Wi-Fi state: ${wifiStatus.stderr || wifiStatus.stdout}`);
  assert.match(wifiStatus.stdout, /wifi is disabled/i, 'Android Wi-Fi remained enabled after the disable command');
  const routes = await runChild(adb, ['-s', udid, 'shell', 'ip', 'route', 'show', 'default']);
  assert.equal(routes.code, 0, `Cannot record Android emulator default routes: ${routes.stderr}`);
  return { verdict: 'PASS', transport: 'Android emulator ADB', emulator_verified: true,
    wifi_disabled: true, mobile_data_disabled: true, wifi_status: wifiStatus.stdout.trim().slice(0, 500),
    host_public_egress_blocked: true, guest_default_routes_observed: routes.stdout.trim().split(/\r?\n/).filter(Boolean) };
}

function relayCommand() {
  const script = process.platform === 'win32' ? path.join(ROOT, 'property/relay/start.ps1') : path.join(ROOT, 'property/relay/start-macos.sh');
  if (process.platform === 'win32') return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-File', script] };
  return { command: 'bash', args: [script] };
}

function startRelay(port, tempDir, logPath) {
  const invocation = relayCommand();
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: String(port),
    PROPERTY_RELAY_DATA_DIR: path.join(tempDir, 'dados persistentes'), PROPERTY_RELAY_CONFIG_DIR: path.join(tempDir, 'config privada') };
  if (process.platform !== 'win32') { env.JAVA_HOME = ''; env.PATH = process.env.PATH || ''; }
  const output = (chunk, fd) => appendFileSync(logPath, `[${fd}] ${chunk.toString()}`);
  const child = spawn(invocation.command, invocation.args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', chunk => output(chunk, 'out'));
  child.stderr.on('data', chunk => output(chunk, 'err'));
  return child;
}

function runChild(command, args, cwd = ROOT, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout: redact(stdout), stderr: redact(stderr) }));
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await runChild('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']).catch(() => {});
    return;
  }
  child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 3000);
    child.once('close', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function nativeRelayCheck(report, tempDir) {
  const result = await runChild(process.execPath, ['property/tests/native-relay-integration.mjs'], ROOT,
    { ...process.env, PROPERTY_RELAY_TEST_ROOT: path.join(tempDir, 'native relay test') });
  report.native_relay = { status: result.code === 0 && /PASS: native /.test(result.stdout) ? 'PASS' : 'FAIL',
    platform: `${process.platform}/${process.arch}`, output: result.stdout.trim(), error: result.stderr.trim() };
  assert.equal(report.native_relay.status, 'PASS', 'native launcher/runtime/persistence test failed on this host');
}

async function openApp(driver, url) {
  await driver.go(url);
  await driver.waitUntil("document.readyState === 'complete' || document.readyState === 'interactive'");
  await driver.waitUntil("Boolean(document.querySelector('#workspace'))");
}

async function clickVisible(driver, ids) {
  const id = await driver.evaluate(`${JSON.stringify(ids)}.find(id=>{const node=document.getElementById(id);return node&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'})||null`);
  assert.ok(id, `none of these controls is visible: ${ids.join(', ')}`);
  await driver.click(`#${id}`);
}

async function openRelaySettings(driver) {
  await clickVisible(driver, ['mobile-open-settings', 'open-settings']);
  await driver.waitFor('#relay-dialog');
}

async function createIdentity(driver, url, relayUrl, title) {
  await openApp(driver, url);
  const hasWorkspace = await driver.evaluate("!document.querySelector('#workspace')?.classList.contains('hidden')");
  if (!hasWorkspace) {
    await driver.waitUntil("Boolean(document.querySelector('#create-account-button')) && !document.querySelector('#create-account-button').disabled", 240);
    await driver.click('#create-account-button');
    await driver.fill('#new-password', PASSWORD);
    await driver.fill('#confirm-password', PASSWORD);
    await driver.click('#finish-create-button');
    await driver.waitUntil("!document.querySelector('#workspace')?.classList.contains('hidden')", 240);
  }
  await driver.click('#profile-button');
  await driver.waitFor('#profile-npub');
  const npub = await driver.text('#profile-npub');
  assert.match(npub, /^npub1[023456789acdefghjklmnpqrstuvwxyz]{58,}$/i, 'profile did not expose a valid public Nostr address');
  await driver.click('#profile-dialog button[aria-label="Fechar"]');
  await openRelaySettings(driver);
  await driver.fill('#relay-input', relayUrl);
  await driver.fill('#dm-relay-input', relayUrl);
  await driver.click('#save-relays');
  await driver.waitUntil("/[1-9]\\d*\\/\\d+ relay/.test(document.querySelector('#connection-label')?.textContent || '')", 240);
  await openRelaySettings(driver);
  await driver.fill('#dm-relay-input', relayUrl);
  await driver.click('#publish-inbox-list');
  await driver.waitUntil("/Sua lista pública de recebimento NIP-17 foi publicada/.test(document.querySelector('#toast')?.textContent || '') || Boolean(document.querySelector('#relay-error')?.textContent?.trim())", 200);
  const relayError = await driver.evaluate("document.querySelector('#relay-error')?.textContent?.trim() || ''");
  assert.equal(relayError, '', `${title} failed to publish the local NIP-17 inbox list`);
  await driver.click('#relay-dialog button[aria-label="Fechar"]');
  return npub;
}

async function openConversation(driver, peerNpub, name) {
  await clickVisible(driver, ['mobile-new-chat-button', 'new-chat-button', 'empty-new-chat']);
  await driver.waitFor('#new-chat-dialog');
  await driver.fill('#peer-input', peerNpub);
  await driver.fill('#peer-name-input', name);
  await driver.click('#start-chat-button');
  await driver.waitUntil("!document.querySelector('#new-chat-dialog')?.open");
  await driver.waitUntil("!document.querySelector('#conversation-pane')?.classList.contains('hidden')", 160);
}

async function sendAndRead(driver, text) {
  await driver.fill('#message-input', text);
  await driver.click('#send-form button[type="submit"]');
  await driver.waitUntil(`Array.from(document.querySelectorAll('#messages .message-bubble')).some(node => node.textContent.includes(${JSON.stringify(text)}))`, 200);
  const count = await driver.evaluate(`Array.from(document.querySelectorAll('#messages .message-bubble')).filter(node => node.textContent.includes(${JSON.stringify(text)})).length`);
  assert.equal(count, 1, `message was not displayed exactly once: ${text}`);
  return count;
}

async function accountReadyAfterResume(driver, origin, expectedNpub) {
  await driver.go(origin);
  await driver.waitUntil("Boolean(document.querySelector('#workspace'))", 200);
  let visible = await driver.evaluate("!document.querySelector('#workspace')?.classList.contains('hidden')");
  if (!visible) {
    await driver.fill('#password', PASSWORD);
    await driver.click('#unlock-button');
    await driver.waitUntil("!document.querySelector('#workspace')?.classList.contains('hidden')", 240);
    visible = true;
  }
  assert.equal(visible, true, 'identity could not be recovered after browser lifecycle transition');
  await driver.click('#profile-button');
  const recoveredNpub = await driver.text('#profile-npub');
  assert.equal(recoveredNpub, expectedNpub, 'identity changed after app resume/recovery');
  await driver.click('#profile-dialog button[aria-label="Fechar"]');
}

async function mobileCycle(driver, spec, origin, npub, relayUrl, cycleNumber) {
  await driver.execute("mobile: backgroundApp", [{ seconds: -1 }]);
  const appId = spec.appId;
  await driver.execute("mobile: activateApp", [spec.automationName === 'XCUITest' ? { bundleId: appId } : { appId }]);
  await accountReadyAfterResume(driver, origin, npub);
  await openRelaySettings(driver);
  await driver.click('#save-relays');
  await driver.waitUntil("/[1-9]\\d*\\/\\d+ relay/.test(document.querySelector('#connection-label')?.textContent || '')", 240);
  await driver.click('#relay-dialog button[aria-label="Fechar"]');
  return { cycle: cycleNumber, backgrounded: true, resumed: true, identity_recovered: true, relay_reconnected: true };
}

async function runBrowser(spec, originA, originB, relayUrl, port, tempDir, isMobile, cycleCount) {
  const driver = await new WebDriver(spec).create();
  assert.ok(driver.capabilities.platformName, `${spec.name} did not report the actual browser platform`);
  assert.ok(driver.capabilities.browserName, `${spec.name} did not report the actual browser name`);
  const result = { browser: spec.name, capabilities: { platformName: String(driver.capabilities.platformName), browserName: String(driver.capabilities.browserName),
    browserVersion: String(driver.capabilities.browserVersion || driver.capabilities['appium:browserVersion'] || 'unknown'),
    platformVersion: String(driver.capabilities.platformVersion || driver.capabilities['appium:platformVersion'] || 'unknown') },
    identity: 'NOT_RUN', messaging: 'NOT_RUN', recovery: 'NOT_RUN', reconnect: 'NOT_RUN', cycles: [], external_probe_performed: false };
  try {
    const npubA = await createIdentity(driver, originA, relayUrl, 'A');
    const npubB = await createIdentity(driver, originB, relayUrl, 'B');
    assert.notEqual(npubA, npubB, 'separate web origins reused the same local identity');
    result.identity = 'PASS';
    await driver.go(originA);
    await driver.waitUntil("!document.querySelector('#workspace')?.classList.contains('hidden')", 240);
    await openConversation(driver, npubB, 'Perfil B local');
    const cycles = isMobile ? cycleCount : 1;
    for (let cycle = 1; cycle <= cycles; cycle++) {
      await driver.go(originA);
      await driver.waitUntil("!document.querySelector('#workspace')?.classList.contains('hidden')", 240);
      await openConversation(driver, npubB, 'Perfil B local');
      const message = `property-${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-cycle-${cycle}-${randomUUID()}`;
      await sendAndRead(driver, message);
      await driver.go(originB);
      await driver.waitUntil("!document.querySelector('#workspace')?.classList.contains('hidden')", 240);
      await openConversation(driver, npubA, 'Perfil A local');
      await driver.waitUntil(`Array.from(document.querySelectorAll('#messages .message-bubble')).filter(node => node.textContent.includes(${JSON.stringify(message)})).length === 1`, 240);
      result.messaging = 'PASS';
      if (isMobile) {
        const lifecycle = await mobileCycle(driver, spec, originB, npubB, relayUrl, cycle);
        lifecycle.message_delivered_once = true;
        result.cycles.push(lifecycle);
        result.recovery = 'PASS'; result.reconnect = 'PASS';
      } else {
        result.cycles.push({ cycle, delivered_once: true, pwa_origin_reopened: true });
      }
    }
    const pwa = await driver.evaluate(`({secureContext:isSecureContext, serviceWorkerSupported:'serviceWorker' in navigator,
      manifest:document.querySelector('link[rel="manifest"]')?.getAttribute('href') || null,
      standalone:matchMedia('(display-mode: standalone)').matches,
      installPromptSupported:'onbeforeinstallprompt' in window})`);
    result.pwa = pwa;
    assert.equal(pwa.secureContext, true, 'localhost PWA origin is not a secure context');
    assert.equal(pwa.serviceWorkerSupported, true, 'browser lacks service worker support');
    assert.ok(pwa.manifest, 'PWA manifest link is missing');
    if (isMobile) assert.equal(result.cycles.length, 3, `${spec.name} did not complete all three lifecycle cycles`);
    result.status = 'PASS';
    return result;
  } finally {
    await driver.delete();
  }
}

async function runPreflight(specs, outputDir, hostNetworkIsolation, caseId) {
  const report = { schema_version: 1, kind: 'toolchain-preflight', platform: `${process.platform}/${process.arch}`,
    host_network_isolation: hostNetworkIsolation, driver_downloads_allowed: false, browsers: [] };
  if (hostNetworkIsolation.result !== 'PASS') {
    report.result = 'BLOCKED';
    await writeFile(path.join(outputDir, 'g12-platform-preflight.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    throw new Error(`Native platform preflight requires no usable public/default IPv4/IPv6 route and no external proxy: ${JSON.stringify({ ipv4: hostNetworkIsolation.ipv4, ipv6: hostNetworkIsolation.ipv6, proxy_variable_names: hostNetworkIsolation.proxy_variable_names, reasons: hostNetworkIsolation.reasons })}`);
  }
  if (caseId === 'G12-04') report.android_guest_isolation = await isolateAndroidGuest(hostNetworkIsolation);
  const appium = await startAppium(outputDir);
  try {
    for (const spec of specs) {
      const driver = await new WebDriver(spec).create();
      try {
        await driver.go('about:blank');
        report.browsers.push({ name: spec.name, status: 'PASS', browserVersion: String(driver.capabilities.browserVersion || 'unknown') });
      } finally { await driver.delete(); }
    }
  } finally {
    await stopChild(appium.proc);
    await sleep(300);
  }
  report.result = report.browsers.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
  await writeFile(path.join(outputDir, 'g12-platform-preflight.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  assert.equal(report.result, 'PASS');
}

async function runDriverWarmup(specs, outputDir, caseId) {
  const report = { schema_version: 1, kind: 'native-browser-driver-warmup', case: caseId,
    platform: `${process.platform}/${process.arch}`, candidate_commit: '', allow_driver_downloads: true,
    browsers: [], result: 'NOT_RUN' };
  let appium = null, failure = null;
  try {
    const head = await runChild(process.platform === 'win32' ? 'git.exe' : 'git', ['rev-parse', 'HEAD']);
    assert.equal(head.code, 0, 'cannot read candidate Git commit during browser driver warmup');
    report.candidate_commit = head.stdout.trim();
    appium = await startAppium(outputDir);
    for (const spec of specs) {
      const driver = await new WebDriver(spec, { allowDriverDownloads: true }).create();
      try {
        await driver.go('about:blank');
        report.browsers.push({ name: spec.name, status: 'PASS', platformName: String(driver.capabilities.platformName),
          browserName: String(driver.capabilities.browserName), browserVersion: String(driver.capabilities.browserVersion || 'unknown') });
      } finally { await driver.delete(); }
    }
    report.result = report.browsers.length === specs.length && report.browsers.every(browser => browser.status === 'PASS') ? 'PASS' : 'FAIL';
    assert.equal(report.result, 'PASS', 'every native browser must open during the pre-isolation driver warmup');
  } catch (error) {
    failure = error;
    report.result = 'FAIL';
    report.failure = redact(error?.stack || error?.message || error);
  } finally {
    if (appium) await stopChild(appium.proc);
    await sleep(300);
  }
  await writeFile(path.join(outputDir, 'g12-platform-driver-warmup.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  if (failure) throw failure;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.output);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const specs = browserSpecs(options.caseId);
  if (options.warmup) { await runDriverWarmup(specs, outputDir, options.caseId); return; }
  const hostNetworkIsolation = await inspectNativeNetworkIsolation();
  await writeFile(path.join(outputDir, 'g12-platform-network-isolation.json'), JSON.stringify(hostNetworkIsolation, null, 2) + '\n', { mode: 0o600 });
  if (options.preflight) { await runPreflight(specs, outputDir, hostNetworkIsolation, options.caseId); return; }
  const report = { schema_version: 3, case: options.caseId, candidate_commit: '', platform: {
      os: process.platform, release: os.release(), arch: process.arch },
    network_isolation: { verdict: 'NOT_PROVEN', host_egress: hostNetworkIsolation },
    result: 'NOT_RUN', browsers: [], evidence: [], physical_installation_proven: false,
    started_utc: new Date().toISOString() };
  const tempDir = await import('node:fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'Property platform data with spaces - ')));
  let app = null, denyProxy = null;
  let appium = null, relay = null, failure = null;
  const previousProxy = process.env.PROPERTY_BLOCK_EGRESS_PROXY;
  const relayLog = path.join(outputDir, 'g12-platform-relay.log');
  try {
    if (hostNetworkIsolation.result !== 'PASS') {
      const error = new Error('Native platform case requires no usable public/default IPv4/IPv6 route and no external proxy.');
      error.code = 'PROPERTY_PLATFORM_ISOLATION_BLOCKED';
      throw error;
    }
    app = startAppServer();
    denyProxy = startDenyProxy();
    const head = await runChild(process.platform === 'win32' ? 'git.exe' : 'git', ['rev-parse', 'HEAD']);
    assert.equal(head.code, 0, 'cannot read candidate Git commit');
    report.candidate_commit = head.stdout.trim();
    const toolchain = JSON.parse(await readFile(path.join(outputDir, 'g12-platform-toolchain-preparation.json'), 'utf8'));
    assert.equal(toolchain.result, 'PASS', 'pinned Appium drivers were not prepared before offline execution');
    assert.equal(toolchain.case, options.caseId, 'Appium toolchain preparation case does not match');
    assert.equal(toolchain.platform, `${process.platform}/${process.arch}`, 'Appium toolchain was prepared on a different native host');
    report.toolchain = { node: toolchain.node, npm: toolchain.npm, appium: toolchain.appium,
      package_lock_sha256: toolchain.package_lock_sha256, drivers: toolchain.drivers };
    const warmup = JSON.parse(await readFile(path.join(outputDir, 'g12-platform-driver-warmup.json'), 'utf8'));
    assert.equal(warmup.result, 'PASS', 'native browser driver warmup did not pass before offline execution');
    assert.equal(warmup.kind, 'native-browser-driver-warmup', 'browser driver warmup report kind is invalid');
    assert.equal(warmup.case, options.caseId, 'browser driver warmup case does not match');
    assert.equal(warmup.platform, `${process.platform}/${process.arch}`, 'browser driver warmup ran on a different native host');
    assert.equal(warmup.candidate_commit, report.candidate_commit, 'browser driver warmup used a different candidate commit');
    assert.equal(warmup.allow_driver_downloads, true, 'driver warmup must explicitly allow preparation downloads before isolation');
    assert.deepEqual(warmup.browsers.map(browser => browser.name).sort(), specs.map(spec => spec.name).sort(),
      'browser driver warmup set differs from the required native matrix');
    assert.ok(warmup.browsers.every(browser => browser.status === 'PASS'), 'every browser must be ready before egress is blocked');
    report.browser_driver_warmup = { status: warmup.result, browser_count: warmup.browsers.length,
      browsers: warmup.browsers.map(browser => ({ name: browser.name, version: browser.browserVersion })) };
    const preflight = JSON.parse(await readFile(path.join(outputDir, 'g12-platform-preflight.json'), 'utf8'));
    assert.equal(preflight.result, 'PASS', 'native Appium/browser preflight did not pass before offline test execution');
    assert.equal(preflight.platform, `${process.platform}/${process.arch}`, 'preflight ran on a different native host');
    assert.equal(preflight.host_network_isolation?.result, 'PASS', 'native host egress isolation was not proven before browser preflight');
    assert.equal(preflight.host_network_isolation?.platform, hostNetworkIsolation.platform, 'preflight egress isolation was captured on a different host');
    assert.equal(preflight.driver_downloads_allowed, false, 'browser drivers must not download during offline preflight');
    if (options.caseId === 'G12-04') {
      assert.equal(preflight.android_guest_isolation?.verdict, 'PASS', 'Android guest egress must be isolated before the browser preflight');
      report.android_guest_isolation = preflight.android_guest_isolation;
    }
    assert.equal(preflight.browsers.length, specs.length, 'preflight did not create a session for every required browser');
    assert.deepEqual(preflight.browsers.map(browser => browser.name).sort(), specs.map(spec => spec.name).sort(), 'preflight browser set differs from the required matrix');
    assert.ok(preflight.browsers.every(browser => browser.status === 'PASS'), 'every required browser must pass preflight');
    await nativeRelayCheck(report, tempDir);
    await app.ready;
    await denyProxy.ready;
    const port = 28470 + (Number.parseInt(createHash('sha256').update(report.candidate_commit + options.caseId).digest('hex').slice(0, 4), 16) % 1000);
    const relayUrl = `ws://127.0.0.1:${port}`;
    relay = startRelay(port, tempDir, relayLog);
    await relayReady(port);
    const appPort = app.server.address().port;
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const browserOrigins = [appOrigin, appOrigin.replace('127.0.0.1', 'localhost')];
    const androidForwards = options.caseId === 'G12-04'
      ? [await forwardToAndroid(appPort), await forwardToAndroid(port)] : [];
    const proxyPort = denyProxy.server.address().port;
    process.env.PROPERTY_BLOCK_EGRESS_PROXY = `http://127.0.0.1:${proxyPort}`;
    appium = await startAppium(outputDir);
    report.network_isolation = { verdict: 'IN_PROGRESS', host_egress: hostNetworkIsolation,
      policy: 'The native host has no usable public/default IPv4/IPv6 route, permits only local lab routes, and has no external proxy; each WebDriver browser also uses a deny-all loopback HTTP proxy, bypassing only localhost and loopback for local Property assets and relay.',
      android_adb_reverse: androidForwards, intentional_external_probe_count: 0 };
    const mobile = specs[0].mobile;
    const cycleCount = mobile ? 3 : 1;
    for (const spec of specs) {
      const browser = await runBrowser(spec, browserOrigins[0], browserOrigins[1], relayUrl, port, tempDir, mobile, cycleCount);
      report.browsers.push(browser);
      assert.equal(browser.status, 'PASS');
    }
    assert.ok(report.browsers.every(browser => browser.external_probe_performed === false),
      'the platform journey must not make an intentional request to any external origin');
    assert.equal(denyProxy.requests.length, 0,
      `browser attempted external requests during the offline journey: ${JSON.stringify(denyProxy.requests)}`);
    const hostIsolationEnd = await inspectNativeNetworkIsolation();
    const hostIsolationProof = { schema_version: 1, kind: 'native-egress-isolation-checkpoints',
      result: hostNetworkIsolation.result === 'PASS' && hostIsolationEnd.result === 'PASS' &&
        hostNetworkIsolation.platform === hostIsolationEnd.platform ? 'PASS' : 'BLOCKED',
      platform: hostNetworkIsolation.platform, policy: hostNetworkIsolation.policy,
      start: hostNetworkIsolation, end: hostIsolationEnd };
    await writeFile(path.join(outputDir, 'g12-platform-network-isolation.json'), JSON.stringify(hostIsolationProof, null, 2) + '\n', { mode: 0o600 });
    if (hostIsolationProof.result !== 'PASS') {
      const error = new Error('Native host egress isolation did not remain proven through the complete platform journey.');
      error.code = 'PROPERTY_PLATFORM_ISOLATION_BLOCKED';
      throw error;
    }
    report.network_isolation = { ...report.network_isolation, verdict: 'PASS', host_egress_blocked: true,
      intentional_external_probe_count: 0, external_proxy_request_count: denyProxy.requests.length,
      host_egress: hostIsolationProof,
      deny_proxy_requests: denyProxy.requests, local_loopback_preserved: true,
      runner_processes_remain_online_for_ci: false };
    assert.ok(app.requested.length > 0, 'browser never requested any packaged PWA asset');
    report.local_asset_requests = app.requested.length;
    report.external_asset_requests = { denied_by_proxy: denyProxy.requests.length,
      attempted_hosts: [...new Set(denyProxy.requests.map(request => request.host))] };
    report.installability = report.browsers.map(browser => ({ browser: browser.browser,
      manifest_present: Boolean(browser.pwa?.manifest), service_worker_supported: browser.pwa?.serviceWorkerSupported === true,
      install_prompt_api_supported: browser.pwa?.installPromptSupported === true,
      physical_add_to_home_screen_proven: false }));
    report.result = 'PASS';
    report.ended_utc = new Date().toISOString();
    report.evidence = ['g12-platform-toolchain-preparation.json', 'g12-platform-driver-warmup.json',
      'g12-platform-network-isolation.json', 'g12-platform-preflight.json', 'g12-platform-relay.log', 'appium-server.log'];
    await writeFile(path.join(outputDir, 'g12-platform-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    process.stdout.write(JSON.stringify({ case: options.caseId, result: report.result, candidate_commit: report.candidate_commit,
      browsers: report.browsers.map(row => ({ browser: row.browser, status: row.status, cycles: row.cycles.length })) }) + '\n');
  } catch (error) {
    failure = error;
    report.result = error?.code === 'PROPERTY_PLATFORM_ISOLATION_BLOCKED' ? 'BLOCKED' : 'FAIL';
    report.failure = redact(error?.stack || error?.message || error);
  } finally {
    await stopChild(relay);
    if (appium) await stopChild(appium.proc);
    if (app?.server.listening) await new Promise(resolve => app.server.close(() => resolve()));
    if (denyProxy?.server.listening) await new Promise(resolve => denyProxy.server.close(() => resolve()));
    await sleep(500);
    await import('node:fs/promises').then(fs => fs.rm(tempDir, { recursive: true, force: true }));
    if (previousProxy === undefined) delete process.env.PROPERTY_BLOCK_EGRESS_PROXY;
    else process.env.PROPERTY_BLOCK_EGRESS_PROXY = previousProxy;
  }
  for (const filename of ['g12-platform-relay.log', 'appium-server.log']) {
    const file = path.join(outputDir, filename);
    try { await writeFile(file, redact(await readFile(file, 'utf8')), { mode: 0o600 }); } catch {}
  }
  report.ended_utc = new Date().toISOString();
  report.evidence = ['g12-platform-toolchain-preparation.json', 'g12-platform-driver-warmup.json', 'g12-platform-network-isolation.json', 'g12-platform-preflight.json',
    'g12-platform-relay.log', 'appium-server.log', 'g12-platform-evidence.json'];
  const reportFile = path.join(outputDir, 'g12-platform-report.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const evidenceFiles = ['g12-platform-report.json', ...report.evidence.filter(name => name !== 'g12-platform-evidence.json')];
  const evidenceManifest = { schema_version: 1, case: options.caseId, candidate_commit: report.candidate_commit, files: [] };
  for (const filename of evidenceFiles) {
    const file = path.join(outputDir, filename);
    try {
      const bytes = await readFile(file);
      evidenceManifest.files.push({ path: filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) {
      if (report.result === 'PASS') failure ||= new Error(`Required platform evidence is missing: ${filename}`);
      report.result = report.result === 'PASS' ? 'FAIL' : report.result;
      report.failure ||= redact(error?.message || error);
    }
  }
  await writeFile(path.join(outputDir, 'g12-platform-evidence.json'), JSON.stringify(evidenceManifest, null, 2) + '\n', { mode: 0o600 });
  if (failure) {
    report.result = 'FAIL';
    report.failure ||= redact(failure?.stack || failure?.message || failure);
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    throw failure;
  }
  process.stdout.write(JSON.stringify({ case: options.caseId, result: report.result, candidate_commit: report.candidate_commit,
    browsers: report.browsers.map(row => ({ browser: row.browser, status: row.status, cycles: row.cycles.length })) }) + '\n');
}

main().catch(error => { process.stderr.write(`${redact(error?.stack || error?.message || error)}\n`); process.exitCode = 1; });
