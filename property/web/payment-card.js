'use strict';
(() => {
  const NETWORKS = Object.freeze({
    BTC: Object.freeze(['mainnet', 'testnet', 'signet']),
    XMR: Object.freeze(['mainnet', 'testnet', 'stagenet']),
    XNO: Object.freeze(['mainnet', 'beta'])
  });
  const MARKER = '[Property payment details v1]';
  const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
  const ADDRESS = /^[A-Za-z0-9_]{10,128}$/u;

  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Payment details are invalid.');
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (!Object.hasOwn(NETWORKS, currency)) throw new Error('Choose BTC, XMR, or XNO.');
    const network = typeof input.network === 'string' ? input.network.trim().toLowerCase() : '';
    if (!NETWORKS[currency].includes(network)) throw new Error('Choose a supported network for this currency.');
    const address = typeof input.address === 'string' ? input.address.trim() : '';
    if (!ADDRESS.test(address)) throw new Error('Enter a single-line wallet address (10–128 letters, numbers, or underscores).');
    let amount = '';
    if (input.amount !== undefined && input.amount !== null && String(input.amount).trim()) {
      const atomic = window.PropertyMoney.toAtomic(String(input.amount).trim(), currency);
      if (BigInt(atomic) === 0n) throw new Error('Enter an amount greater than zero or leave it blank.');
      amount = window.PropertyMoney.fromAtomic(atomic, currency);
    }
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 140 || CONTROL.test(note) || /[\r\n]/u.test(note)) throw new Error('Keep the optional note to one line of up to 140 characters.');
    return Object.freeze({ currency, network, amount, address, note });
  }

  function build(input) {
    const card = validate(input);
    const rows = [MARKER, `Currency: ${card.currency}`, `Network: ${card.network}`];
    if (card.amount) rows.push(`Amount: ${card.amount} ${card.currency}`);
    rows.push(`Address: ${card.address}`);
    if (card.note) rows.push(`Note: ${card.note}`);
    return rows.join('\n');
  }

  function parse(content) {
    if (typeof content !== 'string' || content.length > 512 || !content.startsWith(`${MARKER}\n`)) return null;
    const values = Object.create(null);
    for (const row of content.split('\n').slice(1)) {
      const match = /^(Currency|Network|Amount|Address|Note): (.*)$/u.exec(row);
      if (!match || Object.hasOwn(values, match[1])) return null;
      values[match[1]] = match[2];
    }
    const currency = values.Currency;
    const amountRow = values.Amount;
    let amount = '';
    if (amountRow !== undefined) {
      const match = /^(.+) (BTC|XMR|XNO)$/u.exec(amountRow);
      if (!match || match[2] !== currency) return null;
      amount = match[1];
    }
    if (!Object.hasOwn(values, 'Currency') || !Object.hasOwn(values, 'Network') || !Object.hasOwn(values, 'Address')) return null;
    try {
      const card = validate({ currency, network: values.Network, amount, address: values.Address, note: values.Note || '' });
      return build(card) === content ? card : null;
    } catch { return null; }
  }

  function networkLabel(network) {
    return network.replace(/(^|-)([a-z])/gu, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
  }

  window.PropertyPaymentCard = Object.freeze({ MARKER, NETWORKS, validate, build, parse, networkLabel });
})();
