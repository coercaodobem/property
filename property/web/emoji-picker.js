'use strict';
(() => {
  const DATA_PATH = './vendor/emoji-data-15.json';
  const RECENT_MAX = 24;
  const MAX_RESULTS = 180;
  const CATEGORY_ICONS = Object.freeze({
    people: '😀', nature: '🐻', foods: '🍎', activity: '⚽',
    places: '🚗', objects: '💡', symbols: '❤️', flags: '🏳️'
  });
  const CATEGORY_NAMES = Object.freeze({
    people: ['Smileys & people', 'Carinhas e pessoas'],
    nature: ['Animals & nature', 'Animais e natureza'],
    foods: ['Food & drink', 'Comidas e bebidas'],
    activity: ['Activities', 'Atividades'],
    places: ['Travel & places', 'Viagens e lugares'],
    objects: ['Objects', 'Objetos'],
    symbols: ['Symbols', 'Símbolos'],
    flags: ['Flags', 'Bandeiras'],
    recent: ['Recently used', 'Usados recentemente'],
    search: ['Search results', 'Resultados da busca']
  });
  const SKIN_NAMES = [
    ['Default', 'Padrão'], ['Light', 'Clara'], ['Medium-light', 'Morena clara'],
    ['Medium', 'Morena'], ['Medium-dark', 'Morena escura'], ['Dark', 'Escura']
  ];
  const SKIN_ICONS = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];
  const PT_SEARCH_TERMS = Object.freeze({
    feliz: ['happy', 'smile', 'joy'], sorriso: ['smile', 'grin'], carinha: ['face', 'smile'],
    amor: ['love', 'heart'], coracao: ['heart', 'love'], triste: ['sad', 'cry'],
    choro: ['cry', 'sad'], gato: ['cat'], cachorro: ['dog'], comida: ['food'],
    bebida: ['drink'], cafe: ['coffee'], festa: ['party'], beijo: ['kiss'],
    fogo: ['fire'], dinheiro: ['money'], sol: ['sun'], lua: ['moon'],
    casa: ['house', 'home'], carro: ['car', 'automobile'], flor: ['flower'],
    obrigado: ['thanks', 'thank'], parabens: ['birthday', 'congratulations'],
    risada: ['laugh', 'joy'], musica: ['music'], coracaozinho: ['heart']
  });
  const VERSIONS = [[15, '🫨'], [14, '🫠'], [13.1, '😶‍🌫️'], [13, '🥸'], [12.1, '🧑‍🦰'], [12, '🥱'], [11, '🥰'], [5, '🤩'], [4, '👱‍♀️'], [3, '🤣'], [2, '👋🏻'], [1, '🙃']];
  let dataPromise = null;

  function language() { return window.PropertyI18n?.language === 'pt-BR' ? 'pt-BR' : 'en'; }
  function text(en, pt) { return language() === 'pt-BR' ? pt : en; }
  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  }
  function withSkin(emoji, tone = 0) {
    const skins = emoji?.skins;
    return Array.isArray(skins) && skins.length ? (skins[tone] || skins[0]) : '';
  }
  function catalogFrom(raw, options = {}) {
    if (!raw || !Array.isArray(raw.categories) || !raw.emojis || typeof raw.emojis !== 'object') {
      throw new TypeError('Invalid bundled emoji data.');
    }
    const maxVersion = Number.isFinite(options.maxVersion) ? options.maxVersion : Infinity;
    const flagsSupported = options.flagsSupported !== false;
    const categories = raw.categories.map(category => ({
      id: String(category.id),
      emojis: (Array.isArray(category.emojis) ? category.emojis : []).flatMap(id => {
        const source = raw.emojis[id];
        if (!source || !Array.isArray(source.skins) || Number(source.version) > maxVersion) return [];
        const skins = source.skins.map(skin => typeof skin?.native === 'string' ? skin.native : '').filter(Boolean);
        if (!skins.length || (!flagsSupported && category.id === 'flags' && /[\u{1F1E6}-\u{1F1FF}]/u.test(skins[0]))) return [];
        return [{
          id: String(source.id || id),
          name: String(source.name || id),
          version: Number(source.version) || 0,
          skins,
          search: [String(source.id || id).replace(/[-_]/g, ' '), String(source.name || ''), ...(source.keywords || []), ...(source.emoticons || [])].join(',').toLowerCase()
        }];
      })
    })).filter(category => category.emojis.length);
    const all = categories.flatMap(category => category.emojis);
    const byNative = new Map();
    for (const emoji of all) for (const native of emoji.skins) byNative.set(native, emoji);
    return Object.freeze({ categories, all, byNative });
  }
  function searchEmoji(catalog, query, locale = 'en') {
    const words = fold(query).split(/\s+/u).filter(Boolean);
    if (!words.length || !catalog?.all) return [];
    const matches = [];
    for (const emoji of catalog.all) {
      let score = 0;
      let matched = true;
      for (const word of words) {
        const alternatives = locale === 'pt-BR' ? PT_SEARCH_TERMS[word] || [] : [];
        const terms = [word, ...alternatives];
        const at = terms.map(term => emoji.search.indexOf(term)).find(index => index >= 0);
        if (at === undefined) { matched = false; break; }
        score += at;
      }
      if (matched) matches.push({ emoji, score });
    }
    return matches.sort((a, b) => a.score - b.score || a.emoji.name.localeCompare(b.emoji.name)).slice(0, MAX_RESULTS).map(item => item.emoji);
  }
  function insertAtSelection(value, start, end, addition, maxLength = 4000) {
    const current = String(value ?? '');
    const from = Math.max(0, Math.min(current.length, Number.isInteger(start) ? start : current.length));
    const to = Math.max(from, Math.min(current.length, Number.isInteger(end) ? end : from));
    const inserted = String(addition ?? '');
    const next = current.slice(0, from) + inserted + current.slice(to);
    if (Number.isSafeInteger(maxLength) && maxLength > 0 && next.length > maxLength) return null;
    const caret = from + inserted.length;
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }
  function supportsColorEmoji(sample) {
    let context = null;
    try { context = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); } catch { return undefined; }
    if (!context || typeof context.getImageData !== 'function') return undefined;
    const width = 20, height = 25;
    context.canvas.width = width * 2;
    context.canvas.height = height;
    context.font = Math.floor(height / 2) + 'px Arial, Sans-Serif';
    context.textBaseline = 'top';
    context.clearRect(0, 0, width * 2, height);
    context.fillStyle = '#ff0000';
    context.fillText(sample, 0, 22);
    context.fillStyle = '#0000ff';
    context.fillText(sample, width, 22);
    const first = context.getImageData(0, 0, width, height).data;
    let at = 0;
    for (; at < first.length && !first[at + 3]; at += 4) {}
    if (at >= first.length) return false;
    const second = context.getImageData(width + ((at / 4) % width), Math.floor((at / 4) / width), 1, 1).data;
    if (first[at] !== second[0] || first[at + 2] !== second[2]) return false;
    return context.measureText(sample).width < width;
  }
  function supportedData(raw) {
    const maxVersion = VERSIONS.find(([version, sample]) => supportsColorEmoji(sample) !== false)?.[0] ?? Infinity;
    const flagsSupported = supportsColorEmoji('🇨🇦') !== false;
    return catalogFrom(raw, { maxVersion, flagsSupported });
  }
  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_PATH).then(response => {
        if (!response.ok) throw new Error('Could not load the bundled emoji data.');
        return response.json();
      }).then(supportedData).catch(error => { dataPromise = null; throw error; });
    }
    return dataPromise;
  }
  function recentKey(owner) { return 'property_emoji_recent_' + (String(owner || 'anonymous').toLowerCase()); }
  function readRecent(owner, catalog) {
    try {
      const values = JSON.parse(localStorage.getItem(recentKey(owner)) || '[]');
      return Array.isArray(values) ? values.filter(value => typeof value === 'string' && catalog.byNative.has(value)).slice(0, RECENT_MAX) : [];
    } catch { return []; }
  }
  function remember(owner, native, catalog) {
    const values = [native, ...readRecent(owner, catalog).filter(value => value !== native)].slice(0, RECENT_MAX);
    try { localStorage.setItem(recentKey(owner), JSON.stringify(values)); } catch {}
    return values;
  }
  function init(options = {}) {
    const toggle = document.getElementById('emoji-picker-button');
    const panel = document.getElementById('emoji-picker-panel');
    const search = document.getElementById('emoji-picker-search');
    const categoryBar = document.getElementById('emoji-picker-categories');
    const grid = document.getElementById('emoji-picker-grid');
    const toneSelect = document.getElementById('emoji-picker-tone');
    const status = document.getElementById('emoji-picker-status');
    const input = document.getElementById('message-input');
    const closeButton = document.getElementById('emoji-picker-close');
    const reactionDialog = document.getElementById('reaction-emoji-dialog');
    const reactionMount = document.getElementById('reaction-emoji-mount');
    if (!toggle || !panel || !search || !categoryBar || !grid || !toneSelect || !status || !input || !closeButton) return null;

    let catalog = null, activeCategory = 'people', tone = 0;
    let reactionSelection = null, panelOrigin = null;
    const owner = () => typeof options.owner === 'function' ? options.owner() : '';
    const isOpen = () => !panel.classList.contains('hidden');
    function announce(message) { status.textContent = message; }
    function readTone() {
      try {
        const saved = Number(localStorage.getItem('property_emoji_skin_' + String(owner() || 'anonymous').toLowerCase()));
        tone = Number.isInteger(saved) && saved >= 0 && saved <= 5 ? saved : 0;
      } catch { tone = 0; }
      toneSelect.value = String(tone);
    }
    function buttonForEmoji(emoji, native) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emoji-picker-cell';
      button.dataset.emoji = native || withSkin(emoji, tone);
      button.textContent = button.dataset.emoji;
      button.title = emoji.name;
      button.setAttribute('aria-label', emoji.name + ' ' + button.dataset.emoji);
      return button;
    }
    function appendSection(target, id, title, emojis, recentNatives = null) {
      if (!emojis.length) return null;
      const section = document.createElement('section');
      section.className = 'emoji-picker-section';
      section.dataset.section = id;
      const heading = document.createElement('h3');
      heading.textContent = title;
      const cells = document.createElement('div');
      cells.className = 'emoji-picker-grid';
      cells.setAttribute('role', 'group');
      cells.setAttribute('aria-label', title);
      emojis.forEach((emoji, index) => {
        const button = buttonForEmoji(emoji, recentNatives ? recentNatives[index] : '');
        button.tabIndex = index === 0 ? 0 : -1;
        cells.append(button);
      });
      section.append(heading, cells);
      target.append(section);
      return section;
    }
    function localizedCategory(id) {
      const names = CATEGORY_NAMES[id] || [id, id];
      return language() === 'pt-BR' ? names[1] : names[0];
    }
    function renderCategoryBar(recent) {
      categoryBar.replaceChildren();
      const entries = [...(recent.length ? ['recent'] : []), ...catalog.categories.map(category => category.id)];
      for (const id of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'emoji-picker-category';
        button.dataset.category = id;
        button.textContent = id === 'recent' ? '◷' : (CATEGORY_ICONS[id] || '•');
        button.title = localizedCategory(id);
        button.setAttribute('aria-label', localizedCategory(id));
        button.setAttribute('aria-pressed', String(id === activeCategory && !search.value.trim()));
        categoryBar.append(button);
      }
      categoryBar.setAttribute('aria-label', text('Emoji categories', 'Categorias de emoji'));
    }
    function render() {
      if (!catalog) return;
      const query = search.value.trim();
      const recent = readRecent(owner(), catalog);
      renderCategoryBar(recent);
      grid.replaceChildren();
      if (query) {
        const results = searchEmoji(catalog, query, language());
        appendSection(grid, 'search', localizedCategory('search'), results);
        announce(results.length ? text(results.length + ' emoji results', results.length + ' resultados de emoji') : text('No matching emoji.', 'Nenhum emoji correspondente.'));
        return;
      }
      if (recent.length) {
        appendSection(grid, 'recent', localizedCategory('recent'), recent.map(native => catalog.byNative.get(native)), recent);
      }
      for (const category of catalog.categories) appendSection(grid, category.id, localizedCategory(category.id), category.emojis);
      announce(text('Choose an emoji. It stays in your draft until you send.', 'Escolha um emoji. Ele fica no rascunho até você enviar.'));
      if (!catalog.categories.some(category => category.id === activeCategory)) activeCategory = catalog.categories[0]?.id || 'people';
      const activeButton = [...categoryBar.children].find(button => button.dataset.category === activeCategory);
      if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
    }
    function prepareOpen(focusSearch = false) {
      readTone();
      if (catalog) render();
      else {
        grid.replaceChildren();
        announce(text('Loading emoji…', 'Carregando emojis…'));
        loadData().then(result => { catalog = result; render(); }).catch(() => {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'button secondary';
          retry.textContent = text('Retry', 'Tentar novamente');
          retry.addEventListener('click', () => { dataPromise = null; prepareOpen(true); });
          grid.replaceChildren(retry);
          announce(text('The bundled emoji data could not be loaded.', 'Não foi possível carregar os emojis incluídos no app.'));
        });
      }
      if (focusSearch) search.focus({ preventScroll: true });
    }
    function closeReactionPicker(restoreFocus = true) {
      const active = reactionSelection;
      reactionSelection = null;
      panel.classList.add('hidden');
      panel.classList.remove('emoji-picker-panel-dialog');
      if (reactionDialog?.open) reactionDialog.close();
      if (panelOrigin) {
        const { parent, nextSibling } = panelOrigin;
        if (parent?.isConnected) parent.insertBefore(panel, nextSibling?.parentNode === parent ? nextSibling : null);
        panelOrigin = null;
      }
      active?.trigger?.setAttribute('aria-expanded', 'false');
      if (restoreFocus && active?.trigger?.isConnected) active.trigger.focus({ preventScroll: true });
    }
    function openForReaction({ trigger, onPick } = {}) {
      if (!reactionDialog || !reactionMount || typeof onPick !== 'function') return false;
      if (reactionSelection) closeReactionPicker(false);
      panelOrigin = { parent: panel.parentNode, nextSibling: panel.nextSibling };
      reactionSelection = { trigger, onPick };
      search.value = '';
      activeCategory = 'people';
      reactionMount.append(panel);
      panel.classList.add('emoji-picker-panel-dialog');
      panel.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'false');
      trigger?.setAttribute('aria-expanded', 'true');
      reactionDialog.showModal();
      prepareOpen(true);
      return true;
    }
    function setOpen(open, focusSearch = false) {
      if (!open && reactionSelection) { closeReactionPicker(); return; }
      panel.classList.toggle('hidden', !open);
      toggle.setAttribute('aria-expanded', String(open));
      if (!open) {
        toggle.focus();
        return;
      }
      prepareOpen(focusSearch);
    }
    function scrollToCategory(id) {
      if (search.value) { search.value = ''; render(); }
      activeCategory = id;
      const section = [...grid.querySelectorAll('[data-section]')].find(item => item.dataset.section === id);
      if (section) grid.scrollTop = section.offsetTop - grid.offsetTop;
      renderCategoryBar(readRecent(owner(), catalog));
      const activeButton = [...categoryBar.children].find(button => button.dataset.category === id);
      if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
    }
    function insertEmoji(native) {
      if (reactionSelection) {
        if (!catalog?.byNative.has(native)) return false;
        const active = reactionSelection;
        remember(owner(), native, catalog);
        closeReactionPicker(true);
        Promise.resolve().then(() => active.onPick(native)).catch(error => options.onError?.(error));
        return true;
      }
      const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
      const insertion = insertAtSelection(input.value, start, end, native, input.maxLength);
      if (!insertion) {
        announce(text('This message has reached its character limit.', 'A mensagem atingiu o limite de caracteres.'));
        return false;
      }
      input.value = insertion.value;
      input.setSelectionRange(insertion.selectionStart, insertion.selectionEnd);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      remember(owner(), native, catalog);
      render();
      const selected = [...grid.querySelectorAll('[data-emoji]')].find(button => button.dataset.emoji === native);
      if (selected) selected.focus();
      announce(text('Emoji added to your draft.', 'Emoji adicionado ao rascunho.'));
      return true;
    }
    function gridKeydown(event) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const current = event.target.closest('[data-emoji]');
      if (!current) return;
      const cells = [...grid.querySelectorAll('[data-emoji]')];
      const at = cells.indexOf(current);
      if (at < 0) return;
      const columns = Math.max(1, Math.floor(current.parentElement.getBoundingClientRect().width / 46));
      const rtl = getComputedStyle(current.parentElement).direction === 'rtl';
      const delta = {
        ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1,
        ArrowUp: -columns, ArrowDown: columns,
        Home: -at, End: cells.length - at - 1
      }[event.key];
      event.preventDefault();
      cells[Math.max(0, Math.min(cells.length - 1, at + delta))]?.focus();
    }
    toggle.addEventListener('click', event => setOpen(!isOpen(), event.detail === 0));
    closeButton.addEventListener('click', () => {
      if (reactionSelection) closeReactionPicker();
      else { setOpen(false); input.focus(); }
    });
    document.getElementById('reaction-emoji-close')?.addEventListener('click', () => closeReactionPicker());
    reactionDialog?.addEventListener('cancel', event => { event.preventDefault(); closeReactionPicker(); });
    reactionDialog?.addEventListener('click', event => { if (event.target === reactionDialog) closeReactionPicker(); });
    search.addEventListener('input', render);
    toneSelect.innerHTML = '';
    SKIN_NAMES.forEach((names, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = SKIN_ICONS[index] + ' ' + (language() === 'pt-BR' ? names[1] : names[0]);
      toneSelect.append(option);
    });
    readTone();
    toneSelect.addEventListener('change', () => {
      tone = Math.max(0, Math.min(5, Number(toneSelect.value) || 0));
      try { localStorage.setItem('property_emoji_skin_' + String(owner() || 'anonymous').toLowerCase(), String(tone)); } catch {}
      render();
    });
    categoryBar.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (button) scrollToCategory(button.dataset.category);
    });
    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-emoji]');
      if (button) insertEmoji(button.dataset.emoji);
    });
    grid.addEventListener('keydown', gridKeydown);
    grid.addEventListener('scroll', () => {
      if (!catalog || search.value.trim()) return;
      const sections = [...grid.querySelectorAll('[data-section]')];
      const firstVisible = sections.filter(section => section.offsetTop <= grid.scrollTop + 10).at(-1);
      if (!firstVisible || firstVisible.dataset.section === 'recent') return;
      activeCategory = firstVisible.dataset.section;
      renderCategoryBar(readRecent(owner(), catalog));
      const activeButton = [...categoryBar.children].find(button => button.dataset.category === activeCategory);
      if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
    });
    document.addEventListener('keydown', event => {
      if (isOpen() && event.key === 'Escape') {
        event.preventDefault();
        if (reactionSelection) closeReactionPicker();
        else { setOpen(false); input.focus(); }
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!reactionSelection && isOpen() && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
    });
    document.getElementById('language-picker')?.addEventListener('change', () => {
      if (catalog) render();
      const selectedTone = Number(toneSelect.value) || 0;
      toneSelect.replaceChildren();
      SKIN_NAMES.forEach((names, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = SKIN_ICONS[index] + ' ' + (language() === 'pt-BR' ? names[1] : names[0]);
        toneSelect.append(option);
      });
      toneSelect.value = String(selectedTone);
      categoryBar.setAttribute('aria-label', text('Emoji categories', 'Categorias de emoji'));
    });
    return Object.freeze({ close: () => setOpen(false), refresh: render, openForReaction });
  }

  function supportsEmoji(native) { return loadData().then(catalog => catalog.byNative.has(String(native))); }

  window.PropertyEmojiPicker = Object.freeze({ init, catalogFrom, searchEmoji, withSkin, insertAtSelection, supportsEmoji });
})();
