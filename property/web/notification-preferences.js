'use strict';
(() => {
  const choices = Object.freeze({ '15m': 15 * 60_000, '1h': 60 * 60_000, '1d': 24 * 60 * 60_000, forever: null });

  function identityKey(identity) {
    if (typeof identity !== 'string' || !/^[0-9a-f]{64}$/i.test(identity)) throw new TypeError('Invalid Property identity.');
    return identity.toLowerCase();
  }

  function conversationKey(peer) {
    if (typeof peer !== 'string' || !peer || peer.length > 512) throw new TypeError('Invalid conversation key.');
    return peer;
  }

  function notificationsId(identity) {
    return `property-notifications:${identityKey(identity)}`;
  }

  function chatMuteId(identity, peer) {
    return `property-notification-mute:${identityKey(identity)}:${conversationKey(peer)}`;
  }

  function createMuteRecord(identity, peer, choice, now = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(choices, choice)) throw new RangeError('Invalid notification mute choice.');
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid logical time.');
    const duration = choices[choice];
    const until = duration === null ? 'forever' : now + duration;
    return { id: chatMuteId(identity, peer), until };
  }

  function isMuted(record, now = Date.now()) {
    if (!record || !Number.isSafeInteger(now) || now < 0) return false;
    if (record.until === 'forever') return true;
    return Number.isSafeInteger(record.until) && record.until > now;
  }

  function shouldNotify({ enabled, permission, pageHidden, muted }) {
    return enabled === true && permission === 'granted' && pageHidden === true && muted !== true;
  }

  window.PropertyNotificationPreferences = Object.freeze({ choices, chatMuteId, createMuteRecord, isMuted, notificationsId, shouldNotify });
})();
