'use strict';
(() => {
  const MAX_BADGE_COUNT = 9999;

  function preferenceId(identity) {
    if (typeof identity !== 'string' || !/^[0-9a-f]{64}$/i.test(identity)) throw new TypeError('Invalid Property identity.');
    return `property-app-badge:${identity.toLowerCase()}`;
  }

  function normalizeCount(value) {
    if (!Number.isSafeInteger(value) || value < 0) return 0;
    return Math.min(MAX_BADGE_COUNT, value);
  }

  function unreadCount(conversations) {
    if (!Array.isArray(conversations)) return 0;
    return conversations.reduce((total, conversation) => Math.min(MAX_BADGE_COUNT,
      total + normalizeCount(conversation?.unreadCount)), 0);
  }

  function canBadge(api = globalThis.navigator) {
    return typeof api?.setAppBadge === 'function';
  }

  async function apply(count, api = globalThis.navigator) {
    if (!canBadge(api)) return false;
    const value = normalizeCount(count);
    try {
      if (value > 0) await api.setAppBadge(value);
      else if (typeof api.clearAppBadge === 'function') await api.clearAppBadge();
      else await api.setAppBadge(0);
      return true;
    } catch {
      return false;
    }
  }

  window.PropertyAppBadge = Object.freeze({ MAX_BADGE_COUNT, apply, canBadge, normalizeCount, preferenceId, unreadCount });
})();
