'use strict';
(() => {
  const PUBLIC_KEY = /^[0-9a-f]{64}$/i;
  const MAX_MENTIONS = 10;
  const MAX_MENTION_LABEL = 40;
  const MAX_WIRE_CHARS = 5000;
  const PROFILE_URI = /nostr:(npub1[023456789acdefghjklmnpqrstuvwxyz]{20,100}|nprofile1[023456789acdefghjklmnpqrstuvwxyz]{20,180})(?![A-Za-z0-9])/giu;

  // Composer behavior is adapted from Ghostly's MIT-licensed
  // apps/ui/src/lib/parse/mentions.ts. Property writes standard NIP-27 profile references.
  function mentionLabel(name) {
    const clean = String(name || '').replace(/@/gu, '').replace(/\s+/gu, ' ').trim();
    return Array.from(clean).slice(0, MAX_MENTION_LABEL - 1).join('').trim() || 'member';
  }

  function queryAt(text, caret) {
    if (typeof text !== 'string' || !Number.isInteger(caret) || caret < 0 || caret > text.length) return null;
    const match = /(?:^|[\s([{"'])@([^\s@]{0,32})$/u.exec(text.slice(0, caret));
    return match ? { start: caret - match[1].length - 1, end: caret, query: match[1].slice(0, 32) } : null;
  }

  const fold = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function filterCandidates(candidates, query) {
    const source = Array.isArray(candidates) ? candidates : [];
    const q = fold(query);
    if (!q) return source.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
    const rank = candidate => {
      const name = fold(candidate.name);
      if (name.startsWith(q)) return 0;
      if (name.split(/[\s._-]+/u).some(word => word.startsWith(q))) return 1;
      return q.length >= 3 && (candidate.pubkey.toLowerCase().startsWith(q) || fold(candidate.hint).includes(q)) ? 2 : 3;
    };
    return source.map(candidate => ({ candidate, rank: rank(candidate) }))
      .filter(item => item.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.candidate.name.localeCompare(b.candidate.name))
      .slice(0, 8).map(item => item.candidate);
  }

  function insertMention(text, query, candidate) {
    if (!query || !candidate || !PUBLIC_KEY.test(candidate.pubkey || '')) return null;
    const label = mentionLabel(candidate.name);
    const suffix = text.slice(query.end).replace(/^[ \t]*/u, '');
    const token = `@${label}${/^[,.;:!?)]/u.test(suffix) ? '' : ' '}`;
    const nextText = text.slice(0, query.start) + token + suffix;
    return { text: nextText, caret: query.start + token.length, mention: { pubkey: candidate.pubkey.toLowerCase(), label, start: query.start } };
  }

  function validMentions(text, values) {
    if (typeof text !== 'string' || !Array.isArray(values)) return [];
    const result = [];
    for (const value of values) {
      if (!value || !PUBLIC_KEY.test(value.pubkey || '') || typeof value.label !== 'string' || !Number.isInteger(value.start)) continue;
      const label = mentionLabel(value.label);
      const start = value.start;
      if (start < 0 || text.slice(start, start + label.length + 1) !== `@${label}`) continue;
      result.push({ pubkey: value.pubkey.toLowerCase(), label, start });
    }
    result.sort((a, b) => a.start - b.start);
    const deduped = [];
    let previousEnd = -1;
    for (const mention of result) {
      const end = mention.start + mention.label.length + 1;
      if (mention.start < previousEnd || deduped.length >= MAX_MENTIONS) continue;
      deduped.push(mention); previousEnd = end;
    }
    return deduped;
  }

  function reconcileMentions(mentions, before, after, caret = null) {
    const valid = validMentions(before, mentions);
    if (before === after || !valid.some(mention => Number.isInteger(mention.start))) return valid;
    const delta = after.length - before.length;
    const fits = (from, to) => from >= 0 && to >= from && to <= before.length && to + delta >= from && to + delta <= after.length
      && before.slice(0, from) === after.slice(0, from) && before.slice(to) === after.slice(to + delta);
    let from, to;
    const typedCaret = Number.isInteger(caret) ? caret : -1;
    if (delta >= 0 && fits(typedCaret - delta, typedCaret - delta)) [from, to] = [typedCaret - delta, typedCaret - delta];
    else if (delta < 0 && fits(typedCaret, typedCaret - delta)) [from, to] = [typedCaret, typedCaret - delta];
    else {
      from = 0;
      while (from < before.length && from < after.length && before[from] === after[from]) from++;
      let tail = 0;
      while (tail < before.length - from && tail < after.length - from && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
      to = before.length - tail;
    }
    return valid.flatMap(mention => {
      const end = mention.start + mention.label.length + 1;
      if (end <= from) return [mention];
      if (mention.start >= to) return [{ ...mention, start: mention.start + delta }];
      return [];
    });
  }

  function toWireText(text, mentions, encodeNpub) {
    const valid = validMentions(text, mentions);
    if (valid.length !== (Array.isArray(mentions) ? mentions.length : 0)) throw new TypeError('A group mention was changed in the draft. Select the member again before sending.');
    let wire = text;
    for (const mention of [...valid].reverse()) {
      const npub = encodeNpub(mention.pubkey);
      if (typeof npub !== 'string' || !/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/u.test(npub)) throw new TypeError('Could not encode this group member as a Nostr profile reference.');
      wire = `${wire.slice(0, mention.start)}nostr:${npub}${wire.slice(mention.start + mention.label.length + 1)}`;
    }
    if (wire.length > MAX_WIRE_CHARS) throw new RangeError(`Group message exceeds ${MAX_WIRE_CHARS} characters after adding NIP-27 mentions.`);
    return wire;
  }

  function decodedPublicKey(code, decodeNip19) {
    try {
      const decoded = decodeNip19(code);
      const key = decoded?.type === 'npub' ? decoded.data : decoded?.type === 'nprofile' ? decoded.data?.pubkey : '';
      return typeof key === 'string' && PUBLIC_KEY.test(key) ? key.toLowerCase() : '';
    } catch { return ''; }
  }

  function fromWireContent(content, participants, decodeNip19, nameForPublicKey) {
    if (typeof content !== 'string' || content.length > MAX_WIRE_CHARS) return { text: typeof content === 'string' ? content : '', mentions: [] };
    const allowed = new Set((Array.isArray(participants) ? participants : []).filter(key => typeof key === 'string' && PUBLIC_KEY.test(key)).map(key => key.toLowerCase()));
    const mentions = [];
    let text = '';
    let cursor = 0;
    PROFILE_URI.lastIndex = 0;
    for (const match of content.matchAll(PROFILE_URI)) {
      const code = match[1];
      const key = decodedPublicKey(code, decodeNip19);
      if (!key || !allowed.has(key)) continue;
      text += content.slice(cursor, match.index);
      const label = mentionLabel(nameForPublicKey(key) || `npub…${key.slice(-8)}`);
      const start = text.length;
      text += `@${label}`;
      mentions.push({ pubkey: key, label, start });
      cursor = match.index + match[0].length;
    }
    text += content.slice(cursor);
    return { text, mentions: validMentions(text, mentions) };
  }

  function createPicker({ input, panel, enabled, getCandidates, localize, onMentionsChange = () => {} }) {
    let mentions = [];
    let before = input.value;
    let query = null;
    let candidates = [];
    let active = 0;
    let dismissedStart = -1;
    let sequence = 0;
    let open = false;

    function hide() {
      open = false; query = null; candidates = [];
      panel.replaceChildren(); panel.hidden = true;
      input.removeAttribute('aria-autocomplete'); input.removeAttribute('aria-controls'); input.removeAttribute('aria-activedescendant'); input.removeAttribute('aria-expanded');
    }

    function render() {
      panel.replaceChildren();
      panel.hidden = !open;
      if (!open) return;
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('aria-label', localize('Group members', 'Pessoas do grupo'));
      candidates.forEach((candidate, index) => {
        const option = document.createElement('div');
        option.id = `group-mention-option-${index}`;
        option.className = `group-mention-option${index === active ? ' is-active' : ''}`;
        option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(index === active));
        option.dataset.pubkey = candidate.pubkey;
        const name = document.createElement('span'); name.className = 'group-mention-name'; name.textContent = `@${mentionLabel(candidate.name)}`;
        const hint = document.createElement('small'); hint.className = 'group-mention-hint'; hint.textContent = candidate.hint || `npub…${candidate.pubkey.slice(-8)}`;
        option.append(name, hint);
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => choose(candidate));
        option.addEventListener('pointermove', () => { active = index; render(); });
        panel.append(option);
      });
      input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', panel.id);
      input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-activedescendant', `group-mention-option-${active}`);
    }

    async function refresh() {
      const currentSequence = ++sequence;
      if (!enabled() || input.selectionStart !== input.selectionEnd) { hide(); return; }
      const textSnapshot = input.value;
      const caretSnapshot = input.selectionStart;
      const next = queryAt(textSnapshot, caretSnapshot);
      if (!next || next.start === dismissedStart || mentions.some(item => next.start >= item.start && next.start <= item.start + item.label.length)) { hide(); return; }
      query = next;
      try { candidates = filterCandidates(await getCandidates(), next.query); }
      catch { candidates = []; }
      if (currentSequence !== sequence || !enabled() || !query || query.start !== next.start || input.value !== textSnapshot || input.selectionStart !== caretSnapshot || input.selectionEnd !== caretSnapshot) return;
      active = Math.min(active, Math.max(0, candidates.length - 1));
      open = candidates.length > 0;
      render();
    }

    function choose(candidate) {
      if (!open || !query) return false;
      const next = insertMention(input.value, query, candidate);
      if (!next) return false;
      const moved = reconcileMentions(mentions, before, next.text, next.caret);
      mentions = validMentions(next.text, [...moved, next.mention]);
      input.value = next.text; before = next.text;
      input.setSelectionRange(next.caret, next.caret);
      onMentionsChange(mentions);
      hide(); input.focus({ preventScroll: true });
      return true;
    }

    function handleInput() {
      const next = input.value;
      mentions = reconcileMentions(mentions, before, next, input.selectionStart);
      before = next;
      onMentionsChange(mentions);
      void refresh();
    }

    function handleKeyDown(event) {
      if (!open || event.isComposing) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length; render(); return true;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault(); choose(candidates[active]); return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); dismissedStart = query?.start ?? -1; hide(); return true;
      }
      return false;
    }

    function setDraft(text, values = []) {
      const value = typeof text === 'string' ? text : '';
      input.value = value; before = value; mentions = validMentions(value, values); dismissedStart = -1;
      onMentionsChange(mentions); hide();
    }

    function setEnabled() { if (!enabled()) hide(); else void refresh(); }
    input.addEventListener('click', () => void refresh());
    input.addEventListener('keyup', event => { if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) void refresh(); });
    return Object.freeze({ handleInput, handleKeyDown, refresh, setDraft, setEnabled, getMentions: () => validMentions(input.value, mentions) });
  }

  window.PropertyGroupMentions = Object.freeze({ MAX_MENTIONS, MAX_WIRE_CHARS, mentionLabel, queryAt, filterCandidates, insertMention, validMentions, reconcileMentions, toWireText, fromWireContent, createPicker });
})();
