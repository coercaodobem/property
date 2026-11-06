'use strict';
(() => {
  function dayStart(timestamp) {
    if (!Number.isFinite(timestamp)) return NaN;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return NaN;
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function nextDayStart(timestamp) {
    const start = dayStart(timestamp);
    if (!Number.isFinite(start)) return NaN;
    const date = new Date(start);
    date.setDate(date.getDate() + 1);
    return date.getTime();
  }

  function dateTime(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dayLabel(timestamp, now = Date.now(), language = 'en') {
    const day = dayStart(timestamp);
    const today = dayStart(now);
    if (!Number.isFinite(day) || !Number.isFinite(today)) return '';
    if (day === today) return language === 'pt-BR' ? 'Hoje' : 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (day === yesterday.getTime()) return language === 'pt-BR' ? 'Ontem' : 'Yesterday';
    const currentYear = new Date(today).getFullYear();
    const date = new Date(day);
    const locale = language === 'pt-BR' ? 'pt-BR' : 'en';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long',
      ...(date.getFullYear() !== currentYear ? { year: 'numeric' } : {})
    }).format(date);
  }

  window.PropertyMessageDays = Object.freeze({ dateTime, dayLabel, dayStart, nextDayStart });
})();
