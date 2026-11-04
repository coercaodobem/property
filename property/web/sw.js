'use strict';
const CACHE = 'property-shell-v23';
const SHELL = ['./', './index.html', './about.html', './about.pt-BR.html', './i18n.js?v=property-v23', './styles.css?v=property-v23', './app.js?v=property-v23', './vault.js?v=property-v23', './routing.js?v=property-v23', './forwarding.js?v=property-v23', './nano.js?v=property-v23', './money.js?v=property-v23', './marketplace.js?v=property-v23', './campaigns.js?v=property-v23', './contact.js?v=property-v23', './agent-messaging.js?v=property-v23', './manifest.webmanifest?v=property-v23', './assets/icon.svg?v=property-v23', './assets/property-icon-180.png?v=property-v23', './assets/property-icon-192.png?v=property-v23', './assets/property-icon-512.png?v=property-v23', './vendor/nostr-tools-2.25.2.bundle.js?v=property-v23'];
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
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
