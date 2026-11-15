#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentService } from '../../agent/service.mjs';
import { createEmptyConfig, eventInContext, loadNostr, secretBytesInContext } from '../../agent/core.mjs';
import { NostrAgentTransport } from '../../agent/relay.mjs';
import { GEODE_SHA256, prepareGeodeRuntime, startGeode, stopGeode } from './geode-fixture-g5.mjs';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = path.join(PROPERTY_ROOT, 'web');
const FIXED_NOW = 1_900_000_000;
const EXCHANGES = 25;
const proxies = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) throw new Error('Expected --name value pairs.');
    options[argv[index].slice(2).replaceAll('-', '_')] = argv[index + 1];
  }
  for (const name of ['playwright_module', 'executable', 'playwright_version', 'browser_version', 'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  return options;
}

async function hashFile(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function hashPackageTree(modulePath) {
  const root = path.dirname(path.resolve(modulePath));
  const entries = [];
  async function walk(directory, prefix = '') {
    const items = (await import('node:fs/promises').then(fs => fs.readdir(directory, { withFileTypes: true }))).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      const absolute = path.join(directory, item.name);
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error(`Playwright package contains an unpinned symlink: ${relative}`);
      if (item.isDirectory()) await walk(absolute, relative);
      else entries.push(`${relative}\0${await hashFile(absolute)}\n`);
    }
  }
  await walk(root);
  return createHash('sha256').update(entries.join('')).digest('hex');
}

function startAppServer() {
  const mime = new Map([['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
    ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json'], ['.png', 'image/png'], ['.json', 'application/json'], ['.woff2', 'font/woff2']]);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') return response.writeHead(405).end();
      const url = new URL(request.url, 'http://127.0.0.1');
      const relative = url.pathname === '/' || url.pathname === '/property/' ? 'index.html' : url.pathname.replace(/^\/property\//, '');
      const target = path.resolve(WEB_ROOT, decodeURIComponent(relative));
      if (target !== WEB_ROOT && !target.startsWith(`${WEB_ROOT}${path.sep}`)) return response.writeHead(403).end();
      const file = await readFile(target);
      response.writeHead(200, { 'content-type': mime.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' }).end(file);
    } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); }
  });
  return { server, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

function startDenyProxy() {
  const attempts = [];
  const server = net.createServer(socket => {
    let text = '';
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', chunk => {
      text += chunk.toString('latin1');
      if (!text.includes('\r\n')) return;
      const [method, target = ''] = text.split('\r\n', 1)[0].split(' ');
      let destination = 'unparseable';
      try { destination = method === 'CONNECT' ? new URL(`http://${target}`).host : new URL(target).origin; } catch {}
      attempts.push({ method, destination, blocked: true });
      socket.end('HTTP/1.1 502 G5 offline relay test blocked egress\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  return { server, attempts, ready: new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }) };
}

async function createBrowserRuntime(options, proxyPort) {
  const packageInfo = JSON.parse(await readFile(path.join(path.dirname(options.playwright_module), 'package.json'), 'utf8'));
  assert.equal(packageInfo.version, options.playwright_version);
  assert.equal(await hashPackageTree(options.playwright_module), options.playwright_package_sha256);
  assert.equal(await hashFile(options.executable), options.browser_executable_sha256);
  const playwright = createRequire(path.resolve(options.playwright_module))(path.resolve(options.playwright_module));
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: path.resolve(options.executable),
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--disable-client-side-phishing-detection', '--disable-variations', '--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,OptimizationHints,OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions', '--no-first-run'],
  });
  assert.equal(browser.version(), options.browser_version);
  return { playwright, browser, evidence: { playwright_version: packageInfo.version, playwright_package_sha256: options.playwright_package_sha256,
    browser_version: browser.version(), browser_executable_sha256: options.browser_executable_sha256 } };
}

async function openApp(context, origin) {
  const page = await context.newPage();
  const externalRequests = [];
  const websocketUrls = [];
  const pageErrors = [];
  page.on('request', request => { if (new URL(request.url()).origin !== origin) externalRequests.push(new URL(request.url()).origin); });
  page.on('websocket', socket => websocketUrls.push(socket.url()));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(`${origin}/property/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#create-account-button:not([disabled])').waitFor({ timeout: 30000 });
  return { page, externalRequests, websocketUrls, pageErrors };
}

async function setRelaysBeforeIdentity(page, relayUrls) {
  const stored = await page.evaluate(async urls => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ id: 'relays', values: urls, autoSelected: false });
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
    const result = await new Promise((resolve, reject) => { const request = db.transaction('settings').objectStore('settings').get('relays'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return result;
  }, relayUrls);
  assert.deepEqual(stored?.values, relayUrls);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#create-account-button:not([disabled])').waitFor({ timeout: 30000 });
}

async function createIdentity(page) {
  await page.locator('#create-account-button').click();
  await page.locator('#auth-setup').waitFor({ state: 'visible' });
  await page.locator('#new-password').fill('synthetic-browser-g5-only-Password!');
  await page.locator('#confirm-password').fill('synthetic-browser-g5-only-Password!');
  await page.locator('#finish-create-button').click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 30000 });
  const npub = (await page.locator('#profile-npub').textContent()).trim();
  const pubkey = await page.evaluate(value => NostrTools.nip19.decode(value).data, npub);
  return { npub, pubkey };
}

async function configureRelays(page, relayUrls) {
  await page.locator('#open-settings').click();
  await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#relay-input').fill(relayUrls.join('\n'));
  await page.locator('#dm-relay-input').fill(relayUrls.join('\n'));
  await page.locator('#save-relays').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(expected => document.querySelector('#connection-label')?.textContent === expected, `${relayUrls.length}/${relayUrls.length} relays`, { timeout: 30000 });
  await page.locator('#open-settings').click();
  await page.locator('#dm-relay-input').fill(relayUrls.join('\n'));
  await page.locator('#publish-inbox-list').click();
  await page.waitForFunction(() => /public NIP-17 inbox list was published|Sua lista pública de recebimento NIP-17 foi publicada/.test(document.querySelector('#toast')?.textContent || '') || Boolean(document.querySelector('#relay-error')?.textContent?.trim()), null, { timeout: 20000 });
  const error = (await page.locator('#relay-error').textContent()).trim();
  assert.equal(error, '', `PWA kind-10050 publication failed: ${error}`);
  if (await page.locator('#relay-dialog').isVisible()) await page.locator('#relay-dialog button[aria-label="Close"], #relay-dialog button[aria-label="Fechar"]').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden', timeout: 5000 });
}

async function openAgentConversation(page, agentNpub) {
  await page.locator('#new-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#peer-input').fill(agentNpub);
  await page.locator('#peer-name-input').fill('Synthetic G5 agent');
  await page.locator('#agent-mode').check();
  await page.locator('#start-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'hidden', timeout: 10000 });
  await page.locator('#conversation-pane').waitFor({ state: 'visible' });
  await page.locator('#chat-subtitle').filter({ hasText: 'AGENT PROTOCOL' }).waitFor({ timeout: 5000 });
}

async function sendHumanMessage(page, text) {
  await page.locator('#message-input').fill(text);
  await page.locator('#send-form button[type="submit"]').click();
  await page.waitForFunction(value => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(value)), text, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('#send-form button[type="submit"]')?.disabled, null, { timeout: 30000 });
}

async function queryRelay(url, filter, sequence) {
  const socket = new WebSocket(url);
  const sub = `property-g5-human-query-${String(sequence).padStart(4, '0')}`;
  return await new Promise((resolve, reject) => {
    const events = new Map();
    const watchdog = setTimeout(() => { socket.close(); reject(new Error(`G5 PWA query watchdog on ${url}`)); }, 12000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, filter])));
    socket.addEventListener('message', event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub && frame[2]?.id) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(watchdog); socket.close(); resolve([...events.values()]); }
    });
    socket.addEventListener('error', () => { clearTimeout(watchdog); reject(new Error(`G5 PWA query failed on ${url}`)); }, { once: true });
  });
}

const options = parseArgs(process.argv.slice(2));
for (const key of proxies) delete process.env[key];
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g5-pwa-agent-'));
await chmod(temp, 0o700);
const relays = [];
let app;
let proxy;
let runtime;
let context;
let page;
let agent;
let outsiderSecret;
const browserRecords = {};

try {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  const { binary } = await prepareGeodeRuntime(temp);
  for (let index = 0; index < 3; index++) relays.push(await startGeode({ baseDir: temp, binary, port: 28483 + index, index: index + 3 }));
  const relayUrls = relays.map(relay => relay.url);
  app = startAppServer(); proxy = startDenyProxy();
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await createBrowserRuntime(options, proxy.server.address().port);
  context = await runtime.browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
  const instrumented = await openApp(context, origin); page = instrumented.page;
  await setRelaysBeforeIdentity(page, relayUrls);
  const human = await createIdentity(page);
  await configureRelays(page, relayUrls);

  const { context: nostrContext, nostr, messages } = await loadNostr(PROPERTY_ROOT);
  const agentSecretHex = '4'.padStart(64, '0');
  const agentSecret = secretBytesInContext(nostrContext, agentSecretHex);
  const agentPubkey = nostr.getPublicKey(agentSecret);
  agentSecret.fill(0);
  const agentConfig = createEmptyConfig(agentPubkey); agentConfig.inbox_relays = relayUrls;
  let configValue = structuredClone(agentConfig);
  const transport = new NostrAgentTransport({ nostr, messages, context: nostrContext, secretHex: agentSecretHex, pubkey: agentPubkey, inboxRelays: relayUrls });
  const service = new AgentService({ pubkey: agentPubkey, loadConfig: async () => structuredClone(configValue), saveConfig: async value => { configValue = structuredClone(value); }, transport, now: () => FIXED_NOW });
  agent = { pubkey: agentPubkey, secret: transport.secret, transport, service, context: nostrContext, nostr };
  assert.notEqual(human.pubkey, agentPubkey, 'human PWA and agent use independent identities');
  assert.deepEqual(await transport.announceInboxRelays(relayUrls, relayUrls), { acks: 3, attempts: 3 });
  await openAgentConversation(page, nostr.nip19.npubEncode(agentPubkey));
  assert.equal(await page.locator('#agent-block-button').getAttribute('aria-label'), 'Block agent');
  assert.doesNotMatch(await page.locator('#conversation-pane').textContent(), /approval pending|waiting for approval/i);

  const messageManifest = [];
  for (let index = 1; index <= EXCHANGES; index++) {
    const request = `property-g5-pwa-request-${String(index).padStart(2, '0')}`;
    const response = `property-g5-agent-response-${String(index).padStart(2, '0')}`;
    await sendHumanMessage(page, request);
    const inbound = await service.dispatch('read', { conversation_pubkey: human.pubkey, limit: 100 });
    assert.equal(inbound.messages.filter(message => message.direction === 'received' && message.body === request).length, 1, `agent decrypts PWA message ${index}`);
    const sent = await service.dispatch('send', { conversation_pubkey: human.pubkey, text: response, in_reply_to: inbound.messages.find(message => message.direction === 'received' && message.body === request).message_id });
    assert.equal(sent.status, 'relay_accepted'); assert.equal(sent.relay_acks, 6); assert.equal(sent.relay_attempts, 6);
    await page.waitForFunction(value => [...document.querySelectorAll('#messages .message-row')].some(row => row.textContent.includes(value)), response, { timeout: 20000 });
    messageManifest.push({ exchange: index, request, response });
    if (index % 5 === 0) process.stderr.write(`G5 PWA exchange checkpoint ${index}/${EXCHANGES}\n`);
  }

  const conversationState = await page.evaluate(async peer => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('liberdade-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'conversations', 'agentAccess'], 'readonly');
      const messages = tx.objectStore('messages').getAll(); const conversations = tx.objectStore('conversations').get(peer); const access = tx.objectStore('agentAccess').get(peer);
      tx.oncomplete = () => resolve({ messages: messages.result.filter(item => item.peer === peer), conversation: conversations.result, agentAccess: access.result || null });
      tx.onerror = () => reject(tx.error);
    });
    db.close(); return result;
  }, agentPubkey);
  assert.equal(conversationState.messages.length, EXCHANGES * 2, 'the PWA stores both directions for all exchanges');
  assert.equal(conversationState.conversation.agent, true);
  assert.equal(conversationState.agentAccess, null, 'direct agent conversation requires no access grant or approval record');
  assert.equal(conversationState.messages.filter(item => item.fromAgent === true).length, EXCHANGES);

  const outsiderHex = '5'.padStart(64, '0');
  outsiderSecret = secretBytesInContext(nostrContext, outsiderHex);
  const relayedEvents = [];
  let querySequence = 0;
  for (const relay of relays) {
    const events = await queryRelay(relay.url, { kinds: [1059], limit: 200 }, ++querySequence);
    assert.equal(events.length, EXCHANGES * 4, 'each of 50 sent messages stores two signed wraps on every relay');
    for (const event of events) {
      const inContext = eventInContext(nostrContext, event);
      assert.equal(nostr.verifyEvent(inContext), true);
      assert.ok(event.tags.every(tag => tag[0] !== 'p' || tag[1] === human.pubkey || tag[1] === agentPubkey), 'only the two conversation identities receive these envelopes');
      assert.ok(!messageManifest.some(item => event.content.includes(item.request) || event.content.includes(item.response)), 'relay storage never contains the PWA/agent plaintext');
      let outsiderRumor = null;
      try { outsiderRumor = nostr.nip17.unwrapEvent(inContext, outsiderSecret); } catch {}
      assert.ok(!outsiderRumor || typeof outsiderRumor.content !== 'string' || !messageManifest.some(item => outsiderRumor.content.includes(item.request) || outsiderRumor.content.includes(item.response)), 'an unrelated identity cannot decrypt conversation envelopes');
    }
    relayedEvents.push({ url: relay.url, wrappers: events.length, ids_sha256: createHash('sha256').update(events.map(event => event.id).sort().join('\n')).digest('hex') });
  }
  assert.equal(new Set(relayedEvents.map(relay => relay.ids_sha256)).size, 1, 'selected relays hold identical NIP-17 ciphertext envelopes');

  assert.deepEqual(instrumented.externalRequests, [], 'all browser HTTP requests stayed on the local Property server');
  assert.ok(instrumented.websocketUrls.length > 0 && instrumented.websocketUrls.every(url => /^ws:\/\/127\.0\.0\.1:2848[3-5](?:\/|$)/.test(url)), 'browser websocket connections are limited to local Geode relays');
  assert.deepEqual(instrumented.pageErrors, [], 'PWA has no runtime errors');
  assert.ok(proxy.attempts.every(attempt => attempt.blocked === true), 'every browser-originated external proxy request is denied locally with HTTP 502');
  await mkdir(path.resolve(options.output), { recursive: true, mode: 0o700 });
  await page.screenshot({ path: path.join(path.resolve(options.output), 'pwa-agent-exchanges.png'), fullPage: false });
  const result = {
    gate: 'G5', status: 'PASS_AUTOMATED_OFFLINE', seed: 'property-g5-human-pwa-agent-25-round-trips-v1',
    operating_system: `${process.platform}/${process.arch}`, browser: runtime.evidence, geode_sha256: GEODE_SHA256,
    external_connections: 0, external_models: 0, real_participants: 0, real_funds: false, public_relays: false,
    human_pubkey_sha256: createHash('sha256').update(human.pubkey).digest('hex'), agent_pubkey_sha256: createHash('sha256').update(agentPubkey).digest('hex'),
    human_pwa_agent_round_trips: EXCHANGES, human_to_agent_messages: EXCHANGES, agent_to_human_messages: EXCHANGES,
    encrypted_wrappers_per_relay: relayedEvents, no_human_approval_record: conversationState.agentAccess === null,
    ciphertext_contains_plaintext: false, unrelated_identity_decryption_attempts_per_relay: EXCHANGES * 4,
    browser_websockets_local_only: true, browser_external_requests: instrumented.externalRequests.length,
    browser_external_proxy_attempts_blocked: proxy.attempts.length,
    blocked_proxy_destinations: [...new Set(proxy.attempts.map(attempt => attempt.destination))].sort(),
    mcp_service_sends: EXCHANGES, incoming_messages_decrypted_by_agent: EXCHANGES, outgoing_messages_decrypted_by_pwa: EXCHANGES,
  };
  await writeFile(path.join(path.resolve(options.output), 'pwa-agent-exchanges.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  outsiderSecret?.fill(0);
  if (agent) { agent.secret.fill(0); agent.transport.context.propertyAgentSecretHex = ''; }
  await context?.close().catch(() => {});
  await runtime?.browser.close().catch(() => {});
  if (app?.server.listening) await new Promise(resolve => app.server.close(resolve));
  if (proxy?.server.listening) await new Promise(resolve => { proxy.server.closeAllConnections?.(); proxy.server.close(resolve); });
  for (const relay of relays.reverse()) await stopGeode(relay).catch(error => process.stderr.write(`cleanup: ${error.message}\n`));
  await rm(temp, { recursive: true, force: true });
}
