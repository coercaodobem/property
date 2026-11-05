'use strict';
(() => {
  const mainApp = new URL('../', location.href).href;
  const legacyPath = new URL('./', location.href).pathname;
  async function retire() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter(registration => new URL(registration.scope).pathname.startsWith(legacyPath)).map(registration => registration.unregister()));
      }
    } catch { /* A blocked storage API must not prevent the move to the main app. */ }
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('property-direct-shell-')).map(name => caches.delete(name)));
      }
    } catch { /* Keep the main Property cache untouched if site data is restricted. */ }
    location.replace(mainApp);
  }
  void retire();
})();
