import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/pwa.js', import.meta.url), 'utf8');

function loadPwa({ href = 'https://coercaodobem.github.io/property/', standalone = false } = {}) {
  const listeners = new Map();
  const historyWrites = [];
  const window = {
    location: { href },
    history: { state: { source: 'test' }, replaceState(...args) { historyWrites.push(args); window.location.href = new URL(args[2], window.location.href).href; } },
    matchMedia: () => ({ matches: standalone }),
    addEventListener(name, listener) {
      const entries = listeners.get(name) || [];
      entries.push(listener);
      listeners.set(name, entries);
    }
  };
  const context = { window, navigator: { standalone: false }, URL, Set };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { pwa: window.PropertyPwa, listeners, historyWrites };
}

const launch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=marketplace&source=homescreen#return' });
assert.equal(launch.pwa.consumeLaunchAction(), 'marketplace');
assert.deepEqual(launch.historyWrites[0], [{ source: 'test' }, '', '/property/?source=homescreen#return']);
assert.equal(launch.pwa.consumeLaunchAction(), '', 'the shortcut action is consumed exactly once');

const invalidLaunch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=unknown' });
assert.equal(invalidLaunch.pwa.consumeLaunchAction(), '', 'unknown shortcut actions are ignored');
assert.equal(invalidLaunch.historyWrites.length, 0, 'unknown query values are not rewritten');

const promptFlow = loadPwa();
let prevented = false;
let prompted = false;
let installedToast = 0;
const button = { hidden: false, handlers: {}, addEventListener(name, listener) { this.handlers[name] = listener; } };
const helpDialog = { opens: 0, showModal() { this.opens += 1; } };
const promptEvent = { preventDefault() { prevented = true; }, async prompt() { prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
promptFlow.listeners.get('beforeinstallprompt')[0](promptEvent);
promptFlow.pwa.bindInstallControls([button], helpDialog, () => { installedToast += 1; });
assert.equal(prevented, true, 'the native install prompt waits for a deliberate user click');
await button.handlers.click();
assert.equal(prompted, true);
assert.equal(helpDialog.opens, 0);
promptFlow.listeners.get('appinstalled')[0]();
assert.equal(button.hidden, true, 'the install control disappears after installation');
assert.equal(installedToast, 1);

const dismissedFlow = loadPwa();
const dismissedButton = { hidden: false, handlers: {}, addEventListener(name, listener) { this.handlers[name] = listener; } };
const dismissedHelp = { opens: 0, showModal() { this.opens += 1; } };
dismissedFlow.listeners.get('beforeinstallprompt')[0]({ preventDefault() {}, async prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
dismissedFlow.pwa.bindInstallControls([dismissedButton], dismissedHelp);
await dismissedButton.handlers.click();
assert.equal(dismissedHelp.opens, 1, 'a dismissed prompt falls back to optional browser instructions');

const manualFlow = loadPwa();
const manualButton = { hidden: false, handlers: {}, addEventListener(name, listener) { this.handlers[name] = listener; } };
const manualHelp = { opens: 0, showModal() { this.opens += 1; } };
manualFlow.pwa.bindInstallControls([manualButton], manualHelp);
await manualButton.handlers.click();
assert.equal(manualHelp.opens, 1, 'browsers without a native prompt show install instructions');

const installedFlow = loadPwa({ standalone: true });
const installedButton = { hidden: false, addEventListener() {} };
installedFlow.pwa.bindInstallControls([installedButton], manualHelp);
assert.equal(installedButton.hidden, true, 'standalone installs do not offer a duplicate install action');

console.log('PASS: PWA shortcuts are allowlisted and install controls cover prompted, manual, and installed states');
