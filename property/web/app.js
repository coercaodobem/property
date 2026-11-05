'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const RelayDefaults = window.PropertyRelayDefaults;
  const Pwa = window.PropertyPwa;
  const ShareInbox = window.PropertyShareInbox;
  // Stable legacy database ID: preserve existing identities and sessions on this origin.
  const DB_NAME = 'liberdade-local-v1';
  const DB_VERSION = 3;
  const Vault = window.PropertyVault;
  const Routing = window.PropertyNostrRouting;
  const Bridge = window.PropertyRelayBridge;
  const Nano = window.PropertyNanoUnits;
  const Money = window.PropertyMoney;
  const Marketplace = window.PropertyMarketplace;
  const Campaigns = window.PropertyCampaigns;
  const Contact = window.PropertyContact;
  const PublicProfile = window.PropertyPublicProfile;
  const AgentMessages = window.PropertyAgentMessages;
  const MessageSearch = window.PropertyMessageSearch;
  const FolderStore = window.PropertyConversationFolders;
  const ChatDrafts = window.PropertyChatDrafts;
  const RichText = window.PropertyRichText;
  const MessageEdits = window.PropertyMessageEdits;
  const SecretGuard = window.PropertySecretGuard;
  const QrCode = window.PropertyQrCode;
  const REACTION_OPTIONS = ['👍', '❤️', '😂', '🎉', '👀'];
  const MAX_NIP17_GROUP_MEMBERS = 10;
  const eventSourceHints = new WeakMap();
  const state = {
    db: null, account: null, secret: null, pubkey: '', npub: '', relays: [],
    inboxRelays: [], peerInboxRelays: new Map(), peerRelayHints: new Map(),
    sockets: new Map(), fetchSubs: new Map(), pendingAcks: new Map(), activePeer: '',
    currentConversation: null,
    activeView: 'messages', toastTimer: 0, reconnectTimers: new Map(), unlocking: false, idleTimer: 0, replyingTo: null, editingMessage: null, editingDraft: '', editingReplyingTo: null, forwardingMessage: null, autoSelectedRelays: false,
    peerProfiles: new Map(), chatDetailsPeer: '',
    conversationFolders: null, folderEditingId: '', folderMovingConversation: '',
    messageSearchOpen: false, messageSearchIds: [], messageSearchIndex: -1,
    bridgeEnabled: false, bridgeSubscriptions: new Map(), bridgeRefreshTimer: 0, editingProduct: null, deletingProduct: null,
    storageReady: false, pendingLaunchAction: '', pendingContactIntent: '', contactShare: null, shareItems: [], shareDraftId: '', shareDraftPeer: '', pendingShareForNewChat: '', draftLoadSequence: 0, pendingSecretResolve: null
  };
  const N = window.NostrTools;
  const bridge = Bridge?.createBridge(event => N.verifyEvent(event));

  function groupConversationId(members) {
    return Routing.groupConversationId(members, MAX_NIP17_GROUP_MEMBERS);
  }
  function rumorParticipants(rumor) {
    return Routing.groupParticipants(rumor, MAX_NIP17_GROUP_MEMBERS);
  }
  function conversationLabel(conversation) {
    if (typeof conversation === 'string') {
      if (conversation.startsWith('group:')) return window.PropertyI18n?.language === 'pt-BR' ? 'Grupo privado' : 'Private group';
      return displayName(conversation, state.peerProfiles.get(conversation)?.displayName || '');
    }
    return conversation?.group === true
      ? (conversation.title || (window.PropertyI18n?.language === 'pt-BR' ? 'Grupo privado' : 'Private group'))
      : displayName(conversation?.pubkey || '', conversation?.title || state.peerProfiles.get(conversation?.pubkey || '')?.displayName || '');
  }
  function conversationSubtitle(conversation, agentAccess) {
    if (conversation?.group === true) {
      const members = conversation.members || [];
      return window.PropertyI18n?.language === 'pt-BR'
        ? `GRUPO NIP-17 · ${members.length} participantes`
        : `NIP-17 GROUP · ${members.length} members`;
    }
    const pubkey = conversation?.pubkey || '';
    return conversation?.agent === true || agentAccess?.status === 'approved'
      ? `AGENT PROTOCOL · ${N.nip19.npubEncode(pubkey)}`
      : N.nip19.npubEncode(pubkey);
  }
  async function updateConversationHeader(conversation) {
    if (!conversation) return;
    state.currentConversation = conversation;
    const agentAccess = conversation.group ? null : await get('agentAccess', conversation.pubkey);
    $('chat-title').dataset.userContent = '';
    $('chat-title').textContent = conversationLabel(conversation);
    $('chat-subtitle').textContent = conversationSubtitle(conversation, agentAccess);
    $('chat-avatar').classList.toggle('group-avatar', conversation.group === true);
    $('chat-avatar').textContent = conversation.group ? '◉' : $('chat-title').textContent.slice(0, 1).toUpperCase();
    $('composer-note').textContent = conversation.group
      ? (state.inboxRelays.length
        ? localized('NIP-17 group · one encrypted copy goes to each participant’s inbox relays', 'Grupo NIP-17 · uma cópia criptografada vai para os relays de recebimento de cada participante')
        : localized('Publish your suggested inbox relays in settings first; each group member also needs a public kind 10050 list.', 'Publique os relays de recebimento sugeridos nas configurações; cada participante também precisa de uma lista pública kind 10050.'))
      : (state.inboxRelays.length
        ? localized('NIP-17 · both people need a public inbox relay list (kind 10050)', 'NIP-17 · as duas pessoas precisam publicar uma lista de relays de recebimento (kind 10050)')
        : localized('Publish your suggested inbox relays in settings to start; the other person must publish theirs too.', 'Publique os relays de recebimento sugeridos nas configurações para começar; a outra pessoa também precisa publicar os dela.'));
  }

  function publicProfileSettingId(pubkey) { return `public-profile-${pubkey}`; }
  function setOptionalProfileField(container, label, value, options = {}) {
    if (!value) { container.replaceChildren(); container.hidden = true; return; }
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd');
    description.dataset.userContent = '';
    if (options.href) {
      const link = document.createElement('a');
      link.dataset.userContent = '';
      link.href = options.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = value;
      description.append(link);
    } else description.textContent = value;
    container.replaceChildren(term, description); container.hidden = false;
  }
  function renderPeerPublicProfile(profile) {
    const status = $('chat-profile-status');
    const fields = $('chat-public-profile-fields');
    if (!profile) {
      fields.hidden = true;
      status.textContent = localized('No public profile has been loaded on this device yet.', 'Nenhum perfil público foi carregado neste aparelho ainda.');
      return;
    }
    const fetched = profile.checkedAt ? new Date(profile.checkedAt).toLocaleString(window.PropertyI18n?.locale() || undefined) : '';
    status.textContent = fetched
      ? localized(`Saved on this device · checked ${fetched}`, `Salvo neste aparelho · consultado em ${fetched}`)
      : localized('Saved on this device', 'Salvo neste aparelho');
    setOptionalProfileField($('chat-profile-name-field'), localized('Name', 'Nome'), profile.displayName || profile.name);
    setOptionalProfileField($('chat-profile-about-field'), localized('About', 'Sobre'), profile.about);
    setOptionalProfileField($('chat-profile-nip05-field'), localized('NIP-05 · not verified', 'NIP-05 · não verificado'), profile.nip05);
    setOptionalProfileField($('chat-profile-website-field'), localized('Website', 'Site'), profile.website, { href: PublicProfile.safeWebsite(profile.website) });
    fields.hidden = ![profile.displayName, profile.name, profile.about, profile.nip05, profile.website].some(Boolean);
  }
  async function openChatDetails() {
    const peer = state.activePeer;
    if (!peer) return;
    const conversation = await get('conversations', peer);
    if (!conversation) return;
    state.chatDetailsPeer = peer;
    $('chat-details-title').dataset.userContent = '';
    $('chat-details-title').textContent = conversationLabel(conversation);
    $('chat-local-name').value = conversation.title || '';
    $('chat-group-details').hidden = conversation.group !== true;
    $('chat-public-profile-section').hidden = conversation.group === true;
    $('load-chat-public-profile').disabled = conversation.group === true;
    if (conversation.group === true) {
      const count = conversation.members?.length || 0;
      $('chat-group-details').textContent = localized(
        `Private NIP-17 group · ${count} members. Group membership and removal controls are not available in this app.`,
        `Grupo privado NIP-17 · ${count} participantes. Este app não oferece controles de associação ou remoção de membros.`
      );
    } else {
      let profile = state.peerProfiles.get(peer);
      if (!profile) {
        const cached = PublicProfile.fromCache(await get('settings', publicProfileSettingId(peer)), peer);
        if (cached) { profile = cached; state.peerProfiles.set(peer, cached); }
      }
      renderPeerPublicProfile(profile);
    }
    $('chat-details-dialog').showModal();
  }
  async function loadChatPublicProfile() {
    const peer = state.chatDetailsPeer;
    if (!peer || !$('chat-details-dialog').open) return;
    const button = $('load-chat-public-profile');
    const status = $('chat-profile-status');
    button.disabled = true;
    button.textContent = localized('Loading profile…', 'Carregando perfil…');
    status.textContent = localized('Checking the relays saved in this conversation and on this device…', 'Consultando os relays salvos nesta conversa e neste aparelho…');
    try {
      const conversation = await get('conversations', peer);
      const hints = state.peerRelayHints.get(peer) || conversation?.relayHints || [];
      const urls = [...new Set([...state.relays, ...hints.map(normalizeRelay)])];
      const events = await fetchEvents({ kinds: [0], authors: [peer], limit: 20 }, 7000, urls);
      const profile = PublicProfile.latest(events, peer, event => N.verifyEvent(event));
      if (!profile) {
        renderPeerPublicProfile(state.peerProfiles.get(peer));
        status.textContent = state.peerProfiles.has(peer)
          ? localized('No newer valid profile was found. The saved profile is still shown.', 'Nenhum perfil válido mais recente foi encontrado. O perfil salvo continua exibido.')
          : localized('No valid public profile was found on these relays.', 'Nenhum perfil público válido foi encontrado nestes relays.');
        return;
      }
      profile.checkedAt = Date.now();
      state.peerProfiles.set(peer, profile);
      await put('settings', { id: publicProfileSettingId(peer), ...profile });
      renderPeerPublicProfile(profile);
      if (state.activePeer === peer) await updateConversationHeader(await get('conversations', peer));
      await renderConversations();
    } catch (error) {
      renderPeerPublicProfile(state.peerProfiles.get(peer));
      status.textContent = localized(`Could not load a profile: ${error.message || 'relay error'}`, `Não foi possível carregar o perfil: ${error.message || 'erro de relay'}`);
    } finally {
      button.disabled = false;
      button.textContent = localized('Load latest public profile', 'Carregar perfil público mais recente');
    }
  }
  async function saveConversationLocalName() {
    const peer = state.chatDetailsPeer;
    if (!peer) return;
    const conversation = await get('conversations', peer);
    if (!conversation) return;
    const updated = { ...conversation, title: $('chat-local-name').value.trim().slice(0, 80) };
    await put('conversations', updated);
    $('chat-details-title').textContent = conversationLabel(updated);
    if (state.activePeer === peer) await updateConversationHeader(updated);
    await renderConversations();
    showToast(localized('Local name saved on this device.', 'Nome local salvo neste aparelho.'));
  }

  function showToast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }
  function localized(en, pt) { return window.PropertyI18n?.language === 'pt-BR' ? pt : en; }
  function secretWarningCopy(finding) {
    const portuguese = window.PropertyI18n?.language === 'pt-BR';
    const copy = {
      mnemonic: portuguese
        ? ['Possível frase-semente de carteira', 'Quem receber esta frase pode assumir o controle da carteira. O conteúdo ainda não foi enviado. Continue apenas se pretende compartilhá-lo.']
        : ['Possible wallet recovery phrase', 'Anyone who receives this phrase may take control of the wallet. The content has not been sent. Continue only if you intend to share it.'],
      nsec: portuguese
        ? ['Possível chave privada Nostr', 'Quem receber esta chave pode publicar em seu nome e acessar mensagens privadas dessa identidade. O conteúdo ainda não foi enviado.']
        : ['Possible Nostr private key', 'Anyone who receives this key may publish as you and access private messages for that identity. The content has not been sent.'],
      'bitcoin-key': portuguese
        ? ['Possível chave privada Bitcoin', 'Quem receber esta chave pode gastar os fundos associados. O conteúdo ainda não foi enviado.']
        : ['Possible Bitcoin private key', 'Anyone who receives this key may spend the associated funds. The content has not been sent.'],
      'hex-key': portuguese
        ? ['Possível chave privada', 'Este texto parece conter uma chave privada. Quem a receber pode controlar a conta associada. O conteúdo ainda não foi enviado.']
        : ['Possible private key', 'This text looks like it contains a private key. Anyone who receives it may control the associated account. The content has not been sent.'],
      'node-login': portuguese
        ? ['Possível credencial de node', 'Quem receber este acesso pode usar o node e talvez movimentar fundos. O conteúdo ainda não foi enviado.']
        : ['Possible node credential', 'Anyone who receives this credential may use the node and could spend its funds. The content has not been sent.'],
      cashu: portuguese
        ? ['Possível token ecash', 'Quem resgatar este token primeiro fica com o valor. Depois de enviado, ele não pode ser recuperado. O conteúdo ainda não foi enviado.']
        : ['Possible ecash token', 'Whoever redeems this token first keeps its value. Once sent, it cannot be recovered. The content has not been sent.']
    };
    return copy[finding.kind] || (portuguese
      ? ['Possível dado secreto', 'Este texto parece conter um segredo. A mensagem ainda não foi enviada.']
      : ['Possible secret', 'This text looks like it contains a secret. The message has not been sent.']);
  }
  function settleSecretSendConfirmation(approved) {
    const resolve = state.pendingSecretResolve;
    state.pendingSecretResolve = null;
    const dialog = $('secret-guard-dialog');
    if (dialog?.open) dialog.close();
    if (resolve) resolve(approved);
  }
  async function requestSecretSendConfirmation(text, peer, recipientLabelOverride = '') {
    const finding = SecretGuard.findSecret(text);
    if (!finding) return true;
    if (state.pendingSecretResolve) return false;
    let recipient = recipientLabelOverride;
    if (!recipient && peer) {
      const conversation = await get('conversations', peer);
      recipient = conversationLabel(conversation || peer);
      if (conversation?.group) {
        const count = conversation.members?.length || 0;
        recipient = localized(`${recipient} · ${count} group members`, `${recipient} · ${count} participantes`);
      }
    }
    const [title, body] = secretWarningCopy(finding);
    $('secret-guard-dialog').dataset.kind = finding.kind;
    $('secret-guard-title').textContent = title;
    $('secret-guard-copy').textContent = body;
    $('secret-guard-target').textContent = recipient
      ? localized(`Recipients: ${recipient}`, `Destinatários: ${recipient}`)
      : localized('Destination: public relays', 'Destino: relays públicos');
    return new Promise(resolve => {
      state.pendingSecretResolve = resolve;
      const dialog = $('secret-guard-dialog');
      dialog.showModal();
      $('secret-guard-cancel').focus();
    });
  }
  async function renderShareInbox() {
    const items = await ShareInbox.list();
    state.shareItems = items;
    const button = $('share-inbox-button');
    button.hidden = items.length === 0;
    button.classList.toggle('hidden', items.length === 0);
    button.textContent = items.length ? `↧${items.length}` : '↧';
    button.setAttribute('aria-label', items.length ? localized(`Shared items, ${items.length} pending`, `${items.length} itens compartilhados pendentes`) : localized('Shared items', 'Itens compartilhados'));
    const itemSelect = $('share-item-select');
    const previousItem = itemSelect.value;
    itemSelect.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('option');
      empty.textContent = localized('No shared items are waiting.', 'Nenhum item compartilhado está aguardando.');
      empty.disabled = true;
      itemSelect.append(empty);
    } else {
      for (const [index, item] of items.entries()) {
        const option = document.createElement('option');
        option.value = String(item.id);
        option.dataset.userContent = '';
        const label = item.tooLarge ? localized('Oversized shared item', 'Item compartilhado grande demais') : (item.title || ShareInbox.formatText(item).split('\n')[0] || localized(`Shared item ${index + 1}`, `Item compartilhado ${index + 1}`));
        option.textContent = label.slice(0, 120);
        itemSelect.append(option);
      }
      itemSelect.value = items.some(item => String(item.id) === previousItem) ? previousItem : String(items[0].id);
    }
    const conversationSelect = $('share-conversation-select');
    const previousConversation = conversationSelect.value;
    conversationSelect.replaceChildren();
    const conversations = (await all('conversations')).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    for (const conversation of conversations) {
      const option = document.createElement('option');
      option.value = conversation.pubkey;
      option.dataset.userContent = '';
      option.textContent = conversationLabel(conversation);
      conversationSelect.append(option);
    }
    if (conversations.some(item => item.pubkey === previousConversation)) conversationSelect.value = previousConversation;
    if (!conversations.length) {
      const empty = document.createElement('option');
      empty.textContent = localized('No conversations yet', 'Nenhuma conversa ainda');
      empty.disabled = true;
      conversationSelect.append(empty);
    }
    renderSelectedShare();
  }
  function renderSelectedShare() {
    const item = state.shareItems.find(candidate => String(candidate.id) === $('share-item-select').value);
    const preview = $('share-item-preview');
    const note = $('share-item-note');
    const notice = $('share-overflow-notice');
    const tooLarge = item?.tooLarge === true;
    preview.textContent = item && !tooLarge ? ShareInbox.formatText(item) : '';
    note.textContent = item?.truncated
      ? localized('The shared content was shortened to fit a private message. Review it before sending.', 'O conteúdo foi encurtado para caber em uma mensagem privada. Revise antes de enviar.')
      : '';
    if (tooLarge) {
      notice.textContent = localized('This shared item exceeded the size limit. Its content was not stored.', 'Este item compartilhado excedeu o limite de tamanho. O conteúdo não foi armazenado.');
      notice.classList.remove('hidden');
    } else {
      notice.textContent = '';
      notice.classList.add('hidden');
    }
    const usable = !!item && !tooLarge && !!ShareInbox.formatText(item);
    $('share-use-draft').disabled = !usable || !$('share-conversation-select').value;
    $('share-new-chat').disabled = !usable;
    $('share-discard').disabled = !item;
  }
  async function openShareInbox(launchAction = '') {
    try {
      await renderShareInbox();
      if (launchAction === 'share-full') {
        $('share-dialog-status').textContent = localized('The local share inbox is full. Discard an item before sharing another.', 'A caixa local de compartilhamento está cheia. Descarte um item antes de compartilhar outro.');
      } else if (launchAction === 'share-error') {
        $('share-dialog-status').textContent = localized('Property could not save this shared item locally. Check device storage and try again.', 'O Property não conseguiu salvar este item localmente. Verifique o armazenamento do aparelho e tente novamente.');
      } else {
        $('share-dialog-status').textContent = state.shareItems.length
          ? localized('Choose a conversation, review the text, then send it yourself.', 'Escolha uma conversa, revise o texto e envie quando quiser.')
          : localized('No shared content is waiting on this device.', 'Não há conteúdo compartilhado aguardando neste aparelho.');
      }
      renderSelectedShare();
      if (!$('share-dialog').open) $('share-dialog').showModal();
    } catch {
      $('share-dialog-status').textContent = localized('Could not open the local share inbox. Your shared content was not sent.', 'Não foi possível abrir a caixa local. O conteúdo compartilhado não foi enviado.');
      if (!$('share-dialog').open) $('share-dialog').showModal();
    }
  }
  async function prepareShareDraft(peer, id) {
    const item = state.shareItems.find(candidate => String(candidate.id) === String(id)) || (await ShareInbox.list()).find(candidate => String(candidate.id) === String(id));
    if (!item || item.tooLarge) return;
    const text = ShareInbox.formatText(item);
    if (!text) return;
    await selectConversation(peer);
    await saveChatDraft(peer, $('message-input').value).catch(() => {});
    state.shareDraftId = item.id;
    state.shareDraftPeer = peer;
    const input = $('message-input');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    $('share-dialog').close();
    showToast(localized('Draft ready. Review it and tap Send when you choose.', 'Rascunho pronto. Revise e toque em Enviar quando decidir.'));
  }
  function showError(id, message = '') { $(id).textContent = message; }
  function showAuthPane(name) {
    for (const pane of ['auth-choice', 'auth-setup', 'auth-import']) $(pane).classList.toggle('hidden', pane !== name);
    showError('auth-error'); showError('setup-error'); showError('import-error');
  }
  function setStorageReady(ready, message = '') {
    state.storageReady = ready;
    document.querySelectorAll('[data-requires-storage]').forEach(button => { button.disabled = !ready; });
    const status = $('storage-status');
    if (!status) return;
    status.textContent = message || 'Preparando armazenamento local neste aparelho…';
    status.classList.toggle('hidden', ready);
  }
  function setConnectionStatus() {
    const open = [...state.sockets.values()].filter(item => item.socket.readyState === WebSocket.OPEN).length;
    const relayCount = effectiveRelayUrls().length;
    const dot = $('connection-dot');
    dot.classList.toggle('live', open > 0 && open === relayCount);
    dot.classList.toggle('partial', open > 0 && open < relayCount);
    $('connection-label').textContent = open === 0 ? 'offline' : `${open}/${relayCount} relay${relayCount === 1 ? '' : 's'}`;
    $('relay-count').textContent = `${state.relays.length} relay${state.relays.length === 1 ? '' : 's'}`;
    $('relay-summary-text').textContent = open
      ? window.PropertyI18n?.language === 'pt-BR' ? `${open} conectado${open === 1 ? '' : 's'}` : `${open} connected`
      : relayCount === 0
        ? (window.PropertyI18n?.language === 'pt-BR' ? 'Adicione um relay para sincronizar' : 'Add a relay to sync')
        : state.autoSelectedRelays
          ? (window.PropertyI18n?.language === 'pt-BR' ? 'Relays sugeridos; toque para ajustar' : 'Suggested relays; tap to change')
          : (window.PropertyI18n?.language === 'pt-BR' ? 'Toque para configurar' : 'Tap to configure');
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
        for (const [name, keyPath] of [['vault', 'id'], ['settings', 'id'], ['conversations', 'pubkey'], ['messages', 'id'], ['drafts', 'id'], ['agentInvites', 'id'], ['agentAccess', 'pubkey']]) {
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
  async function saveChatDraft(peer, text) {
    if (!state.pubkey || !peer || (state.editingMessage && state.editingMessage.peer === peer) || (state.shareDraftId && state.shareDraftPeer === peer)) return;
    const id = ChatDrafts.idFor(state.pubkey, peer);
    const record = ChatDrafts.createRecord(state.pubkey, peer, text);
    if (record) await put('drafts', record);
    else await del('drafts', id);
  }
  async function loadChatDraft(peer) {
    if (!state.pubkey || !peer) return '';
    const record = await get('drafts', ChatDrafts.idFor(state.pubkey, peer));
    return ChatDrafts.readRecord(record, state.pubkey, peer);
  }
  function resizeMessageInput(input = $('message-input')) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  }
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
    const knownConversations = (await all('conversations')).slice(0, 100);
    await Promise.all(knownConversations.map(async conversation => {
      const [peerSettings, profileCache] = await Promise.all([
        get('settings', `peer-inbox-${conversation.pubkey}`),
        conversation.group === true ? Promise.resolve(null) : get('settings', publicProfileSettingId(conversation.pubkey))
      ]);
      if (peerSettings?.values?.length) state.peerInboxRelays.set(conversation.pubkey, peerSettings.values.map(normalizeRelay).slice(0, 3));
      if (conversation.group !== true) {
        const cached = PublicProfile.fromCache(profileCache, conversation.pubkey);
        if (cached) state.peerProfiles.set(conversation.pubkey, cached);
      }
    }));
    await connectAllRelays();
    await renderConversations();
    await renderShareInbox().catch(() => {});
    if (state.activePeer) await selectConversation(state.activePeer);
    else if (window.innerWidth <= 800 && knownConversations.length) setMobileConversationListOpen(true);
    discoverInboxRelays(state.pubkey).then(async relays => {
      if (!state.inboxRelays.length && relays.length) {
        state.inboxRelays = relays;
        await connectAllRelays();
      }
    }).catch(() => {});
    if (state.pendingContactIntent) {
      const contact = state.pendingContactIntent;
      state.pendingContactIntent = '';
      state.pendingLaunchAction = '';
      openContactIntent(contact);
    } else if (state.pendingLaunchAction) {
      const action = state.pendingLaunchAction;
      state.pendingLaunchAction = '';
      if (action === 'new-chat') $('new-chat-dialog').showModal();
      else if (['share', 'share-full', 'share-error'].includes(action)) openShareInbox(action);
      else setActiveView(action);
    }
  }
  async function refreshLocalProfile() {
    const profile = await get('settings', `profile-${state.pubkey}`) || { id: `profile-${state.pubkey}`, name: '' };
    $('profile-name').value = profile.name || '';
    $('profile-initial').textContent = profile.name?.slice(0, 1)?.toUpperCase() || 'L';
  }
  function openContactIntent(value) {
    $('peer-input').value = value;
    $('peer-name-input').value = '';
    $('peer-relays-input').value = '';
    $('agent-mode').checked = false;
    showError('new-chat-error');
    try {
      const contact = Contact.parsePublicKey(value);
      $('peer-input').value = N.nip19.npubEncode(contact.pubkey);
      $('peer-relays-input').value = contact.relayHints.map(normalizeRelay).join('\n');
    } catch (error) {
      showError('new-chat-error', error.message || localized('Check the shared public contact.', 'Confira o contato público compartilhado.'));
    }
    $('new-chat-dialog').showModal();
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
    state.autoSelectedRelays = false;
    await put('settings', { id: 'relays', values: state.relays, autoSelected: false });
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
  async function resolveInboxRelaysFor(pubkey) {
    if (pubkey === state.pubkey) {
      if (!state.inboxRelays.length) state.inboxRelays = await discoverInboxRelays(state.pubkey);
      if (!state.inboxRelays.length) throw new Error(localized('Open relay settings, review the suggested inbox relays, and publish your public kind 10050 list before sending.', 'Abra as configurações de relays, confira os relays de recebimento sugeridos e publique sua lista pública kind 10050 antes de enviar.'));
      return state.inboxRelays;
    }
    let relays = state.peerInboxRelays.get(pubkey) || [];
    if (!relays.length) {
      const savedHints = state.peerRelayHints.get(pubkey) || (await get('conversations', pubkey))?.relayHints || [];
      if (savedHints.length) state.peerRelayHints.set(pubkey, savedHints);
      relays = await discoverInboxRelays(pubkey, savedHints);
      if (!relays.length) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? `Não encontrei a lista de recebimento kind 10050 de npub…${N.nip19.npubEncode(pubkey).slice(-8)}.` : `Could not find the public kind 10050 inbox list for npub…${N.nip19.npubEncode(pubkey).slice(-8)}.`);
      state.peerInboxRelays.set(pubkey, relays);
      await put('settings', { id: `peer-inbox-${pubkey}`, values: relays });
    }
    return relays;
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
      if (state.bridgeEnabled && state.relays.includes(url)) refreshBridgeSubscriptions();
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
    const delay = Math.min(25000, 1000 * (2 ** Math.min(count - 1, 5))) + Math.floor(Math.random() * 500);
    state.reconnectTimers.set(url, setTimeout(() => connectRelay(url), delay));
  }
  async function connectAllRelays() {
    await closeRelays();
    if (!state.pubkey && !state.bridgeEnabled) return;
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
    if (!rumor || ![5, 7, 14].includes(rumor.kind) || typeof rumor.content !== 'string' || rumor.content.length > 20000) return;
    const members = rumorParticipants(rumor);
    if (members.length < 2 || !members.includes(state.pubkey)) return;
    const group = members.length > 2;
    if (group && members.length > MAX_NIP17_GROUP_MEMBERS) return;
    const peer = group ? groupConversationId(members) : members.find(member => member !== state.pubkey);
    if (!peer) return;
    const edit = rumor.kind === 14 ? MessageEdits.editDescriptor(rumor) : null;
    if (rumor.kind === 5) return; // NIP-17 edit tombstones are control events; the replacement carries the visible text.
    if (rumor.pubkey === state.pubkey && !edit) return;
    const agentAccess = group ? null : await get('agentAccess', peer);
    if (agentAccess?.status === 'blocked') return;
    if (rumor.kind === 7) {
      const targetTag = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'e' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) : null;
      if (!targetTag || !rumor.content || rumor.content.length > 64) return;
      const reactionId = rumor.id || event.id;
      if (!reactionId) return;
      const id = `reaction:${peer}:${reactionId}`;
      if (await get('messages', id)) return;
      await put('messages', { id, peer, kind: 7, targetEventId: targetTag[1], reaction: rumor.content, reactorPubkey: rumor.pubkey, senderPubkey: rumor.pubkey, createdAt: rumor.created_at * 1000, direction: 'received', status: 'delivered', nostrEventId: reactionId });
      if (state.activePeer === peer) await renderMessages(peer);
      return;
    }
    const existingConversation = await get('conversations', peer);
    const subject = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'subject' && typeof tag[1] === 'string' && tag[1].trim() && tag[1].length <= 80)?.[1].trim() : '';
    let text = rumor.content;
    let parsedAgentMessage = null;
    let agentMessageError = '';
    const isAgentProtocol = !group && rumor.content.includes(AgentMessages.PROTOCOL);
    if (isAgentProtocol) {
      try {
        parsedAgentMessage = AgentMessages.decodeEnvelope(rumor.content);
        const expectedConversation = await AgentMessages.conversationId(state.pubkey, peer);
        if (parsedAgentMessage.conversationId !== expectedConversation) throw new Error('Identificador de conversa inválido.');
        text = parsedAgentMessage.body;
      } catch (error) {
        text = 'Esta mensagem do agente usa um formato que esta versão não reconhece. O conteúdo não foi executado.';
        agentMessageError = error?.code || 'invalid-agent-envelope';
      }
    }
    const fromAgent = Boolean(parsedAgentMessage || agentMessageError);
    if (edit && fromAgent) return;
    const replyTag = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'e' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) : null;
    const eventId = rumor.id || event.id;
    const senderDirection = rumor.pubkey === state.pubkey ? 'sent' : 'received';
    let message;
    if (edit) {
      const incoming = {
        id: `edit:${peer}:${edit.rootId}`, peer, text: rumor.content, senderPubkey: rumor.pubkey,
        createdAt: rumor.created_at * 1000, direction: senderDirection, status: 'delivered',
        nostrEventId: eventId, edit,
        ...(replyTag ? { replyToId: replyTag[1] } : {})
      };
      const result = MessageEdits.applyIncomingEdit(await all('messages'), incoming, state.pubkey);
      if (!result.applied) return;
      message = result.message;
      await put('messages', message);
    } else {
      const id = parsedAgentMessage ? `agent:${peer}:${parsedAgentMessage.messageId}` : eventId;
      if (await get('messages', id)) return;
      const original = { id, peer, text, senderPubkey: rumor.pubkey, createdAt: rumor.created_at * 1000, direction: senderDirection, status: senderDirection === 'sent' ? 'sent' : 'delivered', nostrEventId: eventId, ...(replyTag ? { replyToId: replyTag[1] } : {}), ...(fromAgent ? { fromAgent: true } : {}), ...(parsedAgentMessage ? { agentMessageId: parsedAgentMessage.messageId, inReplyTo: parsedAgentMessage.inReplyTo } : {}), ...(agentMessageError ? { agentMessageError } : {}) };
      const merged = MessageEdits.mergeOriginalBehindEdit(await all('messages'), original, state.pubkey);
      message = merged?.message || original;
      await put('messages', message);
    }
    const previous = existingConversation || { pubkey: peer, title: '' };
    const isLatest = !previous.lastAt || message.createdAt >= previous.lastAt;
    const updatedConversation = { ...previous, ...(group ? { group: true, members } : {}), ...(subject ? { title: subject } : {}), ...(fromAgent ? { agent: true } : {}), ...(isLatest ? { lastMessage: message.text, lastAt: message.createdAt } : {}) };
    await put('conversations', updatedConversation);
    await renderConversations();
    if (state.activePeer === peer) { await updateConversationHeader(updatedConversation); await updateAgentBlockControl(peer); await renderMessages(peer); }
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
  function startBridgeSubscription(url, since) {
    if (!bridge || !state.bridgeEnabled || !state.relays.includes(url) || state.bridgeSubscriptions.has(url)) return;
    const id = `bridge-${crypto.randomUUID()}`;
    state.bridgeSubscriptions.set(url, id);
    if (!relayMessage(url, ['REQ', id, bridge.filter(since)])) state.bridgeSubscriptions.delete(url);
  }
  function refreshBridgeSubscriptions() {
    if (!bridge || !state.bridgeEnabled) return;
    const since = Math.max(0, Math.floor(Date.now() / 1000) - 300);
    for (const url of state.relays) {
      if (state.sockets.get(url)?.socket.readyState !== WebSocket.OPEN) continue;
      const previous = state.bridgeSubscriptions.get(url);
      if (previous) relayMessage(url, ['CLOSE', previous]);
      state.bridgeSubscriptions.delete(url);
      startBridgeSubscription(url, since);
    }
  }
  function stopBridgeSubscriptions() {
    for (const [url, id] of state.bridgeSubscriptions) relayMessage(url, ['CLOSE', id]);
    state.bridgeSubscriptions.clear();
  }
  async function forwardRelayEvent(sourceRelay, event) {
    const targets = bridge.targets(event, sourceRelay, state.relays);
    if (!targets.length) return;
    if (!await publishToRelays(event, targets)) bridge.releaseForRetry(event.id);
  }
  async function forwardInboxGiftWrap(sourceRelay, event) {
    const targets = bridge.privateTargets(event, sourceRelay, state.inboxRelays, state.pubkey);
    if (!targets.length) return;
    if (!await publishToRelays(event, targets)) bridge.releaseForRetry(event.id);
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
  function conversationFolderSettingsId() { return `conversation-folders-${state.pubkey}`; }
  async function loadConversationFolders() {
    if (!state.pubkey) return FolderStore.normalize(null);
    state.conversationFolders = FolderStore.normalize(await get('settings', conversationFolderSettingsId()));
    return state.conversationFolders;
  }
  async function saveConversationFolders(config) {
    state.conversationFolders = FolderStore.normalize(config);
    await put('settings', { id: conversationFolderSettingsId(), ...state.conversationFolders });
    await renderConversations();
  }
  function openFolderEditor(folderId = '') {
    const folder = state.conversationFolders?.folders.find(item => item.id === folderId);
    state.folderEditingId = folder?.id || '';
    $('folder-dialog-title').textContent = folder ? localized('Rename folder', 'Renomear pasta') : localized('Create a folder', 'Criar pasta');
    $('folder-name-input').value = folder?.name || '';
    $('folder-save').textContent = folder ? localized('Save name', 'Salvar nome') : localized('Create folder', 'Criar pasta');
    showError('folder-error');
    $('folder-dialog').showModal();
    $('folder-name-input').focus();
  }
  function openMoveConversationFolder(conversationId) {
    state.folderMovingConversation = conversationId;
    const select = $('folder-move-select');
    select.replaceChildren();
    const other = document.createElement('option'); other.value = ''; other.textContent = localized('Other chats', 'Outras conversas'); select.append(other);
    for (const folder of state.conversationFolders?.folders || []) {
      const option = document.createElement('option'); option.value = folder.id; option.dataset.userContent = ''; option.textContent = folder.name; select.append(option);
    }
    select.value = state.conversationFolders?.assignments[conversationId] || '';
    showError('move-folder-error');
    $('move-folder-dialog').showModal();
  }
  function folderErrorText(error) {
    const messages = {
      'folder-name-required': localized('Enter a folder name.', 'Informe o nome da pasta.'),
      'folder-name-too-long': localized('Folder names can contain up to 40 characters.', 'O nome da pasta pode ter até 40 caracteres.'),
      'folder-name-duplicate': localized('A folder with this name already exists.', 'Já existe uma pasta com esse nome.'),
      'folder-limit-reached': localized('Property supports up to 24 folders on this device.', 'O Property aceita até 24 pastas neste aparelho.'),
      'folder-not-found': localized('This folder no longer exists.', 'Esta pasta não existe mais.'),
      'conversation-id-invalid': localized('This conversation could not be moved.', 'Não foi possível mover esta conversa.')
    };
    return messages[error?.message] || localized('Could not update folders on this device.', 'Não foi possível atualizar as pastas neste aparelho.');
  }
  async function saveFolderEditor() {
    try {
      const config = state.folderEditingId
        ? FolderStore.rename(state.conversationFolders, state.folderEditingId, $('folder-name-input').value)
        : FolderStore.create(state.conversationFolders, $('folder-name-input').value, `folder-${crypto.randomUUID()}`);
      await saveConversationFolders(config);
      $('folder-dialog').close();
      state.folderEditingId = '';
    } catch (error) { showError('folder-error', folderErrorText(error)); }
  }
  async function saveMovedConversationFolder() {
    try {
      await saveConversationFolders(FolderStore.move(state.conversationFolders, state.folderMovingConversation, $('folder-move-select').value));
      $('move-folder-dialog').close();
      state.folderMovingConversation = '';
    } catch (error) { showError('move-folder-error', folderErrorText(error)); }
  }
  async function deleteConversationFolder(folder) {
    const message = localized(`Delete “${folder.name}”? Its conversations will return to Other chats.`, `Excluir “${folder.name}”? As conversas voltarão para Outras conversas.`);
    if (!window.confirm(message)) return;
    try { await saveConversationFolders(FolderStore.remove(state.conversationFolders, folder.id)); }
    catch (error) { showToast(folderErrorText(error)); }
  }
  async function moveConversationFolder(folder, direction) {
    try { await saveConversationFolders(FolderStore.reorder(state.conversationFolders, folder.id, direction)); }
    catch (error) { showToast(folderErrorText(error)); }
  }
  function renderConversationFolderMenu(folder, index, total) {
    const details = document.createElement('details'); details.className = 'folder-actions';
    const summary = document.createElement('summary'); summary.textContent = '···'; summary.setAttribute('aria-label', localized('Folder options', 'Opções da pasta')); summary.title = summary.getAttribute('aria-label');
    const menu = document.createElement('div'); menu.className = 'folder-actions-menu';
    const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = localized('Rename', 'Renomear'); rename.addEventListener('click', () => { details.open = false; openFolderEditor(folder.id); });
    const up = document.createElement('button'); up.type = 'button'; up.textContent = localized('Move up', 'Mover para cima'); up.disabled = index === 0; up.addEventListener('click', () => { details.open = false; moveConversationFolder(folder, -1); });
    const down = document.createElement('button'); down.type = 'button'; down.textContent = localized('Move down', 'Mover para baixo'); down.disabled = index === total - 1; down.addEventListener('click', () => { details.open = false; moveConversationFolder(folder, 1); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-text'; remove.textContent = localized('Delete folder', 'Excluir pasta'); remove.addEventListener('click', () => { details.open = false; deleteConversationFolder(folder); });
    menu.append(rename, up, down, remove); details.append(summary, menu); return details;
  }
  async function renderConversationRow(conversation) {
    const row = document.createElement('div'); row.className = 'conversation-row';
    const button = document.createElement('button'); button.className = `conversation-item${conversation.pubkey === state.activePeer ? ' active' : ''}`; button.type = 'button';
    const label = conversationLabel(conversation);
    const avatar = document.createElement('span'); avatar.className = `avatar${conversation.group ? ' group-avatar' : ''}`; avatar.textContent = conversation.group ? '◉' : label.slice(0, 1).toUpperCase();
    const info = document.createElement('span'); info.className = 'conversation-preview';
    const title = document.createElement('strong'); title.dataset.userContent = ''; title.textContent = label;
    const preview = document.createElement('small'); preview.dataset.userContent = ''; preview.textContent = RichText.preview(conversation.lastMessage || (conversation.group ? `${conversation.members?.length || 0} ${window.PropertyI18n?.language === 'pt-BR' ? 'participantes' : 'members'}` : conversation.pubkey.slice(0, 16)));
    info.append(title);
    const agentAccess = conversation.group ? null : await get('agentAccess', conversation.pubkey);
    if (conversation.agent || agentAccess?.status === 'approved') { const agentBadge = document.createElement('small'); agentBadge.className = 'agent-chat-badge'; agentBadge.textContent = localized('AGENT PROTOCOL', 'PROTOCOLO DE AGENTE'); info.append(agentBadge); }
    info.append(preview); button.append(avatar, info); button.addEventListener('click', () => selectConversation(conversation.pubkey));
    const details = document.createElement('details'); details.className = 'conversation-folder-actions';
    const summary = document.createElement('summary'); summary.textContent = '···'; summary.setAttribute('aria-label', localized('Conversation options', 'Opções da conversa')); summary.title = summary.getAttribute('aria-label');
    const menu = document.createElement('div'); menu.className = 'folder-actions-menu';
    const move = document.createElement('button'); move.type = 'button'; move.textContent = localized('Move to folder…', 'Mover para uma pasta…');
    move.addEventListener('click', () => { details.open = false; openMoveConversationFolder(conversation.pubkey); });
    menu.append(move); details.append(summary, menu); row.append(button, details); return row;
  }
  async function renderConversations() {
    const conversations = (await all('conversations')).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const search = $('conversation-search').value.trim().toLowerCase();
    const list = $('conversation-list');
    list.replaceChildren();
    const filtered = conversations.filter(item => (conversationLabel(item) + item.lastMessage).toLowerCase().includes(search));
    const config = await loadConversationFolders();
    if (!filtered.length && search) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = localized('No conversations found.', 'Nenhuma conversa encontrada.'); list.append(empty); return;
    }
    if (!filtered.length && !config.folders.length) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = localized('Your conversations will appear here.', 'Suas conversas aparecerão aqui.'); list.append(empty); return;
    }
    const sections = FolderStore.sections(filtered, config, search);
    for (const [index, section] of sections.entries()) {
      const sectionNode = document.createElement('section'); sectionNode.className = 'conversation-folder-section';
      if (section.isFolder || section.isOther) {
        const header = document.createElement('div'); header.className = 'folder-heading-row';
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'folder-toggle';
        const name = section.isOther ? localized('Other chats', 'Outras conversas') : section.name;
        const title = document.createElement('span'); title.className = 'folder-heading-name'; title.dataset.userContent = ''; title.textContent = name;
        const count = document.createElement('span'); count.className = 'folder-count'; count.textContent = String(section.conversations.length);
        const arrow = document.createElement('span'); arrow.className = 'folder-chevron'; arrow.textContent = section.collapsed ? '›' : '⌄';
        toggle.setAttribute('aria-expanded', String(!section.collapsed)); toggle.setAttribute('aria-label', `${section.collapsed ? localized('Expand', 'Expandir') : localized('Collapse', 'Recolher')} ${name}`);
        toggle.append(arrow, title, count);
        if (section.isFolder) {
          toggle.addEventListener('click', () => {
            const next = FolderStore.setCollapsed(state.conversationFolders, section.id, !section.collapsed);
            saveConversationFolders(next).catch(error => showToast(folderErrorText(error)));
          });
          header.append(toggle, renderConversationFolderMenu(section, index, config.folders.length));
        } else {
          toggle.disabled = true; header.append(toggle);
        }
        sectionNode.append(header);
      }
      if (!section.collapsed) {
        if (section.isFolder && !section.conversations.length && filtered.length) {
          const empty = document.createElement('p'); empty.className = 'conversation-empty folder-empty'; empty.textContent = localized('No conversations in this folder yet.', 'Ainda não há conversas nesta pasta.'); sectionNode.append(empty);
        } else {
          for (const conversation of section.conversations) sectionNode.append(await renderConversationRow(conversation));
        }
      }
      list.append(sectionNode);
    }
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = localized('Your conversations will appear here.', 'Suas conversas aparecerão aqui.'); list.append(empty);
    }
  }
  async function selectConversation(pubkey) {
    const previousPeer = state.activePeer;
    const changed = previousPeer !== pubkey;
    if (changed) {
      cancelMessageEdit();
      closeMessageSearch(false);
      if (previousPeer) await saveChatDraft(previousPeer, $('message-input').value).catch(() => {});
    }
    if (state.shareDraftId && state.shareDraftPeer !== pubkey) { state.shareDraftId = ''; state.shareDraftPeer = ''; }
    state.activePeer = pubkey;
    if (changed) {
      const input = $('message-input');
      input.value = '';
      resizeMessageInput(input);
      const loadSequence = ++state.draftLoadSequence;
      const savedDraft = await loadChatDraft(pubkey).catch(() => '');
      if (state.activePeer === pubkey && state.draftLoadSequence === loadSequence && !input.value) {
        input.value = savedDraft;
        resizeMessageInput(input);
      }
    }
    state.currentConversation = null;
    state.replyingTo = null;
    updateReplyContext();
    $('empty-conversation').classList.add('hidden');
    $('conversation-pane').classList.remove('hidden');
    const conversation = await get('conversations', pubkey);
    await updateConversationHeader(conversation);
    await updateAgentBlockControl(pubkey);
    await renderMessages(pubkey);
    await renderConversations();
    if (window.innerWidth <= 800) {
      setActiveView('messages');
      setMobileConversationListOpen(false, { restoreFocus: true });
    }
  }
  async function updateAgentBlockControl(pubkey) {
    const conversation = await get('conversations', pubkey);
    const access = conversation?.group ? null : await get('agentAccess', pubkey);
    const agentConversation = conversation?.agent === true || access?.status === 'approved' || access?.status === 'blocked';
    const button = $('agent-block-button');
    const blocked = access?.status === 'blocked';
    button.classList.toggle('hidden', conversation?.group === true || !agentConversation);
    button.setAttribute('aria-label', blocked ? 'Desbloquear agente' : 'Bloquear agente');
    button.title = blocked ? 'Desbloquear agente' : 'Bloquear agente';
    $('message-input').disabled = blocked;
    document.querySelector('#send-form button[type="submit"]').disabled = blocked;
    $('message-input').placeholder = blocked ? 'Agente bloqueado neste aparelho' : 'Escreva uma mensagem privada…';
  }
  async function toggleAgentBlock() {
    const peer = state.activePeer;
    if (!peer) return;
    const current = await get('agentAccess', peer);
    if (current?.status === 'blocked') {
      await del('agentAccess', peer);
      showToast('Agente desbloqueado neste aparelho.');
    } else {
      await put('agentAccess', { pubkey: peer, status: 'blocked', blockedAt: Date.now() });
      showToast('Agente bloqueado neste aparelho. O histórico foi mantido.');
    }
    await updateAgentBlockControl(peer);
    await renderConversations();
  }
  function setMessageSearchText(node, value, ranges) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) fragment.append(document.createTextNode(value.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = 'message-search-hit';
      mark.textContent = value.slice(start, end);
      fragment.append(mark);
      cursor = end;
    }
    if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
    node.replaceChildren(fragment);
  }
  function refreshMessageSearch({ resetIndex = false, scroll = false } = {}) {
    const input = $('message-search-input');
    const query = input?.value || '';
    const portuguese = window.PropertyI18n?.language === 'pt-BR';
    input.setAttribute('aria-label', portuguese ? 'Buscar nesta conversa' : 'Search in this conversation');
    input.placeholder = portuguese ? 'Buscar nesta conversa' : 'Search in this conversation';
    $('message-search-button').setAttribute('aria-label', portuguese ? 'Buscar nesta conversa' : 'Search in this conversation');
    $('message-search-button').title = portuguese ? 'Buscar nesta conversa' : 'Search in this conversation';
    $('message-search-older').setAttribute('aria-label', portuguese ? 'Resultado anterior' : 'Older match');
    $('message-search-older').title = portuguese ? 'Resultado anterior' : 'Older match';
    $('message-search-newer').setAttribute('aria-label', portuguese ? 'Próximo resultado' : 'Newer match');
    $('message-search-newer').title = portuguese ? 'Próximo resultado' : 'Newer match';
    $('message-search-close').setAttribute('aria-label', portuguese ? 'Fechar busca' : 'Close search');
    $('message-search-close').title = portuguese ? 'Fechar busca' : 'Close search';
    const previousId = state.messageSearchIds[state.messageSearchIndex] || '';
    const rows = [...$('messages').querySelectorAll('.message-row')];
    const items = rows.map(row => ({ id: row.dataset.messageId, text: row.querySelector('.message-bubble')?.textContent || '' }));
    const ids = MessageSearch.findMessageIds(items, query);
    state.messageSearchIds = ids;
    if (!query.trim() || !ids.length) state.messageSearchIndex = -1;
    else if (resetIndex || !ids.includes(previousId)) state.messageSearchIndex = ids.length - 1;
    else state.messageSearchIndex = ids.indexOf(previousId);
    const currentId = ids[state.messageSearchIndex] || '';
    for (const row of rows) {
      const bubble = row.querySelector('.message-bubble');
      if (!bubble) continue;
      const value = bubble.textContent || '';
      const ranges = ids.includes(row.dataset.messageId) ? MessageSearch.matchRanges(value, query) : [];
      setMessageSearchText(bubble, value, ranges);
      row.classList.toggle('message-search-result', ids.includes(row.dataset.messageId));
      row.classList.toggle('message-search-current', row.dataset.messageId === currentId);
    }
    const count = $('message-search-count');
    if (count) {
      count.textContent = !query.trim() ? '' : !ids.length
        ? (portuguese ? 'Nenhuma mensagem' : 'No messages')
        : portuguese ? `${state.messageSearchIndex + 1} de ${ids.length}` : `${state.messageSearchIndex + 1} of ${ids.length}`;
    }
    $('message-search-older').disabled = !ids.length;
    $('message-search-newer').disabled = !ids.length;
    $('message-search-button').setAttribute('aria-expanded', String(state.messageSearchOpen));
    if (scroll && currentId) rows.find(row => row.dataset.messageId === currentId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function openMessageSearch() {
    if (!state.activePeer) return;
    state.messageSearchOpen = true;
    $('message-search-bar').classList.remove('hidden');
    $('message-search-input').value = '';
    refreshMessageSearch({ resetIndex: true });
    $('message-search-input').focus();
  }
  function closeMessageSearch(returnFocus = true) {
    state.messageSearchOpen = false;
    $('message-search-bar').classList.add('hidden');
    $('message-search-input').value = '';
    refreshMessageSearch();
    if (returnFocus) $('message-search-button').focus();
  }
  function moveMessageSearchResult(direction) {
    const total = state.messageSearchIds.length;
    if (!total) return;
    state.messageSearchIndex = (state.messageSearchIndex + direction + total) % total;
    refreshMessageSearch({ scroll: true });
  }
  async function renderMessages(peer) {
    const entries = (await all('messages')).filter(message => message.peer === peer).sort((a, b) => a.createdAt - b.createdAt);
    const messages = entries.filter(message => message.kind !== 7);
    const messageByEventId = new Map();
    for (const message of messages) for (const eventId of MessageEdits.eventIds(message)) messageByEventId.set(eventId, message);
    const latestReactions = new Map();
    for (const reaction of entries.filter(message => message.kind === 7)) {
      if (!/^[0-9a-f]{64}$/i.test(reaction.targetEventId || '')) continue;
      const actor = reaction.reactorPubkey || (reaction.direction === 'sent' ? state.pubkey : reaction.senderPubkey || peer);
      const canonicalTarget = messageByEventId.get(reaction.targetEventId)?.id || reaction.targetEventId;
      const key = `${canonicalTarget}:${actor}`;
      const previous = latestReactions.get(key);
      if (!previous || reaction.createdAt > previous.createdAt || (reaction.createdAt === previous.createdAt && reaction.id > previous.id)) latestReactions.set(key, reaction);
    }
    const reactionsByTarget = new Map();
    for (const reaction of latestReactions.values()) {
      const canonicalTarget = messageByEventId.get(reaction.targetEventId)?.id || reaction.targetEventId;
      const counts = reactionsByTarget.get(canonicalTarget) || new Map();
      counts.set(reaction.reaction, (counts.get(reaction.reaction) || 0) + 1);
      reactionsByTarget.set(canonicalTarget, counts);
    }
    const conversation = await get('conversations', peer);
    const container = $('messages');
    const samePeer = container.dataset.peer === peer;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 72;
    const bounds = container.getBoundingClientRect();
    const firstVisible = [...container.children].find(row => row.dataset.messageId && row.getBoundingClientRect().bottom > bounds.top);
    const anchor = samePeer && firstVisible ? { id: firstVisible.dataset.messageId, top: firstVisible.getBoundingClientRect().top } : null;
    const byEventId = messageByEventId;
    container.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Esta conversa é privada. Envie uma mensagem para começar.'; container.append(empty); container.dataset.peer = peer; refreshMessageSearch(); return;
    }
    for (const message of messages) {
      const row = document.createElement('div'); row.className = `message-row${message.direction === 'sent' ? ' mine' : ''}`;
      row.dataset.messageId = message.id;
      const eventId = nostrEventId(message);
      if (eventId) row.dataset.nostrEventId = eventId;
      row.dataset.eventIds = MessageEdits.eventIds(message).join(',');
      if (message.fromAgent) { const author = document.createElement('span'); author.className = 'agent-message-author'; author.textContent = message.agentMessageError ? 'Protocolo de agente · mensagem não reconhecida' : 'Protocolo de agente · identidade Nostr'; row.append(author); }
      if (conversation?.group && message.direction !== 'sent') { const author = document.createElement('span'); author.className = 'group-message-author'; author.textContent = displayName(message.senderPubkey || '', ''); row.append(author); }
      if (message.replyToId) {
        const parent = byEventId.get(message.replyToId);
        const quote = document.createElement('button'); quote.className = 'reply-reference'; quote.type = 'button';
        const author = parent?.direction === 'sent' ? (window.PropertyI18n?.language === 'pt-BR' ? 'Você' : 'You') : displayName(parent?.senderPubkey || peer, conversation?.group ? '' : conversation?.title || '');
        quote.textContent = parent ? `${author}: ${RichText.preview(parent.text).slice(0, 120)}` : localized('Reply to a message', 'Responder a uma mensagem');
        const quoteLabel = parent
          ? `${window.PropertyI18n?.language === 'pt-BR' ? 'Ir para a mensagem respondida' : 'Go to replied message'}: ${quote.textContent}`
          : (window.PropertyI18n?.language === 'pt-BR' ? 'A mensagem respondida não está neste histórico local' : 'Replied message is not in this local history');
        quote.setAttribute('aria-label', quoteLabel);
        quote.addEventListener('click', () => {
          const target = [...container.children].find(candidate => candidate.dataset.eventIds?.split(',').includes(message.replyToId));
          if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('message-highlight'); setTimeout(() => target.classList.remove('message-highlight'), 900); }
          else showToast(window.PropertyI18n?.language === 'pt-BR' ? 'A mensagem respondida não está neste histórico local.' : 'The replied message is not in this local history.');
        });
        row.append(quote);
      }
      const bubble = document.createElement('div'); bubble.className = 'message-bubble'; RichText.renderInto(bubble, message.text, window.PropertyI18n?.language || 'en');
      const counts = reactionsByTarget.get(message.id);
      let reactionSummary = null;
      if (counts?.size) {
        const summary = document.createElement('div'); summary.className = 'message-reactions'; summary.setAttribute('aria-label', 'Message reactions');
        for (const [reaction, count] of counts) {
          const pill = document.createElement('span'); pill.className = 'message-reaction-pill'; pill.textContent = `${reaction} ${count}`; summary.append(pill);
        }
        reactionSummary = summary;
      }
      const delivery = message.status === 'pending' ? ' · aguardando relay' : message.status === 'partial' ? ' · entrega parcial' : '';
      const meta = document.createElement('span'); meta.className = 'message-meta'; meta.append(document.createTextNode(`${new Date(message.createdAt).toLocaleString(window.PropertyI18n?.locale() || undefined)}${delivery}`));
      if (message.editSeq > 0) { const edited = document.createElement('span'); edited.className = 'message-edited'; edited.textContent = localized('Edited', 'Editada'); meta.append(edited); }
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const reply = document.createElement('button'); reply.type = 'button'; reply.className = 'message-reply'; reply.textContent = 'Reply'; reply.disabled = !eventId; reply.title = eventId ? 'Reply to this message' : 'This older message has no Nostr event reference';
      reply.addEventListener('click', () => {
        if (!eventId) { showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem antiga não tem uma referência de evento Nostr.' : 'This older message has no Nostr event reference.'); return; }
        state.replyingTo = message;
        updateReplyContext();
        $('message-input').focus();
      });
      const react = document.createElement('button'); react.type = 'button'; react.className = 'message-react'; react.textContent = 'React'; react.disabled = !eventId; react.setAttribute('aria-label', 'React to this message'); react.title = 'Choose a reaction';
      const picker = document.createElement('div'); picker.className = 'message-reaction-picker'; picker.hidden = true; picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', 'Choose a reaction');
      for (const emoji of REACTION_OPTIONS) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'message-reaction-choice'; choice.textContent = emoji; choice.setAttribute('aria-label', window.PropertyI18n?.language === 'pt-BR' ? `Reação ${emoji}` : `${emoji} reaction`);
        choice.addEventListener('click', async () => {
          picker.querySelectorAll('button').forEach(button => { button.disabled = true; });
          try { await sendPrivateReaction(peer, message, emoji); picker.hidden = true; }
          catch (error) { showToast(error.message || 'Could not send reaction.'); }
          finally { picker.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
        });
        picker.append(choice);
      }
      react.addEventListener('click', () => { picker.hidden = !picker.hidden; });
      const menu = document.createElement('details'); menu.className = 'message-menu';
      const menuButton = document.createElement('summary'); menuButton.textContent = '⋮'; menuButton.setAttribute('aria-label', 'More message actions');
      const menuItems = document.createElement('div'); menuItems.className = 'message-menu-items';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = message.saved ? 'Remove saved message' : 'Save message';
      save.addEventListener('click', () => { menu.open = false; setMessageSaved(peer, message, !message.saved).catch(error => showToast(error.message || 'Could not update saved messages.')); });
      if (message.direction === 'sent' && !message.fromAgent && !message.agentMessageId && message.kind !== 7 && !message.deleted && ['sent', 'partial'].includes(message.status) && eventId) {
        const editAction = document.createElement('button'); editAction.type = 'button'; editAction.textContent = localized('Edit message', 'Editar mensagem');
        editAction.addEventListener('click', () => { menu.open = false; startMessageEdit(peer, message); });
        menuItems.append(editAction);
      }
      const forward = document.createElement('button'); forward.type = 'button'; forward.textContent = 'Forward';
      forward.addEventListener('click', () => { menu.open = false; openForwardDialog(message).catch(error => showToast(error.message || 'Could not open forwarding.')); });
      menuItems.append(save, forward); menu.append(menuButton, menuItems);
      actions.append(reply, react, picker, menu); row.append(bubble); if (reactionSummary) row.append(reactionSummary); row.append(meta, actions); container.append(row);
    }
    container.dataset.peer = peer;
    if (!samePeer || wasAtBottom || !anchor) container.scrollTop = container.scrollHeight;
    else {
      const restored = [...container.children].find(row => row.dataset.messageId === anchor.id);
      if (restored) container.scrollTop += restored.getBoundingClientRect().top - anchor.top;
    }
    refreshMessageSearch();
  }
  function nostrEventId(message) {
    if (typeof message?.nostrEventId === 'string' && /^[0-9a-f]{64}$/i.test(message.nostrEventId)) return message.nostrEventId;
    return typeof message?.id === 'string' && /^[0-9a-f]{64}$/i.test(message.id) ? message.id : '';
  }
  function updateReplyContext() {
    const context = $('reply-context');
    const message = state.replyingTo;
    context.classList.toggle('hidden', !message);
    if (!message) return;
    const title = state.currentConversation ? conversationLabel(state.currentConversation) : state.activePeer ? conversationLabel(state.activePeer) : 'Conversation';
    $('reply-context-label').textContent = message.direction === 'sent'
      ? (window.PropertyI18n?.language === 'pt-BR' ? 'Respondendo à sua mensagem' : 'Replying to your message')
      : (window.PropertyI18n?.language === 'pt-BR' ? `Respondendo a ${title}` : `Replying to ${title}`);
    $('reply-context-text').textContent = RichText.preview(message.text).slice(0, 180);
  }
  function updateEditContext() {
    const message = state.editingMessage?.message;
    $('edit-context').classList.toggle('hidden', !state.editingMessage);
    const submit = document.querySelector('#send-form button[type="submit"]');
    submit?.setAttribute('aria-label', state.editingMessage ? localized('Save edit', 'Salvar edição') : localized('Send message', 'Enviar mensagem'));
    if (!message) return;
    $('edit-context-label').textContent = localized('Editing your message', 'Editando sua mensagem');
    $('edit-context-text').textContent = RichText.preview(message.text).slice(0, 180);
  }
  function cancelMessageEdit({ restoreFocus = false } = {}) {
    if (!state.editingMessage) return;
    const input = $('message-input');
    input.value = state.editingDraft;
    state.replyingTo = state.editingReplyingTo;
    state.editingMessage = null;
    state.editingDraft = '';
    state.editingReplyingTo = null;
    updateEditContext();
    updateReplyContext();
    resizeMessageInput(input);
    if (restoreFocus) input.focus();
  }
  function startMessageEdit(peer, message) {
    if (peer !== state.activePeer || message.direction !== 'sent' || message.kind === 7 || message.fromAgent || message.agentMessageId || message.deleted || !nostrEventId(message) || !['sent', 'partial'].includes(message.status)) return;
    if (state.editingMessage) cancelMessageEdit();
    const input = $('message-input');
    state.editingDraft = input.value;
    state.editingReplyingTo = state.replyingTo;
    state.editingMessage = { peer, message: { ...message } };
    state.replyingTo = null;
    updateReplyContext();
    updateEditContext();
    input.value = message.text;
    resizeMessageInput(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  async function editPrivateMessage(peer, message, text) {
    const updatedText = text.trim();
    if (!updatedText || updatedText.length > 4000) throw new Error(localized('Messages must contain 1–4,000 characters.', 'As mensagens devem ter de 1 a 4.000 caracteres.'));
    if (updatedText === message.text) return { unchanged: true };
    if (!(await requestSecretSendConfirmation(updatedText, peer))) return { cancelled: true };
    if (peer !== state.activePeer || state.editingMessage?.message.id !== message.id) throw new Error(localized('This edit is no longer active.', 'Esta edição não está mais ativa.'));
    const conversation = await get('conversations', peer);
    if (!conversation || message.direction !== 'sent' || message.fromAgent || message.agentMessageId || message.kind === 7 || message.deleted || !['sent', 'partial'].includes(message.status)) {
      throw new Error(localized('Only your delivered private messages can be edited.', 'Só é possível editar suas mensagens privadas já entregues.'));
    }
    const rootId = message.editRootId || nostrEventId(message);
    if (!rootId) throw new Error(localized('This message has no Nostr event reference and cannot be edited.', 'Esta mensagem não tem uma referência de evento Nostr e não pode ser editada.'));
    const members = conversation.group === true
      ? [...new Set(conversation.members || [])].sort()
      : [state.pubkey, peer].sort();
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    await connectAllRelays();
    const edit = MessageEdits.createNip17Edit({
      nostr: N, secret: state.secret, selfPubkey: state.pubkey, participants: members,
      rootId, priorEventIds: MessageEdits.eventIds(message), sequence: (message.editSeq || 0) + 1,
      createdAt: Math.floor((message.createdAt || Date.now()) / 1000),
      replyToId: message.replyToId || '', subject: conversation.group ? conversation.title || '' : '', text: updatedText
    });
    const planFor = wraps => conversation.group === true
      ? Routing.planGroupGiftWraps(wraps, members, relayLists, N.verifyEvent)
      : Routing.planGiftWraps(wraps, state.pubkey, peer, relayLists[state.pubkey], relayLists[peer], N.verifyEvent);
    const editPlan = planFor(edit.editWraps);
    const deletePlan = planFor(edit.deleteWraps);
    if (!editPlan.ready || !deletePlan.ready) throw new Error(localized('Could not prepare encrypted edit envelopes for every participant.', 'Não foi possível preparar envelopes criptografados da edição para todos os participantes.'));
    const confirmed = new Set();
    for (const delivery of editPlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) confirmed.add(delivery.recipient); }
      catch { /* Keep trying the other participant envelopes. */ }
    }
    const remoteRecipients = members.filter(member => member !== state.pubkey);
    const confirmedRemote = remoteRecipients.filter(member => confirmed.has(member));
    if (!confirmedRemote.length) return { unchanged: false, noRecipientAck: true, confirmed: 0, required: remoteRecipients.length };
    for (const delivery of deletePlan.deliveries) {
      if (!confirmed.has(delivery.recipient)) continue;
      try { await publishToRelays(delivery.event, delivery.relays); }
      catch { /* The replacement is already delivered; Property merges edits by their encrypted root tag. */ }
    }
    const localEdit = {
      ...message, text: updatedText, senderPubkey: state.pubkey, direction: 'sent',
      status: confirmedRemote.length === remoteRecipients.length ? 'sent' : 'partial',
      nostrEventId: edit.editRumor.id, editRootId: edit.rootId, editSeq: edit.sequence,
      previousEventIds: MessageEdits.eventIds(message).filter(id => id !== edit.editRumor.id)
    };
    const merged = MessageEdits.applyIncomingEdit(await all('messages'), {
      ...localEdit, edit: { rootId: edit.rootId, sequence: edit.sequence }
    }, state.pubkey);
    const saved = merged.applied ? merged.message : localEdit;
    saved.status = localEdit.status;
    await put('messages', saved);
    const latestConversation = await get('conversations', peer) || conversation;
    if (!latestConversation.lastAt || saved.createdAt >= latestConversation.lastAt) {
      await put('conversations', { ...latestConversation, lastMessage: updatedText, lastAt: saved.createdAt });
    }
    if (state.activePeer === peer) await renderMessages(peer);
    await renderConversations();
    return { updated: true, confirmed: confirmedRemote.length, required: remoteRecipients.length };
  }
  async function sendPrivateMessage(peer, text, replyTo = null, { quiet = false, secretConfirmed = false } = {}) {
    if (!secretConfirmed && !(await requestSecretSendConfirmation(text, peer))) {
      return { savedLocally: false, cancelled: true, confirmedEnvelopeCount: 0, requiredEnvelopeCount: 0 };
    }
    if ((await get('conversations', peer))?.group === true) return sendPrivateGroupMessage(peer, text, replyTo, { quiet, secretConfirmed: true });
    const agentAccess = await get('agentAccess', peer);
    if (agentAccess?.status === 'blocked') throw new Error('Este contato está bloqueado neste aparelho.');
    if (!state.inboxRelays.length) {
      state.inboxRelays = await discoverInboxRelays(state.pubkey);
      if (!state.inboxRelays.length) throw new Error(localized('Open relay settings, review the suggested inbox relays, and publish your public kind 10050 list before sending.', 'Abra as configurações de relays, confira os relays de recebimento sugeridos e publique sua lista pública kind 10050 antes de enviar.'));
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
    const previous = await get('conversations', peer) || { pubkey: peer, title: '' };
    const agentConversation = previous.agent === true || agentAccess?.status === 'approved';
    const agentMessageId = agentConversation ? AgentMessages.createMessageId() : null;
    const wireContent = agentConversation ? AgentMessages.encodeEnvelope({
      conversationId: await AgentMessages.conversationId(state.pubkey, peer),
      messageId: agentMessageId,
      inReplyTo: replyTo ? (replyTo.agentMessageId || nostrEventId(replyTo)) : null,
      body: text,
    }) : text;
    const replyEventId = replyTo ? nostrEventId(replyTo) : '';
    if (replyTo && !replyEventId) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem não pode ser citada como resposta Nostr.' : 'This message cannot be referenced as a Nostr reply.');
    const rumorTags = [['p', peer]];
    if (replyEventId) rumorTags.push(['e', replyEventId, '', 'reply']);
    // Make one rumor and wrap that exact event for both participants, so NIP-17 reply IDs match on each device.
    const sentRumor = N.nip59.createRumor({ kind: 14, tags: rumorTags, content: wireContent }, state.secret);
    const wraps = [state.pubkey, peer].map(recipient => N.nip59.createWrap(N.nip59.createSeal(sentRumor, state.secret, recipient), recipient));
    const routePlan = Routing.planGiftWraps(wraps, state.pubkey, peer, state.inboxRelays, peerRelays, N.verifyEvent);
    if (!routePlan.ready) throw new Error('A mensagem NIP-17 não tem os dois envelopes válidos ou as listas de recebimento necessárias.');
    if (!Array.isArray(wraps) || wraps.length < 2 || wraps.some(event => event.kind !== 1059)) throw new Error('A biblioteca não gerou envelopes NIP-17 válidos.');
    const id = agentConversation ? `agent-out:${peer}:${agentMessageId}` : `${state.pubkey}:${crypto.randomUUID()}`;
    const message = { id, peer, text, createdAt: Date.now(), direction: 'sent', status: 'pending', nostrEventId: sentRumor.id, ...(replyEventId ? { replyToId: replyEventId } : {}), ...(agentConversation ? { agentMessageId, inReplyTo: replyTo ? (replyTo.agentMessageId || replyEventId) : null } : {}) };
    await put('messages', message);
    await put('conversations', { ...previous, ...(agentConversation ? { agent: true } : {}), lastMessage: text, lastAt: message.createdAt });
    if (state.activePeer === peer) await renderMessages(peer);
    await renderConversations();
    let sent = 0;
    const requiredEnvelopes = routePlan.deliveries.length;
    for (const delivery of routePlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) sent += 1; }
      catch { /* Keep the encrypted local copy and attempt the remaining envelope. */ }
    }
    message.status = sent === requiredEnvelopes ? 'sent' : sent > 0 ? 'partial' : 'pending';
    await put('messages', message);
    if (state.activePeer === peer) await renderMessages(peer);
    if (!quiet && !sent) showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Mensagem cifrada salva neste aparelho; nenhum relay confirmou o envio.' : 'Encrypted message saved on this device; no relay confirmed it.');
    else if (!quiet && sent < requiredEnvelopes) showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Entrega parcial: alguns envelopes NIP-17 não foram confirmados pelos relays.' : 'Partial delivery: some NIP-17 envelopes were not confirmed by relays.');
    return { savedLocally: true, confirmedEnvelopeCount: sent, requiredEnvelopeCount: requiredEnvelopes };
  }
  async function sendPrivateGroupMessage(peer, text, replyTo = null, { quiet = false } = {}) {
    const previous = await get('conversations', peer);
    const members = [...new Set(previous?.members || [])].sort();
    if (members.length < 3 || members.length > MAX_NIP17_GROUP_MEMBERS || !members.includes(state.pubkey) || members.some(member => !/^[0-9a-f]{64}$/i.test(member))) {
      throw new Error(window.PropertyI18n?.language === 'pt-BR' ? `O grupo NIP-17 aceita de 3 a ${MAX_NIP17_GROUP_MEMBERS} participantes, incluindo você.` : `NIP-17 group chats support 3–${MAX_NIP17_GROUP_MEMBERS} participants, including you.`);
    }
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    await connectAllRelays();
    const replyEventId = replyTo ? nostrEventId(replyTo) : '';
    if (replyTo && !replyEventId) throw new Error('This message cannot be referenced as a Nostr reply.');
    const title = (previous.title || '').trim().slice(0, 80);
    const rumorTags = members.filter(member => member !== state.pubkey).map(member => ['p', member]);
    if (title) rumorTags.push(['subject', title]);
    if (replyEventId) rumorTags.push(['e', replyEventId, '', 'reply']);
    const sentRumor = N.nip59.createRumor({ kind: 14, tags: rumorTags, content: text }, state.secret);
    const wraps = members.map(recipient => N.nip59.createWrap(N.nip59.createSeal(sentRumor, state.secret, recipient), recipient));
    const routePlan = Routing.planGroupGiftWraps(wraps, members, relayLists, N.verifyEvent);
    if (!routePlan.ready) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Não foi possível preparar os envelopes do grupo. Confira as listas de recebimento NIP-17.' : 'Could not prepare the group envelopes. Check each participant’s NIP-17 inbox list.');
    const message = { id: `${state.pubkey}:${crypto.randomUUID()}`, peer, text, senderPubkey: state.pubkey, createdAt: Date.now(), direction: 'sent', status: 'pending', nostrEventId: sentRumor.id, ...(replyEventId ? { replyToId: replyEventId } : {}) };
    await put('messages', message);
    await put('conversations', { ...previous, group: true, members, lastMessage: text, lastAt: message.createdAt });
    if (state.activePeer === peer) await renderMessages(peer);
    await renderConversations();
    let sent = 0;
    for (const delivery of routePlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) sent += 1; }
      catch { /* Keep local copy and try every other recipient envelope. */ }
    }
    message.status = sent === routePlan.deliveries.length ? 'sent' : sent > 0 ? 'partial' : 'pending';
    await put('messages', message);
    if (state.activePeer === peer) await renderMessages(peer);
    if (!quiet && !sent) showToast('Encrypted group message saved on this device; no relay confirmed sending.');
    else if (!quiet && sent < routePlan.deliveries.length) showToast('Partial delivery: some group inbox relays did not confirm their envelopes.');
    return { savedLocally: true, confirmedEnvelopeCount: sent, requiredEnvelopeCount: routePlan.deliveries.length };
  }
  async function sendPrivateReaction(peer, message, reaction) {
    if ((await get('conversations', peer))?.group === true) return sendPrivateGroupReaction(peer, message, reaction);
    const agentAccess = await get('agentAccess', peer);
    if (agentAccess?.status === 'blocked') throw new Error('This contact is blocked on this device.');
    const targetId = nostrEventId(message);
    if (!targetId || !REACTION_OPTIONS.includes(reaction)) throw new Error('This message cannot receive that reaction.');
    const actor = state.pubkey;
    const targetIds = new Set(MessageEdits.eventIds(message));
    const previous = (await all('messages'))
      .filter(item => item.peer === peer && item.kind === 7 && targetIds.has(item.targetEventId) && (item.reactorPubkey || (item.direction === 'sent' ? state.pubkey : peer)) === actor)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (previous?.reaction === reaction) { showToast('You already sent this reaction.'); return; }
    if (!state.inboxRelays.length) {
      state.inboxRelays = await discoverInboxRelays(state.pubkey);
      if (!state.inboxRelays.length) throw new Error(localized('Open relay settings, review the suggested inbox relays, and publish your public kind 10050 list before sending.', 'Abra as configurações de relays, confira os relays de recebimento sugeridos e publique sua lista pública kind 10050 antes de enviar.'));
    }
    let peerRelays = state.peerInboxRelays.get(peer) || [];
    if (!peerRelays.length) {
      const savedHints = state.peerRelayHints.get(peer) || (await get('conversations', peer))?.relayHints || [];
      if (savedHints.length) state.peerRelayHints.set(peer, savedHints);
      peerRelays = await discoverInboxRelays(peer, savedHints);
      if (!peerRelays.length) throw new Error('Could not find this person’s public kind 10050 list.');
      state.peerInboxRelays.set(peer, peerRelays);
      await put('settings', { id: `peer-inbox-${peer}`, values: peerRelays });
      await connectAllRelays();
    }
    const targetAuthor = message.direction === 'sent' ? state.pubkey : peer;
    const rumor = N.nip59.createRumor({
      kind: 7,
      tags: [['e', targetId, '', targetAuthor], ['p', targetAuthor], ['k', '14']],
      content: reaction,
    }, state.secret);
    const wraps = [state.pubkey, peer].map(recipient => N.nip59.createWrap(N.nip59.createSeal(rumor, state.secret, recipient), recipient));
    const routePlan = Routing.planGiftWraps(wraps, state.pubkey, peer, state.inboxRelays, peerRelays, N.verifyEvent);
    if (!routePlan.ready || wraps.length !== 2 || wraps.some(event => event.kind !== 1059)) throw new Error('The NIP-17 reaction could not be prepared for both participants.');
    const local = { id: `reaction:${peer}:${rumor.id}`, peer, kind: 7, targetEventId: targetId, reaction, reactorPubkey: state.pubkey, createdAt: rumor.created_at * 1000, direction: 'sent', status: 'pending', nostrEventId: rumor.id };
    await put('messages', local);
    if (state.activePeer === peer) await renderMessages(peer);
    let sent = 0;
    for (const delivery of routePlan.deliveries) if (await publishToRelays(delivery.event, delivery.relays)) sent += 1;
    local.status = sent === 2 ? 'sent' : sent === 1 ? 'partial' : 'pending';
    await put('messages', local);
    await renderMessages(peer);
    if (!sent) showToast('Reaction saved on this device; no relay confirmed sending.');
    else if (sent < 2) showToast('Only one NIP-17 reaction envelope was confirmed by relays.');
  }
  async function sendPrivateGroupReaction(peer, message, reaction) {
    const conversation = await get('conversations', peer);
    const members = [...new Set(conversation?.members || [])].sort();
    const targetId = nostrEventId(message);
    if (members.length < 3 || members.length > MAX_NIP17_GROUP_MEMBERS || !members.includes(state.pubkey) || !targetId || !REACTION_OPTIONS.includes(reaction)) {
      throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem do grupo não pode receber essa reação.' : 'This group message cannot receive that reaction.');
    }
    const previous = (await all('messages'))
      .filter(item => item.peer === peer && item.kind === 7 && MessageEdits.eventIds(message).includes(item.targetEventId) && item.reactorPubkey === state.pubkey)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (previous?.reaction === reaction) { showToast('You already sent this reaction.'); return; }
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    await connectAllRelays();
    const targetAuthor = message.senderPubkey || (message.direction === 'sent' ? state.pubkey : '');
    if (!targetAuthor || !members.includes(targetAuthor)) throw new Error('The original group message author is not in this participant set.');
    const tags = [['e', targetId, '', targetAuthor], ['k', '14']];
    for (const member of members.filter(value => value !== state.pubkey)) tags.push(['p', member]);
    if (!members.includes(targetAuthor) || targetAuthor === state.pubkey) tags.push(['p', targetAuthor]);
    if (conversation.title) tags.push(['subject', conversation.title.slice(0, 80)]);
    const rumor = N.nip59.createRumor({ kind: 7, tags, content: reaction }, state.secret);
    const wraps = members.map(recipient => N.nip59.createWrap(N.nip59.createSeal(rumor, state.secret, recipient), recipient));
    const routePlan = Routing.planGroupGiftWraps(wraps, members, relayLists, N.verifyEvent);
    if (!routePlan.ready) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Não foi possível preparar os envelopes de reação do grupo.' : 'Could not prepare the group reaction envelopes.');
    const local = { id: `reaction:${peer}:${rumor.id}`, peer, kind: 7, targetEventId: targetId, reaction, reactorPubkey: state.pubkey, senderPubkey: state.pubkey, createdAt: rumor.created_at * 1000, direction: 'sent', status: 'pending', nostrEventId: rumor.id };
    await put('messages', local);
    if (state.activePeer === peer) await renderMessages(peer);
    let sent = 0;
    for (const delivery of routePlan.deliveries) if (await publishToRelays(delivery.event, delivery.relays)) sent += 1;
    local.status = sent === routePlan.deliveries.length ? 'sent' : sent > 0 ? 'partial' : 'pending';
    await put('messages', local);
    if (state.activePeer === peer) await renderMessages(peer);
    if (!sent) showToast('Group reaction saved on this device; no relay confirmed sending.');
    else if (sent < routePlan.deliveries.length) showToast('Some group inbox relays did not confirm the reaction envelope.');
  }
  async function addConversation(pubkey, title, relayHints = [], agent = false) {
    if (pubkey === state.pubkey) throw new Error('Não é possível iniciar uma conversa consigo mesmo.');
    const existing = await get('conversations', pubkey) || { pubkey, lastAt: 0, lastMessage: '' };
    const hints = [...new Set(relayHints.length ? relayHints : existing.relayHints || [])];
    await put('conversations', { ...existing, title: title.trim() || existing.title || '', relayHints: hints, ...(agent ? { agent: true } : {}) });
    if (hints.length) state.peerRelayHints.set(pubkey, hints);
    await selectConversation(pubkey); await renderConversations();
  }
  async function addGroupConversation(title, memberInput) {
    const entries = memberInput.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (entries.length < 2 || entries.length > MAX_NIP17_GROUP_MEMBERS - 1) {
      throw new Error(window.PropertyI18n?.language === 'pt-BR' ? `Informe de 2 a ${MAX_NIP17_GROUP_MEMBERS - 1} chaves públicas. Grupos NIP-17 aceitam até ${MAX_NIP17_GROUP_MEMBERS} pessoas, incluindo você.` : `Enter 2–${MAX_NIP17_GROUP_MEMBERS - 1} other public keys. NIP-17 group chats support up to ${MAX_NIP17_GROUP_MEMBERS} people, including you.`);
    }
    const parsed = entries.map(value => Contact.parsePublicKey(value).pubkey.toLowerCase());
    const members = [...new Set([state.pubkey, ...parsed])].sort();
    if (members.length !== parsed.length + 1) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Remova chaves públicas duplicadas e a sua própria chave da lista.' : 'Remove duplicate public keys and your own key from the member list.');
    const label = title.trim().slice(0, 80);
    if (!label) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Dê um nome para este grupo privado.' : 'Add a name for this private group.');
    const id = groupConversationId(members);
    if (!id) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Este grupo não tem uma lista válida de participantes.' : 'This group does not have a valid participant list.');
    const previous = await get('conversations', id) || { pubkey: id, lastAt: 0, lastMessage: '' };
    await put('conversations', { ...previous, group: true, members, title: label });
    await selectConversation(id);
    await renderConversations();
  }
  function setActiveView(view) {
    state.activeView = view;
    if (view !== 'messages') setMobileConversationListOpen(false);
    for (const name of ['messages', 'hangout', 'marketplace', 'node', 'saved']) {
      $(`${name}-view`).classList.toggle('hidden', name !== view);
      document.querySelector(`.nav-button[data-view="${name}"]`).classList.toggle('active', name === view);
    }
    if (view === 'hangout') refreshHangout().catch(() => {});
    if (view === 'marketplace') refreshMarketplace().catch(() => {});
    if (view === 'saved') renderSavedMessages().catch(() => {});
  }
  function setMobileConversationListOpen(open, { focus = false, restoreFocus = false } = {}) {
    const shouldOpen = Boolean(open && window.innerWidth <= 800);
    $('workspace').classList.toggle('mobile-conversations-open', shouldOpen);
    $('mobile-conversation-backdrop').classList.toggle('hidden', !shouldOpen);
    $('messages-view').inert = shouldOpen;
    $('mobile-open-conversations').setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen && focus) $('conversation-search').focus();
    else if (!shouldOpen && restoreFocus) {
      const toggle = $('mobile-open-conversations');
      (toggle.getClientRects().length ? toggle : $('empty-new-chat')).focus();
    }
  }
  async function setMessageSaved(peer, message, saved) {
    const updated = { ...message, saved, ...(saved ? { savedAt: Date.now() } : { savedAt: 0 }) };
    await put('messages', updated);
    if (state.activePeer === peer) await renderMessages(peer);
    await renderSavedMessages();
  }
  async function renderSavedMessages() {
    const list = $('saved-list');
    if (!list || !state.db) return;
    const saved = (await all('messages')).filter(message => message.kind !== 7 && message.saved === true).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    list.replaceChildren();
    if (!saved.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state compact';
      const symbol = document.createElement('div'); symbol.className = 'empty-symbol'; symbol.textContent = '☆';
      const title = document.createElement('h2'); title.textContent = 'No saved messages yet.';
      const copy = document.createElement('p'); copy.textContent = 'Use a message’s actions to save it for later.';
      empty.append(symbol, title, copy); list.append(empty); return;
    }
    for (const message of saved) {
      const conversation = await get('conversations', message.peer);
      const card = document.createElement('article'); card.className = 'saved-message-card';
      const heading = document.createElement('div'); heading.className = 'saved-message-heading';
      const name = document.createElement('strong'); name.textContent = conversationLabel(conversation || message.peer);
      const date = document.createElement('small'); date.textContent = new Date(message.createdAt).toLocaleString(window.PropertyI18n?.locale() || undefined);
      heading.append(name, date);
      const excerpt = document.createElement('div'); excerpt.className = 'saved-message-text'; RichText.renderInto(excerpt, message.text, window.PropertyI18n?.language || 'en');
      const actions = document.createElement('div'); actions.className = 'dialog-actions';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'button secondary'; open.textContent = 'Open message';
      open.addEventListener('click', async () => {
        setActiveView('messages');
        await selectConversation(message.peer);
        requestAnimationFrame(() => {
          const row = [...$('messages').children].find(item => item.dataset.messageId === message.id);
          if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('message-highlight'); setTimeout(() => row.classList.remove('message-highlight'), 900); }
        });
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button text'; remove.textContent = 'Remove saved message';
      remove.addEventListener('click', () => setMessageSaved(message.peer, message, false).catch(error => showToast(error.message || 'Could not update saved messages.')));
      actions.append(open, remove); card.append(heading, excerpt, actions); list.append(card);
    }
  }
  async function openForwardDialog(message) {
    state.forwardingMessage = message;
    $('forward-error').textContent = '';
    const list = $('forward-list'); list.replaceChildren();
    const conversations = (await all('conversations')).filter(item => item.pubkey !== message.peer && item.pubkey !== state.pubkey);
    const available = [];
    for (const conversation of conversations) if (conversation.group || (await get('agentAccess', conversation.pubkey))?.status !== 'blocked') available.push(conversation);
    if (!available.length) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No conversations to forward to.'; list.append(empty);
    } else {
      for (const conversation of available) {
        const label = document.createElement('label'); label.className = 'forward-option';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = conversation.pubkey;
        const details = document.createElement('span'); details.className = 'forward-option-details';
        const name = document.createElement('strong'); name.textContent = conversationLabel(conversation);
        const preview = document.createElement('small'); preview.textContent = conversation.lastMessage || (conversation.group ? `${conversation.members?.length || 0} ${window.PropertyI18n?.language === 'pt-BR' ? 'participantes' : 'members'}` : N.nip19.npubEncode(conversation.pubkey));
        details.append(name, preview); label.append(checkbox, details); list.append(label);
        checkbox.addEventListener('change', updateForwardSelection);
      }
    }
    updateForwardSelection();
    $('forward-dialog').showModal();
  }
  function updateForwardSelection() {
    const list = $('forward-list');
    if (!list) return;
    const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
    const selected = boxes.filter(input => input.checked).length;
    for (const input of boxes) input.disabled = !input.checked && selected >= 5;
    $('forward-count').textContent = window.PropertyI18n?.language === 'pt-BR' ? `${selected}/5 selecionadas` : `${selected}/5 selected`;
    $('forward-send').disabled = selected === 0 || selected > 5;
  }
  async function forwardMessage() {
    const message = state.forwardingMessage;
    const peers = [...$('forward-list').querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (!message || peers.length < 1 || peers.length > 5) return;
    const marker = window.PropertyI18n?.language === 'pt-BR' ? 'Encaminhada:' : 'Forwarded:';
    const text = `${marker}\n${message.text}`;
    $('forward-send').disabled = true;
    const finding = SecretGuard.findSecret(text);
    if (finding) {
      const names = [];
      for (const peer of peers) names.push(conversationLabel(await get('conversations', peer) || peer));
      if (!(await requestSecretSendConfirmation(text, '', names.join(', ')))) {
        $('forward-send').disabled = false;
        return;
      }
    }
    let savedLocally = 0;
    let relayConfirmed = 0;
    for (const peer of peers) {
      try {
        const result = await sendPrivateMessage(peer, text, null, { quiet: true, secretConfirmed: Boolean(finding) });
        if (result.savedLocally) savedLocally += 1;
        relayConfirmed += result.confirmedEnvelopeCount;
      } catch { /* The final summary distinguishes local saves from relay confirmations. */ }
    }
    $('forward-dialog').close();
    state.forwardingMessage = null;
    showToast(window.PropertyI18n?.language === 'pt-BR'
      ? `Cópias salvas neste aparelho: ${savedLocally}/${peers.length}; envelopes confirmados pelos relays: ${relayConfirmed}/${peers.length * 2}.`
      : `Copies saved on this device: ${savedLocally}/${peers.length}; envelopes confirmed by relays: ${relayConfirmed}/${peers.length * 2}.`);
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
    const heading = document.createElement('h3'); heading.dataset.userContent = ''; heading.textContent = campaign.title;
    const body = document.createElement('p'); body.dataset.userContent = ''; body.textContent = campaign.body;
    const amount = document.createElement('p'); amount.className = 'hangout-meta'; amount.textContent = `Oferta do node: ${Money.fromAtomic(campaign.amountAtomic, campaign.currency)} ${campaign.currency} · identidade ${N.nip19.npubEncode(campaign.nodePubkey).slice(0, 18)}…`;
    card.append(label);
    if (campaign.imageData) { const image = document.createElement('img'); image.className = 'campaign-image'; image.dataset.userContent = ''; image.src = campaign.imageData; image.alt = campaign.title; image.loading = 'lazy'; card.append(image); }
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
      card.dataset.eventId = event.id;
      const title = document.createElement('h3'); title.textContent = `npub…${N.nip19.npubEncode(event.pubkey).slice(-8)}`;
      const body = document.createElement('p'); body.dataset.userContent = ''; body.textContent = event.content;
      const meta = document.createElement('p'); meta.className = 'hangout-meta';
      const sources = eventSourceHints.get(event) || [];
      meta.textContent = `${new Date(event.created_at * 1000).toLocaleString(window.PropertyI18n?.locale() || undefined)} · ${sources.length ? `relays: ${sources.join(', ')}` : 'relay de origem indisponível'}`;
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
    if (!(await requestSecretSendConfirmation(content, '', localized('anyone who reads public Hangout posts', 'qualquer pessoa que leia publicações no Hangout')))) return;
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
      if (!(await requestSecretSendConfirmation(`${name}\n${description}\n${image}`, '', localized('anyone who reads public marketplace offers', 'qualquer pessoa que leia ofertas públicas do marketplace')))) return;
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
      const title = document.createElement('h3'); title.dataset.userContent = ''; title.textContent = data.name;
      const price = document.createElement('p'); price.className = 'product-price';
      price.textContent = Marketplace.displayPrice(data, Nano);
      const body = document.createElement('p'); body.dataset.userContent = ''; body.textContent = data.description || '';
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
    cancelMessageEdit();
    if (state.activePeer) await saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
    if (state.account) { const updated = { ...state.account }; delete updated.session; await put('vault', updated); state.account = updated; }
    clearTimeout(state.idleTimer);
    if (state.secret) state.secret.fill(0);
    state.secret = null; state.pubkey = ''; state.npub = ''; state.activePeer = ''; state.currentConversation = null;
    state.replyingTo = null; updateReplyContext();
    state.draftLoadSequence++;
    $('message-input').value = '';
    resizeMessageInput();
    state.shareDraftId = ''; state.shareDraftPeer = '';
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
    navigator.serviceWorker.register('./sw.js?v=property-v44', { scope: './', updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Property: cache offline indisponível.', error));
  }
  function wireEvents() {
    Pwa.bindInstallControls(document.querySelectorAll('[data-install-property]'), $('install-app-dialog'), () => showToast('Property installed.'));
    window.addEventListener('property-contact-intent', event => {
      const contact = typeof event.detail?.value === 'string' ? event.detail.value : '';
      if (!contact) return;
      Pwa.consumeContactIntent();
      if (!state.pubkey) { state.pendingContactIntent = contact; return; }
      state.pendingContactIntent = '';
      state.pendingLaunchAction = '';
      openContactIntent(contact);
    });
    $('share-inbox-button').addEventListener('click', () => openShareInbox());
    $('share-close').addEventListener('click', () => $('share-dialog').close());
    $('share-later').addEventListener('click', () => $('share-dialog').close());
    $('share-item-select').addEventListener('change', renderSelectedShare);
    $('share-conversation-select').addEventListener('change', renderSelectedShare);
    $('share-use-draft').addEventListener('click', () => {
      prepareShareDraft($('share-conversation-select').value, $('share-item-select').value)
        .catch(() => showToast(localized('Could not open this conversation draft.', 'Não foi possível abrir este rascunho na conversa.')));
    });
    $('share-new-chat').addEventListener('click', () => {
      const item = state.shareItems.find(candidate => String(candidate.id) === $('share-item-select').value);
      if (!item || item.tooLarge) return;
      state.pendingShareForNewChat = String(item.id);
      $('share-dialog').close();
      $('new-chat-dialog').showModal();
    });
    $('share-discard').addEventListener('click', async () => {
      const id = $('share-item-select').value;
      try {
        if (id) await ShareInbox.remove(Number(id));
        await renderShareInbox();
        $('share-dialog-status').textContent = localized('Shared item discarded on this device.', 'Item compartilhado descartado neste aparelho.');
      } catch {
        $('share-dialog-status').textContent = localized('Could not discard this item from local storage.', 'Não foi possível descartar este item do armazenamento local.');
      }
    });
    $('new-chat-dialog').addEventListener('close', () => { state.pendingShareForNewChat = ''; });
    $('create-account-button').addEventListener('click', () => showAuthPane('auth-setup'));
    $('import-account-button').addEventListener('click', () => showAuthPane('auth-import'));
    document.querySelectorAll('.back-auth').forEach(button => button.addEventListener('click', () => showAuthPane('auth-choice')));
    $('finish-create-button').addEventListener('click', tryCreate);
    $('finish-import-button').addEventListener('click', tryImport);
    $('unlock-button').addEventListener('click', tryUnlock);
    $('password').addEventListener('keydown', event => { if (event.key === 'Enter') tryUnlock(); });
    $('profile-button').addEventListener('click', () => $('profile-dialog').showModal());
    $('chat-details-button').addEventListener('click', () => openChatDetails().catch(error => showToast(error.message || localized('Could not open conversation details.', 'Não foi possível abrir os detalhes da conversa.'))));
    $('load-chat-public-profile').addEventListener('click', () => loadChatPublicProfile());
    $('save-chat-local-name').addEventListener('click', () => saveConversationLocalName().catch(error => showToast(error.message || localized('Could not save the local name.', 'Não foi possível salvar o nome local.'))));
    $('agent-block-button').addEventListener('click', () => toggleAgentBlock().catch(error => showToast(error.message || 'Não foi possível atualizar o bloqueio.')));
    $('open-agent-manager').addEventListener('click', () => {
      $('profile-dialog').close(); $('agent-dialog').showModal();
    });
    $('start-agent-chat').addEventListener('click', () => {
      $('agent-dialog').close(); $('agent-mode').checked = true; $('new-chat-dialog').showModal();
    });
    const openRelaySettings = async () => {
      $('relay-input').value = state.relays.join('\n');
      const inboxSuggestion = state.inboxRelays.length ? state.inboxRelays : state.relays.slice(0, 3);
      $('dm-relay-input').value = inboxSuggestion.join('\n');
      $('inbox-relay-note').textContent = state.inboxRelays.length
        ? localized('Publishing this list makes its relay URLs public as NIP-17 routing metadata; message contents remain encrypted.', 'Publicar esta lista deixa os endereços dos relays visíveis como metadados de roteamento NIP-17; o conteúdo das mensagens permanece criptografado.')
        : localized('No inbox list is saved yet, so Property prefilled your selected relays. Review them, then publish only if you want these URLs public as NIP-17 routing metadata; message contents remain encrypted.', 'Ainda não há uma lista de recebimento salva, então o Property preencheu os relays selecionados. Confira e publique apenas se quiser tornar esses endereços públicos como metadados de roteamento NIP-17; o conteúdo das mensagens permanece criptografado.');
      $('relay-selection-note').textContent = state.autoSelectedRelays
        ? (window.PropertyI18n?.language === 'pt-BR' ? 'O Property escolheu estes relays aleatoriamente da lista incluída no app. Eles ficam salvos neste aparelho; troque-os quando quiser.' : 'Property picked these relays randomly from its bundled list. They are saved on this device; replace them any time.')
        : (window.PropertyI18n?.language === 'pt-BR' ? 'Estes são os relays salvos neste aparelho. Troque a seleção quando quiser.' : 'These relays are saved on this device. Replace the selection any time.');
      $('relay-dialog').showModal();
    };
    $('open-settings').addEventListener('click', openRelaySettings);
    $('mobile-open-settings').addEventListener('click', openRelaySettings);
    $('create-folder-button').addEventListener('click', () => openFolderEditor());
    $('folder-save').addEventListener('click', () => saveFolderEditor());
    $('folder-name-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveFolderEditor(); } });
    $('move-folder-save').addEventListener('click', () => saveMovedConversationFolder());
    $('move-folder-dialog').addEventListener('close', () => { state.folderMovingConversation = ''; });
    $('save-relays').addEventListener('click', async () => {
      try { await saveRelaySettings(parseRelayList($('relay-input').value)); $('relay-dialog').close(); showError('relay-error'); }
      catch (error) { showError('relay-error', error.message); }
    });
    $('publish-inbox-list').addEventListener('click', () => publishInboxRelayList().catch(error => showError('relay-error', error.message || 'Falha ao publicar a lista NIP-17.')));
    $('use-default-relays').addEventListener('click', () => {
      const selection = RelayDefaults.pick();
      $('relay-input').value = selection.join('\n');
      if (!state.inboxRelays.length) $('dm-relay-input').value = selection.slice(0, 3).join('\n');
    });
    $('new-chat-button').addEventListener('click', () => $('new-chat-dialog').showModal());
    $('mobile-new-chat-button').addEventListener('click', () => $('new-chat-dialog').showModal());
    $('mobile-open-conversations').addEventListener('click', () => setMobileConversationListOpen(true, { focus: true }));
    $('close-mobile-conversations').addEventListener('click', () => setMobileConversationListOpen(false, { restoreFocus: true }));
    $('mobile-conversation-backdrop').addEventListener('click', () => setMobileConversationListOpen(false, { restoreFocus: true }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('workspace').classList.contains('mobile-conversations-open')) {
        event.preventDefault();
        setMobileConversationListOpen(false, { restoreFocus: true });
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 800) setMobileConversationListOpen(false);
    });
    $('empty-new-chat').addEventListener('click', () => $('new-chat-dialog').showModal());
    $('open-group-dialog').addEventListener('click', () => {
      state.pendingShareForNewChat = '';
      $('new-chat-dialog').close(); showError('group-error'); $('group-dialog').showModal();
    });
    $('create-group-button').addEventListener('click', async () => {
      try {
        await addGroupConversation($('group-name-input').value, $('group-members-input').value);
        $('group-dialog').close(); $('group-name-input').value = ''; $('group-members-input').value = ''; showError('group-error');
      } catch (error) { showError('group-error', error.message); }
    });
    $('start-chat-button').addEventListener('click', async () => {
      try {
        const pendingShareId = state.pendingShareForNewChat;
        const parsed = Contact.parsePublicKey($('peer-input').value);
        let profileHints;
        try { profileHints = parsed.relayHints.map(normalizeRelay); }
        catch { throw new Error('O nprofile contém um endereço de relay inválido. Use o npub ou peça à pessoa que compartilhe o contato novamente.'); }
        const extraHints = $('peer-relays-input').value.split(/[\n,]/).map(item => item.trim()).filter(Boolean).map(value => {
          try { return normalizeRelay(value); }
          catch { throw new Error('Confira o endereço de relay informado. Use uma URL wss:// válida; ws:// só funciona em testes locais.'); }
        });
        const hints = [...new Set([...profileHints, ...extraHints])];
        await addConversation(parsed.pubkey, $('peer-name-input').value, hints, $('agent-mode').checked);
        state.pendingShareForNewChat = '';
        $('new-chat-dialog').close(); $('peer-input').value = ''; $('peer-name-input').value = ''; $('peer-relays-input').value = ''; $('agent-mode').checked = false; showError('new-chat-error');
        if (pendingShareId) {
          try { await prepareShareDraft(parsed.pubkey, pendingShareId); }
          catch { showToast(localized('The conversation opened, but the shared draft could not be loaded.', 'A conversa abriu, mas não foi possível carregar o rascunho compartilhado.')); }
        }
      }
      catch (error) { showError('new-chat-error', error.message); }
    });
    $('secret-guard-close').addEventListener('click', () => settleSecretSendConfirmation(false));
    $('secret-guard-cancel').addEventListener('click', () => settleSecretSendConfirmation(false));
    $('secret-guard-send-anyway').addEventListener('click', () => settleSecretSendConfirmation(true));
    $('secret-guard-dialog').addEventListener('cancel', event => { event.preventDefault(); settleSecretSendConfirmation(false); });
    $('secret-guard-dialog').addEventListener('close', () => settleSecretSendConfirmation(false));
    $('send-form').addEventListener('submit', async event => {
      event.preventDefault(); const input = $('message-input'); const text = input.value.trim(); const peer = state.activePeer; const replyTo = state.replyingTo; if (!text || !peer) return;
      if (state.editingMessage) {
        const editing = state.editingMessage;
        const submit = document.querySelector('#send-form button[type="submit"]'); submit.disabled = true;
        try {
          const result = await editPrivateMessage(peer, editing.message, text);
          if (result.cancelled) return;
          if (result.noRecipientAck) {
            showToast(localized('No recipient inbox relay confirmed the edit. The original message remains unchanged here.', 'Nenhum relay de recebimento confirmou a edição. A mensagem original continua neste aparelho.'));
            return;
          }
          if (result.unchanged) showToast(localized('The edited text is the same; nothing was sent.', 'O texto não mudou; nada foi enviado.'));
          const draft = state.editingDraft;
          state.replyingTo = state.editingReplyingTo;
          state.editingMessage = null; state.editingDraft = '';
          state.editingReplyingTo = null;
          updateEditContext();
          updateReplyContext();
          input.value = draft;
          resizeMessageInput(input);
          await saveChatDraft(peer, input.value).catch(() => {});
          if (result.updated && result.confirmed < result.required) showToast(localized('Message edit sent to some recipients; delivery was partial.', 'A edição foi enviada a alguns participantes; a entrega foi parcial.'));
        } catch (error) { showToast(error.message || localized('Could not edit this message.', 'Não foi possível editar esta mensagem.')); }
        finally { submit.disabled = false; }
        return;
      }
      const sentShareId = state.shareDraftPeer === peer ? state.shareDraftId : '';
      const submit = document.querySelector('#send-form button[type="submit"]'); submit.disabled = true;
      try {
        const result = await sendPrivateMessage(peer, text, replyTo);
        if (result.cancelled) return;
        if (sentShareId) {
          state.shareDraftId = ''; state.shareDraftPeer = '';
          try {
            await ShareInbox.remove(sentShareId);
            await renderShareInbox();
          } catch {
            showToast(localized('Message saved, but the shared item remains in the local inbox.', 'Mensagem salva, mas o item compartilhado continua na caixa local.'));
          }
        }
        if (state.activePeer === peer) {
          if (input.value.trim() === text) {
            input.value = sentShareId ? await loadChatDraft(peer).catch(() => '') : '';
            resizeMessageInput(input);
          }
          await saveChatDraft(peer, input.value).catch(() => {});
        }
        if (state.activePeer === peer && state.replyingTo === replyTo) { state.replyingTo = null; updateReplyContext(); }
      }
      catch (error) { showToast(error.message || 'Falha ao cifrar a mensagem.'); }
      finally { submit.disabled = false; }
    });
    $('cancel-edit').addEventListener('click', () => cancelMessageEdit({ restoreFocus: true }));
    $('cancel-reply').addEventListener('click', () => { state.replyingTo = null; updateReplyContext(); });
    $('forward-send').addEventListener('click', () => forwardMessage().catch(error => showError('forward-error', error.message || 'Could not forward this message.')));
    $('forward-dialog').addEventListener('close', () => { state.forwardingMessage = null; $('forward-send').disabled = true; });
    $('language-picker').addEventListener('change', () => queueMicrotask(async () => {
      if (state.currentConversation) await updateConversationHeader(state.currentConversation);
      updateReplyContext(); await renderConversations();
      if (state.activePeer) await renderMessages(state.activePeer);
      if (state.activeView === 'saved') await renderSavedMessages();
    }));
    $('message-input').addEventListener('input', event => {
      resizeMessageInput(event.target);
      if (state.activePeer && !state.editingMessage) void saveChatDraft(state.activePeer, event.target.value).catch(() => {});
    });
    document.querySelectorAll('[data-format-marker]').forEach(button => button.addEventListener('click', () => {
      const input = $('message-input');
      if (!RichText.wrapSelection(input, button.dataset.formatMarker)) return;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }));
    $('conversation-search').addEventListener('input', renderConversations);
    $('message-search-button').addEventListener('click', openMessageSearch);
    $('message-search-close').addEventListener('click', () => closeMessageSearch());
    $('message-search-input').addEventListener('input', () => refreshMessageSearch({ resetIndex: true, scroll: true }));
    $('message-search-input').addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMessageSearch(); }
      else if (event.key === 'Enter') { event.preventDefault(); moveMessageSearchResult(event.shiftKey ? 1 : -1); }
    });
    $('message-search-older').addEventListener('click', () => moveMessageSearchResult(-1));
    $('message-search-newer').addEventListener('click', () => moveMessageSearchResult(1));
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
    $('share-contact').addEventListener('click', () => {
      try {
        state.contactShare = Contact.createShare({
          pubkey: state.pubkey,
          relayUrls: state.relays,
          nprofileEncode: N.nip19.nprofileEncode,
          npubEncode: N.nip19.npubEncode,
          baseUrl: window.location.href
        });
        const qr = QrCode.createSvg(state.contactShare.url, localized('QR code to open this Property contact', 'QR code para abrir este contato Property'));
        $('contact-share-link').textContent = state.contactShare.url;
        $('contact-share-nprofile').textContent = state.contactShare.nprofile;
        $('contact-share-fallback').hidden = true;
        $('contact-share-fallback').value = state.contactShare.url;
        $('contact-share-error').textContent = '';
        $('contact-share-relays').textContent = state.contactShare.relayHints.length
          ? state.contactShare.relayHints.join('\n')
          : localized('No secure relay hints are selected. The recipient can still use your public key.', 'Nenhum relay seguro está selecionado como dica. A outra pessoa ainda pode usar sua chave pública.');
        $('share-contact-native').hidden = typeof navigator.share !== 'function';
        $('contact-share-qr').replaceChildren(qr);
        $('profile-dialog').close();
        $('contact-share-dialog').showModal();
      } catch (error) { showError('profile-error', error.message || 'Não foi possível criar o link de contato.'); }
    });
    $('copy-contact-link').addEventListener('click', async () => {
      if (!state.contactShare) return;
      try {
        await navigator.clipboard.writeText(state.contactShare.url);
        $('contact-share-fallback').hidden = true;
        showToast(localized('Property contact link copied.', 'Link de contato Property copiado.'));
      } catch {
        const field = $('contact-share-fallback');
        field.value = state.contactShare.url; field.hidden = false; field.focus(); field.select();
        showError('contact-share-error', localized('Copy was blocked. Select the link below to copy it manually.', 'A cópia foi bloqueada. Selecione o link abaixo para copiar manualmente.'));
      }
    });
    $('copy-contact-nprofile').addEventListener('click', async () => {
      if (!state.contactShare) return;
      try {
        await navigator.clipboard.writeText(state.contactShare.nprofile);
        showToast(localized('Nostr profile code copied.', 'Código de perfil Nostr copiado.'));
      } catch {
        const field = $('contact-share-fallback');
        field.value = state.contactShare.nprofile; field.hidden = false; field.focus(); field.select();
        showError('contact-share-error', localized('Copy was blocked. Select the profile code below to copy it manually.', 'A cópia foi bloqueada. Selecione o código de perfil abaixo para copiar manualmente.'));
      }
    });
    $('share-contact-native').addEventListener('click', async () => {
      if (!state.contactShare || typeof navigator.share !== 'function') return;
      try { await navigator.share({ title: 'Property', text: localized('My public Nostr contact', 'Meu contato público Nostr'), url: state.contactShare.url }); }
      catch (error) { if (error?.name !== 'AbortError') showError('contact-share-error', localized('Could not open the share sheet.', 'Não foi possível abrir o compartilhamento do aparelho.')); }
    });
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.activePeer) void saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
      if (!document.hidden && state.pubkey) { resetIdleLock(); for (const url of effectiveRelayUrls()) connectRelay(url); }
    });
    window.addEventListener('pagehide', () => {
      if (state.activePeer) void saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
    });
    for (const eventName of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(eventName, resetIdleLock, { passive: true });
  }
  async function boot() {
    if (!N || !N.nip17 || !N.nip19 || !Vault || !Routing || !Bridge || !bridge || !Nano || !Money || !Marketplace || !AgentMessages || !RelayDefaults || !ShareInbox || !Pwa || !FolderStore || !ChatDrafts || !RichText || !MessageEdits || typeof MessageEdits.createNip17Edit !== 'function' || !SecretGuard || typeof SecretGuard.findSecret !== 'function' || !QrCode || typeof Contact?.parsePublicKey !== 'function' || !PublicProfile || typeof PublicProfile.latest !== 'function') { $('auth-error').textContent = 'Os arquivos locais do protocolo, dos relays ou de contatos não carregaram. Recarregue o pacote do Property.'; return; }
    wireEvents();
    state.pendingLaunchAction = Pwa.consumeLaunchAction();
    state.pendingContactIntent = Pwa.consumeContactIntent();
    state.bridgeRefreshTimer = window.setInterval(refreshBridgeSubscriptions, 60_000);
    registerOfflineShell();
    try {
      state.db = await openDatabase();
      setStorageReady(true);
      state.account = await get('vault', 'account');
      const relaySettings = await get('settings', 'relays');
      const relaySelection = RelayDefaults.initialSelection(relaySettings);
      state.relays = relaySelection.values.map(normalizeRelay);
      state.autoSelectedRelays = relaySelection.autoSelected;
      if (relaySelection.shouldPersist) await put('settings', { id: 'relays', values: state.relays, autoSelected: true });
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
      setStorageReady(false, `Armazenamento local indisponível: ${error.message || 'erro do navegador'}`);
      showAuthPane('auth-choice'); showError('auth-error', `Armazenamento local indisponível: ${error.message || 'erro do navegador'}`);
    }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
