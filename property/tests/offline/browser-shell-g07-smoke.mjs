#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = path.join(PROPERTY_ROOT, 'web');
const SW_FILE = path.join(WEB_ROOT, 'sw.js');
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const PLAN_FILE = path.join(PROPERTY_ROOT, 'docs/plano-agentes-human-first.md');
function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('Use pares --nome valor.');
    values[argv[i].slice(2).replaceAll('-', '_')] = argv[i + 1];
  }
  for (const key of ['playwright_module', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output', 'engine']) {
    if (!values[key]) throw new Error(`Opção obrigatória ausente: --${key.replaceAll('_', '-')}`);
  }
  if (!['chromium', 'firefox'].includes(values.engine)) throw new Error('--engine deve ser chromium ou firefox.');
  for (const key of ['playwright_package_sha256', 'browser_executable_sha256']) {
    if (!/^[a-f0-9]{64}$/i.test(values[key])) throw new Error(`--${key.replaceAll('_', '-')} precisa ser SHA-256.`);
  }
  return values;
}
const options = parseArgs(process.argv.slice(2));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async file => hash(await readFile(file));
async function hashTree(directory) {
  const items = [];
  async function walk(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, item.name), relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error(`Link simbólico inesperado em Playwright: ${relative}`);
      if (item.isDirectory()) await walk(absolute, relative);
      else items.push(`${relative}\0${await hashFile(absolute)}\n`);
    }
  }
  await walk(directory);
  return hash(items.join(''));
}
const safe = value => String(value).replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1000);
const modulePath = path.resolve(options.playwright_module);
const executable = path.resolve(options.executable);
await access(modulePath);
const packageDir = path.dirname(modulePath);
const packageInfo = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
assert.equal(packageInfo.name, 'playwright');
assert.equal(packageInfo.version, options.playwright_version);
assert.equal(await hashTree(packageDir), options.playwright_package_sha256);
assert.equal(await hashFile(executable), options.browser_executable_sha256);
const playwright = createRequire(modulePath)(modulePath);
const swSource = await readFile(SW_FILE, 'utf8');
const cacheName = swSource.match(/const CACHE = '([^']+)';/)?.[1];
const shellSource = swSource.match(/const SHELL = (\[[^\n]+\]);/)?.[1];
assert.ok(cacheName && shellSource, 'service worker cache and shell list are statically declared');
const shell = [...shellSource.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.ok(shell.length >= 10, 'the shell manifest has at least ten local resources');
const openChecks = [], offlineReloads = [], staticChecks = [], appExternalRequests = [], blockedBrowserProbes = [], pageErrors = [], consoleWarnings = [], serverFailures = [], requests = [];
let proxy, server, browser, diagnosticPage;
const report = {
  schema_version: 1,
  gate: 'G7',
  status: 'RUNNING',
  host: 'Ubuntu/Linux x64',
  engine: options.engine,
  browser_version: options.browser_version,
  playwright_version: packageInfo.version,
  playwright_package_sha256: options.playwright_package_sha256,
  browser_executable_sha256: options.browser_executable_sha256,
  harness_sha256: await hashFile(SCRIPT_FILE),
  plan_sha256: await hashFile(PLAN_FILE),
  service_worker_sha256: hash(swSource),
  service_worker_cache: cacheName,
  shell_manifest_count: shell.length,
  fixed_counts: { service_worker_open_control: 10, offline_reload: 10, static_resource_integrity: 10 },
  cases: [],
  app_external_requests: appExternalRequests,
  browser_runtime_probes_blocked_by_loopback_proxy: blockedBrowserProbes,
  browser_page_errors: pageErrors,
  browser_console_warnings: consoleWarnings,
  human_review: 'PENDING',
  non_ubuntu_platforms: 'PENDING',
  server_404s: serverFailures
};
const outputDir = path.resolve(options.output);
await mkdir(outputDir, { recursive: true, mode: 0o700 });
const reportPath = path.join(outputDir, `browser-shell-g07-${options.engine}.json`);
const checkpoint = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

try {
  proxy = net.createServer(socket => {
    let request = '';
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', chunk => {
      request += chunk.toString('latin1');
      if (!request.includes('\r\n')) return;
      blockedBrowserProbes.push(request.split('\r\n', 1)[0].slice(0, 300));
      socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  const deniedPort = proxy.address().port;
  const launch = {
    headless: true,
    executablePath: executable,
    proxy: { server: `http://127.0.0.1:${deniedPort}`, bypass: '127.0.0.1,localhost' },
    ...(options.engine === 'chromium' ? { args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions',
      '--disable-client-side-phishing-detection', '--disable-variations', '--no-first-run'
    ] } : { firefoxUserPrefs: {
      'dom.serviceWorkers.enabled': true,
      'toolkit.telemetry.enabled': false, 'datareporting.healthreport.uploadEnabled': false,
      'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.server': '',
      'app.update.enabled': false, 'browser.newtabpage.enabled': false,
      'app.update.auto': false, 'app.update.background.enabled': false,
      'app.update.background.scheduling.enabled': false, 'extensions.update.enabled': false,
      'app.normandy.enabled': false, 'app.normandy.api_url': '',
      'browser.shell.checkDefaultBrowser': false, 'network.captive-portal-service.enabled': false,
      'network.connectivity-service.enabled': false
    } })
  };
  browser = await playwright[options.engine].launch(launch);
  assert.equal(browser.version(), options.browser_version);

  const mime = new Map([
    ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
    ['.webmanifest', 'application/manifest+json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml']
  ]);
  server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') return res.writeHead(405).end();
      const url = new URL(req.url, 'http://127.0.0.1');
      const relative = url.pathname === '/' || url.pathname === '/property/' ? 'index.html' : url.pathname.replace(/^\/property\//, '');
      const target = path.resolve(WEB_ROOT, decodeURIComponent(relative));
      if (!target.startsWith(`${WEB_ROOT}${path.sep}`)) return res.writeHead(403).end();
      const body = await readFile(target);
      requests.push(url.pathname);
      res.writeHead(200, { 'content-type': mime.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { serverFailures.push(req.url.slice(0, 300)); res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function newContext() {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    context.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') appExternalRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    });
    context.on('page', page => {
      page.on('pageerror', error => pageErrors.push(safe(error.message)));
      page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleWarnings.push(safe(message.text())); });
    });
    return context;
  }

  async function verifyShell(page, cycle) {
    const evidence = await page.evaluate(async ({ origin, cacheName, shell }) => {
      const names = await caches.keys();
      const cacheExists = names.includes(cacheName);
      const cache = cacheExists ? await caches.open(cacheName) : null;
      const entries = [];
      for (const relative of shell) {
        const url = new URL(relative, `${origin}/property/`).href;
        const response = await cache?.match(url);
        if (!response || !response.ok) { entries.push({ resource: relative, present: false }); continue; }
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        entries.push({ resource: relative, present: true, bytes: bytes.byteLength, sha256: digest });
      }
      return { controller: Boolean(navigator.serviceWorker?.controller), controller_script: navigator.serviceWorker?.controller?.scriptURL || '',
        cache_exists: cacheExists, cached_resources: entries };
    }, { origin, cacheName, shell });
    assert.equal(evidence.controller, true, `G7-${cycle}: page is not controlled by its service worker`);
    assert.equal(new URL(evidence.controller_script).pathname, '/property/sw.js');
    assert.equal(evidence.cache_exists, true, `G7-${cycle}: expected cache ${cacheName} missing`);
    assert.equal(evidence.cached_resources.length, shell.length);
    for (const item of evidence.cached_resources) {
      assert.equal(item.present, true, `G7-${cycle}: cache missing ${item.resource}`);
      const diskRelative = item.resource === './' ? 'index.html' : item.resource.replace(/^\.\//, '').split('?')[0];
      const disk = await readFile(path.join(WEB_ROOT, diskRelative));
      assert.ok(item.bytes > 0, `G7-${cycle}: empty cache entry ${item.resource}`);
      assert.equal(item.sha256, hash(disk), `G7-${cycle}: cached bytes differ for ${item.resource}`);
    }
    return evidence;
  }

  for (let cycle = 1; cycle <= 10; cycle++) {
    const context = await newContext();
    const page = await context.newPage();
    diagnosticPage = page;
    let error = null;
    page.on('pageerror', issue => { error = safe(issue.message); });
    try {
      await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#create-account-button').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 });
      const shellEvidence = await verifyShell(page, cycle);
      assert.equal(error, null);
      openChecks.push({ cycle, status: 'PASS', controller_script: shellEvidence.controller_script,
        cache_exists: shellEvidence.cache_exists, checked_resources: shellEvidence.cached_resources.length,
        all_static_hashes_match_checkout: true });
    } catch (issue) {
      const diagnostics = await page.evaluate(async () => ({
        secure_context: window.isSecureContext,
        service_worker_api: 'serviceWorker' in navigator,
        registrations: (await navigator.serviceWorker?.getRegistrations?.() || []).map(registration => ({
          scope: registration.scope,
          active: registration.active ? { state: registration.active.state, script_url: registration.active.scriptURL } : null,
          installing: registration.installing ? { state: registration.installing.state, script_url: registration.installing.scriptURL } : null,
          waiting: registration.waiting ? { state: registration.waiting.state, script_url: registration.waiting.scriptURL } : null
        })),
        cache_names: await caches.keys()
      })).catch(diagnosticError => ({ diagnostic_error: safe(diagnosticError.message) }));
      openChecks.push({ cycle, status: 'FAIL', error: safe(issue.message), diagnostics });
      throw issue;
    } finally { await context.close(); }
    report.cases = [...openChecks.map(item => ({ group: 'open-control', ...item }))];
    await checkpoint();
  }

  const offlineContext = await newContext();
  const offlinePage = await offlineContext.newPage();
  diagnosticPage = offlinePage;
  offlinePage.on('pageerror', error => pageErrors.push(safe(error.message)));
  await offlinePage.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await offlinePage.locator('#create-account-button').waitFor({ state: 'visible', timeout: 30000 });
  await offlinePage.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 });
  await verifyShell(offlinePage, 'offline-prime');
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections?.();
  });
  await offlineContext.setOffline(true);
  for (let cycle = 1; cycle <= 10; cycle++) {
    try {
      await offlinePage.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await offlinePage.locator('#create-account-button').waitFor({ state: 'visible', timeout: 15000 });
      const state = await offlinePage.evaluate(async () => ({
        online: navigator.onLine,
        controlled: Boolean(navigator.serviceWorker?.controller),
        controller_script: navigator.serviceWorker?.controller?.scriptURL || '',
        cache_names: await caches.keys(),
        index_cached: Boolean(await caches.match(new URL('./index.html', location.href).href))
      }));
      assert.equal(state.online, false, `G7 offline cycle ${cycle}: browser reports online`);
      assert.equal(state.controlled, true, `G7 offline cycle ${cycle}: no service worker controller`);
      assert.equal(state.index_cached, true, `G7 offline cycle ${cycle}: shell index was not served from cache`);
      assert.ok(state.cache_names.includes(cacheName));
      offlineReloads.push({ cycle, status: 'PASS', online: state.online, controlled: state.controlled,
        index_cached: state.index_cached, cache_names: state.cache_names });
    } catch (issue) {
      offlineReloads.push({ cycle, status: 'FAIL', error: safe(issue.message) });
      throw issue;
    }
    report.cases = [
      ...openChecks.map(item => ({ group: 'open-control', ...item })),
      ...offlineReloads.map(item => ({ group: 'offline-reload', ...item }))
    ];
    await checkpoint();
  }
  await offlineContext.close();

  // Ten fixed resource-integrity audits, each covering every path in the SW shell manifest.
  for (let cycle = 1; cycle <= 10; cycle++) {
    const context = await newContext();
    const page = await context.newPage();
    diagnosticPage = page;
    try {
      await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#create-account-button').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 });
      const checked = await verifyShell(page, `static-${cycle}`);
      staticChecks.push({ cycle, status: 'PASS', checked_resources: checked.cached_resources.length,
        all_static_hashes_match_checkout: true, resources: checked.cached_resources.map(({ resource, bytes, sha256 }) => ({ resource, bytes, sha256 })) });
    } catch (issue) {
      staticChecks.push({ cycle, status: 'FAIL', error: safe(issue.message) });
      throw issue;
    } finally { await context.close(); }
    report.cases = [
      ...openChecks.map(item => ({ group: 'open-control', ...item })),
      ...offlineReloads.map(item => ({ group: 'offline-reload', ...item })),
      ...staticChecks.map(item => ({ group: 'static-resource-integrity', ...item }))
    ];
    await checkpoint();
  }

  report.result_counts = { open_control_pass: openChecks.filter(item => item.status === 'PASS').length,
    offline_reload_pass: offlineReloads.filter(item => item.status === 'PASS').length,
    static_integrity_pass: staticChecks.filter(item => item.status === 'PASS').length };
  report.app_external_requests = appExternalRequests;
  report.browser_page_errors = pageErrors;
  report.browser_console_warnings = consoleWarnings;
  assert.deepEqual(report.result_counts, { open_control_pass: 10, offline_reload_pass: 10, static_integrity_pass: 10 });
  assert.deepEqual(appExternalRequests, [], 'the Property shell must not request external network resources');
  assert.deepEqual(pageErrors, [], 'browser pages must not emit uncaught runtime errors');
  assert.ok(requests.length > 0, 'the local PWA server must have served the shell before offline tests');
  report.status = 'PASS_UBUNTU_TECHNICAL_PENDING_OTHER_PLATFORMS_AND_HUMAN_REVIEW';
  report.local_server_requests_before_offline = requests.length;
  report.server_404s = serverFailures;
  report.local_origin_only = true;
  report.network_boundary = 'All browser HTTP CONNECT traffic is directed to a local deny proxy. Browser-managed probes recorded in browser_runtime_probes_blocked_by_loopback_proxy received a local 502 and did not reach the public network; the Property app itself attempted no external requests.';
  if (options.engine === 'firefox') report.firefox_sandbox = 'security.sandbox.content.level=0 for this headless functional test only; default Firefox content sandbox behavior remains PENDING.';
  await checkpoint();
  process.stdout.write(`${JSON.stringify({ status: report.status, engine: options.engine, counts: report.result_counts, output: reportPath }, null, 2)}\n`);
} catch (error) {
  const blockedBeforeBrowserLaunch = !browser;
  report.status = blockedBeforeBrowserLaunch ? 'BLOCKED' : 'PENDING';
  report.case_status = blockedBeforeBrowserLaunch ? 'BLOCKED' : 'FAIL';
  report.error = safe(error.message || error);
  report.cases = [
    ...openChecks.map(item => ({ group: 'open-control', ...item })),
    ...offlineReloads.map(item => ({ group: 'offline-reload', ...item })),
    ...staticChecks.map(item => ({ group: 'static-resource-integrity', ...item }))
  ];
  report.open_control = openChecks;
  report.offline_reload = offlineReloads;
  report.static_resource_integrity = staticChecks;
  report.app_external_requests = appExternalRequests;
  report.browser_page_errors = pageErrors;
  report.local_server_requests = requests;
  report.server_404s = serverFailures;
  await checkpoint().catch(() => {});
  process.stderr.write(`${report.status}: ${report.error}\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
  if (proxy?.listening) await new Promise(resolve => { proxy.close(() => resolve()); proxy.closeAllConnections?.(); });
}
