'use strict';
(() => {
  const KIND = 30078;
  const TAG = 'property-sponsored-v2';
  const TAGS = Object.freeze([TAG, 'liberdade-sponsored-v1']);
  const MAX_DURATION_SECONDS = 30 * 24 * 60 * 60;
  const EXPOSURE_WINDOW_SECONDS = 24 * 60 * 60;
  const MAX_INLINE_IMAGE_BYTES = 128 * 1024;
  const MAX_CONTENT_CHARS = 180_000;
  const HEX_64 = /^[0-9a-f]{64}$/;
  const CAMPAIGN_D = /^(?:property-sponsored-v2|liberdade-sponsored-v1):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function singleTag(event, name) {
    const values = (event.tags || []).filter(tag => Array.isArray(tag) && tag[0] === name);
    return values.length === 1 && typeof values[0][1] === 'string' ? values[0][1] : '';
  }

  function safeImageData(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_INLINE_IMAGE_BYTES * 4 / 3) + 40) return '';
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) return '';
    const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
    const byteLength = match[2].length * 3 / 4 - padding;
    if (byteLength <= 0 || byteLength > MAX_INLINE_IMAGE_BYTES) return '';
    if (match[1] === 'png' && !match[2].startsWith('iVBORw0KGgo')) return '';
    if (match[1] === 'jpeg' && !match[2].startsWith('/9j/')) return '';
    return value;
  }

  function parseSponsoredCampaign(event, verifyEvent, nowSeconds = Math.floor(Date.now() / 1000)) {
    try {
      if (!event || event.kind !== KIND || !HEX_64.test(event.id || '') || !HEX_64.test(event.pubkey || '') ||
          !Number.isSafeInteger(event.created_at) || event.created_at > nowSeconds + 300 || !Array.isArray(event.tags) ||
          typeof event.content !== 'string' || event.content.length > MAX_CONTENT_CHARS ||
          typeof verifyEvent !== 'function' || !verifyEvent(event)) return null;
      const markers = (event.tags || []).filter(tag => Array.isArray(tag) && tag[0] === 't');
      if (markers.length !== 1 || !TAGS.includes(markers[0][1])) return null;
      const campaignId = singleTag(event, 'd');
      if (!CAMPAIGN_D.test(campaignId) || !campaignId.startsWith(`${markers[0][1]}:`)) return null;

      const payload = JSON.parse(event.content);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const body = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (!title || title.length > 120 || body.length > 800) return null;
      if (payload.node_pubkey !== undefined && payload.node_pubkey !== event.pubkey) return null;

      const link = new URL(payload.link);
      if (link.protocol !== 'https:' || link.username || link.password || !link.hostname ||
          link.hostname === 'localhost' || link.hostname.endsWith('.localhost') || link.hostname.endsWith('.local') ||
          /^\d+(?:\.\d+){3}$/.test(link.hostname) || link.hostname.startsWith('[')) return null;
      const legacy = markers[0][1] === 'liberdade-sponsored-v1';
      const currency = legacy ? 'XNO' : payload.currency;
      if (legacy && payload.currency !== undefined && payload.currency !== 'XNO') return null;
      const amountAtomic = legacy ? payload.amount_raw : payload.amount_atomic;
      if (legacy && payload.amount_atomic !== undefined && payload.amount_atomic !== amountAtomic) return null;
      window.PropertyMoney.validateAtomic(amountAtomic, currency);
      if (BigInt(amountAtomic) <= 0n) return null;
      if (!legacy && (payload.amount_raw !== undefined || payload.payment_block_hash !== undefined)) return null;
      const paymentTxId = legacy ? payload.payment_block_hash : payload.payment_tx_id;

      const expiresAt = payload.expires_at;
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt <= event.created_at ||
          expiresAt - event.created_at > MAX_DURATION_SECONDS) return null;
      if (!HEX_64.test(payload.offer_event_id || '') || !HEX_64.test(payload.acceptance_event_id || '') ||
          !HEX_64.test(paymentTxId || '')) return null;

      let imageData = '';
      if (payload.image_data !== undefined && payload.image_data !== '') {
        imageData = safeImageData(payload.image_data);
        if (!imageData) return null;
      }
      return Object.freeze({
        id: event.id,
        campaignId,
        nodePubkey: event.pubkey,
        title,
        body,
        link: link.href,
        imageData,
        currency,
        amountAtomic,
        ...(legacy ? { amountRaw: amountAtomic } : {}),
        expiresAt,
        offerEventId: payload.offer_event_id,
        acceptanceEventId: payload.acceptance_event_id,
        paymentTxId
      });
    } catch {
      return null;
    }
  }

  function selectSponsoredCampaigns(events, verifyEvent, options = {}) {
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const blockedNodes = new Set((options.blockedNodes || []).filter(value => HEX_64.test(value)).map(value => value.toLowerCase()));
    const seen = options.exposures && typeof options.exposures === 'object' ? options.exposures : {};
    const maxCount = Number.isSafeInteger(options.maxCount) ? Math.max(0, Math.min(5, options.maxCount)) : 1;
    const unique = new Map();
    for (const event of events || []) {
      const campaign = parseSponsoredCampaign(event, verifyEvent, nowSeconds);
      if (!campaign || blockedNodes.has(campaign.nodePubkey.toLowerCase())) continue;
      const lastShown = seen[campaign.campaignId];
      if (Number.isSafeInteger(lastShown) && nowSeconds - lastShown < EXPOSURE_WINDOW_SECONDS) continue;
      const prior = unique.get(campaign.campaignId);
      if (!prior || event.created_at > prior.createdAt) unique.set(campaign.campaignId, { campaign, createdAt: event.created_at });
    }
    return [...unique.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, maxCount).map(item => item.campaign);
  }

  function recordExposure(exposures, campaignId, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!CAMPAIGN_D.test(campaignId) || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error('Registro local de campanha inválido.');
    const next = {};
    for (const [key, timestamp] of Object.entries(exposures || {})) {
      if (CAMPAIGN_D.test(key) && Number.isSafeInteger(timestamp) && nowSeconds - timestamp < 30 * 24 * 60 * 60) next[key] = timestamp;
    }
    next[campaignId] = nowSeconds;
    return next;
  }

  window.PropertyCampaigns = Object.freeze({ KIND, TAG, TAGS, EXPOSURE_WINDOW_SECONDS, parseSponsoredCampaign, selectSponsoredCampaigns, recordExposure });
})();
