'use strict';
(() => {
  const MAX_RESPONSE_BYTES = 65_536;
  const REQUEST_TIMEOUT_MS = 8_000;
  const HEX_PUBKEY = /^[0-9a-f]{64}$/;
  const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  function problem(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function parseIdentifier(value) {
    if (typeof value !== 'string' || value.length > 160) throw problem('nip05-invalid-identifier');
    const at = value.indexOf('@');
    if (at < 1 || at !== value.lastIndexOf('@')) throw problem('nip05-invalid-identifier');
    const name = value.slice(0, at);
    const suppliedDomain = value.slice(at + 1);
    if (name.length > 64 || !/^[a-z0-9._-]+$/i.test(name) || !suppliedDomain || /[\s\/:?#@\\%]/.test(suppliedDomain)) {
      throw problem('nip05-invalid-identifier');
    }
    let domain;
    try { domain = new URL(`https://${suppliedDomain}`).hostname.toLowerCase(); }
    catch { throw problem('nip05-invalid-identifier'); }
    const labels = domain.split('.');
    if (domain.length > 253 || labels.length < 2 || labels.some(label => !DOMAIN_LABEL.test(label)) ||
        domain === 'localhost' || /^\d+(?:\.\d+){3}$/.test(domain)) throw problem('nip05-invalid-identifier');
    const normalizedName = name.toLowerCase();
    const url = new URL(`https://${domain}/.well-known/nostr.json`);
    url.searchParams.set('name', normalizedName);
    return Object.freeze({ name: normalizedName, domain, url: url.href, identifier: `${normalizedName}@${domain}` });
  }

  async function boundedText(response) {
    const declaredLength = response.headers?.get?.('content-length');
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
      throw problem('nip05-response-too-large');
    }
    const reader = response.body?.getReader?.();
    if (!reader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw problem('nip05-response-too-large');
      return text;
    }
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw problem('nip05-response-too-large');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      if (error?.code) throw error;
      throw problem('nip05-invalid-response');
    }
  }

  async function fetchMapping(parsed, fetcher) {
    if (typeof fetcher !== 'function') throw problem('nip05-invalid-request');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response;
      try {
        response = await fetcher(parsed.url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'manual',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
      } catch {
        throw problem('nip05-network-error');
      }
      if (!response || response.type === 'opaqueredirect' || response.redirected || !response.ok) {
        throw problem('nip05-http-error');
      }
      let data;
      try { data = JSON.parse(await boundedText(response)); }
      catch (error) {
        if (error?.code) throw error;
        throw problem('nip05-invalid-response');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.names || typeof data.names !== 'object' || Array.isArray(data.names)) {
        throw problem('nip05-invalid-response');
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function check(identifier, expectedPubkey, fetcher = globalThis.fetch) {
    const parsed = parseIdentifier(identifier);
    const pubkey = typeof expectedPubkey === 'string' ? expectedPubkey.toLowerCase() : '';
    if (!HEX_PUBKEY.test(pubkey) || typeof fetcher !== 'function') throw problem('nip05-invalid-request');
    const data = await fetchMapping(parsed, fetcher);
    const value = data.names[parsed.name];
    const matches = typeof value === 'string' && HEX_PUBKEY.test(value) && value === value.toLowerCase() && value === pubkey;
    return Object.freeze({ matches, identifier: parsed.identifier, domain: parsed.domain });
  }

  async function resolve(identifier, fetcher = globalThis.fetch) {
    const parsed = parseIdentifier(identifier);
    const data = await fetchMapping(parsed, fetcher);
    const value = data.names[parsed.name];
    if (value === undefined) throw problem('nip05-not-found');
    if (typeof value !== 'string' || !HEX_PUBKEY.test(value) || value !== value.toLowerCase()) throw problem('nip05-invalid-response');
    return Object.freeze({ pubkey: value, identifier: parsed.identifier, domain: parsed.domain });
  }

  globalThis.PropertyNip05 = Object.freeze({ MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, parseIdentifier, check, resolve });
})();
