'use strict';
(() => {
  const CANDIDATES = Object.freeze([
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://nostr.mom',
    'wss://relay.snort.social'
  ]);

  function pick(count = 2, randomIntBelow = max => {
    if (globalThis.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      globalThis.crypto.getRandomValues(value);
      return Math.floor((value[0] / 0x1_0000_0000) * max);
    }
    return Math.floor(Math.random() * max);
  }) {
    if (!Number.isSafeInteger(count) || count < 1 || count > CANDIDATES.length) {
      throw new RangeError('Invalid number of default relays.');
    }
    const pool = [...CANDIDATES];
    const selected = [];
    while (selected.length < count) {
      const index = randomIntBelow(pool.length);
      if (!Number.isSafeInteger(index) || index < 0 || index >= pool.length) {
        throw new RangeError('Random relay selection returned an invalid index.');
      }
      selected.push(pool.splice(index, 1)[0]);
    }
    return selected;
  }

  function initialSelection(savedSettings, randomIntBelow) {
    if (Array.isArray(savedSettings?.values) && savedSettings.values.length) {
      return {
        values: [...savedSettings.values],
        autoSelected: savedSettings.autoSelected === true,
        shouldPersist: false
      };
    }
    return {
      values: pick(2, randomIntBelow),
      autoSelected: true,
      shouldPersist: true
    };
  }

  window.PropertyRelayDefaults = Object.freeze({ candidates: CANDIDATES, pick, initialSelection });
})();
