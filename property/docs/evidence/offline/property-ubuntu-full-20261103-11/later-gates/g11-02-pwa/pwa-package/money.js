'use strict';
(() => {
  const CURRENCIES = Object.freeze({
    BTC: Object.freeze({ decimals: 8, unit: 'satoshi', max: '2100000000000000' }),
    XNO: Object.freeze({ decimals: 30, unit: 'raw', max: ((1n << 128n) - 1n).toString() }),
    XMR: Object.freeze({ decimals: 12, unit: 'piconero', max: ((1n << 64n) - 1n).toString() })
  });
  function specification(currency) {
    if (!Object.hasOwn(CURRENCIES, currency)) throw new Error('Escolha BTC, XMR ou XNO.');
    return CURRENCIES[currency];
  }
  function validateAtomic(value, currency) {
    const spec = specification(currency);
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 39 || BigInt(value) > BigInt(spec.max)) {
      throw new Error('Valor atômico inválido ou fora do limite da moeda.');
    }
    return value;
  }
  function toAtomic(value, currency) {
    const spec = specification(currency);
    if (typeof value !== 'string' || value.length > 80) throw new Error('Informe o valor como texto decimal.');
    const match = /^(\d+)(?:[.,](\d+))?$/.exec(value.trim());
    if (!match || (match[2] || '').length > spec.decimals) throw new Error(`Valor ${currency} inválido: use até ${spec.decimals} casas decimais.`);
    const scale = 10n ** BigInt(spec.decimals);
    return validateAtomic((BigInt(match[1]) * scale + BigInt((match[2] || '').padEnd(spec.decimals, '0'))).toString(), currency);
  }
  function fromAtomic(value, currency) {
    const { decimals } = specification(currency);
    const amount = BigInt(validateAtomic(value, currency));
    const scale = 10n ** BigInt(decimals);
    const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${amount / scale}${fraction ? `.${fraction}` : ''}`;
  }
  window.PropertyMoney = Object.freeze({ CURRENCIES, toAtomic, fromAtomic, validateAtomic });
})();
