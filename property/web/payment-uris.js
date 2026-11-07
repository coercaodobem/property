'use strict';
(() => {
  const MONERO_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const MONERO_NETWORKS = Object.freeze({
    18: 'mainnet', 19: 'mainnet', 42: 'mainnet',
    53: 'testnet', 54: 'testnet', 63: 'testnet',
    24: 'stagenet', 25: 'stagenet', 36: 'stagenet'
  });

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

  function build(input) {
    const card = window.PropertyPaymentCard.validate(input);
    const amount = exactAmount(card);
    const label = card.note;
    let uri;

    if (card.currency === 'BTC') {
      const mainnetBase58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(card.address);
      const lowerAddress = card.address.toLowerCase();
      const uniformCase = card.address === card.address.toUpperCase() || card.address === lowerAddress;
      const mainnetSegwit = uniformCase && /^bc1[023456789acdefghjklmnpqrstuvwxyz]{10,87}$/u.test(lowerAddress);
      const testnetSegwit = uniformCase && /^tb1[023456789acdefghjklmnpqrstuvwxyz]{10,87}$/u.test(lowerAddress);
      if (card.network === 'signet') fail('network-ambiguous', 'Bitcoin Signet and Testnet share address formats, so a wallet link cannot preserve the selected network.');
      let path = '';
      const params = [['amount', amount], ['message', label]];
      if (card.network === 'mainnet' && (mainnetBase58 || mainnetSegwit)) path = card.address;
      else if (card.network === 'testnet' && testnetSegwit) params.unshift(['tb', card.address]);
      else fail('address-network-mismatch', 'The Bitcoin address format does not match the selected network.');
      uri = `bitcoin:${path}${query(params)}`;
    } else if (card.currency === 'XMR') {
      if (moneroNetwork(card.address) !== card.network) fail('address-network-mismatch', 'The Monero address format does not match the selected network.');
      uri = `monero:${card.address}${query([['tx_amount', amount], ['tx_description', label]])}`;
    } else if (card.currency === 'XNO') {
      if (card.network !== 'mainnet') fail('network-ambiguous', 'Nano payment links do not identify the Beta network.');
      if (!/^nano_[13456789abcdefghijkmnopqrstuwxyz]{60}$/u.test(card.address)) {
        fail('invalid-address', 'The Nano address format is not recognized.');
      }
      const raw = amount ? window.PropertyMoney.toAtomic(amount, 'XNO') : '';
      uri = `nano:${card.address}${query([['amount', raw], ['message', label]])}`;
    } else {
      fail('unsupported-currency', 'This currency does not have a supported wallet URI.');
    }

    return Object.freeze({
      currency: card.currency,
      network: card.network,
      address: card.address,
      amount,
      amountIncluded: Boolean(amount),
      uri
    });
  }

  window.PropertyPaymentUris = Object.freeze({ build, moneroNetwork });
})();
