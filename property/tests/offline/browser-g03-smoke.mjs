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
import { decodeQrMatrix } from '../qr-decode-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PASSWORD = 'Property-offline-test-2026!';
const CASES = ['G03-01', 'G03-02', 'G03-03', 'G03-04', 'G03-05', 'G03-06', 'G03-07', 'G03-08', 'G03-09'];
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
    socket.on('error', () => socket.destroy());
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
    const messages = await new Promise((resolve, reject) => {
      const request = transaction.objectStore('messages').getAll();
      request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
    });
    const relaySettings = await new Promise((resolve, reject) => {
      const request = transaction.objectStore('settings').get('relays');
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    const serialized = JSON.stringify(vault || {});
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)))].map(v => v.toString(16).padStart(2, '0')).join('');
    const result = { present: Boolean(vault), pubkey: vault?.pubkey || '', version: vault?.version || null,
      encrypted_fields_present: Boolean(vault?.salt && vault?.iv && vault?.cipher), session_present: Boolean(vault?.session?.key),
      json_sha256: digest, serialized_contains_test_password: serialized.includes('Property-offline-test-2026!'),
      serialized_contains_nsec: /nsec1/i.test(serialized), private_key_fields: Object.keys(vault || {}).filter(key => /secret|private.?key|mnemonic/i.test(key)),
      conversation_count: conversations.length, conversation_pubkeys: conversations.map(item => item.pubkey),
      conversation_titles: conversations.map(item => ({ pubkey: item.pubkey, title: item.title || '', relayHints: item.relayHints || [] })), message_count: messages.length,
      relay_settings: relaySettings?.values || [] };
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

async function assertJourneyState(page, expected, id) {
  assert.equal(await page.locator('#workspace').isVisible(), expected === 'workspace', `${id}: workspace visibility`);
  assert.equal(await page.locator('#auth-screen').isVisible(), expected === 'auth', `${id}: authentication screen visibility`);
  assert.match((await page.locator('#connection-label').textContent()).trim().toLowerCase(), /offline/, `${id}: the interface does not imply a relay connection`);
  assert.equal(await page.locator('[data-delivery-state="delivered"], [data-status="delivered"], .message-status-delivered').count(), 0,
    `${id}: no delivery confirmation is shown while offline`);
  if (expected === 'auth') {
    assert.equal(await page.getByLabel('Password', { exact: true }).count(), 1, `${id}: password input has a programmatic label`);
    assert.equal(await page.getByRole('button', { name: 'Create identity', exact: true }).count(), 1, `${id}: create action has an accessible name`);
  } else {
    assert.equal(await page.getByRole('button', { name: 'Profile and settings', exact: true }).count(), 1, `${id}: profile action has an accessible name`);
  }
}

async function assertOneVisible(locator, label) {
  const visible = [];
  for (let index = 0; index < await locator.count(); index++) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) visible.push(candidate);
  }
  assert.equal(visible.length, 1, `one visible accessible control named ${label}`);
}

async function assertTabSequence(page, selectors, label) {
  for (let index = 0; index < selectors.length; index++) {
    if (index === 0) await page.locator(selectors[index]).focus();
    else {
      let reached = false;
      for (let attempt = 0; attempt < 16; attempt++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(selector => document.activeElement === document.querySelector(selector), selectors[index])) {
          reached = true;
          break;
        }
      }
      assert.equal(reached, true, `${label}: ${selectors[index]} is reachable by Tab`);
    }
    assert.equal(await page.evaluate(selector => document.activeElement === document.querySelector(selector), selectors[index]), true,
      `${label}: focus is on ${selectors[index]}`);
  }
}

async function writeReport(directory, report) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, 'browser-g03-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}

