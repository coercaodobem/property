import { createHash } from 'node:crypto';
import { parseStrictJson } from './ipc.mjs';

export const EVENT_FAMILIES = Object.freeze({
  profile: Object.freeze({ kinds: [0], maxContentBytes: 8_192, maxTags: 64 }),
  identity_claim: Object.freeze({ kinds: [10011], maxContentBytes: 16_384, maxTags: 64 }),
  private_message: Object.freeze({ kinds: [1059], maxContentBytes: 32_768, maxTags: 8 }),
  public_note: Object.freeze({ kinds: [1], maxContentBytes: 16_384, maxTags: 128 }),
  marketplace_offer: Object.freeze({ kinds: [30017, 30018], maxContentBytes: 16_384, maxTags: 32 }),
  trade_state: Object.freeze({ kinds: [1059], maxContentBytes: 24_576, maxTags: 16 }),
  campaign_sponsorship: Object.freeze({ kinds: [30078, 30079, 30080, 30082], maxContentBytes: 200_000, maxTags: 16 }),
  relay_discovery: Object.freeze({ kinds: [3, 10002, 10050], maxContentBytes: 8_192, maxTags: 512 }),
});

export const PROTOCOL_VERSIONS = Object.freeze({
  profile: Object.freeze(['nostr-nip01-kind-0/v1']),
  identity_claim: Object.freeze(['nostr-nip39-kind-10011/v1']),
  private_message: Object.freeze(['nostr-nip17-nip59/v1']),
  public_note: Object.freeze(['nostr-nip01-kind-1/v1']),
  marketplace_offer: Object.freeze(['nostr-nip15-kind-30018/v1', 'property-marketplace-offer/v1']),
  trade_state: Object.freeze([
    'property-trade-state/v1',
    'property-xno-trade/v1',
    'property-xno-escrow/v1',
    'property-xno-threshold/v2',
    'property-paid-job/v1',
  ]),
  campaign_sponsorship: Object.freeze([
    'property-campaign-offer-v1',
    'property-campaign-decision-v1',
    'property-campaign-refund-v1',
    'property-sponsored/v2',
  ]),
  relay_discovery: Object.freeze([
    'nostr-nip02-kind-3/v1',
    'nostr-nip65-kind-10002/v1',
    'nostr-nip17-kind-10050/v1',
  ]),
});

const MAX_EVENT_BYTES = 262_144;
const MAX_TAG_PARTS = 16;
const MAX_TAG_PART_BYTES = 4_096;
const CRITICAL_TAG = 'property-crit';
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const MAX_ATOMIC = Object.freeze({
  BTC: 2_100_000_000_000_000n,
  XMR: (1n << 64n) - 1n,
  XNO: (1n << 128n) - 1n,
});

export class ProtocolContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProtocolContractError';
    this.code = code;
  }
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
  return Object.getPrototypeOf(prototype) === null && typeof constructor?.value === 'function' && constructor.value.name === 'Object';
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

/** Canonical Property JSON: sorted object keys, ordered arrays, safe integers, UTF-8. */
export function canonicalJson(value, maxBytes = MAX_EVENT_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new ProtocolContractError('protocol-limit-invalid');
  const serialized = canonicalValue(value, new Set(), 0);
  if (utf8Bytes(serialized) > maxBytes) throw new ProtocolContractError('protocol-json-too-large');
  return serialized;
}

export function parseBoundedJson(raw, maxBytes = MAX_EVENT_BYTES) {
  if (typeof raw !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || utf8Bytes(raw) > maxBytes) {
    throw new ProtocolContractError('protocol-payload-too-large');
  }
  try { return parseStrictJson(raw, maxBytes); }
  catch (error) { throw new ProtocolContractError(error?.message || 'protocol-payload-invalid'); }
}

export function negotiateProtocolVersions(family, remoteOffer) {
  const local = PROTOCOL_VERSIONS[family];
  if (!local || !remoteOffer || typeof remoteOffer !== 'object' || Array.isArray(remoteOffer) ||
      !Array.isArray(remoteOffer.supported) || !Array.isArray(remoteOffer.critical) ||
      remoteOffer.supported.some(item => typeof item !== 'string' || item.length > 128) ||
      remoteOffer.critical.some(item => typeof item !== 'string' || item.length > 128)) {
    throw new ProtocolContractError('protocol-negotiation-invalid');
  }
  const common = local.filter(protocol => remoteOffer.supported.includes(protocol));
  if (remoteOffer.critical.some(protocol => !local.includes(protocol))) {
    throw new ProtocolContractError('protocol-version-unknown-critical');
  }
  if (remoteOffer.critical.some(protocol => !common.includes(protocol))) {
    throw new ProtocolContractError('protocol-version-no-overlap');
  }
  return Object.freeze({ selected: common[0] || null, compatible: Object.freeze(common) });
}

export function requireProtocolVersion(family, version) {
  if (typeof version !== 'string') throw new ProtocolContractError('protocol-version-missing');
  const result = negotiateProtocolVersions(family, { supported: [version], critical: [version] });
  if (!result.selected) throw new ProtocolContractError('protocol-version-no-overlap');
  return result.selected;
}

export function parseVersionedJson(raw, family, { versionField = 'protocol', maxBytes = MAX_EVENT_BYTES } = {}) {
  const value = parseBoundedJson(raw, maxBytes);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolContractError('protocol-payload-invalid');
  requireProtocolVersion(family, value[versionField]);
  return value;
}

