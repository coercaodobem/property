(function (global) {
  'use strict';

  function publicPosts(events, isPublicNote) {
    const unique = new Map();
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event !== 'object' || typeof isPublicNote !== 'function') continue;
      if (!/^[0-9a-f]{64}$/i.test(event.id || '') || !/^[0-9a-f]{64}$/i.test(event.pubkey || '')) continue;
      if (!Number.isSafeInteger(event.created_at) || event.created_at < 0 || typeof event.content !== 'string') continue;
      if (!isPublicNote(event)) continue;
      if (!unique.has(event.id)) unique.set(event.id, event);
    }
    return [...unique.values()].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, 50);
  }

  function state({ loading = false, online = false, error = false, count = 0 } = {}) {
    if (loading) return 'loading';
    if (error) return 'error';
    if (!online) return 'offline';
    return count > 0 ? 'ready' : 'empty';
  }

  function canWrite(identity) {
    return identity?.guestReadOnly !== true
      && Boolean(identity?.secret)
      && /^[0-9a-f]{64}$/i.test(identity?.pubkey || '');
  }

  global.PropertyExploreFeed = Object.freeze({ publicPosts, state, canWrite });
})(window);
