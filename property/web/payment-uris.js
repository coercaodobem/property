'use strict';
(() => {
  const MONERO_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const MONERO_NETWORKS = Object.freeze({
    18: 'mainnet', 19: 'mainnet', 42: 'mainnet',
    53: 'testnet', 54: 'testnet', 63: 'testnet',
    24: 'stagenet', 25: 'stagenet', 36: 'stagenet'
  });
  const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function encode(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/gu, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  function query(entries) {
    const values = entries.filter(([, value]) => value !== '');
    return values.length ? `?${values.map(([key, value]) => `${key}=${encode(value)}`).join('&')}` : '';
  }

  function moneroNetwork(address) {
    if (typeof address !== 'string' || ![95, 106].includes(address.length) ||
        !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/u.test(address)) return null;
    let firstBlock = 0n;
    for (const character of address.slice(0, 11)) {
      const digit = MONERO_BASE58.indexOf(character);
      if (digit < 0) return null;
      firstBlock = firstBlock * 58n + BigInt(digit);
    }
    if (firstBlock > 0xffffffffffffffffn) return null;
    return MONERO_NETWORKS[Number((firstBlock >> 56n) & 255n)] || null;
  }

  function exactAmount(card) {
    if (!card.amount) return '';
    const atomic = window.PropertyMoney.toAtomic(card.amount, card.currency);
    return window.PropertyMoney.fromAtomic(atomic, card.currency);
  }

  function optionalText(value, maxLength) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') fail('invalid-text', 'Payment text fields must be plain text.');
    const text = value.trim();
    if (text.length > maxLength || CONTROL.test(text) || /[\r\n]/u.test(text)) {
      fail('invalid-text', 'Payment text fields must be a single line within the supported limit.');
    }
    return text;
  }

  function optionalMoneroPaymentId(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || !/^[0-9a-f]{16}$/iu.test(value)) {
      fail('invalid-payment-id', 'A Monero payment ID must contain exactly 16 hexadecimal characters.');
    }
    return value.toLowerCase();
  }

  function build(input) {
    const card = window.PropertyPaymentCard.validate(input);
    const amount = exactAmount(card);
    const label = optionalText(input.label, 140);
    const recipientName = optionalText(input.recipientName, 140);
    const paymentId = optionalMoneroPaymentId(input.paymentId);
    if (paymentId && card.currency !== 'XMR') fail('payment-id-currency', 'A Monero payment ID cannot be used with another currency.');
    const note = card.note;
    let uri;

    if (card.currency === 'BTC') {
      const mainnetBase58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(card.address);
      const lowerAddress = card.address.toLowerCase();
      const uniformCase = card.address === card.address.toUpperCase() || card.address === lowerAddress;
      const mainnetSegwit = uniformCase && /^bc1[023456789acdefghjklmnpqrstuvwxyz]{10,87}$/u.test(lowerAddress);
      const testnetSegwit = uniformCase && /^tb1[023456789acdefghjklmnpqrstuvwxyz]{10,87}$/u.test(lowerAddress);
      if (card.network === 'signet') fail('network-ambiguous', 'Bitcoin Signet and Testnet share address formats, so a wallet link cannot preserve the selected network.');
      let path = '';
      const params = [['amount', amount], ['label', label], ['message', note]];
      if (card.network === 'mainnet' && (mainnetBase58 || mainnetSegwit)) path = card.address;
      else if (card.network === 'testnet' && testnetSegwit) params.unshift(['tb', card.address]);
      else fail('address-network-mismatch', 'The Bitcoin address format does not match the selected network.');
      uri = `bitcoin:${path}${query(params)}`;
    } else if (card.currency === 'XMR') {
      if (moneroNetwork(card.address) !== card.network) fail('address-network-mismatch', 'The Monero address format does not match the selected network.');
      uri = `monero:${card.address}${query([['tx_payment_id', paymentId], ['tx_amount', amount], ['recipient_name', recipientName], ['tx_description', note]])}`;
    } else if (card.currency === 'XNO') {
      if (card.network !== 'mainnet') fail('network-ambiguous', 'Nano payment links do not identify the Beta network.');
      if (!/^nano_[13456789abcdefghijkmnopqrstuwxyz]{60}$/u.test(card.address)) {
        fail('invalid-address', 'The Nano address format is not recognized.');
      }
      const raw = amount ? window.PropertyMoney.toAtomic(amount, 'XNO') : '';
      uri = `nano:${card.address}${query([['amount', raw], ['message', note]])}`;
    } else {
      fail('unsupported-currency', 'This currency does not have a supported wallet URI.');
    }

    return Object.freeze({
      currency: card.currency,
      network: card.network,
      address: card.address,
      amount,
      amountIncluded: Boolean(amount),
      ...(paymentId ? { paymentId } : {}),
      uri
    });
  }

  function decodeComponent(value) {
    if (/%(?![0-9a-f]{2})/iu.test(value)) return null;
    try {
      const decoded = decodeURIComponent(value.replace(/\+/gu, ' '));
      return CONTROL.test(decoded) ? null : decoded;
    } catch { return null; }
  }

  function parse(uri) {
    if (typeof uri !== 'string' || uri.length > 2048 || uri !== uri.trim() || CONTROL.test(uri)) return null;
    const match = /^(bitcoin|monero):([^?#]*)(?:\?([^#]*))?$/iu.exec(uri);
    if (!match || uri.includes('#') || (uri.endsWith('?') && match[3] === '')) return null;
    const scheme = match[1].toLowerCase();
    const path = decodeComponent(match[2]);
    if (path === null) return null;
    const values = new Map();
    const queryText = match[3] || '';
    if (queryText) {
      for (const part of queryText.split('&')) {
        const separator = part.indexOf('=');
        if (separator <= 0) return null;
        const key = decodeComponent(part.slice(0, separator));
        const value = decodeComponent(part.slice(separator + 1));
        if (key === null || value === null || !key || values.has(key.toLowerCase())) return null;
        values.set(key.toLowerCase(), value);
      }
    }

    let input;
    let extra = {};
    if (scheme === 'bitcoin') {
      const allowed = new Set(['amount', 'label', 'message', 'tb']);
      if ([...values.keys()].some(key => !allowed.has(key))) return null;
      const hasTestnetAddress = values.has('tb');
      if ((hasTestnetAddress && path) || (!hasTestnetAddress && !path) || (values.has('amount') && !values.get('amount'))) return null;
      const address = hasTestnetAddress ? values.get('tb') : path;
      let label;
      try { label = optionalText(values.get('label'), 140); } catch { return null; }
      input = {
        currency: 'BTC', network: hasTestnetAddress ? 'testnet' : 'mainnet', address,
        amount: values.get('amount') || '', note: values.get('message') || ''
      };
      if (label) extra.label = label;
    } else {
      const allowed = new Set(['tx_amount', 'tx_description', 'recipient_name', 'tx_payment_id']);
      if ([...values.keys()].some(key => !allowed.has(key)) || !path || (values.has('tx_amount') && !values.get('tx_amount'))) return null;
      const network = moneroNetwork(path);
      if (!network) return null;
      input = {
        currency: 'XMR', network, address: path,
        amount: values.get('tx_amount') || '', note: values.get('tx_description') || ''
      };
      let recipientName;
      try { recipientName = optionalText(values.get('recipient_name'), 140); } catch { return null; }
      if (recipientName) extra.recipientName = recipientName;
      if (values.has('tx_payment_id')) {
        try { extra.paymentId = optionalMoneroPaymentId(values.get('tx_payment_id')); } catch { return null; }
      }
    }

    try {
      const card = window.PropertyPaymentCard.validate(input);
      build({ ...card, ...extra });
      return Object.freeze({ ...card, ...extra, source: 'wallet-uri' });
    } catch { return null; }
  }

  window.PropertyPaymentUris = Object.freeze({ build, moneroNetwork, parse });
})();
