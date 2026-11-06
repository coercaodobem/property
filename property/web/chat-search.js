'use strict';
(() => {
  const foldedMessageCache = new WeakMap();

  function foldText(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function foldedMessageText(message) {
    const cached = foldedMessageCache.get(message);
    if (cached?.source === message.text) return cached.folded;
    const folded = foldText(message.text);
    foldedMessageCache.set(message, { source: message.text, folded });
    return folded;
  }

  function termsFor(query) {
    return foldText(query).trim().split(/\s+/u).filter(Boolean);
  }

  function matchesText(value, query) {
    const terms = termsFor(query);
    if (!terms.length) return false;
    const folded = foldText(value);
    return terms.every(term => folded.includes(term));
  }

  function foldedTextWithOffsets(text) {
    let folded = '';
    const offsets = [];
    for (let index = 0; index < text.length;) {
      const codePoint = text.codePointAt(index) ?? 0;
      const size = codePoint > 0xffff ? 2 : 1;
      const end = index + size;
      const piece = foldText(text.slice(index, end));
      folded += piece;
      for (let unit = 0; unit < piece.length; unit++) offsets.push({ start: index, end });
      index = end;
    }
    return { folded, offsets };
  }

  function findMessageIds(messages, query) {
    const terms = termsFor(query);
    if (!terms.length || !Array.isArray(messages)) return [];
    return messages
      .filter(message => message && message.kind !== 7 && typeof message.text === 'string' && terms.every(term => foldedMessageText(message).includes(term)))
      .map(message => String(message.id ?? ''))
      .filter(Boolean);
  }

  function findLatestMatchesByPeer(messages, query) {
    const terms = termsFor(query);
    if (!terms.length || !Array.isArray(messages)) return [];
    const latest = new Map();
    for (const message of messages) {
      if (!message || message.kind === 7 || message.deleted === true || typeof message.text !== 'string') continue;
      const peer = typeof message.peer === 'string' ? message.peer : '';
      const id = typeof message.id === 'string' ? message.id : '';
      if (!peer || !id) continue;
      const folded = foldedMessageText(message);
      if (!terms.every(term => folded.includes(term))) continue;
      const createdAt = Number.isFinite(message.createdAt) ? message.createdAt : 0;
      const previous = latest.get(peer);
      if (previous && (previous.createdAt > createdAt || (previous.createdAt === createdAt && previous.id >= id))) continue;
      latest.set(peer, { peer, id, text: message.text, createdAt });
    }
    return Array.from(latest.values());
  }

  function matchRanges(value, query) {
    const text = String(value ?? '');
    const terms = termsFor(query);
    if (!terms.length || !text) return [];
    const { folded, offsets } = foldedTextWithOffsets(text);
    const ranges = [];
    for (const term of terms) {
      const first = folded.indexOf(term);
      if (first < 0) return [];
      for (let at = first; at >= 0; at = folded.indexOf(term, at + term.length)) {
        const start = offsets[at]?.start;
        let end = offsets[at + term.length - 1]?.end;
        if (start === undefined || end === undefined) continue;
        while (end < text.length) {
          const codePoint = text.codePointAt(end) ?? 0;
          const size = codePoint > 0xffff ? 2 : 1;
          if (foldText(text.slice(end, end + size)) !== '') break;
          end += size;
        }
        ranges.push([start, end]);
      }
    }
    ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const merged = [];
    for (const [start, end] of ranges) {
      const previous = merged.at(-1);
      if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
      else merged.push([start, end]);
    }
    return merged;
  }

  window.PropertyMessageSearch = Object.freeze({ findLatestMatchesByPeer, findMessageIds, foldText, matchRanges, matchesText });
})();
