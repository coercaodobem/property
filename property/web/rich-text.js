'use strict';
/*
 * Property's message renderer adapts the text-only formatting model used by
 * Ghostly. The parser builds data; the renderer creates DOM nodes and never
 * interprets message text as HTML. Ghostly is MIT licensed; see
 * ../../archive/ghostly-source/LICENSE.
 */
(() => {
  const MAX_FORMATTED_CHARS = 65536;
  const MAX_BLOCKS = 512;
  const MAX_LIST_ITEMS = 512;
  const MAX_SPAN_DEPTH = 8;
  const SPOILER_PREVIEW = '▒▒▒';
  const MARKERS = Object.freeze({ '*': 'bold', '**': 'bold', '_': 'italic', '__': 'italic', '~~': 'strike', '||': 'spoiler' });
  const MARKER_CHARS = new Set(['*', '_', '~', '|']);
  const SPACE = /\s/u;
  const PUNCT = /[\p{P}\p{S}]/u;
  const WORD = /[\p{L}\p{N}]/u;
  const HIDDEN_URL_CHARS = /[\u0000-\u0020\u007f\u00ad\u034f\u061c\u115f-\u1160\u17b4-\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
  const LIST_LINE = /^( {0,6}|\t)([-*\u2022]|(\d{1,9})([.)])) +(?=\S)/u;
  const HEADING = /^(#{1,3}) +(?=\S)/u;
  const LANGUAGE = /^[A-Za-z][\w+#.-]{0,19}$/u;

  function validLink(value) {
    if (!value || value.length > 2048 || HIDDEN_URL_CHARS.test(value)) return '';
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  }

  function trimLinkEnd(value) {
    let end = value.length;
    while (end && /[.,!?;:…]/u.test(value[end - 1])) end--;
    for (const [close, open] of [[')', '('], [']', '['], ['}', '{']]) {
      let opened = 0;
      let closed = 0;
      for (let i = 0; i < end; i++) {
        if (value[i] === open) opened++;
        else if (value[i] === close) closed++;
      }
      while (end && value[end - 1] === close && closed > opened) { end--; closed--; }
    }
    return end;
  }

  function splitCodeSpans(text) {
    const runs = [];
    for (let i = 0; i < text.length;) {
      if (text[i] !== '`') { i++; continue; }
      let end = i + 1;
      while (text[end] === '`') end++;
      runs.push({ start: i, end, size: end - i });
      i = end;
    }
    if (!runs.length) return [text];
    const nextSame = new Array(runs.length).fill(-1);
    const seen = new Map();
    for (let i = runs.length - 1; i >= 0; i--) {
      nextSame[i] = seen.get(runs[i].size) ?? -1;
      seen.set(runs[i].size, i);
    }
    const result = [];
    let cursor = 0;
    for (let i = 0; i < runs.length; i++) {
      const closeIndex = nextSame[i];
      if (runs[i].start < cursor || closeIndex < 0) continue;
      const close = runs[closeIndex];
      const value = text.slice(runs[i].end, close.start);
      if (text.slice(runs[i].end, close.start).includes('\n') || !value.trim()) continue;
      if (runs[i].start > cursor) result.push(text.slice(cursor, runs[i].start));
      result.push({ type: 'code', text: value.length > 2 && value.startsWith(' ') && value.endsWith(' ') ? value.slice(1, -1) : value });
      cursor = close.end;
      i = closeIndex;
    }
    if (cursor < text.length) result.push(text.slice(cursor));
    return result;
  }

  function splitLinks(text) {
    const pieces = [];
    let cursor = 0;
    for (let i = 0; i < text.length;) {
      if (!/^https?:\/\//iu.test(text.slice(i, i + 8))) { i++; continue; }
      const before = i ? text[i - 1] : '';
      if (before && /[\p{L}\p{N}_+.-]/u.test(before)) { i++; continue; }
      let end = i;
      while (end < text.length && !/[\s<>"'`]/u.test(text[end])) end++;
      const raw = text.slice(i, end);
      let linkEnd = trimLinkEnd(raw);
      const pairedMarkup = ['**', '__', '~~', '||', '*', '_'].find(marker => text.slice(i - marker.length, i) === marker && raw.slice(0, linkEnd).endsWith(marker));
      if (pairedMarkup) linkEnd -= pairedMarkup.length;
      const visible = raw.slice(0, linkEnd);
      const href = validLink(visible);
      if (!href || !visible) { i++; continue; }
      if (i > cursor) pieces.push(text.slice(cursor, i));
      pieces.push({ type: 'link', text: visible, href });
      cursor = i + linkEnd;
      i = cursor;
    }
    if (cursor < text.length) pieces.push(text.slice(cursor));
    return pieces.length ? pieces : [text];
  }

  function splitMarkers(text, previous, next, items) {
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      if (!MARKER_CHARS.has(text[i])) continue;
      let end = i + 1;
      while (text[end] === text[i]) end++;
      const run = text.slice(i, end);
      if (!Object.hasOwn(MARKERS, run)) { i = end - 1; continue; }
      if (i > from) items.push({ type: 'text', text: text.slice(from, i) });
      const before = i ? text[i - 1] : previous;
      const after = end < text.length ? text[end] : next;
      const afterNext = end + 1 < text.length ? text[end + 1] : undefined;
      items.push({
        type: 'marker', run,
        opens: after !== undefined && !SPACE.test(after) && (before === undefined || SPACE.test(before) || (PUNCT.test(before) && before !== run[0])),
        closes: before !== undefined && !SPACE.test(before) && (after === undefined || SPACE.test(after) || (PUNCT.test(after) && after !== run[0]))
          && !(after !== undefined && /[.,:;]/u.test(after) && afterNext !== undefined && WORD.test(afterNext))
      });
      from = end;
      i = end - 1;
    }
    if (from < text.length) items.push({ type: 'text', text: text.slice(from) });
  }

  function tokenizeInline(text) {
    const pieces = [];
    for (const codePiece of splitCodeSpans(text)) {
      if (typeof codePiece !== 'string') { pieces.push(codePiece); continue; }
      pieces.push(...splitLinks(codePiece));
    }
    const items = [];
    const edge = (piece, first) => piece === undefined ? undefined : typeof piece === 'string' ? piece[first ? 0 : piece.length - 1] : 'a';
    pieces.forEach((piece, index) => {
      if (typeof piece === 'string') splitMarkers(piece, edge(pieces[index - 1], false), edge(pieces[index + 1], true), items);
      else items.push({ type: 'segment', segment: piece });
    });

    const stack = [];
    const depthAt = new Int32Array(items.length);
    const byRun = new Map();
    const popTo = depth => {
      while (stack.length > depth) {
        const opened = stack.pop();
        byRun.get(items[opened].run).pop();
      }
    };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type !== 'marker') continue;
      const openers = byRun.get(item.run);
      if (item.closes && openers?.length) {
        const opener = openers[openers.length - 1];
        popTo(depthAt[opener]);
        items[opener].pair = 'open';
        item.pair = 'close';
      } else if (item.opens && stack.length < MAX_SPAN_DEPTH) {
        depthAt[i] = stack.length;
        stack.push(i);
        if (openers) openers.push(i); else byRun.set(item.run, [i]);
      }
    }

    const result = [];
    const parents = [result];
    const push = segment => {
      const target = parents[parents.length - 1];
      const last = target[target.length - 1];
      if (segment.type === 'text' && last?.type === 'text') last.text += segment.text;
      else target.push(segment);
    };
    for (const item of items) {
      if (item.type === 'text') push(item);
      else if (item.type === 'segment') push(item.segment);
      else if (item.pair === 'open') {
        const span = { type: 'span', style: MARKERS[item.run], children: [] };
        push(span); parents.push(span.children);
      } else if (item.pair === 'close') parents.pop();
      else push({ type: 'text', text: item.run });
    }
    return result;
  }

  function listLine(line) {
    const match = LIST_LINE.exec(line);
    if (!match) return null;
    const ordered = match[3] !== undefined;
    return {
      indent: match[1] === '\t' ? 2 : match[1].length,
      ordered,
      marker: ordered ? `${match[3]}${match[4]}` : '•',
      text: line.slice(match[0].length)
    };
  }

  function parseMessage(source) {
    const text = typeof source === 'string' ? source : '';
    if (text.length > MAX_FORMATTED_CHARS) return [{ type: 'plain', text }];
    const lines = text.replace(/\r\n?/gu, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let i = 0;
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    };
    const canAddBlock = () => blocks.length < MAX_BLOCKS;

    for (; i < lines.length && canAddBlock();) {
      const line = lines[i];
      if (!line.trim()) { flushParagraph(); i++; continue; }

      if (/^ {0,3}```/u.test(line)) {
        const opening = /^ {0,3}```([^`]*)$/u.exec(line);
        let close = -1;
        for (let candidate = i + 1; candidate < lines.length; candidate++) {
          if (/^ {0,3}```\s*$/u.test(lines[candidate])) { close = candidate; break; }
        }
        if (opening && close >= 0) {
          flushParagraph();
          const label = opening[1].trim();
          const language = LANGUAGE.test(label) ? label.toLowerCase() : '';
          const body = language || !label ? lines.slice(i + 1, close) : [label, ...lines.slice(i + 1, close)];
          if (body.some(part => part.length)) blocks.push({ type: 'codeblock', language, text: body.join('\n') });
          i = close + 1;
          continue;
        }
        // An unmatched fence stays literal text with the lines that follow it.
        paragraph.push(...lines.slice(i));
        i = lines.length;
        break;
      }

      const heading = HEADING.exec(line);
      if (heading) {
        flushParagraph();
        blocks.push({ type: 'heading', level: heading[1].length, lines: [line.slice(heading[0].length)] });
        i++;
        continue;
      }

      if (/^ {0,3}>(?: |$)/u.test(line)) {
        flushParagraph();
        const quoteLines = [];
        while (i < lines.length && /^ {0,3}>(?: |$)/u.test(lines[i])) quoteLines.push(lines[i++].replace(/^ {0,3}> ?/u, ''));
        if (quoteLines.some(part => part.trim())) blocks.push({ type: 'quote', lines: quoteLines });
        else paragraph.push(...quoteLines.map(part => `> ${part}`));
        continue;
      }

      const firstItem = listLine(line);
      if (firstItem) {
        flushParagraph();
        const list = { type: 'list', ordered: firstItem.ordered, items: [] };
        let currentTop = null;
        let currentNested = null;
        const baseIndent = firstItem.indent;
        while (i < lines.length && list.items.length < MAX_LIST_ITEMS) {
          const item = listLine(lines[i]);
          if (!item) {
            if (currentNested && /^(?: {2,}|\t)\S/u.test(lines[i])) { currentNested.lines.push(lines[i].trimStart()); i++; continue; }
            if (currentTop && /^(?: {2,}|\t)\S/u.test(lines[i])) { currentTop.lines.push(lines[i].trimStart()); i++; continue; }
            if (!lines[i].trim() && listLine(lines[i + 1] || '')?.ordered === list.ordered) { i++; continue; }
            break;
          }
          if (item.indent < baseIndent || (item.indent === baseIndent && item.ordered !== list.ordered)) break;
          const row = { marker: item.marker, lines: [item.text], children: [] };
          if (item.indent === baseIndent) {
            list.items.push(row); currentTop = row; currentNested = null;
          } else {
            if (!currentTop) break;
            let nested = currentTop.children[currentTop.children.length - 1];
            if (!nested || nested.ordered !== item.ordered) currentTop.children.push(nested = { ordered: item.ordered, items: [] });
            nested.items.push(row); currentNested = row;
          }
          i++;
        }
        if (list.items.length) blocks.push(list); else paragraph.push(line), i++;
        continue;
      }

      paragraph.push(line);
      i++;
    }
    flushParagraph();
    if (i < lines.length) blocks.push({ type: 'plain', text: lines.slice(i).join('\n') });
    return blocks;
  }

  function plainInline(segments) {
    let output = '';
    for (const segment of segments) {
      if (segment.type === 'text' || segment.type === 'code' || segment.type === 'link') output += segment.text;
      else if (segment.type === 'span') output += segment.style === 'spoiler' ? SPOILER_PREVIEW : plainInline(segment.children);
    }
    return output;
  }

  function plainBlock(block) {
    if (block.type === 'plain') return block.text;
    if (block.type === 'paragraph' || block.type === 'heading') return block.lines.map(line => plainInline(tokenizeInline(line))).join('\n');
    if (block.type === 'codeblock') return block.text;
    if (block.type === 'quote') return block.lines.map(line => `> ${plainInline(tokenizeInline(line))}`).join('\n');
    if (block.type === 'list') return block.items.map(item => `${item.marker} ${item.lines.map(line => plainInline(tokenizeInline(line))).join('\n')}${item.children.map(child => `\n${child.items.map(row => `  ${row.marker} ${row.lines.map(line => plainInline(tokenizeInline(line))).join('\n')}`).join('\n')}`).join('')}`).join('\n');
    return '';
  }

  function plainText(source) {
    return parseMessage(source).map(plainBlock).join('\n');
  }

  function appendInline(parent, segments, doc, language) {
    for (const segment of segments) {
      if (segment.type === 'text') parent.append(doc.createTextNode(segment.text));
      else if (segment.type === 'code') {
        const code = doc.createElement('code'); code.className = 'message-inline-code'; code.textContent = segment.text; parent.append(code);
      } else if (segment.type === 'link') {
        const link = doc.createElement('a'); link.className = 'message-link'; link.href = segment.href; link.textContent = segment.text;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; parent.append(link);
      } else if (segment.type === 'span') {
        if (segment.style === 'spoiler') {
          const spoiler = doc.createElement('button'); spoiler.type = 'button'; spoiler.className = 'message-spoiler'; spoiler.setAttribute('aria-expanded', 'false');
          const hidden = doc.createElement('span'); hidden.className = 'message-spoiler-text'; appendInline(hidden, segment.children, doc, language); spoiler.append(hidden);
          const label = () => spoiler.classList.contains('revealed')
            ? (language === 'pt-BR' ? 'Ocultar texto' : 'Hide text')
            : (language === 'pt-BR' ? 'Texto oculto; ativar para revelar' : 'Hidden text; activate to reveal');
          spoiler.setAttribute('aria-label', label());
          spoiler.addEventListener('click', () => {
            const revealed = spoiler.classList.toggle('revealed'); spoiler.setAttribute('aria-expanded', String(revealed)); spoiler.setAttribute('aria-label', label());
          });
          parent.append(spoiler);
        } else {
          const tag = segment.style === 'bold' ? 'strong' : segment.style === 'italic' ? 'em' : 's';
          const styled = doc.createElement(tag); appendInline(styled, segment.children, doc, language); parent.append(styled);
        }
      }
    }
  }

  function appendLines(parent, lines, doc, language) {
    lines.forEach((line, index) => {
      if (index) parent.append(doc.createElement('br'));
      appendInline(parent, tokenizeInline(line), doc, language);
    });
  }

  function renderList(parent, list, doc, language, depth = 0) {
    const element = doc.createElement(list.ordered ? 'ol' : 'ul'); element.className = 'message-rich-list'; parent.append(element);
    for (const item of list.items) {
      const li = doc.createElement('li');
      const marker = doc.createElement('span'); marker.className = 'message-list-marker'; marker.textContent = item.marker;
      const body = doc.createElement('span'); body.className = 'message-list-body'; appendLines(body, item.lines, doc, language);
      li.append(marker, body); element.append(li);
      if (depth < 1) for (const child of item.children) renderList(li, child, doc, language, depth + 1);
    }
  }

  function renderInto(target, source, language = 'en') {
    if (!target?.ownerDocument) return;
    const doc = target.ownerDocument;
    target.replaceChildren();
    for (const block of parseMessage(source)) {
      if (block.type === 'plain') { target.append(doc.createTextNode(block.text)); continue; }
      if (block.type === 'paragraph') {
        const p = doc.createElement('p'); p.className = 'message-rich-block'; appendLines(p, block.lines, doc, language); target.append(p);
      } else if (block.type === 'heading') {
        const p = doc.createElement('p'); p.className = `message-rich-heading level-${block.level}`; appendLines(p, block.lines, doc, language); target.append(p);
      } else if (block.type === 'quote') {
        const quote = doc.createElement('blockquote'); quote.className = 'message-rich-quote'; appendLines(quote, block.lines, doc, language); target.append(quote);
      } else if (block.type === 'codeblock') {
        const pre = doc.createElement('pre'); pre.className = 'message-code-block'; const code = doc.createElement('code');
        if (block.language) { code.dataset.language = block.language; code.setAttribute('aria-label', `${block.language} code`); }
        code.textContent = block.text; pre.append(code); target.append(pre);
      } else if (block.type === 'list') renderList(target, block, doc, language);
    }
  }

  function preview(source) {
    const text = plainText(source).replace(/\s+/gu, ' ').trim();
    return text.length > 500 ? `${text.slice(0, 499)}…` : text;
  }

  window.PropertyRichText = Object.freeze({ parseMessage, tokenizeInline, plainText, preview, renderInto, MAX_FORMATTED_CHARS, SPOILER_PREVIEW });
})();