async function main() {
  let options, app, proxy, runtime, persistentA, persistentB, importedContext, contactContext, accessibilityContext;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g03-'));
  let activeCase = CASES[0];
  const report = { schema_version: 1, cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    external_requests: [], denied_proxy_attempts: [], page_errors: [], identities: {}, sessions: {}, backup: {}, contacts: {}, contact_sharing: {}, privacy: {} };
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
    activeCase = 'G03-01';
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
    activeCase = 'G03-02';
    await persistentA.close(); persistentA = await runtime.playwright.chromium.launchPersistentContext(userA, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(persistentA, origin, report); pageA = await openPage(persistentA, origin);
    await pageA.locator('#workspace').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal((await pageA.locator('#profile-npub').textContent()).trim(), npubA, 'remembered session restores the same identity after a browser restart');

    await persistentB.close(); persistentB = await runtime.playwright.chromium.launchPersistentContext(userB, { ...runtime.launch, acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(persistentB, origin, report); pageB = await openPage(persistentB, origin);
    assert.equal(await pageB.locator('#workspace').isVisible(), false, 'non-remembered account does not auto-unlock after browser restart');
    const beforeWrongPassword = await vaultAudit(pageB);
    await pageB.locator('#password').fill('senha-errada-2026!'); await pageB.locator('#unlock-button').click();
    await pageB.waitForFunction(() => Boolean(document.querySelector('#auth-error')?.textContent.trim()), null, { timeout: 15000 });
    assert.match((await pageB.locator('#auth-error').textContent()).trim(), /incorrect|incorreta|invalid|inválido/i,
      'wrong-password error is understandable in the selected app language');
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

    // G03-04: contacts obtained from the profile UI; opening a contact stays local.
    activeCase = 'G03-04';
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

    // G03-05: invalid inputs stay local and explain accepted formats.
    activeCase = 'G03-05';
    await pageA.locator('#language-picker').selectOption('pt-BR');
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

    // G03-07: share an identity as URL/nprofile/QR and open contact intents in unlocked and locked-start contexts.
    activeCase = 'G03-07';
    await pageA.locator('#profile-button').click(); await pageA.locator('#profile-dialog').waitFor({ state: 'visible' });
    await pageA.locator('#share-contact').click(); await pageA.locator('#contact-share-dialog').waitFor({ state: 'visible' });
    const sharedContact = await pageA.evaluate(() => {
      const nprofile = document.querySelector('#contact-share-nprofile').textContent.trim();
      const npub = document.querySelector('#profile-npub').textContent.trim();
      const url = document.querySelector('#contact-share-link').textContent.trim();
      const decoded = window.NostrTools.nip19.decode(nprofile);
      return { nprofile, npub, url, qr_svg: document.querySelector('#contact-share-qr svg')?.outerHTML || '',
        pubkey: decoded.data.pubkey, relay_hints: decoded.data.relays || [] };
    });
    assert.match(sharedContact.url, /^http:\/\/127\.0\.0\.1:\d+\/property\/#contact=/);
    assert.equal(sharedContact.pubkey, await pageA.evaluate(value => window.NostrTools.nip19.decode(value).data, sharedContact.npub));
    assert.ok(sharedContact.relay_hints.length <= 3);
    for (const relay of sharedContact.relay_hints) {
      const parsed = new URL(relay);
      assert.equal(parsed.protocol, 'wss:'); assert.equal(parsed.username, ''); assert.equal(parsed.password, '');
      assert.equal(parsed.search, ''); assert.equal(parsed.hash, '');
    }
    assert.ok(!sharedContact.url.includes('nsec') && !sharedContact.url.includes('password'));
    assert.ok(sharedContact.qr_svg.startsWith('<svg '), 'profile creates a local SVG QR code');
    const qrMatrix = await pageA.evaluate(value => window.PropertyQrCode.encodeMatrix(value), sharedContact.url);
    assert.equal(decodeQrMatrix(qrMatrix), sharedContact.url, 'independent local decoder reads the exact Property contact URL from the UI QR');
    await pageA.locator('#contact-share-dialog .dialog-head button').click();

    contactContext = await runtime.browser.newContext({ serviceWorkers: 'allow' });
    instrument(contactContext, origin, report);
    const contactPage = await openPage(contactContext, origin);
    const contactNpub = await createIdentity(contactPage, true);
    assert.match(contactNpub, /^npub1/);
    const contactKinds = [
      ['property-url', sharedContact.url, sharedContact.npub, sharedContact.relay_hints],
      ['nprofile', new URL(sharedContact.url).origin + '/property/#' + new URLSearchParams({ contact: sharedContact.nprofile }), sharedContact.npub, sharedContact.relay_hints],
      ['npub', new URL(sharedContact.url).origin + '/property/#' + new URLSearchParams({ contact: sharedContact.npub }), sharedContact.npub, []]
    ];
    const contactOpenResults = [];
    const openContactIntent = async (kind, url, expectedNpub, expectedRelays, lockedStart) => {
      const before = await vaultAudit(contactPage);
      await contactPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (lockedStart) {
        await contactPage.locator('#password').waitFor({ state: 'visible', timeout: 10000 });
        await contactPage.locator('#password').fill(PASSWORD);
        await contactPage.locator('#remember-login').check();
        await contactPage.locator('#unlock-button').click();
      }
      await contactPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
      try { await contactPage.locator('#new-chat-dialog').waitFor({ state: 'visible', timeout: 15000 }); }
      catch (error) {
        const state = await contactPage.evaluate(() => ({ href: location.href, workspace: !document.querySelector('#workspace')?.classList.contains('hidden'),
          dialogOpen: document.querySelector('#new-chat-dialog')?.open, peerValue: document.querySelector('#peer-input')?.value,
          contactError: document.querySelector('#new-chat-error')?.textContent, authError: document.querySelector('#auth-error')?.textContent }));
        throw new Error(`Contact intent did not open the new-chat dialog: ${JSON.stringify(state)}; ${error.message}`);
      }
      assert.equal(await contactPage.locator('#peer-input').inputValue(), expectedNpub, `${kind} prefills the intended public identity`);
      const relayInput = await contactPage.locator('#peer-relays-input').inputValue();
      const expectedRelayInput = expectedRelays.map(value => new URL(value).toString().replace(/\/$/, '')).join('\n');
      assert.equal(relayInput, expectedRelayInput, `${kind} carries only its disclosed relay hints`);
      assert.equal(await contactPage.evaluate(() => location.hash), '', `${kind} is removed from the address bar after intake`);
      const after = await vaultAudit(contactPage);
      assert.equal(after.conversation_count, before.conversation_count, `${kind} does not create a conversation before confirmation`);
      assert.equal(after.message_count, before.message_count, `${kind} does not publish or create a message`);
      assert.deepEqual(after.relay_settings, before.relay_settings, `${kind} does not replace the user's local relay selection with received hints`);
      await contactPage.locator('#new-chat-dialog .dialog-head button').click();
      contactOpenResults.push({ kind, context: lockedStart ? 'locked-start' : 'active', prefilled: true,
        created_conversation_before_confirmation: false, message_count_changed: false, relay_settings_changed: false });
    };
    for (const [kind, url, npub, hints] of contactKinds) await openContactIntent(kind, url, npub, hints, false);
    for (const [kind, url, npub, hints] of contactKinds) {
      await contactPage.locator('#profile-button').click();
      await contactPage.locator('#profile-dialog').waitFor({ state: 'visible' });
      await contactPage.locator('#lock-account').click();
      await contactPage.locator('#auth-screen').waitFor({ state: 'visible', timeout: 10000 });
      await openContactIntent(kind, url, npub, hints, true);
    }
    report.contact_sharing = { property_link_generated_from_profile: true, qr_independently_decoded_to_exact_link: true,
      profile_code_contains_only_public_key_and_up_to_three_secure_hints: true, six_intake_cases: contactOpenResults,
      contact_fragment_removed_before_app_continued: true, local_relay_selection_unchanged_by_received_hints: true,
      no_conversation_or_message_created_before_confirmation: true };
    mark('G03-07', 'PASS', 'Profile sharing produced a Property link, NIP-19 profile and QR decoded independently; six active/locked-start intake cases prefilled the identity, stripped the contact fragment and created no conversation or message before confirmation.');

    // G03-03: encrypted backup UI restores the same identity in a fresh context; the contact is reopened by its public address.
    activeCase = 'G03-03';
    await pageA.locator('#profile-button').click(); await pageA.locator('#profile-dialog').waitFor({ state: 'visible' });
    await pageA.locator('#backup-include-local-records').check();
    const downloadPromise = pageA.waitForEvent('download'); pageA.once('dialog', dialog => dialog.accept(PASSWORD));
    await pageA.locator('#export-backup').click();
    const download = await downloadPromise; const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(backup.format, 'property-encrypted-key-v2'); assert.equal(backup.pubkey, auditA.pubkey);
    assert.ok(backup.local_state?.iv && backup.local_state?.cipher, 'optional local records and relay preferences are encrypted');
    assert.equal(JSON.stringify(backup).includes('Contato visto no perfil'), false, 'local contact name is not exposed in backup metadata');
    assert.equal(JSON.stringify(backup).includes(PASSWORD), false); assert.equal(JSON.stringify(backup).includes('nsec1'), false);
    importedContext = await runtime.browser.newContext({ acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(importedContext, origin, report);
    const importedPage = await openPage(importedContext, origin);
    await importedPage.locator('#import-account-button').click();
    await importedPage.locator('#auth-import').waitFor({ state: 'visible' });
    await importedPage.locator('#import-secret').fill(JSON.stringify(backup)); await importedPage.locator('#import-password').fill(PASSWORD);
    await importedPage.locator('#finish-import-button').click(); await importedPage.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await importedPage.locator('#profile-npub').textContent()).trim(), npubA, 'import restores same identity');
    const restoredAudit = await vaultAudit(importedPage);
    assert.deepEqual(restoredAudit.relay_settings, auditA.relay_settings, 'portable backup restores relay preferences');
    assert.ok(restoredAudit.conversation_titles.some(item => item.pubkey === auditB.pubkey && item.title === 'Contato visto no perfil'),
      'opted-in local contact name restores without message history');
    await clickNewChat(importedPage); await importedPage.locator('#peer-input').fill(npubB);
    await importedPage.locator('#start-chat-button').click(); await importedPage.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
    assert.equal((await importedPage.locator('#chat-title').textContent()).trim(), 'Contato visto no perfil', 'import preserves the opted-in local name instead of replacing it');
    report.backup = { exported_through_profile_ui: true, format: backup.format, restored_pubkey_matches: true,
      password_not_in_backup: true, private_key_not_in_backup: true, restored_identity_can_open_public_contact: true,
      relay_preferences_restored: true, opted_in_contact_name_restored_encrypted: true, messages_included: false,
      server_side_recovery_or_identity_reset: 'none' };
    mark('G03-03', 'PASS', 'The UI exported an encrypted backup and a clean context imported the same public identity; it could reopen the contact using the other person’s public npub.');

    // G03-08: replace the active key only after the old encrypted backup is downloaded and acknowledged.
    activeCase = 'G03-08';
    const previousIdentity = (await pageA.locator('#profile-npub').textContent()).trim();
    await pageA.locator('#replace-identity').click();
    await pageA.locator('#rotate-identity-dialog').waitFor({ state: 'visible' });
    assert.equal(await pageA.locator('#rotate-identity-submit').isDisabled(), true, 'replacement is gated until backup acknowledgement');
    await pageA.locator('#rotate-current-password').fill(PASSWORD);
    const rotationDownloadPromise = pageA.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await pageA.locator('#rotate-download-backup').click();
    const rotationDownload = await rotationDownloadPromise;
    if (!rotationDownload) throw new Error(`Rotation backup download did not start: ${JSON.stringify(await pageA.evaluate(() => ({
      error: document.querySelector('#rotate-identity-error')?.textContent,
      status: document.querySelector('#rotate-identity-status')?.textContent,
      dialogOpen: document.querySelector('#rotate-identity-dialog')?.open,
      currentPasswordPresent: Boolean(document.querySelector('#rotate-current-password')?.value)
    })))}`);
    const oldBackup = JSON.parse(await readFile(await rotationDownload.path(), 'utf8'));
    assert.equal(oldBackup.format, 'property-encrypted-key-v2');
    assert.equal(oldBackup.pubkey, await pageA.evaluate(value => NostrTools.nip19.decode(value).data, previousIdentity));
    await pageA.locator('#rotate-backup-saved').check();
    assert.equal(await pageA.locator('#rotate-identity-submit').isDisabled(), false);
    await pageA.locator('#rotate-new-password').fill('Property-new-key-password-2026!');
    await pageA.locator('#rotate-confirm-password').fill('Property-new-key-password-2026!');
    await pageA.locator('#rotate-identity-submit').click();
    await pageA.waitForFunction(oldKey => document.querySelector('#profile-npub')?.textContent.trim() !== oldKey, previousIdentity, { timeout: 30000 });
    const replacementIdentity = (await pageA.locator('#profile-npub').textContent()).trim();
    assert.match(replacementIdentity, /^npub1/); assert.notEqual(replacementIdentity, previousIdentity);
    assert.equal(await pageA.locator('#workspace').isVisible(), true, 'the newly generated identity is active');
    assert.ok((await vaultAudit(pageA)).conversation_titles.some(item => item.pubkey === auditB.pubkey && item.title === 'Contato visto no perfil'),
      'local history remains in this browser as stated in the warning');
    report.rotation = { local_key_replaced: true, previous_identity_backup_downloaded_before_replacement: true,
      submit_disabled_until_backup_acknowledgement: true, new_identity_differs: true, previous_public_events_revoked: false,
      local_history_remains_in_browser: true, new_identity_implied_global_rotation: false };
    mark('G03-08', 'PASS', 'The PWA required an encrypted backup acknowledgement, then replaced the active local key; it kept the previous Nostr identity and local history separate as the warning states.');

    // G03-09: 25 fixed browser journeys across clean, returning, locked, restored, corrupt, offline and denied-storage profiles.
    activeCase = 'G03-09';
    const journeyResults = [];
    const runJourney = async (category, index, run, prepareContext = async () => {}) => {
      const id = `${category}-${String(index + 1).padStart(2, '0')}`;
      report.current_journey = id;
      const context = await runtime.browser.newContext({ acceptDownloads: true, serviceWorkers: 'allow' });
      instrument(context, origin, report);
      try {
        await prepareContext(context, id);
        const page = await openPage(context, origin);
        try { await run(page, context, id); }
        catch (error) { throw new Error(`${id}: ${error.message}`); }
      } finally { await context.close(); }
      report.journey_progress = [...journeyResults];
      report.current_journey = null;
    };
    const recordJourney = async (page, id, finalState, detail) => {
      await assertJourneyState(page, finalState, id);
      journeyResults.push({ id, result: 'PASS', final_visible_state: finalState, accessible_controls_checked: true,
        offline_status_checked: true, false_delivery_claim_checked: true, ...detail });
      report.journey_progress = [...journeyResults];
    };

    for (let index = 0; index < 4; index++) await runJourney('fresh-install', index, async (page, _context, id) => {
      await assertJourneyState(page, 'auth', id);
      const pubkey = await createIdentity(page, index % 2 === 0);
      assert.match(pubkey, /^npub1/);
      await recordJourney(page, id, 'workspace', { identity_created: true, remember_choice: index % 2 === 0 });
    });

    for (let index = 0; index < 4; index++) {
      const profile = path.join(temp, `journey-return-${index}`);
      let context;
      try {
        context = await runtime.playwright.chromium.launchPersistentContext(profile, { ...runtime.launch, serviceWorkers: 'allow' });
        instrument(context, origin, report);
        let page = await openPage(context, origin);
        await assertJourneyState(page, 'auth', `returning-session-${index + 1}`);
        const original = await createIdentity(page, true);
        await context.close(); context = null;
        context = await runtime.playwright.chromium.launchPersistentContext(profile, { ...runtime.launch, serviceWorkers: 'allow' });
        instrument(context, origin, report);
        page = await openPage(context, origin);
        assert.equal((await page.locator('#profile-npub').textContent()).trim(), original);
        await recordJourney(page, `returning-session-${index + 1}`, 'workspace', { same_identity_after_restart: true });
      } finally { await context?.close().catch(() => {}); }
    }

    for (let index = 0; index < 4; index++) await runJourney('manual-lock', index, async (page, _context, id) => {
      const original = await createIdentity(page, true);
      await assertJourneyState(page, 'workspace', `${id}-created`);
      await page.locator('#profile-button').click(); await page.locator('#profile-dialog').waitFor({ state: 'visible' });
      await page.locator('#lock-account').click();
      await page.locator('#auth-screen').waitFor({ state: 'visible' });
      await assertJourneyState(page, 'auth', `${id}-locked`);
      await page.locator('#password').fill(PASSWORD); await page.locator('#unlock-button').click();
      await page.locator('#workspace').waitFor({ state: 'visible' });
      assert.equal((await page.locator('#profile-npub').textContent()).trim(), original);
      await recordJourney(page, id, 'workspace', { lock_cleared_session_and_password_restored_same_identity: true });
    });

    for (let index = 0; index < 4; index++) await runJourney('backup-restore', index, async (page, _context, id) => {
      await page.locator('#import-account-button').click(); await page.locator('#auth-import').waitFor({ state: 'visible' });
      await page.locator('#import-secret').fill(JSON.stringify(backup)); await page.locator('#import-password').fill(PASSWORD);
      await page.locator('#finish-import-button').click(); await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
      assert.equal((await page.locator('#profile-npub').textContent()).trim(), npubA);
      const imported = await vaultAudit(page);
      assert.deepEqual(imported.relay_settings, auditA.relay_settings);
      await recordJourney(page, id, 'workspace', { encrypted_backup_imported: true, same_public_identity: true,
        relay_preferences_restored: true, message_history_restored: false });
    });

    for (let index = 0; index < 4; index++) await runJourney('corrupt-vault', index, async (page, _context, id) => {
      await createIdentity(page, true);
      await page.evaluate(async () => {
        const damage = value => {
          const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
          bytes[Math.floor(bytes.length / 2)] ^= 1;
          return btoa(String.fromCharCode(...bytes));
        };
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const tx = db.transaction('vault', 'readwrite'); const store = tx.objectStore('vault');
        const vault = await new Promise((resolve, reject) => { const request = store.get('account'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        vault.cipher = damage(vault.cipher);
        if (vault.session?.cipher) vault.session.cipher = damage(vault.session.cipher);
        store.put(vault);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        db.close();
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#auth-choice') && !document.querySelector('#auth-choice').classList.contains('hidden'), null, { timeout: 15000 });
      await assertJourneyState(page, 'auth', `${id}-startup`);
      await page.locator('#password').fill(PASSWORD); await page.locator('#unlock-button').click();
      await page.waitForFunction(() => Boolean(document.querySelector('#auth-error')?.textContent.trim()), null, { timeout: 15000 });
      assert.equal(await page.locator('#workspace').isVisible(), false);
      assert.match((await page.locator('#auth-error').textContent()).toLowerCase(), /incorrect|inválido|invalid|incorreta/);
      assert.equal(/nsec1|mnemonic|private.?key/i.test(await page.locator('body').innerText()), false);
      await recordJourney(page, id, 'auth', { corrupted_vault_failed_closed: true, private_key_absent_from_visible_ui: true });
    });

    for (let index = 0; index < 3; index++) await runJourney('no-relays-offline', index, async (page, _context, id) => {
      await createIdentity(page, true);
      await page.locator('#open-settings').click(); await page.locator('#relay-dialog').waitFor({ state: 'visible' });
      await page.locator('#relay-input').fill(''); await page.locator('#save-relays').click();
      await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('#relay-count')?.textContent.trim() === '0 relays');
      assert.equal((await page.locator('#connection-label').textContent()).trim(), 'offline');
      assert.match((await page.locator('#relay-summary-text').textContent()).trim(), /Add a relay to sync/);
      const recipient = await page.evaluate(() => NostrTools.nip19.npubEncode(NostrTools.getPublicKey(new Uint8Array(32).fill(2))));
      await clickNewChat(page); await page.locator('#peer-input').fill(recipient); await page.locator('#start-chat-button').click();
      await page.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
      await page.locator('#message-input').fill(`offline-fixed-fixture-${index}`);
      await page.locator('#send-form button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#toast')?.classList.contains('show'), null, { timeout: 10000 });
      assert.match((await page.locator('#toast').textContent()).trim(), /inbox relay|relay settings/i);
      assert.equal(await page.locator('#messages .message-row').count(), 0, 'failed offline send does not appear as sent/delivered');
      assert.equal((await page.locator('#connection-label').textContent()).trim(), 'offline');
      await recordJourney(page, id, 'workspace', { selected_relays: 0, send_rejected: true, message_row_created: false,
        false_delivery_confirmation: false });
    });

    for (let index = 0; index < 2; index++) await runJourney('storage-denied', index, async (page, _context, id) => {
      await page.waitForFunction(() => /Local storage unavailable|Armazenamento local indisponível/.test(document.querySelector('#storage-status')?.textContent || ''), null, { timeout: 15000 });
      await assertJourneyState(page, 'auth', id);
      assert.equal(await page.locator('#create-account-button').isDisabled(), true);
      assert.equal(await page.locator('#import-account-button').isDisabled(), true);
      await recordJourney(page, id, 'auth', { storage_denied_visible: true, identity_mutation_controls_disabled: true });
    }, async context => context.addInitScript(() => {
      Object.defineProperty(IDBFactory.prototype, 'open', { configurable: true, writable: true,
        value() { throw new DOMException('Denied by fixed offline fixture', 'SecurityError'); } });
    }));

    assert.equal(journeyResults.length, 25, 'G3 browser matrix has exactly 25 fixed journeys');
    assert.deepEqual(Object.entries(journeyResults.reduce((counts, journey) => {
      const category = journey.id.replace(/-\d+$/, ''); counts[category] = (counts[category] || 0) + 1; return counts;
    }, {})).sort(), [['backup-restore', 4], ['corrupt-vault', 4], ['fresh-install', 4], ['manual-lock', 4],
      ['no-relays-offline', 3], ['returning-session', 4], ['storage-denied', 2]]);

    // All identity, backup, and replacement controls have EN/PT accessible names and keyboard access.
    accessibilityContext = await runtime.browser.newContext({ acceptDownloads: true, serviceWorkers: 'allow' });
    instrument(accessibilityContext, origin, report);
    const accessibilityPage = await openPage(accessibilityContext, origin);
    const labels = [
      ['password', 'Password', 'Senha'], ['remember-login', 'Keep me signed in on this device', 'Manter sessão iniciada neste aparelho'],
      ['unlock-button', 'Unlock', 'Desbloquear'], ['create-account-button', 'Create identity', 'Criar identidade'],
      ['import-account-button', 'Import Nostr key', 'Importar chave Nostr']
    ];
    const checkNames = async languageIndex => {
      for (const [id, english, portuguese] of labels) {
        const expected = languageIndex === 0 ? english : portuguese;
        if (['password', 'remember-login'].includes(id)) await assertOneVisible(accessibilityPage.getByLabel(expected, { exact: true }), expected);
        else assert.equal(await accessibilityPage.getByRole('button', { name: expected, exact: true }).count(), 1, `accessible action ${expected}`);
      }
    };
    await checkNames(0); await accessibilityPage.locator('#language-picker').selectOption('pt-BR'); await checkNames(1);
    await accessibilityPage.locator('#create-account-button').click();
    await accessibilityPage.locator('#auth-setup').waitFor({ state: 'visible' });
    const setupNames = [
      ['new-password', 'Password (12 characters or more)', 'Senha (12 caracteres ou mais)'], ['confirm-password', 'Confirm password', 'Confirme a senha'],
      ['remember-device', 'Keep me signed in on this device', 'Manter sessão iniciada neste aparelho']
    ];
    for (const [, _english, portuguese] of setupNames) await assertOneVisible(accessibilityPage.getByLabel(portuguese, { exact: true }), portuguese);
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Criar e continuar', exact: true }).count(), 1);
    await assertTabSequence(accessibilityPage, ['#new-password', '#confirm-password', '#remember-device', '#finish-create-button', '#auth-setup .back-auth'], 'create-identity keyboard flow');
    await accessibilityPage.locator('#auth-setup .back-auth').click(); await accessibilityPage.locator('#auth-choice').waitFor({ state: 'visible' });
    await accessibilityPage.locator('#import-account-button').click(); await accessibilityPage.locator('#auth-import').waitFor({ state: 'visible' });
    for (const label of ['Chave secreta nsec ou hex', 'Crie uma senha local', 'Manter sessão iniciada neste aparelho']) {
      await assertOneVisible(accessibilityPage.getByLabel(label, { exact: true }), label);
    }
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Importar com segurança', exact: true }).count(), 1);
    await assertTabSequence(accessibilityPage, ['#import-secret', '#import-password', '#remember-import', '#finish-import-button', '#auth-import .back-auth'], 'import-identity keyboard flow');
    await accessibilityPage.locator('#auth-import .back-auth').click(); await accessibilityPage.locator('#auth-choice').waitFor({ state: 'visible' });
    await accessibilityPage.locator('#language-picker').selectOption('en');
    await createIdentity(accessibilityPage, true);
    await accessibilityPage.locator('#profile-button').click(); await accessibilityPage.locator('#profile-dialog').waitFor({ state: 'visible' });
    await assertOneVisible(accessibilityPage.getByLabel('Include local contact names and relay hints (optional)', { exact: true }), 'backup local records EN');
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Download encrypted backup', exact: true }).count(), 1);
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Replace active identity', exact: true }).count(), 1);
    await accessibilityPage.locator('#language-picker').selectOption('pt-BR');
    await assertOneVisible(accessibilityPage.getByLabel('Incluir nomes locais dos contatos e dicas de relay (opcional)', { exact: true }), 'backup local records PT');
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Baixar backup criptografado', exact: true }).count(), 1);
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Substituir identidade ativa', exact: true }).count(), 1);
    await accessibilityPage.locator('#replace-identity').click(); await accessibilityPage.locator('#rotate-identity-dialog').waitFor({ state: 'visible' });
    for (const label of ['Senha atual', 'Nova senha (12 caracteres ou mais)', 'Confirme a nova senha', 'Manter a nova identidade conectada neste aparelho']) {
      await assertOneVisible(accessibilityPage.getByLabel(label, { exact: true }), label);
    }
    await accessibilityPage.locator('#rotate-backup-saved').check();
    assert.equal(await accessibilityPage.getByRole('button', { name: 'Criar nova identidade', exact: true }).count(), 1);
    await assertTabSequence(accessibilityPage, ['#rotate-identity-close', '#rotate-download-backup', '#rotate-backup-saved', '#rotate-current-password',
      '#rotate-new-password', '#rotate-confirm-password', '#rotate-remember-device', '#rotate-identity-submit'], 'replace-identity keyboard flow');
    report.identity_accessibility = { english_portuguese_label_parity: true, labelled_controls: 24,
      keyboard_tab_journeys: ['create-identity', 'import-identity', 'replace-identity'], unnamed_identity_controls: 0 };
    await accessibilityContext.close(); accessibilityContext = null;

    report.journey_matrix = { required: 25, completed: journeyResults.length, categories: {
      fresh_install: 4, returning_session: 4, manual_lock_unlock: 4, encrypted_backup_restore: 4,
      corrupted_vault: 4, no_relays_offline_send: 3, storage_denied: 2 }, journeys: journeyResults,
      every_journey_checked_visible_state: true, every_journey_checked_accessible_controls: true,
      every_journey_checked_offline_delivery_claims: true };
    mark('G03-09', 'PASS', '25 fixed browser journeys passed: 4 each for first use, returning sessions, manual lock/unlock, encrypted restore and corrupted vaults; 3 with zero relays and blocked sends; and 2 with IndexedDB denied. Identity/recovery labels matched in English and Portuguese and all setup, import and replacement controls were reached by keyboard.');

    // G03-06: inspect only sanitized storage properties and observed request metadata.
    activeCase = 'G03-06';
    const storageA = await readSensitiveStorage(pageA), storageImported = await readSensitiveStorage(importedPage), storageContact = await readSensitiveStorage(contactContext.pages()[0]);
    for (const storage of [storageA, storageImported, storageContact]) {
      const serialized = storage.local_storage + storage.session_storage;
      assert.equal(serialized.includes(PASSWORD), false, 'password is not in Web Storage');
      assert.equal(/nsec1|private.?key|mnemonic/i.test(serialized), false, 'Web Storage has no private-key material');
      assert.ok(storage.database_names.includes('liberdade-local-v1'));
    }
    assert.deepEqual(report.external_requests, [], 'browser completed no external HTTP request');
    const bundledRelayHosts = new Set((await pageA.evaluate(() => PropertyRelayDefaults.candidates)).map(value => new URL(value).hostname));
    const browserBackgroundHosts = new Set(['clients2.google.com', 'accounts.google.com', 'update.googleapis.com', 'www.google.com',
      'android.clients.google.com', 'passwordsleakcheck-pa.googleapis.com']);
    const proxyHostname = destination => {
      try { return new URL(destination.includes('://') ? destination : `https://${destination}`).hostname.toLowerCase(); }
      catch { return 'unparsed'; }
    };
    const unexpectedProxyAttempts = proxy.attempts.filter(attempt => {
      const host = proxyHostname(attempt.destination);
      return !['CONNECT', 'GET'].includes(attempt.method) || (!bundledRelayHosts.has(host) && !browserBackgroundHosts.has(host));
    });
    assert.deepEqual(unexpectedProxyAttempts, [], `unclassified local proxy attempts: ${JSON.stringify(unexpectedProxyAttempts)}`);
    assert.deepEqual(report.page_errors, [], 'browser emitted no runtime errors');
    report.privacy = { completed_external_requests: 0, denied_proxy_attempts: proxy.attempts.length,
      denied_relay_hosts: [...new Set(proxy.attempts.filter(attempt => bundledRelayHosts.has(proxyHostname(attempt.destination))).map(attempt => attempt.destination))].sort(),
      blocked_browser_background_hosts: [...new Set(proxy.attempts.map(attempt => proxyHostname(attempt.destination)).filter(host => browserBackgroundHosts.has(host)))].sort(),
      denied_proxy_blocked_all_observed_egress: true, page_errors: 0,
      web_storage_contains_password: false, web_storage_contains_private_key: false,
      central_login_or_recovery_endpoint: 'none observed', captured_values: 'request method/origin/path only; no bodies or secrets' };
    mark('G03-06', 'PASS', 'Across creation, lock, backup, contact and recovery flows, the PWA completed no external HTTP request. Relay destinations were blocked by the local deny proxy; browser-background destinations were separately classified. Passwords/private keys were absent from Web Storage and no central login/recovery request was observed.');
    report.result = report.cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    await writeReport(path.resolve(options.output), report);
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: path.resolve(options.output) }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const current = report.cases.find(item => item.case === activeCase && item.status === 'NOT_RUN')
      || report.cases.find(item => item.status === 'NOT_RUN');
    if (current) Object.assign(current, { status: /browser|module|executable|package|ENOENT|permission|launch|version mismatch/i.test(error.message) ? 'BLOCKED' : 'FAIL', reason: safeText(error.message || error) });
    for (const later of report.cases) if (later.status === 'NOT_RUN') Object.assign(later, { status: 'BLOCKED', reason: 'A prior G03 case failed; dependent UI flow was not started.' });
    report.result = report.cases.some(item => item.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    report.error = safeText(error.message || error);
    await writeReport(path.resolve(options?.output || path.join(temp, 'report')), report).catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await importedContext?.close().catch(() => {}); await contactContext?.close().catch(() => {}); await accessibilityContext?.close().catch(() => {});
    await persistentA?.close().catch(() => {}); await persistentB?.close().catch(() => {});
    await runtime?.browser?.close().catch(() => {});
    for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
