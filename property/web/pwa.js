'use strict';
(() => {
  const LAUNCH_ACTIONS = new Set(['new-chat', 'hangout', 'marketplace', 'node', 'saved', 'share', 'share-full', 'share-error']);
  let deferredInstallPrompt = null;
  let installedInThisPage = false;
  let pendingContactIntent = '';

  function captureContactIntent(url) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (!hash.has('contact')) return '';
    const value = hash.get('contact') || '';
    hash.delete('contact');
    url.hash = hash.toString() ? hash.toString() : '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return value;
  }
  pendingContactIntent = captureContactIntent(new URL(window.location.href));
  window.addEventListener('hashchange', () => {
    const value = captureContactIntent(new URL(window.location.href));
    if (!value) return;
    pendingContactIntent = value;
    window.dispatchEvent(new CustomEvent('property-contact-intent', { detail: { value } }));
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  function consumeLaunchAction() {
    const url = new URL(window.location.href);
    const action = url.searchParams.get('launch');
    if (!LAUNCH_ACTIONS.has(action)) return '';
    url.searchParams.delete('launch');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return action;
  }

  function consumeContactIntent() {
    const value = pendingContactIntent;
    pendingContactIntent = '';
    return value;
  }

  function isInstalled() {
    return installedInThisPage || window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
  }

  function bindInstallControls(buttons, helpDialog, onInstalled = () => {}) {
    const controls = [...buttons];
    const updateVisibility = () => controls.forEach(button => { button.hidden = isInstalled(); });
    updateVisibility();

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installedInThisPage = true;
      updateVisibility();
      onInstalled();
    });

    for (const button of controls) {
      button.addEventListener('click', async () => {
        if (isInstalled()) return;
        if (!deferredInstallPrompt) {
          helpDialog.showModal();
          return;
        }
        const prompt = deferredInstallPrompt;
        deferredInstallPrompt = null;
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === 'dismissed') helpDialog.showModal();
        } catch {
          helpDialog.showModal();
        }
      });
    }
  }

  window.PropertyPwa = Object.freeze({ consumeLaunchAction, consumeContactIntent, bindInstallControls });
})();
