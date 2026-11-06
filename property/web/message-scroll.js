'use strict';
(() => {
  function isNearBottom({ scrollHeight, scrollTop, clientHeight }, threshold = 72) {
    if (![scrollHeight, scrollTop, clientHeight, threshold].every(Number.isFinite) || threshold < 0) return false;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }

  function classifyUpdate(messages, previousIds, previousLatestCreatedAt) {
    const oldIds = previousIds && typeof previousIds.has === 'function' ? previousIds : new Set();
    const added = messages.filter(message => message && typeof message.id === 'string' && message.id && !oldIds.has(message.id));
    const hasOutgoing = added.some(message => message.direction === 'sent');
    const newest = messages.reduce((latest, message) => Number.isFinite(message?.createdAt)
      ? Math.max(latest, message.createdAt) : latest, Number.NEGATIVE_INFINITY);
    const canCount = Number.isFinite(previousLatestCreatedAt);
    const incomingCount = canCount ? added.filter(message => message.direction !== 'sent'
      && Number.isFinite(message.createdAt) && message.createdAt >= previousLatestCreatedAt).length : 0;
    return {
      incomingCount,
      hasOutgoing,
      latestCreatedAt: Number.isFinite(newest) ? newest : null
    };
  }

  function buttonCopy(count, language = 'en') {
    const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
    if (language === 'pt-BR') {
      if (safeCount === 1) return { text: '↓ 1 nova', ariaLabel: '1 mensagem nova, rolar para o fim' };
      if (safeCount > 1) return { text: `↓ ${safeCount} novas`, ariaLabel: `${safeCount} mensagens novas, rolar para o fim` };
      return { text: '↓', ariaLabel: 'Rolar para o fim' };
    }
    if (safeCount === 1) return { text: '↓ 1 new', ariaLabel: '1 new message, scroll to bottom' };
    if (safeCount > 1) return { text: `↓ ${safeCount} new`, ariaLabel: `${safeCount} new messages, scroll to bottom` };
    return { text: '↓', ariaLabel: 'Scroll to bottom' };
  }

  window.PropertyMessageScroll = Object.freeze({ isNearBottom, classifyUpdate, buttonCopy });
})();
