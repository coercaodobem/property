#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = path.join(PROPERTY_ROOT, 'web');
const TEST_PASSWORD = 'Property-offline-test-2026!';
const safeText = value => String(value)
  .replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>')
  .slice(0, 1000);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('Expected named command-line options.');
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}.`);
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option ${key}.`);
    options[name] = value;
  }
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Required option --${name.replaceAll('_', '-')} is missing.`);
  }
  if (!['chromium', 'firefox', 'webkit'].includes(options.engine)) throw new Error('--engine must be chromium, firefox or webkit.');
  if (!path.isAbsolute(options.playwright_module) || !path.isAbsolute(options.executable)) {
    throw new Error('Pinned Playwright and browser executable paths must be absolute.');
  }
  for (const name of ['playwright_package_sha256', 'browser_executable_sha256']) {
    if (!/^[0-9a-f]{64}$/i.test(options[name])) throw new Error(`--${name.replaceAll('_', '-')} must be a SHA-256 digest.`);
  }
  return options;
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function sha256Tree(directory) {
  const entries = [];
  async function walk(current, prefix) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Playwright package contains a symbolic link: ${relative}`);
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) entries.push(`${relative}\0${await sha256File(absolute)}\n`);
      else throw new Error(`Playwright package contains a non-regular entry: ${relative}`);
    }
  }
  await walk(directory, '');
  return createHash('sha256').update(entries.join('')).digest('hex');
}

