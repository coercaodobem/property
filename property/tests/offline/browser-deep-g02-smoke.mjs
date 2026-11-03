#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const TEST_PASSWORD = 'Property-offline-test-2026!';
const safeText = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1000);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    const value = argv[++index];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const key = name.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option ${name}.`);
    options[key] = value;
  }
  for (const key of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[key]) throw new Error(`Missing --${key.replaceAll('_', '-')}.`);
  }
  if (options.engine !== 'chromium') throw new Error('Deep G02 browser tests require the manifest-pinned Chromium engine.');
  if (!path.isAbsolute(options.playwright_module) || !path.isAbsolute(options.executable)) throw new Error('Browser tool paths must be absolute.');
  for (const key of ['playwright_package_sha256', 'browser_executable_sha256']) {
    if (!/^[a-f0-9]{64}$/i.test(options[key])) throw new Error(`${key} must be SHA-256.`);
  }
  return options;
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function sha256Tree(directory) {
  const entries = [];
  async function walk(current, prefix = '') {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Playwright tree contains a symlink: ${relative}`);
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) entries.push(`${relative}\0${await sha256File(absolute)}\n`);
      else throw new Error(`Playwright tree contains a non-regular file: ${relative}`);
    }
  }
  await walk(directory);
  return createHash('sha256').update(entries.join('')).digest('hex');
}

async function createCert(directory, label) {
  const keyFile = path.join(directory, `${label}-key.pem`);
  const certFile = path.join(directory, `${label}-cert.pem`);
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-sha256',
    '-keyout', keyFile, '-out', certFile, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.status !== 0) throw new Error(`Local TLS fixture generation failed: ${safeText(result.stderr || result.error?.message || result.status)}`);
  const certificate = new X509Certificate(await readFile(certFile));
  const pin = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  return { key: await readFile(keyFile), cert: await readFile(certFile), spki_sha256_base64: pin };
}