export function validateAtomicAmount(currency, amount) {
  if (!Object.hasOwn(MAX_ATOMIC, currency) || typeof amount !== 'string' || !/^[1-9][0-9]*$/.test(amount)) {
    throw new ProtocolContractError('protocol-amount-ambiguous');
  }
  const atomic = BigInt(amount);
  if (atomic > MAX_ATOMIC[currency]) throw new ProtocolContractError('protocol-amount-out-of-range');
  return atomic;
}

/** NIP-01 serialization used to derive an event id. */
export function serializeNostrEventForId(event) {
  if (!event || typeof event !== 'object' || !HEX_64.test(event.pubkey || '') || !Number.isSafeInteger(event.created_at) ||
      !Number.isSafeInteger(event.kind) || !Array.isArray(event.tags) || typeof event.content !== 'string') {
    throw new ProtocolContractError('nostr-event-shape-invalid');
  }
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function nostrEventId(event) {
  return createHash('sha256').update(serializeNostrEventForId(event), 'utf8').digest('hex');
}

function fail(code) { throw new ProtocolContractError(code); }

/** Bounded, typed parser shared by the agent and deterministic contract tests. */
export function parseEventFamily(raw, family, verifyEvent, nowSeconds) {
  const rules = EVENT_FAMILIES[family];
  if (!rules || typeof verifyEvent !== 'function' || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) fail('protocol-parser-config-invalid');
  let event = raw;
  if (typeof raw === 'string') event = parseBoundedJson(raw, MAX_EVENT_BYTES);
  if (!event || typeof event !== 'object' || Array.isArray(event) || !isPlainObject(event)) fail('nostr-event-shape-invalid');
  const fields = Object.keys(event).sort();
  if (fields.join(',') !== 'content,created_at,id,kind,pubkey,sig,tags') fail('nostr-event-shape-invalid');
  if (!rules.kinds.includes(event.kind)) fail('nostr-event-kind-unexpected');
  if (!HEX_64.test(event.id || '') || !HEX_64.test(event.pubkey || '') || !HEX_128.test(event.sig || '') ||
      !Number.isSafeInteger(event.created_at) || event.created_at < 0 || event.created_at > nowSeconds + 300 ||
      typeof event.content !== 'string' || utf8Bytes(event.content) > rules.maxContentBytes ||
      !Array.isArray(event.tags) || event.tags.length > rules.maxTags || utf8Bytes(canonicalJson(event)) > MAX_EVENT_BYTES) {
    fail('nostr-event-bounds-invalid');
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 1 || tag.length > MAX_TAG_PARTS ||
        tag.some(part => typeof part !== 'string' || utf8Bytes(part) > MAX_TAG_PART_BYTES)) fail('nostr-event-tag-invalid');
  }
  const criticalTags = event.tags.filter(tag => tag[0] === CRITICAL_TAG);
  if (criticalTags.length > 1 || criticalTags.some(tag => tag.length < 2 || tag.slice(1).length > MAX_TAG_PARTS - 1)) fail('protocol-critical-tag-invalid');
  const knownTagNames = new Set(event.tags.map(tag => tag[0]));
  for (const tagName of criticalTags.flatMap(tag => tag.slice(1))) {
    if (!knownTagNames.has(tagName)) fail('protocol-critical-tag-missing');
    if (!['p', 'e', 'a', 'd', 't', 'k', 'expiration', 'relay', 'r', 'i', 'property-crit'].includes(tagName)) {
      fail('protocol-tag-unknown-critical');
    }
  }
  if (nostrEventId(event) !== event.id) fail('nostr-event-id-invalid');
  let valid = false;
  try { valid = verifyEvent(event) === true; } catch { valid = false; }
  if (!valid) fail('nostr-event-signature-invalid');
  return event;
}

/** Stable NIP-01 event reduction: deduplicate IDs; replaceable ties use the lower event id. */
export function reduceNostrEventBatch(events) {
  if (!Array.isArray(events) || events.length > 100_000) fail('nostr-event-batch-invalid');
  const byId = new Map();
  for (const event of events) {
    if (!event || !HEX_64.test(event.id || '') || nostrEventId(event) !== event.id) fail('nostr-event-id-invalid');
    const serialized = canonicalJson(event);
    const prior = byId.get(event.id);
    if (prior && prior !== serialized) fail('nostr-event-id-equivocation');
    byId.set(event.id, serialized);
  }
  const unique = [...byId.keys()].map(id => JSON.parse(byId.get(id)));
  const replaceable = new Map();
  const ordinary = [];
  for (const event of unique) {
    const dTags = event.tags.filter(tag => tag[0] === 'd');
    const isReplaceable = event.kind === 0 || event.kind === 3 ||
      (event.kind >= 10_000 && event.kind < 20_000) || (event.kind >= 30_000 && event.kind < 40_000);
    if (!isReplaceable || (event.kind >= 30_000 && event.kind < 40_000 && dTags.length !== 1)) {
      ordinary.push(event);
      continue;
    }
    const address = `${event.kind}:${event.pubkey}:${dTags[0]?.[1] || ''}`;
    const current = replaceable.get(address);
    if (!current || event.created_at > current.created_at ||
        (event.created_at === current.created_at && event.id < current.id)) replaceable.set(address, event);
  }
  return [...ordinary, ...replaceable.values()].sort((left, right) => left.id.localeCompare(right.id));
}
