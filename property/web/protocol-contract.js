'use strict';
(() => {
  const EVENT_FAMILIES = Object.freeze({
    identity_claim: Object.freeze({ kinds: [10011], maxContentBytes: 16_384, maxTags: 64 }),
    private_message: Object.freeze({ kinds: [1059], maxContentBytes: 32_768, maxTags: 8 }),
    public_note: Object.freeze({ kinds: [1], maxContentBytes: 16_384, maxTags: 128 }),
    marketplace_offer: Object.freeze({ kinds: [30017, 30018], maxContentBytes: 16_384, maxTags: 32 }),
    trade_state: Object.freeze({ kinds: [1059], maxContentBytes: 24_576, maxTags: 16 }),
    campaign_sponsorship: Object.freeze({ kinds: [30078, 30079, 30080, 30082], maxContentBytes: 200_000, maxTags: 16 }),
    relay_discovery: Object.freeze({ kinds: [3, 10002, 10050], maxContentBytes: 8_192, maxTags: 512 }),
  });
  const encoder = new TextEncoder();
  const HEX_64 = /^[0-9a-f]{64}$/;
  const HEX_128 = /^[0-9a-f]{128}$/;

  function isPlainObject(value) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && typeof constructor?.value === 'function' && constructor.value.name === 'Object';
  }

  class ProtocolContractError extends Error {
    constructor(code) { super(code); this.name = 'ProtocolContractError'; this.code = code; }
  }

  function canonicalValue(value, active, depth) {
    if (depth > 12) throw new ProtocolContractError('protocol-json-too-deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new ProtocolContractError('protocol-json-number-not-safe');
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      if (value.length > 1_000) throw new ProtocolContractError('protocol-json-array-too-large');
      if (active.has(value)) throw new ProtocolContractError('protocol-json-cycle');
      active.add(value);
      const output = `[${value.map(item => canonicalValue(item, active, depth + 1)).join(',')}]`;
      active.delete(value);
      return output;
    }
    if (typeof value !== 'object' || !isPlainObject(value)) {
      throw new ProtocolContractError('protocol-json-type-invalid');
    }
    if (active.has(value)) throw new ProtocolContractError('protocol-json-cycle');
    const keys = Object.keys(value).sort();
    if (keys.length > 1_000) throw new ProtocolContractError('protocol-json-object-too-large');
    active.add(value);
    const output = `{${keys.map(key => `${JSON.stringify(key)}:${canonicalValue(value[key], active, depth + 1)}`).join(',')}}`;
    active.delete(value);
    return output;
  }

  function canonicalJson(value, maxBytes = 262_144) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new ProtocolContractError('protocol-limit-invalid');
    const serialized = canonicalValue(value, new Set(), 0);
    if (new TextEncoder().encode(serialized).byteLength > maxBytes) throw new ProtocolContractError('protocol-json-too-large');
    return serialized;
  }

  function validateEventFamily(event, family, verifyEvent, nowSeconds) {
    const rules = EVENT_FAMILIES[family];
    const fail = code => { throw new ProtocolContractError(code); };
    if (!rules || typeof verifyEvent !== 'function' || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) fail('protocol-parser-config-invalid');
    if (!event || typeof event !== 'object' || Array.isArray(event) || !isPlainObject(event)) fail('nostr-event-shape-invalid');
    if (Object.keys(event).sort().join(',') !== 'content,created_at,id,kind,pubkey,sig,tags') fail('nostr-event-shape-invalid');
    if (!rules.kinds.includes(event.kind)) fail('nostr-event-kind-unexpected');
    if (!HEX_64.test(event.id || '') || !HEX_64.test(event.pubkey || '') || !HEX_128.test(event.sig || '') ||
        !Number.isSafeInteger(event.created_at) || event.created_at < 0 || event.created_at > nowSeconds + 300 ||
        typeof event.content !== 'string' || encoder.encode(event.content).byteLength > rules.maxContentBytes ||
        !Array.isArray(event.tags) || event.tags.length > rules.maxTags || encoder.encode(canonicalJson(event)).byteLength > 262_144) {
      fail('nostr-event-bounds-invalid');
    }
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag.length < 1 || tag.length > 16 ||
          tag.some(part => typeof part !== 'string' || encoder.encode(part).byteLength > 4_096)) fail('nostr-event-tag-invalid');
    }
    const criticalTags = event.tags.filter(tag => tag[0] === 'property-crit');
    if (criticalTags.length > 1 || criticalTags.some(tag => tag.length < 2 || tag.length > 16)) fail('protocol-critical-tag-invalid');
    const knownTagNames = new Set(event.tags.map(tag => tag[0]));
    for (const tagName of criticalTags.flatMap(tag => tag.slice(1))) {
      if (!knownTagNames.has(tagName)) fail('protocol-critical-tag-missing');
      if (!['p', 'e', 'a', 'd', 't', 'k', 'expiration', 'relay', 'r', 'i', 'property-crit'].includes(tagName)) {
        fail('protocol-tag-unknown-critical');
      }
    }
    let valid = false;
    try { valid = verifyEvent(event) === true; } catch { valid = false; }
    if (!valid) fail('nostr-event-signature-invalid');
    return event;
  }

  globalThis.PropertyProtocol = Object.freeze({ ProtocolContractError, canonicalJson, validateEventFamily, EVENT_FAMILIES });
})();
