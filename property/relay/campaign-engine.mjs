import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OFFER_KIND = 30079;
const DECISION_KIND = 30080;
const REFUND_REQUEST_KIND = 30082;
const CAMPAIGN_KIND = 30078;
const OFFER_TAG = 'property-campaign-offer-v1';
const DECISION_TAG = 'property-campaign-decision-v1';
const MAX_DURATION_SECONDS = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64 = /^[0-9a-f]{64}$/i;
const MAX_ATOMIC = Object.freeze({ BTC: 2_100_000_000_000_000n, XMR: (1n << 64n) - 1n, XNO: (1n << 128n) - 1n });

function exactTags(event, name) {
  const tags = (event?.tags || []).filter(tag => Array.isArray(tag) && tag[0] === name);
  return tags.length === 1 && typeof tags[0][1] === 'string' ? tags[0][1] : '';
}

function validateAtomic(value, currency) {
  if (!Object.hasOwn(MAX_ATOMIC, currency) || typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error('Montante atômico inválido.');
  }
  const amount = BigInt(value);
  if (amount > MAX_ATOMIC[currency]) throw new Error('Montante excede o limite da moeda.');
  return amount;
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname ||
        url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') ||
        /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith('[')) return '';
    return url.href;
  } catch { return ''; }
}

function offerPayload(event, verifyEvent, now) {
  if (!event || event.kind !== OFFER_KIND || !HEX_64.test(event.id || '') || !HEX_64.test(event.pubkey || '') ||
      !Number.isSafeInteger(event.created_at) || event.created_at > now + 300 || !Array.isArray(event.tags) ||
      typeof event.content !== 'string' || event.content.length > 16_000 || !verifyEvent(event)) {
    throw new Error('Proposta ausente, malformada ou sem assinatura válida.');
  }
  if (exactTags(event, 't') !== OFFER_TAG) throw new Error('Marcador de proposta inválido.');
  const campaignId = exactTags(event, 'd');
  if (!UUID.test(campaignId)) throw new Error('Identificador da campanha inválido.');
  let payload;
  try { payload = JSON.parse(event.content); } catch { throw new Error('Conteúdo da proposta não é JSON válido.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== OFFER_TAG ||
      payload.campaign_id !== campaignId || payload.advertiser_pubkey !== event.pubkey) {
    throw new Error('A proposta não corresponde ao autor ou ao identificador assinado.');
  }
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const link = safeHttps(payload.link);
  if (!title || title.length > 120 || body.length > 800 || !link ||
      typeof payload.refund_terms !== 'string' || !payload.refund_terms.trim() || payload.refund_terms.length > 500) {
    throw new Error('Conteúdo, link ou condições de reembolso inválidos.');
  }
  const amount = validateAtomic(payload.amount_atomic, payload.currency);
  if (!Object.hasOwn(MAX_ATOMIC, payload.currency)) throw new Error('Moeda da proposta inválida.');
  if (!Number.isSafeInteger(payload.expires_at) || payload.expires_at <= now || payload.expires_at <= event.created_at ||
      payload.expires_at - event.created_at > MAX_DURATION_SECONDS) throw new Error('Prazo da proposta inválido.');
  return Object.freeze({
    eventId: event.id, advertiserPubkey: event.pubkey, campaignId, title, body, link,
    currency: payload.currency, amountAtomic: amount.toString(), expiresAt: payload.expires_at,
    refundTerms: payload.refund_terms.trim(), termsHash: createHash('sha256').update(event.content).digest('hex')
  });
}

async function atomicJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try { await rename(tempPath, filePath); }
  catch (error) { await rm(tempPath, { force: true }).catch(() => {}); throw error; }
}

