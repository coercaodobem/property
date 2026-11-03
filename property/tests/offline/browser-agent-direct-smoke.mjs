#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  values.engine ||= 'firefox'; values.viewport ||= 'desktop'; values.cycle ||= '1';
  if (!['chromium', 'firefox', 'webkit'].includes(values.engine) || !['desktop', 'mobile'].includes(values.viewport) || !/^[1-9][0-9]*$/.test(values.cycle)) throw new Error('Engine, viewport ou ciclo inválido.');
  return values;
}

const options = args(process.argv.slice(2));
const fileHash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
await access(path.resolve(options.playwright_module));
assert.equal(JSON.parse(await readFile(path.join(path.dirname(path.resolve(options.playwright_module)), 'package.json'), 'utf8')).version, options.playwright_version);
assert.equal(await fileHash(path.resolve(options.executable)), options.browser_executable_sha256);
const playwright = createRequire(path.resolve(options.playwright_module))(path.resolve(options.playwright_module));
const denyProxy = net.createServer(socket => {
  let received = ''; socket.setTimeout(3000, () => socket.destroy());
  socket.on('data', chunk => { received += chunk.toString('latin1'); if (received.includes('\r\n')) socket.end('HTTP/1.1 502 Offline test proxy denied request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
});
await new Promise((resolve, reject) => { denyProxy.once('error', reject); denyProxy.listen(0, '127.0.0.1', resolve); });
const profileDir = await mkdtemp(path.join(PROPERTY_ROOT, '.agent-direct-browser-'));
const context = await playwright[options.engine].launchPersistentContext(profileDir, {
  headless: true, executablePath: path.resolve(options.executable),
  viewport: options.viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  ...(options.viewport === 'mobile' && options.engine === 'chromium' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  serviceWorkers: 'block', proxy: { server: `http://127.0.0.1:${denyProxy.address().port}`, bypass: '127.0.0.1,localhost' },
  ...(options.engine === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection', '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'] } : {}),
  ...(options.engine === 'firefox' ? { firefoxUserPrefs: { 'toolkit.telemetry.enabled': false, 'datareporting.healthreport.uploadEnabled': false, 'app.update.enabled': false, 'browser.newtabpage.enabled': false, 'browser.shell.checkDefaultBrowser': false, 'network.captive-portal-service.enabled': false, 'network.connectivity-service.enabled': false } } : {}),
});
const browser = context.browser(); assert.equal(browser.version(), options.browser_version);
const requests = []; const externalRequests = []; const errors = [];
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' || url.pathname === '/property/' ? 'index.html' : url.pathname.replace(/^\/property\//, '');
    const target = path.resolve(WEB_ROOT, decodeURIComponent(relative));
    if (target !== WEB_ROOT && !target.startsWith(`${WEB_ROOT}${path.sep}`)) return response.writeHead(403).end();
    const body = await readFile(target);
    const type = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml']]).get(path.extname(target)) || 'application/octet-stream';
    requests.push(url.pathname); response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  externalRequests.push(new URL(route.request().url()).origin); return route.abort('blockedbyclient');
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('crash', () => errors.push('renderer-crashed'));

try {
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#create-account-button:not([disabled])').waitFor({ timeout: 15000 });
  await page.locator('#create-account-button').click();
  await page.locator('#new-password').fill('Property-agent-direct-offline-2026!');
  await page.locator('#confirm-password').fill('Property-agent-direct-offline-2026!');
  await page.locator('#finish-create-button').click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
  const fixture = await page.evaluate(async () => {
    const personSecret = new Uint8Array(32); personSecret[31] = 251;
    const agentSecret = new Uint8Array(32); agentSecret[31] = 252;
    const person = NostrTools.getPublicKey(personSecret), agent = NostrTools.getPublicKey(agentSecret);
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put({ pubkey: person, title: 'Pessoa preservada', lastAt: 0, lastMessage: '' }); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    return { person, agentNpub: NostrTools.nip19.npubEncode(agent) };
  });

  await page.locator('#profile-button').click(); await page.locator('#open-agent-manager').click();
  await page.locator('#agent-dialog[open]').waitFor();
  assert.equal((await page.locator('#agent-dialog-title').textContent()).trim(), 'Agentes');
  assert.match(await page.locator('#agent-dialog').textContent(), /Não há convite, pareamento ou aprovação por mensagem/);
  const named = await page.locator('#agent-dialog button').evaluateAll(buttons => buttons.every(button => (button.getAttribute('aria-label') || button.textContent.trim()).length > 0));
  assert.equal(named, true);
  await page.getByRole('button', { name: 'Iniciar conversa com agente' }).focus();
  await page.keyboard.press('Enter');
  await page.locator('#new-chat-dialog[open]').waitFor();
  assert.equal(await page.locator('#agent-mode').isChecked(), true, 'agent messaging mode is a direct chat choice, not an access grant');
  assert.match(await page.locator('#new-chat-dialog').textContent(), /não dá acesso às suas outras mensagens ou à sua chave/i);
  await page.locator('#peer-input').fill(fixture.agentNpub);
  await page.locator('#peer-name-input').fill('Agente direto');
  await page.locator('#start-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'hidden', timeout: 5000 });
  await page.locator('#chat-subtitle').filter({ hasText: 'PROTOCOLO DE AGENTE' }).waitFor();
  const state = await page.evaluate(async peer => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['conversations', 'agentAccess'], 'readonly');
      const conversations = tx.objectStore('conversations').getAll(), access = tx.objectStore('agentAccess').getAll();
      tx.oncomplete = () => resolve({ conversations: conversations.result, access: access.result, selected: conversations.result.find(item => item.pubkey === peer) });
      tx.onerror = () => reject(tx.error);
    });
  }, (await page.evaluate(value => NostrTools.nip19.decode(value).data, fixture.agentNpub)));
  assert.equal(state.selected.agent, true); assert.equal(state.access.length, 0);
  assert.ok(state.conversations.some(item => item.pubkey === fixture.person && item.title === 'Pessoa preservada'), 'existing human conversation remains unchanged');
  assert.doesNotMatch(await page.locator('#conversation-pane').textContent(), /aprovação pendente|aguardando aprovação/i);
  const blockButton = page.locator('#agent-block-button');
  await blockButton.waitFor({ state: 'visible' });
  assert.equal(await blockButton.getAttribute('aria-label'), 'Bloquear agente');
  await blockButton.click();
  await page.waitForFunction(() => document.querySelector('#agent-block-button')?.getAttribute('aria-label') === 'Desbloquear agente');
  assert.equal(await blockButton.getAttribute('aria-label'), 'Desbloquear agente');
  assert.equal(await page.locator('#message-input').isDisabled(), true);
  const blockedState = await page.evaluate(async peer => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise((resolve, reject) => { const tx = db.transaction('agentAccess', 'readonly'), request = tx.objectStore('agentAccess').get(peer); tx.oncomplete = () => resolve(request.result || null); tx.onerror = () => reject(tx.error); });
  }, state.selected.pubkey);
  assert.equal(blockedState.status, 'blocked', 'blocking is local to this device and does not require a remote approval');
  await blockButton.click();
  await page.waitForFunction(() => document.querySelector('#agent-block-button')?.getAttribute('aria-label') === 'Bloquear agente');
  assert.equal(await blockButton.getAttribute('aria-label'), 'Bloquear agente');
  assert.equal(await page.locator('#message-input').isDisabled(), false);
  const unblockedState = await page.evaluate(async peer => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise((resolve, reject) => { const tx = db.transaction('agentAccess', 'readonly'), request = tx.objectStore('agentAccess').get(peer); tx.oncomplete = () => resolve(request.result || null); tx.onerror = () => reject(tx.error); });
  }, state.selected.pubkey);
  assert.equal(unblockedState, null, 'unblocking removes only the local block');
  assert.equal(await page.locator('#agent-dialog').evaluate(element => element.getBoundingClientRect().width <= window.innerWidth), true);
  await page.screenshot({ path: path.join(options.output, `agent-direct-${options.viewport}.png`), fullPage: false });
  assert.deepEqual(errors, []); assert.ok(requests.length > 0); assert.deepEqual(externalRequests, []);

  const report = {
    gate: options.gate === 'G6' ? 'G6' : 'G2', status: 'PASS_TECHNICAL_BROWSER', engine: options.engine,
    browser: browser.version(), viewport: options.viewport, cycle: Number(options.cycle),
    browserTestScope: 'local PWA and IndexedDB only; no network relay, human participant, screen reader, or physical mobile device',
    evidence: {
      directAgentConversation: state.selected.agent, noInvitationOrApprovalControls: true, noAccessGrantStored: state.access.length === 0,
      humanConversationPreserved: true, externalRequestsBlocked: externalRequests.length === 0,
      accessibleNamedControls: named, keyboardOpenedAgentConversation: true, localAgentBlockAndUnblock: true,
      blockDisablesComposer: true, unblockRestoresComposer: true, humanIdentityNpub: fixture.person,
    },
  };
  await writeFile(path.join(options.output, 'agent-direct-browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ failure: error.message, new_chat_error: await page.locator('#new-chat-error').textContent().catch(() => ''), requests, errors, browser_connected: browser.isConnected() }, null, 2)}\n`);
  throw error;
} finally {
  await context.close(); await new Promise(resolve => server.close(resolve)); await new Promise(resolve => denyProxy.close(resolve)); await rm(profileDir, { recursive: true, force: true });
}
