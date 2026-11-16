#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeNode, createAccount, loadRuntime, openApp, publishEvent, startAppServer, startGeode, startProxy, stopGeode, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestPath, outputPath = '/tmp/property-g10-group-ux'] = process.argv.slice(2);
const FIXED_EPOCH_SECONDS = 1_794_846_720;
assert.ok(manifestPath, 'pinned browser manifest path is required');
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const config = manifest.browser_automation;
assert.ok(config, 'pinned browser automation metadata is required');
const output = path.resolve(outputPath);
await mkdir(output, { recursive: true, mode: 0o700 });
const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-g10-group-'));
const app = startAppServer(), proxy = startProxy(), relays = [];
let runtime, contextA, contextB;
let stage = 'initialization';
const report = { schema_version: 1, case: 'G10-07', result: 'FAIL', participants: 3, invalid_membership_checks: 0,
  predefined_variables: { fixed_epoch_seconds: FIXED_EPOCH_SECONDS }, language_checks: [], viewports: [], relay_event_count: null,
  plaintext_observed_at_relay: null, screenshots: [], external_requests: [] };
async function saveRelaysBeforeIdentity(page, relayUrl) {
  const saved = await page.evaluate(async url => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('liberdade-local-v1'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ id: 'relays', values: [url], autoSelected: false });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
    const result = await new Promise((resolve, reject) => { const req = db.transaction('settings').objectStore('settings').get('relays'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    db.close(); return result;
  }, relayUrl);
  assert.deepEqual(saved?.values, [relayUrl]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#auth-choice').waitFor({ state: 'visible', timeout: 20000 });
}
async function publishInboxFromUi(page, relayUrl) {
  stage = 'open-settings-for-inbox';
  await page.locator('#open-settings').click();
  await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#relay-input').fill(relayUrl);
  await page.locator('#dm-relay-input').fill(relayUrl);
  await page.locator('#save-relays').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
  stage = 'wait-for-loopback-relay-connection';
  try { await page.waitForFunction(() => document.querySelector('#connection-label')?.textContent === '1/1 relay', null, { timeout: 12000 }); }
  catch (error) {
    const diagnostics = await page.evaluate(() => ({ connection: document.querySelector('#connection-label')?.textContent || '',
      summary: document.querySelector('#relay-summary-text')?.textContent || '', error: document.querySelector('#relay-error')?.textContent.trim() || '',
      toast: document.querySelector('#toast')?.textContent.trim() || '' }));
    throw new Error(`relay connection did not reach 1/1: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
  stage = 'publish-inbox-list-from-ui';
  await page.locator('#open-settings').click();
  await page.locator('#relay-dialog').waitFor({ state: 'visible' });
  await page.locator('#publish-inbox-list').click();
  try { await page.waitForFunction(() => /Sua lista pública de recebimento NIP-17 foi publicada|The public NIP-17 inbox list was published|Your public NIP-17 inbox relay list was published/.test(document.querySelector('#toast')?.textContent || '') || Boolean(document.querySelector('#relay-error')?.textContent.trim()), null, { timeout: 12000 }); }
  catch (error) {
    const diagnostics = await page.evaluate(() => ({ connection: document.querySelector('#connection-label')?.textContent || '',
      error: document.querySelector('#relay-error')?.textContent.trim() || '', toast: document.querySelector('#toast')?.textContent.trim() || '' }));
    throw new Error(`inbox-list publication did not settle: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
  assert.equal((await page.locator('#relay-error').textContent()).trim(), '', 'the user UI publishes the local inbox list');
  await page.locator('#relay-dialog button[aria-label="Close"], #relay-dialog button[aria-label="Fechar"]').click();
  await page.locator('#relay-dialog').waitFor({ state: 'hidden' });
}
async function createGroup(page, title, members) {
  await page.locator('#new-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#open-group-dialog').click();
  await page.locator('#group-dialog').waitFor({ state: 'visible' });
  await page.locator('#group-name-input').fill(title);
  await page.locator('#group-members-input').fill(members.join('\n'));
  await page.locator('#create-group-button').click();
  await page.locator('#conversation-pane').waitFor({ state: 'visible' });
}
async function addLocalContact(page, npub, label) {
  await page.locator('#new-chat-button').click();
  await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#peer-input').fill(npub);
  await page.locator('#peer-name-input').fill(label);
  await page.locator('#start-chat-button').click();
  await page.waitForFunction(() => !document.querySelector('#new-chat-dialog')?.open || Boolean(document.querySelector('#new-chat-error')?.textContent.trim()), null, { timeout: 8000 });
  const error = (await page.locator('#new-chat-error').textContent()).trim();
  if (error) throw new Error(`could not add synthetic local contact: ${error}`);
  await page.waitForFunction(name => document.querySelector('#chat-title')?.textContent === name, label);
}
async function openGroupDialog(page, locale, title, members) {
  await page.locator('#language-picker').selectOption(locale);
  await page.locator('#new-chat-button').click();
  await page.locator('#open-group-dialog').click();
  const copy = (await page.locator('#group-dialog .fine-print').innerText()).replace(/\s+/g, ' ');
  if (locale === 'en') {
    assert.match(copy, /no administrator, membership approval, or reliable leave\/removal control/i);
    assert.match(copy, /Each member needs a public NIP-17 inbox list/);
  } else {
    assert.match(copy, /não têm administrador, aprovação de entrada nem controle confiável para sair ou remover membros/i);
    assert.match(copy, /Cada membro precisa publicar uma lista de recebimento NIP-17/);
  }
  assert.equal(await page.locator('#group-dialog input[type="password"], #group-dialog input[name*="key" i]').count(), 0,
    'group setup adds no private-key or password step');
  report.language_checks.push({ locale, copy });
  await page.locator('#group-dialog button[aria-label="Close"], #group-dialog button[aria-label="Fechar"]').click();
  await page.locator('#group-dialog').waitFor({ state: 'hidden' });
  if (title && members) await createGroup(page, title, members);
}
async function layoutCheck(page, width, height) {
  await page.setViewportSize({ width, height });
  if (width <= 430) {
    await page.locator('#voice-record-button').scrollIntoViewIfNeeded();
    const toolbar = await page.evaluate(() => {
      const bar = document.querySelector('.composer-format-tools'), button = document.querySelector('#voice-record-button');
      const r = button.getBoundingClientRect();
      return { client_width: bar.clientWidth, scroll_width: bar.scrollWidth, scroll_left: bar.scrollLeft,
        button_visible: r.left >= -1 && r.right <= innerWidth + 1 };
    });
    assert.ok(toolbar.scroll_left > 0 && toolbar.button_visible, `mobile composer controls remain reachable by scrolling within the toolbar: ${JSON.stringify(toolbar)}`);
    report.mobile_toolbar = toolbar;
    await page.evaluate(() => { document.querySelector('.composer-format-tools').scrollLeft = 0; });
  }
  const result = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], document: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    body: document.body.scrollWidth, title: document.querySelector('#chat-title')?.textContent.trim(), groupDetails: document.querySelector('#chat-group-details')?.textContent.trim(),
    overflow: [...document.querySelectorAll('body *')].filter(element => { const r = element.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; })
      .slice(0, 20).map(element => ({ tag: element.tagName, id: element.id, class: String(element.className || ''), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) })) }));
  report.viewports.push({ width, height, ...result });
  const file = path.join(output, `group-${width}x${height}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  report.screenshots.push(path.basename(file));
  assert.ok(result.document[0] <= result.document[1] + 1 && result.body <= result.document[1] + 1, `group layout fits viewport ${width}x${height}: ${JSON.stringify(result)}`);
}
async function save() { await writeFile(path.join(output, 'g10-group-ux-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }

try {
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  stage = 'load-pinned-browser';
  runtime = await loadRuntime(config, proxy.server.address().port);
  stage = 'start-loopback-relay';
  relays.push(await startGeode(28571, scratch, 'G10 group relay'));
  const relay = relays[0];
  stage = 'open-browser-profiles';
  contextA = await runtime.browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1440, height: 900 } });
  contextB = await runtime.browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1440, height: 900 } });
  for (const context of [contextA, contextB]) {
    await context.addInitScript(fixedMs => {
      const NativeDate = Date;
      class PropertyFixedDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedMs])); }
        static now() { return fixedMs; }
      }
      Object.setPrototypeOf(PropertyFixedDate, NativeDate);
      window.Date = PropertyFixedDate;
    }, FIXED_EPOCH_SECONDS * 1000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  }
  const pageA = await openApp(contextA, origin), pageB = await openApp(contextB, origin);
  stage = 'set-loopback-relays-before-identity';
  await saveRelaysBeforeIdentity(pageA, relay.url); await saveRelaysBeforeIdentity(pageB, relay.url);
  stage = 'create-synthetic-identities';
  const a = await createAccount(pageA), b = runtime.createIdentity(), c = runtime.createIdentity();
  stage = 'publish-inbox-a';
  await publishInboxFromUi(pageA, relay.url);
  const secretB = b.secretHex;
  stage = 'import-identity-b';
  await createAccount(pageB, secretB);
  stage = 'publish-inbox-b';
  await publishInboxFromUi(pageB, relay.url);
  stage = 'publish-inbox-c-fixture';
  const cInbox = runtime.sign(10050, '', FIXED_EPOCH_SECONDS, c.secret, [['relay', relay.url]]);
  assert.equal((await publishEvent(relay.url, cInbox)).accepted, true, 'synthetic participant C publishes a signed inbox fixture to the loopback relay');
  const inboxEvents = await wsQuery(relay.url, { kinds: [10050], limit: 10 });
  assert.ok([a.pubkey, b.pubkey, c.pubkey].every(pubkey => inboxEvents.some(event => event.pubkey === pubkey && runtime.verifyEvent(event))));

  stage = 'create-local-contact-for-sender-label';
  await addLocalContact(pageA, b.pubkey, 'Participant B');
  const title = 'G10 shared room';
  stage = 'open-group-form-and-check-english-copy';
  await pageA.locator('#new-chat-button').click(); await pageA.locator('#open-group-dialog').click();
  const enCopy = (await pageA.locator('#group-dialog .fine-print').innerText()).replace(/\s+/g, ' ');
  assert.match(enCopy, /no administrator, membership approval, or reliable leave\/removal control/i);
  assert.match(enCopy, /Each member needs a public NIP-17 inbox list/);
  assert.equal(await pageA.locator('#group-dialog input[type="password"], #group-dialog input[name*="key" i]').count(), 0);
  report.language_checks.push({ locale: 'en', copy: enCopy });
  await pageA.locator('#group-name-input').fill(title);
  await pageA.locator('#group-members-input').fill(`${b.pubkey}\n${b.pubkey}`);
  stage = 'reject-duplicate-members';
  await pageA.locator('#create-group-button').click();
  assert.match((await pageA.locator('#group-error').textContent()).trim(), /duplicate|duplicad/i);
  assert.equal(await pageA.locator('#group-dialog').isVisible(), true);
  report.invalid_membership_checks++;
  await pageA.locator('#group-members-input').fill(`${b.pubkey}\n${c.pubkey}`);
  stage = 'create-group-a';
  await pageA.locator('#create-group-button').click();
  await pageA.locator('#group-dialog').waitFor({ state: 'hidden' });
  await pageA.locator('#chat-title').waitFor({ state: 'visible' });
  assert.equal((await pageA.locator('#chat-title').textContent()).trim(), title);
  const groupDetails = pageA.locator('#chat-group-details');
  await pageA.locator('#chat-details-button').click();
  await groupDetails.waitFor({ state: 'visible' });
  assert.match((await groupDetails.textContent()).trim(), /3 members/);
  assert.match((await groupDetails.textContent()).trim(), /no administrator or reliable member removal/i);
  await pageA.locator('#chat-details-dialog button[aria-label="Close"], #chat-details-dialog button[aria-label="Fechar"]').click();

  stage = 'create-group-b';
  await openGroupDialog(pageB, 'pt-BR', title, [a.pubkey, c.pubkey]);
  stage = 'send-group-message-from-b';
  await pageB.evaluate(() => { const toast = document.querySelector('#toast'); if (toast) toast.textContent = ''; });
  await pageB.locator('#message-input').fill('G10 synthetic group sender label');
  await pageB.locator('#send-form button[type="submit"]').click();
  try { await pageB.waitForFunction(() => document.querySelector('#messages .message-bubble')?.textContent.includes('G10 synthetic group sender label') || Boolean(document.querySelector('#toast')?.textContent.trim()), null, { timeout: 12000 }); }
  catch (error) { throw new Error(`group send did not render or report: ${JSON.stringify(await pageB.evaluate(() => ({ toast: document.querySelector('#toast')?.textContent.trim() || '', connection: document.querySelector('#connection-label')?.textContent || '', title: document.querySelector('#chat-title')?.textContent || '', input: document.querySelector('#message-input')?.value || '' })))}; ${error.message}`); }
  const sendNotice = (await pageB.locator('#toast').textContent()).trim();
  if (!await pageB.locator('#messages .message-bubble').filter({ hasText: 'G10 synthetic group sender label' }).isVisible().catch(() => false)) {
    throw new Error(`group send was rejected in the UI: ${sendNotice}`);
  }
  const incoming = pageA.locator('#messages .message-row').filter({ hasText: 'G10 synthetic group sender label' }).first();
  stage = 'verify-sender-label-and-message-controls';
  await incoming.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal((await incoming.locator('.group-message-author').textContent()).trim(), 'Participant B', 'group sender label resolves to the saved local contact name');
  assert.equal(await incoming.locator('.message-reply:enabled').count(), 1, 'group reply control is available');
  assert.equal(await incoming.locator('.message-react:enabled').count(), 1, 'group reaction control is available');
  await incoming.locator('.message-reply').click();
  assert.equal(await pageA.locator('#reply-context').isVisible(), true, 'reply control opens the reply composer context');
  await pageA.locator('#cancel-reply').click();
  await incoming.locator('.message-react').click();
  assert.equal(await incoming.locator('.message-reaction-picker').isVisible(), true, 'reaction control opens the group reaction picker');
  await incoming.locator('.message-react').click();
  await incoming.locator('.message-menu summary').click();
  await incoming.locator('.message-menu-items button').filter({ hasText: 'Forward' }).click();
  await pageA.locator('#forward-dialog').waitFor({ state: 'visible' });
  await pageA.locator('#forward-dialog button[aria-label="Close"], #forward-dialog button[aria-label="Fechar"]').click().catch(async () => pageA.keyboard.press('Escape'));
  if (await pageA.locator('#forward-dialog').isVisible()) await pageA.keyboard.press('Escape');

  stage = 'verify-encrypted-relay-event';
  const storedWraps = await wsQuery(relay.url, { kinds: [1059], limit: 100 });
  report.relay_event_count = storedWraps.length;
  const bRumor = storedWraps.map(event => { try { return runtime.unwrapEvent(event, b.secret); } catch { return null; } })
    .find(rumor => rumor?.pubkey === b.pubkey && rumor?.content === 'G10 synthetic group sender label');
  assert.ok(bRumor, 'the relay stored a group gift wrap decryptable as participant B and signed by B');
  report.plaintext_observed_at_relay = storedWraps.some(event => event.content.includes('G10 synthetic group sender label'));
  assert.equal(report.plaintext_observed_at_relay, false, 'the relay stores encrypted NIP-17 envelopes, not group plaintext');

  stage = 'verify-portuguese-group-explanation';
  await pageA.locator('#language-picker').selectOption('pt-BR');
  await pageA.waitForFunction(() => window.PropertyI18n?.language === 'pt-BR');
  report.language_checks.push({ locale: 'pt-BR', active_language: await pageA.evaluate(() => window.PropertyI18n.language) });
  stage = 'reload-and-reopen-group';
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.locator('#workspace').waitFor({ state: 'visible', timeout: 20000 });
  const groupRow = pageA.locator('#conversation-list .conversation-row').filter({ hasText: title }).first();
  await groupRow.locator('.conversation-item').click();
  await pageA.locator('#chat-title').waitFor({ state: 'visible' });
  assert.equal((await pageA.locator('#chat-title').textContent()).trim(), title, 'the same group reopens from its saved conversation row');
  const restoredGroup = await pageA.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('liberdade-local-v1'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const rows = await new Promise((resolve, reject) => { const req = db.transaction('conversations').objectStore('conversations').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    db.close(); return rows.find(row => row.title === 'G10 shared room');
  });
  assert.equal(restoredGroup?.group, true, 'the saved conversation remains a private group');
  assert.equal(restoredGroup?.members?.length, 3, 'three participants remain saved after reopening');
  await pageA.locator('#chat-details-button').click();
  await pageA.locator('#chat-details-dialog').waitFor({ state: 'visible' });
  const restoredDetails = (await pageA.locator('#chat-group-details').textContent()).trim();
  const detailsState = await pageA.evaluate(() => ({ language: window.PropertyI18n?.language, hidden: document.querySelector('#chat-group-details')?.hidden,
    title: document.querySelector('#chat-details-title')?.textContent.trim(), details: document.querySelector('#chat-group-details')?.textContent.trim() }));
  if (!restoredDetails) throw new Error(`group details copy missing after reopen: ${JSON.stringify(detailsState)}`);
  assert.match(restoredDetails, /3 participantes/);
  assert.match(restoredDetails, /não têm administrador nem remoção confiável de membros/);
  report.language_checks.push({ locale: 'pt-BR', creation_copy: 'validated', reopened_details: restoredDetails });
  await pageA.locator('#chat-details-dialog button[aria-label="Close"], #chat-details-dialog button[aria-label="Fechar"]').click();
  stage = 'viewport-390-and-1440';
  await layoutCheck(pageA, 390, 844);
  await layoutCheck(pageA, 1440, 900);
  assert.ok(report.language_checks.some(row => row.locale === 'en') && report.language_checks.some(row => row.locale === 'pt-BR'));
  report.result = 'PASS';
  await save();
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.reason = `${stage}: ${String(error?.message || error)}`.replace(/[\r\n]+/g, ' ').slice(0, 1000);
  await save(); process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally {
  await closeNode({ context: contextB }); await closeNode({ context: contextA });
  if (runtime?.browser) await runtime.browser.close().catch(() => {});
  for (const relay of relays.reverse()) await stopGeode(relay);
  for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
