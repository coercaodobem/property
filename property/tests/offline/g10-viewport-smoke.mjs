#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, openApp, createAccount, closeNode } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestPath, outputArg = 'property/docs/evidence/offline/g10-viewport'] = process.argv.slice(2);
assert.ok(manifestPath, 'manifest path is required');
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const config = manifest.browser_automation;
assert.ok(config, 'pinned browser configuration is required');
const output = path.resolve(outputArg); await mkdir(output, { recursive: true, mode: 0o700 });
const report = { schema_version: 1, viewport_case: 'G10-05', pwa_fallback_case: 'G12-06', result: 'FAIL',
  viewports: [], unnamed_controls: [], focus: null, install_fallback: null, browser: null, external_requests: [], evidence: [],
  visual_review: { status: 'PENDING_HUMAN_REVIEW', required_screenshots: 8, captured_screenshots: 0,
    note: 'Captures document the automated journey; they do not simulate human review.' } };
const app = startAppServer(), proxy = startProxy();
let runtime, context, page;
try {
  await Promise.all([app.ready, proxy.ready]);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  runtime = await loadRuntime(config, proxy.server.address().port);
  report.browser = runtime.evidence;
  context = await runtime.browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try { Object.defineProperty(window, 'BeforeInstallPromptEvent', { value: undefined, configurable: true }); } catch {}
  });
  context.on('request', request => { if (new URL(request.url()).origin !== origin) report.external_requests.push(new URL(request.url()).origin); });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  page = await openApp(context, origin);
  await createAccount(page);
  assert.equal(await page.locator('#workspace').isVisible(), true, 'interactive app workspace is usable');
  const screenshotDir = path.join(output, 'screenshots');
  await mkdir(screenshotDir, { recursive: true, mode: 0o700 });
  const captureScreenshot = async name => {
    const relative = `screenshots/${name}.png`;
    await page.screenshot({ path: path.join(output, relative), fullPage: false, animations: 'disabled' });
    report.evidence.push(relative);
    return relative;
  };

  const targets = [[360,800],[390,844],[768,1024],[1440,900]];
  for (const [width, height] of targets) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      document_width: document.documentElement.scrollWidth, body_width: document.body.scrollWidth,
      viewport_width: document.documentElement.clientWidth,
      visible_primary_controls: [...document.querySelectorAll('#workspace button[data-view], #workspace #profile-button, #workspace #mobile-open-settings')]
        .filter(element => { const r=element.getBoundingClientRect(); return r.width>0 && r.height>0; }).map(element=>element.getAttribute('aria-label')||element.textContent.trim()),
      overflow_elements:[...document.querySelectorAll('body *')].filter(element=>{const r=element.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).slice(0,12).map(element=>({tag:element.tagName,id:element.id,classes:String(element.className||''),left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right),width:Math.round(element.getBoundingClientRect().width)})) }));
    const screenshot = await captureScreenshot(`viewport-${width}x${height}`);
    report.viewports.push({ width, height, layout, screenshot, pass: layout.document_width <= layout.viewport_width + 1 && layout.body_width <= layout.viewport_width + 1 });
    assert.ok(layout.document_width <= layout.viewport_width + 1 && layout.body_width <= layout.viewport_width + 1,
      `no unintended horizontal overflow at ${width}x${height}`);
    assert.ok(layout.visible_primary_controls.length >= 3, `primary navigation remains available at ${width}x${height}`);
  }

  // A browser zoom of 200% reduces the effective CSS viewport to half its width.
  // This records responsive reflow, not native mobile browser or OS zoom certification.
  for (const [width, height] of targets) {
    await page.setViewportSize({ width: Math.max(180, Math.floor(width / 2)), height: Math.max(300, Math.floor(height / 2)) });
    const layout = await page.evaluate(() => ({ effective_zoom: '200% CSS viewport approximation',
      width: innerWidth, document_width: document.documentElement.scrollWidth,
      body_width: document.body.scrollWidth, viewport_width: document.documentElement.clientWidth,
      overflow_elements:[...document.querySelectorAll('body *')].filter(element=>{const r=element.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).slice(0,12).map(element=>({tag:element.tagName,id:element.id,classes:String(element.className||''),left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right),width:Math.round(element.getBoundingClientRect().width)})) }));
    const screenshot = await captureScreenshot(`viewport-200pct-from-${width}x${height}`);
    report.viewports.push({ width, height, effective_zoom: '200%', layout, screenshot, pass: layout.document_width <= layout.viewport_width + 1 && layout.body_width <= layout.viewport_width + 1 });
    assert.ok(layout.document_width <= layout.viewport_width + 1 && layout.body_width <= layout.viewport_width + 1,
      `responsive layout reflows at 200% effective width for ${width}x${height}`);
  }

  const accessibility = await page.evaluate(() => {
    const visible = element => { const r=element.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(element).visibility!=='hidden'; };
    const buttons = [...document.querySelectorAll('button:not([disabled])')].filter(visible);
    const unnamed = buttons.filter(element => !(element.getAttribute('aria-label') || element.getAttribute('title') || element.innerText.trim()));
    const fields = [...document.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(visible);
    const unlabelled = fields.filter(element => !(element.getAttribute('aria-label') || element.labels?.length));
    return { unnamed_buttons: unnamed.map(element=>element.outerHTML.slice(0,160)), unlabelled_fields: unlabelled.map(element=>element.id||element.tagName),
      visible_button_count: buttons.length, visible_field_count: fields.length };
  });
  report.unnamed_controls = [...accessibility.unnamed_buttons, ...accessibility.unlabelled_fields];
  assert.equal(report.unnamed_controls.length, 0, 'visible controls have accessible names');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const element=document.activeElement, style=getComputedStyle(element);
    return { tag: element?.tagName, id: element?.id||null, label: element?.getAttribute('aria-label')||element?.innerText?.trim()||null,
      visible: Boolean(element && element.getBoundingClientRect().width && element.getBoundingClientRect().height),
      focus_indicator: style.outlineStyle!=='none' && style.outlineWidth!=='0px' || style.boxShadow!=='none' };
  });
  report.focus = focus;
  assert.ok(focus.visible && focus.label && focus.focus_indicator, 'keyboard focus is visible and names the focused control');
  assert.deepEqual(report.external_requests, [], 'browser remained local while exercising the UI');
  report.viewport_case_result = 'PASS';

  const installFallback = await page.evaluate(() => ({
    service_worker_available: 'serviceWorker' in navigator,
    unsupported_install_mode_forced: typeof window.BeforeInstallPromptEvent === 'undefined',
    before_install_prompt_supported: typeof window.BeforeInstallPromptEvent !== 'undefined',
    custom_install_controls: [...document.querySelectorAll('button,a')].filter(element => /instal|adicionar.*tela inicial/i.test(element.innerText||element.getAttribute('aria-label')||'')).length,
    workspace_usable: Boolean(document.querySelector('#workspace:not(.hidden)')),
    install_instructions_visible: [...document.querySelectorAll('body *')].some(element => /instale este app|adicione.*tela inicial/i.test(element.textContent||''))
  }));
  assert.equal(installFallback.workspace_usable, true);
  assert.equal(installFallback.custom_install_controls, 0, 'unsupported browser receives no fake install control');
  report.install_fallback = installFallback;
  report.pwa_fallback_case_result = 'PASS';
  report.visual_review.captured_screenshots = report.evidence.length;
  assert.equal(report.evidence.length, report.visual_review.required_screenshots, 'every declared viewport has a saved screenshot');
  report.result = 'PASS';
  await writeFile(path.join(output, 'g10-viewport-report.json'), JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
} catch (error) {
  report.reason = String(error?.message || error).slice(0,700);
  report.result = 'FAIL';
  await writeFile(path.join(output, 'g10-viewport-report.json'), JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stderr.write(JSON.stringify(report)+'\n'); process.exitCode=1;
} finally {
  if (context) await closeNode({ context });
  if (runtime?.browser) await runtime.browser.close().catch(()=>{});
  await new Promise(resolve=>app.server.close(resolve));
  await new Promise(resolve=>proxy.server.close(resolve));
}
