#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const value = argv[++i];
    if (!raw?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = raw.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate option ${raw}.`);
    args[name] = value;
  }
  for (const name of ['web_root', 'manifest', 'playwright_module', 'executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!args[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (![args.web_root, args.manifest, args.playwright_module, args.executable, args.output].every(path.isAbsolute)) {
    throw new Error('All filesystem paths must be absolute.');
  }
  for (const name of ['playwright_package_sha256', 'browser_executable_sha256']) {
    if (!/^[a-f0-9]{64}$/i.test(args[name])) throw new Error(`${name} must be a SHA-256 digest.`);
  }
  return args;
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function treeHash(root) {
  const entries = [];
  async function walk(dir, relative = '') {
    const names = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of names) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error(`Playwright package symlink is not allowed: ${rel}`);
      if (info.isDirectory()) await walk(full, rel);
      else if (info.isFile()) entries.push(`${rel}\0${sha(await readFile(full))}\n`);
      else throw new Error(`Unsupported Playwright package entry: ${rel}`);
    }
  }
  await walk(root);
  return sha(Buffer.from(entries.join('')));
}

const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.woff2', 'font/woff2']]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const webRoot = await import('node:fs/promises').then(fs => fs.realpath(args.web_root));
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  const packedWebFiles = new Set(manifest.files.filter(row => row.path.startsWith('property/web/')).map(row => `/${row.path.slice('property/web/'.length)}`));
  assert.ok(packedWebFiles.has('/index.html'), 'release manifest does not contain the PWA entry point');

  const packageInfo = JSON.parse(await readFile(path.join(path.dirname(args.playwright_module), 'package.json'), 'utf8'));
  assert.equal(packageInfo.name, 'playwright');
  assert.equal(packageInfo.version, args.playwright_version);
  assert.equal(await treeHash(path.dirname(args.playwright_module)), args.playwright_package_sha256);
  assert.equal(sha(await readFile(args.executable)), args.browser_executable_sha256);
  assert.ok((await stat(args.executable)).isFile());

  const serverRequests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(webRoot, `.${relative}`);
    if (!target.startsWith(`${webRoot}${path.sep}`) && target !== webRoot) return response.writeHead(403).end();
    serverRequests.push(relative);
    try {
      const bytes = await readFile(target);
      response.writeHead(200, { 'content-type': mime.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes);
    } catch {
      response.writeHead(404, { 'cache-control': 'no-store' }).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const proxyAttempts = [];
  const proxy = net.createServer(socket => {
    let firstLine = '';
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', chunk => {
      firstLine += chunk.toString('latin1');
      if (!firstLine.includes('\r\n')) return;
      const line = firstLine.split('\r\n', 1)[0].slice(0, 500);
      proxyAttempts.push(line);
      socket.end('HTTP/1.1 502 Offline test egress denied\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });

  let browser;
  const externalRequests = new Set();
  const scriptRequests = new Set();
  const dynamicScripts = new Set();
  const pageErrors = [];
  const requiredLocalAssetsMissing = new Set();
  try {
    const playwright = createRequire(args.playwright_module)(args.playwright_module);
    browser = await playwright.chromium.launch({ headless: true, executablePath: args.executable,
      proxy: { server: `http://127.0.0.1:${proxy.address().port}`, bypass: '127.0.0.1,localhost' },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
        '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection',
        '--disable-variations', '--disable-features=AutofillServerCommunication,OptimizationHints,OptimizationGuideModelDownloading,MediaRouter',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-first-run'] });
    assert.equal(browser.version(), args.browser_version);
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    await context.exposeBinding('__propertyReportDynamicScript', (_source, scriptSource) => dynamicScripts.add(scriptSource));
    await context.addInitScript(() => {
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          const scripts = [];
          if (node instanceof HTMLScriptElement) scripts.push(node);
          if (node?.querySelectorAll) scripts.push(...node.querySelectorAll('script'));
          for (const script of scripts) window.__propertyReportDynamicScript(script.src || 'inline-script');
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await context.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (['data:', 'blob:'].includes(requestUrl.protocol)) return route.continue();
      if (requestUrl.origin !== origin) {
        externalRequests.add(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 300)));
    page.on('websocket', socket => {
      const socketUrl = new URL(socket.url());
      if (socketUrl.origin !== origin) externalRequests.add(`WEBSOCKET ${socketUrl.origin}${socketUrl.pathname}`);
      socket.close();
    });
    page.on('request', request => {
      if (request.resourceType() !== 'script') return;
      const requestUrl = new URL(request.url());
      if (requestUrl.origin !== origin) externalRequests.add(`${request.method()} ${requestUrl.origin}${requestUrl.pathname}`);
      else {
        const assetPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
        scriptRequests.add(assetPath);
        if (!packedWebFiles.has(assetPath)) requiredLocalAssetsMissing.add(assetPath);
      }
    });
    for (const journey of ['first-open', 'reload-cached-shell']) {
      const response = journey === 'first-open'
        ? await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        : await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      assert.equal(response?.status(), 200, `${journey}: PWA did not return HTTP 200`);
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      assert.ok(await page.locator('body').innerText(), `${journey}: PWA body is empty`);
    }
    await context.close();
    assert.equal(externalRequests.size, 0, `PWA attempted undeclared egress: ${[...externalRequests].join(', ')}`);
    assert.equal(proxyAttempts.length, 0, `egress proxy observed undeclared host requests: ${proxyAttempts.join(', ')}`);
    assert.equal(requiredLocalAssetsMissing.size, 0, `PWA loaded executable assets outside release manifest: ${[...requiredLocalAssetsMissing].join(', ')}`);
    assert.equal(dynamicScripts.size, 0, `PWA dynamically inserted executable elements: ${[...dynamicScripts].join(', ')}`);
    assert.equal(pageErrors.length, 0, `PWA browser errors: ${pageErrors.join('; ')}`);
    assert.ok(scriptRequests.size > 0, 'browser did not load any PWA executable assets');
    assert.ok(serverRequests.includes('/index.html'));
    const report = { schema_version: 1, result: 'PASS', journeys: 2, external_hosts_requested: 0,
      blocked_proxy_requests: 0, undeclared_executable_assets: 0, dynamic_script_elements: 0,
      page_errors: 0, unique_local_script_assets: scriptRequests.size, local_http_requests: serverRequests.length,
      playwright_version: packageInfo.version, playwright_package_sha256: args.playwright_package_sha256,
      browser_version: browser.version(), browser_executable_sha256: args.browser_executable_sha256,
      release_source_commit: manifest.source_commit };
    await mkdir(args.output, { recursive: true, mode: 0o700 });
    await writeFile(path.join(args.output, 'browser-egress-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await browser?.close().catch(() => {});
    await new Promise(resolve => server.close(() => resolve()));
    await new Promise(resolve => proxy.close(() => resolve()));
  }
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 900)}\n`);
  process.exitCode = 1;
});
