'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const PUBLIC_RELAY_EXAMPLES = ['wss://relay.damus.io', 'wss://nos.lol'];
  // Stable legacy database ID: preserve existing identities and sessions on this origin.
  const DB_NAME = 'liberdade-local-v1';
  const DB_VERSION = 1;
  const Vault = window.PropertyVault;
  const Routing = window.PropertyNostrRouting;
  const Bridge = window.PropertyRelayBridge;
  const Nano = window.PropertyNanoUnits;
  const Money = window.PropertyMoney;
  const Marketplace = window.PropertyMarketplace;
  const Campaigns = window.PropertyCampaigns;
  const Contact = window.PropertyContact;
  const eventSourceHints = new WeakMap();
  const state = {
    db: null, account: null, secret: null, pubkey: '', npub: '', relays: [],
    inboxRelays: [], peerInboxRelays: new Map(), peerRelayHints: new Map(),
    sockets: new Map(), fetchSubs: new Map(), pendingAcks: new Map(), activePeer: '',
    activeView: 'messages', toastTimer: 0, reconnectTimers: new Map(), unlocking: false, idleTimer: 0,
    bridgeEnabled: false, bridgeSubscriptions: new Map(), editingProduct: null, deletingProduct: null
  };
  const N = window.NostrTools;
  const bridge = Bridge?.createBridge(event => N.verifyEvent(event));

  function showToast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }
  function showError(id, message = '') { $(id).textContent = message; }
  function showAuthPane(name) {
    for (const pane of ['auth-choice', 'auth-setup', 'auth-import']) $(pane).classList.toggle('hidden', pane !== name);
    showError('auth-error'); showError('setup-error'); showError('import-error');
  }
  function setConnectionStatus() {
    const open = [...state.sockets.values()].filter(item => item.socket.readyState === WebSocket.OPEN).length;
    const relayCount = effectiveRelayUrls().length;
    const dot = $('connection-dot');
    dot.classList.toggle('live', open > 0 && open === relayCount);
    dot.classList.toggle('partial', open > 0 && open < relayCount);
    $('connection-label').textContent = open === 0 ? 'offline' : `${open}/${relayCount} relay${relayCount === 1 ? '' : 's'}`;
    $('relay-count').textContent = `${state.relays.length} relay${state.relays.length === 1 ? '' : 's'}`;
    $('relay-summary-text').textContent = open ? `${open} conectado${open === 1 ? '' : 's'}` : relayCount === 0 ? 'Adicione um relay para sincronizar' : 'Toque para configurar';
  }
  function updateLockedBridgeStatus() {
    const status = $('locked-node-status');
    if (!status) return;
    status.classList.toggle('hidden', !state.bridgeEnabled);
    const connected = [...state.sockets.values()].filter(item => item.socket.readyState === WebSocket.OPEN).length;
    $('locked-node-relays').textContent = `${connected}/${state.relays.length} relays públicos conectados.`;
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [['vault', 'id'], ['settings', 'id'], ['conversations', 'pubkey'], ['messages', 'id']]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
    });
  }
  function dbRequest(store, operation, value) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(store, operation === 'get' || operation === 'getAll' ? 'readonly' : 'readwrite');
      const objectStore = tx.objectStore(store);
      const request = operation === 'get' ? objectStore.get(value) : operation === 'getAll' ? objectStore.getAll() : objectStore[operation](value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error('Falha no armazenamento local.'));
    });
  }
  const get = (store, key) => dbRequest(store, 'get', key);
  const all = store => dbRequest(store, 'getAll');
  const put = (store, value) => dbRequest(store, 'put', value);
  const del = (store, key) => dbRequest(store, 'delete', key);
  const toBase64 = Vault.toBase64;
  const fromBase64 = Vault.fromBase64;
  const encryptBytes = Vault.encryptBytes;
  const decryptBytes = Vault.decryptBytes;
  const makeSession = Vault.makeSession;
  const createVault = (secret, password, remember) => Vault.createVault(secret, password, remember, N.getPublicKey);
  const unlockVault = (vault, password) => Vault.unlockVault(vault, password, N.getPublicKey);
  function validateSecret(value) {
    const text = value.trim();
    if (text.startsWith('{')) return { backup: JSON.parse(text) };
    if (/^[0-9a-fA-F]{64}$/.test(text)) return { secret: Uint8Array.from(text.match(/.{2}/g), byte => parseInt(byte, 16)) };
    const decoded = N.nip19.decode(text);
    if (decoded.type !== 'nsec') throw new Error('Informe uma chave nsec ou hex de 64 caracteres.');
    return { secret: decoded.data };
  }
  async function importSecretFromText(value, password) {
    const parsed = validateSecret(value);
    if (parsed.backup) return unlockVault(parsed.backup, password);
    return parsed.secret;
  }
  function displayName(pubkey, local = '') { return local || `npub…${N.nip19.npubEncode(pubkey).slice(-8)}`; }
  async function saveSessionChoice(remember) {
    if (!state.account || !state.secret) return;
    const updated = { ...state.account };
    if (remember) updated.session = await makeSession(state.secret);
    else delete updated.session;
    await put('vault', updated);
    state.account = updated;
  }
  async function createIdentity(secret, password, remember) {
    if (password.length < 12) throw new Error('Escolha uma senha com pelo menos 12 caracteres.');
    const vault = await createVault(secret, password, remember);
    await put('vault', vault);
    state.account = vault;
    await activateIdentity(secret);
    showToast('Identidade criada. Baixe um backup em Perfil e segurança.');
  }
  async function activateIdentity(secret) {
    state.secret = secret;
    resetIdleLock();
    state.pubkey = N.getPublicKey(secret);
    state.npub = N.nip19.npubEncode(state.pubkey);
    $('profile-initial').textContent = (await get('settings', `profile-${state.pubkey}`))?.name?.slice(0, 1)?.toUpperCase() || 'L';
    $('profile-npub').textContent = state.npub;
    $('auth-screen').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    await refreshLocalProfile();
    const campaignSettings = await getCampaignSettings();
    $('show-node-campaigns').checked = campaignSettings.enabled;
    const inboxSettings = await get('settings', `inbox-${state.pubkey}`);
    state.inboxRelays = (inboxSettings?.values || []).map(normalizeRelay).slice(0, 3);
    for (const conversation of (await all('conversations')).slice(0, 100)) {
      const peerSettings = await get('settings', `peer-inbox-${conversation.pubkey}`);
      if (peerSettings?.values?.length) state.peerInboxRelays.set(conversation.pubkey, peerSettings.values.map(normalizeRelay).slice(0, 3));
    }
    await connectAllRelays();
    await renderConversations();
    if (state.activePeer) await selectConversation(state.activePeer);
    discoverInboxRelays(state.pubkey).then(async relays => {
      if (!state.inboxRelays.length && relays.length) {
        state.inboxRelays = relays;
        await connectAllRelays();
      }
    }).catch(() => {});
  }
  async function refreshLocalProfile() {
    const profile = await get('settings', `profile-${state.pubkey}`) || { id: `profile-${state.pubkey}`, name: '' };
    $('profile-name').value = profile.name || '';
    $('profile-initial').textContent = profile.name?.slice(0, 1)?.toUpperCase() || 'L';
  }
  async function autoUnlock() {
    const vault = state.account;
    const secret = await Vault.autoUnlock(vault, N.getPublicKey);
    if (!secret) return false;
    await activateIdentity(secret);
    return true;
  }
  async function createOrImportRemembered(secret, password, remember) {
    const vault = await createVault(secret, password, remember);
    await put('vault', vault);
    state.account = vault;
    await activateIdentity(secret);
  }

  function isLocalHost(host) { return ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase()); }
  function normalizeRelay(value) {
    const url = new URL(value.trim());
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && isLocalHost(url.hostname))) throw new Error('Use wss://; ws:// só é permitido para localhost.');
    if (url.username || url.password || url.hash) throw new Error('O endereço do relay não pode conter usuário, senha ou fragmento.');
    return url.toString().replace(/\/$/, '');
  }
  function parseRelayList(text) {
    const values = [...new Set(text.split(/[\n,]/).map(item => item.trim()).filter(Boolean).map(normalizeRelay))];
    if (!values.length) throw new Error('Adicione pelo menos um relay.');
    if (values.length > 12) throw new Error('Use no máximo 12 relays por aparelho.');
    return values;
  }
  function parseInboxRelayList(text) {
    const values = [...new Set(text.split(/[\n,]/).map(item => item.trim()).filter(Boolean).map(normalizeRelay))];
    if (!values.length) throw new Error('Adicione ao menos um relay para receber mensagens.');
    if (values.length > 3) throw new Error('O NIP-17 limita esta lista a três relays de recebimento.');
    return values;
  }
  function relayTagsToUrls(event) {
    return Routing.inboxRelays(event, N.verifyEvent, normalizeRelay);
  }
  function effectiveRelayUrls() {
    return [...new Set([...state.relays, ...state.inboxRelays, ...state.peerInboxRelays.values()].flat())];
  }
  async function saveRelaySettings(values) {
    state.relays = [...new Set(values.map(normalizeRelay))];
    await put('settings', { id: 'relays', values: state.relays });
    await connectAllRelays();
  }
  function finalize(kind, content, tags = []) {
    return N.finalizeEvent({ kind, content, tags, pubkey: state.pubkey, created_at: Math.floor(Date.now() / 1000) }, state.secret);
  }
  async function discoverInboxRelays(pubkey, hints = []) {
    const lookupRelays = [...new Set([...state.relays, ...hints.map(normalizeRelay)])];
    if (!lookupRelays.length) return [];
    const events = await fetchEvents({ kinds: [10050], authors: [pubkey], limit: 20 }, 7000, lookupRelays);
    const latest = events.filter(event => N.verifyEvent(event) && event.kind === 10050 && event.pubkey === pubkey)
      .sort((a, b) => b.created_at - a.created_at)[0];
    return latest ? relayTagsToUrls(latest) : [];
  }
  async function publishInboxRelayList() {
    const values = parseInboxRelayList($('dm-relay-input').value);
    const event = finalize(10050, '', values.map(url => ['relay', url]));
    const accepted = await publishToRelays(event, state.relays);
    if (!accepted) throw new Error('Nenhum relay geral confirmou a publicação da sua lista kind 10050.');
    state.inboxRelays = values;
    await put('settings', { id: `inbox-${state.pubkey}`, values });
    await connectAllRelays();
    showToast('Sua lista pública de recebimento NIP-17 foi publicada.');
  }
  function relayMessage(url, payload) {
    const conn = state.sockets.get(url);
    if (!conn || conn.socket.readyState !== WebSocket.OPEN) return false;
    try { conn.socket.send(JSON.stringify(payload)); return true; } catch { return false; }
  }
  function connectRelay(url) {
    if (state.sockets.get(url)?.socket.readyState === WebSocket.OPEN || state.sockets.get(url)?.socket.readyState === WebSocket.CONNECTING) return;
    clearTimeout(state.reconnectTimers.get(url));
    let socket;
    try { socket = new WebSocket(url); } catch { scheduleReconnect(url); return; }
    const conn = { socket, attempts: state.sockets.get(url)?.attempts || 0, subId: `inbox-${state.pubkey.slice(0, 8)}` };
    state.sockets.set(url, conn);
    socket.onopen = () => {
      conn.attempts = 0;
      setConnectionStatus();
      if (state.pubkey) relayMessage(url, ['REQ', conn.subId, { kinds: [1059], '#p': [state.pubkey], limit: 250 }]);
      if (state.bridgeEnabled && state.relays.includes(url)) startBridgeSubscription(url);
    };
    socket.onmessage = event => handleRelayFrame(url, event.data);
    socket.onerror = () => { setConnectionStatus(); };
    socket.onclose = () => {
      setConnectionStatus();
      const current = state.sockets.get(url);
      if (current?.socket === socket) {
        current.attempts = Math.min((current.attempts || 0) + 1, 8);
        scheduleReconnect(url, current.attempts);
        state.bridgeSubscriptions.delete(url);
        for (const [subId, request] of state.fetchSubs) {
          if (request.url === url) finishFetchSub(subId, true);
        }
      }
    };
    setConnectionStatus();
  }
  function scheduleReconnect(url, attempts) {
    if ((!state.pubkey && !(state.bridgeEnabled && state.relays.includes(url))) || !effectiveRelayUrls().includes(url)) return;
    const count = attempts || 1;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(count - 1, 5))) + Math.floor(Math.random() * 500);
    state.reconnectTimers.set(url, setTimeout(() => connectRelay(url), delay));
  }
  async function connectAllRelays() {
    await closeRelays();
    for (const url of effectiveRelayUrls()) connectRelay(url);
    setConnectionStatus();
  }
  async function closeRelays() {
    for (const timer of state.reconnectTimers.values()) clearTimeout(timer);
    state.reconnectTimers.clear();
    state.bridgeSubscriptions.clear();
    for (const conn of state.sockets.values()) {
      try { if (conn.socket.readyState === WebSocket.OPEN) conn.socket.close(1000, 'Property desconectado'); } catch {}
    }
    state.sockets.clear();
    setConnectionStatus();
  }
  function handleRelayFrame(url, raw) {
    if (typeof raw !== 'string' || raw.length > 1_000_000) return;
    let frame;
    try { frame = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(frame)) return;
    const [type, id, value, extra] = frame;
    if (type === 'EVENT' && value && typeof value === 'object') {
      const subscription = state.fetchSubs.get(id);
      if (subscription) {
        subscription.request.allEvents.set(value.id, value);
        const sources = subscription.request.sources.get(value.id) || new Set();
        sources.add(url);
        subscription.request.sources.set(value.id, sources);
      }
      if (state.bridgeEnabled && state.bridgeSubscriptions.get(url) === id) forwardRelayEvent(url, value).catch(() => {});
      if (state.bridgeEnabled && state.sockets.get(url)?.subId === id && value.kind === 1059) forwardInboxGiftWrap(url, value).catch(() => {});
      if (value.kind === 1059 && state.secret) receiveGiftWrap(value).catch(() => {});
    } else if (type === 'EOSE') {
      finishFetchSub(id, false);
    } else if (type === 'OK' && typeof id === 'string') {
      const pending = state.pendingAcks.get(id);
      if (pending) {
        if (value === true) {
          pending.success = true;
          clearTimeout(pending.timer);
          pending.resolve(true);
          state.pendingAcks.delete(id);
        } else {
          pending.remaining -= 1;
          if (pending.remaining <= 0) {
            clearTimeout(pending.timer);
            pending.resolve(false);
            state.pendingAcks.delete(id);
          }
        }
      }
    } else if (type === 'NOTICE' && typeof id === 'string' && /error|blocked|invalid|rate-limited/i.test(id)) {
      console.warn('Relay notice:', url, id.slice(0, 160));
    }
  }
  async function receiveGiftWrap(event) {
    if (!N.verifyEvent(event)) return;
    const rumor = N.nip17.unwrapEvent(event, state.secret);
    if (!rumor || rumor.kind !== 14 || typeof rumor.content !== 'string' || rumor.content.length > 20000) return;
    if (rumor.pubkey === state.pubkey) return;
    const peer = rumor.pubkey;
    const id = rumor.id || event.id;
    if (await get('messages', id)) return;
    const message = { id, peer, text: rumor.content, createdAt: rumor.created_at * 1000, direction: 'received', status: 'delivered' };
    await put('messages', message);
    const previous = await get('conversations', peer) || { pubkey: peer, title: '' };
    await put('conversations', { ...previous, lastMessage: rumor.content, lastAt: message.createdAt });
    await renderConversations();
    if (state.activePeer === peer) await renderMessages(peer);
  }
  function finishFetchSub(id, fromSocketClose) {
    const subscription = state.fetchSubs.get(id);
    if (!subscription) return;
    state.fetchSubs.delete(id);
    if (!fromSocketClose) relayMessage(subscription.url, ['CLOSE', id]);
    const request = subscription.request;
    request.remaining -= 1;
    if (request.remaining <= 0) {
      clearTimeout(request.timer);
      const events = [...request.allEvents.values()];
      for (const event of events) eventSourceHints.set(event, [...(request.sources.get(event.id) || [])]);
      request.resolve(events);
    }
  }
  function startBridgeSubscription(url) {
    if (!bridge || !state.bridgeEnabled || !state.relays.includes(url) || state.bridgeSubscriptions.has(url)) return;
    const id = `bridge-${crypto.randomUUID()}`;
    state.bridgeSubscriptions.set(url, id);
    if (!relayMessage(url, ['REQ', id, bridge.filter()])) state.bridgeSubscriptions.delete(url);
  }
  function stopBridgeSubscriptions() {
    for (const [url, id] of state.bridgeSubscriptions) relayMessage(url, ['CLOSE', id]);
    state.bridgeSubscriptions.clear();
  }
  async function forwardRelayEvent(sourceRelay, event) {
    const targets = bridge.targets(event, sourceRelay, state.relays);
    if (!targets.length) return;
    await publishToRelays(event, targets);
  }
  async function forwardInboxGiftWrap(sourceRelay, event) {
    const targets = bridge.privateTargets(event, sourceRelay, state.inboxRelays, state.pubkey);
    if (!targets.length) return;
    await publishToRelays(event, targets);
  }
  function waitForOpen(url, timeout = 5000) {
    const existing = state.sockets.get(url);
    if (existing?.socket.readyState === WebSocket.OPEN) return Promise.resolve(true);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (state.sockets.get(url)?.socket.readyState === WebSocket.OPEN) { clearInterval(timer); resolve(true); }
        else if (Date.now() - started >= timeout) { clearInterval(timer); resolve(false); }
      }, 100);
    });
  }
  async function fetchEvents(filter, timeout = 9000, targetRelays = state.relays) {
    const urls = [...new Set(targetRelays.map(normalizeRelay))];
    for (const url of urls) connectRelay(url);
    const openedUrls = (await Promise.all(urls.map(async url => await waitForOpen(url) ? url : null))).filter(Boolean);
    if (!openedUrls.length) return [];
    return new Promise(resolve => {
      const request = { allEvents: new Map(), sources: new Map(), remaining: openedUrls.length, resolve, timer: 0 };
      request.timer = setTimeout(() => {
        for (const [id, sub] of state.fetchSubs) if (sub.request === request) finishFetchSub(id, true);
        if (request.remaining > 0) {
          request.remaining = 0;
          resolve([...request.allEvents.values()]);
        }
      }, timeout);
      for (const url of openedUrls) {
        const subId = `q-${crypto.randomUUID()}`;
        state.fetchSubs.set(subId, { url, request });
        if (!relayMessage(url, ['REQ', subId, filter])) finishFetchSub(subId, true);
      }
    });
  }
  async function publishToRelays(event, targetRelays = state.relays) {
    bridge?.markPublished(event);
    const allowed = new Set(targetRelays.map(normalizeRelay));
    for (const url of allowed) connectRelay(url);
    await Promise.all([...allowed].map(url => waitForOpen(url)));
    const open = [...state.sockets.entries()].filter(([url, conn]) => allowed.has(url) && conn.socket.readyState === WebSocket.OPEN);
    if (!open.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const pending = { remaining: open.length, success: false, resolve, timer: 0 };
      pending.timer = setTimeout(() => {
        state.pendingAcks.delete(event.id);
        resolve(pending.success);
      }, 8000);
      state.pendingAcks.set(event.id, pending);
      let sentCount = 0;
      for (const [url] of open) if (relayMessage(url, ['EVENT', event])) sentCount += 1;
      pending.remaining = sentCount;
      if (!sentCount) {
        clearTimeout(pending.timer);
        state.pendingAcks.delete(event.id);
        resolve(false);
      }
    });
  }
  async function renderConversations() {
    const conversations = (await all('conversations')).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const search = $('conversation-search').value.trim().toLowerCase();
    const list = $('conversation-list');
    list.replaceChildren();
    const filtered = conversations.filter(item => (displayName(item.pubkey, item.title) + item.lastMessage).toLowerCase().includes(search));
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = search ? 'Nenhuma conversa encontrada.' : 'Suas conversas aparecerão aqui.'; list.append(empty); return;
    }
    for (const conversation of filtered) {
      const button = document.createElement('button'); button.className = `conversation-item${conversation.pubkey === state.activePeer ? ' active' : ''}`; button.type = 'button';
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = displayName(conversation.pubkey, conversation.title).slice(0, 1).toUpperCase();
      const info = document.createElement('span'); info.className = 'conversation-preview';
      const title = document.createElement('strong'); title.textContent = displayName(conversation.pubkey, conversation.title);
      const preview = document.createElement('small'); preview.textContent = conversation.lastMessage || conversation.pubkey.slice(0, 16);
      info.append(title, preview); button.append(avatar, info); button.addEventListener('click', () => selectConversation(conversation.pubkey)); list.append(button);
    }
  }
  async function selectConversation(pubkey) {
    state.activePeer = pubkey;
    $('empty-conversation').classList.add('hidden');
    $('conversation-pane').classList.remove('hidden');
    $('chat-title').textContent = displayName(pubkey, (await get('conversations', pubkey))?.title || '');
    $('chat-subtitle').textContent = N.nip19.npubEncode(pubkey);
    $('chat-avatar').textContent = $('chat-title').textContent.slice(0, 1).toUpperCase();
    await renderMessages(pubkey);
    await renderConversations();
    if (window.innerWidth <= 800) setActiveView('messages');
  }
  async function renderMessages(peer) {
    const entries = (await all('messages')).filter(message => message.peer === peer).sort((a, b) => a.createdAt - b.createdAt);
    const container = $('messages'); container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Esta conversa é privada. Envie uma mensagem para começar.'; container.append(empty); return;
    }
    for (const message of entries) {
      const row = document.createElement('div'); row.className = `message-row${message.direction === 'sent' ? ' mine' : ''}`;
      const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = message.text;
      const delivery = message.status === 'pending' ? ' · aguardando relay' : message.status === 'partial' ? ' · entrega parcial' : '';
      const meta = document.createElement('span'); meta.className = 'message-meta'; meta.textContent = `${new Date(message.createdAt).toLocaleString()}${delivery}`;
      row.append(bubble, meta); container.append(row);
    }
    container.scrollTop = container.scrollHeight;
  }
  async function sendPrivateMessage(peer, text) {
    if (!state.inboxRelays.length) {
      state.inboxRelays = await discoverInboxRelays(state.pubkey);
      if (!state.inboxRelays.length) throw new Error('Configure e publique seus relays de recebimento NIP-17 nas configurações.');
    }
    let peerRelays = state.peerInboxRelays.get(peer) || [];
    if (!peerRelays.length) {
      const savedHints = state.peerRelayHints.get(peer) || (await get('conversations', peer))?.relayHints || [];
      if (savedHints.length) state.peerRelayHints.set(peer, savedHints);
      peerRelays = await discoverInboxRelays(peer, savedHints);
      if (!peerRelays.length) throw new Error('Não encontrei a lista pública kind 10050 desta pessoa. Confirme o npub e os relays de perfil.');
      state.peerInboxRelays.set(peer, peerRelays);
      await put('settings', { id: `peer-inbox-${peer}`, values: peerRelays });
      await connectAllRelays();
    }
    const wraps = N.nip17.wrapManyEvents(state.secret, [{ publicKey: peer }], text);
    const routePlan = Routing.planGiftWraps(wraps, state.pubkey, peer, state.inboxRelays, peerRelays, N.verifyEvent);
    if (!routePlan.ready) throw new Error('A mensagem NIP-17 não tem os dois envelopes válidos ou as listas de recebimento necessárias.');
    if (!Array.isArray(wraps) || wraps.length < 2 || wraps.some(event => event.kind !== 1059)) throw new Error('A biblioteca não gerou envelopes NIP-17 válidos.');
    const id = `${state.pubkey}:${crypto.randomUUID()}`;
    const message = { id, peer, text, createdAt: Date.now(), direction: 'sent', status: 'pending' };
    const previous = await get('conversations', peer) || { pubkey: peer, title: '' };
    await put('messages', message);
    await put('conversations', { ...previous, lastMessage: text, lastAt: message.createdAt });
    await renderMessages(peer); await renderConversations();
    let sent = 0;
    for (const delivery of routePlan.deliveries) if (await publishToRelays(delivery.event, delivery.relays)) sent += 1;
    message.status = sent === 2 ? 'sent' : sent === 1 ? 'partial' : 'pending';
    await put('messages', message); await renderMessages(peer);
    if (!sent) showToast('Mensagem cifrada salva no aparelho; nenhum relay confirmou o envio.');
    else if (sent < 2) showToast('Apenas um dos dois envelopes NIP-17 foi confirmado pelos relays.');
  }
  async function addConversation(pubkey, title, relayHints = []) {
    if (pubkey === state.pubkey) throw new Error('Não é possível iniciar uma conversa consigo mesmo.');
    const existing = await get('conversations', pubkey) || { pubkey, lastAt: 0, lastMessage: '' };
    const hints = [...new Set(relayHints.length ? relayHints : existing.relayHints || [])];
    await put('conversations', { ...existing, title: title.trim() || existing.title || '', relayHints: hints });
    if (hints.length) state.peerRelayHints.set(pubkey, hints);
    await selectConversation(pubkey); await renderConversations();
  }
  function setActiveView(view) {
    state.activeView = view;
    for (const name of ['messages', 'hangout', 'marketplace', 'node']) {
      $(`${name}-view`).classList.toggle('hidden', name !== view);
      document.querySelector(`.nav-button[data-view="${name}"]`).classList.toggle('active', name === view);
    }
    if (view === 'hangout') refreshHangout().catch(() => {});
    if (view === 'marketplace') refreshMarketplace().catch(() => {});
  }
  async function getCampaignSettings() {
    const saved = state.pubkey ? await get('settings', `campaigns-${state.pubkey}`) : null;
    return {
      id: `campaigns-${state.pubkey}`,
      enabled: saved?.enabled === true,
      blockedNodes: Array.isArray(saved?.blockedNodes) ? saved.blockedNodes.filter(value => /^[0-9a-f]{64}$/.test(value)) : [],
      exposures: saved?.exposures && typeof saved.exposures === 'object' ? saved.exposures : {}
    };
  }
  async function saveCampaignSettings(settings) {
    const next = { ...settings, id: `campaigns-${state.pubkey}` };
    await put('settings', next);
    return next;
  }
  async function renderNodeCampaigns(events) {
    const settings = await getCampaignSettings();
    const section = $('node-campaigns-section');
    const list = $('node-campaigns-list');
    list.replaceChildren();
    if (!settings.enabled || !Campaigns) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const now = Math.floor(Date.now() / 1000);
    const selected = Campaigns.selectSponsoredCampaigns(events, N.verifyEvent, {
      nowSeconds: now, blockedNodes: settings.blockedNodes, exposures: settings.exposures, maxCount: 1
    });
    if (!selected.length) {
      list.append(makeEmpty('Nenhuma campanha disponível', 'Os relays consultados não forneceram uma campanha assinada válida.'));
      return;
    }
    const campaign = selected[0];
    settings.exposures = Campaigns.recordExposure(settings.exposures, campaign.campaignId, now);
    await saveCampaignSettings(settings);
    const card = document.createElement('article'); card.className = 'campaign-card';
    const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'PATROCINADO · PAGAMENTO NÃO VERIFICADO PELO CLIENTE';
    const heading = document.createElement('h3'); heading.textContent = campaign.title;
    const body = document.createElement('p'); body.textContent = campaign.body;
    const amount = document.createElement('p'); amount.className = 'hangout-meta'; amount.textContent = `Oferta do node: ${Money.fromAtomic(campaign.amountAtomic, campaign.currency)} ${campaign.currency} · identidade ${N.nip19.npubEncode(campaign.nodePubkey).slice(0, 18)}…`;
    card.append(label);
    if (campaign.imageData) { const image = document.createElement('img'); image.className = 'campaign-image'; image.src = campaign.imageData; image.alt = campaign.title; image.loading = 'lazy'; card.append(image); }
    card.append(heading, body, amount);
    const link = document.createElement('a'); link.className = 'button secondary'; link.href = campaign.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir destino HTTPS';
    card.append(link);
    const block = document.createElement('button'); block.className = 'button text'; block.textContent = 'Ocultar este node';
    block.addEventListener('click', async () => {
      const latest = await getCampaignSettings();
      latest.blockedNodes = [...new Set([...latest.blockedNodes, campaign.nodePubkey])];
      await saveCampaignSettings(latest);
      card.remove();
      if (!list.children.length) list.append(makeEmpty('Campanha ocultada', 'Este node foi bloqueado apenas neste aparelho.'));
    });
    card.append(block); list.append(card);
  }
  async function refreshHangout() {
    $('hangout-list').replaceChildren();
    const campaignSettings = await getCampaignSettings();
    const tasks = [fetchEvents({ kinds: [1], limit: 50 })];
    if (campaignSettings.enabled && Campaigns) tasks.push(fetchEvents({ kinds: [Campaigns.KIND], '#t': Campaigns.TAGS, limit: 50 }));
    const [events, campaigns = []] = await Promise.all(tasks);
    await renderNodeCampaigns(campaigns);
    const unique = new Map();
    for (const event of events) if (N.verifyEvent(event) && event.kind === 1) unique.set(event.id, event);
    const ordered = [...unique.values()].sort((a, b) => b.created_at - a.created_at).slice(0, 50);
    if (!ordered.length) { $('hangout-list').append(makeEmpty('Nenhuma publicação encontrada', 'Tente atualizar quando os relays estiverem conectados.')); return; }
    for (const event of ordered) {
      const card = document.createElement('article'); card.className = 'hangout-card';
      const title = document.createElement('h3'); title.textContent = `npub…${N.nip19.npubEncode(event.pubkey).slice(-8)}`;
      const body = document.createElement('p'); body.textContent = event.content;
      const meta = document.createElement('p'); meta.className = 'hangout-meta';
      const sources = eventSourceHints.get(event) || [];
      meta.textContent = `${new Date(event.created_at * 1000).toLocaleString()} · ${sources.length ? `relays: ${sources.join(', ')}` : 'relay de origem indisponível'}`;
      const contact = document.createElement('button'); contact.className = 'button text'; contact.textContent = 'Conversar em privado'; contact.addEventListener('click', () => addConversation(event.pubkey, '').catch(error => showToast(error.message)));
      card.append(title, body, meta, contact); $('hangout-list').append(card);
    }
  }
  function makeEmpty(titleText, description) {
    const wrapper = document.createElement('div'); wrapper.className = 'empty-state compact';
    const symbol = document.createElement('div'); symbol.className = 'empty-symbol'; symbol.textContent = '✳';
    const title = document.createElement('h2'); title.textContent = titleText;
    const body = document.createElement('p'); body.textContent = description;
    wrapper.append(symbol, title, body); return wrapper;
  }
  async function publishHangoutPost() {
    const content = $('hangout-text').value.trim();
    if (!content) return showToast('Escreva algo antes de publicar.');
    const event = finalize(1, content);
    const sent = await publishToRelays(event);
    if (!sent) throw new Error('Nenhum relay confirmou a publicação. Verifique a conexão.');
    $('hangout-text').value = ''; showToast('Publicação enviada aos relays conectados.'); await refreshHangout();
  }
  async function ensureStall(name, currency) {
    const key = `stall-${currency}-${state.pubkey}`;
    let saved = await get('settings', key);
    if (saved?.stallId) return saved.stallId;
    const id = crypto.randomUUID();
    const content = JSON.stringify({ id, name: `${name} · Property`, description: 'Vitrine pública no Nostr', currency, shipping: [] });
    const event = finalize(30017, content, [['d', id]]);
    const accepted = await publishToRelays(event);
    if (!accepted) throw new Error('Nenhum relay confirmou a vitrine. Tente novamente.');
    await put('settings', { id: key, stallId: id });
    return id;
  }
  async function publishProduct() {
    try {
      const updating = Boolean(state.editingProduct);
      const name = $('product-name').value.trim();
      const description = $('product-description').value.trim();
      if (!name) throw new Error('Informe o nome da oferta.');
      const rawPrice = $('product-price').value.trim();
      if (!rawPrice) throw new Error('Informe o preço em BTC, XMR ou XNO.');
      const { price, currency, atomic, raw } = Marketplace.parsePrice(rawPrice, Nano, $('product-currency').value);
      let image = $('product-image').value.trim();
      if (image) { image = Marketplace.safeExternalImageUrl(image); if (!image) throw new Error('Informe uma imagem HTTPS válida, sem credenciais ou endereço local.'); }
      const id = state.editingProduct?.data.id || crypto.randomUUID();
      const stallId = state.editingProduct?.data.currency === currency ? state.editingProduct.data.stall_id : await ensureStall(name, currency);
      const payload = { id, stall_id: stallId, name, description, images: image ? [image] : [], currency, price, price_atomic: atomic, ...(raw ? { price_raw: raw } : {}), quantity: null, specs: [], shipping: [] };
      const event = finalize(30018, JSON.stringify(payload), [['d', id]]);
      const sent = await publishToRelays(event);
      if (!sent) throw new Error('Nenhum relay confirmou a oferta.');
      $('product-dialog').close(); resetProductForm();
      showToast(updating ? 'Oferta atualizada nos relays.' : 'Oferta NIP-15 publicada.');
      state.editingProduct = null; await refreshMarketplace();
    } catch (error) { showError('product-error', error.message || 'Falha ao publicar oferta.'); }
  }
  function resetProductForm(product = null) {
    state.editingProduct = product;
    $('product-name').value = product?.data.name || '';
    $('product-description').value = product?.data.description || '';
    let price = product?.data.price ?? '';
    const currency = product?.data.currency || 'XNO';
    $('product-currency').value = currency;
    const atomic = product?.data.price_atomic ?? (currency === 'XNO' ? product?.data.price_raw : undefined);
    if (atomic !== undefined) { try { price = Money.fromAtomic(atomic, currency); } catch {} }
    $('product-price').value = price;
    $('product-image').value = Array.isArray(product?.data.images) ? product.data.images[0] || '' : '';
    $('product-dialog-title').textContent = product ? 'Editar oferta' : 'Publicar oferta';
    $('publish-product').textContent = product ? 'Assinar e atualizar' : 'Assinar e publicar';
    showError('product-error');
  }
  function openProductEditor(product = null) {
    if (product && product.pubkey !== state.pubkey) return;
    resetProductForm(product);
    $('product-dialog').showModal();
  }
  async function deleteProduct(product) {
    if (!product || product.pubkey !== state.pubkey) throw new Error('Só a identidade autora pode retirar esta oferta.');
    const request = Marketplace.makeProductDeletion(product);
    if (!request) throw new Error('A oferta não tem um endereço NIP-15 válido para retirada.');
    const deletion = finalize(request.kind, request.content, request.tags);
    if (!await publishToRelays(deletion)) throw new Error('Nenhum relay confirmou o pedido de retirada.');
    $('delete-product-dialog').close();
    state.deletingProduct = null;
    showToast('Pedido de retirada assinado; relays podem manter cópias antigas.');
    await refreshMarketplace();
  }
  async function refreshMarketplace() {
    $('marketplace-list').replaceChildren();
    const events = await fetchEvents({ kinds: [30018, 5], limit: 200 });
    const ordered = Marketplace.selectActiveProducts(events, N.verifyEvent);
    if (!ordered.length) { $('marketplace-list').append(makeEmpty('Nenhuma oferta encontrada', 'Publique uma oferta ou conecte-se a relays que tenham eventos NIP-15.')); return; }
    for (const product of ordered) {
      const card = document.createElement('article'); card.className = 'product-card';
      const { data } = product;
      const imageUrl = Array.isArray(data.images) ? Marketplace.safeExternalImageUrl(data.images[0]) : '';
      if (imageUrl) { const link = document.createElement('a'); link.href = imageUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir imagem externa'; link.className = 'button text'; card.append(link); }
      const title = document.createElement('h3'); title.textContent = data.name;
      const price = document.createElement('p'); price.className = 'product-price';
      price.textContent = Marketplace.displayPrice(data, Nano);
      const body = document.createElement('p'); body.textContent = data.description || '';
      const seller = document.createElement('p'); seller.className = 'hangout-meta'; seller.textContent = `Vendedor: npub…${N.nip19.npubEncode(product.pubkey).slice(-8)}`;
      const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = 'Falar com vendedor'; button.addEventListener('click', () => addConversation(product.pubkey, '').catch(error => showToast(error.message)));
      card.append(title, price, body, seller, button); $('marketplace-list').append(card);
      if (product.pubkey === state.pubkey) {
        const edit = document.createElement('button'); edit.className = 'button text'; edit.textContent = 'Editar'; edit.addEventListener('click', () => openProductEditor(product)); card.append(edit);
        const withdraw = document.createElement('button'); withdraw.className = 'button text'; withdraw.textContent = 'Retirar oferta';
        withdraw.addEventListener('click', () => {
          state.deletingProduct = product;
          $('delete-product-label').textContent = `Você vai assinar um pedido NIP-09 para retirar “${data.name}”. Relays e terceiros podem continuar com cópias.`;
          showError('delete-product-error'); $('delete-product-dialog').showModal();
        });
        card.append(withdraw);
      }
    }
  }

  function downloadBackup() {
    if (!state.account) return;
    const backup = Vault.exportBackup(state.account);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `property-backup-${state.npub.slice(-8)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast('Backup criptografado baixado. Guarde-o junto com a senha.');
  }
  async function savePublicProfile() {
    const name = $('profile-name').value.trim().slice(0, 80);
    const profile = { id: `profile-${state.pubkey}`, name };
    await put('settings', profile);
    $('profile-initial').textContent = name.slice(0, 1).toUpperCase() || 'L';
    const event = finalize(0, JSON.stringify({ name, display_name: name }));
    const sent = await publishToRelays(event);
    if (!sent) showToast('Nome salvo neste aparelho; relay ainda não confirmou o perfil.');
    else showToast('Perfil salvo localmente e publicado nos relays.');
  }
  async function closeIdentityRelaySubscriptions() {
    for (const [subId] of state.fetchSubs) finishFetchSub(subId, true);
    for (const [id, pending] of state.pendingAcks) {
      clearTimeout(pending.timer);
      pending.resolve(false);
      state.pendingAcks.delete(id);
    }
    for (const [url, conn] of [...state.sockets]) {
      if (conn.subId) relayMessage(url, ['CLOSE', conn.subId]);
      if (state.relays.includes(url)) continue;
      clearTimeout(state.reconnectTimers.get(url));
      state.reconnectTimers.delete(url);
      try { conn.socket.close(1000, 'Property identidade bloqueada'); } catch {}
      state.sockets.delete(url);
    }
    state.inboxRelays = [];
    state.peerInboxRelays.clear();
    state.peerRelayHints.clear();
    setConnectionStatus();
  }
  async function lockIdentity({ preservePublicBridge = false } = {}) {
    if (state.account) { const updated = { ...state.account }; delete updated.session; await put('vault', updated); state.account = updated; }
    clearTimeout(state.idleTimer);
    if (state.secret) state.secret.fill(0);
    state.secret = null; state.pubkey = ''; state.npub = ''; state.activePeer = '';
    if (preservePublicBridge && state.bridgeEnabled) await closeIdentityRelaySubscriptions();
    else {
      if (state.bridgeEnabled) {
        state.bridgeEnabled = false;
        $('browser-node-toggle').checked = false;
        await put('settings', { id: 'browser-bridge', enabled: false });
      }
      await closeRelays();
    }
    $('workspace').classList.add('hidden'); $('auth-screen').classList.remove('hidden'); $('password').value = '';
    $('profile-dialog').close(); showAuthPane('auth-choice'); updateLockedBridgeStatus();
    showToast(preservePublicBridge && state.bridgeEnabled ? 'Identidade bloqueada; ponte pública continua ativa.' : 'Sessão bloqueada neste aparelho.');
  }
  async function tryCreate() {
    const password = $('new-password').value;
    if (password !== $('confirm-password').value) return showError('setup-error', 'As senhas não coincidem.');
    try {
      const secret = N.generateSecretKey();
      await createOrImportRemembered(secret, password, $('remember-device').checked);
      $('new-password').value = ''; $('confirm-password').value = '';
    } catch (error) { showError('setup-error', error.message || 'Não foi possível criar a identidade.'); }
  }
  async function tryImport() {
    try {
      const password = $('import-password').value;
      if (password.length < 12) throw new Error('Escolha uma senha local com pelo menos 12 caracteres.');
      const secret = await importSecretFromText($('import-secret').value, password);
      await createOrImportRemembered(secret, password, $('remember-import').checked);
      $('import-secret').value = ''; $('import-password').value = '';
    } catch (error) { showError('import-error', error.message || 'Falha ao importar.'); }
  }
  async function tryUnlock() {
    if (state.unlocking) return;
    state.unlocking = true;
    try {
      const vault = await get('vault', 'account');
      if (!vault) throw new Error('Nenhuma identidade foi criada neste aparelho. Escolha “Criar identidade” ou “Importar chave Nostr”.');
      const secret = await unlockVault(vault, $('password').value);
      state.account = vault;
      state.secret = secret;
      const remember = $('remember-login').checked;
      if (remember) await saveSessionChoice(true);
      else await saveSessionChoice(false);
      $('password').value = ''; await activateIdentity(secret);
    } catch (error) { showError('auth-error', error.message || 'Falha ao desbloquear a identidade.'); }
    finally { state.unlocking = false; }
  }
  async function exportBackupWithPassword() {
    const password = window.prompt('Confirme a senha da identidade para baixar o backup criptografado.');
    if (!password) return;
    try {
      await unlockVault(state.account, password);
      downloadBackup();
    } catch { showError('profile-error', 'Senha incorreta. Backup não exportado.'); }
  }
  function resetIdleLock() {
    clearTimeout(state.idleTimer);
    if (state.secret) state.idleTimer = setTimeout(() => lockIdentity({ preservePublicBridge: true }).catch(() => {}), 30 * 60 * 1000);
  }
  function registerOfflineShell() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      if (!state.secret && !Array.from(document.querySelectorAll('input[type="password"]')).some(input => input.value)) {
        refreshing = true; window.location.reload();
      } else showToast('Nova versão disponível. Reabra o app quando terminar.');
    });
    navigator.serviceWorker.register('./sw.js?v=property-v13', { scope: './', updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Property: cache offline indisponível.', error));
  }
  function wireEvents() {
    $('create-account-button').addEventListener('click', () => showAuthPane('auth-setup'));
    $('import-account-button').addEventListener('click', () => showAuthPane('auth-import'));
    document.querySelectorAll('.back-auth').forEach(button => button.addEventListener('click', () => showAuthPane('auth-choice')));
    $('finish-create-button').addEventListener('click', tryCreate);
    $('finish-import-button').addEventListener('click', tryImport);
    $('unlock-button').addEventListener('click', tryUnlock);
    $('password').addEventListener('keydown', event => { if (event.key === 'Enter') tryUnlock(); });
    $('profile-button').addEventListener('click', () => $('profile-dialog').showModal());
    const openRelaySettings = async () => {
      $('relay-input').value = state.relays.join('\n');
      $('dm-relay-input').value = state.inboxRelays.join('\n');
      $('relay-dialog').showModal();
    };
    $('open-settings').addEventListener('click', openRelaySettings);
    $('mobile-open-settings').addEventListener('click', openRelaySettings);
    $('save-relays').addEventListener('click', async () => {
      try { await saveRelaySettings(parseRelayList($('relay-input').value)); $('relay-dialog').close(); showError('relay-error'); }
      catch (error) { showError('relay-error', error.message); }
    });
    $('publish-inbox-list').addEventListener('click', () => publishInboxRelayList().catch(error => showError('relay-error', error.message || 'Falha ao publicar a lista NIP-17.')));
    $('use-default-relays').addEventListener('click', () => { $('relay-input').value = PUBLIC_RELAY_EXAMPLES.join('\n'); });
    $('new-chat-button').addEventListener('click', () => $('new-chat-dialog').showModal());
    $('empty-new-chat').addEventListener('click', () => $('new-chat-dialog').showModal());
    $('start-chat-button').addEventListener('click', async () => {
      try {
        const parsed = Contact.parsePublicKey($('peer-input').value);
        let profileHints;
        try { profileHints = parsed.relayHints.map(normalizeRelay); }
        catch { throw new Error('O nprofile contém um endereço de relay inválido. Use o npub ou peça à pessoa que compartilhe o contato novamente.'); }
        const extraHints = $('peer-relays-input').value.split(/[\n,]/).map(item => item.trim()).filter(Boolean).map(value => {
          try { return normalizeRelay(value); }
          catch { throw new Error('Confira o endereço de relay informado. Use uma URL wss:// válida; ws:// só funciona em testes locais.'); }
        });
        const hints = [...new Set([...profileHints, ...extraHints])];
        await addConversation(parsed.pubkey, $('peer-name-input').value, hints);
        $('new-chat-dialog').close(); $('peer-input').value = ''; $('peer-name-input').value = ''; $('peer-relays-input').value = ''; showError('new-chat-error');
      }
      catch (error) { showError('new-chat-error', error.message); }
    });
    $('send-form').addEventListener('submit', async event => {
      event.preventDefault(); const text = $('message-input').value.trim(); if (!text || !state.activePeer) return;
      $('message-input').value = ''; $('message-input').style.height = '';
      try { await sendPrivateMessage(state.activePeer, text); }
      catch (error) { showToast(error.message || 'Falha ao cifrar a mensagem.'); }
    });
    $('message-input').addEventListener('input', event => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`; });
    $('conversation-search').addEventListener('input', renderConversations);
    document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => setActiveView(button.dataset.view)));
    $('refresh-hangout').addEventListener('click', () => refreshHangout().catch(error => showToast(error.message || 'Falha ao carregar o Hangout.')));
    $('show-node-campaigns').addEventListener('change', async event => {
      try {
        const settings = await getCampaignSettings();
        settings.enabled = event.target.checked;
        await saveCampaignSettings(settings);
        if (settings.enabled && state.activeView === 'hangout') await refreshHangout();
        else await renderNodeCampaigns([]);
        showToast(settings.enabled ? 'Campanhas de nodes ativadas somente neste aparelho.' : 'Campanhas de nodes desativadas.');
      } catch (error) { event.target.checked = false; showToast(error.message || 'Não foi possível salvar a preferência local.'); }
    });
    $('publish-hangout').addEventListener('click', () => publishHangoutPost().catch(error => showToast(error.message || 'Falha ao publicar.')));
    $('publish-product-button').addEventListener('click', () => openProductEditor());
    $('refresh-marketplace').addEventListener('click', () => refreshMarketplace().catch(error => showToast(error.message || 'Falha ao atualizar ofertas.')));
    $('publish-product').addEventListener('click', publishProduct);
    $('confirm-delete-product').addEventListener('click', () => deleteProduct(state.deletingProduct).catch(error => showError('delete-product-error', error.message || 'Falha ao retirar oferta.')));
    $('save-profile').addEventListener('click', () => savePublicProfile().catch(error => showError('profile-error', error.message)));
    $('export-backup').addEventListener('click', exportBackupWithPassword);
    $('copy-npub').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.npub); showToast('npub copiado.'); } catch { showError('profile-error', state.npub); } });
    $('lock-account').addEventListener('click', () => lockIdentity());
    $('stop-locked-node').addEventListener('click', async () => {
      try {
        state.bridgeEnabled = false;
        await put('settings', { id: 'browser-bridge', enabled: false });
        await closeRelays();
        updateLockedBridgeStatus();
        showToast('Ponte pública parada.');
      } catch (error) { showToast(error.message || 'Não foi possível parar a ponte.'); }
    });
    $('use-local-relay').addEventListener('click', async () => {
      const localRelay = 'ws://127.0.0.1:7447';
      const relays = state.relays.includes(localRelay) ? state.relays : [localRelay, ...state.relays];
      try { await saveRelaySettings(relays); showToast('Relay local adicionado. A conexão só funciona neste computador.'); }
      catch (error) { showToast(error.message || 'Não foi possível conectar ao relay local.'); }
    });
    $('copy-relay-command').addEventListener('click', async () => { const command = /Win/i.test(navigator.platform) ? 'powershell -NoProfile -File .\\property\\relay\\start.ps1' : './property/relay/start.sh'; try { await navigator.clipboard.writeText(command); showToast('Instrução copiada.'); } catch { showToast(`Comando: ${command}`); } });
    $('browser-node-toggle').addEventListener('change', async event => {
      state.bridgeEnabled = event.target.checked;
      try {
        await put('settings', { id: 'browser-bridge', enabled: state.bridgeEnabled });
        if (state.bridgeEnabled) {
          await connectAllRelays();
          showToast('Ponte ativa entre os relays selecionados enquanto o app estiver aberto.');
        } else {
          stopBridgeSubscriptions();
          showToast('Ponte entre relays desativada.');
        }
      } catch (error) {
        state.bridgeEnabled = !event.target.checked;
        event.target.checked = state.bridgeEnabled;
        showToast(error.message || 'Não foi possível atualizar a ponte.');
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.pubkey) { resetIdleLock(); for (const url of effectiveRelayUrls()) connectRelay(url); } });
    for (const eventName of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(eventName, resetIdleLock, { passive: true });
  }
  async function boot() {
    if (!N || !N.nip17 || !N.nip19 || !Vault || !Routing || !Bridge || !bridge || !Nano || !Money || !Marketplace || typeof Contact?.parsePublicKey !== 'function') { $('auth-error').textContent = 'Os arquivos locais do protocolo ou de contatos não carregaram. Recarregue o pacote do Property.'; return; }
    wireEvents();
    registerOfflineShell();
    try {
      state.db = await openDatabase();
      state.account = await get('vault', 'account');
      const relaySettings = await get('settings', 'relays');
      if (relaySettings?.values?.length) state.relays = relaySettings.values.map(normalizeRelay);
      const bridgeSettings = await get('settings', 'browser-bridge');
      state.bridgeEnabled = bridgeSettings?.enabled === true;
      $('browser-node-toggle').checked = state.bridgeEnabled;
      const inboxSettings = state.account ? await get('settings', `inbox-${state.account.pubkey}`) : null;
      if (inboxSettings?.values?.length) state.inboxRelays = inboxSettings.values.map(normalizeRelay).slice(0, 3);
      if (state.account && await autoUnlock()) return;
      showAuthPane('auth-choice');
      if (state.bridgeEnabled) for (const url of state.relays) connectRelay(url);
      setConnectionStatus(); updateLockedBridgeStatus();
    } catch (error) {
      showAuthPane('auth-choice'); showError('auth-error', `Armazenamento local indisponível: ${error.message || 'erro do navegador'}`);
    }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