async function resolvePlaywright(options, denyProxyPort) {
  const modulePath = path.resolve(options.playwright_module);
  await access(modulePath);
  const packagePath = path.join(path.dirname(modulePath), 'package.json');
  const packageInfo = JSON.parse(await readFile(packagePath, 'utf8'));
  if (packageInfo.name !== 'playwright') throw new Error('The pinned module must be the Playwright package, not playwright-core.');
  if (packageInfo.version !== options.playwright_version) throw new Error(`Playwright version mismatch: expected ${options.playwright_version}, found ${packageInfo.version}.`);
  const packageHash = await sha256Tree(path.dirname(modulePath));
  if (packageHash !== options.playwright_package_sha256) throw new Error('Playwright package tree hash does not match the lab manifest.');
  const playwright = createRequire(modulePath)(modulePath);
  if (!playwright[options.engine]) throw new Error(`Playwright does not expose ${options.engine}.`);
  const executable = path.resolve(options.executable);
  const executableInfo = await stat(executable);
  if (!executableInfo.isFile()) throw new Error('Pinned browser executable is not a regular file.');
  const executableHash = await sha256File(executable);
  if (executableHash !== options.browser_executable_sha256) throw new Error('Browser executable hash does not match the lab manifest.');
  const browser = await playwright[options.engine].launch({
    headless: true,
    executablePath: executable,
    proxy: { server: `http://127.0.0.1:${denyProxyPort}`, bypass: '127.0.0.1,localhost' },
    args: process.platform === 'linux' ? [
      '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection',
      '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions',
      '--no-first-run'
    ] : [],
    firefoxUserPrefs: {
      'toolkit.telemetry.enabled': false,
      'datareporting.healthreport.uploadEnabled': false,
      'app.update.enabled': false,
      'browser.newtabpage.enabled': false,
      'browser.shell.checkDefaultBrowser': false,
      'network.captive-portal-service.enabled': false,
      'network.connectivity-service.enabled': false
    }
  });
  const actualBrowserVersion = browser.version();
  if (actualBrowserVersion !== options.browser_version) {
    await browser.close();
    throw new Error(`Browser version mismatch: expected ${options.browser_version}, found ${actualBrowserVersion}.`);
  }
  return {
    browser,
    evidence: {
      engine: options.engine,
      browser_version: actualBrowserVersion,
      browser_executable_sha256: executableHash,
      playwright_version: packageInfo.version,
      playwright_package_sha256: packageHash
    }
  };
}

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json'],
  ['.png', 'image/png'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2']
]);

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname.includes('\0')) {
        response.writeHead(405).end();
        return;
      }
      let relative = url.pathname === '/' || url.pathname === '/property' || url.pathname === '/property/'
        ? 'index.html'
        : url.pathname.startsWith('/property/') ? url.pathname.slice('/property/'.length) : url.pathname.replace(/^\/+/, '');
      relative = decodeURIComponent(relative);
      const target = path.resolve(WEB_ROOT, relative);
      if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const file = await stat(target);
      if (!file.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': MIME_TYPES.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

async function startDenyProxy() {
  const attempts = [];
  const server = net.createServer(socket => {
    let received = '';
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', chunk => {
      received += chunk.toString('latin1');
      if (!received.includes('\r\n')) return;
      const firstLine = received.split('\r\n', 1)[0];
      const [method, target = ''] = firstLine.split(' ');
      let destination = 'unparseable';
      try {
        if (method === 'CONNECT') destination = new URL(`http://${target}`).host;
        else destination = new URL(target).origin;
      } catch {}
      attempts.push({ method: method || 'unknown', destination });
      socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port, attempts };
}

function observeContext(context, origin) {
  const externalRequests = new Set();
  const pageErrors = [];
  const webSockets = new Set();
  const localFailures = [];
  context.on('request', request => {
    try {
      const url = new URL(request.url());
      if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') externalRequests.add(`${request.method()} ${url.origin}${url.pathname}`);
    } catch { externalRequests.add('unparseable request URL'); }
  });
  context.on('requestfailed', request => {
    if (request.url().startsWith(origin)) localFailures.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    externalRequests.add(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const pageEvents = page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('websocket', socket => webSockets.add(new URL(socket.url()).origin));
  };
  return { externalRequests, pageErrors, webSockets, localFailures, pageEvents };
}

function verifyNoExternalTraffic(observed, proxyAttempts, label) {
  assert.equal(observed.externalRequests.size, 0, `${label}: external HTTP requests attempted: ${[...observed.externalRequests].join(', ')}`);
  assert.equal(observed.webSockets.size, 0, `${label}: WebSocket connections attempted: ${[...observed.webSockets].join(', ')}`);
  assert.equal(proxyAttempts.length, 0, `${label}: deny proxy received requests: ${JSON.stringify(proxyAttempts)}`);
  assert.equal(observed.pageErrors.length, 0, `${label}: browser runtime errors: ${observed.pageErrors.join(' | ')}`);
}

async function openFreshPage(browser, origin, basePath) {
  const context = await browser.newContext({
    serviceWorkers: 'allow'
  });
  const observed = observeContext(context, origin);
  const page = await context.newPage();
  observed.pageEvents(page);
  await page.goto(`${origin}${basePath}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('#create-account-button').waitFor({ state: 'visible', timeout: 20000 });
  return { context, page, observed };
}

async function writeReport(output, report) {
  const directory = path.resolve(output);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, 'browser-pwa-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}

async function main() {
  let options;
  let serverInfo;
  let proxyInfo;
  let browserInfo;
  const report = {
    schema_version: 1,
    cases: [
      { case: 'G02-02', status: 'NOT_RUN', reason: 'Browser scenario has not started.' },
      { case: 'G02-03', status: 'NOT_RUN', reason: 'Browser scenario has not started.' }
    ],
    external_http_attempts: [],
    external_websocket_attempts: [],
    denied_proxy_attempts: [],
    page_errors: [],
    local_request_failures: []
  };
  try {
    options = parseArgs(process.argv.slice(2));
    await access(WEB_ROOT);
    [serverInfo, proxyInfo] = await Promise.all([startStaticServer(), startDenyProxy()]);
    const origin = `http://127.0.0.1:${serverInfo.port}`;
    browserInfo = await resolvePlaywright(options, proxyInfo.port);
    report.browser = browserInfo.evidence;
    report.local_origin = origin;
    report.service_worker_policy = 'allowed; local static server only; external HTTP requests are intercepted; browser proxy is a loopback deny proxy';
    proxyInfo.attempts.length = 0;

    const rootPage = await openFreshPage(browserInfo.browser, origin, '/');
    verifyNoExternalTraffic(rootPage.observed, proxyInfo.attempts, 'root URL');
    await rootPage.context.close();
    const subpathPage = await openFreshPage(browserInfo.browser, origin, '/property/');
    verifyNoExternalTraffic(subpathPage.observed, proxyInfo.attempts, '/property/ URL');
    report.cases[0] = { case: 'G02-02', status: 'PASS', reason: 'Fresh root and /property/ pages loaded from the local bundle with no external HTTP, WebSocket or deny-proxy attempts.' };

    const { page, context, observed } = subpathPage;
    // The first service-worker controllerchange intentionally reloads an idle
    // page. Wait for that lifecycle transition before opening the setup pane so
    // the test does not race the app's normal offline-shell activation.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
    await page.locator('#create-account-button').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#create-account-button').click();
    await page.locator('#auth-setup').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#new-password').fill(TEST_PASSWORD);
    await page.locator('#confirm-password').fill(TEST_PASSWORD);
    await page.locator('#finish-create-button').click();
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
    assert.equal((await page.locator('#connection-label').textContent()).trim(), 'offline', 'new identity remains disconnected without configured relays');
    verifyNoExternalTraffic(observed, proxyInfo.attempts, 'identity creation');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
    assert.equal((await page.locator('#connection-label').textContent()).trim(), 'offline', 'remembered identity reload remains disconnected');

    await new Promise((resolve, reject) => {
      serverInfo.server.close(error => error ? reject(error) : resolve());
      serverInfo.server.closeAllConnections?.();
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
    assert.equal((await page.locator('#connection-label').textContent()).trim(), 'offline', 'offline reload must not claim relay delivery');
    const cachedShell = await page.evaluate(async () => {
      const names = await caches.keys();
      const cachedIndex = await caches.match(new URL('./index.html', location.href).href);
      return names.some(name => name.startsWith('property-shell-')) && Boolean(cachedIndex);
    });
    assert.equal(cachedShell, true, 'offline reload must use the installed Property shell');
    assert.equal(observed.localFailures.length, 0, 'all local shell assets must remain available after the server stops');
    verifyNoExternalTraffic(observed, proxyInfo.attempts, 'offline identity reload');
    report.cases[1] = { case: 'G02-03', status: 'PASS', reason: 'Remembered identity and the cached PWA shell reopened after the local server stopped; relay status remained offline.' };
    report.external_http_attempts = [...observed.externalRequests];
    report.external_websocket_attempts = [...observed.webSockets];
    report.denied_proxy_attempts = [...proxyInfo.attempts];
    report.page_errors = observed.pageErrors;
    report.local_request_failures = observed.localFailures;
    await context.close();
    await browserInfo.browser.close();
    report.result = 'PASS';
    await writeReport(options.output, report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return 0;
  } catch (error) {
    const browserUnavailable = !browserInfo || /executable|module|package|version mismatch|ENOENT|permission|launch/i.test(error.message);
    const index = report.cases.findIndex(item => item.status === 'NOT_RUN');
    if (index >= 0) report.cases[index] = { case: report.cases[index].case, status: browserUnavailable ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) };
    for (let next = index + 1; next < report.cases.length; next++) {
      if (report.cases[next].status === 'NOT_RUN') report.cases[next] = { case: report.cases[next].case, status: 'BLOCKED', reason: 'A prerequisite browser case did not pass.' };
    }
    report.result = browserUnavailable ? 'BLOCKED' : 'FAIL';
    report.error = safeText(error.message || error);
    if (browserInfo?.browser) await browserInfo.browser.close().catch(() => {});
    if (serverInfo?.server?.listening) await new Promise(resolve => { serverInfo.server.close(() => resolve()); serverInfo.server.closeAllConnections?.(); });
    if (proxyInfo?.server?.listening) await new Promise(resolve => { proxyInfo.server.close(() => resolve()); proxyInfo.server.closeAllConnections?.(); });
    if (options?.output) await writeReport(options.output, report).catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return browserUnavailable ? 2 : 1;
  } finally {
    if (proxyInfo?.server?.listening) await new Promise(resolve => { proxyInfo.server.close(() => resolve()); proxyInfo.server.closeAllConnections?.(); });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`BLOCKED: ${String(error.message || error).slice(0, 1000)}\n`);
    process.exitCode = 2;
  });
}
