'use strict';
importScripts('./share-inbox.js?v=property-v33');
const CACHE = 'property-shell-v56';
const SHELL = ['./', './index.html', './about.html', './about.pt-BR.html', './GHOSTLY-MIT-LICENSE.txt', './vendor/QR-CODE-GENERATOR-LICENSE.txt', './vendor/licenses/emoji-mart-data-MIT.txt', './vendor/emoji-data-15.json', './vendor/licenses/secret-guard/README.md', './vendor/licenses/secret-guard/NOBLE-HASHES-MIT.txt', './vendor/licenses/secret-guard/SCURE-BASE-MIT.txt', './vendor/licenses/secret-guard/SCURE-BIP39-MIT.txt', './vendor/licenses/secret-guard/MONERO-ENGLISH-BSD-3-CLAUSE.txt', './vendor/licenses/secret-guard/MONERO-PORTUGUESE-MIT-NOTICE.txt', './i18n.js?v=property-v48', './pwa.js?v=property-v35', './styles.css?v=property-v51', './project-story.css?v=property-v1', './relay-defaults.js?v=property-v32', './share-inbox.js?v=property-v33', './conversation-folders.js?v=property-v36', './chat-drafts.js?v=property-v38', './vendor/qr-code-generator.js?v=property-v39', './rich-text.js?v=property-v37', './message-edits.js?v=property-v1', './secret-guard.js?v=property-v1', './public-profile.js?v=property-v2', './nip05.js?v=property-v1', './emoji-picker.js?v=property-v2', './chat-gestures.js?v=property-v1', './app.js?v=property-v55', './vault.js?v=property-v26', './routing.js?v=property-v27', './forwarding.js?v=property-v26', './nano.js?v=property-v26', './money.js?v=property-v26', './marketplace.js?v=property-v26', './campaigns.js?v=property-v26', './contact.js?v=property-v26', './agent-messaging.js?v=property-v26', './chat-search.js?v=property-v28', './manifest.webmanifest?v=property-v33', './assets/icon.svg?v=property-v26', './assets/property-icon-180.png?v=property-v26', './assets/property-icon-192.png?v=property-v26', './assets/property-icon-512.png?v=property-v26', './vendor/nostr-tools-2.25.2.bundle.js?v=property-v26'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existingCaches = await caches.keys();
    if (existingCaches.includes(CACHE)) throw new Error(`Property shell version already exists: ${CACHE}`);
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' })));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE).catch(() => {});
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^(?:property|liberdade)-shell-/.test(key) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

async function readBoundedBody(request, limit) {
  const contentLength = request.headers.get('content-length');
  const announced = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(announced) && announced > limit) return null;
  if (!request.body?.getReader) {
    if (!Number.isFinite(announced)) return null;
    const body = await request.arrayBuffer();
    return body.byteLength <= limit ? new Uint8Array(body) : null;
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function handleSharePost(request) {
  const target = new URL(self.registration.scope);
  let result = 'share-error';
  try {
    const body = await readBoundedBody(request, PropertyShareInbox.MAX_REQUEST_BYTES);
    if (body) {
      const type = request.headers.get('content-type') || '';
      if (type.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
        const fields = new URLSearchParams(new TextDecoder().decode(body));
        const queued = await PropertyShareInbox.enqueue(PropertyShareInbox.fromFormData(fields));
        if (queued.accepted) result = 'share';
        else if (!queued.empty) result = 'share-full';
      }
    } else {
      const queued = await PropertyShareInbox.enqueue({ tooLarge: true });
      result = queued.accepted ? 'share' : 'share-full';
    }
  } catch {
    result = 'share-error';
  }
  target.searchParams.set('launch', result);
  return Response.redirect(target.href, 303);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && url.pathname === new URL(self.registration.scope).pathname && url.searchParams.get('launch') === 'share') {
    event.respondWith(handleSharePost(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