export function createCampaignEngine(options) {
  if (!options || typeof options !== 'object') throw new TypeError('Campaign engine options are required.');
  const { stateDir, nodePubkey, verifyEvent, signEvent, addressProvider, ledger, publishEvent } = options;
  for (const [name, value] of Object.entries({ stateDir, nodePubkey, verifyEvent, signEvent, addressProvider, ledger, publishEvent })) {
    if (value === undefined || value === null) throw new TypeError(`${name} is required.`);
  }
  if (!HEX_64.test(nodePubkey) || typeof verifyEvent !== 'function' || typeof signEvent !== 'function' ||
      typeof addressProvider !== 'function' || typeof ledger.lookupPayment !== 'function' ||
      typeof ledger.refundPayment !== 'function' || typeof publishEvent !== 'function') throw new TypeError('Campaign engine dependencies are invalid.');

  const filePath = path.join(path.resolve(stateDir), 'campaigns.json');
  const nowSeconds = options.nowSeconds || (() => Math.floor(Date.now() / 1000));
  const policy = Object.freeze({
    currencies: [...new Set(options.policy?.currencies || ['BTC', 'XMR', 'XNO'])],
    allowedAdvertisers: [...new Set(options.policy?.allowedAdvertisers || [])],
    minAtomic: { ...(options.policy?.minAtomic || {}) }, maxAtomic: { ...(options.policy?.maxAtomic || {}) },
    minConfirmations: options.policy?.minConfirmations ?? 1
  });
  let state = null;
  let queue = Promise.resolve();

  async function load() {
    if (state) return state;
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    try {
      state = JSON.parse(await readFile(filePath, 'utf8'));
      if (state.schema_version !== 1 || !state.campaigns || typeof state.campaigns !== 'object' || Array.isArray(state.campaigns)) {
        throw new Error('Persisted campaign state schema is invalid.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { schema_version: 1, node_pubkey: nodePubkey, campaigns: {} };
      await save();
    }
    if (state.node_pubkey !== nodePubkey) throw new Error('Campaign state belongs to another node identity.');
    return state;
  }

  async function save() { await atomicJson(filePath, state); }
  function serialized(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }
  async function sign(kind, content, tags, createdAt = nowSeconds()) {
    const event = await signEvent({ kind, content, tags, created_at: createdAt });
    if (!event || event.kind !== kind || event.pubkey !== nodePubkey || !verifyEvent(event)) throw new Error('Assinatura do node inválida.');
    return event;
  }
  function findByOfferId(current, offerId) {
    return Object.values(current.campaigns).find(record => record.offer_event_id === offerId) || null;
  }
  function summary(record) {
    return structuredClone(record);
  }

  async function decide(offerEvent) {
    return serialized(async () => {
      const current = await load();
      const now = nowSeconds();
      const offer = offerPayload(offerEvent, verifyEvent, now);
      const byId = findByOfferId(current, offer.eventId);
      if (byId) return { decision: byId.decision, event: byId.decision_event, record: summary(byId) };
      const conflict = current.campaigns[offer.campaignId];
      let rejectionReason = '';
      if (options.policy?.enabled === false) rejectionReason = 'campaigns_disabled_by_node';
      else if (!policy.currencies.includes(offer.currency)) rejectionReason = 'currency_not_accepted';
      else if (BigInt(offer.amountAtomic) < BigInt(policy.minAtomic[offer.currency] || '1') ||
          BigInt(offer.amountAtomic) > BigInt(policy.maxAtomic[offer.currency] || MAX_ATOMIC[offer.currency])) rejectionReason = 'amount_outside_node_policy';
      else if (policy.allowedAdvertisers.length && !policy.allowedAdvertisers.includes(offer.advertiserPubkey)) rejectionReason = 'advertiser_not_allowed';
      else if (conflict) rejectionReason = 'campaign_id_conflict';
      const approved = !rejectionReason;
      if (!approved) {
        const decision = await sign(DECISION_KIND, JSON.stringify({ schema: DECISION_TAG, status: 'rejected',
          offer_event_id: offer.eventId, terms_hash: offer.termsHash, currency: offer.currency,
          amount_atomic: offer.amountAtomic, expires_at: offer.expiresAt, node_pubkey: nodePubkey, reason: rejectionReason }),
        [['t', DECISION_TAG], ['d', offer.campaignId], ['e', offer.eventId], ['p', offer.advertiserPubkey]]);
        const record = { campaign_id: offer.campaignId, offer_event_id: offer.eventId, advertiser_pubkey: offer.advertiserPubkey,
          terms_hash: offer.termsHash, currency: offer.currency, amount_atomic: offer.amountAtomic, expires_at: offer.expiresAt,
          decision: 'rejected', decision_event: decision, status: 'rejected', created_at: now };
        const recordKey = conflict ? `${offer.campaignId}:conflict:${offer.eventId}` : offer.campaignId;
        current.campaigns[recordKey] = record;
        await save();
        return { decision: 'rejected', event: decision, record: summary(record) };
      }
      const address = await addressProvider({ campaignId: offer.campaignId, currency: offer.currency, offerEventId: offer.eventId });
      if (typeof address !== 'string' || !address.trim() || address.length > 256) throw new Error('O adaptador não gerou endereço exclusivo válido.');
      if (Object.values(current.campaigns).some(record => record.payment_address === address)) throw new Error('O endereço de pagamento já foi associado a outra campanha.');
      const decision = await sign(DECISION_KIND, JSON.stringify({ schema: DECISION_TAG, status: 'accepted',
        offer_event_id: offer.eventId, terms_hash: offer.termsHash, currency: offer.currency,
        amount_atomic: offer.amountAtomic, payment_address: address, expires_at: offer.expiresAt,
        refund_terms: offer.refundTerms, node_pubkey: nodePubkey }),
      [['t', DECISION_TAG], ['d', offer.campaignId], ['e', offer.eventId], ['p', offer.advertiserPubkey]]);
      const record = { campaign_id: offer.campaignId, offer_event_id: offer.eventId, advertiser_pubkey: offer.advertiserPubkey,
        terms_hash: offer.termsHash, title: offer.title, body: offer.body, link: offer.link,
        currency: offer.currency, amount_atomic: offer.amountAtomic, payment_address: address,
        refund_terms: offer.refundTerms, expires_at: offer.expiresAt, decision: 'accepted', decision_event: decision,
        status: 'awaiting_payment', created_at: now, payment: null, campaign_event: null, campaign_delete_event: null,
        refund_request_id: null, refund: null };
      current.campaigns[offer.campaignId] = record;
      await save();
      return { decision: 'accepted', event: decision, record: summary(record) };
    });
  }

  async function publishPending(record) {
    if (!record.campaign_event) {
      const campaignD = `property-sponsored-v2:${record.campaign_id}`;
      record.campaign_event = await sign(CAMPAIGN_KIND, JSON.stringify({
        schema: 'property-sponsored-v2', title: record.title, body: record.body, link: record.link,
        currency: record.currency, amount_atomic: record.amount_atomic, expires_at: record.expires_at,
        offer_event_id: record.offer_event_id, acceptance_event_id: record.decision_event.id,
        payment_tx_id: record.payment.txid, node_pubkey: nodePubkey
      }), [['t', 'property-sponsored-v2'], ['d', campaignD]], Math.min(nowSeconds(), record.expires_at - 1));
      record.status = 'publish_pending';
      await save();
    }
    const result = await publishEvent(record.campaign_event);
    if (result?.accepted !== true) return { status: record.status, event: record.campaign_event, relay_ack: result || null };
    record.status = 'published';
    record.published_at = nowSeconds();
    await save();
    return { status: record.status, event: record.campaign_event, relay_ack: result };
  }

  async function reconcile(campaignId) {
    return serialized(async () => {
      const current = await load();
      const record = current.campaigns[campaignId];
      if (!record || record.decision !== 'accepted') throw new Error('Campanha aceita não encontrada.');
      if (record.status === 'published') {
        if (nowSeconds() < record.expires_at) return { status: 'published', event: record.campaign_event, record: summary(record) };
        if (!record.campaign_delete_event) {
          record.campaign_delete_event = await sign(5, '', [['e', record.campaign_event.id],
            ['a', `${CAMPAIGN_KIND}:${nodePubkey}:property-sponsored-v2:${record.campaign_id}`], ['k', String(CAMPAIGN_KIND)]]);
          record.status = 'expiry_pending';
          await save();
        }
        const ack = await publishEvent(record.campaign_delete_event);
        if (ack?.accepted === true) { record.status = 'expired'; record.expired_at = nowSeconds(); await save(); }
        return { status: record.status, event: record.campaign_delete_event, record: summary(record) };
      }
      if (record.status === 'expired' || record.status === 'refunded' || record.status === 'rejected') return { status: record.status, record: summary(record) };
      if (record.status === 'refund_due' || record.status === 'refund_pending') return { status: record.status, record: summary(record) };
      if (record.status === 'confirmed' || record.status === 'publish_pending') {
        const published = await publishPending(record);
        return { ...published, record: summary(record) };
      }
      const expiredBeforeLookup = nowSeconds() >= record.expires_at;
      const observed = await ledger.lookupPayment({ address: record.payment_address, currency: record.currency });
      if (expiredBeforeLookup && !observed) {
        record.status = 'expired';
        record.expired_at = nowSeconds();
        await save();
        return { status: record.status, record: summary(record) };
      }
      if (!observed) return { status: record.status, record: summary(record) };
      const confirmations = Number.isSafeInteger(observed.confirmations) ? observed.confirmations : 0;
      if (observed.proof !== true || confirmations < policy.minConfirmations) {
        record.payment = { address: observed.address, currency: observed.currency, amount_atomic: String(observed.amount_atomic || ''),
          txid: HEX_64.test(observed.txid || '') ? observed.txid : null, confirmations, proof: observed.proof === true };
        record.status = 'payment_pending';
        await save();
        return { status: record.status, record: summary(record) };
      }
      const matching = observed.address === record.payment_address && observed.currency === record.currency &&
        observed.amount_atomic === record.amount_atomic && HEX_64.test(observed.txid || '') &&
        observed.proof === true && confirmations >= policy.minConfirmations && !expiredBeforeLookup;
      record.payment = { address: observed.address, currency: observed.currency, amount_atomic: String(observed.amount_atomic || ''),
        txid: observed.txid || null, confirmations, proof: observed.proof === true };
      if (!matching) {
        record.status = 'refund_due';
        record.payment_mismatch = true;
        await save();
        return { status: record.status, record: summary(record) };
      }
      if (Object.values(current.campaigns).some(other => other !== record && other.payment?.txid === observed.txid)) {
        record.status = 'refund_due';
        record.payment_duplicate = true;
        await save();
        return { status: record.status, record: summary(record) };
      }
      record.status = 'confirmed';
      await save();
      const published = await publishPending(record);
      return { ...published, record: summary(record) };
    });
  }

  async function refund(refundRequestEvent) {
    return serialized(async () => {
      const current = await load();
      if (!refundRequestEvent || refundRequestEvent.kind !== REFUND_REQUEST_KIND || !verifyEvent(refundRequestEvent)) {
        throw new Error('Pedido de reembolso precisa de assinatura válida.');
      }
      const campaignId = exactTags(refundRequestEvent, 'd');
      const record = current.campaigns[campaignId];
      if (record?.advertiser_pubkey === refundRequestEvent.pubkey && record.refund &&
          record.refund_request_id === refundRequestEvent.id) {
        return { status: 'refunded', refund: structuredClone(record.refund), record: summary(record) };
      }
      if (!record || record.advertiser_pubkey !== refundRequestEvent.pubkey ||
          !['refund_due', 'refund_pending'].includes(record.status) || !record.payment?.txid ||
          (record.status === 'refund_pending' && record.refund_request_id !== refundRequestEvent.id)) {
        throw new Error('Pedido de reembolso não corresponde a pagamento conciliado e reembolsável.');
      }
      if (record.refund) return { status: 'refunded', refund: structuredClone(record.refund), record: summary(record) };
      let payload;
      try { payload = JSON.parse(refundRequestEvent.content); } catch { throw new Error('Pedido de reembolso inválido.'); }
      if (payload?.schema !== 'property-campaign-refund-v1' || payload.campaign_id !== campaignId ||
          payload.offer_event_id !== record.offer_event_id || payload.payment_tx_id !== record.payment.txid ||
          typeof payload.refund_address !== 'string' || !payload.refund_address.trim() || payload.refund_address.length > 256 ||
          exactTags(refundRequestEvent, 'e') !== record.offer_event_id) throw new Error('Pedido de reembolso não está vinculado ao pagamento conciliado.');
      record.refund_request_id = refundRequestEvent.id;
      record.status = 'refund_pending';
      await save();
      const result = await ledger.refundPayment({ payment: structuredClone(record.payment), currency: record.payment.currency,
        amountAtomic: record.payment.amount_atomic, refundAddress: payload.refund_address, idempotencyKey: record.offer_event_id });
      if (result?.confirmed !== true || !HEX_64.test(result.txid || '')) {
        record.status = 'refund_due';
        await save();
        return { status: record.status, refund: result || null, record: summary(record) };
      }
      record.refund = { txid: result.txid, currency: record.payment.currency, amount_atomic: record.payment.amount_atomic,
        refund_address: payload.refund_address, fee_atomic: String(result.fee_atomic || '0') };
      record.status = 'refunded';
      await save();
      return { status: record.status, refund: structuredClone(record.refund), record: summary(record) };
    });
  }

  async function get(campaignId) {
    const current = await load();
    const record = current.campaigns[campaignId];
    return record ? summary(record) : null;
  }

  async function list() {
    const current = await load();
    return Object.values(current.campaigns).map(summary);
  }

  return Object.freeze({ kinds: Object.freeze({ OFFER_KIND, DECISION_KIND, REFUND_REQUEST_KIND, CAMPAIGN_KIND }), decide, reconcile, refund, get, list });
}

export { OFFER_KIND, DECISION_KIND, REFUND_REQUEST_KIND, CAMPAIGN_KIND, OFFER_TAG, DECISION_TAG };
