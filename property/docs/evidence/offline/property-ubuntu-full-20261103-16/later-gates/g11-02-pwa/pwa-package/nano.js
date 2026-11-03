'use strict';
/* global BigInt */
(() => {
  const RAW_PER_XNO = 10n ** 30n;

  function xnoToRaw(value) {
    if (typeof value !== 'string') throw new Error('Informe XNO como texto decimal.');
    const normalized = value.trim().replace(',', '.');
    const match = normalized.match(/^(\d+)(?:\.(\d{1,30}))?$/);
    if (!match) throw new Error('Valor XNO inválido: use até 30 casas decimais, sem sinal ou expoente.');
    const whole = BigInt(match[1]);
    const fractional = BigInt((match[2] || '').padEnd(30, '0') || '0');
    return (whole * RAW_PER_XNO + fractional).toString();
  }

  function rawToXno(value) {
    const normalized = typeof value === 'bigint' ? value.toString() : value;
    if (typeof normalized !== 'string' || !/^(0|[1-9]\d*)$/.test(normalized)) {
      throw new Error('Raw deve ser um inteiro decimal não negativo.');
    }
    const raw = BigInt(normalized);
    const whole = raw / RAW_PER_XNO;
    const fractional = (raw % RAW_PER_XNO).toString().padStart(30, '0').replace(/0+$/, '');
    return fractional ? `${whole}.${fractional}` : whole.toString();
  }

  window.PropertyNanoUnits = Object.freeze({ RAW_PER_XNO: RAW_PER_XNO.toString(), xnoToRaw, rawToXno });
})();
