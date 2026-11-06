'use strict';
(() => {
  const TAG = 'property-link-preview-v1';
  const encoder = new TextEncoder();
  const MAX_HTML_BYTES = 512 * 1024;
  const MAX_TAG_BYTES = 4096;
  const MAX_URL_LENGTH = 2048;
  const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu;

  function publicHttpsUrl(value) {
    if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
    try {
      const url = new URL(value.trim());
      const host = url.hostname.toLowerCase().replace(/\.$/u, '');
      if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/u.test(host)) return null;
      if (/(^|\.)(?:localhost|local|internal|lan|home\.arpa)$/u.test(host)) return null;
      if (url.port && url.port !== '443') return null;
      url.hash = url.hash.slice(0, 512);
      return url.href;
    } catch { return null; }
  }

  function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(CONTROL_CHARS, '').replace(/\s+/gu, ' ').trim().slice(0, max);
  }

  function stripTrailingPunctuation(value) {
    let url = value;
    while (/[.,!?;:]$/u.test(url)) url = url.slice(0, -1);
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (url.endsWith(close) && (url.match(new RegExp(`\\${close}`, 'gu')) || []).length > (url.match(new RegExp(`\\${open}`, 'gu')) || []).length) url = url.slice(0, -1);
    }
    return url;
  }

  function firstLink(text) {
    if (typeof text !== 'string' || !text || text.length > 20_000) return null;
    const visible = text.replace(/```[\s\S]*?```/gu, match => ' '.repeat(match.length)).replace(/~~~[\s\S]*?~~~/gu, match => ' '.repeat(match.length));
    const link = /https:\/\/[^\s<>"'`]+/giu.exec(visible);
    return link ? publicHttpsUrl(stripTrailingPunctuation(link[0])) : null;
  }

  function decodeEntities(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', copy: '©', reg: '®', trade: '™' };
    return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/giu, (whole, ref) => {
      if (ref[0] === '#') {
        const code = ref[1]?.toLowerCase() === 'x' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
      }
      return named[ref.toLowerCase()] ?? whole;
    });
  }

  function parseAttributes(source) {
    const values = new Map();
    for (const item of source.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
      const key = item[1].toLowerCase();
      if (!values.has(key)) values.set(key, decodeEntities(item[2] ?? item[3] ?? item[4] ?? ''));
    }
    return values;
  }

  function parsePage(html, pageUrl) {
    if (typeof html !== 'string' || encoder.encode(html).byteLength > MAX_HTML_BYTES) return null;
    const canonical = publicHttpsUrl(pageUrl);
    if (!canonical) return null;
    let head = html.slice(0, MAX_HTML_BYTES);
    const end = head.search(/<\/head\s*>|<body[\s>]/iu);
    if (end >= 0) head = head.slice(0, end);
    head = head.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/giu, '');
    const meta = new Map();
    for (const match of head.matchAll(/<meta\b([^>]*)>/giu)) {
      const attrs = parseAttributes(match[1]);
      const key = (attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop') ?? '').toLowerCase().trim();
      const content = attrs.get('content');
      if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
    }
    const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(head)?.[1] || '';
    const first = (...keys) => keys.map(key => meta.get(key)).find(value => typeof value === 'string' && value.trim()) || '';
    const url = new URL(canonical);
    const title = cleanText(first('og:title', 'twitter:title') || decodeEntities(titleTag.replace(/<[^>]*>/gu, '')), 140) || url.hostname;
    const description = cleanText(first('og:description', 'twitter:description', 'description'), 240);
    const site = cleanText(first('og:site_name', 'application-name'), 80) || url.hostname;
    return Object.freeze({ v: 1, url: canonical, title, description, site });
  }

  async function readBounded(response) {
    const announced = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(announced) && announced > MAX_HTML_BYTES) return null;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_HTML_BYTES) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength <= MAX_HTML_BYTES ? bytes : null;
  }

  async function fetchPreview(value, fetcher = globalThis.fetch) {
    const url = publicHttpsUrl(value);
    if (!url || typeof fetcher !== 'function') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(url, {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: { Accept: 'text/html' }, signal: controller.signal
      });
      if (!response?.ok || response.redirected || response.type === 'opaqueredirect') return null;
      const contentType = response.headers?.get?.('content-type') || '';
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(contentType)) return null;
      if (response.url) {
        const final = publicHttpsUrl(response.url);
        if (!final || new URL(final).origin !== new URL(url).origin) return null;
      }
      const bytes = await readBounded(response);
      if (!bytes || controller.signal.aborted) return null;
      const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return parsePage(html, url);
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  function normalizePreview(value, text) {
    if (!value || typeof value !== 'object' || value.v !== 1) return null;
    const url = publicHttpsUrl(value.url);
    if (!url || firstLink(text) !== url) return null;
    const title = cleanText(value.title, 140);
    if (!title) return null;
    return Object.freeze({ v: 1, url, title, description: cleanText(value.description, 240), site: cleanText(value.site, 80) || new URL(url).hostname });
  }

  function toTag(value, text) {
    const preview = normalizePreview(value, text);
    if (!preview) return null;
    const serialized = JSON.stringify(preview);
    if (encoder.encode(serialized).byteLength > MAX_TAG_BYTES) return null;
    return [TAG, serialized];
  }

  function fromTags(tags, text) {
    if (!Array.isArray(tags)) return null;
    const matching = tags.filter(tag => Array.isArray(tag) && tag[0] === TAG);
    if (matching.length !== 1 || typeof matching[0][1] !== 'string' || encoder.encode(matching[0][1]).byteLength > MAX_TAG_BYTES) return null;
    try { return normalizePreview(JSON.parse(matching[0][1]), text); } catch { return null; }
  }

  globalThis.PropertyLinkPreview = Object.freeze({ TAG, MAX_HTML_BYTES, MAX_TAG_BYTES, publicHttpsUrl, firstLink, parsePage, fetchPreview, normalizePreview, toTag, fromTags });
})();
