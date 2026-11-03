#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PASSWORD = 'Property-offline-test-2026!';
const CASES = ['G03-01', 'G03-02', 'G03-03', 'G03-04', 'G03-05', 'G03-06'];
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
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (options.engine !== 'chromium') throw new Error('G03 UI test requires the manifest-pinned Chromium engine.');
  if (!path.isAbsolute(options.playwright_module) || !path.isAbsolute(options.executable)) throw new Error('Pinned tool paths must be absolute.');
  for (const name of ['playwright_package_sha256', 'browser_executable_sha256']) {
    if (!/^[a-f0-9]{64}$/i.test(options[name])) throw new Error(`${name} must be SHA-256.`);
  }
  return options;
}

async function sha256File(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function sha256Tree(directory) {
  const entries = [];
  async function walk(current, prefix = '') {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name), relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Pinned Playwright tree contains symlink ${relative}.`);
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) entries.push(`${relative}\0${await sha256File(absolute)}\n`);
      else throw new Error(`Pinned Playwright tree contains non-file ${relative}.`);
    }
  }
  await walk(directory);
  return createHash('sha256').update(entries.join('')).digest('hex');
}

function startAppServer() {
  const types = new Map([['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json'], ['.svg', 'image/svg+xml'],
    ['.webmanifest', 'application/manifest+json'], ['.png', 'image/png'], ['.woff2', 'font/woff2']]);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') return response.writeHead(405).end();
      const url = new URL(request.url, 'http://127.0.0.1');
      let relative = url.pathname === '/' || url.pathname === '/property' || url.pathname === '/property/'
        ? 'index.html' : url.pathname.startsWith('/property/') ? url.pathname.slice('/property/'.length) : url.pathname.replace(/^\/+/, '');
      relative = decodeURIComponent(relative);
      const target = path.resolve(WEB, relative);
      if (target !== WEB && !target.startsWith(WEB + path.sep)) return response.writeHead(403).end();
      const info = await stat(target);
      if (!info.isFile()) return response.writeHead(404).end();
      response.writeHead(200, { 'content-type': types.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(target));
    } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); }
  });
  return { server, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

function startDenyProxy() {
  const attempts = [];
  const server = net.createServer(socket => {
    let requestLine = '';
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('data', chunk => {
      requestLine += chunk.toString('latin1');
      if (!requestLine.includes('\r\n')) return;
      const [method, target = ''] = requestLine.split('\r\n', 1)[0].split(' ');
      let destination = 'unparseable';
      try { destination = method === 'CONNECT' ? new URL(`http://${target}`).host : new URL(target).origin; } catch {}
      attempts.push({ method: method || 'unknown', destination });
      socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  return { server, attempts, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

function instrument(context, origin, report) {
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) report.external_requests.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  context.on('page', page => page.on('pageerror', error => report.page_errors.push(safeText(error.message))));
  context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    return route.abort('blockedbyclient');
  });
}

async function loadPlaywright(options, proxyPort) {
  await access(options.playwright_module);
  const packagePath = path.join(path.dirname(options.playwright_module), 'package.json');
  const info = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(info.name, 'playwright');
  assert.equal(info.version, options.playwright_version);
  assert.equal(await sha256Tree(path.dirname(options.playwright_module)), options.playwright_package_sha256);
  const playwright = createRequire(options.playwright_module)(options.playwright_module);
  assert.equal(await sha256File(options.executable), options.browser_executable_sha256);
  const launch = { headless: true, executablePath: options.executable, proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection',
      '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'] };
  const browser = await playwright.chromium.launch(launch);
  assert.equal(browser.version(), options.browser_version);
  return { playwright, browser, launch, evidence: { engine: options.engine, playwright_version: info.version,
    playwright_package_sha256: options.playwright_package_sha256, browser_version: browser.version(),
    browser_executable_sha256: options.browser_executable_sha256 } };
}

async function openPage(context, origin) {
  const page = await context.newPage();
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const auth = document.querySelector('#auth-choice');
    const workspace = document.querySelector('#workspace');
    return Boolean(auth && !auth.classList.contains('hidden')) || Boolean(workspace && !workspace.classList.contains('hidden'));
  }, null, { timeout: 20000 });
  return page;
}

async function createIdentity(page, remember) {
  await page.locator('#create-account-button').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#create-account-button').click();
  await page.locator('#auth-setup').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#new-password').fill(PASSWORD);
  await page.locator('#confirm-password').fill(PASSWORD);
  if (!remember) await page.locator('#remember-device').uncheck();
  await page.locator('#finish-create-button').click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  return await page.locator('#profile-npub').textContent();
}

