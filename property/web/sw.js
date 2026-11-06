'use strict';
importScripts('./share-inbox.js?v=property-v34');
const CACHE = 'property-shell-v100';
const SHELL = ['./', './index.html', './about.html', './about.pt-BR.html', './GHOSTLY-MIT-LICENSE.txt', './vendor/QR-CODE-GENERATOR-LICENSE.txt', './vendor/licenses/emoji-mart-data-MIT.txt', './vendor/emoji-data-15.json', './vendor/licenses/secret-guard/README.md', './vendor/licenses/secret-guard/NOBLE-HASHES-MIT.txt', './vendor/licenses/secret-guard/SCURE-BASE-MIT.txt', './vendor/licenses/secret-guard/SCURE-BIP39-MIT.txt', './vendor/licenses/secret-guard/MONERO-ENGLISH-BSD-3-CLAUSE.txt', './vendor/licenses/secret-guard/MONERO-PORTUGUESE-MIT-NOTICE.txt', './i18n.js?v=property-v74', './pwa.js?v=property-v36', './styles.css?v=property-v69', './audio-playback.css?v=property-v1', './call-window.css?v=property-v1', './payment-card.css?v=property-v3', './link-preview.css?v=property-v1', './message-scroll.css?v=property-v1', './group-mentions.css?v=property-v2', './group-invites.css?v=property-v1', './message-pins.css?v=property-v1', './location-cards.css?v=property-v1', './message-forwards.css?v=property-v1', './typing-signals.css?v=property-v1', './project-story.css?v=property-v1', './relay-defaults.js?v=property-v32', './share-inbox.js?v=property-v34', './conversation-folders.js?v=property-v36', './chat-drafts.js?v=property-v38', './vendor/qr-code-generator.js?v=property-v39', './rich-text.js?v=property-v38', './nostr-entities.js?v=property-v1', './location-cards.js?v=property-v1', './message-forwards.js?v=property-v1', './typing-signals.js?v=property-v5', './message-edits.js?v=property-v1', './community-groups.js?v=property-v2', './message-pins.js?v=property-v1', './secret-guard.js?v=property-v1', './public-profile.js?v=property-v2', './nip05.js?v=property-v1', './nip39.js?v=property-v1', './emoji-picker.js?v=property-v2', './chat-gestures.js?v=property-v1', './notification-preferences.js?v=property-v1', './app-badge.js?v=property-v1', './message-days.js?v=property-v1', './link-preview.js?v=property-v1', './message-scroll.js?v=property-v1', './group-mentions.js?v=property-v2', './group-invites.js?v=property-v1', './voice-messages.js?v=property-v1', './audio-playback.js?v=property-v1', './call-window.js?v=property-v1', './file-transfers.js?v=property-v1', './call-controller.js?v=property-v2', './direct-file-envelope.js?v=property-v1', './direct-transfer-controller.js?v=property-v1', './image-viewer.js?v=property-v1', './app.js?v=property-v94', './vault.js?v=property-v26', './routing.js?v=property-v27', './forwarding.js?v=property-v26', './nano.js?v=property-v26', './money.js?v=property-v26', './payment-card.js?v=property-v1', './marketplace.js?v=property-v26', './campaigns.js?v=property-v26', './contact.js?v=property-v26', './agent-messaging.js?v=property-v26', './chat-search.js?v=property-v29', './manifest.webmanifest?v=property-v34', './assets/icon.svg?v=property-v26', './assets/property-icon-180.png?v=property-v26', './assets/property-icon-192.png?v=property-v26', './assets/property-icon-512.png?v=property-v26', './vendor/nostr-tools-2.25.2.bundle.js?v=property-v26'];
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
      } else if (type.toLowerCase().startsWith('multipart/form-data')) {
        const formData = await new Response(body, { headers: { 'content-type': type } }).formData();
        const queued = await PropertyShareInbox.enqueue(PropertyShareInbox.fromFormData(formData));
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