async function startAppServer(state) {
  const originalWorker = await readFile(path.join(WEB, 'sw.js'), 'utf8');
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET') return response.writeHead(405).end();
      if (url.pathname === '/_property_test/seed') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end('<!doctype html><title>local seed page</title>');
        return;
      }
      if (url.pathname.endsWith('/_property_test/update-v18.js')) {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end('window.__propertyUpdateV18 = true;');
        return;
      }
      if (url.pathname.endsWith('/_property_test/interrupted-v19.js') || url.pathname.endsWith('/_property_test/mixed-v20.js')) {
        response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('offline update fixture unavailable');
        return;
      }
      let relative = url.pathname === '/' || url.pathname === '/property' || url.pathname === '/property/'
        ? 'index.html' : url.pathname.startsWith('/property/') ? url.pathname.slice('/property/'.length) : url.pathname.replace(/^\/+/, '');
      relative = decodeURIComponent(relative);
      const target = path.resolve(WEB, relative);
      if (target !== WEB && !target.startsWith(WEB + path.sep)) return response.writeHead(403).end();
      let body = await readFile(target);
      if (path.basename(target) === 'sw.js' && state.update_version) {
        const version = state.update_version;
        const asset = version === 'v18' ? './_property_test/update-v18.js' :
          version === 'v19' ? './_property_test/interrupted-v19.js' : './_property_test/mixed-v20.js';
        const source = body.toString('utf8')
          .replaceAll('property-shell-v17', `property-shell-${version}`)
          .replaceAll('property-v17', `property-${version}`)
          .replace('const SHELL = [', `const SHELL = ['${asset}', `);
        body = Buffer.from(source);
      } else if (path.basename(target) === 'index.html' && state.update_version) {
        body = Buffer.from(body.toString('utf8').replaceAll('property-v17', `property-${state.update_version}`));
      }
      const types = new Map([['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
        ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
        ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json']]);
      response.writeHead(200, { 'content-type': types.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'cache-control': 'no-store' }).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, port: server.address().port, state };
}

async function startDenyProxy() {
  const attempts = [];
  const server = net.createServer(socket => {
    let received = '';
    socket.setTimeout(2500, () => socket.destroy());
    socket.on('data', chunk => {
      received += chunk.toString('latin1');
      if (!received.includes('\r\n')) return;
      const [method, target = ''] = received.split('\r\n', 1)[0].split(' ');
      let destination = 'unparseable';
      try { destination = method === 'CONNECT' ? new URL(`http://${target}`).host : new URL(target).origin; } catch {}
      attempts.push({ method: method || 'unknown', destination });
      socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, port: server.address().port, attempts };
}

function instrument(context, localOrigin, proxyAttempts) {
  const externalRequests = new Set();
  const pageErrors = [];
  const cspViolations = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.add(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
  context.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') externalRequests.add(`${request.method()} ${url.origin}${url.pathname}`);
  });
  context.on('console', message => {
    if (/content security policy|refused to load/i.test(message.text())) cspViolations.push(message.text().slice(0, 500));
  });
  context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message.slice(0, 500))));
  context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    externalRequests.add(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  return { externalRequests, pageErrors, cspViolations, proxyAttempts, localOrigin };
}

async function launchBrowser(options, proxyPort, localTlsPin) {
  const modulePath = path.resolve(options.playwright_module);
  await access(modulePath);
  const packagePath = path.join(path.dirname(modulePath), 'package.json');
  const packageInfo = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(packageInfo.name, 'playwright');
  assert.equal(packageInfo.version, options.playwright_version);
  assert.equal(await sha256Tree(path.dirname(modulePath)), options.playwright_package_sha256);
  const playwright = createRequire(modulePath)(modulePath);
  const executable = path.resolve(options.executable);
  assert.ok((await stat(executable)).isFile());
  assert.equal(await sha256File(executable), options.browser_executable_sha256);
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection',
    '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'];
  if (localTlsPin) args.push(`--ignore-certificate-errors-spki-list=${localTlsPin}`);
  const browser = await playwright.chromium.launch({ headless: true, executablePath: executable,
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' }, args });
  const actualVersion = browser.version();
  assert.equal(actualVersion, options.browser_version);
  return { browser, evidence: { engine: 'chromium', browser_version: actualVersion,
    playwright_version: packageInfo.version, playwright_package_sha256: options.playwright_package_sha256,
    browser_executable_sha256: options.browser_executable_sha256, tls_spki_pin_sha256_base64: localTlsPin } };
}

async function createIdentity(page, origin) {
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.locator('#auth-choice').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#create-account-button').click();
  await page.locator('#auth-setup').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#new-password').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#new-password').fill(TEST_PASSWORD);
  await page.locator('#confirm-password').fill(TEST_PASSWORD);
  await page.locator('#finish-create-button').click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  return (await page.locator('#profile-npub').textContent()).trim();
}

async function updateServiceWorker(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    let worker = registration.installing;
    const found = new Promise(resolve => registration.addEventListener('updatefound', () => resolve(registration.installing), { once: true }));
    await registration.update();
    worker ||= await Promise.race([found, new Promise(resolve => setTimeout(() => resolve(null), 6000))]);
    if (!worker) return { state: 'no-update' };
    const state = await new Promise(resolve => {
      if (['activated', 'redundant'].includes(worker.state)) return resolve(worker.state);
      const timer = setTimeout(() => resolve(`timeout:${worker.state}`), 15000);
      worker.addEventListener('statechange', () => {
        if (['activated', 'redundant'].includes(worker.state)) { clearTimeout(timer); resolve(worker.state); }
      });
    });
    await new Promise(resolve => setTimeout(resolve, 200));
    return { state, active_state: registration.active?.state || null, cache_names: await caches.keys() };
  });
}

async function seedLegacyDatabase(page, data) {
  await page.goto(`${data.origin}/_property_test/seed`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async payload => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const [name, keyPath] of [['vault', 'id'], ['settings', 'id'], ['conversations', 'pubkey'], ['messages', 'id']]) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['vault', 'settings', 'conversations', 'messages'], 'readwrite');
      transaction.objectStore('vault').put(payload.vault);
      transaction.objectStore('settings').put(payload.profile);
      transaction.objectStore('conversations').put(payload.conversation);
      transaction.objectStore('messages').put(payload.message);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, data);
}

async function queryVault(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const vault = await new Promise((resolve, reject) => {
      const request = db.transaction('vault').objectStore('vault').get('account');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return vault ? window.PropertyVault.exportBackup(vault) : null;
  });
}

async function importBackup(page, backup, password = TEST_PASSWORD) {
  await page.locator('#import-account-button').click();
  await page.locator('#auth-import').waitFor({ state: 'visible' });
  await page.locator('#import-secret').fill(JSON.stringify(backup));
  await page.locator('#import-password').fill(password);
  await page.locator('#finish-import-button').click();
}