async function vaultAudit(page) {
  return await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('liberdade-local-v1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['vault', 'settings', 'conversations', 'messages']);
    const vault = await new Promise((resolve, reject) => {
      const request = transaction.objectStore('vault').get('account');
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    const conversations = await new Promise((resolve, reject) => {
      const request = transaction.objectStore('conversations').getAll();
      request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
    });
    const serialized = JSON.stringify(vault || {});
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)))].map(v => v.toString(16).padStart(2, '0')).join('');
    const result = { present: Boolean(vault), pubkey: vault?.pubkey || '', version: vault?.version || null,
      encrypted_fields_present: Boolean(vault?.salt && vault?.iv && vault?.cipher), session_present: Boolean(vault?.session?.key),
      json_sha256: digest, serialized_contains_test_password: serialized.includes('Property-offline-test-2026!'),
      serialized_contains_nsec: /nsec1/i.test(serialized), private_key_fields: Object.keys(vault || {}).filter(key => /secret|private.?key|mnemonic/i.test(key)),
      conversation_count: conversations.length, conversation_pubkeys: conversations.map(item => item.pubkey) };
    db.close(); return result;
  });
}

async function readSensitiveStorage(page) {
  return await page.evaluate(async () => {
    const names = await new Promise((resolve, reject) => { const request = indexedDB.databases(); request.then(rows => resolve(rows.map(row => row.name || ''))).catch(reject); });
    return { local_storage: JSON.stringify(localStorage), session_storage: JSON.stringify(sessionStorage), database_names: names };
  });
}

