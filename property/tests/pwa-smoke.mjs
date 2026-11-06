import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/pwa.js', import.meta.url), 'utf8');

function loadPwa({ href = 'https://coercaodobem.github.io/property/', standalone = false } = {}) {
  const listeners = new Map();
  const historyWrites = [];
  const dispatched = [];
  const window = {
    location: { href },
    history: { state: { source: 'test' }, replaceState(...args) { historyWrites.push(args); window.location.href = new URL(args[2], window.location.href).href; } },
    matchMedia: () => ({ matches: standalone }),
    dispatchEvent(event) { dispatched.push(event); for (const listener of listeners.get(event.type) || []) listener(event); },
    addEventListener(name, listener) {
      const entries = listeners.get(name) || [];
      entries.push(listener);
      listeners.set(name, entries);
    }
  };
  const context = { window, navigator: { standalone: false }, URL, URLSearchParams, Set,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { pwa: window.PropertyPwa, listeners, historyWrites, dispatched, window };
}

const launch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=marketplace&source=homescreen#return' });
assert.equal(launch.pwa.consumeLaunchAction(), 'marketplace');
assert.deepEqual(launch.historyWrites[0], [{ source: 'test' }, '', '/property/?source=homescreen#return']);
assert.equal(launch.pwa.consumeLaunchAction(), '', 'the shortcut action is consumed exactly once');

const invalidLaunch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=unknown' });
assert.equal(invalidLaunch.pwa.consumeLaunchAction(), '', 'unknown shortcut actions are ignored');
assert.equal(invalidLaunch.historyWrites.length, 0, 'unknown query values are not rewritten');

const shareLaunch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=share&text=private' });
assert.equal(shareLaunch.pwa.consumeLaunchAction(), 'share', 'incoming shares open the same Property PWA');
assert.deepEqual(shareLaunch.historyWrites[0], [{ source: 'test' }, '', '/property/?text=private']);
assert.equal(shareLaunch.pwa.consumeLaunchAction(), '', 'incoming share launch is consumed once');

const overflowLaunch = loadPwa({ href: 'https://coercaodobem.github.io/property/?launch=share-full' });
assert.equal(overflowLaunch.pwa.consumeLaunchAction(), 'share-full', 'queue overflow has a safe fixed launch status');

const publicContact = 'nprofile1local-test-contact';
const contactLaunch = loadPwa({ href: `https://coercaodobem.github.io/property/?keep=1#contact=${encodeURIComponent(publicContact)}&view=messages` });
assert.equal(contactLaunch.pwa.consumeContactIntent(), publicContact, 'contact intent is read before app boot');
assert.equal(contactLaunch.pwa.consumeContactIntent(), '', 'contact intent is consumed once');
assert.deepEqual(contactLaunch.historyWrites[0], [{ source: 'test' }, '', '/property/?keep=1#view=messages'], 'public contact is removed from the address bar while unrelated route state is retained');
contactLaunch.window.location.href = `https://coercaodobem.github.io/property/#contact=${encodeURIComponent(publicContact)}`;
contactLaunch.listeners.get('hashchange')[0]();
assert.equal(contactLaunch.pwa.consumeContactIntent(), publicContact, 'same-page contact navigation is queued for an active Property session');
assert.equal(contactLaunch.dispatched[0].type, 'property-contact-intent', 'same-page contact navigation notifies the active app');
assert.equal(contactLaunch.historyWrites.length, 2, 'same-page contact fragment is removed after capture');
assert.equal(contactLaunch.window.location.href, 'https://coercaodobem.github.io/property/', 'same-page public contact is removed from the address bar');
const routeOnly = loadPwa({ href: 'https://coercaodobem.github.io/property/#view=messages' });
assert.equal(routeOnly.pwa.consumeContactIntent(), '', 'ordinary routes are not treated as contact links');
assert.equal(routeOnly.historyWrites.length, 0, 'ordinary routes are not rewritten');

const encryptedInvite = `${'a'.repeat(64)}.ciphertext+/=`;
const inviteLaunch = loadPwa({ href: `https://coercaodobem.github.io/property/?keep=1#groupInvite=${encodeURIComponent(encryptedInvite)}&view=messages` });
assert.equal(inviteLaunch.pwa.consumeGroupInviteIntent(), encryptedInvite, 'the initial group invite is captured before app boot');
assert.equal(inviteLaunch.pwa.consumeGroupInviteIntent(), '', 'group invite intents are consumed exactly once');
assert.deepEqual(inviteLaunch.historyWrites[0], [{ source: 'test' }, '', '/property/?keep=1#view=messages'], 'encrypted group data is removed from the visible URL while other route state remains');
inviteLaunch.window.location.href = `https://coercaodobem.github.io/property/#groupInvite=${encodeURIComponent(encryptedInvite)}`;
inviteLaunch.listeners.get('hashchange')[1]();
assert.equal(inviteLaunch.pwa.consumeGroupInviteIntent(), encryptedInvite, 'same-page group links reach the active Property app');
assert.equal(inviteLaunch.dispatched[0].type, 'property-group-invite-intent', 'active sessions receive a group invite event');
assert.equal(inviteLaunch.historyWrites.length, 2, 'same-page group invite fragments are removed immediately');
assert.equal(inviteLaunch.window.location.href, 'https://coercaodobem.github.io/property/', 'the invite payload does not remain in browser history');

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

console.log('PASS: PWA shortcuts, initial and active-session contact-link intake, safe URL cleanup, and install controls');