function startTlsServer(identity) {
  const server = https.createServer({ key: identity.key, cert: identity.cert }, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('local TLS endpoint');
  });
  let upgrades = 0;
  const upgradeSockets = new Set();
  server.propertyUpgradeSockets = upgradeSockets;
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    upgrades++;
    upgradeSockets.add(socket);
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', () => socket.end());
    socket.on('close', () => upgradeSockets.delete(socket));
    socket.on('error', () => {});
  });
  return { server, get upgrades() { return upgrades; } };
}

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}

async function closeServer(server) {
  if (!server?.listening) return;
  for (const socket of server.propertyUpgradeSockets || []) socket.destroy();
  await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
}

async function writeReport(output, report) {
  const directory = path.resolve(output);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, 'browser-deep-g02-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}

async function main() {
  let options;
  let appServer;
  let denyProxy;
  let browserInfo;
  let activeCase = 'G02-04';
  let validTls;
  let invalidTls;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-deep-g02-'));
  const report = {
    schema_version: 1,
    cases: ['G02-04', 'G02-05', 'G02-06'].map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    external_requests: [], denied_proxy_attempts: [], page_errors: [], csp_violations: [],
    update_checks: {}, migration_checks: {}, tls_checks: {}
  };
  const setCase = (id, status, reason) => Object.assign(report.cases.find(item => item.case === id), { status, reason });
  try {
    options = parseArgs(process.argv.slice(2));
    const validIdentity = await createCert(temp, 'valid');
    const invalidIdentity = await createCert(temp, 'invalid');
    appServer = await startAppServer({ update_version: null });
    denyProxy = await startDenyProxy();
    validTls = startTlsServer(validIdentity);
    invalidTls = startTlsServer(invalidIdentity);
    const validTlsPort = await listen(validTls.server);
    const invalidTlsPort = await listen(invalidTls.server);
    browserInfo = await launchBrowser(options, denyProxy.port, validIdentity.spki_sha256_base64);
    report.browser = browserInfo.evidence;
    report.local_origin = `http://127.0.0.1:${appServer.port}`;
    const context = await browserInfo.browser.newContext({ serviceWorkers: 'allow', acceptDownloads: true });
    const observed = instrument(context, report.local_origin, denyProxy.attempts);
    const page = await context.newPage();

    // G02-04: install an update, then reject interrupted and mixed packages while preserving local state.
    let npub = await createIdentity(page, report.local_origin);
    await page.locator('#profile-button').click();
    await page.locator('#profile-name').fill('Conta de atualização');
    await page.locator('#save-profile').click();
    await page.evaluate(async () => { const cache = await caches.open('another-app-data'); await cache.put('/sentinel', new Response('keep')); });
    const beforeCaches = await page.evaluate(() => caches.keys());
    assert.ok(beforeCaches.includes('property-shell-v17'));
    appServer.state.update_version = 'v18';
    const successfulUpdate = await updateServiceWorker(page);
    assert.equal(successfulUpdate.state, 'activated', 'complete update activates');
    await page.waitForFunction(async () => (await caches.keys()).includes('property-shell-v18'), null, { timeout: 10000 });
    const afterUpdate = await page.evaluate(() => caches.keys());
    assert.equal(afterUpdate.includes('property-shell-v17'), false, 'old Property cache is retired after activation');
    assert.equal(afterUpdate.includes('another-app-data'), true, 'unrelated application cache is preserved');
    assert.equal((await page.locator('#profile-npub').textContent()).trim(), npub, 'identity is unchanged after full update');
    assert.equal((await page.locator('#profile-name').inputValue()), 'Conta de atualização');

    appServer.state.update_version = 'v19';
    const interruptedUpdate = await updateServiceWorker(page);
    assert.ok(['redundant', 'timeout:installing', 'timeout:redundant'].includes(interruptedUpdate.state),
      `interrupted update must not activate: ${interruptedUpdate.state}`);
    assert.ok(interruptedUpdate.cache_names.includes('property-shell-v18'), 'previous complete shell remains cached');
    assert.equal(interruptedUpdate.cache_names.includes('property-shell-v19'), false, 'partial interrupted cache is removed');
    assert.equal((await page.locator('#profile-npub').textContent()).trim(), npub);

    appServer.state.update_version = 'v20';
    const mixedUpdate = await updateServiceWorker(page);
    assert.ok(['redundant', 'timeout:installing', 'timeout:redundant'].includes(mixedUpdate.state),
      `mixed package with a missing required asset must not activate: ${mixedUpdate.state}`);
    assert.ok(mixedUpdate.cache_names.includes('property-shell-v18'), 'last complete shell remains active after mixed package rejection');
    assert.equal(mixedUpdate.cache_names.includes('property-shell-v20'), false, 'partial mixed cache is removed');
    assert.equal((await page.locator('#profile-npub').textContent()).trim(), npub);
    assert.ok(afterUpdate.includes('another-app-data'));
    report.update_checks = { previous_cache: 'property-shell-v17', successful_update: successfulUpdate,
      after_success_cache_names: afterUpdate, interrupted_update: interruptedUpdate, mixed_update: mixedUpdate,
      identity_preserved: true, unrelated_cache_preserved: true };
    setCase('G02-04', 'PASS', 'Complete update activated; interrupted and mixed packages were rejected while the previous shell, identity and unrelated cache remained available.');

    // G02-05: backup UI, legacy format/database, wrong password, tampered backup and denied storage.
    activeCase = 'G02-05';
    const downloadPromise = page.waitForEvent('download');
    page.once('dialog', dialog => dialog.accept(TEST_PASSWORD));
    await page.locator('#export-backup').click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(backup.format, 'property-encrypted-key-v1');
    const oldFormatBackup = { ...backup, format: 'liberdade-encrypted-key-v1' };

    const importContext = await browserInfo.browser.newContext({ serviceWorkers: 'allow' });
    const importObserved = instrument(importContext, report.local_origin, denyProxy.attempts);
    const importPage = await importContext.newPage();
    await importPage.goto(`${report.local_origin}/property/`, { waitUntil: 'domcontentloaded' });
    await importBackup(importPage, oldFormatBackup);
    await importPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await importPage.locator('#profile-npub').textContent()).trim(), npub, 'legacy backup restores the same identity through the UI');
    await importContext.close();

    const corruptContext = await browserInfo.browser.newContext({ serviceWorkers: 'allow' });
    const corruptObserved = instrument(corruptContext, report.local_origin, denyProxy.attempts);
    const corruptPage = await corruptContext.newPage();
    await corruptPage.goto(`${report.local_origin}/property/`, { waitUntil: 'domcontentloaded' });
    const wrongPassword = await importBackup(corruptPage, oldFormatBackup, 'incorrect-password-2026');
    await corruptPage.waitForFunction(() => /Senha incorreta|Backup Property inválido/.test(document.querySelector('#import-error')?.textContent || ''), null, { timeout: 20000 });
    assert.match(await corruptPage.locator('#import-error').textContent(), /Senha incorreta|Backup Property inválido/);
    assert.equal(await corruptPage.locator('#workspace').isVisible(), false);
    const badBackup = { ...oldFormatBackup, cipher: `${oldFormatBackup.cipher[0] === 'A' ? 'B' : 'A'}${oldFormatBackup.cipher.slice(1)}` };
    await corruptPage.locator('#import-secret').fill(JSON.stringify(badBackup));
    await corruptPage.locator('#import-password').fill(TEST_PASSWORD);
    await corruptPage.locator('#finish-import-button').click();
    await corruptPage.waitForFunction(() => /Senha incorreta|Backup Property inválido/.test(document.querySelector('#import-error')?.textContent || ''), null, { timeout: 20000 });
    assert.match(await corruptPage.locator('#import-error').textContent(), /Senha incorreta|Backup Property inválido/);
    const emptyVault = await corruptPage.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const req = indexedDB.open('liberdade-local-v1', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const value = await new Promise((resolve, reject) => { const req = db.transaction('vault').objectStore('vault').get('account'); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
      db.close(); return value;
    });
    assert.equal(emptyVault, null, 'failed imports do not create a new account');
    await corruptContext.close();

    const legacyContext = await browserInfo.browser.newContext({ serviceWorkers: 'allow' });
    const legacyObserved = instrument(legacyContext, report.local_origin, denyProxy.attempts);
    const legacyPage = await legacyContext.newPage();
    const legacyPubkey = await page.evaluate(() => NostrTools.getPublicKey(NostrTools.generateSecretKey()));
    const legacyVault = { ...oldFormatBackup, id: 'account', version: 1 };
    await seedLegacyDatabase(legacyPage, {
      origin: report.local_origin, vault: legacyVault,
      profile: { id: `profile-${backup.pubkey}`, name: 'Perfil legado' },
      conversation: { pubkey: legacyPubkey, title: 'Contato legado', lastMessage: 'Mensagem antiga', lastAt: 1_700_000_000_000 },
      message: { id: 'legacy-message-1', peer: legacyPubkey, direction: 'received', text: 'Mensagem antiga preservada', createdAt: 1_700_000_000_000, status: 'received' }
    });
    await legacyPage.goto(`${report.local_origin}/`, { waitUntil: 'domcontentloaded' });
    await legacyPage.locator('#password').fill(TEST_PASSWORD);
    await legacyPage.locator('#unlock-button').click();
    await legacyPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await legacyPage.locator('#profile-npub').textContent()).trim(), npub);
    assert.equal(await legacyPage.locator('#profile-name').inputValue(), 'Perfil legado');
    assert.match(await legacyPage.locator('#conversation-list').textContent(), /Contato legado/);
    await legacyPage.goto(`${report.local_origin}/property/`, { waitUntil: 'domcontentloaded' });
    await legacyPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await legacyPage.locator('#profile-npub').textContent()).trim(), npub, 'legacy identity survives old/new paths at the same origin');
    assert.match(await legacyPage.locator('#conversation-list').textContent(), /Contato legado/);
    const storageContext = await browserInfo.browser.newContext({ serviceWorkers: 'allow' });
    await storageContext.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get() { return { open() { throw new DOMException('blocked by offline test', 'SecurityError'); } }; } }));
    const storagePage = await storageContext.newPage();
    await storagePage.goto(`${report.local_origin}/property/`, { waitUntil: 'domcontentloaded' });
    await storagePage.waitForFunction(() => /Armazenamento local indisponível/.test(document.querySelector('#auth-error')?.textContent || ''), null, { timeout: 10000 });
    assert.match(await storagePage.locator('#auth-error').textContent(), /Armazenamento local indisponível/);
    assert.equal(await storagePage.locator('#workspace').isVisible(), false, 'storage failure does not silently create or activate an identity');
    report.migration_checks = { legacy_backup_format_imported: true, same_identity: true, wrong_password_rejected: true,
      tampered_backup_rejected: true, failed_import_created_no_identity: true, legacy_database_and_conversation_preserved: true,
      old_and_new_paths_same_origin: true, storage_failure_reported_without_new_identity: true };
    setCase('G02-05', 'PASS', 'Legacy backup and database restored the same identity/data; wrong-password/tampered imports and unavailable storage failed visibly without creating another account.');
    await storageContext.close();
    await legacyContext.close();
    await page.locator('#profile-button').click().catch(() => {});

    // G02-06: CSP blocks remote scripts; only the exact valid local TLS SPKI is accepted.
    activeCase = 'G02-06';
    const maliciousPayload = '<img src=x onerror="window.__propertyXss=true"><script>window.__propertyXss=true</script>';
    const maliciousPubkey = await page.evaluate(() => NostrTools.getPublicKey(NostrTools.generateSecretKey()));
    await page.evaluate(async ({ pubkey, payload }) => {
      const db = await new Promise((resolve, reject) => { const req = indexedDB.open('liberdade-local-v1', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      await new Promise((resolve, reject) => { const tx = db.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put({ pubkey, title: payload, lastMessage: payload, lastAt: Date.now() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      db.close();
    }, { pubkey: maliciousPubkey, payload: maliciousPayload });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('#conversation-list img, #conversation-list script').count(), 0, 'malicious profile text is rendered as text');
    assert.match(await page.locator('#conversation-list').textContent(), /<img src=x/);
    await page.evaluate(() => {
      window.__propertyRemoteScriptExecuted = false;
      const script = document.createElement('script'); script.src = 'https://remote-script.invalid/evil.js'; document.head.append(script);
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__propertyRemoteScriptExecuted), false);
    const blockedInjectionAttempts = [...observed.externalRequests];
    const unexpectedExternalRequests = blockedInjectionAttempts.filter(value => !/\bGET https:\/\/remote-script\.invalid\/evil\.js(?:\?|$)/.test(value));
    assert.deepEqual(unexpectedExternalRequests, [], 'only the deliberate CSP test injection may name an external URL');
    assert.ok(observed.cspViolations.some(message => /remote-script\.invalid/.test(message)), 'CSP reports the blocked external script');

    const validHttpsPage = await context.newPage();
    const validHttpsResponse = await validHttpsPage.goto(`https://127.0.0.1:${validTlsPort}/health`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    assert.equal(validHttpsResponse.status(), 200, 'SPKI-pinned local test certificate establishes validated HTTPS');
    await validHttpsPage.close();
    const invalidHttpsPage = await context.newPage();
    let invalidHttpsRejected = false;
    try { await invalidHttpsPage.goto(`https://127.0.0.1:${invalidTlsPort}/health`, { waitUntil: 'domcontentloaded', timeout: 10000 }); }
    catch (error) { invalidHttpsRejected = /ERR_CERT|certificate|SSL/i.test(error.message); }
    assert.equal(invalidHttpsRejected, true, 'a different, untrusted certificate is rejected');
    await invalidHttpsPage.close();

    const validWss = await page.evaluate(url => new Promise(resolve => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); resolve('timeout'); }, 8000);
      socket.addEventListener('open', () => { clearTimeout(timer); socket.close(); resolve('open'); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); resolve('error'); }, { once: true });
    }), `wss://127.0.0.1:${validTlsPort}/relay`);
    assert.equal(validWss, 'open', 'valid local WSS is allowed by CSP and exact SPKI trust');
    const invalidWss = await page.evaluate(url => new Promise(resolve => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); resolve('timeout'); }, 8000);
      socket.addEventListener('open', () => { clearTimeout(timer); socket.close(); resolve('open'); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); resolve('error'); }, { once: true });
    }), `wss://127.0.0.1:${invalidTlsPort}/relay`);
    assert.equal(invalidWss, 'error', 'invalid local WSS certificate is rejected');
    assert.equal(validTls.upgrades, 1);
    assert.equal(invalidTls.upgrades, 0, 'TLS rejection happened before WebSocket upgrade');
    assert.deepEqual([...observed.externalRequests].filter(value => !/\bGET https:\/\/remote-script\.invalid\/evil\.js(?:\?|$)/.test(value)), []);
    assert.equal(denyProxy.attempts.length, 0);
    assert.equal(observed.pageErrors.length, 0);
    report.external_requests = [...observed.externalRequests];
    report.intentional_csp_blocked_external_attempts = blockedInjectionAttempts;
    report.denied_proxy_attempts = [...denyProxy.attempts];
    report.page_errors = observed.pageErrors;
    report.csp_violations = observed.cspViolations;
    report.tls_checks = { valid_https_status: validHttpsResponse.status(), invalid_https_rejected: invalidHttpsRejected,
      valid_wss_opened: validWss === 'open', invalid_wss_rejected: invalidWss === 'error',
      valid_tls_upgrade_count: validTls.upgrades, invalid_tls_upgrade_count: invalidTls.upgrades,
      certificate_policy: 'Only the generated local valid leaf SPKI is allowlisted in this disposable browser; no global ignore-certificate-errors flag.' };
    setCase('G02-06', 'PASS', 'CSP blocked remote script execution; malicious text stayed inert; the pinned local TLS/WSS endpoint worked and an untrusted certificate was rejected.');
    await context.close();
    await browserInfo.browser.close();
    report.result = report.cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    await writeReport(options.output, report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const browserUnavailable = !browserInfo || /executable|module|package|version mismatch|ENOENT|permission|launch/i.test(error.message);
    const item = report.cases.find(row => row.case === activeCase && row.status === 'NOT_RUN');
    if (item) Object.assign(item, {
      status: browserUnavailable ? 'BLOCKED' : 'FAIL',
      reason: safeText(error.message || error)
    });
    for (const pending of report.cases.filter(row => row.status === 'NOT_RUN')) {
      pending.reason = `Earlier case ${activeCase} failed; dependent case was not started.`;
    }
    report.result = browserUnavailable ? 'BLOCKED' : 'FAIL';
    report.error = safeText(error.message || error);
    if (browserInfo?.browser) await browserInfo.browser.close().catch(() => {});
    await writeReport(options?.output || path.join(temp, 'report'), report).catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return browserUnavailable ? 2 : 1;
  } finally {
    await closeServer(appServer?.server);
    await closeServer(denyProxy?.server);
    await closeServer(validTls?.server);
    await closeServer(invalidTls?.server);
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`);
    process.exitCode = 2;
  });
}
