#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeNode, createAccount, loadRuntime, startAppServer, startProxy } from './browser-g05-smoke.mjs';

const [manifestPath, outputPath = '/tmp/property-g10-install-launch'] = process.argv.slice(2);
assert.ok(manifestPath, 'pinned browser manifest path is required');
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const config = manifest.browser_automation;
assert.ok(config, 'pinned browser automation metadata is required');
const output = path.resolve(outputPath); await mkdir(output, { recursive: true, mode: 0o700 });
const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-g10-install-'));
const app = startAppServer(), proxy = startProxy();
let runtime;
const report = { schema_version: 1, case: 'G10-08', result: 'FAIL', fixed_cycles_per_state: 3,
  identity_states: ['before_identity', 'after_identity'], install_states: ['accepted', 'dismissed', 'no_prompt', 'already_installed'],
  install_cycles: [], launch_actions: [], unknown_action: null, language_copy: [], total_prompt_invocations: 0 };
async function newPage(url, installed = false) {
  const context = await runtime.browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  await context.addInitScript(isInstalled => {
    if (isInstalled) {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(display-mode: standalone)' ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : original(query);
    }
  }, installed);
  context.on('page', page => page.on('pageerror', error => { throw error; }));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(url || `${origin}/property/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.locator('#auth-choice').waitFor({ state: 'visible', timeout: 20000 });
  return { context, page, origin };
}
async function promptState(page, state) {
  if (state === 'accepted' || state === 'dismissed') {
    const prevented = await page.evaluate(outcome => {
      window.__propertyPromptCalls = 0;
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperties(event, {
        prompt: { value: async () => { window.__propertyPromptCalls++; } },
        userChoice: { value: Promise.resolve({ outcome }) }
      });
      const accepted = window.dispatchEvent(event);
      return { dispatch_not_cancelled: accepted, pending_event_dispatched: true };
    }, state);
    assert.equal(prevented.dispatch_not_cancelled, false, 'PWA captures and defers the synthetic native-install prompt');
  } else {
    await page.evaluate(() => { window.__propertyPromptCalls = 0; });
  }
  assert.equal(await page.evaluate(() => window.__propertyPromptCalls), 0, 'no prompt is invoked before an explicit click');
}
async function visibleInstallButton(page, afterIdentity) {
  if (afterIdentity) await page.locator('#profile-button').click();
  const button = page.locator('[data-install-property]:visible').first();
  await button.waitFor({ state: 'visible' });
  return button;
}
async function assertLocalizedFallback(page, state, identityState, repetition) {
  const english = (await page.locator('#install-app-dialog').innerText()).replace(/\s+/g, ' ');
  assert.match(english, /Otherwise, keep using Property in this browser\./, 'English fallback keeps browser use available');
  report.language_copy.push({ state, identity_state: identityState, repetition, locale: 'en', copy: english });
  await page.locator('#install-app-dialog .dialog-body form[method="dialog"] button').click();
  await page.locator('#install-app-dialog').waitFor({ state: 'hidden' });
  await page.locator('#language-picker').selectOption('pt-BR');
  await page.locator('[data-install-property]:visible').first().click();
  await page.locator('#install-app-dialog').waitFor({ state: 'visible' });
  const portuguese = (await page.locator('#install-app-dialog').innerText()).replace(/\s+/g, ' ');
  assert.match(portuguese, /Caso contrário, continue usando o Property no navegador\./, 'Portuguese fallback keeps browser use available');
  report.language_copy.push({ state, identity_state: identityState, repetition, locale: 'pt-BR', copy: portuguese });
  await page.locator('#install-app-dialog .dialog-body form[method="dialog"] button').click();
  await page.locator('#install-app-dialog').waitFor({ state: 'hidden' });
}
async function runInstallCycle(identityState, state, repetition) {
  const { context, page } = await newPage(undefined, state === 'already_installed');
  try {
    const afterIdentity = identityState === 'after_identity';
    await promptState(page, state);
    if (afterIdentity) await createAccount(page);
    else assert.equal(await page.locator('#auth-choice').isVisible(), true, 'pre-identity install stays on the normal first-use screen');
    if (state === 'already_installed') {
      if (afterIdentity) await page.locator('#profile-button').click();
      const installDiagnostics = await page.evaluate(() => ({
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        controls: [...document.querySelectorAll('[data-install-property]')].map(button => ({ hidden: button.hidden,
          display: getComputedStyle(button).display, dialog: button.closest('dialog')?.id || '', dialog_open: button.closest('dialog')?.open ?? false }))
      }));
      assert.equal(await page.locator('[data-install-property]:visible').count(), 0,
        `installed mode hides every install control: ${JSON.stringify(installDiagnostics)}`);
      assert.equal(await page.evaluate(() => window.__propertyPromptCalls), 0);
      report.install_cycles.push({ identity_state: identityState, state, repetition, prompt_before_click: 0, prompt_after: 0,
        controls_hidden: true, app_usable: afterIdentity ? await page.locator('#workspace').isVisible() : await page.locator('#auth-choice').isVisible() });
      return;
    }
    const button = await visibleInstallButton(page, afterIdentity);
    assert.equal(await page.evaluate(() => window.__propertyPromptCalls), 0, 'opening settings does not invoke installation');
    await button.click();
    if (state === 'accepted' || state === 'dismissed') {
      assert.equal(await page.evaluate(() => window.__propertyPromptCalls), 1, 'native prompt is called once, in response to the tap');
      report.total_prompt_invocations++;
      if (state === 'dismissed') {
        await page.locator('#install-app-dialog').waitFor({ state: 'visible' });
        await assertLocalizedFallback(page, state, identityState, repetition);
      } else {
        assert.equal(await page.locator('#install-app-dialog').isVisible(), false, 'accepted prompt does not show fallback help');
        await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
        assert.equal(await page.locator('[data-install-property]:visible').count(), 0, 'appinstalled hides controls after acceptance');
      }
    } else {
      assert.equal(state, 'no_prompt');
      assert.equal(await page.evaluate(() => window.__propertyPromptCalls), 0);
      await page.locator('#install-app-dialog').waitFor({ state: 'visible' });
      await assertLocalizedFallback(page, state, identityState, repetition);
    }
    const appUsable = afterIdentity ? await page.locator('#workspace').isVisible() : await page.locator('#auth-choice').isVisible();
    assert.equal(appUsable, true, 'install help and prompt dismissal leave Property usable');
    report.install_cycles.push({ identity_state: identityState, state, repetition, prompt_before_click: 0,
      prompt_after_click: await page.evaluate(() => window.__propertyPromptCalls),
      controls_hidden: state === 'accepted', app_usable: appUsable, fallback_copy_checked: state === 'dismissed' || state === 'no_prompt' });
  } finally { await closeNode({ context }); }
}
async function openLaunch(action, secretHex, repetition) {
  const { context, page, origin } = await newPage(`${`http://127.0.0.1:${app.server.address().port}`}/property/?launch=${encodeURIComponent(action)}`);
  try {
    assert.equal(await page.locator('#auth-choice').isVisible(), true);
    await createAccount(page, secretHex);
    if (action === 'new-chat') await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
    else {
      await page.waitForFunction(view => document.querySelector(`#${view}-view`)?.classList.contains('hidden') === false, action);
      assert.equal(await page.locator(`.nav-button[data-view="${action}"]`).getAttribute('class').then(value => value.includes('active')), true);
    }
    report.launch_actions.push({ action, repetition, opens_after_identity: true, external_requests_allowed: false });
  } finally { await closeNode({ context }); }
}

