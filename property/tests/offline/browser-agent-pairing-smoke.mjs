#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = path.join(PROPERTY_ROOT, 'web');
function args(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('Use pares --nome valor.');
    values[argv[i].slice(2).replaceAll('-', '_')] = argv[i + 1];
  }
  for (const key of ['playwright_module', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!values[key]) throw new Error(`Opção obrigatória ausente: --${key.replaceAll('_', '-')}`);
  }
  values.engine ||= 'chromium';
  values.viewport ||= 'desktop';
  values.cycle ||= '1';
  if (!['chromium', 'firefox', 'webkit'].includes(values.engine)) throw new Error('Use --engine chromium, firefox ou webkit.');
  if (!['desktop', 'mobile'].includes(values.viewport)) throw new Error('Use --viewport desktop ou mobile.');
  if (!/^[1-9][0-9]*$/.test(values.cycle)) throw new Error('--cycle deve ser um inteiro positivo.');
  return values;
}
const options = args(process.argv.slice(2));
const fileHash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
async function treeHash(directory) {
  const lines = [];
  async function walk(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name), relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Link simbólico inesperado no pacote: ${relative}`);
      if (entry.isDirectory()) await walk(absolute, relative);
      else lines.push(`${relative}\0${await fileHash(absolute)}\n`);
    }
  }
  await walk(directory);
  return createHash('sha256').update(lines.join('')).digest('hex');
}
const modulePath = path.resolve(options.playwright_module), executable = path.resolve(options.executable);
await access(modulePath);
const packageDir = path.dirname(modulePath);
const pkg = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'playwright'); assert.equal(pkg.version, options.playwright_version);
assert.equal(await treeHash(packageDir), options.playwright_package_sha256);
assert.equal(await fileHash(executable), options.browser_executable_sha256);
const playwright = createRequire(modulePath)(modulePath);
const denyProxy = net.createServer(socket => {
  let received = '';
  socket.setTimeout(3000, () => socket.destroy());
  socket.on('data', chunk => {
    received += chunk.toString('latin1');
    if (received.includes('\r\n')) socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
});
await new Promise((resolve, reject) => { denyProxy.once('error', reject); denyProxy.listen(0, '127.0.0.1', resolve); });
const profileDir = await mkdtemp(path.join(PROPERTY_ROOT, '.agent-browser-profile-'));
const context = await playwright[options.engine].launchPersistentContext(profileDir, {
  headless: true, executablePath: executable,
  viewport: options.viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  ...(options.viewport === 'mobile' && options.engine === 'chromium' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  serviceWorkers: 'block',
  proxy: { server: `http://127.0.0.1:${denyProxy.address().port}`, bypass: '127.0.0.1,localhost' },
  ...(options.engine === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection', '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'] } : {}),
  ...(options.engine === 'firefox' ? { firefoxUserPrefs: { 'toolkit.telemetry.enabled': false, 'datareporting.healthreport.uploadEnabled': false, 'app.update.enabled': false, 'browser.newtabpage.enabled': false, 'browser.shell.checkDefaultBrowser': false, 'network.captive-portal-service.enabled': false, 'network.connectivity-service.enabled': false } } : {}),
});
const browser = context.browser();
assert.equal(browser.version(), options.browser_version);

