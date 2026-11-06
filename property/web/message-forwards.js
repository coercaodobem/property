'use strict';
(() => {
  const MAX_HOPS = 255;
  const MANY_HOPS = 5;

  function validHops(value) {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAX_HOPS ? value : null;
  }

  function fromTags(tags) {
    if (!Array.isArray(tags)) return null;
    const matches = tags.filter(tag => Array.isArray(tag) && tag[0] === 'forwarded');
    if (matches.length !== 1 || matches[0].length !== 2 || !/^[1-9]\d{0,2}$/.test(matches[0][1] || '')) return null;
    return validHops(Number(matches[0][1]));
  }

  function toTag(hops) {
    const count = validHops(hops);
    if (count === null) throw new RangeError('Forwarding hop count must be an integer from 1 to 255.');
    return ['forwarded', String(count)];
  }

  function next(hops) {
    const current = validHops(hops) || 0;
    return Math.min(MAX_HOPS, current + 1);
  }

  function label(hops, language = 'en') {
    const count = validHops(hops);
    if (count === null) return '';
    if (language === 'pt-BR') return count >= MANY_HOPS ? 'Encaminhada várias vezes' : 'Encaminhada';
    return count >= MANY_HOPS ? 'Forwarded many times' : 'Forwarded';
  }

  globalThis.PropertyMessageForwards = Object.freeze({ MAX_HOPS, MANY_HOPS, fromTags, toTag, next, label });
})();
