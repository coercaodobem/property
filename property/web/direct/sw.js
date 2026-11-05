'use strict';
// Replaces the old app worker at its former scope: remove only its caches, then send open tabs to Property.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const scopePath = new URL(self.registration.scope).pathname;
    const mainApp = new URL('../', self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.filter(client => new URL(client.url).pathname.startsWith(scopePath)).map(client => client.navigate(mainApp).catch(() => null)));
    const cachesToRemove = (await caches.keys()).filter(name => name.startsWith('property-direct-shell-'));
    await Promise.all(cachesToRemove.map(name => caches.delete(name)));
    await self.registration.unregister();
  })());
});
