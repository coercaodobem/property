import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const origin = 'https://coercaodobem.github.io';
const scope = `${origin}/property/`;
const listeners = {};
const deleted = [];
let requests = [];
let currentCache;
let claimed = false;
const context = {
  URL,
  Request: class extends Request { constructor(path, options) { super(new URL(path, scope), options); } },
  caches: {
    async open(name) { currentCache = name; return { async addAll(items) { requests = items; } }; },
    async keys() { return [currentCache, 'property-shell-v5', 'liberdade-shell-v4', 'another-app-data']; },
    async delete(name) { deleted.push(name); return true; }
  },
  self: { location: { origin }, addEventListener(name, listener) { listeners[name] = listener; },
    async skipWaiting() {}, clients: { async claim() { claimed = true; } } }
};
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/sw.js', import.meta.url), 'utf8'), context);
let pending;
listeners.install({ waitUntil(promise) { pending = promise; } });
await pending;
assert.ok(requests.length >= 14);
assert.ok(requests.every(request => request.cache === 'reload'), 'install must refresh stale browser HTTP cache');
const cachedUrls = new Set(requests.map(request => request.url));
for (const page of ['index.html', 'about.html']) {
  const html = await readFile(new URL(`../web/${page}`, import.meta.url), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    assert.ok(cachedUrls.has(new URL(match[1], scope).href), `offline shell covers ${match[1]}`);
  }
}
listeners.activate({ waitUntil(promise) { pending = promise; } });
await pending;
assert.deepEqual(deleted.sort(), ['liberdade-shell-v4', 'property-shell-v5']);
assert.equal(claimed, true);

const failedListeners = {};
const failedDeletes = [];
let failureSkippedWaiting = false;
const failedContext = {
  URL,
  Request: class extends Request { constructor(path, options) { super(new URL(path, scope), options); } },
  caches: {
    async keys() { return ['property-shell-v9', 'another-app-data']; },
    async open(name) { return { async addAll() { throw new Error(`interrupted while installing ${name}`); } }; },
    async delete(name) { failedDeletes.push(name); return true; }
  },
  self: { location: { origin }, addEventListener(name, listener) { failedListeners[name] = listener; },
    async skipWaiting() { failureSkippedWaiting = true; }, clients: { async claim() {} } }
};
vm.createContext(failedContext);
vm.runInContext(await readFile(new URL('../web/sw.js', import.meta.url), 'utf8'), failedContext);
let failedInstall;
failedListeners.install({ waitUntil(promise) { failedInstall = promise; } });
await assert.rejects(failedInstall, /interrupted while installing/);
assert.deepEqual(failedDeletes, ['property-shell-v14'], 'partial update cache is deleted after precache failure');
assert.equal(failureSkippedWaiting, false, 'incomplete service worker never calls skipWaiting');

const duplicateListeners = {};
const duplicateDeletes = [];
let duplicateOpenCalled = false;
const duplicateContext = {
  URL,
  Request: class extends Request { constructor(path, options) { super(new URL(path, scope), options); } },
  caches: {
    async keys() { return ['property-shell-v14', 'another-app-data']; },
    async open() { duplicateOpenCalled = true; throw new Error('must not mutate the active shell cache'); },
    async delete(name) { duplicateDeletes.push(name); return true; }
  },
  self: { location: { origin }, addEventListener(name, listener) { duplicateListeners[name] = listener; },
    async skipWaiting() {}, clients: { async claim() {} } }
};
vm.createContext(duplicateContext);
vm.runInContext(await readFile(new URL('../web/sw.js', import.meta.url), 'utf8'), duplicateContext);
let duplicateInstall;
duplicateListeners.install({ waitUntil(promise) { duplicateInstall = promise; } });
await assert.rejects(duplicateInstall, /version already exists/);
assert.equal(duplicateOpenCalled, false, 'new worker refuses to overwrite the active versioned cache');
assert.deepEqual(duplicateDeletes, [], 'active cache is preserved when a version key is reused');
console.log('PASS: PWA install reloads all local assets, covers versioned HTML references, preserves unrelated caches');
