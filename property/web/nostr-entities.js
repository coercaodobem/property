'use strict';
/*
 * Safe, local recognition of public Nostr profile references in message text.
 * A valid profile code becomes a button that only opens Property's existing
 * contact dialog; it never queries relays or creates a conversation by itself.
 * This adapts Ghostly's Nostr entity-card interaction to Property's NIP-19 flow.
 */
(() => {
  const MAX_SCAN_CHARS = 20_000;
  const MAX_CARDS_PER_MESSAGE = 3;
  const PROFILE_RE = /(^|[^A-Za-z0-9:])((?:nostr:)?((?:npub|nprofile)1[02-9ac-hj-np-z]+))(?![A-Za-z0-9])/giu;

  function splitText(value, budget = null) {
    const text = typeof value === 'string' ? value : '';
    if (!text || text.length > MAX_SCAN_CHARS) return [text];
    const state = budget && typeof budget === 'object'
      ? budget
      : { remaining: MAX_CARDS_PER_MESSAGE, seen: new Set() };
    if (!Number.isInteger(state.remaining) || state.remaining <= 0 || !(state.seen instanceof Set)) return [text];

    PROFILE_RE.lastIndex = 0;
    const segments = [];
    let cursor = 0;
    for (const match of text.matchAll(PROFILE_RE)) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      const code = match[3].toLowerCase();
      let parsed;
      try { parsed = globalThis.PropertyContact?.parsePublicKey(code); }
      catch { continue; }
      if (!parsed || !/^[0-9a-f]{64}$/u.test(parsed.pubkey) || state.seen.has(parsed.pubkey)) continue;

      if (start < cursor) continue;
      if (start > cursor) segments.push(text.slice(cursor, start));
      segments.push({ type: 'nostr-profile', text: match[2], code, pubkey: parsed.pubkey });
      state.seen.add(parsed.pubkey);
      state.remaining -= 1;
      cursor = end;
      if (state.remaining <= 0) break;
    }
    if (!segments.length) return [text];
    if (cursor < text.length) segments.push(text.slice(cursor));
    return segments;
  }

  globalThis.PropertyNostrEntities = Object.freeze({ splitText, MAX_SCAN_CHARS, MAX_CARDS_PER_MESSAGE });
})();
