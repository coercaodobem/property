'use strict';
/* global BigInt */
(() => {
  const HEX_64 = /^[0-9a-f]{64}$/;
  const OFFER_SCHEMA = 'property-marketplace-offer/v1';
  const PAYMENT_RAILS = Object.freeze({ BTC: 'bitcoin-onchain', XMR: 'monero-onchain', XNO: 'nano-direct' });

  function parsePrice(value, nanoUnits, selectedCurrency = 'XNO') {
    const match = typeof value === 'string' && value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z]{2,12})?$/);
    if (!match) throw new Error('Preço deve ser um decimal em BTC, XMR ou XNO.');
    const currency = (match[2] || selectedCurrency).toUpperCase();
    const decimal = match[1].replace(',', '.');
    const money = window.PropertyMoney;
    const atomic = money.toAtomic(decimal, currency);
    const price = Number(decimal);
    const whole = BigInt(decimal.split('.')[0]);
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(price) || whole > maxSafe || (whole === maxSafe && /[1-9]/.test(decimal.split('.')[1] || ''))) {
      throw new Error('Preço fora do intervalo compatível com a vitrine NIP-15.');
    }
    // NIP-15 requires a number; the exact amount remains an integer string.
    return Object.freeze({ price, currency, atomic, ...(currency === 'XNO' ? { raw: atomic } : {}) });
  }

  function displayPrice(product, nanoUnits) {
    const currency = typeof product?.currency === 'string' ? product.currency.toUpperCase() : '';
    if (!Object.hasOwn(window.PropertyMoney.CURRENCIES, currency)) return 'Preço inválido';
    let shownPrice = product?.price ?? '—';
    const atomic = product?.price_atomic ?? (currency === 'XNO' ? product?.price_raw : undefined);
    if (atomic !== undefined) {
      try { shownPrice = window.PropertyMoney.fromAtomic(atomic, currency); } catch { return 'Preço inválido'; }
    }
    return `${shownPrice} ${currency}`.trim();
  }

  function safeExternalImageUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || !hostname || hostname === 'localhost' ||
          hostname.endsWith('.localhost') || hostname.endsWith('.local') || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.startsWith('[')) return '';
      return url.href;
    } catch { return ''; }
  }

  function makeOfferData(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Oferta inválida.');
    const { id, stallId, name, terms = '', images = [], currency, atomic, sellerPubkey, paymentRail, relayHints = [], expiresAt = null } = input;
    if (typeof id !== 'string' || !id || id.length > 256 || typeof stallId !== 'string' || !stallId ||
        typeof name !== 'string' || !name.trim() || name.length > 140 || typeof terms !== 'string' || terms.length > 2000 ||
        !['item', 'service'].includes(input.offerType) || !HEX_64.test(sellerPubkey || '') ||
        paymentRail !== PAYMENT_RAILS[currency] || !Array.isArray(images) || images.length > 1 ||
        !Array.isArray(relayHints) || relayHints.length > 5 ||
        (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 1))) throw new Error('Campos da oferta inválidos.');
    const amount = window.PropertyMoney.validateAtomic(atomic, currency);
    if (images.some(image => typeof image !== 'string' || !safeExternalImageUrl(image))) throw new Error('Imagem da oferta inválida.');
    for (const hint of relayHints) {
      if (typeof hint !== 'string' || hint.length > 2048) throw new Error('Dica de relay inválida.');
      let url;
      try { url = new URL(hint); } catch { throw new Error('Dica de relay inválida.'); }
      if (url.protocol !== 'wss:' || url.username || url.password || !url.hostname) throw new Error('Dica de relay inválida.');
    }
    const exact = window.PropertyMoney.fromAtomic(amount, currency);
    const price = Number(exact);
    const [wholeText, fraction = ''] = exact.split('.');
    const whole = BigInt(wholeText);
    if (!Number.isFinite(price) || whole > BigInt(Number.MAX_SAFE_INTEGER) ||
        (whole === BigInt(Number.MAX_SAFE_INTEGER) && /[1-9]/.test(fraction))) throw new Error('Preço fora do intervalo compatível com a vitrine NIP-15.');
    return Object.freeze({ schema: OFFER_SCHEMA, id, stall_id: stallId, name: name.trim(), description: terms, terms,
      offer_type: input.offerType, seller_pubkey: sellerPubkey, images: [...images], currency, price, price_atomic: amount,
      ...(currency === 'XNO' ? { price_raw: amount } : {}), payment_rail: paymentRail,
      expires_at: expiresAt, relay_hints: [...relayHints], contact_event: null,
      quantity: null, specs: [], shipping: [] });
  }

  function productAddress(event) {
    if (!event || event.kind !== 30018 || !HEX_64.test(event.pubkey || '') || !Array.isArray(event.tags)) return '';
    const ids = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'd');
    return ids.length === 1 && typeof ids[0][1] === 'string' && ids[0][1].length > 0
      ? `30018:${event.pubkey}:${ids[0][1]}` : '';
  }

  function makeProductDeletion(event) {
    const address = productAddress(event);
    if (!address || !HEX_64.test(event.id || '')) return null;
    return Object.freeze({
      kind: 5,
      content: '',
      tags: Object.freeze([Object.freeze(['a', address]), Object.freeze(['e', event.id]), Object.freeze(['k', '30018'])])
    });
  }

  function unexpired(event, nowSeconds) {
    const tags = (event.tags || []).filter(tag => Array.isArray(tag) && tag[0] === 'expiration');
    if (!tags.length) return true;
    if (tags.length !== 1 || typeof tags[0][1] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(tags[0][1])) return false;
    const expiration = Number(tags[0][1]);
    return Number.isSafeInteger(expiration) && expiration > nowSeconds;
  }

  function validProductData(data, d, author) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== d || typeof data.stall_id !== 'string' ||
        !data.stall_id || typeof data.name !== 'string' || !data.name.trim()) return false;
    if (data.schema !== undefined && data.schema !== OFFER_SCHEMA) return false;
    if (data.schema === OFFER_SCHEMA && (data.price_atomic === undefined || data.seller_pubkey !== author || !['item', 'service'].includes(data.offer_type) ||
        typeof data.terms !== 'string' || data.terms !== data.description || data.payment_rail !== PAYMENT_RAILS[data.currency] ||
        !Array.isArray(data.relay_hints) || data.relay_hints.length > 5 ||
        (data.expires_at !== null && !Number.isSafeInteger(data.expires_at)) || data.contact_event !== null)) return false;
    const currency = data.currency;
    if (typeof currency !== 'string' || !Object.hasOwn(window.PropertyMoney.CURRENCIES, currency)) return false;
    const atomic = currency === 'XNO' ? (data.price_atomic ?? data.price_raw) : data.price_atomic;
    try { window.PropertyMoney.validateAtomic(atomic, currency); } catch { return false; }
    if (currency === 'XNO' && data.price_raw !== undefined && data.price_raw !== atomic) return false;
    if (data.schema === OFFER_SCHEMA && currency !== 'XNO' && data.price_raw !== undefined) return false;
    if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0) return false;
    try {
      const exact = window.PropertyMoney.fromAtomic(atomic, currency);
      const [wholeText, fraction = ''] = exact.split('.');
      const whole = BigInt(wholeText);
      if (whole > BigInt(Number.MAX_SAFE_INTEGER) ||
          (whole === BigInt(Number.MAX_SAFE_INTEGER) && /[1-9]/.test(fraction))) return false;
      if (!Object.is(data.price, Number(exact))) return false;
    } catch { return false; }
    return true;
  }

  function selectActiveProducts(events, verifyEvent, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (typeof verifyEvent !== 'function') return [];
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return [];
    const products = new Map();
    const deletions = [];
    for (const event of events || []) {
      if (!event || !unexpired(event, nowSeconds)) continue;
      if (event.kind === 5) { if (!verifyEvent(event)) continue; }
      else {
        try { window.PropertyProtocol.validateEventFamily(event, 'marketplace_offer', verifyEvent, nowSeconds); }
        catch { continue; }
      }
      if (event.kind === 5 && Number.isSafeInteger(event.created_at) && Array.isArray(event.tags)) { deletions.push(event); continue; }
      if (event.kind !== 30018 || !HEX_64.test(event.id || '') || !Number.isSafeInteger(event.created_at) || event.created_at > nowSeconds + 300) continue;
      const address = productAddress(event);
      if (!address) continue;
      try {
        const data = JSON.parse(event.content);
        const d = address.slice(`30018:${event.pubkey}:`.length);
        if (!validProductData(data, d, event.pubkey)) continue;
        if (data.schema === OFFER_SCHEMA) {
          const expirationTags = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'expiration');
          if (data.expires_at === null ? expirationTags.length !== 0 :
              expirationTags.length !== 1 || expirationTags[0][1] !== String(data.expires_at)) continue;
          const invalidRelayHint = data.relay_hints.some(hint => {
            if (typeof hint !== 'string' || hint.length > 2048) return true;
            try { const relay = new URL(hint); return relay.protocol !== 'wss:' || relay.username !== '' || relay.password !== ''; }
            catch { return true; }
          });
          if (invalidRelayHint) continue;
        }
        const current = products.get(address);
        if (!current || event.created_at > current.created_at ||
            (event.created_at === current.created_at && event.id.localeCompare(current.id) < 0)) {
          products.set(address, { ...event, data });
        }
      } catch {}
    }
    return [...products.values()].filter(product => {
      const address = productAddress(product);
      return !deletions.some(deletion => deletion.pubkey === product.pubkey && deletion.created_at >= product.created_at &&
        deletion.tags.some(tag => Array.isArray(tag) &&
          ((tag[0] === 'a' && tag[1] === address) || (tag[0] === 'e' && tag[1] === product.id))));
    }).sort((a, b) => b.created_at - a.created_at);
  }

  window.PropertyMarketplace = Object.freeze({ OFFER_SCHEMA, PAYMENT_RAILS, parsePrice, displayPrice, safeExternalImageUrl,
    makeOfferData, productAddress, makeProductDeletion, selectActiveProducts });
})();