const requests = [];
const blockedRequests = [];
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' || url.pathname === '/property/' ? 'index.html' : url.pathname.replace(/^\/property\//, '');
    const target = path.resolve(WEB_ROOT, decodeURIComponent(relative));
    if (target !== WEB_ROOT && !target.startsWith(`${WEB_ROOT}${path.sep}`)) return response.writeHead(403).end();
    const body = await readFile(target);
    const type = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml']]).get(path.extname(target)) || 'application/octet-stream';
    requests.push(url.pathname);
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const errors = [];
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  blockedRequests.push(new URL(route.request().url()).origin);
  return route.abort('blockedbyclient');
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('crash', () => errors.push('renderer-crashed'));
const result = { browser: browser.version(), viewport: options.viewport, cycle: Number(options.cycle), origin, all_requests_loopback: true, service_worker_controlled: false, human_identity_preserved: false, default_scopes_off: false, cancel_did_not_consume_invite: false, approved_scopes_exact: false, indexeddb_persisted: false, revocation_cleared_scopes: false, accessible_dialog_name: false, visible_agent_controls_named: false, keyboard_focus_stayed_in_modal: false, keyboard_cancel_did_not_consume_invite: false, keyboard_approved_exact_scope: false, dialog_body_scrollable: false, revoke_control_reachable_after_scroll: false, external_requests_blocked: true, page_errors: [] };
try {
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded' });
  result.service_worker_controlled = false;
  await page.locator('#create-account-button:not([disabled])').waitFor({ timeout: 15000 });
  await page.locator('#create-account-button').click();
  await page.locator('#new-password').fill('Property-offline-test-2026!');
  await page.locator('#confirm-password').fill('Property-offline-test-2026!');
  await page.locator('#finish-create-button').click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
  const human = await page.evaluate(() => NostrTools.nip19.decode(document.querySelector('#profile-npub').textContent.trim()).data);
  const fixture = await page.evaluate(async humanPubkey => {
    const contactSecret = NostrTools.generateSecretKey();
    const contactPubkey = NostrTools.getPublicKey(contactSecret);
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('conversations', 'readwrite');
      tx.objectStore('conversations').put({ pubkey: contactPubkey, title: 'Pessoa de teste', lastAt: 0, lastMessage: '' });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    const now = Math.floor(Date.now() / 1000);
    const secret = NostrTools.generateSecretKey();
    const event = NostrTools.finalizeEvent({ kind: 30078, created_at: now, tags: [['d', 'property-agent-invite-v1']], content: JSON.stringify({ protocol: 'property-agent-invite/v1', agent_name: 'Agente de ensaio', nonce: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join(''), expires_at: now + 3600, recipient_pubkey: humanPubkey, relay_hints: [] }) }, secret);
    const secondSecret = NostrTools.generateSecretKey();
    const secondEvent = NostrTools.finalizeEvent({ kind: 30078, created_at: now, tags: [['d', 'property-agent-invite-v1']], content: JSON.stringify({ protocol: 'property-agent-invite/v1', agent_name: 'Agente cancelado', nonce: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join(''), expires_at: now + 3600, recipient_pubkey: humanPubkey, relay_hints: [] }) }, secondSecret);
    return { contactPubkey, agentPubkey: event.pubkey, invite: PropertyAgentPairing.encodeInvite(event), secondInvite: PropertyAgentPairing.encodeInvite(secondEvent) };
  }, human);
  result.human_identity_preserved = /^[0-9a-f]{64}$/.test(human);

  await page.locator('#profile-button').click();
  await page.locator('#open-agent-manager').click();
  await page.locator('#agent-dialog[open]').waitFor();
  result.accessible_dialog_name = (await page.locator('#agent-dialog').getAttribute('aria-labelledby')) === 'agent-dialog-title'
    && (await page.locator('#agent-dialog-title').textContent()).trim() === 'Agentes e permissões';
  await page.locator('#agent-invite-input').fill(fixture.secondInvite);
  await page.locator('#inspect-agent-invite').click();
  await page.locator('#agent-invite-review:not(.hidden)').waitFor();
  const reviewBoxes = page.locator('#agent-permission-list input[type="checkbox"]');
  assert.equal(await reviewBoxes.count(), 2);
  const controlAudit = await page.locator('#agent-dialog').evaluate(dialog => [...dialog.querySelectorAll('button,input,textarea,select')]
    .filter(element => element.getClientRects().length > 0)
    .map(element => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledByText = labelledBy ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() : '';
      const labelText = element.labels ? [...element.labels].map(label => label.textContent || '').join(' ').trim() : '';
      return { id: element.id || element.tagName.toLowerCase(), name: (element.getAttribute('aria-label') || labelledByText || labelText || element.textContent || '').trim() };
    }));
  result.visible_agent_controls_named = controlAudit.length > 0 && controlAudit.every(control => control.name.length > 0);
  const focusStates = [];
  await page.locator('#cancel-agent-invite').focus();
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press('Tab');
    focusStates.push(await page.evaluate(() => ({ inside_dialog: document.querySelector('#agent-dialog').contains(document.activeElement), id: document.activeElement.id || document.activeElement.tagName.toLowerCase() })));
  }
  result.keyboard_focus_stayed_in_modal = focusStates.length === 16 && focusStates.every(state => state.inside_dialog);
  result.default_scopes_off = await reviewBoxes.nth(0).isChecked() === false && await reviewBoxes.nth(1).isChecked() === false;
  await reviewBoxes.nth(0).check();
  await page.locator('#cancel-agent-invite').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#agent-invite-review').isVisible(), false);
  result.keyboard_cancel_did_not_consume_invite = true;
  await page.locator('#agent-invite-input').fill(fixture.secondInvite);
  await page.locator('#inspect-agent-invite').click();
  await page.locator('#agent-invite-review:not(.hidden)').waitFor();
  result.cancel_did_not_consume_invite = await reviewBoxes.nth(0).isChecked() === false;
  await page.locator('#cancel-agent-invite').click();

  await page.locator('#agent-invite-input').fill(fixture.invite);
  await page.locator('#inspect-agent-invite').click();
  await page.locator('#agent-invite-review:not(.hidden)').waitFor();
  assert.equal((await page.locator('#agent-invite-name').textContent()).trim(), 'Agente de ensaio');
  const read = page.locator('#agent-permission-list input[data-scope="read"]');
  const send = page.locator('#agent-permission-list input[data-scope="send"]');
  result.default_scopes_off &&= !(await read.isChecked()) && !(await send.isChecked());
  await read.focus();
  await page.keyboard.press('Space');
  await page.locator('#approve-agent-invite').focus();
  await page.keyboard.press('Enter');
  await page.getByText('AGENTE · ACESSO ATIVO', { exact: true }).waitFor();
  const beforeRevoke = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['agentInvites', 'agentAccess'], 'readonly');
      const inviteRequest = tx.objectStore('agentInvites').getAll(), accessRequest = tx.objectStore('agentAccess').getAll();
      tx.oncomplete = () => resolve({ invites: inviteRequest.result, access: accessRequest.result }); tx.onerror = () => reject(tx.error);
    });
  });
  const paired = beforeRevoke.access.find(item => item.pubkey === fixture.agentPubkey);
  assert.ok(paired);
  result.approved_scopes_exact = JSON.stringify(paired.permissions) === JSON.stringify({ read: [fixture.contactPubkey], send: [] });
  result.keyboard_approved_exact_scope = result.approved_scopes_exact;
  result.indexeddb_persisted = beforeRevoke.invites.length === 1 && beforeRevoke.access.length === 1 && beforeRevoke.invites[0].status === 'approved';
  const stored = JSON.stringify(beforeRevoke);
  assert.doesNotMatch(stored, /property-agent-invite:v1:|"nonce"|"secret"|private.?key/i);

  await mkdir(options.output, { recursive: true });
  const dialogBody = page.locator('#agent-dialog .dialog-body');
  const scrollResult = await dialogBody.evaluate(element => {
    const scrollable = getComputedStyle(element).overflowY === 'auto' && element.scrollHeight > element.clientHeight;
    element.scrollTop = element.scrollHeight;
    return { scrollable, reached_bottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
      scroll_height: element.scrollHeight, client_height: element.clientHeight };
  });
  result.dialog_body_scrollable = scrollResult.scrollable && scrollResult.reached_bottom;
  const revokeButton = page.getByRole('button', { name: 'Revogar acesso' });
  await revokeButton.scrollIntoViewIfNeeded();
  result.revoke_control_reachable_after_scroll = await revokeButton.isVisible();
  await dialogBody.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(options.output, `agent-pairing-${options.viewport}.png`), fullPage: false });
  assert.equal(await page.locator('#agent-dialog').evaluate(element => element.getBoundingClientRect().width <= window.innerWidth), true, 'agent manager fits the selected viewport');
  await revokeButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(options.output, `agent-pairing-${options.viewport}-scrolled.png`), fullPage: false });

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Revogar acesso' }).click();
  await page.getByText('AGENTE · REVOGADO', { exact: true }).waitFor();
  const afterRevoke = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise((resolve, reject) => { const tx = db.transaction('agentAccess'); const request = tx.objectStore('agentAccess').getAll(); tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); });
  });
  const revoked = afterRevoke.find(item => item.pubkey === fixture.agentPubkey);
  result.revocation_cleared_scopes = revoked?.status === 'revoked' && revoked.permissions.read.length === 0 && revoked.permissions.send.length === 0 && revoked.revocationNotice === 'not-sent';
  result.all_requests_loopback = requests.length > 0;
  result.blocked_external_requests = blockedRequests.length;
  result.page_errors = errors;
  assert.ok(result.human_identity_preserved);
  assert.ok(result.default_scopes_off);
  assert.ok(result.cancel_did_not_consume_invite);
  assert.ok(result.approved_scopes_exact);
  assert.ok(result.indexeddb_persisted);
  assert.ok(result.revocation_cleared_scopes);
  assert.ok(result.accessible_dialog_name);
  assert.ok(result.visible_agent_controls_named, JSON.stringify(controlAudit));
  assert.ok(result.keyboard_focus_stayed_in_modal, JSON.stringify(focusStates));
  assert.ok(result.keyboard_cancel_did_not_consume_invite);
  assert.ok(result.keyboard_approved_exact_scope);
  assert.ok(result.dialog_body_scrollable, JSON.stringify(scrollResult));
  assert.ok(result.revoke_control_reachable_after_scroll);
  assert.deepEqual(errors, []);
  assert.ok(result.all_requests_loopback);
  assert.equal(result.blocked_external_requests, 0);
  const report = { gate: options.gate === 'G6' ? 'G6' : 'G2', status: 'PASS_TECHNICAL_BROWSER', engine: options.engine, browser: result.browser, viewport: options.viewport, cycle: Number(options.cycle), browserTestScope: 'service worker disabled in this isolated UI/IndexedDB flow; offline shell is covered separately; automation is not a human-participant or screen-reader test', scenarios: { canceledInviteReused: true, exactScopeStored: true, localRevocation: true, keyboardNavigationAndActivation: true, accessibleNamesPresent: true }, evidence: result, requestCount: requests.length };
  await writeFile(path.join(options.output, 'agent-pairing-browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  const ui = await page.evaluate(() => ({ auth: document.querySelector('#auth-error')?.textContent || '', setup: document.querySelector('#setup-error')?.textContent || '', import: document.querySelector('#import-error')?.textContent || '' })).catch(() => null);
  process.stderr.write(`${JSON.stringify({ failure: error.message, requests, errors, ui, browser_connected: browser.isConnected() }, null, 2)}\n`);
  throw error;
} finally {
  await context.close();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => denyProxy.close(resolve));
  await rm(profileDir, { recursive: true, force: true });
}
