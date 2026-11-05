'use strict';
(() => {
  const LAUNCH_ACTIONS = new Set(['new-chat', 'hangout', 'marketplace', 'node', 'saved']);
  let deferredInstallPrompt = null;
  let installedInThisPage = false;

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

  window.PropertyPwa = Object.freeze({ consumeLaunchAction, bindInstallControls });
})();