try {
  await Promise.all([app.ready, proxy.ready]);
  runtime = await loadRuntime(config, proxy.server.address().port);
  for (const identityState of report.identity_states) {
    for (const state of report.install_states) {
      for (let repetition = 1; repetition <= report.fixed_cycles_per_state; repetition++) await runInstallCycle(identityState, state, repetition);
    }
  }
  assert.equal(report.install_cycles.length, 24, '2 identity states × 4 install states × 3 fixed cycles');
  assert.equal(report.total_prompt_invocations, 12, 'accepted and dismissed prompts are each tapped once in each cycle');
  const launchIdentity = runtime.createIdentity();
  for (const action of ['new-chat', 'hangout', 'marketplace']) for (let repetition = 1; repetition <= 3; repetition++) await openLaunch(action, launchIdentity.secretHex, repetition);
  assert.equal(report.launch_actions.length, 9, '3 allowlisted actions × 3 fixed opens');
  const unknown = await newPage(`http://127.0.0.1:${app.server.address().port}/property/?launch=delete-everything`);
  try {
    await createAccount(unknown.page, launchIdentity.secretHex);
    assert.equal(await unknown.page.locator('#new-chat-dialog').isVisible(), false);
    assert.equal(await unknown.page.locator('#messages-view').isVisible(), true);
    assert.equal(new URL(unknown.page.url()).searchParams.get('launch'), 'delete-everything', 'unknown launch action is ignored and left intact');
    report.unknown_action = { action: 'delete-everything', opened_default_view: true, dialog_opened: false, query_unchanged: true };
  } finally { await closeNode({ context: unknown.context }); }
  report.result = 'PASS';
  await writeFile(path.join(output, 'g10-install-launch-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.reason = String(error?.message || error).replace(/[\r\n]+/g, ' ').slice(0, 800);
  await writeFile(path.join(output, 'g10-install-launch-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally {
  if (runtime?.browser) await runtime.browser.close().catch(() => {});
  for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