async function clickNewChat(page) {
  await page.locator('#new-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
}

async function writeReport(directory, report) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, 'browser-g03-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}

async function main() {
  let options, app, proxy, runtime, persistentA, persistentB, importedContext;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g03-'));
  const report = { schema_version: 1, cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    external_requests: [], denied_proxy_attempts: [], page_errors: [], identities: {}, sessions: {}, backup: {}, contacts: {}, privacy: {} };
  const mark = (id, status, reason) => Object.assign(report.cases.find(item => item.case === id), { status, reason });
  try {
    options = parseArgs(process.argv.slice(2));
    app = startAppServer(); proxy = startDenyProxy(); await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    runtime = await loadPlaywright(options, proxy.server.address().port);
    report.browser = runtime.evidence; report.local_origin = origin;
    const userA = path.join(temp, 'profile A with spaces'), userB = path.join(temp, 'profile B with spaces');
    persistentA = await runtime.playwright.chromium.launchPersistentContext(userA, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    persistentB = await runtime.playwright.chromium.launchPersistentContext(userB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(persistentA, origin, report); instrument(persistentB, origin, report);
    let pageA = await openPage(persistentA, origin);
    let pageB = await openPage(persistentB, origin);

    // G03-01: same password, two independent keys and encrypted local vaults.
    const npubA = await createIdentity(pageA, true);
    const npubB = await createIdentity(pageB, false);
    assert.match(npubA, /^npub1/); assert.match(npubB, /^npub1/); assert.notEqual(npubA, npubB);
    const auditA = await vaultAudit(pageA), auditB = await vaultAudit(pageB);
    for (const audit of [auditA, auditB]) {
      assert.equal(audit.present, true); assert.equal(audit.encrypted_fields_present, true);
      assert.equal(audit.serialized_contains_test_password, false); assert.equal(audit.serialized_contains_nsec, false);
      assert.deepEqual(audit.private_key_fields, []);
    }
    assert.equal(auditA.session_present, true); assert.equal(auditB.session_present, false);
    report.identities = { two_contexts_created: true, same_password_used: true, distinct_public_keys: true,
      account_a: { pubkey: auditA.pubkey, encrypted_fields_present: auditA.encrypted_fields_present, session_present: auditA.session_present },
      account_b: { pubkey: auditB.pubkey, encrypted_fields_present: auditB.encrypted_fields_present, session_present: auditB.session_present } };
    mark('G03-01', 'PASS', 'A and B were created through the UI in separate persistent browser profiles with the same password; public keys differ and both vaults store encrypted key material without password/nsec fields.');

    // G03-02: close/reopen persistent browser profiles, password failures, session choice and manual lock.
    await persistentA.close(); persistentA = await runtime.playwright.chromium.launchPersistentContext(userA, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(persistentA, origin, report); pageA = await openPage(persistentA, origin);
    await pageA.locator('#workspace').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal((await pageA.locator('#profile-npub').textContent()).trim(), npubA, 'remembered session restores the same identity after a browser restart');

    await persistentB.close(); persistentB = await runtime.playwright.chromium.launchPersistentContext(userB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(persistentB, origin, report); pageB = await openPage(persistentB, origin);
    assert.equal(await pageB.locator('#workspace').isVisible(), false, 'non-remembered account does not auto-unlock after browser restart');
    const beforeWrongPassword = await vaultAudit(pageB);
    await pageB.locator('#password').fill('senha-errada-2026!'); await pageB.locator('#unlock-button').click();
    await pageB.waitForFunction(() => /Senha incorreta/.test(document.querySelector('#auth-error')?.textContent || ''), null, { timeout: 15000 });
    const afterWrongPassword = await vaultAudit(pageB);
    assert.equal(afterWrongPassword.json_sha256, beforeWrongPassword.json_sha256, 'wrong password leaves the vault unchanged');
    await pageB.locator('#password').fill(PASSWORD); await pageB.locator('#remember-login').uncheck(); await pageB.locator('#unlock-button').click();
    await pageB.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal((await pageB.locator('#profile-npub').textContent()).trim(), npubB);
    await pageB.locator('#profile-button').click(); await pageB.locator('#profile-dialog').waitFor({ state: 'visible' });
    await pageB.locator('#lock-account').click();
    await pageB.locator('#auth-screen').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await pageB.locator('#workspace').isVisible(), false);
    const afterLock = await vaultAudit(pageB);
    assert.equal(afterLock.session_present, false, 'manual lock clears the remembered session key');
    report.sessions = { remembered_profile_auto_unlock_after_restart: true, non_remembered_profile_requires_password: true,
      wrong_password_kept_vault_unchanged: true, correct_password_restored_same_identity: true,
      manual_lock_hid_workspace: true, manual_lock_cleared_session: true,
      idle_timeout: { status: 'DELEGATED_TO_G11', reason: 'G11 exercises this behavior with the injected logical clock and a fixed repetition count.' } };
    mark('G03-02', 'PASS', 'Persistent browser restart restored A only when requested; B required the correct password, rejected the wrong one without vault mutation, and manual lock cleared the session.');

    // G03-04/05: contacts obtained from the profile UI; invalid inputs stay local and explain accepted formats.
    await clickNewChat(pageA);
    await pageA.locator('#peer-input').fill(npubB); await pageA.locator('#peer-name-input').fill('Contato visto no perfil');
    await pageA.locator('#start-chat-button').click(); await pageA.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    assert.equal((await pageA.locator('#chat-title').textContent()).trim(), 'Contato visto no perfil');
    const npubChatTitle = (await pageA.locator('#chat-subtitle').textContent()).trim(); assert.equal(npubChatTitle, npubB);
    const profileHint = await pageA.evaluate(pubkey => NostrTools.nip19.nprofileEncode({ pubkey, relays: ['ws://127.0.0.1:7447'] }), auditB.pubkey);
    await clickNewChat(pageA); await pageA.locator('#peer-input').fill(profileHint); await pageA.locator('#start-chat-button').click();
    await pageA.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    const hintRecord = await pageA.evaluate(async pubkey => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const row = await new Promise((resolve, reject) => { const request = db.transaction('conversations').objectStore('conversations').get(pubkey); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close(); return row;
    }, auditB.pubkey);
    assert.deepEqual(hintRecord.relayHints, ['ws://127.0.0.1:7447']);
    assert.equal(hintRecord.title, 'Contato visto no perfil', 'existing local name remains stable when the same contact is opened through nprofile');
    report.contacts = { npub_from_profile_ui_opened_expected_contact: true, nprofile_hints_kept_local: true,
      no_relay_connection_started_by_opening_contact: true, new_chat_did_not_change_identity: true };
    mark('G03-04', 'PASS', 'The public key shown in B profile opened A’s conversation; a valid nprofile preserved its local relay hint and did not connect automatically.');

    const invalidAttempts = [];
    const tryInvalid = async (value, expected, label) => {
      await clickNewChat(pageA); await pageA.locator('#peer-input').fill(value); await pageA.locator('#start-chat-button').click();
      const error = (await pageA.locator('#new-chat-error').textContent()).trim();
      assert.match(error, expected, `${label} has a clear Portuguese validation message`);
      assert.equal(await pageA.locator('#new-chat-dialog').isVisible(), true, `${label} must not close the dialog`);
      invalidAttempts.push({ input_type: label, rejected: true, message: error });
      await pageA.locator('#new-chat-dialog form button[aria-label="Fechar"]').click();
    };
    await tryInvalid('', /Informe o contato público/iu, 'empty');
    await tryInvalid('npub1coercaodobem', /validar|completo|npub/iu, 'truncated-npub');
    await tryInvalid('coercaodobem', /não busca nomes|npub|nprofile|hex/iu, 'plain-name');
    await tryInvalid('nsec1not-a-public-contact', /chave privada nsec|não a compartilhe/iu, 'private-nsec');
    await tryInvalid(npubA, /consigo mesmo/iu, 'self-contact');
    assert.equal((await pageA.locator('#profile-npub').textContent()).trim(), npubA, 'invalid contacts do not change the local identity');
    report.contacts.invalid_inputs = invalidAttempts;
    mark('G03-05', 'PASS', 'Empty, truncated, name-only, nsec and self contacts were rejected in Portuguese without closing the dialog, creating the wrong contact or changing identity.');

    // G03-03: encrypted backup UI restores the same identity in a fresh context; the contact is reopened by its public address.
    await pageA.locator('#profile-button').click(); await pageA.locator('#profile-dialog').waitFor({ state: 'visible' });
    const downloadPromise = pageA.waitForEvent('download'); pageA.once('dialog', dialog => dialog.accept(PASSWORD));
    await pageA.locator('#export-backup').click();
    const download = await downloadPromise; const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(backup.format, 'property-encrypted-key-v1'); assert.equal(backup.pubkey, auditA.pubkey);
    assert.equal(JSON.stringify(backup).includes(PASSWORD), false); assert.equal(JSON.stringify(backup).includes('nsec1'), false);
    importedContext = await runtime.browser.newContext({ acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(importedContext, origin, report);
    const importedPage = await openPage(importedContext, origin);
    await importedPage.locator('#import-account-button').click();
    await importedPage.locator('#auth-import').waitFor({ state: 'visible' });
    await importedPage.locator('#import-secret').fill(JSON.stringify(backup)); await importedPage.locator('#import-password').fill(PASSWORD);
    await importedPage.locator('#finish-import-button').click(); await importedPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await importedPage.locator('#profile-npub').textContent()).trim(), npubA, 'import restores same identity');
    await clickNewChat(importedPage); await importedPage.locator('#peer-input').fill(npubB); await importedPage.locator('#peer-name-input').fill('Contato restaurado');
    await importedPage.locator('#start-chat-button').click(); await importedPage.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    assert.equal((await importedPage.locator('#chat-title').textContent()).trim(), 'Contato restaurado');
    report.backup = { exported_through_profile_ui: true, format: backup.format, restored_pubkey_matches: true,
      password_not_in_backup: true, private_key_not_in_backup: true, restored_identity_can_open_public_contact: true,
      server_side_recovery_or_identity_reset: 'none' };
    mark('G03-03', 'PASS', 'The UI exported an encrypted backup and a clean context imported the same public identity; it could reopen the contact using the other person’s public npub.');

    // G03-06: inspect only sanitized storage properties and observed request metadata.
    const storageA = await readSensitiveStorage(pageA), storageImported = await readSensitiveStorage(importedPage);
    for (const storage of [storageA, storageImported]) {
      const serialized = storage.local_storage + storage.session_storage;
      assert.equal(serialized.includes(PASSWORD), false, 'password is not in Web Storage');
      assert.equal(/nsec1|private.?key|mnemonic/i.test(serialized), false, 'Web Storage has no private-key material');
      assert.ok(storage.database_names.includes('liberdade-local-v1'));
    }
    assert.deepEqual(report.external_requests, [], 'browser made no external request');
    assert.deepEqual(proxy.attempts, [], 'deny proxy received no request');
    assert.deepEqual(report.page_errors, [], 'browser emitted no runtime errors');
    report.privacy = { external_requests: 0, denied_proxy_attempts: 0, page_errors: 0,
      web_storage_contains_password: false, web_storage_contains_private_key: false,
      central_login_or_recovery_endpoint: 'none observed', captured_values: 'request method/origin/path only; no bodies or secrets' };
    mark('G03-06', 'PASS', 'Across creation, lock, backup and contact flows, only localhost assets were requested; passwords/private keys were absent from Web Storage and no central login/recovery request was observed.');
    report.result = report.cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    await writeReport(path.resolve(options.output), report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const current = report.cases.find(item => item.status === 'NOT_RUN');
    if (current) Object.assign(current, { status: /browser|module|executable|package|ENOENT|permission|launch|version mismatch/i.test(error.message) ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) });
    for (const later of report.cases) if (later.status === 'NOT_RUN') Object.assign(later, { status: 'BLOCKED', reason: 'A prior G03 case failed; dependent UI flow was not started.' });
    report.result = report.cases.some(item => item.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    report.error = safeText(error.message || error);
    await writeReport(path.resolve(options?.output || path.join(temp, 'report')), report).catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await importedContext?.close().catch(() => {});
    await persistentA?.close().catch(() => {}); await persistentB?.close().catch(() => {});
    await runtime?.browser?.close().catch(() => {});
    for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
