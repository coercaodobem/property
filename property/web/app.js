'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const RelayDefaults = window.PropertyRelayDefaults;
  const Pwa = window.PropertyPwa;
  const GroupInvites = window.PropertyGroupInvites;
  const CommunityGroups = window.PropertyCommunityGroups;
  const ShareInbox = window.PropertyShareInbox;
  // Stable legacy database ID: preserve existing identities and sessions on this origin.
  const DB_NAME = 'liberdade-local-v1';
  const DB_VERSION = 4;
  const Vault = window.PropertyVault;
  const Routing = window.PropertyNostrRouting;
  const Bridge = window.PropertyRelayBridge;
  const Nano = window.PropertyNanoUnits;
  const Money = window.PropertyMoney;
  const PaymentCard = window.PropertyPaymentCard;
  const PaymentUris = window.PropertyPaymentUris;
  const Marketplace = window.PropertyMarketplace;
  const Campaigns = window.PropertyCampaigns;
  const Contact = window.PropertyContact;
  const PublicProfile = window.PropertyPublicProfile;
  const IdentityProofs = window.PropertyNip39;
  const AgentMessages = window.PropertyAgentMessages;
  const MessageSearch = window.PropertyMessageSearch;
  const FolderStore = window.PropertyConversationFolders;
  const ChatDrafts = window.PropertyChatDrafts;
  const NotificationPrefs = window.PropertyNotificationPreferences;
  const AppBadge = window.PropertyAppBadge;
  const MessageDays = window.PropertyMessageDays;
  const MessageScroll = window.PropertyMessageScroll;
  const GroupMentions = window.PropertyGroupMentions;
  const LinkPreview = window.PropertyLinkPreview;
  const LocationCards = window.PropertyLocationCards;
  const MessageForwards = window.PropertyMessageForwards;
  const RichText = window.PropertyRichText;
  const VoiceMessages = window.PropertyVoiceMessages;
  const AppDirectory = window.PropertyAppDirectory;
  const FileTransfers = window.PropertyFileTransfers;
  const DirectFileChunks = window.PropertyDirectFileChunks;
  const DirectFileStorage = window.PropertyDirectFileStorage;
  const DirectFileEnvelope = window.PropertyDirectFileEnvelope;
  const ImageViewer = window.PropertyImageViewer;
  const MessageEdits = window.PropertyMessageEdits;
  const MessageDeletions = window.PropertyMessageDeletions;
  const MessagePins = window.PropertyMessagePins;
  const SecretGuard = window.PropertySecretGuard;
  const QrCode = window.PropertyQrCode;
  const Nip05 = window.PropertyNip05;
  const EmojiPicker = window.PropertyEmojiPicker;
  const ChatGestures = window.PropertyChatGestures;
  const TypingSignals = window.PropertyTypingSignals;
  const IceServers = window.PropertyIceServers;
  const Calls = window.PropertyCalls;
  const CallWindow = window.PropertyCallWindow;
  const DirectTransfer = window.PropertyDirectTransfer;
  const AudioPlayback = window.PropertyAudioPlayback;
  const chessSubscribers = new Map();
  let activeChess = null;
  let chessOpening = null;
  const REACTION_OPTIONS = ['👍', '❤️', '😂', '🎉', '👀'];
  const MAX_NIP17_GROUP_MEMBERS = 10;
  const MAX_FILE_BATCH_FILES = 5;
  const MAX_FILE_BATCH_BYTES = 4 * 1024 * 1024;
  const MAX_DIRECT_FILE_BATCH_BYTES = DirectFileChunks.MAX_BATCH_BYTES;
  const eventSourceHints = new WeakMap();
  let emojiPicker = null;
  let groupMentionPicker = null;
  let reactionPickerSequence = 0;
  let ownNip05CheckId = 0;
  let peerNip05CheckId = 0;
  let peerNip05LookupId = 0;
  const state = {
    db: null, account: null, secret: null, pubkey: '', npub: '', relays: [],
    inboxRelays: [], peerInboxRelays: new Map(), peerRelayHints: new Map(),
    sockets: new Map(), fetchSubs: new Map(), pendingAcks: new Map(), activePeer: '',
    currentConversation: null,
    activeView: 'messages', toastTimer: 0, reconnectTimers: new Map(), unlocking: false, idleTimer: 0, replyingTo: null, editingMessage: null, editingDraft: '', editingDraftMentions: [], editingReplyingTo: null, forwardingMessage: null, autoSelectedRelays: false,
    communities: [], activeCommunity: null, activeCommunityEvents: [], activeCommunityModerators: new Set(), communityMigrationAdmins: new Set(), communityMigrationCandidates: [], communityMigrationStatus: '', communityRelaySelf: new Map(), communityInviteCode: '',
    typingIndicatorsEnabled: true, typingSession: null, typingSequence: 0, typingRelayLookups: new Map(), remoteTyping: new Map(), typingTimers: new Map(), typingSequences: new Map(), typingSeenEvents: new Set(),
    readReceiptsEnabled: false, readReceiptSent: new Set(), readReceipts: new Map(), readReceiptCandidates: new Map(), readReceiptObserver: null,
    activeStatusEnabled: false, localPresenceSession: null, remotePresence: new Map(), presenceTimers: new Map(), presenceSequences: new Map(),
    callController: null, call: null, pendingCallPeer: '', pendingCallVideo: false, callSignalSequences: new Map(),
    iceSettings: { urls: '', username: '', credential: '', relayOnly: false }, iceSettingsInvalid: false,
    directFileController: null, directFileStorage: null, directFileTransfer: null, directFileSignalSequences: new Map(), pendingDirectFileOffer: null, imageViewer: null,
    pendingDirectFileRequest: null, directFileSendJob: null, directFileJobRunning: false, directFileOfferExpiryTimer: 0,
    callUiHadSession: false, callUiSequence: 0,
    peerProfiles: new Map(), peerProfileLookupStatuses: new Map(), peerIdentityProofs: new Map(), identityProofChecks: new Map(), peerNip05Checks: new Map(), chatDetailsPeer: '', identityProofCheckId: 0,
    pendingMessageDeletion: null,
    conversationFolders: null, folderEditingId: '', folderMovingConversation: '',
    messageSearchOpen: false, messageSearchIds: [], messageSearchIndex: -1,
    conversationMessageSearchCache: null, conversationMessageSearchRevision: 0,
    bridgeEnabled: false, bridgeSubscriptions: new Map(), bridgeRefreshTimer: 0, editingProduct: null, deletingProduct: null,
    storageReady: false, activeWorkspaceReady: false, notificationsEnabled: false, notificationMutes: new Map(), notificationMutePeer: '', appBadgeEnabled: false, appBadgeLastCount: null, appBadgeQueue: Promise.resolve(), messageDayRolloverTimer: 0, unseenMessageCount: 0, pendingLaunchAction: '', pendingContactIntent: '', pendingGroupInviteIntent: '', pendingGroupInvite: null, groupInviteDraft: null, contactShare: null, messageDetailsPayload: '', shareItems: [], shareDraftId: '', shareDraftPeer: '', shareFileDraftId: '', shareFileDraftPeer: '', shareFileDraftFiles: [], pendingShareForNewChat: '', draftLoadSequence: 0, pendingSecretResolve: null, loadingLastMessageEdit: false, conversationListRenderSequence: 0,
    linkPreview: null, linkPreviewUrl: '', linkPreviewSequence: 0, linkPreviewBusy: false, linkPreviewStatus: '',
    voiceRecorder: null, voiceRecorderPeer: '', voiceRecorderStartedAt: 0, voiceActivitySession: null, voiceTimer: 0, voiceStopping: false, voiceSequence: 0,
    voiceDrafts: new Map(), voiceObjectUrls: new Map(), fileObjectUrls: new Map(), fileDraftObjectUrls: new Map(), fileDraftTransferIds: new Map(), fileDraftFiles: [], fileSendBusy: false, fileTransferSeen: new Set(), activeConversationAgent: false, activeConversationBlocked: false
  };
  const callWindow = CallWindow.create({ element: $('call-mini-window'), handle: $('call-mini-drag-handle') });
  const persistentAudio = document.createElement('audio');
  persistentAudio.preload = 'none';
  persistentAudio.setAttribute('aria-hidden', 'true');
  $('audio-player-host').append(persistentAudio);
  const audioPlayback = AudioPlayback.create({
    audio: persistentAudio,
    onState: updateAudioPlaybackUI,
    onError: () => showToast(localized('This audio could not be played. You can download it from its message.', 'Não foi possível reproduzir este áudio. Você pode baixá-lo na mensagem.'))
  });
  const SHARE_LAUNCH_ACTIONS = new Set(['share', 'share-full', 'share-error']);
  let propertyTabChannel = null;
  let propertyTabIsOwner = false;
  let pendingTabShareAction = '';
  let shareHandoffAnnounced = false;
  const N = window.NostrTools;
  const bridge = Bridge?.createBridge(event => N.verifyEvent(event));

  function audioTimeLabel(seconds) {
    const value = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }
  function updateAudioPlaybackUI(current = audioPlayback.getState()) {
    const bar = $('now-playing-bar');
    if (!bar) return;
    const showBar = Boolean(current?.away && state.secret);
    bar.hidden = !showBar;
    bar.setAttribute('aria-label', localized('Now playing', 'Tocando agora'));
    if (showBar) {
      const conversation = conversationLabel(current.peer);
      $('now-playing-from').textContent = current.from && current.from !== conversation ? `${current.from} · ${conversation}` : conversation;
      $('now-playing-title').textContent = current.title;
      $('now-playing-play').textContent = current.playing ? 'Ⅱ' : '▶';
      $('now-playing-play').setAttribute('aria-label', current.playing
        ? localized('Pause audio', 'Pausar áudio')
        : localized('Play audio', 'Reproduzir áudio'));
      $('now-playing-open').setAttribute('aria-label', localized(`Open conversation with ${conversationLabel(current.peer)}`, `Abrir conversa com ${conversationLabel(current.peer)}`));
      $('now-playing-seek').max = String(Math.max(current.duration, 1));
      $('now-playing-seek').value = String(Math.min(current.position, current.duration || 1));
      $('now-playing-seek').disabled = !(current.duration > 0);
      $('now-playing-seek').setAttribute('aria-label', localized(`Seek ${current.title}`, `Avançar em ${current.title}`));
      $('now-playing-time').textContent = current.duration > 0
        ? `${audioTimeLabel(current.position)} / ${audioTimeLabel(current.duration)}`
        : audioTimeLabel(current.position);
      $('now-playing-rate').textContent = `${current.playbackRate}×`;
      $('now-playing-rate').setAttribute('aria-label', `${localized('Playback speed', 'Velocidade de reprodução')} ${current.playbackRate}×`);
      $('now-playing-close').setAttribute('aria-label', localized('Stop audio', 'Parar áudio'));
    }
    for (const control of document.querySelectorAll('.audio-player-control')) {
      const id = control.dataset.audioKey || '';
      const active = Boolean(current && current.id === id);
      const playing = active && current.playing;
      const kind = control.dataset.audioKind === 'voice' ? 'voice' : 'audio';
      const title = control.dataset.audioTitle || localized('Audio', 'Áudio');
      const saved = audioPlayback.getPosition(id);
      const total = active ? current.duration : Number(control.dataset.duration || 0);
      const elapsed = active ? current.position : saved;
      const play = control.querySelector('.audio-playback-button');
      const seek = control.querySelector('.audio-playback-seek');
      const time = control.querySelector('.audio-player-time');
      const rateButton = control.querySelector('.voice-message-speed');
      if (play) {
        play.textContent = playing ? 'Ⅱ' : '▶';
        const label = kind === 'voice' ? localized('voice message', 'mensagem de voz') : title;
        play.setAttribute('aria-label', localized(`${playing ? 'Pause' : 'Play'} ${label}`, `${playing ? 'Pausar' : 'Reproduzir'} ${label}`));
      }
      if (seek) {
        seek.max = String(Math.max(total, 1));
        seek.value = String(Math.min(elapsed, total || 1));
        seek.disabled = !active || !(total > 0);
        seek.setAttribute('aria-label', localized(`Seek ${title}`, `Avançar em ${title}`));
      }
      if (time) time.textContent = total > 0 ? `${audioTimeLabel(elapsed)} / ${audioTimeLabel(total)}` : audioTimeLabel(elapsed);
      if (rateButton) {
        rateButton.textContent = `${audioPlayback.getRate()}×`;
        rateButton.setAttribute('aria-label', `${localized('Playback speed', 'Velocidade de reprodução')} ${audioPlayback.getRate()}×`);
      }
      control.dataset.state = playing ? 'playing' : active ? 'paused' : 'idle';
    }
  }

  function groupConversationId(members) {
    return Routing.groupConversationId(members, MAX_NIP17_GROUP_MEMBERS);
  }
  function fileChunkBody(chunk) {
    if (!chunk || chunk.index !== 0) return '';
    return `📎 ${chunk.name}${chunk.caption ? `\n${chunk.caption}` : ''}`;
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
  function ensureChessLaunchButton(conversation, agentAccess) {
    const header = document.querySelector('#conversation-pane .conversation-header');
    if (!header) return;
    let button = $('chess-launch-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'chess-launch-button';
      button.type = 'button';
      button.className = 'icon-button small call-launch-button chess-launch-button';
      button.textContent = '♟';
      button.addEventListener('click', () => openChessGame().catch(error => showToast(error.message || localized('Could not open Property Chess.', 'Não foi possível abrir o Xadrez do Property.'))));
      header.insertBefore(button, $('agent-block-button') || $('chat-details-button'));
    }
    const allowed = !conversation.group && conversation.agent !== true && agentAccess?.status !== 'approved' && agentAccess?.status !== 'blocked';
    button.hidden = !allowed;
    button.setAttribute('aria-label', localized('Play chess', 'Jogar xadrez'));
    button.title = localized('Play chess', 'Jogar xadrez');
  }

  function ensureChessDialog() {
    let dialog = $('chess-dialog');
    if (dialog) return dialog;
    const stylesheet = document.createElement('link');
    stylesheet.id = 'property-chess-styles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './chess/chess.css?v=property-v1';
    document.head.append(stylesheet);

    dialog = document.createElement('dialog');
    dialog.id = 'chess-dialog';
    dialog.className = 'dialog-card chess-dialog';
    dialog.setAttribute('aria-labelledby', 'chess-dialog-title');
    const head = document.createElement('div');
    head.className = 'dialog-head';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'PROPERTY · NIP-17';
    const title = document.createElement('h2');
    title.id = 'chess-dialog-title';
    title.textContent = localized('Property Chess', 'Xadrez do Property');
    heading.append(eyebrow, title);
    const close = document.createElement('button');
    close.id = 'chess-dialog-close';
    close.type = 'button';
    close.className = 'icon-button small';
    close.setAttribute('aria-label', localized('Close chess', 'Fechar xadrez'));
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    head.append(heading, close);
    const body = document.createElement('div');
    body.className = 'chess-dialog-body';
    const note = document.createElement('p');
    note.className = 'chess-dialog-note';
    note.textContent = localized(
      'Moves use end-to-end encrypted NIP-17 messages through your selected relays. Delivery can be delayed or partial.',
      'Os lances usam mensagens NIP-17 criptografadas de ponta a ponta pelos relays selecionados. A entrega pode atrasar ou ser parcial.'
    );
    const root = document.createElement('div');
    root.id = 'chess-game-root';
    body.append(note, root);
    dialog.append(head, body);
    dialog.addEventListener('close', stopChessGame);
    document.body.append(dialog);
    return dialog;
  }

  function stopChessGame() {
    if (!activeChess) return;
    try { activeChess.instance.stop(); } catch {}
    activeChess = null;
  }

  function createChessApi(peer) {
    const identity = state.pubkey;
    const storageId = key => `property-chess:${identity}:${peer}:${key}`;
    return {
      context: async () => ({
        inChat: true,
        peer: { open: true },
        locale: window.PropertyI18n?.language === 'pt-BR' ? 'pt-BR' : 'en',
        theme: 'dark'
      }),
      storage: {
        get: async key => (await get('settings', storageId(key)))?.values,
        set: async (key, value) => put('settings', { id: storageId(key), values: value }),
        delete: async key => del('settings', storageId(key))
      },
      chat: {
        send: async payload => {
          if (state.pubkey !== identity || !state.secret) throw new Error('Unlock the same Property identity to continue this game.');
          const wire = JSON.stringify(payload);
          if (enc.encode(wire).byteLength > 16384) throw new Error('Chess message is too large.');
          const result = await sendPrivateMessage(peer, '', null, { quiet: true, secretConfirmed: true, deferRender: true, chessPayload: payload });
          if (result.confirmedEnvelopeCount < result.requiredEnvelopeCount) throw new Error('The relay did not confirm every encrypted chess message.');
        },
        on: (event, listener) => {
          if (event !== 'message') return () => {};
          const subscribers = chessSubscribers.get(peer) || new Set();
          subscribers.add(listener);
          chessSubscribers.set(peer, subscribers);
          return () => {
            subscribers.delete(listener);
            if (!subscribers.size) chessSubscribers.delete(peer);
          };
        }
      }
    };
  }

  async function openChessGame() {
    if (chessOpening) return chessOpening;
    chessOpening = openChessGameOnce();
    try { return await chessOpening; }
    finally { chessOpening = null; }
  }

  async function openChessGameOnce() {
    const peer = state.activePeer;
    const identity = state.pubkey;
    const conversation = peer ? await get('conversations', peer) : null;
    const access = peer ? await get('agentAccess', peer) : null;
    if (!state.secret || !state.pubkey) throw new Error(localized('Unlock Property before opening a game.', 'Desbloqueie o Property antes de abrir uma partida.'));
    if (!conversation || conversation.group || conversation.agent === true || access?.status === 'approved' || access?.status === 'blocked') {
      throw new Error(localized('Property Chess is available in direct conversations between people.', 'O Xadrez do Property está disponível em conversas diretas entre pessoas.'));
    }
    const dialog = ensureChessDialog();
    if (!dialog.open) dialog.showModal();
    if (activeChess?.peer === peer) return;
    stopChessGame();
    const root = $('chess-game-root');
    root.replaceChildren();
    try {
      const runtime = await import('./chess/build/runtime.js');
      if (!dialog.open) return;
      if (state.activePeer !== peer || state.pubkey !== identity || state.pubkey !== state.account?.pubkey) throw new Error(localized('The conversation or identity changed before the game opened.', 'A conversa ou a identidade mudou antes de a partida abrir.'));
      const instance = runtime.mountPropertyChess(root, createChessApi(peer), window.PropertyI18n?.language || 'en');
      activeChess = { peer, instance };
      await instance.ready;
    } catch (error) {
      stopChessGame();
      if (dialog.open) dialog.close();
      throw error;
    }
  }

  async function openPropertyAppChatPicker() {
    if (!state.secret || !state.pubkey) throw new Error(localized('Unlock Property before choosing a conversation.', 'Desbloqueie o Property antes de escolher uma conversa.'));
    const identity = state.pubkey;
    const dialog = $('property-app-chat-picker');
    const list = $('property-app-chat-picker-list');
    const empty = $('property-app-chat-picker-empty');
    const status = $('property-app-chat-picker-status');
    list.replaceChildren();
    empty.hidden = true;
    status.textContent = localized('Loading direct conversations…', 'Carregando conversas diretas…');
    if (!dialog.open) dialog.showModal();
    try {
      const [conversations, agentAccess] = await Promise.all([all('conversations'), all('agentAccess')]);
      if (!dialog.open || state.pubkey !== identity || !state.secret) return;
      const eligible = AppDirectory.directHumanConversations(conversations, identity, agentAccess);
      eligible.sort((a, b) => {
        const activeOrder = Number(b.pubkey === state.activePeer) - Number(a.pubkey === state.activePeer);
        if (activeOrder) return activeOrder;
        const recentOrder = (Number.isFinite(b.lastAt) ? b.lastAt : 0) - (Number.isFinite(a.lastAt) ? a.lastAt : 0);
        return recentOrder || conversationLabel(a).localeCompare(conversationLabel(b), window.PropertyI18n?.locale() || 'en-US');
      });
      if (!eligible.length) {
        status.textContent = localized('Choose a direct human conversation to start a game.', 'Escolha uma conversa direta entre pessoas para iniciar uma partida.');
        empty.hidden = false;
        return;
      }
      status.textContent = localized('Choose a person. The chess game uses encrypted messages in that conversation.', 'Escolha uma pessoa. A partida usa mensagens criptografadas nessa conversa.');
      for (const conversation of eligible) {
        const label = conversationLabel(conversation);
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'property-app-chat-option';
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = label.trim().slice(0, 1).toUpperCase() || '?';
        const details = document.createElement('span');
        details.className = 'property-app-chat-option-details';
        const name = document.createElement('strong');
        name.dataset.userContent = '';
        name.textContent = label;
        const identityLabel = document.createElement('small');
        identityLabel.textContent = N.nip19.npubEncode(conversation.pubkey);
        details.append(name, identityLabel);
        option.append(avatar, details);
        option.addEventListener('click', () => {
          option.disabled = true;
          dialog.close();
          setActiveView('messages');
          void selectConversation(conversation.pubkey)
            .then(() => openChessGame())
            .catch(error => showToast(error.message || localized('Could not open Property Chess.', 'Não foi possível abrir o Xadrez do Property.')));
        });
        list.append(option);
      }
    } catch (error) {
      if (!dialog.open || state.pubkey !== identity) return;
      list.replaceChildren();
      status.textContent = localized('Could not load direct conversations. Close this window and try again.', 'Não foi possível carregar as conversas diretas. Feche esta janela e tente novamente.');
      console.warn('Property: could not load app conversation choices.', error);
    }
  }

  async function updateConversationHeader(conversation) {
    if (!conversation) return;
    state.currentConversation = conversation;
    const agentAccess = conversation.group ? null : await get('agentAccess', conversation.pubkey);
    state.activeConversationAgent = !conversation.group && (conversation.agent === true || agentAccess?.status === 'approved');
    ensureChessLaunchButton(conversation, agentAccess);
    $('chat-title').dataset.userContent = '';
    $('chat-title').textContent = conversationLabel(conversation);
    const localNameLabel = conversation.group
      ? localized('Edit the local name for this group', 'Editar o nome local deste grupo')
      : localized('Edit the local name for this contact', 'Editar o nome local deste contato');
    $('chat-title').setAttribute('aria-label', localNameLabel);
    $('chat-title').title = localNameLabel;
    $('chat-subtitle').textContent = conversationSubtitle(conversation, agentAccess);
    renderRemoteTyping();
    $('chat-avatar').classList.toggle('group-avatar', conversation.group === true);
    $('chat-avatar').textContent = conversation.group ? '◉' : $('chat-title').textContent.slice(0, 1).toUpperCase();
    groupMentionPicker?.setEnabled();
    $('composer-note').textContent = conversation.group
      ? (state.inboxRelays.length
        ? localized('NIP-17 group · one encrypted copy goes to each participant’s inbox relays', 'Grupo NIP-17 · uma cópia criptografada vai para os relays de recebimento de cada participante')
        : localized('Publish your suggested inbox relays in settings first; each group member also needs a public kind 10050 list.', 'Publique os relays de recebimento sugeridos nas configurações; cada participante também precisa de uma lista pública kind 10050.'))
      : (state.inboxRelays.length
        ? localized('NIP-17 · both people need a public inbox relay list (kind 10050)', 'NIP-17 · as duas pessoas precisam publicar uma lista de relays de recebimento (kind 10050)')
        : localized('Publish your suggested inbox relays in settings to start; the other person must publish theirs too.', 'Publique os relays de recebimento sugeridos nas configurações para começar; a outra pessoa também precisa publicar os dela.'));
    renderVoiceComposer();
  }

  function clearVoiceTimer() {
    if (state.voiceTimer) clearInterval(state.voiceTimer);
    state.voiceTimer = 0;
  }
  function releaseVoiceObjectUrls() {
    audioPlayback.clear();
    for (const url of state.voiceObjectUrls.values()) URL.revokeObjectURL(url);
    state.voiceObjectUrls.clear();
    for (const draft of state.voiceDrafts.values()) URL.revokeObjectURL(draft.url);
    state.voiceDrafts.clear();
  }
  function releaseFileObjectUrls() {
    for (const url of state.fileObjectUrls.values()) URL.revokeObjectURL(url);
    state.fileObjectUrls.clear();
  }
  function clearVoiceDraft(peer = state.activePeer) {
    const draft = state.voiceDrafts.get(peer);
    if (draft) URL.revokeObjectURL(draft.url);
    state.voiceDrafts.delete(peer);
    renderVoiceComposer();
  }
  function renderVoiceComposer() {
    const recordButton = $('voice-record-button');
    const panel = $('voice-recording-panel');
    if (!recordButton || !panel) return;
    const recording = Boolean(state.voiceRecorder && state.voiceRecorderPeer === state.activePeer);
    const voiceDraft = state.voiceDrafts.get(state.activePeer);
    const draft = Boolean(voiceDraft);
    const unavailable = !state.secret || !state.activePeer || state.activeConversationAgent || state.activeConversationBlocked;
    recordButton.hidden = unavailable || Boolean(state.editingMessage);
    recordButton.disabled = unavailable || recording || draft;
    recordButton.setAttribute('aria-label', localized('Record a voice message', 'Gravar mensagem de voz'));
    recordButton.title = localized('Record a voice message', 'Gravar mensagem de voz');
    panel.hidden = !recording && !draft;
    $('voice-recording-progress').hidden = !recording;
    $('voice-preview-review').hidden = !draft;
    $('message-input').disabled = state.activeConversationBlocked || recording || draft;
    const submit = document.querySelector('#send-form button[type="submit"]');
    if (submit) submit.disabled = state.activeConversationBlocked || recording || draft;
    if (recording) {
      const elapsed = state.voiceRecorder.elapsed();
      const paused = state.voiceRecorder.isPaused();
      const pauseButton = $('voice-record-pause');
      $('voice-recording-time').textContent = VoiceMessages.formatDuration(elapsed);
      $('voice-recording-label').textContent = state.voiceRecorderStartedAt
        ? paused ? localized('Recording paused', 'Gravação pausada') : localized('Recording', 'Gravando')
        : localized('Waiting for microphone permission…', 'Aguardando permissão do microfone…');
      pauseButton.textContent = paused ? localized('Resume recording', 'Retomar gravação') : localized('Pause recording', 'Pausar gravação');
      pauseButton.setAttribute('aria-label', pauseButton.textContent);
      pauseButton.disabled = !state.voiceRecorderStartedAt || state.voiceStopping || (!paused && elapsed >= VoiceMessages.MAX_DURATION_MS);
    }
    if (draft) {
      const audio = $('voice-preview-audio');
      audio.src = voiceDraft.url;
      audio.setAttribute('aria-label', localized('Preview voice message', 'Ouvir prévia da mensagem de voz'));
      $('voice-preview-duration').textContent = VoiceMessages.formatDuration(voiceDraft.recording.durationMs);
      $('voice-send-button').disabled = false;
    }
    const attachButton = $('attach-file-button');
    if (attachButton) {
      const unavailable = !state.secret || !state.activePeer || state.activeConversationAgent || state.activeConversationBlocked || Boolean(state.editingMessage);
      attachButton.hidden = unavailable;
      attachButton.disabled = unavailable || state.fileSendBusy;
      attachButton.setAttribute('aria-label', localized('Attach files', 'Anexar arquivos'));
      attachButton.title = localized('Attach files', 'Anexar arquivos');
    }
    const paymentButton = $('payment-card-button');
    if (paymentButton) {
      const unavailable = !state.secret || !state.activePeer || state.activeConversationAgent || state.activeConversationBlocked ||
        Boolean(state.currentConversation?.group) || Boolean(state.editingMessage);
      paymentButton.hidden = unavailable;
      paymentButton.disabled = unavailable || recording || draft || state.fileSendBusy;
      paymentButton.setAttribute('aria-label', localized('Share payment details', 'Compartilhar dados de pagamento'));
      paymentButton.title = paymentButton.getAttribute('aria-label');
    }
  }

  function selectedPaymentCurrency() {
    return document.querySelector('input[name="payment-card-currency"]:checked')?.value || 'BTC';
  }

  function updatePaymentCardNetworks() {
    const currency = selectedPaymentCurrency();
    const inputs = [...document.querySelectorAll('input[name="payment-card-currency"]')];
    const selectedIndex = Math.max(0, inputs.findIndex(input => input.checked));
    for (const input of inputs) input.closest('.payment-currency-option')?.classList.toggle('is-selected', input.checked);
    $('payment-card-position').textContent = `${selectedIndex + 1} / ${inputs.length}`;
    const select = $('payment-card-network');
    const previous = select.value;
    const networks = PaymentCard.NETWORKS[currency] || [];
    select.replaceChildren(...networks.map(network => {
      const option = document.createElement('option');
      option.value = network;
      option.textContent = PaymentCard.networkLabel(network);
      return option;
    }));
    if (networks.includes(previous)) select.value = previous;
  }

  function movePaymentCurrency(step) {
    const inputs = [...document.querySelectorAll('input[name="payment-card-currency"]')];
    if (!inputs.length) return;
    const current = Math.max(0, inputs.findIndex(input => input.checked));
    const next = inputs[(current + step + inputs.length) % inputs.length];
    next.checked = true;
    next.dispatchEvent(new Event('change', { bubbles: true }));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    next.closest('.payment-currency-option')?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }

  function renderPaymentCard(target, content) {
    const data = PaymentCard?.parse(content) || PaymentUris?.parse(content);
    if (!data) return false;
    let walletRequest = null;
    let walletRequestError = null;
    try { walletRequest = PaymentUris?.build(data) || null; }
    catch (error) { walletRequestError = error; }
    const card = document.createElement('section');
    card.className = 'message-payment-card';
    const isWalletUri = data.source === 'wallet-uri';
    const paymentTitle = isWalletUri ? localized('Wallet payment request', 'Pedido de pagamento da carteira') : localized('Payment details', 'Dados de pagamento');
    card.setAttribute('aria-label', paymentTitle);
    const head = document.createElement('div'); head.className = 'message-payment-card-head';
    const title = document.createElement('strong'); title.textContent = paymentTitle;
    const rail = document.createElement('span'); rail.className = `payment-card-currency payment-card-${data.currency.toLowerCase()}`;
    rail.textContent = `${data.currency} · ${PaymentCard.networkLabel(data.network)}`;
    head.append(title, rail); card.append(head);
    if (data.amount) {
      const amount = document.createElement('p'); amount.className = 'message-payment-card-amount';
      amount.textContent = `${localized('Amount', 'Valor')}: ${data.amount} ${data.currency}`; card.append(amount);
    }
    const recipientName = data.label || data.recipientName;
    if (recipientName) {
      const recipient = document.createElement('p'); recipient.className = 'message-payment-card-recipient';
      recipient.textContent = `${localized('Recipient', 'Destinatário')}: ${recipientName}`; card.append(recipient);
    }
    if (data.paymentId) {
      const paymentId = document.createElement('p'); paymentId.className = 'message-payment-card-payment-id';
      paymentId.textContent = `${localized('Payment ID', 'ID do pagamento')}: ${data.paymentId}`; card.append(paymentId);
    }
    const addressLabel = document.createElement('span'); addressLabel.className = 'message-payment-card-label';
    addressLabel.textContent = localized('Receiving address', 'Endereço de recebimento');
    const address = document.createElement('code'); address.className = 'message-payment-card-address'; address.textContent = data.address;
    card.append(addressLabel, address);
    if (typeof QrCode?.createSvg === 'function') {
      const disclosure = document.createElement('details'); disclosure.className = 'message-payment-card-qr';
      const summary = document.createElement('summary'); summary.textContent = walletRequest
        ? localized('Show payment request QR', 'Mostrar QR do pedido de pagamento')
        : localized('Show address QR', 'Mostrar QR do endereço');
      const qrContent = document.createElement('div'); qrContent.className = 'message-payment-card-qr-content';
      const qrTitle = walletRequest
        ? localized('Wallet payment request QR', 'QR do pedido de pagamento para carteira')
        : localized('QR code with the receiving address only', 'Código QR somente com o endereço de recebimento');
      qrContent.append(QrCode.createSvg(walletRequest?.uri || data.address, qrTitle));
      const qrNote = document.createElement('span');
      qrNote.textContent = walletRequest
        ? (data.amount
          ? localized('This request includes the exact amount. Confirm recipient, network, and fees in your wallet.', 'Este pedido inclui o valor exato. Confira destinatário, rede e taxas na carteira.')
          : localized('This request opens the address. Enter and confirm the amount in your wallet.', 'Este pedido abre o endereço. Informe e confirme o valor na carteira.'))
        : localized('Address only: this network cannot be selected safely in a wallet link. Confirm the network and amount manually.', 'Somente o endereço: esta rede não pode ser selecionada com segurança por um link de carteira. Confira a rede e o valor manualmente.');
      qrContent.append(qrNote);
      disclosure.append(summary, qrContent); card.append(disclosure);
    }
    if (data.note) { const note = document.createElement('p'); note.className = 'message-payment-card-note'; note.textContent = data.note; card.append(note); }
    const footer = document.createElement('div'); footer.className = 'message-payment-card-footer';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'button secondary message-payment-card-copy';
    copy.textContent = localized('Copy address', 'Copiar endereço');
    const status = document.createElement('span'); status.className = 'message-payment-card-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    copy.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(data.address);
        status.textContent = localized('Address copied.', 'Endereço copiado.');
      } catch { status.textContent = localized('Could not copy the address here.', 'Não foi possível copiar o endereço aqui.'); }
    });
    footer.append(copy);
    if (walletRequest) {
      const openWallet = document.createElement('a'); openWallet.className = 'button primary message-payment-card-open-wallet';
      openWallet.href = walletRequest.uri;
      openWallet.textContent = localized('Open in wallet', 'Abrir na carteira');
      openWallet.setAttribute('aria-label', localized(`Open ${data.currency} ${PaymentCard.networkLabel(data.network)} request in a wallet`, `Abrir pedido de ${data.currency} ${PaymentCard.networkLabel(data.network)} em uma carteira`));
      const copyRequest = document.createElement('button'); copyRequest.type = 'button'; copyRequest.className = 'button secondary message-payment-card-copy-request';
      copyRequest.textContent = localized('Copy payment request', 'Copiar pedido de pagamento');
      copyRequest.addEventListener('click', async () => {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(walletRequest.uri);
          status.textContent = localized('Payment request copied.', 'Pedido de pagamento copiado.');
        } catch { status.textContent = localized('Could not copy the payment request here.', 'Não foi possível copiar o pedido de pagamento aqui.'); }
      });
      footer.append(openWallet, copyRequest);
    }
    if (walletRequestError) {
      const reason = document.createElement('span'); reason.className = 'message-payment-card-status';
      reason.textContent = walletRequestError.code === 'network-ambiguous'
        ? localized('A wallet link cannot safely select this network. Use the address QR and verify the network in your wallet.', 'O link não consegue selecionar esta rede com segurança. Use o QR do endereço e confira a rede na carteira.')
        : localized('The address does not match the selected network. Use the address QR only after checking it in your wallet.', 'O endereço não corresponde à rede selecionada. Use apenas o QR do endereço depois de conferir na carteira.');
      footer.append(reason);
    }
    footer.append(status); card.append(footer);
    const caution = document.createElement('p'); caution.className = 'message-payment-card-caution';
    caution.textContent = localized('Property does not send or verify payments. Check the address and network before paying.', 'O Property não envia nem confirma pagamentos. Confira o endereço e a rede antes de pagar.');
    card.append(caution);
    target.replaceChildren(card);
    return true;
  }

  function insertPaymentCardDraft() {
    const error = $('payment-card-error'); error.textContent = '';
    try {
      const content = PaymentCard.build({
        currency: selectedPaymentCurrency(),
        network: $('payment-card-network').value,
        amount: $('payment-card-amount').value,
        address: $('payment-card-address').value,
        note: $('payment-card-note').value
      });
      const input = $('message-input');
      input.value = [input.value.trimEnd(), content].filter(Boolean).join('\n\n');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      $('payment-card-dialog').close();
      input.focus();
      showToast(localized('Payment details were added to your draft. Review before sending.', 'Os dados de pagamento foram adicionados ao rascunho. Confira antes de enviar.'));
    } catch (failure) {
      error.textContent = failure.message || localized('Check the payment details and try again.', 'Confira os dados de pagamento e tente novamente.');
    }
  }

  function setFileAttachmentStatus(message = '') {
    const status = $('file-attachment-status');
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function renderFileDrafts() {
    const list = $('file-attachment-list');
    const send = $('file-attachment-send');
    const add = $('file-attachment-add');
    if (!list || !send || !add) return;
    const close = $('file-attachment-close');
    const cancel = $('file-attachment-cancel');
    list.classList.toggle('multi', state.fileDraftFiles.length > 1);
    list.replaceChildren();
    state.fileDraftFiles.forEach((file, index) => {
      const isPreviewableImage = ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const item = document.createElement('li');
      item.className = `file-attachment-item${state.fileDraftFiles.length === 1 && isPreviewableImage ? ' single-image' : ''}`;
      let icon;
      if (isPreviewableImage) {
        let previewUrl = state.fileDraftObjectUrls.get(file);
        if (!previewUrl) { previewUrl = URL.createObjectURL(file); state.fileDraftObjectUrls.set(file, previewUrl); }
        icon = document.createElement('img'); icon.className = 'file-attachment-thumb'; icon.src = previewUrl;
        icon.alt = localized('Local image preview', 'Prévia local da imagem'); icon.loading = 'lazy';
      } else {
        icon = document.createElement('span'); icon.className = 'file-attachment-file-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '▤';
      }
      const details = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = FileTransfers.safeName(file.name);
      const size = document.createElement('small'); size.textContent = `${FileTransfers.formatSize(file.size, window.PropertyI18n?.language || 'en')} · ${file.type || 'application/octet-stream'}`;
      details.append(name, size);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button small'; remove.textContent = '×';
      remove.setAttribute('aria-label', localized(`Remove ${FileTransfers.safeName(file.name)}`, `Remover ${FileTransfers.safeName(file.name)}`));
      remove.disabled = state.fileSendBusy;
      remove.addEventListener('click', () => {
        if (state.fileSendBusy) return;
        const previewUrl = state.fileDraftObjectUrls.get(file);
        if (previewUrl) { URL.revokeObjectURL(previewUrl); state.fileDraftObjectUrls.delete(file); }
        state.fileDraftFiles.splice(index, 1); renderFileDrafts();
      });
      item.append(icon, details, remove); list.append(item);
    });
    const relayEligible = state.fileDraftFiles.every(file => file.size <= FileTransfers.MAX_FILE_BYTES) &&
      state.fileDraftFiles.reduce((sum, file) => sum + file.size, 0) <= MAX_FILE_BATCH_BYTES;
    send.disabled = state.fileSendBusy || state.fileDraftFiles.length === 0 || !relayEligible;
    if (!state.fileSendBusy && state.fileDraftFiles.length && !relayEligible) {
      setFileAttachmentStatus(state.currentConversation?.group === true
        ? localized('Group relay delivery is limited to 2 MiB per file and 4 MiB per send.', 'O envio por relays em grupos se limita a 2 MiB por arquivo e 4 MiB por envio.')
        : localized('These files exceed the relay delivery limit. Use the direct encrypted transfer with the recipient online.',
          'Estes arquivos excedem o limite de envio pelos relays. Use a transferência direta criptografada com a outra pessoa online.'));
    }
    const directSend = $('file-attachment-send-direct');
    if (directSend) {
      const directUnavailable = !state.secret || !state.activePeer || state.currentConversation?.group === true ||
        state.activeConversationAgent || state.activeConversationBlocked || Boolean(state.editingMessage);
      directSend.hidden = directUnavailable;
      directSend.disabled = state.fileSendBusy || !state.fileDraftFiles.length;
    }
    const directCancel = $('file-direct-cancel-transfer');
    if (directCancel) directCancel.hidden = !state.directFileSendJob || !state.fileSendBusy;
    add.disabled = state.fileSendBusy || state.fileDraftFiles.length >= MAX_FILE_BATCH_FILES;
    if (close) close.disabled = state.fileSendBusy;
    if (cancel) cancel.disabled = state.fileSendBusy;
  }

  function addFileDrafts(fileList) {
    if (!state.activePeer) { showToast(localized('Open a conversation before attaching files.', 'Abra uma conversa antes de anexar arquivos.')); return false; }
    if (state.activeConversationAgent || state.activeConversationBlocked) { showToast(localized('Files are unavailable in this conversation.', 'Arquivos não estão disponíveis nesta conversa.')); return false; }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return false;
    const combined = [...state.fileDraftFiles, ...incoming];
    if (combined.length > MAX_FILE_BATCH_FILES) { showToast(localized(`Choose no more than ${MAX_FILE_BATCH_FILES} files at a time.`, `Escolha no máximo ${MAX_FILE_BATCH_FILES} arquivos por envio.`)); return false; }
    const directAvailable = state.currentConversation?.group !== true;
    const maxFileBytes = directAvailable ? DirectFileChunks.MAX_FILE_BYTES : FileTransfers.MAX_FILE_BYTES;
    const maxBatchBytes = directAvailable ? MAX_DIRECT_FILE_BATCH_BYTES : MAX_FILE_BATCH_BYTES;
    if (combined.some(file => !Number.isSafeInteger(file.size) || file.size > maxFileBytes)) {
      showToast(directAvailable
        ? localized('Each file must be 100 MiB or smaller.', 'Cada arquivo precisa ter no máximo 100 MiB.')
        : localized('Group files must be 2 MiB or smaller.', 'Arquivos em grupos precisam ter no máximo 2 MiB.'));
      return false;
    }
    if (combined.reduce((total, file) => total + file.size, 0) > maxBatchBytes) {
      showToast(directAvailable
        ? localized('The combined file size must be 100 MiB or smaller.', 'O tamanho total dos arquivos precisa ser de no máximo 100 MiB.')
        : localized('Group files must total 4 MiB or less.', 'Os arquivos do grupo podem somar no máximo 4 MiB.'));
      return false;
    }
    state.fileDraftFiles = combined;
    renderFileDrafts();
    if (!$('file-attachment-dialog').open) $('file-attachment-dialog').showModal();
    return true;
  }

  function clearFileDrafts() {
    for (const url of state.fileDraftObjectUrls.values()) URL.revokeObjectURL(url);
    state.fileDraftObjectUrls.clear();
    state.fileDraftTransferIds.clear();
    state.fileDraftFiles = [];
    state.shareFileDraftId = ''; state.shareFileDraftPeer = ''; state.shareFileDraftFiles = [];
    $('file-attachment-caption').value = '';
    setFileAttachmentStatus('');
    renderFileDrafts();
  }
  function cancelVoiceRecording({ notify = false } = {}) {
    const recorder = state.voiceRecorder;
    stopLocalRecordingSignal();
    if (!recorder) return;
    state.voiceSequence++;
    state.voiceRecorder = null;
    state.voiceRecorderPeer = '';
    state.voiceRecorderStartedAt = 0;
    state.voiceStopping = false;
    clearVoiceTimer();
    recorder.cancel();
    renderVoiceComposer();
    if (notify) showToast(localized('Recording discarded.', 'Gravação descartada.'));
  }
  async function finishVoiceRecording() {
    const recorder = state.voiceRecorder;
    if (!recorder || state.voiceStopping) return;
    stopLocalRecordingSignal();
    state.voiceStopping = true;
    const sequence = state.voiceSequence;
    const peer = state.voiceRecorderPeer;
    clearVoiceTimer();
    renderVoiceComposer();
    try {
      const recording = await recorder.stop();
      if (sequence !== state.voiceSequence || state.activePeer !== peer) return;
      state.voiceRecorder = null;
      state.voiceRecorderPeer = '';
      state.voiceRecorderStartedAt = 0;
      state.voiceStopping = false;
      state.voiceDrafts.set(peer, { recording, url: URL.createObjectURL(recording.blob) });
      renderVoiceComposer();
    } catch (error) {
      if (sequence === state.voiceSequence) {
        state.voiceRecorder = null;
        state.voiceRecorderPeer = '';
        state.voiceRecorderStartedAt = 0;
        state.voiceStopping = false;
        renderVoiceComposer();
        showToast(error.message || localized('Could not finish this recording.', 'Não foi possível concluir esta gravação.'));
      }
    }
  }
  function toggleVoiceRecording() {
    const recorder = state.voiceRecorder;
    if (!recorder || state.voiceStopping) return;
    try {
      const changed = recorder.isPaused() ? recorder.resume() : recorder.pause();
      if (changed) {
        if (recorder.isPaused()) stopLocalRecordingSignal();
        else startLocalRecordingSignal(state.voiceRecorderPeer);
        renderVoiceComposer();
      }
    } catch {
      showToast(localized('Could not change the recording state.', 'Não foi possível alterar o estado da gravação.'));
    }
  }
  async function startVoiceRecording() {
    const peer = state.activePeer;
    if (!peer || !state.secret || state.activeConversationAgent || state.activeConversationBlocked) return;
    if ($('message-input').value.trim()) {
      showToast(localized('Send or clear your text before recording a separate voice message.', 'Envie ou apague o texto antes de gravar uma mensagem de voz separada.'));
      return;
    }
    if (state.voiceDrafts.has(peer)) {
      showToast(localized('Send or discard the voice message preview first.', 'Envie ou descarte a prévia de voz primeiro.'));
      return;
    }
    const recorder = new VoiceMessages.Recorder();
    state.voiceRecorder = recorder;
    state.voiceRecorderPeer = peer;
    state.voiceRecorderStartedAt = 0;
    state.voiceStopping = false;
    const sequence = ++state.voiceSequence;
    renderVoiceComposer();
    try {
      await recorder.start();
      if (sequence !== state.voiceSequence || state.activePeer !== peer) { recorder.cancel(); return; }
      state.voiceRecorderStartedAt = Date.now();
      startLocalRecordingSignal(peer);
      renderVoiceComposer();
      state.voiceTimer = window.setInterval(() => {
        if (state.voiceRecorder !== recorder) { clearVoiceTimer(); return; }
        renderVoiceComposer();
        if (recorder.elapsed() >= VoiceMessages.MAX_DURATION_MS) void finishVoiceRecording();
      }, 250);
    } catch (error) {
      if (sequence === state.voiceSequence) {
        state.voiceRecorder = null;
        state.voiceRecorderPeer = '';
        state.voiceRecorderStartedAt = 0;
        renderVoiceComposer();
        showToast(error.message || localized('Could not access the microphone.', 'Não foi possível acessar o microfone.'));
      }
    }
  }
  async function sendVoiceDraft() {
    const peer = state.activePeer;
    const draft = state.voiceDrafts.get(peer);
    if (!peer || !draft) return;
    const button = $('voice-send-button');
    button.disabled = true;
    try {
      const result = await sendPrivateMessage(peer, VoiceMessages.FALLBACK_TEXT, state.replyingTo, { voiceRecording: draft.recording });
      if (result.cancelled) return;
      clearVoiceDraft();
      if (state.activePeer === peer && state.replyingTo) { state.replyingTo = null; updateReplyContext(); }
    } catch (error) {
      showToast(error.message || localized('Could not send this voice message.', 'Não foi possível enviar esta mensagem de voz.'));
    } finally {
      if (state.voiceDrafts.has(peer)) button.disabled = false;
      renderVoiceComposer();
    }
  }
  async function prepareFileRelayRoutes(peer) {
    await resolveInboxRelaysFor(state.pubkey);
    const conversation = await get('conversations', peer);
    if (conversation?.group === true) {
      const members = [...new Set(conversation.members || [])].sort();
      if (members.length < 3 || members.length > MAX_NIP17_GROUP_MEMBERS || !members.includes(state.pubkey)) throw new Error(localized('This group cannot receive file attachments.', 'Este grupo não pode receber anexos de arquivo.'));
      for (const member of members) await resolveInboxRelaysFor(member);
    } else await resolveInboxRelaysFor(peer);
    await connectAllRelays();
  }
  async function sendFileDrafts() {
    const peer = state.activePeer;
    const files = [...state.fileDraftFiles];
    const caption = $('file-attachment-caption').value.trim();
    if (!peer || !files.length || state.fileSendBusy) return;
    if (files.some(file => file.size > FileTransfers.MAX_FILE_BYTES) ||
        files.reduce((sum, file) => sum + file.size, 0) > MAX_FILE_BATCH_BYTES) {
      showToast(localized('This batch is above the NIP-17 relay limit. Use direct transfer while the recipient is online.',
        'Este lote excede o limite de envio NIP-17 pelos relays. Use a transferência direta enquanto a outra pessoa estiver online.'));
      return;
    }
    if (state.activeConversationAgent || state.activeConversationBlocked) {
      showToast(localized('Files are unavailable in this conversation.', 'Arquivos não estão disponíveis nesta conversa.'));
      return;
    }
    state.fileSendBusy = true;
    renderFileDrafts();
    renderVoiceComposer();
    const sendButton = $('file-attachment-send');
    sendButton.disabled = true;
    let savedParts = 0;
    let confirmed = 0;
    let required = 0;
    const failures = [];
    const transfers = [];
    let totalChunks = 0;
    try {
      setFileAttachmentStatus(localized('Preparing encrypted delivery…', 'Preparando a entrega criptografada…'));
      await prepareFileRelayRoutes(peer);
      for (let index = 0; index < files.length; index += 1) {
        setFileAttachmentStatus(localized(`Preparing file ${index + 1} of ${files.length}…`, `Preparando arquivo ${index + 1} de ${files.length}…`));
        let retry = state.fileDraftTransferIds.get(files[index]);
        if (!retry || retry.caption !== caption) {
          retry = { caption, transferId: FileTransfers.randomTransferId() };
          state.fileDraftTransferIds.set(files[index], retry);
        }
        transfers.push(await FileTransfers.createTransfer(files[index], { transferId: retry.transferId, caption }));
      }
      totalChunks = transfers.reduce((total, transfer) => total + transfer.chunks.length, 0);
      let completedChunks = 0;
      sendingFiles: for (let fileIndex = 0; fileIndex < transfers.length; fileIndex += 1) {
        const transfer = transfers[fileIndex];
        for (const chunk of transfer.chunks) {
          completedChunks += 1;
          setFileAttachmentStatus(localized(
            `Encrypting and sending file ${fileIndex + 1} of ${transfers.length} · part ${chunk.index + 1} of ${chunk.totalChunks} (${completedChunks} of ${totalChunks} total)`,
            `Criptografando e enviando arquivo ${fileIndex + 1} de ${transfers.length} · parte ${chunk.index + 1} de ${chunk.totalChunks} (${completedChunks} de ${totalChunks} no total)`
          ));
          try {
            const result = await sendPrivateMessage(peer, caption, state.replyingTo, {
              quiet: true, secretConfirmed: true, fileChunk: chunk, deferRender: true
            });
            if (!result.savedLocally) throw new Error(localized('A file part was not saved locally.', 'Uma parte do arquivo não foi salva neste aparelho.'));
            savedParts += 1;
            confirmed += result.confirmedEnvelopeCount;
            required += result.requiredEnvelopeCount;
          } catch (error) { failures.push(error); break sendingFiles; }
        }
      }
      if (state.activePeer === peer) await renderMessages(peer);
      await renderConversations();
      const complete = !failures.length && savedParts === totalChunks && confirmed >= required;
      if (complete) {
        const sharedFilesIncluded = state.shareFileDraftFiles.length > 0 && state.shareFileDraftFiles.every(file => files.includes(file));
        const sentShareId = state.shareFileDraftPeer === peer && sharedFilesIncluded ? state.shareFileDraftId : '';
        clearFileDrafts();
        $('file-attachment-dialog').close();
        if (state.replyingTo) { state.replyingTo = null; updateReplyContext(); }
        if (sentShareId) {
          try {
            await ShareInbox.remove(sentShareId);
            await renderShareInbox();
          } catch {
            showToast(localized('Files were sent, but the shared item remains in the local inbox.', 'Os arquivos foram enviados, mas o item compartilhado continua na caixa local.'));
          }
        }
        showToast(localized('Encrypted file parts were confirmed by the inbox relays. This does not confirm that the recipient has downloaded the file.', 'Os relays de recebimento confirmaram as partes criptografadas. Isso não confirma que a outra pessoa baixou o arquivo.'));
      } else {
        setFileAttachmentStatus(localized(
          `${savedParts} of ${totalChunks} parts were saved here; ${confirmed} of ${required} relay acknowledgements arrived. Press Send files to retry this same attachment.`,
          `${savedParts} de ${totalChunks} partes foram salvas aqui; chegaram ${confirmed} de ${required} confirmações dos relays. Toque em Enviar arquivos para tentar novamente este mesmo anexo.`
        ));
        showToast(localized(
          'The attachment is not fully confirmed. Its draft is kept so you can retry; some parts may already be on relays.',
          'O anexo ainda não foi totalmente confirmado. O rascunho foi mantido para você tentar novamente; algumas partes podem já estar nos relays.'
        ));
      }
    } catch (error) {
      setFileAttachmentStatus(error.message || localized('Could not prepare these files.', 'Não foi possível preparar estes arquivos.'));
      showToast(error.message || localized('Could not prepare these files.', 'Não foi possível preparar estes arquivos.'));
    } finally {
      state.fileSendBusy = false;
      renderFileDrafts();
      renderVoiceComposer();
    }
  }

  function typingPreferenceId(pubkey = state.pubkey) { return `typing-indicators-${pubkey}`; }
  function readReceiptsPreferenceId(pubkey = state.pubkey) { return `property-read-receipts:${pubkey}`; }
  function activeStatusPreferenceId(pubkey = state.pubkey) { return `property-active-status:${pubkey}`; }
  function readReceiptRecordPrefix(pubkey = state.pubkey) { return `property-read-receipt:${pubkey}:`; }
  function readReceiptRecordId(pubkey, messageId) { return `${readReceiptRecordPrefix(pubkey)}${messageId}`; }
  function typingActivityVerb(action) {
    if (action === 'recording') return localized('is recording audio…', 'está gravando áudio…');
    if (action === 'thinking') return localized('is thinking…', 'está pensando…');
    return localized('is typing…', 'está digitando…');
  }
  function typingActivityMany(action, count = null) {
    const subject = count === null
      ? localized('Several people', 'Várias pessoas')
      : `${count} ${localized('people', 'pessoas')}`;
    if (action === 'recording') return `${subject} ${localized('are recording audio…', 'estão gravando áudio…')}`;
    if (action === 'thinking') return `${subject} ${localized('are thinking…', 'estão pensando…')}`;
    return `${subject} ${localized('are typing…', 'estão digitando…')}`;
  }
  function typingActivityPreviewText(peer, group, hasSearchMatch = false) {
    if (hasSearchMatch) return '';
    const senders = [...state.remoteTyping.values()].filter(item => item.peer === peer);
    if (!senders.length) return '';
    const action = TypingSignals.summarizeActivity(senders.map(item => item.action)) || 'typing';
    if (senders.length > 1) return typingActivityMany(action, senders.length);
    if (group) {
      const profile = state.peerProfiles.get(senders[0].sender);
      const name = displayName(senders[0].sender, profile?.displayName || profile?.name || localized('Someone', 'Alguém'));
      return `${name} ${typingActivityVerb(action)}`;
    }
    if (action === 'recording') return localized('Recording audio…', 'Gravando áudio…');
    if (action === 'thinking') return localized('Thinking…', 'Pensando…');
    return localized('Typing…', 'Digitando…');
  }
  function renderConversationActivityPreviews() {
    const list = $('conversation-list');
    if (!list) return;
    for (const preview of list.querySelectorAll('[data-conversation-preview]')) {
      const activity = typingActivityPreviewText(preview.dataset.conversationPreview,
        preview.dataset.conversationGroup === 'true', preview.dataset.hasSearchMatch === 'true');
      preview.textContent = activity || preview.dataset.messagePreview || '';
      preview.classList.toggle('conversation-activity-preview', Boolean(activity));
    }
  }
  function renderRemoteTyping() {
    renderConversationActivityPreviews();
    const output = $('chat-activity');
    if (!output) return;
    const senders = [...state.remoteTyping.values()].filter(item => item.peer === state.activePeer);
    if (!senders.length) {
      const presence = [...state.remotePresence.values()].find(item => item.peer === state.activePeer);
      if (!presence) { output.textContent = ''; output.hidden = true; return; }
      const profile = state.peerProfiles.get(presence.sender);
      const name = displayName(presence.sender, state.currentConversation?.title || profile?.displayName || profile?.name || '');
      output.textContent = `${name} ${localized('is active now', 'está ativo agora')}`;
      output.hidden = false;
      return;
    }
    output.hidden = false;
    if (senders.length > 1) {
      const action = TypingSignals.summarizeActivity(senders.map(item => item.action)) || 'typing';
      output.textContent = typingActivityMany(action);
      return;
    }
    const sender = senders[0].sender;
    const profile = state.peerProfiles.get(sender);
    const conversationName = state.currentConversation?.group === true ? '' : state.currentConversation?.title || '';
    const name = displayName(sender, conversationName || profile?.displayName || profile?.name || '');
    output.textContent = `${name} ${typingActivityVerb(senders[0].action)}`;
  }
  function clearRemoteTypingKey(key) {
    clearTimeout(state.typingTimers.get(key));
    state.typingTimers.delete(key);
    state.remoteTyping.delete(key);
    renderRemoteTyping();
  }
  function clearRemoteTyping(peer, sender) {
    clearRemoteTypingKey(`${peer}:${sender}`);
  }
  function clearAllRemoteTyping() {
    for (const timer of state.typingTimers.values()) clearTimeout(timer);
    state.typingTimers.clear();
    state.remoteTyping.clear();
    renderRemoteTyping();
  }
  function clearAllRemotePresence() {
    for (const timer of state.presenceTimers.values()) clearTimeout(timer);
    state.presenceTimers.clear();
    state.remotePresence.clear();
    renderRemoteTyping();
  }
  function typingParticipants(peer) {
    const conversation = state.currentConversation;
    if (!state.pubkey || !conversation || peer !== state.activePeer) return [];
    const participants = conversation.group === true
      ? [...new Set((conversation.members || []).map(key => String(key).toLowerCase()))].sort()
      : [...new Set([state.pubkey.toLowerCase(), String(conversation.pubkey || peer).toLowerCase()])].sort();
    if (participants.length < 2 || participants.length > MAX_NIP17_GROUP_MEMBERS ||
        participants.some(key => !/^[0-9a-f]{64}$/.test(key)) || !participants.includes(state.pubkey.toLowerCase())) return [];
    return participants;
  }
  function nextTypingSequence() {
    state.typingSequence = Math.max(state.typingSequence + 1, Date.now() * 1000);
    return state.typingSequence;
  }
  async function resolveTypingRelays(pubkey) {
    const cached = state.peerInboxRelays.get(pubkey) || [];
    if (cached.length) return cached;
    const existing = state.typingRelayLookups.get(pubkey);
    if (existing) return existing;
    const lookup = resolveInboxRelaysFor(pubkey).catch(() => []);
    state.typingRelayLookups.set(pubkey, lookup);
    try { return await lookup; }
    finally { if (state.typingRelayLookups.get(pubkey) === lookup) state.typingRelayLookups.delete(pubkey); }
  }
  async function publishEphemeralToRelays(event, targetRelays) {
    const urls = [...new Set((targetRelays || []).map(normalizeRelay))];
    if (!urls.length) return 0;
    for (const url of urls) connectRelay(url);
    const opened = await Promise.all(urls.map(async url => await waitForOpen(url) ? url : null));
    let published = 0;
    for (const url of opened) if (url) { relayMessage(url, ['EVENT', event]); published += 1; }
    return published;
  }
  function createCallId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function callTerminal(status) { return ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(status); }
  function callPeerLabel(peer) {
    if (state.currentConversation?.pubkey === peer) return conversationLabel(state.currentConversation);
    const profile = state.peerProfiles.get(peer);
    return displayName(peer, profile?.displayName || profile?.name || '');
  }
  function callStatusText(call) {
    if (call.status === 'incoming') return call.requestedMedia === 'video'
      ? localized('Incoming video call', 'Chamada de vídeo recebida')
      : localized('Incoming audio call', 'Chamada de áudio recebida');
    if (call.status === 'requesting-media') return localized('Requesting microphone or camera permission…', 'Solicitando permissão para microfone ou câmera…');
    if (call.status === 'ringing') return localized('Calling… Waiting for an answer.', 'Chamando… Aguardando resposta.');
    if (call.status === 'connecting') return localized('Setting up the direct media path…', 'Conectando a mídia diretamente…');
    if (call.status === 'connected') return localized('Connected. Audio and video travel directly between devices.', 'Conectado. Áudio e vídeo seguem diretamente entre os aparelhos.');
    if (call.status === 'reconnecting') return localized('The direct path paused. Trying to reconnect…', 'A conexão direta foi interrompida. Tentando reconectar…');
    if (call.status === 'no-path') return localized('No direct media path was found. Configure a compatible TURN server in Relay settings and try again.', 'Não foi encontrada uma conexão direta de mídia. Configure um servidor TURN compatível em Relays e tente novamente.');
    if (call.status === 'busy') return localized('The other person is already on a call.', 'A outra pessoa já está em uma chamada.');
    if (call.status === 'declined') return localized('The call was declined.', 'A chamada foi recusada.');
    if (call.status === 'ended') return localized('Call ended.', 'Chamada encerrada.');
    return call.error || localized('The call could not be started.', 'Não foi possível iniciar a chamada.');
  }
  function webRtcPeerConfiguration() {
    if (state.iceSettingsInvalid) throw new Error(localized(
      'Saved WebRTC settings are locked or damaged. Re-enter or clear them in Relay settings before connecting.',
      'As configurações WebRTC salvas estão bloqueadas ou danificadas. Digite-as de novo ou limpe-as em Relays antes de conectar.'
    ));
    return IceServers.peerConfiguration(state.iceSettings);
  }
  function webRtcSettingsErrorText(error) {
    const message = error?.message || localized('Could not save WebRTC settings.', 'Não foi possível salvar as configurações WebRTC.');
    const pt = {
      'Enter a valid STUN or TURN server address.': 'Informe um endereço de servidor STUN ou TURN válido.',
      'Use a STUN/TURN URL such as turn:turn.example.org:3478?transport=udp.': 'Use um endereço STUN/TURN, por exemplo turn:turn.example.org:3478?transport=udp.',
      'The STUN/TURN server address is invalid.': 'O endereço do servidor STUN/TURN é inválido.',
      'The STUN/TURN port must be between 1 and 65535.': 'A porta STUN/TURN deve estar entre 1 e 65535.',
      'Use no more than 8 STUN/TURN URLs.': 'Use no máximo 8 endereços STUN/TURN.',
      'Remove duplicate STUN/TURN URLs.': 'Remova os endereços STUN/TURN duplicados.',
      'WebRTC settings are invalid.': 'As configurações WebRTC são inválidas.',
      'Server URLs, username, and credential must be text.': 'Os endereços, o nome de usuário e a credencial do servidor precisam ser texto.',
      'The TURN username or credential is too long or contains control characters.': 'O nome de usuário ou a credencial TURN é muito longo ou contém caracteres de controle.',
      'A TURN server needs both a username and a credential.': 'Um servidor TURN exige nome de usuário e credencial.',
      'Add a TURN URL before entering TURN credentials.': 'Adicione um endereço TURN antes de informar as credenciais.',
      'Relay-only mode must be on or off.': 'O modo somente relay precisa estar ligado ou desligado.',
      'Relay-only mode requires a configured TURN server.': 'O modo somente relay exige um servidor TURN configurado.'
    };
    return localized(message, pt[message] || message);
  }
  function webRtcDisclosureText() {
    if (state.iceSettingsInvalid) return localized(
      'Saved WebRTC settings could not be decrypted. Calls and direct file transfers stay blocked until you re-enter or clear them in Relay settings.',
      'Não foi possível decifrar as configurações WebRTC salvas. Chamadas e transferências diretas ficam bloqueadas até você digitá-las de novo ou limpá-las em Relays.'
    );
    const mode = IceServers.classify(state.iceSettings);
    if (mode.relayOnly) return localized(
      'Relay-only is on: this connection uses only your configured TURN server and does not fall back to a direct path. The contact sees the TURN server address; its operator sees your IP and encrypted WebRTC packets. If TURN is unavailable, the connection fails.',
      'Somente relay está ativo: esta conexão usa apenas o servidor TURN configurado e não tenta uma rota direta. A outra pessoa vê o endereço do TURN; quem o opera vê seu IP e os pacotes WebRTC criptografados. Se o TURN estiver indisponível, a conexão falha.'
    );
    if (mode.usesDefaultStun) return localized(
      'Direct WebRTC may reveal your network IP to the other person. The bundled Google STUN servers also see your IP. A TURN server can relay encrypted packets; configure one in Relay settings. Relay-only routing is available when TURN is configured.',
      'O WebRTC direto pode revelar seu IP de rede à outra pessoa. Os servidores STUN do Google incluídos também veem seu IP. Um servidor TURN pode retransmitir pacotes criptografados; configure um em Relays. O modo somente relay fica disponível quando há TURN configurado.'
    );
    if (mode.hasTurn) return localized(
      'Your configured ICE servers may use a direct path or TURN. Direct candidates can reveal your IP to the other person; STUN operators see your IP, and the TURN operator sees your IP and encrypted packets. Enable relay-only in Relay settings to avoid direct candidates; it will not fall back if TURN fails.',
      'Os servidores ICE configurados podem usar uma rota direta ou TURN. Candidatos diretos podem revelar seu IP à outra pessoa; operadores STUN veem seu IP, e o operador TURN vê seu IP e pacotes criptografados. Ative somente relay em Relays para evitar candidatos diretos; não haverá fallback se o TURN falhar.'
    );
    return localized(
      'Your configured STUN server sees your public IP, and a direct WebRTC path may reveal it to the other person. No TURN relay is configured, so some networks cannot connect.',
      'O servidor STUN configurado vê seu IP público, e uma conexão WebRTC direta pode revelá-lo à outra pessoa. Não há relay TURN configurado, então algumas redes não conseguem conectar.'
    );
  }
  function renderIceSettings() {
    if (!$('ice-server-urls')) return;
    $('ice-server-urls').value = state.iceSettings.urls;
    $('ice-server-username').value = state.iceSettings.username;
    $('ice-server-credential').value = '';
    $('ice-server-credential').placeholder = state.iceSettings.credential
      ? localized('Saved locally; leave blank to keep it', 'Salva localmente; deixe vazio para mantê-la')
      : localized('Required by your TURN server', 'Exigida pelo servidor TURN');
    $('ice-relay-only').checked = state.iceSettings.relayOnly;
    let hasTurn = false;
    try { hasTurn = IceServers.classify(state.iceSettings).hasTurn; } catch {}
    $('ice-relay-only').disabled = !hasTurn || state.iceSettingsInvalid;
    $('ice-settings-status').textContent = state.iceSettingsInvalid
      ? localized('Saved settings could not be decrypted. Re-enter or clear them before starting calls or direct transfers.', 'Não foi possível decifrar as configurações salvas. Digite-as de novo ou limpe-as antes de iniciar chamadas ou transferências diretas.')
      : state.iceSettings.urls
        ? localized('Custom ICE servers are saved on this device for this identity.', 'Os servidores ICE personalizados estão salvos neste aparelho para esta identidade.')
        : localized('Using the bundled public STUN servers. No TURN server is configured.', 'Usando os servidores STUN públicos incluídos. Nenhum servidor TURN está configurado.');
    $('ice-settings-error').textContent = '';
  }
  async function saveIceSettings() {
    const saveButton = $('save-ice-settings');
    saveButton.disabled = true;
    $('ice-settings-error').textContent = '';
    try {
      const secret = state.secret;
      const pubkey = state.pubkey;
      if (!secret || !pubkey) throw new Error(localized('Unlock Property before saving WebRTC settings.', 'Desbloqueie o Property antes de salvar configurações WebRTC.'));
      const urlsInput = $('ice-server-urls').value;
      const usernameInput = $('ice-server-username').value.trim();
      const normalizedUrlInput = urlsInput.trim() ? urlsInput.trim().split(/[\s,]+/).join('\n') : '';
      let credential = $('ice-server-credential').value;
      if (!credential && !state.iceSettingsInvalid && normalizedUrlInput === state.iceSettings.urls && usernameInput === state.iceSettings.username) {
        credential = state.iceSettings.credential;
      }
      const next = IceServers.normalize({ urls: urlsInput, username: usernameInput, credential, relayOnly: $('ice-relay-only').checked });
      const activeCall = state.call && !callTerminal(state.call.status);
      const activeTransfer = state.directFileTransfer && !['completed', 'cancelled', 'declined', 'failed'].includes(state.directFileTransfer.status);
      if (next.relayOnly !== state.iceSettings.relayOnly && (activeCall || activeTransfer)) {
        throw new Error(localized('End the active call or direct file transfer before changing relay-only routing.', 'Encerre a chamada ou transferência direta ativa antes de mudar o roteamento somente por relay.'));
      }
      const id = IceServers.iceSettingsId(pubkey);
      const record = next.urls ? IceServers.seal(N, secret, pubkey, next) : null;
      if (state.pubkey !== pubkey || state.secret !== secret) throw new Error(localized('The identity was locked before these settings could be saved.', 'A identidade foi bloqueada antes que as configurações fossem salvas.'));
      if (record) await put('settings', record);
      else await del('settings', id);
      if (state.pubkey !== pubkey || state.secret !== secret) return;
      state.iceSettings = next;
      state.iceSettingsInvalid = false;
      renderIceSettings();
      $('ice-settings-status').textContent = localized('WebRTC settings saved on this device. New calls and direct transfers will use them.', 'Configurações WebRTC salvas neste aparelho. Novas chamadas e transferências diretas vão usá-las.');
    } catch (error) {
      $('ice-settings-error').textContent = webRtcSettingsErrorText(error);
    } finally {
      saveButton.disabled = false;
    }
  }
  function renderCallMedia(stream, local = false) {
    const videos = (local ? ['call-local-video', 'call-mini-local-video'] : ['call-remote-video', 'call-mini-remote-video']).map($);
    if (local) {
      for (const video of videos) {
        video.srcObject = stream || null;
        video.hidden = !stream || !stream.getVideoTracks?.().length;
        if (stream && !video.hidden) video.play().catch(() => {});
      }
      return;
    }
    const audio = $('call-remote-audio');
    audio.srcObject = stream || null;
    if (stream) audio.play().catch(() => {});
    const hasVideo = Boolean(stream?.getVideoTracks?.().length);
    for (const video of videos) {
      video.srcObject = hasVideo ? stream : null;
      video.hidden = !hasVideo;
      if (hasVideo) video.play().catch(() => {});
    }
    $('call-audio-avatar').hidden = hasVideo;
    $('call-mini-avatar').hidden = hasVideo;
  }
  async function setCallPeerLabels(call) {
    const sequence = ++state.callUiSequence;
    const fallback = callPeerLabel(call.peer);
    $('call-session-title').textContent = fallback;
    $('incoming-call-name').textContent = fallback;
    $('call-mini-title').textContent = fallback;
    const conversation = await get('conversations', call.peer).catch(() => null);
    if (sequence !== state.callUiSequence || state.call?.callId !== call.callId) return;
    const label = conversationLabel(conversation || call.peer);
    $('call-session-title').textContent = label;
    $('incoming-call-name').textContent = label;
    $('call-mini-title').textContent = label;
  }
  function setCallDeviceOptions(select, devices, selectedId, deviceName, translatedDeviceName) {
    const options = [
      { deviceId: '', label: localized('System default', 'Padrão do sistema') },
      ...devices.filter(device => device.deviceId && device.deviceId !== 'default').map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || localized(`${deviceName} ${index + 1}`, `${translatedDeviceName} ${index + 1}`)
      }))
    ];
    const currentId = selectedId === 'default' ? '' : selectedId;
    if (currentId && !options.some(option => option.deviceId === currentId)) {
      options.push({ deviceId: currentId, label: localized(`Current ${deviceName.toLowerCase()}`, `${translatedDeviceName.toLowerCase()} atual`) });
    }
    select.replaceChildren(...options.map(item => {
      const option = document.createElement('option');
      option.value = item.deviceId;
      option.textContent = item.label;
      return option;
    }));
    select.value = currentId || '';
  }
  async function refreshCallDeviceSettings() {
    const call = state.call;
    const controller = state.callController;
    const panel = $('call-device-settings');
    if (!panel.open || !call || callTerminal(call.status) || call.status === 'incoming' || !call.deviceSelectionAvailable || !controller?.listDevices) return;
    const devices = await controller.listDevices().catch(() => []);
    if (state.call?.callId !== call.callId || !panel.open) return;
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
    setCallDeviceOptions($('call-audio-input'), audioInputs, call.audioInputId, 'Microphone', 'Microfone');
    setCallDeviceOptions($('call-video-input'), videoInputs, call.videoInputId, 'Camera', 'Câmera');
    setCallDeviceOptions($('call-audio-output'), audioOutputs, call.audioOutputId, 'Speaker', 'Saída de áudio');
    $('call-audio-input-field').hidden = audioInputs.filter(device => device.deviceId && device.deviceId !== 'default').length < 2;
    $('call-video-input-field').hidden = call.localMedia !== 'video' || call.screenSharing || videoInputs.filter(device => device.deviceId && device.deviceId !== 'default').length < 2;
    $('call-audio-output-field').hidden = !call.audioOutputSelectionAvailable || audioOutputs.filter(device => device.deviceId && device.deviceId !== 'default').length < 2;
    panel.hidden = $('call-audio-input-field').hidden && $('call-video-input-field').hidden && $('call-audio-output-field').hidden;
  }
  function updateCallDeviceLabels() {
    $('call-device-settings-summary').textContent = localized('Audio and video devices', 'Dispositivos de áudio e vídeo');
    $('call-audio-input-label').textContent = localized('Microphone', 'Microfone');
    $('call-video-input-label').textContent = localized('Camera', 'Câmera');
    $('call-audio-output-label').textContent = localized('Speaker', 'Saída de áudio');
  }
  function updateCallState(call) {
    const previous = state.call;
    state.call = call;
    if (!call) {
      callWindow.hide();
      $('call-device-settings').open = false;
      $('call-device-settings').hidden = true;
      state.callUiHadSession = false;
      state.callUiSequence++;
      for (const id of ['incoming-call-dialog', 'call-session-dialog', 'call-consent-dialog']) if ($(id).open) $(id).close();
      renderCallMedia(null);
      renderCallMedia(null, true);
      return;
    }
    if (previous?.callId !== call.callId) callWindow.hide();
    void setCallPeerLabels(call);
    $('call-session-status').textContent = callStatusText(call);
    $('call-session-error').textContent = call.error || '';
    updateCallDeviceLabels();
    $('call-device-settings').hidden = callTerminal(call.status) || call.status === 'incoming' || !call.localMediaReady || !call.deviceSelectionAvailable;
    $('call-audio-input').disabled = call.deviceSettingsBusy || !call.localMediaReady;
    $('call-video-input').disabled = call.deviceSettingsBusy || !call.localMediaReady || call.screenSharing;
    $('call-audio-output').disabled = call.deviceSettingsBusy || !call.localMediaReady;
    $('incoming-call-copy').textContent = call.requestedMedia === 'video'
      ? localized('They are asking to start a video call.', 'A pessoa está iniciando uma chamada de vídeo.')
      : localized('They are asking to start an audio call.', 'A pessoa está iniciando uma chamada de áudio.');
    $('incoming-call-network-copy').textContent = webRtcDisclosureText();
    $('incoming-call-video').hidden = call.requestedMedia !== 'video';
    const terminal = callTerminal(call.status);
    $('call-mini-status').textContent = callStatusText(call);
    $('call-mini-title').textContent = callPeerLabel(call.peer);
    $('call-mini-brand').textContent = localized('PROPERTY · CALL', 'PROPERTY · CHAMADA');
    $('call-session-minimize').setAttribute('aria-label', localized('Minimize call', 'Minimizar chamada'));
    $('call-session-minimize').title = localized('Minimize call', 'Minimizar chamada');
    $('call-mini-restore').setAttribute('aria-label', localized('Return to call', 'Voltar à chamada'));
    $('call-mini-restore').title = localized('Return to call', 'Voltar à chamada');
    $('call-session-close').hidden = !terminal;
    $('call-session-minimize').hidden = terminal || call.status === 'incoming';
    $('call-end-button').hidden = terminal;
    $('call-microphone-toggle').hidden = terminal || call.status === 'incoming';
    $('call-microphone-toggle').disabled = call.deviceSettingsBusy || !call.localMediaReady || (!call.microphoneEnabled && !['requesting-media', 'connected', 'reconnecting'].includes(call.status));
    $('call-microphone-toggle').textContent = call.microphoneEnabled
      ? localized('Mute microphone', 'Silenciar microfone')
      : localized('Unmute microphone', 'Ativar microfone');
    $('call-camera-toggle').hidden = terminal || call.localMedia !== 'video' || call.screenSharing;
    $('call-camera-toggle').disabled = call.deviceSettingsBusy || !call.localMediaReady || (!call.cameraEnabled && !['requesting-media', 'connected', 'reconnecting'].includes(call.status));
    $('call-camera-toggle').textContent = call.cameraEnabled
      ? localized('Turn camera off', 'Desligar câmera')
      : localized('Turn camera on', 'Ligar câmera');
    $('call-screen-share-toggle').hidden = terminal || !call.screenShareAvailable;
    $('call-screen-share-toggle').disabled = call.deviceSettingsBusy || call.screenShareBusy || (!call.screenSharing && call.status !== 'connected');
    $('call-screen-share-toggle').textContent = call.screenSharing
      ? localized('Stop sharing', 'Parar compartilhamento')
      : localized('Share screen', 'Compartilhar tela');
    $('call-screen-share-help').hidden = terminal || !call.screenShareAvailable;
    $('call-screen-share-help').textContent = localized(
      'Sharing sends the selected screen, window, or tab directly to the other person. Notifications may be visible. Stop sharing here or in your browser controls.',
      'O compartilhamento envia a tela, janela ou aba selecionada diretamente para a outra pessoa. Notificações podem aparecer. Pare por aqui ou nos controles do navegador.'
    );
    $('call-audio-avatar').textContent = callPeerLabel(call.peer).slice(0, 1).toUpperCase() || 'P';
    $('call-mini-avatar').textContent = $('call-audio-avatar').textContent;
    const miniMicrophone = $('call-mini-microphone');
    miniMicrophone.hidden = terminal || call.status === 'incoming';
    miniMicrophone.disabled = call.deviceSettingsBusy || !call.localMediaReady || (!call.microphoneEnabled && !['requesting-media', 'connected', 'reconnecting'].includes(call.status));
    miniMicrophone.textContent = call.microphoneEnabled ? localized('Mute', 'Silenciar') : localized('Unmute', 'Ativar');
    miniMicrophone.setAttribute('aria-label', call.microphoneEnabled ? localized('Mute microphone', 'Silenciar microfone') : localized('Unmute microphone', 'Ativar microfone'));
    miniMicrophone.title = miniMicrophone.getAttribute('aria-label');
    const miniCamera = $('call-mini-camera');
    miniCamera.hidden = terminal || call.localMedia !== 'video';
    miniCamera.disabled = call.deviceSettingsBusy || !call.localMediaReady || (!call.cameraEnabled && !['requesting-media', 'connected', 'reconnecting'].includes(call.status));
    miniCamera.textContent = call.cameraEnabled ? localized('Camera off', 'Câmera off') : localized('Camera on', 'Câmera on');
    miniCamera.setAttribute('aria-label', call.cameraEnabled ? localized('Turn camera off', 'Desligar câmera') : localized('Turn camera on', 'Ligar câmera'));
    miniCamera.title = miniCamera.getAttribute('aria-label');
    const miniScreenShare = $('call-mini-screen-share');
    miniScreenShare.hidden = terminal || !call.screenShareAvailable;
    miniScreenShare.disabled = call.deviceSettingsBusy || call.screenShareBusy || (!call.screenSharing && call.status !== 'connected');
    miniScreenShare.textContent = call.screenSharing ? localized('Stop share', 'Parar') : localized('Share', 'Tela');
    miniScreenShare.setAttribute('aria-label', call.screenSharing ? localized('Stop sharing', 'Parar compartilhamento') : localized('Share screen', 'Compartilhar tela'));
    miniScreenShare.title = miniScreenShare.getAttribute('aria-label');
    $('call-mini-end').hidden = terminal || call.status === 'incoming';
    $('call-mini-end').textContent = localized('End', 'Encerrar');
    $('call-mini-end').setAttribute('aria-label', localized('End call', 'Encerrar chamada'));
    $('call-mini-end').title = $('call-mini-end').getAttribute('aria-label');
    $('call-mini-dismiss').hidden = !terminal;
    $('call-mini-dismiss').setAttribute('aria-label', localized('Dismiss call status', 'Dispensar status da chamada'));
    $('call-mini-dismiss').title = localized('Dismiss', 'Dispensar');

    if (call.status === 'incoming') {
      callWindow.hide();
      state.callUiHadSession = false;
      if (!$('incoming-call-dialog').open) $('incoming-call-dialog').showModal();
      return;
    }
    if ($('incoming-call-dialog').open) $('incoming-call-dialog').close();
    if (!terminal) {
      state.callUiHadSession = true;
      if (callWindow.isMinimized()) {
        if ($('call-session-dialog').open) $('call-session-dialog').close();
        callWindow.show();
      } else {
        callWindow.hide();
        if (!$('call-session-dialog').open) $('call-session-dialog').showModal();
      }
    } else if (callWindow.isMinimized()) {
      if ($('call-session-dialog').open) $('call-session-dialog').close();
      callWindow.show();
    } else if (state.callUiHadSession || (previous?.callId === call.callId && previous.status !== 'incoming')) {
      callWindow.hide();
      if (!$('call-session-dialog').open) $('call-session-dialog').showModal();
      state.callUiHadSession = true;
    } else {
      if ($('call-session-dialog').open) $('call-session-dialog').close();
      if (call.status !== 'declined') showToast(callStatusText(call));
    }
  }
  function ensureCallController() {
    if (!state.callController) {
      state.callController = Calls.create({
        mediaDevices: navigator.mediaDevices,
        remoteAudioElement: $('call-remote-audio'),
        getIceConfiguration: webRtcPeerConfiguration,
        onSignal: sendCallSignal,
        onState: updateCallState,
        onRemoteStream: stream => renderCallMedia(stream),
        onLocalStream: stream => renderCallMedia(stream, true)
      });
    }
    return state.callController;
  }
  async function sendCallSignal(signal) {
    const sender = state.pubkey;
    const secret = state.secret;
    const peer = String(signal.peer || '').toLowerCase();
    if (!sender || !secret || !/^[0-9a-f]{64}$/.test(peer) || peer === sender) {
      throw new Error(localized('A call needs an unlocked identity and a direct contact.', 'A chamada precisa de uma identidade desbloqueada e um contato direto.'));
    }
    const conversation = await get('conversations', peer);
    const access = await get('agentAccess', peer);
    if (state.pubkey !== sender || state.secret !== secret) {
      throw new Error(localized('The identity was locked before the call signal was sent.', 'A identidade foi bloqueada antes do envio do sinal da chamada.'));
    }
    if (!conversation || conversation.group || conversation.agent || access?.status === 'approved' || access?.status === 'blocked') {
      throw new Error(localized('Calls are available only with an unblocked person in a direct conversation.', 'Chamadas só estão disponíveis para uma pessoa desbloqueada em uma conversa direta.'));
    }
    const members = [sender.toLowerCase(), peer].sort();
    const details = signal.sdp ? {
      media: signal.media,
      sdp: signal.sdp,
      ...(signal.restartIce === true ? { restartIce: true } : {}),
      ...(Number.isSafeInteger(signal.restartId) ? { restartId: signal.restartId } : {})
    } : {};
    const deliveries = TypingSignals.createCallSignal(N, secret, members, peer, signal.callId, signal.action, nextTypingSequence(), details);
    const relays = await resolveTypingRelays(peer);
    if (!relays.length || state.pubkey !== sender || state.secret !== secret) {
      throw new Error(localized('No inbox relays for this contact could be reached. The call was not sent.', 'Não foi possível encontrar relays de recebimento para este contato. A chamada não foi enviada.'));
    }
    let openRelays = 0;
    for (const delivery of deliveries) openRelays += await publishEphemeralToRelays(delivery.event, relays).catch(() => 0);
    if (!openRelays) throw new Error(localized('No inbox relay connected for call setup. The call was not sent.', 'Nenhum relay de recebimento conectou para iniciar a chamada. A chamada não foi enviada.'));
    return openRelays;
  }
  async function openCallConsent(video) {
    const peer = state.activePeer;
    if (!peer || !state.secret || state.currentConversation?.group || state.activeConversationAgent || state.activeConversationBlocked) return;
    if (state.call && !callTerminal(state.call.status)) {
      showToast(localized('End the current call before starting another.', 'Encerre a chamada atual antes de iniciar outra.'));
      return;
    }
    state.pendingCallPeer = peer;
    state.pendingCallVideo = video === true;
    $('call-consent-title').textContent = video ? localized('Start a video call?', 'Iniciar chamada de vídeo?') : localized('Start an audio call?', 'Iniciar chamada de áudio?');
    $('call-consent-copy').textContent = video
      ? localized('Property will request camera and microphone access, then try a direct video call with the person in this conversation.', 'O Property solicitará acesso à câmera e ao microfone e tentará uma chamada de vídeo direta com a pessoa desta conversa.')
      : localized('Property will request microphone access, then try a direct audio call with the person in this conversation.', 'O Property solicitará acesso ao microfone e tentará uma chamada de áudio direta com a pessoa desta conversa.');
    $('call-consent-network-copy').textContent = webRtcDisclosureText();
    $('call-consent-error').textContent = '';
    $('call-consent-dialog').showModal();
  }
  async function beginOutgoingCall() {
    const peer = state.pendingCallPeer;
    const video = state.pendingCallVideo;
    const secret = state.secret;
    $('call-consent-error').textContent = '';
    try {
      const conversation = await get('conversations', peer);
      const access = await get('agentAccess', peer);
      if (!secret || state.secret !== secret || !conversation || conversation.group || conversation.agent ||
          access?.status === 'approved' || access?.status === 'blocked') {
        throw new Error(localized('This conversation cannot start calls.', 'Esta conversa não pode iniciar chamadas.'));
      }
      webRtcPeerConfiguration();
      state.pendingCallPeer = '';
      state.pendingCallVideo = false;
      $('call-consent-dialog').close();
      audioPlayback.pause();
      $('call-audio-avatar').textContent = callPeerLabel(peer).slice(0, 1).toUpperCase() || 'P';
      $('call-session-error').textContent = '';
      $('call-session-dialog').showModal();
      await ensureCallController().startOutgoing({ peer, callId: createCallId(), video });
    } catch (error) {
      $('call-consent-error').textContent = error.message || localized('Could not start this call.', 'Não foi possível iniciar a chamada.');
      if (peer) { state.pendingCallPeer = peer; state.pendingCallVideo = video; }
      if (!$('call-session-dialog').open && !$('call-consent-dialog').open) $('call-consent-dialog').showModal();
    }
  }
  async function declineIncomingCall() {
    const call = state.call;
    if (!call || call.status !== 'incoming') return;
    if ($('incoming-call-dialog').open) $('incoming-call-dialog').close();
    await ensureCallController().end('call-decline').catch(error => showToast(error.message || localized('Could not send the decline signal.', 'Não foi possível enviar o sinal de recusa.')));
  }
  async function answerIncomingCall(video) {
    const call = state.call;
    if (!call || call.status !== 'incoming') return;
    try { webRtcPeerConfiguration(); }
    catch (error) { showToast(error.message || localized('Could not use the saved WebRTC settings.', 'Não foi possível usar as configurações WebRTC salvas.')); return; }
    if ($('incoming-call-dialog').open) $('incoming-call-dialog').close();
    $('call-session-dialog').showModal();
    audioPlayback.pause();
    await ensureCallController().acceptIncoming(video).catch(() => false);
  }
  async function receiveCallSignal(signal, peer) {
    const controller = ensureCallController();
    const sequenceKey = peer + ':' + signal.callId + ':' + signal.sender;
    if (signal.sequence <= (state.callSignalSequences.get(sequenceKey) || 0)) return;
    state.callSignalSequences.set(sequenceKey, signal.sequence);
    if (state.callSignalSequences.size > 500) state.callSignalSequences.delete(state.callSignalSequences.keys().next().value);
    if (signal.action === 'call-offer') {
      if (state.call && !callTerminal(state.call.status)) {
        await sendCallSignal({ action: 'call-busy', callId: signal.callId, peer }).catch(() => {});
        return;
      }
      const accepted = controller.receiveOffer({ peer, callId: signal.callId, media: signal.media, sdp: signal.sdp, restartIce: signal.restartIce });
      if (!accepted) await sendCallSignal({ action: 'call-busy', callId: signal.callId, peer }).catch(() => {});
      return;
    }
    if (signal.action === 'call-answer') {
      await controller.receiveAnswer({ peer, callId: signal.callId, media: signal.media, sdp: signal.sdp, restartIce: signal.restartIce });
      return;
    }
    if (signal.action === 'call-restart-offer') {
      await controller.receiveRestartOffer({ peer, callId: signal.callId, media: signal.media, sdp: signal.sdp, restartId: signal.restartId });
      return;
    }
    if (signal.action === 'call-restart-answer') {
      await controller.receiveRestartAnswer({ peer, callId: signal.callId, media: signal.media, sdp: signal.sdp, restartId: signal.restartId });
      return;
    }
    controller.receiveEnd({ peer, callId: signal.callId, action: signal.action });
  }
  function directFileStatusText(transfer) {
    if (!transfer) return '';
    const progress = `${transfer.sentChunks || transfer.receivedChunks} / ${transfer.totalChunks}`;
    const messages = {
      preparing: localized('Preparing direct transfer…', 'Preparando a transferência direta…'),
      offered: localized('Waiting for the recipient to accept…', 'Aguardando a aceitação de quem vai receber…'),
      incoming: localized('Review the files before accepting.', 'Confira os arquivos antes de aceitar.'),
      connecting: localized('Connecting directly…', 'Conectando diretamente…'),
      connected: localized('Connected directly. Sending encrypted file blocks…', 'Conexão direta estabelecida. Enviando blocos criptografados…'),
      sending: localized(`Sending directly · ${progress} blocks`, `Enviando diretamente · ${progress} blocos`),
      receiving: localized(`Receiving directly · ${progress} blocks`, `Recebendo diretamente · ${progress} blocos`),
      reconnecting: localized('Direct connection interrupted; trying to reconnect…', 'Conexão direta interrompida; tentando reconectar…'),
      completed: localized('Direct file transfer completed.', 'Transferência direta concluída.'),
      declined: localized('The recipient declined the direct transfer. Your draft is still here.', 'Quem receber recusou a transferência direta. Seu rascunho continua aqui.'),
      cancelled: localized('Direct transfer cancelled. Your draft is still here.', 'Transferência direta cancelada. Seu rascunho continua aqui.'),
      failed: transfer.error || localized('Direct transfer failed. Your draft is still here; you can send it through relays.', 'A transferência direta falhou. Seu rascunho continua aqui; você pode enviá-lo pelos relays.')
    };
    return messages[transfer.status] || localized('Direct file transfer is in progress.', 'A transferência direta de arquivos está em andamento.');
  }
  function presentIncomingDirectFileOffer(offer) {
    if (!offer || !$('incoming-direct-file-dialog')) return;
    $('incoming-direct-file-name').textContent = callPeerLabel(offer.peer);
    const requestCopy = localized(
      `${callPeerLabel(offer.peer)} wants to send these files directly.`,
      `${callPeerLabel(offer.peer)} quer enviar estes arquivos diretamente.`
    );
    $('incoming-direct-file-copy').textContent = offer.caption
      ? `${requestCopy}\n\n${localized('Caption:', 'Legenda:')} ${offer.caption}` : requestCopy;
    $('incoming-direct-file-network-copy').textContent = webRtcDisclosureText();
    const list = $('incoming-direct-file-list');
    list.replaceChildren();
    $('incoming-direct-file-status').textContent = '';
    $('incoming-direct-file-status').hidden = true;
    $('incoming-direct-file-accept').hidden = false;
    $('incoming-direct-file-decline').hidden = false;
    $('incoming-direct-file-cancel').hidden = true;
    for (const file of offer.files) {
      const item = document.createElement('li');
      item.className = 'file-attachment-item';
      const details = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = file.name;
      const size = document.createElement('small'); size.textContent = `${FileTransfers.formatSize(file.sizeBytes, window.PropertyI18n?.language || 'en')} · ${file.mime}`;
      details.append(name, size); item.append(details); list.append(item);
    }
    if (!$('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').showModal();
  }
  function updateDirectFileTransferState(transfer) {
    state.directFileTransfer = transfer;
    if (!transfer) { renderFileDrafts(); return; }
    if (['declined', 'cancelled', 'failed'].includes(transfer.status)) {
      void directFileStore().discardSession(transfer.transferId).catch(() => {});
    }
    const text = directFileStatusText(transfer);
    if (transfer.direction === 'outgoing' && $('file-attachment-dialog').open) setFileAttachmentStatus(text);
    if (transfer.direction === 'incoming' && $('incoming-direct-file-dialog').open && ['preparing', 'connecting', 'receiving'].includes(transfer.status)) {
      $('incoming-direct-file-status').textContent = text;
      $('incoming-direct-file-status').hidden = false;
      $('incoming-direct-file-accept').hidden = true;
      $('incoming-direct-file-decline').hidden = true;
      $('incoming-direct-file-cancel').hidden = false;
    }
    if (transfer.direction === 'outgoing' && transfer.status === 'connected' && state.directFileSendJob && !state.directFileJobRunning) {
      void transferDirectFileJob(state.directFileSendJob);
    }
    if (transfer.status === 'completed' && transfer.direction === 'incoming') {
      state.pendingDirectFileOffer = null;
      clearTimeout(state.directFileOfferExpiryTimer);
      state.directFileOfferExpiryTimer = 0;
      if ($('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').close();
      showToast(localized('Direct file transfer completed.', 'Transferência direta concluída.'));
      setTimeout(() => { if (state.directFileController?.getState()?.status === 'completed') state.directFileController.dismiss(); }, 0);
    }
    if (transfer.direction === 'outgoing' && ['declined', 'cancelled', 'failed'].includes(transfer.status) &&
        state.directFileSendJob && !state.directFileJobRunning) {
      state.directFileSendJob = null;
      state.fileSendBusy = false;
      if ($('file-attachment-dialog').open) setFileAttachmentStatus(text);
      renderFileDrafts(); renderVoiceComposer();
      setTimeout(() => { if (state.directFileController?.getState()?.status === transfer.status) state.directFileController.dismiss(); }, 0);
      return;
    }
    if (['declined', 'cancelled', 'failed'].includes(transfer.status) && !state.directFileSendJob) {
      if (transfer.direction === 'incoming') {
        state.pendingDirectFileOffer = null;
        clearTimeout(state.directFileOfferExpiryTimer);
        state.directFileOfferExpiryTimer = 0;
      }
      if ($('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').close();
      showToast(text);
      setTimeout(() => { if (state.directFileController?.getState()?.status === transfer.status) state.directFileController.dismiss(); }, 0);
    }
    renderFileDrafts();
  }
  function ensureDirectFileController() {
    if (!state.directFileController) {
      state.directFileController = DirectTransfer.create({
        getIceConfiguration: webRtcPeerConfiguration,
        normalizeFileManifests: TypingSignals.normalizeFileManifests,
        onSignal: sendDirectFileSignal,
        onState: updateDirectFileTransferState,
        onPart: receiveDirectFilePart,
        onComplete: completeDirectFileReception
      });
    }
    return state.directFileController;
  }
  async function sendDirectFileSignal(signal) {
    const sender = state.pubkey;
    const secret = state.secret;
    const peer = String(signal.peer || '').toLowerCase();
    const transferId = String(signal.transferId || '').toLowerCase();
    if (!sender || !secret || !/^[0-9a-f]{64}$/.test(peer) || peer === sender || !/^[0-9a-f]{32}$/.test(transferId)) {
      throw new Error(localized('Direct file transfer needs an unlocked identity and a direct contact.', 'A transferência direta precisa de uma identidade desbloqueada e um contato direto.'));
    }
    const conversation = await get('conversations', peer);
    const access = await get('agentAccess', peer);
    if (state.pubkey !== sender || state.secret !== secret) throw new Error(localized('The identity was locked before the transfer signal was sent.', 'A identidade foi bloqueada antes do envio do sinal da transferência.'));
    if (!conversation || conversation.group || conversation.agent || access?.status === 'approved' || access?.status === 'blocked') {
      throw new Error(localized('Direct file transfer is available only with an unblocked person in a one-to-one chat.', 'A transferência direta só está disponível com uma pessoa desbloqueada em uma conversa individual.'));
    }
    const members = [sender.toLowerCase(), peer].sort();
    const details = signal.action === 'file-offer' ? { files: signal.files, caption: signal.caption || '', sdp: signal.sdp }
      : signal.action === 'file-answer' ? { sdp: signal.sdp } : {};
    const deliveries = TypingSignals.createFileSignal(N, secret, members, peer, transferId, signal.action, nextTypingSequence(), details);
    const relays = await resolveTypingRelays(peer);
    if (!relays.length || state.pubkey !== sender || state.secret !== secret) {
      throw new Error(localized('No inbox relays for this contact could be reached. The direct transfer signal was not sent.', 'Não foi possível encontrar relays de recebimento para este contato. O sinal da transferência direta não foi enviado.'));
    }
    let openRelays = 0;
    for (const delivery of deliveries) openRelays += await publishEphemeralToRelays(delivery.event, relays).catch(() => 0);
    if (!openRelays) throw new Error(localized('No inbox relay connected for direct file setup. The transfer was not sent.', 'Nenhum relay de recebimento conectou para preparar os arquivos. A transferência não foi enviada.'));
    return openRelays;
  }
  async function receiveDirectFileSignal(signal, peer) {
    const controller = ensureDirectFileController();
    const key = `${peer}:${signal.sender}:${signal.transferId}`;
    if (signal.sequence <= (state.directFileSignalSequences.get(key) || 0)) return;
    state.directFileSignalSequences.set(key, signal.sequence);
    if (state.directFileSignalSequences.size > 500) state.directFileSignalSequences.delete(state.directFileSignalSequences.keys().next().value);
    if (signal.action === 'file-offer') {
      const activeCall = state.call && !callTerminal(state.call.status);
      const activeTransfer = controller.getState() && !['completed', 'cancelled', 'declined', 'failed'].includes(controller.getState().status);
      if (activeCall || activeTransfer) {
        await sendDirectFileSignal({ action: 'file-reject', peer, transferId: signal.transferId }).catch(() => {});
        return;
      }
      state.pendingDirectFileOffer = { peer, transferId: signal.transferId, files: signal.files, caption: signal.caption || '', sdp: signal.sdp,
        sender: signal.sender, sequence: signal.sequence, expiresAt: Date.now() + signal.maxAgeSeconds * 1000 };
      if (!controller.receiveOffer({ peer, transferId: signal.transferId, files: signal.files, caption: signal.caption || '', sdp: signal.sdp })) {
        state.pendingDirectFileOffer = null;
        await sendDirectFileSignal({ action: 'file-reject', peer, transferId: signal.transferId }).catch(() => {});
        return;
      }
      presentIncomingDirectFileOffer(state.pendingDirectFileOffer);
      clearTimeout(state.directFileOfferExpiryTimer);
      state.directFileOfferExpiryTimer = setTimeout(() => {
        if (state.pendingDirectFileOffer?.transferId !== signal.transferId) return;
        void declineIncomingDirectFiles({ expired: true });
      }, signal.maxAgeSeconds * 1000);
      return;
    }
    if (signal.action === 'file-answer') {
      await controller.receiveAnswer({ peer, transferId: signal.transferId, sdp: signal.sdp });
      return;
    }
    const ended = controller.receiveEnd({ peer, transferId: signal.transferId, action: signal.action });
    if (!ended && signal.action === 'file-cancel' && state.pendingDirectFileOffer?.transferId === signal.transferId) {
      state.pendingDirectFileOffer = null;
      clearTimeout(state.directFileOfferExpiryTimer);
      if ($('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').close();
    }
  }
  async function receiveDirectFilePart({ peer, transferId, file, index, bytes, sha256 }) {
    const secret = state.secret;
    const pubkey = state.pubkey;
    if (!secret || !pubkey) return false;
    const conversation = await get('conversations', peer).catch(() => null);
    const access = await get('agentAccess', peer).catch(() => null);
    if (state.secret !== secret || state.pubkey !== pubkey || !conversation || conversation.group || conversation.agent ||
        access?.status === 'approved' || access?.status === 'blocked') return false;
    if (state.secret !== secret || state.pubkey !== pubkey) return false;
    return directFileStore().savePart({ file, index, bytes, sha256, sessionId: transferId, peer, direction: 'received' });
  }
  async function saveDirectFileMessages(peer, files, direction, caption, replyEventId = '') {
    const conversation = await get('conversations', peer) || { pubkey: peer, title: '' };
    const now = Date.now();
    for (const file of files) {
      const transfer = { version: 2, direct: true, storage: 'direct', transferId: file.transferId,
        name: file.name, mime: file.mime, sizeBytes: file.sizeBytes, sha256: file.sha256,
        totalChunks: file.totalChunks, receivedChunks: file.totalChunks, complete: true, conflict: false };
      const message = { id: `direct-file:${state.pubkey}:${file.transferId}`, peer, text: caption || '', fileTransfer: transfer,
        senderPubkey: direction === 'sent' ? state.pubkey : peer, createdAt: now, direction,
        status: direction === 'sent' ? 'sent' : 'delivered', directTransport: 'webrtc', localOnly: true,
        ...(direction === 'sent' && replyEventId ? { replyToId: replyEventId } : {}) };
      await put('messages', message);
      conversation.lastMessage = `📎 ${file.name}`;
      conversation.lastAt = now;
    }
    await put('conversations', conversation);
    if (state.activePeer === peer) await renderMessages(peer);
    await renderConversations();
  }
  async function completeDirectFileReception({ peer, files, caption }) {
    const secret = state.secret;
    const pubkey = state.pubkey;
    if (!secret || !pubkey) return false;
    const conversation = await get('conversations', peer).catch(() => null);
    const access = await get('agentAccess', peer).catch(() => null);
    if (state.secret !== secret || state.pubkey !== pubkey || !conversation || conversation.group || conversation.agent ||
        access?.status === 'approved' || access?.status === 'blocked') return false;
    if (!(await directFileStore().verifyFiles(files)) || state.secret !== secret || state.pubkey !== pubkey) return false;
    await saveDirectFileMessages(peer, files, 'received', caption);
    return state.secret === secret && state.pubkey === pubkey;
  }
  function requestDirectFileSend() {
    const peer = state.activePeer;
    const files = [...state.fileDraftFiles];
    if (!peer || !files.length || state.fileSendBusy || state.activeConversationAgent || state.activeConversationBlocked || state.currentConversation?.group) return;
    if (state.call && !callTerminal(state.call.status)) {
      showToast(localized('End the current call before starting a direct file transfer.', 'Encerre a chamada antes de iniciar uma transferência direta de arquivos.'));
      return;
    }
    try { webRtcPeerConfiguration(); }
    catch (error) { showToast(error.message || localized('Could not use the saved WebRTC settings.', 'Não foi possível usar as configurações WebRTC salvas.')); return; }
    state.pendingDirectFileRequest = { peer, pubkey: state.pubkey, secret: state.secret, files, caption: $('file-attachment-caption').value.trim() };
    $('file-direct-network-copy').textContent = webRtcDisclosureText();
    $('file-direct-consent-dialog').showModal();
  }
  async function beginDirectFileSend() {
    const request = state.pendingDirectFileRequest;
    state.pendingDirectFileRequest = null;
    if ($('file-direct-consent-dialog').open) $('file-direct-consent-dialog').close();
    if (!request || !request.secret || request.secret !== state.secret || request.pubkey !== state.pubkey ||
        request.peer !== state.activePeer || request.files.some((file, index) => state.fileDraftFiles[index] !== file)) {
      showToast(localized('The conversation or selected files changed. Review the draft and try again.', 'A conversa ou os arquivos mudaram. Confira o rascunho e tente novamente.'));
      return;
    }
    try { webRtcPeerConfiguration(); }
    catch (error) { showToast(error.message || localized('Could not use the saved WebRTC settings.', 'Não foi possível usar as configurações WebRTC salvas.')); return; }
    state.fileSendBusy = true;
    renderFileDrafts(); renderVoiceComposer();
    const transfers = [];
    try {
      setFileAttachmentStatus(localized('Preparing encrypted files for a direct connection…', 'Preparando os arquivos criptografados para a conexão direta…'));
      for (const file of request.files) {
        let retry = state.fileDraftTransferIds.get(file);
        if (!retry || retry.caption !== request.caption) {
          retry = { caption: request.caption, transferId: FileTransfers.randomTransferId() };
          state.fileDraftTransferIds.set(file, retry);
        }
        const manifest = await DirectFileChunks.createManifest(file, { transferId: retry.transferId });
        if (!TypingSignals.normalizeFileManifests([manifest])) throw new Error(localized('This file cannot be prepared for direct transfer.', 'Este arquivo não pode ser preparado para transferência direta.'));
        transfers.push({ file, manifest });
      }
      const files = transfers.map(transfer => transfer.manifest);
      const transferId = FileTransfers.randomTransferId();
      const replyEventId = state.replyingTo ? nostrEventId(state.replyingTo) : '';
      const job = { peer: request.peer, pubkey: request.pubkey, secret: request.secret, transfers, transferId, replyEventId, caption: request.caption };
      state.directFileSendJob = job;
      setFileAttachmentStatus(localized('Sending an encrypted request to the recipient…', 'Enviando um pedido criptografado para quem vai receber…'));
      const started = await ensureDirectFileController().startOutgoing({ peer: request.peer, transferId, files, caption: request.caption });
      if (!started) throw new Error(state.directFileTransfer?.error || localized('Could not start a direct file connection.', 'Não foi possível iniciar a conexão direta para os arquivos.'));
      setFileAttachmentStatus(directFileStatusText(state.directFileTransfer));
    } catch (error) {
      state.directFileSendJob = null;
      state.fileSendBusy = false;
      setFileAttachmentStatus(error.message || localized('Could not prepare the direct file transfer.', 'Não foi possível preparar a transferência direta.'));
      showToast(error.message || localized('Could not prepare the direct file transfer.', 'Não foi possível preparar a transferência direta.'));
      renderFileDrafts(); renderVoiceComposer();
      const current = state.directFileController?.getState();
      if (current && ['failed', 'declined', 'cancelled'].includes(current.status)) state.directFileController.dismiss();
    }
  }
  async function transferDirectFileJob(job) {
    if (state.directFileJobRunning || state.directFileSendJob !== job) return;
    state.directFileJobRunning = true;
    const controller = ensureDirectFileController();
    let sentParts = 0;
    const totalParts = job.transfers.reduce((sum, transfer) => sum + transfer.manifest.totalChunks, 0);
    let failure = null;
    sendingDirectFiles: for (let fileIndex = 0; fileIndex < job.transfers.length; fileIndex += 1) {
      const transfer = job.transfers[fileIndex];
      for (let index = 0; index < transfer.manifest.totalChunks; index += 1) {
        if (state.directFileSendJob !== job || state.secret !== job.secret || state.pubkey !== job.pubkey) break sendingDirectFiles;
        try {
          const part = await DirectFileChunks.readChunk(transfer.file, transfer.manifest, index);
          if (!part || !(await directFileStore().savePart({ file: transfer.manifest, index, bytes: part.bytes,
            sha256: part.sha256, sessionId: job.transferId, peer: job.peer, direction: 'sent' }))) {
            throw new Error(localized('A file block could not be saved and verified on this device.', 'Um bloco do arquivo não pôde ser salvo e verificado neste aparelho.'));
          }
          if (!(await controller.sendPart({ fileIndex, index, bytes: part.bytes, sha256: part.sha256 }))) {
            failure = new Error(localized('The recipient did not confirm a direct file block.', 'Quem recebe não confirmou um bloco do arquivo enviado diretamente.'));
            break sendingDirectFiles;
          }
          sentParts += 1;
          if (sentParts % DirectFileChunks.ACK_WINDOW === 0 || sentParts === totalParts) {
            setFileAttachmentStatus(localized(`Sending directly · file ${fileIndex + 1} of ${job.transfers.length} · ${sentParts} of ${totalParts} blocks`, `Enviando diretamente · arquivo ${fileIndex + 1} de ${job.transfers.length} · ${sentParts} de ${totalParts} blocos`));
          }
        } catch (error) { failure = error; break sendingDirectFiles; }
      }
    }
    try {
      if (!failure && sentParts === totalParts && state.directFileSendJob === job) {
        if (!(await controller.finish())) failure = new Error(localized('The recipient did not confirm the completed direct transfer.', 'Quem recebe não confirmou a conclusão da transferência direta.'));
      }
      if (!failure && sentParts === totalParts && state.directFileSendJob === job) {
        const sharedFilesIncluded = state.shareFileDraftFiles.length > 0 && state.shareFileDraftFiles.every(file => state.fileDraftFiles.includes(file));
        const sentShareId = state.shareFileDraftPeer === job.peer && sharedFilesIncluded ? state.shareFileDraftId : '';
        await saveDirectFileMessages(job.peer, job.transfers.map(transfer => transfer.manifest), 'sent', job.caption, job.replyEventId);
        if (state.activePeer === job.peer) await renderMessages(job.peer);
        await renderConversations();
        clearFileDrafts();
        if (sentShareId) {
          try {
            await ShareInbox.remove(sentShareId);
            await renderShareInbox();
          } catch {
            showToast(localized('Files were sent, but the shared item remains in the local inbox.', 'Os arquivos foram enviados, mas o item compartilhado continua na caixa local.'));
          }
        }
        if ($('file-attachment-dialog').open) $('file-attachment-dialog').close();
        showToast(localized('Direct file transfer completed and confirmed by the recipient.', 'Transferência direta concluída e confirmada por quem recebeu.'));
      } else if (failure) {
        await controller.end('file-cancel').catch(() => {});
        setFileAttachmentStatus(failure.message || localized('Direct transfer stopped. The draft stays available for relay delivery.', 'A transferência direta parou. O rascunho continua disponível para envio pelos relays.'));
        showToast(localized('Direct transfer stopped. Keep the draft and retry or use relay delivery.', 'A transferência direta parou. Mantenha o rascunho e tente novamente ou use o envio por relays.'));
      }
    } finally {
      state.directFileJobRunning = false;
      if (state.directFileSendJob === job) state.directFileSendJob = null;
      state.fileSendBusy = false;
      renderFileDrafts(); renderVoiceComposer();
      const current = controller.getState();
      if (current && ['completed', 'cancelled', 'declined', 'failed'].includes(current.status)) controller.dismiss();
    }
  }
  async function acceptIncomingDirectFiles() {
    const offer = state.pendingDirectFileOffer;
    if (!offer || offer.expiresAt < Date.now()) { await declineIncomingDirectFiles({ expired: true }); return; }
    try { webRtcPeerConfiguration(); }
    catch (error) {
      $('incoming-direct-file-status').hidden = false;
      $('incoming-direct-file-status').textContent = error.message || localized('Could not use the saved WebRTC settings.', 'Não foi possível usar as configurações WebRTC salvas.');
      return;
    }
    clearTimeout(state.directFileOfferExpiryTimer);
    state.pendingDirectFileOffer = null;
    const accepted = await ensureDirectFileController().acceptIncoming();
    if (!accepted) showToast(directFileStatusText(state.directFileTransfer));
  }
  async function declineIncomingDirectFiles({ expired = false } = {}) {
    const offer = state.pendingDirectFileOffer;
    state.pendingDirectFileOffer = null;
    clearTimeout(state.directFileOfferExpiryTimer);
    state.directFileOfferExpiryTimer = 0;
    if ($('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').close();
    const controller = ensureDirectFileController();
    if (offer && controller.getState()?.transferId === offer.transferId) {
      await controller.end('file-reject').catch(() => {});
    }
    if (expired) showToast(localized('The direct file request expired.', 'O pedido de transferência direta expirou.'));
  }
  async function cancelIncomingDirectFiles() {
    state.pendingDirectFileOffer = null;
    clearTimeout(state.directFileOfferExpiryTimer);
    state.directFileOfferExpiryTimer = 0;
    const controller = state.directFileController;
    if (controller?.getState()?.direction === 'incoming') {
      await controller.end('file-cancel').catch(error => showToast(error.message || localized('Could not cancel the direct transfer.', 'Não foi possível cancelar a transferência direta.')));
    } else if ($('incoming-direct-file-dialog').open) $('incoming-direct-file-dialog').close();
  }
  async function cancelDirectFileSend() {
    const controller = state.directFileController;
    if (!controller?.getState()) return;
    await controller.end('file-cancel').catch(error => showToast(error.message || localized('Could not cancel the direct transfer.', 'Não foi possível cancelar a transferência direta.')));
  }
  async function sendTypingSignal(session, action) {
    const senderPubkey = state.pubkey;
    const secret = state.secret;
    if (!senderPubkey || !secret || session.senderPubkey !== senderPubkey ||
        (['typing', 'recording'].includes(action) && !state.typingIndicatorsEnabled)) return;
    let deliveries;
    try { deliveries = TypingSignals.create(N, secret, session.participants, action, nextTypingSequence()); }
    catch { return; }
    await Promise.all(deliveries.map(async ({ recipient, event }) => {
      const relays = await resolveTypingRelays(recipient);
      if (!relays.length || state.pubkey !== senderPubkey || state.secret !== secret) return;
      await publishEphemeralToRelays(event, relays).catch(() => {});
    }));
  }
  function scheduleVoiceActivityHeartbeat(session, delay = 3000) {
    clearTimeout(session.heartbeatTimer);
    session.heartbeatTimer = setTimeout(() => {
      session.heartbeatTimer = 0;
      if (state.voiceActivitySession !== session) return;
      if (!state.voiceRecorder || state.voiceRecorderPeer !== session.peer || state.voiceRecorder.isPaused()) {
        stopLocalRecordingSignal(session);
        return;
      }
      void sendTypingSignal(session, 'recording');
      scheduleVoiceActivityHeartbeat(session);
    }, delay);
  }
  function startLocalRecordingSignal(peer) {
    stopLocalTyping();
    stopLocalRecordingSignal();
    if (!state.typingIndicatorsEnabled || !state.secret || !peer || peer !== state.activePeer ||
        state.activeConversationAgent || state.activeConversationBlocked) return;
    const participants = typingParticipants(peer);
    if (!participants.length) return;
    const session = { peer, participants, senderPubkey: state.pubkey, sent: true, heartbeatTimer: 0 };
    state.voiceActivitySession = session;
    void sendTypingSignal(session, 'recording');
    scheduleVoiceActivityHeartbeat(session);
  }
  function stopLocalRecordingSignal(expected = state.voiceActivitySession) {
    if (!expected || state.voiceActivitySession !== expected) return;
    clearTimeout(expected.heartbeatTimer);
    expected.heartbeatTimer = 0;
    state.voiceActivitySession = null;
    if (expected.sent) void sendTypingSignal(expected, 'stop');
  }
  function canShareActiveStatus(peer) {
    return Boolean(state.activeStatusEnabled && state.secret && state.pubkey && peer && peer === state.activePeer &&
      hasVisibleConversation(peer) && state.currentConversation?.group !== true && !state.activeConversationAgent && !state.activeConversationBlocked);
  }
  async function sendPresenceSignal(session, active) {
    const senderPubkey = state.pubkey;
    const secret = state.secret;
    if (!senderPubkey || !secret || session.senderPubkey !== senderPubkey ||
        (active && (!canShareActiveStatus(session.peer) || state.localPresenceSession !== session))) return;
    let deliveries;
    try { deliveries = TypingSignals.createPresence(N, secret, session.participants, active, nextTypingSequence()); }
    catch { return; }
    await Promise.all(deliveries.map(async ({ recipient, event }) => {
      const relays = await resolveTypingRelays(recipient);
      if (!relays.length || state.pubkey !== senderPubkey || state.secret !== secret ||
          (active && (!canShareActiveStatus(session.peer) || state.localPresenceSession !== session))) return;
      await publishEphemeralToRelays(event, relays).catch(() => {});
    }));
  }
  function schedulePresenceHeartbeat(session, delay = 30_000) {
    clearTimeout(session.heartbeatTimer);
    session.heartbeatTimer = setTimeout(() => {
      session.heartbeatTimer = 0;
      if (state.localPresenceSession !== session) return;
      if (!canShareActiveStatus(session.peer)) { stopLocalPresence(session); return; }
      void sendPresenceSignal(session, true);
      schedulePresenceHeartbeat(session);
    }, delay);
  }
  function startLocalPresence() {
    const peer = state.activePeer;
    if (!canShareActiveStatus(peer)) { stopLocalPresence(); return; }
    if (state.localPresenceSession?.peer === peer) return;
    stopLocalPresence();
    const participants = typingParticipants(peer);
    if (participants.length !== 2) return;
    const session = { peer, participants, senderPubkey: state.pubkey, heartbeatTimer: 0, sent: true };
    state.localPresenceSession = session;
    void sendPresenceSignal(session, true);
    schedulePresenceHeartbeat(session);
  }
  function stopLocalPresence(expected = state.localPresenceSession) {
    if (!expected || state.localPresenceSession !== expected) return;
    clearTimeout(expected.heartbeatTimer);
    expected.heartbeatTimer = 0;
    state.localPresenceSession = null;
    if (expected.sent) void sendPresenceSignal(expected, false);
  }
  async function sendReadReceiptForMessage(peer, message, messageId) {
    if (!state.readReceiptsEnabled || !state.secret || !state.pubkey || !hasVisibleConversation(peer) ||
        message?.direction === 'sent' || message?.fromAgent || message?.agentMessageId ||
        !/^[0-9a-f]{64}$/i.test(messageId || '')) return;
    const recipient = String(message.senderPubkey || peer).toLowerCase();
    const participants = typingParticipants(peer);
    if (recipient === state.pubkey || !participants.includes(recipient)) return;
    const recordKey = `${state.pubkey}:${messageId.toLowerCase()}`;
    if (state.readReceiptSent.has(recordKey)) return;
    state.readReceiptSent.add(recordKey);
    const secret = state.secret;
    try {
      const deliveries = TypingSignals.createReadReceipt(N, secret, participants, recipient, messageId, nextTypingSequence(), state.currentConversation?.group === true);
      let openRelayCount = 0;
      await Promise.all(deliveries.map(async ({ recipient: target, event }) => {
        const relays = await resolveTypingRelays(target);
        if (!relays.length || state.pubkey !== N.getPublicKey(secret) || state.secret !== secret || !state.readReceiptsEnabled) return;
        openRelayCount += await publishEphemeralToRelays(event, relays).catch(() => 0);
      }));
      if (!openRelayCount) state.readReceiptSent.delete(recordKey);
    } catch {
      state.readReceiptSent.delete(recordKey);
    }
  }
  function observeReadReceiptRows(container = $('messages')) {
    state.readReceiptObserver?.disconnect();
    state.readReceiptObserver = null;
    if (!state.readReceiptsEnabled || typeof IntersectionObserver !== 'function' || !container) return;
    state.readReceiptObserver = new IntersectionObserver(entries => {
      if (!hasVisibleConversation(state.activePeer)) return;
      for (const entry of entries) {
        const messageId = entry.target.dataset.readReceiptId;
        const visibleEnough = entry.intersectionRect.height >= Math.max(8, Math.min(32, entry.boundingClientRect.height * 0.25));
        if (!entry.isIntersecting || !visibleEnough || !messageId) continue;
        const candidate = state.readReceiptCandidates.get(messageId);
        if (candidate) void sendReadReceiptForMessage(candidate.peer, candidate.message, messageId);
      }
    }, { root: container, threshold: 0 });
    for (const row of container.querySelectorAll('.message-row[data-read-receipt-id]')) state.readReceiptObserver.observe(row);
  }
  function sendReadReceiptsForVisibleRows() {
    if (!state.readReceiptsEnabled || !hasVisibleConversation(state.activePeer)) return;
    const container = $('messages');
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    for (const row of container.querySelectorAll('.message-row[data-read-receipt-id]')) {
      const rect = row.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
      const visibleEnough = visibleHeight >= Math.max(8, Math.min(32, rect.height * 0.25));
      const candidate = state.readReceiptCandidates.get(row.dataset.readReceiptId);
      if (visibleEnough && candidate) void sendReadReceiptForMessage(candidate.peer, candidate.message, row.dataset.readReceiptId);
    }
  }
  async function recordReadReceipt(signal, peer) {
    if (!state.pubkey || !/^[0-9a-f]{64}$/i.test(signal.messageId || '') || signal.sender === state.pubkey) return;
    const entries = await all('messages');
    const message = entries.find(item => item.peer === peer && item.direction === 'sent' && nostrEventId(item)?.toLowerCase() === signal.messageId.toLowerCase());
    if (!message || message.fromAgent || message.agentMessageId) return;
    const readers = state.readReceipts.get(signal.messageId) || new Set();
    if (readers.has(signal.sender)) return;
    readers.add(signal.sender);
    state.readReceipts.set(signal.messageId, readers);
    await put('settings', {
      id: readReceiptRecordId(state.pubkey, signal.messageId),
      messageId: signal.messageId,
      readers: [...readers],
      updatedAt: Date.now()
    }).catch(() => {});
    const prefix = readReceiptRecordPrefix(state.pubkey);
    const saved = (await all('settings')).filter(item => typeof item.id === 'string' && item.id.startsWith(prefix))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    for (const stale of saved.slice(500)) { await del('settings', stale.id).catch(() => {}); if (typeof stale.messageId === 'string') state.readReceipts.delete(stale.messageId.toLowerCase()); }
    if (state.activePeer === peer) await renderMessages(peer).catch(() => {});
  }
  function scheduleTypingHeartbeat(session, delay = 3000) {
    clearTimeout(session.heartbeatTimer);
    session.heartbeatTimer = setTimeout(() => {
      session.heartbeatTimer = 0;
      if (state.typingSession !== session) return;
      if (Date.now() - session.lastInputAt >= 5000 || !$('message-input').value.trim()) {
        stopLocalTyping(session);
        return;
      }
      session.sent = true;
      void sendTypingSignal(session, 'typing');
      scheduleTypingHeartbeat(session);
    }, delay);
  }
  function noteLocalTyping() {
    const input = $('message-input');
    const peer = state.activePeer;
    if (!state.typingIndicatorsEnabled || !state.secret || !peer || !input.value.trim()) {
      stopLocalTyping();
      return;
    }
    let session = state.typingSession;
    if (session && session.peer !== peer) { stopLocalTyping(session); session = null; }
    if (!session) {
      const participants = typingParticipants(peer);
      if (!participants.length) return;
      session = { peer, participants, senderPubkey: state.pubkey, sent: false, initialTimer: 0, heartbeatTimer: 0, idleTimer: 0, lastInputAt: Date.now() };
      state.typingSession = session;
      session.initialTimer = setTimeout(() => {
        session.initialTimer = 0;
        if (state.typingSession !== session || !$('message-input').value.trim()) return;
        session.sent = true;
        void sendTypingSignal(session, 'typing');
        scheduleTypingHeartbeat(session);
      }, 350);
    }
    session.lastInputAt = Date.now();
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => stopLocalTyping(session), 5000);
  }
  function stopLocalTyping(expected = state.typingSession) {
    if (!expected || state.typingSession !== expected) return;
    clearTimeout(expected.initialTimer);
    clearTimeout(expected.heartbeatTimer);
    clearTimeout(expected.idleTimer);
    state.typingSession = null;
    if (expected.sent) void sendTypingSignal(expected, 'stop');
  }
  async function receiveTypingSignal(event) {
    const identitySecret = state.secret;
    const identityPubkey = state.pubkey;
    if (!identitySecret || !identityPubkey || state.typingSeenEvents.has(event.id)) return;
    const signal = TypingSignals.unwrap(N, event, identitySecret);
    if (!signal || signal.sender === identityPubkey) return;
    state.typingSeenEvents.add(event.id);
    if (state.typingSeenEvents.size > 500) state.typingSeenEvents.delete(state.typingSeenEvents.values().next().value);
    const group = signal.action === 'read' ? signal.group : signal.participants.length > 2;
    const peer = group ? groupConversationId(signal.participants) : signal.participants.find(member => member !== identityPubkey);
    const callSignal = signal.action.startsWith('call-');
    const fileSignal = signal.action.startsWith('file-');
    const activitySignal = ['typing', 'recording', 'thinking', 'stop'].includes(signal.action);
    if (!peer || (!callSignal && !fileSignal && signal.action !== 'read' && !activitySignal && peer !== state.activePeer)) return;
    const conversation = await get('conversations', peer).catch(() => null);
    if (state.secret !== identitySecret || state.pubkey !== identityPubkey) return;
    if (!conversation || (conversation.group === true) !== group) return;
    if (group) {
      const knownMembers = [...new Set((conversation.members || []).map(key => String(key).toLowerCase()))].sort();
      if (knownMembers.length !== signal.participants.length || knownMembers.some((key, index) => key !== signal.participants[index])) return;
    } else if (conversation.pubkey !== signal.sender) return;
    if (signal.action === 'recording' && !group) {
      const access = await get('agentAccess', peer).catch(() => null);
      if (state.secret !== identitySecret || state.pubkey !== identityPubkey || conversation.agent === true ||
          access?.status === 'approved' || access?.status === 'blocked') return;
    }
    if (callSignal) {
      const access = await get('agentAccess', peer).catch(() => null);
      if (state.secret !== identitySecret || state.pubkey !== identityPubkey || group || conversation.agent === true || access?.status === 'approved' || access?.status === 'blocked') return;
      await receiveCallSignal(signal, peer);
      return;
    }
    if (fileSignal) {
      const access = await get('agentAccess', peer).catch(() => null);
      if (state.secret !== identitySecret || state.pubkey !== identityPubkey || group || conversation.agent === true ||
          access?.status === 'approved' || access?.status === 'blocked') return;
      await receiveDirectFileSignal(signal, peer);
      return;
    }
    if (signal.action === 'read') {
      await recordReadReceipt(signal, peer);
      return;
    }
    if (signal.action === 'presence') {
      if (group) return;
      const key = `${peer}:${signal.sender}`;
      if (signal.sequence <= (state.presenceSequences.get(key) || 0)) return;
      state.presenceSequences.set(key, signal.sequence);
      if (state.presenceSequences.size > 500) state.presenceSequences.delete(state.presenceSequences.keys().next().value);
      clearTimeout(state.presenceTimers.get(key));
      state.presenceTimers.delete(key);
      state.remotePresence.delete(key);
      if (signal.active) {
        state.remotePresence.set(key, { peer, sender: signal.sender, sequence: signal.sequence });
        state.presenceTimers.set(key, setTimeout(() => {
          if (state.remotePresence.get(key)?.sequence === signal.sequence) {
            state.remotePresence.delete(key);
            state.presenceTimers.delete(key);
            renderRemoteTyping();
          }
        }, signal.maxAgeSeconds * 1000));
      }
      renderRemoteTyping();
      return;
    }
    const key = `${peer}:${signal.sender}`;
    if (signal.sequence <= (state.typingSequences.get(key) || 0)) return;
    state.typingSequences.set(key, signal.sequence);
    while (state.typingSequences.size > 500) state.typingSequences.delete(state.typingSequences.keys().next().value);
    clearTimeout(state.typingTimers.get(key));
    state.typingTimers.delete(key);
    state.remoteTyping.delete(key);
    if (signal.action === 'typing' || signal.action === 'recording' || signal.action === 'thinking') {
      state.remoteTyping.set(key, { peer, sender: signal.sender, sequence: signal.sequence, action: signal.action });
      while (state.remoteTyping.size > 500) {
        const oldestKey = state.remoteTyping.keys().next().value;
        clearTimeout(state.typingTimers.get(oldestKey));
        state.typingTimers.delete(oldestKey);
        state.remoteTyping.delete(oldestKey);
      }
      state.typingTimers.set(key, setTimeout(() => {
        if (state.remoteTyping.get(key)?.sequence === signal.sequence) clearRemoteTypingKey(key);
      }, signal.maxAgeSeconds * 1000));
    }
    renderRemoteTyping();
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
  function nip05ErrorMessage(error) {
    if (error?.code === 'nip05-invalid-identifier') return localized('Enter a valid name@domain identifier.', 'Informe um identificador name@domínio válido.');
    if (error?.code === 'nip05-not-found') return localized('That domain did not publish a public key for this name.', 'Esse domínio não publicou uma chave pública para este nome.');
    if (error?.code === 'nip05-http-error') return localized('The domain returned an unusable response. Redirects are not accepted.', 'O domínio retornou uma resposta inválida. Redirecionamentos não são aceitos.');
    if (error?.code === 'nip05-response-too-large') return localized('The domain response exceeded the size limit.', 'A resposta do domínio excedeu o limite de tamanho.');
    if (error?.code === 'nip05-invalid-response') return localized('The domain did not return a valid NIP-05 response.', 'O domínio não retornou uma resposta NIP-05 válida.');
    if (error?.code === 'nip05-network-error') return localized('Could not check the domain. The browser may block the request, for example because of CORS.', 'Não foi possível consultar o domínio. O navegador pode bloquear a solicitação, por exemplo por CORS.');
    return localized('The NIP-05 check is unavailable.', 'A consulta NIP-05 está indisponível.');
  }
  function updatePeerNip05LookupButton() {
    const value = $('peer-input').value.trim();
    $('resolve-peer-nip05').disabled = !value.includes('@') || value.length > 160;
  }
  async function resolvePeerNip05() {
    const identifier = $('peer-input').value.trim();
    if (!identifier.includes('@') || identifier.length > 160) return;
    const lookupId = ++peerNip05LookupId;
    const button = $('resolve-peer-nip05');
    const status = $('peer-nip05-status');
    const isCurrent = () => lookupId === peerNip05LookupId && $('new-chat-dialog').open;
    button.disabled = true;
    status.textContent = localized('Looking up the public key. This request reveals your IP address to the domain…', 'Consultando a chave pública. Esta solicitação revela seu endereço IP ao domínio…');
    try {
      const result = await Nip05.resolve(identifier);
      if (!isCurrent()) return;
      $('peer-input').value = N.nip19.npubEncode(result.pubkey);
      $('new-chat-error').textContent = '';
      status.textContent = localized(
        `Resolved ${result.identifier}. The domain mapping does not verify a real-world identity. Review the public npub, then open the conversation.`,
        `Identificador ${result.identifier} resolvido. O vínculo do domínio não verifica uma identidade no mundo real. Confira o npub público antes de abrir a conversa.`
      );
    } catch (error) {
      if (isCurrent()) status.textContent = nip05ErrorMessage(error);
    } finally {
      if (isCurrent()) updatePeerNip05LookupButton();
    }
  }
  async function performNip05Check(identifier, pubkey, status, button, isCurrent, onResult = null) {
    button.disabled = true;
    status.textContent = localized('Checking the domain mapping…', 'Consultando o vínculo do domínio…');
    try {
      const result = await Nip05.check(identifier, pubkey);
      if (!isCurrent()) return;
      status.textContent = result.matches
        ? localized('The domain mapping matches this Nostr key. This does not verify a real-world identity.', 'O domínio aponta para esta chave Nostr. Isso não verifica uma identidade no mundo real.')
        : localized('The domain mapping does not match this Nostr key.', 'O domínio não aponta para esta chave Nostr.');
      onResult?.(result);
      return result;
    } catch (error) {
      if (isCurrent()) status.textContent = nip05ErrorMessage(error);
    } finally {
      if (isCurrent()) button.disabled = false;
    }
  }
  function resetOwnNip05Check() {
    ownNip05CheckId += 1;
    $('profile-nip05-status').textContent = '';
    $('verify-profile-nip05').disabled = !$('profile-nip05').value.trim();
  }
  function resetPeerNip05Check(profile) {
    peerNip05CheckId += 1;
    $('chat-profile-nip05-status').textContent = '';
    const button = $('verify-chat-nip05');
    button.hidden = !profile?.nip05;
    button.disabled = !profile?.nip05;
  }
  function verifyOwnNip05() {
    const identifier = $('profile-nip05').value.trim();
    const pubkey = state.pubkey;
    if (!identifier || !pubkey) return;
    const checkId = ++ownNip05CheckId;
    return performNip05Check(identifier, pubkey, $('profile-nip05-status'), $('verify-profile-nip05'), () =>
      checkId === ownNip05CheckId && state.pubkey === pubkey && $('profile-nip05').value.trim() === identifier
    );
  }
  function verifyPeerNip05() {
    const peer = state.chatDetailsPeer;
    const profile = state.peerProfiles.get(peer);
    const identifier = profile?.nip05 || '';
    if (!peer || !identifier || !$('chat-details-dialog').open) return;
    const checkId = ++peerNip05CheckId;
    const checkKey = window.PropertyIdentityMarks?.nip05CheckKey(peer, profile) || '';
    const isCurrent = () => checkId === peerNip05CheckId && $('chat-details-dialog').open && state.chatDetailsPeer === peer &&
      state.peerProfiles.get(peer)?.eventId === profile.eventId && state.peerProfiles.get(peer)?.nip05 === identifier;
    return performNip05Check(identifier, peer, $('chat-profile-nip05-status'), $('verify-chat-nip05'), () =>
      isCurrent(), result => {
        if (!checkKey) return;
        if (result.matches) {
          state.peerNip05Checks.set(checkKey, { status: 'verified', matches: true });
          while (state.peerNip05Checks.size > 64) state.peerNip05Checks.delete(state.peerNip05Checks.keys().next().value);
        } else state.peerNip05Checks.delete(checkKey);
        void renderConversations().catch(() => {});
      }
    );
  }
  function renderPeerPublicProfile(profile) {
    const status = $('chat-profile-status');
    const fields = $('chat-public-profile-fields');
    if (!profile) {
      fields.hidden = true;
      status.textContent = localized('No public profile has been loaded on this device yet.', 'Nenhum perfil público foi carregado neste aparelho ainda.');
      resetPeerNip05Check(null);
      return;
    }
    const fetched = profile.checkedAt ? new Date(profile.checkedAt).toLocaleString(window.PropertyI18n?.locale() || undefined) : '';
    status.textContent = fetched
      ? localized(`Saved on this device · checked ${fetched}`, `Salvo neste aparelho · consultado em ${fetched}`)
      : localized('Saved on this device', 'Salvo neste aparelho');
    setOptionalProfileField($('chat-profile-name-field'), localized('Name', 'Nome'), profile.displayName || profile.name);
    setOptionalProfileField($('chat-profile-about-field'), localized('About', 'Sobre'), profile.about);
    setOptionalProfileField($('chat-profile-nip05-field'), localized('NIP-05 · not checked', 'NIP-05 · não consultado'), profile.nip05);
    setOptionalProfileField($('chat-profile-website-field'), localized('Website', 'Site'), profile.website, { href: PublicProfile.safeWebsite(profile.website) });
    fields.hidden = ![profile.displayName, profile.name, profile.about, profile.nip05, profile.website].some(Boolean);
    resetPeerNip05Check(profile);
  }
  function renderPeerProfileLookupStatus(peer) {
    const lookup = state.peerProfileLookupStatuses.get(peer);
    if (lookup === 'missing-with-identity') $('chat-profile-status').textContent = localized('No signed kind 0 profile was found; linked identity claims were loaded.', 'Nenhum perfil assinado kind 0 foi encontrado; as declarações de identidade vinculadas foram carregadas.');
    else if (lookup === 'missing') $('chat-profile-status').textContent = localized('No valid public profile or linked identity was found on these relays.', 'Nenhum perfil público ou identidade vinculada válida foi encontrada nestes relays.');
    else if (lookup === 'saved-profile-stale') $('chat-profile-status').textContent = localized('No newer valid profile was found. The saved profile is still shown.', 'Nenhum perfil válido mais recente foi encontrado. O perfil salvo continua exibido.');
  }
  function identityProofSettingId(pubkey) { return `public-identity-proofs-${pubkey}`; }
  function identityProofCheckKey(peer, record, claim) { return `${peer}:${record.eventId}:${claim.platform}:${claim.identity}:${claim.proof}`; }
  function identityProofResultText(result) {
    return result.status === 'verified'
      ? localized('Verified: the public Gist belongs to this GitHub account and contains this Nostr key.', 'Verificado: a Gist pública pertence a esta conta do GitHub e contém esta chave Nostr.')
      : result.status === 'unverified' && result.reason === 'owner'
        ? localized('Not verified: the Gist author does not match the claimed GitHub account.', 'Não verificado: a autoria da Gist não corresponde à conta GitHub declarada.')
        : result.status === 'unverified' && result.reason === 'npub-missing'
          ? localized('Not verified: the Gist does not contain this Nostr key.', 'Não verificado: a Gist não contém esta chave Nostr.')
          : result.status === 'unverified'
            ? localized('Not verified: the Gist is private, incomplete, too large, or has an unsupported format.', 'Não verificado: a Gist é privada, incompleta, grande demais ou tem um formato não compatível.')
            : result.status === 'invalid'
              ? localized('The linked GitHub proof is malformed.', 'A prova GitHub vinculada está malformada.')
              : result.status === 'checking'
                ? localized('Checking the public GitHub Gist…', 'Consultando a Gist pública do GitHub…')
                : localized('Could not check GitHub. The request may be blocked or unavailable.', 'Não foi possível consultar o GitHub. A solicitação pode estar bloqueada ou indisponível.');
  }
  function renderPeerIdentityProofs(record) {
    const section = $('chat-nip39-section');
    const list = $('chat-nip39-list');
    const status = $('chat-nip39-status');
    list.replaceChildren();
    if (!record?.claims?.length) { section.hidden = true; return; }
    section.hidden = false;
    status.textContent = localized('Identity claims signed by this Nostr key.', 'Declarações de identidade assinadas por esta chave Nostr.');
    record.claims.forEach(claim => {
      const card = document.createElement('article');
      card.className = 'identity-proof-entry';
      const title = document.createElement('strong');
      title.textContent = `${claim.platform}:${claim.identity}`;
      const proof = document.createElement('code');
      proof.textContent = claim.proof;
      const result = document.createElement('p');
      result.className = 'fine-print';
      result.setAttribute('role', 'status');
      result.setAttribute('aria-live', 'polite');
      const checkKey = identityProofCheckKey(state.chatDetailsPeer, record, claim);
      const previousCheck = state.identityProofChecks.get(checkKey);
      result.textContent = previousCheck
        ? identityProofResultText(previousCheck)
        : localized('Signed claim · not verified', 'Declaração assinada · não verificada');
      card.append(title, proof);
      const url = claim.platform === 'github' ? IdentityProofs.githubGistUrl(claim) : '';
      if (url) {
        const actions = document.createElement('div');
        actions.className = 'identity-proof-actions';
        const link = document.createElement('a');
        link.className = 'button text';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = localized('Open proof', 'Abrir prova');
        const verify = document.createElement('button');
        verify.type = 'button';
        verify.className = 'button secondary';
        verify.textContent = localized('Verify on GitHub', 'Verificar no GitHub');
        verify.addEventListener('click', () => verifyPeerGitHubIdentity(record, claim, result, verify));
        actions.append(link, verify);
        card.append(actions);
      } else {
        result.textContent = localized('Property does not verify this provider yet.', 'O Property ainda não verifica este provedor.');
      }
      card.append(result);
      list.append(card);
    });
  }
  function renderChatDetailsForCurrentLanguage() {
    const peer = state.chatDetailsPeer;
    if (!$('chat-details-dialog').open || !peer || $('chat-public-profile-section').hidden) return;
    renderPeerPublicProfile(state.peerProfiles.get(peer) || null);
    renderPeerProfileLookupStatus(peer);
    renderPeerIdentityProofs(state.peerIdentityProofs.get(peer) || null);
  }
  async function verifyPeerGitHubIdentity(record, claim, status, button) {
    const peer = state.chatDetailsPeer;
    if (!peer || !$('chat-details-dialog').open || state.peerIdentityProofs.get(peer)?.eventId !== record.eventId) return;
    const checkId = ++state.identityProofCheckId;
    const checkKey = identityProofCheckKey(peer, record, claim);
    state.identityProofChecks.set(checkKey, { status: 'checking' });
    button.disabled = true;
    status.textContent = localized('Checking the public GitHub Gist…', 'Consultando a Gist pública do GitHub…');
    try {
      let result;
      try { result = await IdentityProofs.verifyGitHubClaim(claim, N.nip19.npubEncode(peer)); }
      catch { result = { status: 'unavailable', reason: 'network' }; }
      if (checkId !== state.identityProofCheckId || state.chatDetailsPeer !== peer || !$('chat-details-dialog').open || state.peerIdentityProofs.get(peer)?.eventId !== record.eventId) {
        state.identityProofChecks.delete(checkKey);
        return;
      }
      state.identityProofChecks.set(checkKey, result);
      while (state.identityProofChecks.size > 64) state.identityProofChecks.delete(state.identityProofChecks.keys().next().value);
      renderPeerIdentityProofs(record);
      void renderConversations().catch(() => {});
    } finally {
      if (checkId === state.identityProofCheckId && state.chatDetailsPeer === peer && $('chat-details-dialog').open && button.isConnected) button.disabled = false;
    }
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
    const groupMembers = Array.isArray(conversation.members) ? conversation.members : [];
    $('group-invite-section').hidden = conversation.group !== true || groupMembers.length < 3 || groupMembers.length >= MAX_NIP17_GROUP_MEMBERS || !groupMembers.includes(state.pubkey);
    $('group-invite-member-input').value = '';
    $('group-invite-result').hidden = true;
    $('group-invite-link').value = '';
    $('group-invite-qr').replaceChildren();
    $('group-invite-qr').hidden = true;
    $('group-invite-status').textContent = '';
    state.groupInviteDraft = null;
    $('chat-public-profile-section').hidden = conversation.group === true;
    $('load-chat-public-profile').disabled = conversation.group === true;
    if (conversation.group === true) {
      const count = conversation.members?.length || 0;
      $('chat-group-details').textContent = localized(
        `Private NIP-17 group · ${count} members. Group membership and removal controls are not available in this app.`,
        `Grupo privado NIP-17 · ${count} participantes. Este app não oferece controles de associação ou remoção de membros.`
      );
      renderPeerIdentityProofs(null);
    } else {
      let profile = state.peerProfiles.get(peer);
      if (!profile) {
        const cached = PublicProfile.fromCache(await get('settings', publicProfileSettingId(peer)), peer);
        if (cached) { profile = cached; state.peerProfiles.set(peer, cached); }
      }
      renderPeerPublicProfile(profile);
      renderPeerProfileLookupStatus(peer);
      let identityRecord = state.peerIdentityProofs.get(peer);
      if (!identityRecord) {
        const cached = await get('settings', identityProofSettingId(peer));
        identityRecord = cached?.event ? IdentityProofs.parseEvent(cached.event, peer, event => N.verifyEvent(event)) : null;
        if (identityRecord) state.peerIdentityProofs.set(peer, identityRecord);
      }
      renderPeerIdentityProofs(identityRecord);
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
      const events = await fetchEvents({ kinds: [0, IdentityProofs.KIND], authors: [peer], limit: 40 }, 7000, urls);
      if (state.chatDetailsPeer !== peer || !$('chat-details-dialog').open) return;
      const profile = PublicProfile.latest(events, peer, event => N.verifyEvent(event));
      let priorIdentity = state.peerIdentityProofs.get(peer) || null;
      if (!priorIdentity) {
        const cached = await get('settings', identityProofSettingId(peer));
        priorIdentity = cached?.event ? IdentityProofs.parseEvent(cached.event, peer, event => N.verifyEvent(event)) : null;
      }
      const identityRecord = IdentityProofs.latestRecord([...(priorIdentity?.event ? [priorIdentity.event] : []), ...events], peer, event => N.verifyEvent(event));
      if (identityRecord) {
        state.peerIdentityProofs.set(peer, identityRecord);
        await put('settings', { id: identityProofSettingId(peer), event: identityRecord.event, checkedAt: Date.now() });
      }
      renderPeerIdentityProofs(identityRecord || priorIdentity);
      if (identityRecord && identityRecord.eventId !== priorIdentity?.eventId) await renderConversations();
      if (!profile) {
        renderPeerPublicProfile(state.peerProfiles.get(peer));
        state.peerProfileLookupStatuses.set(peer, identityRecord?.claims?.length || priorIdentity?.claims?.length
          ? 'missing-with-identity' : state.peerProfiles.has(peer) ? 'saved-profile-stale' : 'missing');
        renderPeerProfileLookupStatus(peer);
        return;
      }
      profile.checkedAt = Date.now();
      state.peerProfiles.set(peer, profile);
      state.peerProfileLookupStatuses.set(peer, 'loaded');
      await put('settings', { id: publicProfileSettingId(peer), ...profile });
      renderPeerPublicProfile(profile);
      if (state.activePeer === peer) await updateConversationHeader(await get('conversations', peer));
      await renderConversations();
    } catch (error) {
      renderPeerPublicProfile(state.peerProfiles.get(peer));
      status.textContent = localized(`Could not load a profile: ${error.message || 'relay error'}`, `Não foi possível carregar o perfil: ${error.message || 'erro de relay'}`);
      state.peerProfileLookupStatuses.set(peer, 'error');
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
  function renderLinkPreview(preview, { removable = false } = {}) {
    const card = document.createElement('div'); card.className = 'link-preview-card';
    const heading = document.createElement('div'); heading.className = 'link-preview-heading';
    const copy = document.createElement('div');
    const source = document.createElement('div'); source.className = 'link-preview-source'; source.textContent = localized('Link preview · provided by sender', 'Prévia do link · fornecida por quem enviou');
    const site = document.createElement('div'); site.className = 'link-preview-site'; site.textContent = preview.site;
    const title = document.createElement('div'); title.className = 'link-preview-title'; title.textContent = preview.title;
    copy.append(source, site, title);
    if (removable) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'link-preview-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', localized('Remove link preview', 'Remover prévia do link'));
      remove.title = remove.getAttribute('aria-label');
      remove.addEventListener('click', clearLinkPreviewDraft);
      heading.append(copy, remove);
    } else heading.append(copy);
    card.append(heading);
    if (preview.description) { const description = document.createElement('div'); description.className = 'link-preview-description'; description.textContent = preview.description; card.append(description); }
    const open = document.createElement('a'); open.className = 'link-preview-open'; open.href = preview.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.referrerPolicy = 'no-referrer'; open.textContent = localized('Open linked page', 'Abrir página vinculada');
    open.setAttribute('aria-label', `${open.textContent}: ${preview.url}`); card.append(open);
    return card;
  }
  function clearLinkPreviewDraft() {
    state.linkPreviewSequence++;
    state.linkPreview = null; state.linkPreviewBusy = false; state.linkPreviewStatus = '';
    updateLinkPreviewDraft();
  }
  function updateLinkPreviewDraft() {
    const input = $('message-input'); const button = $('link-preview-button'); const panel = $('link-preview-draft');
    if (!input || !button || !panel || !LinkPreview) return;
    const candidate = LinkPreview.firstLink(input.value);
    if (candidate !== state.linkPreviewUrl) {
      state.linkPreviewSequence++; state.linkPreviewUrl = candidate || ''; state.linkPreview = null; state.linkPreviewBusy = false; state.linkPreviewStatus = '';
    }
    button.disabled = !candidate || Boolean(state.editingMessage) || state.linkPreviewBusy || input.disabled;
    panel.replaceChildren(); panel.classList.toggle('hidden', !candidate || (!state.linkPreview && !state.linkPreviewBusy && !state.linkPreviewStatus));
    if (state.linkPreview) panel.append(renderLinkPreview(state.linkPreview, { removable: true }));
    else if (candidate && (state.linkPreviewBusy || state.linkPreviewStatus)) {
      const status = document.createElement('p'); status.className = 'link-preview-status'; status.setAttribute('role', 'status'); status.textContent = state.linkPreviewBusy ? localized('Loading preview…', 'Carregando prévia…') : state.linkPreviewStatus; panel.append(status);
    }
  }
  async function fetchComposerLinkPreview() {
    const text = $('message-input').value; const url = LinkPreview?.firstLink(text); const peer = state.activePeer;
    if (!url || !peer || state.editingMessage || state.linkPreviewBusy) return;
    const generation = ++state.linkPreviewSequence;
    state.linkPreviewUrl = url; state.linkPreview = null; state.linkPreviewStatus = ''; state.linkPreviewBusy = true; updateLinkPreviewDraft();
    try {
      const preview = await LinkPreview.fetchPreview(url);
      if (generation !== state.linkPreviewSequence || state.activePeer !== peer || LinkPreview.firstLink($('message-input').value) !== url) return;
      state.linkPreviewBusy = false;
      state.linkPreview = preview;
      state.linkPreviewStatus = preview ? '' : localized('Preview unavailable. You can still send the link without a preview.', 'Prévia indisponível. Você ainda pode enviar o link sem prévia.');
    } finally {
      if (generation === state.linkPreviewSequence) { state.linkPreviewBusy = false; updateLinkPreviewDraft(); }
    }
  }
  function receiveShareHandoff(action) {
    if (!SHARE_LAUNCH_ACTIONS.has(action)) return;
    pendingTabShareAction = action;
    if (!propertyTabIsOwner || !state.activeWorkspaceReady || !state.pubkey) return;
    pendingTabShareAction = '';
    if (!document.querySelector('dialog[open]') || $('share-dialog').open) void openShareInbox(action);
    else void renderShareInbox().catch(() => {});
  }
  function announceQueuedShare() {
    if (!propertyTabChannel || shareHandoffAnnounced) return;
    const action = new URL(window.location.href).searchParams.get('launch');
    if (!SHARE_LAUNCH_ACTIONS.has(action)) return;
    try {
      propertyTabChannel.postMessage({ type: 'share-queued', action });
      shareHandoffAnnounced = true;
    } catch {}
  }
  function handlePropertyTabMessage(event) {
    const message = event.data;
    if (propertyTabIsOwner) {
      if (message?.type === 'share-queued' && SHARE_LAUNCH_ACTIONS.has(message.action)) receiveShareHandoff(message.action);
      return;
    }
    if (message?.type === 'active-ready') announceQueuedShare();
  }
  function activeTabGate(stateName) {
    const gate = $('active-tab-screen');
    if (!gate) return;
    const title = $('active-tab-title');
    const message = $('active-tab-message');
    const reload = $('active-tab-reload');
    const fallback = $('active-tab-fallback-note');
    if (stateName === 'waiting') {
      title.textContent = localized('Property is open in another tab', 'O Property já está aberto em outra aba');
      message.textContent = localized(
        'This tab is waiting without opening your identity or connecting to relays. Close the active Property tab and this one will start automatically.',
        'Esta aba está aguardando sem abrir sua identidade nem se conectar aos relays. Feche a aba ativa do Property e esta começará automaticamente.'
      );
      reload.hidden = true;
      gate.hidden = false;
      return;
    }
    if (stateName === 'startup-error') {
      title.textContent = localized('Property could not start', 'Não foi possível iniciar o Property');
      message.textContent = localized('Reload this page to try again.', 'Recarregue esta página para tentar novamente.');
      reload.hidden = false;
      reload.textContent = localized('Reload Property', 'Recarregar Property');
      gate.hidden = false;
      return;
    }
    if (fallback) {
      fallback.textContent = localized(
        'This browser cannot keep two Property tabs from opening at once. For now, use Property in one tab at a time.',
        'Este navegador não consegue impedir que duas abas do Property abram ao mesmo tempo. Por enquanto, use o Property em uma aba por vez.'
      );
      fallback.classList.remove('hidden');
    }
  }
  function startWithActiveTabLock(start) {
    const locks = globalThis.navigator?.locks;
    if (!locks || typeof locks.request !== 'function') {
      activeTabGate('unsupported');
      void Promise.resolve().then(start).catch(() => activeTabGate('startup-error'));
      return;
    }

    try {
      if (typeof BroadcastChannel === 'function') {
        propertyTabChannel = new BroadcastChannel('property-active-app-v1');
        propertyTabChannel.addEventListener('message', handlePropertyTabMessage);
      }
    } catch { propertyTabChannel = null; }

    let started = false;
    let acquired = false;
    let leaving = false;
    let releaseOwner;
    const holdLock = new Promise(resolve => { releaseOwner = resolve; });
    const abort = new AbortController();
    const startOnce = async () => {
      if (started) return;
      started = true;
      $('active-tab-screen').hidden = true;
      try { await start(); }
      catch { activeTabGate('startup-error'); }
    };
    const onPageHide = () => {
      leaving = true;
      propertyTabIsOwner = false;
      abort.abort();
      releaseOwner();
      propertyTabChannel?.close();
      propertyTabChannel = null;
    };
    window.addEventListener('pagehide', onPageHide, { once: true });
    window.addEventListener('pageshow', event => {
      if (event.persisted) window.location.reload();
    });
    const waitTimer = window.setTimeout(() => {
      if (!started) {
        activeTabGate('waiting');
        announceQueuedShare();
      }
    }, 180);

    let request;
    try {
      request = locks.request('property-active-app-v1', { mode: 'exclusive', signal: abort.signal }, async lock => {
        if (!lock) return;
        acquired = true;
        propertyTabIsOwner = true;
        propertyTabChannel?.postMessage({ type: 'active-ready' });
        window.clearTimeout(waitTimer);
        await startOnce();
        await holdLock;
      });
    } catch {
      window.clearTimeout(waitTimer);
      window.removeEventListener('pagehide', onPageHide);
      propertyTabChannel?.close();
      propertyTabChannel = null;
      activeTabGate('unsupported');
      void startOnce();
      return;
    }
    Promise.resolve(request).catch(() => {
      window.clearTimeout(waitTimer);
      window.removeEventListener('pagehide', onPageHide);
      if (leaving) return;
      if (!acquired) {
        propertyTabIsOwner = false;
        propertyTabChannel?.close();
        propertyTabChannel = null;
        activeTabGate('unsupported');
        void startOnce();
      } else {
        propertyTabIsOwner = false;
        propertyTabChannel?.close();
        propertyTabChannel = null;
        activeTabGate('startup-error');
      }
    });
  }
  function renderFirstUseRelaySuggestions() {
    const panel = $('first-use-relays');
    const caption = $('first-use-relay-caption');
    const list = $('first-use-relay-list');
    if (!panel || !caption || !list) return;
    const visible = state.autoSelectedRelays && state.relays.length > 0;
    panel.classList.toggle('hidden', !visible);
    if (!visible) return;
    caption.textContent = localized(
      'Property picked these relays for you. No relay setup is needed; you can change them any time.',
      'O Property escolheu estes relays para você. Não é preciso configurar nada; você pode trocá-los quando quiser.'
    );
    list.replaceChildren(...state.relays.map(url => {
      const item = document.createElement('li');
      const address = document.createElement('code');
      address.textContent = url;
      item.append(address);
      return item;
    }));
  }
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
        const firstFileName = item.files?.length ? FileTransfers.safeName(item.files[0].name) : '';
        const label = item.tooLarge ? localized('Oversized shared item', 'Item compartilhado grande demais') : (item.title || ShareInbox.formatText(item).split('\n')[0] || firstFileName || localized(`Shared item ${index + 1}`, `Item compartilhado ${index + 1}`));
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
    const fileList = $('share-file-preview');
    const fileWarning = $('share-file-warning');
    const tooLarge = item?.tooLarge === true;
    preview.textContent = item && !tooLarge ? ShareInbox.formatText(item) : '';
    preview.hidden = !preview.textContent;
    fileList.replaceChildren();
    const files = !tooLarge && Array.isArray(item?.files) ? item.files : [];
    fileList.hidden = files.length === 0;
    for (const file of files) {
      const row = document.createElement('li');
      row.className = 'file-attachment-item';
      const details = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = FileTransfers.safeName(file.name);
      const size = document.createElement('small'); size.textContent = `${FileTransfers.formatSize(file.size, window.PropertyI18n?.language || 'en')} · ${file.type || 'application/octet-stream'}`;
      details.append(name, size); row.append(details); fileList.append(row);
    }
    const warningNames = !tooLarge && Array.isArray(item?.fileWarnings) ? item.fileWarnings : [];
    fileWarning.textContent = warningNames.length
      ? localized(`Some shared files were left out because of file count or size limits: ${warningNames.join(', ')}.`, `Alguns arquivos compartilhados ficaram de fora por limites de quantidade ou tamanho: ${warningNames.join(', ')}.`)
      : '';
    fileWarning.classList.toggle('hidden', warningNames.length === 0);
    const noteParts = [];
    if (item?.truncated) noteParts.push(localized('The shared text was shortened to fit a private message. Review it before sending.', 'O texto compartilhado foi encurtado para caber em uma mensagem privada. Revise antes de enviar.'));
    if (files.length && ShareInbox.formatText(item).length > FileTransfers.MAX_CAPTION_CHARS) {
      noteParts.push(localized('The file caption will be shortened to 1,000 characters. You can edit it before sending.', 'A legenda dos arquivos será reduzida para 1.000 caracteres. Você poderá editá-la antes de enviar.'));
    }
    note.textContent = noteParts.join(' ');
    if (tooLarge) {
      notice.textContent = localized('This shared item exceeded the size limit. Its content was not stored.', 'Este item compartilhado excedeu o limite de tamanho. O conteúdo não foi armazenado.');
      notice.classList.remove('hidden');
    } else {
      notice.textContent = '';
      notice.classList.add('hidden');
    }
    const usable = !!item && !tooLarge && (!!ShareInbox.formatText(item) || files.length > 0);
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
          ? localized('Choose a conversation and review the shared text or files. Nothing is sent until you send it.', 'Escolha uma conversa e revise o texto ou os arquivos compartilhados. Nada é enviado até você decidir enviar.')
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
    const files = Array.isArray(item.files) ? item.files : [];
    if (!text && !files.length) return;
    if (files.length && state.fileDraftFiles.length) {
      showToast(localized('Finish or cancel the current file draft before opening shared files.', 'Conclua ou cancele o rascunho de arquivos atual antes de abrir os arquivos compartilhados.'));
      return;
    }
    await selectConversation(peer);
    if (files.length) {
      if (!addFileDrafts(files)) return;
      state.shareFileDraftId = item.id;
      state.shareFileDraftPeer = peer;
      state.shareFileDraftFiles = [...files];
      $('file-attachment-caption').value = Array.from(text).slice(0, FileTransfers.MAX_CAPTION_CHARS).join('');
      renderFileDrafts();
      $('share-dialog').close();
      showToast(localized('Shared files are ready. Review the files and caption, then send when you choose.', 'Os arquivos compartilhados estão prontos. Revise os arquivos e a legenda e envie quando decidir.'));
      return;
    }
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
    renderFirstUseRelaySuggestions();
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
        if (!db.objectStoreNames.contains('directFileParts')) {
          const parts = db.createObjectStore('directFileParts', { keyPath: ['transferId', 'index'] });
          parts.createIndex('byTransferId', 'transferId', { unique: false });
          parts.createIndex('bySessionId', 'sessionId', { unique: false });
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
      request.onsuccess = () => {
        if (store === 'messages' && operation !== 'get' && operation !== 'getAll') {
          state.conversationMessageSearchCache = null;
          state.conversationMessageSearchRevision++;
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error('Falha no armazenamento local.'));
    });
  }
  const get = (store, key) => dbRequest(store, 'get', key);
  const all = store => dbRequest(store, 'getAll');
  const put = (store, value) => dbRequest(store, 'put', value);
  const del = (store, key) => dbRequest(store, 'delete', key);
  function directFilePartsBy(indexName, key) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction('directFileParts', 'readonly');
      const request = tx.objectStore('directFileParts').index(indexName).getAll(key);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error('Could not read local direct file blocks.'));
    });
  }
  async function deleteDirectFileParts(indexName, key) {
    await new Promise((resolve, reject) => {
      const tx = state.db.transaction('directFileParts', 'readwrite');
      const store = tx.objectStore('directFileParts');
      const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(key));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not remove incomplete direct file blocks.'));
      tx.onabort = () => reject(tx.error || new Error('Could not remove incomplete direct file blocks.'));
    });
  }
  function directFileStore() {
    if (!state.directFileStorage) state.directFileStorage = DirectFileStorage.create({
      putPart: record => put('directFileParts', record),
      listParts: transferId => directFilePartsBy('byTransferId', transferId),
      deleteParts: transferId => deleteDirectFileParts('byTransferId', transferId),
      deleteSessionParts: sessionId => deleteDirectFileParts('bySessionId', sessionId),
      getIdentity: () => state.secret && state.pubkey ? { secret: state.secret, pubkey: state.pubkey } : null
    });
    return state.directFileStorage;
  }
  async function saveChatDraft(peer, text, mentionTokens = null) {
    if (!state.pubkey || !peer || (state.editingMessage && state.editingMessage.peer === peer) || (state.shareDraftId && state.shareDraftPeer === peer)) return;
    const id = ChatDrafts.idFor(state.pubkey, peer);
    const mentions = Array.isArray(mentionTokens) ? mentionTokens : peer === state.activePeer ? groupMentionPicker?.getMentions() || [] : [];
    const record = ChatDrafts.createRecord(state.pubkey, peer, text, mentions);
    if (record) await put('drafts', record);
    else await del('drafts', id);
  }
  async function loadChatDraftDetails(peer) {
    if (!state.pubkey || !peer) return { text: '', mentions: [] };
    const record = await get('drafts', ChatDrafts.idFor(state.pubkey, peer));
    return { text: ChatDrafts.readRecord(record, state.pubkey, peer), mentions: ChatDrafts.readMentions(record, state.pubkey, peer) };
  }
  async function loadChatDraft(peer) {
    return (await loadChatDraftDetails(peer)).text;
  }
  function resizeMessageInput(input = $('message-input')) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  }
  function trimmedComposerMentions(text) {
    const raw = $('message-input').value;
    const removedPrefix = raw.length - raw.trimStart().length;
    return GroupMentions.validMentions(text, (groupMentionPicker?.getMentions() || []).map(mention => ({ ...mention, start: mention.start - removedPrefix })));
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
  async function groupMentionCandidates() {
    const conversation = state.currentConversation;
    if (conversation?.group !== true || !Array.isArray(conversation.members)) return [];
    const otherMembers = [...new Set(conversation.members.map(key => String(key).toLowerCase()))].filter(key => key !== state.pubkey && /^[0-9a-f]{64}$/i.test(key));
    const localConversations = await Promise.all(otherMembers.map(pubkey => get('conversations', pubkey).catch(() => null)));
    return otherMembers.map((pubkey, index) => {
      const localConversation = localConversations[index];
      const profile = state.peerProfiles.get(pubkey);
      const name = displayName(pubkey, localConversation?.title || profile?.displayName || profile?.name || '');
      return { name, pubkey, hint: `npub…${N.nip19.npubEncode(pubkey).slice(-8)}` };
    });
  }
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
    state.activeWorkspaceReady = false;
    state.directFileStorage?.clearKey();
    state.secret = secret;
    resetIdleLock();
    state.pubkey = N.getPublicKey(secret);
    state.npub = N.nip19.npubEncode(state.pubkey);
    const iceRecord = await get('settings', IceServers.iceSettingsId(state.pubkey));
    try {
      state.iceSettings = IceServers.open(N, state.secret, state.pubkey, iceRecord);
      state.iceSettingsInvalid = false;
    } catch {
      state.iceSettings = IceServers.normalize({});
      state.iceSettingsInvalid = true;
    }
    renderIceSettings();
    const notificationSetting = await get('settings', NotificationPrefs.notificationsId(state.pubkey));
    state.notificationsEnabled = notificationSetting?.enabled === true && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    const typingSetting = await get('settings', typingPreferenceId(state.pubkey));
    state.typingIndicatorsEnabled = typingSetting?.enabled !== false;
    $('typing-indicators-enabled').checked = state.typingIndicatorsEnabled;
    const readReceiptsSetting = await get('settings', readReceiptsPreferenceId(state.pubkey));
    state.readReceiptsEnabled = readReceiptsSetting?.enabled === true;
    $('read-receipts-enabled').checked = state.readReceiptsEnabled;
    const activeStatusSetting = await get('settings', activeStatusPreferenceId(state.pubkey));
    state.activeStatusEnabled = activeStatusSetting?.enabled === true;
    $('active-status-enabled').checked = state.activeStatusEnabled;
    state.readReceiptSent.clear();
    state.readReceiptCandidates.clear();
    const readReceiptPrefix = readReceiptRecordPrefix(state.pubkey);
    state.readReceipts = new Map((await all('settings'))
      .filter(record => typeof record.id === 'string' && record.id.startsWith(readReceiptPrefix) && /^[0-9a-f]{64}$/i.test(record.messageId || '') && Array.isArray(record.readers))
      .map(record => [record.messageId.toLowerCase(), new Set(record.readers.filter(key => /^[0-9a-f]{64}$/i.test(key || '') && key.toLowerCase() !== state.pubkey))]));
    const appBadgeSetting = await get('settings', AppBadge.preferenceId(state.pubkey));
    state.appBadgeEnabled = appBadgeSetting?.enabled === true && AppBadge.canBadge(navigator);
    state.appBadgeLastCount = null;
    const mutePrefix = `property-notification-mute:${state.pubkey}:`;
    state.notificationMutes = new Map((await all('settings')).filter(record => typeof record.id === 'string' && record.id.startsWith(mutePrefix))
      .map(record => [record.id.slice(mutePrefix.length), record]));
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
    } else if (state.pendingGroupInviteIntent) {
      const invite = state.pendingGroupInviteIntent;
      state.pendingGroupInviteIntent = '';
      state.pendingLaunchAction = '';
      await showGroupInvitePreview(invite);
    } else if (state.pendingLaunchAction) {
      const action = state.pendingLaunchAction;
      state.pendingLaunchAction = '';
      if (action === 'new-chat') $('new-chat-dialog').showModal();
      else if (['share', 'share-full', 'share-error'].includes(action)) openShareInbox(action);
      else setActiveView(action);
    }
    state.activeWorkspaceReady = true;
    if (pendingTabShareAction) {
      const action = pendingTabShareAction;
      pendingTabShareAction = '';
      if (!document.querySelector('dialog[open]') || $('share-dialog').open) void openShareInbox(action);
      else void renderShareInbox().catch(() => {});
    }
  }
  async function refreshLocalProfile() {
    const profile = await get('settings', `profile-${state.pubkey}`) || { id: `profile-${state.pubkey}`, name: '' };
    $('profile-name').value = profile.name || '';
    $('profile-about').value = profile.about || '';
    $('profile-website').value = profile.website || '';
    $('profile-picture').value = profile.picture || '';
    $('profile-nip05').value = profile.nip05 || '';
    $('profile-initial').textContent = profile.name?.slice(0, 1)?.toUpperCase() || 'L';
    resetOwnNip05Check();
    const cachedIdentity = await get('settings', identityProofSettingId(state.pubkey));
    const identityRecord = cachedIdentity?.event ? IdentityProofs.parseEvent(cachedIdentity.event, state.pubkey, event => N.verifyEvent(event)) : null;
    const github = identityRecord?.claims.find(claim => claim.platform === 'github');
    $('profile-github-username').value = github?.identity || '';
    $('profile-github-gist').value = github?.proof || '';
    $('profile-nip39-status').textContent = github
      ? localized('A signed GitHub link is saved on this device. Load from relays to refresh it.', 'Um vínculo GitHub assinado está salvo neste aparelho. Carregue dos relays para atualizá-lo.')
      : '';
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
      if (state.pubkey) relayMessage(url, ['REQ', conn.subId, { kinds: [1059, TypingSignals.EPHEMERAL_GIFT_WRAP_KIND], '#p': [state.pubkey], limit: 250 }]);
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
      if (value.kind === TypingSignals.EPHEMERAL_GIFT_WRAP_KIND && state.secret) receiveTypingSignal(value).catch(() => {});
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
  async function notifyIncomingMessage(peer) {
    if (!state.notificationsEnabled || !state.pubkey || typeof Notification === 'undefined') return;
    const permission = Notification.permission;
    const mute = currentConversationMute(peer);
    const muted = NotificationPrefs.isMuted(mute, Date.now());
    if (!NotificationPrefs.shouldNotify({ enabled: state.notificationsEnabled, permission,
      pageHidden: document.visibilityState === 'hidden', muted })) return;
    try {
      const identity = state.pubkey;
      const notice = new Notification('Property', {
        body: localized('New message. Open Property to read it.', 'Nova mensagem. Abra o Property para ler.'),
        icon: './assets/property-icon-192.png',
        badge: './assets/property-icon-192.png',
        tag: `property-message-${crypto.randomUUID()}`
      });
      notice.onclick = () => {
        notice.close();
        window.focus();
        if (state.secret && state.pubkey === identity) {
          setActiveView('messages');
          selectConversation(peer).catch(error => showToast(error.message || localized('Could not open this conversation.', 'Não foi possível abrir esta conversa.')));
        }
      };
    } catch { /* Browser notification support can disappear between the permission check and display. */ }
  }
  function messageDeletionSettingId(peer, targetId) {
    return MessageDeletions?.settingId(state.pubkey, peer, targetId) || '';
  }
  async function pendingMessageDeletionRecords(message, peer) {
    const ids = MessageDeletions.messageEventIds(message);
    const records = await Promise.all(ids.map(id => get('settings', messageDeletionSettingId(peer, id))));
    return records.filter(record => record?.type === MessageDeletions.TAG);
  }
  async function applyPendingMessageDeletion(message, peer) {
    const records = await pendingMessageDeletionRecords(message, peer);
    const updated = MessageDeletions.applyPending(message, peer, records, state.pubkey);
    if (updated.deleted) {
      const targetIds = new Set(MessageDeletions.messageEventIds(updated));
      for (const reaction of await all('messages')) {
        if (reaction.peer === peer && reaction.kind === 7 && targetIds.has(String(reaction.targetEventId || '').toLowerCase())) await del('messages', reaction.id);
      }
      for (const targetId of targetIds) {
        await del('settings', messageDeletionSettingId(peer, targetId)).catch(() => {});
      }
    }
    return updated;
  }
  async function updateConversationAfterMessageDeletion(peer, updates) {
    if (!updates.length) return;
    const conversation = await get('conversations', peer);
    if (!conversation) return;
    const deletedLatestAt = Math.max(...updates.map(item => item.after.createdAt || 0));
    if (deletedLatestAt < (conversation.lastAt || 0)) return;
    const remaining = (await all('messages')).filter(message => message.peer === peer && !message.deleted && !message.hiddenFromChat && message.kind !== 7)
      .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0) || String(right.id).localeCompare(String(left.id)))[0];
    const lastMessage = remaining
      ? remaining.fileChunk ? `📎 ${FileTransfers.safeName(remaining.fileChunk.name)}`
        : remaining.voiceMessage ? VoiceMessages.FALLBACK_TEXT
          : remaining.text || (conversation.group ? `${conversation.members?.length || 0} ${localized('members', 'participantes')}` : '')
      : localized('Message deleted', 'Mensagem apagada');
    await put('conversations', {
      ...conversation,
      lastMessage,
      lastAt: remaining?.createdAt || Math.max(conversation.lastAt || 0, deletedLatestAt)
    });
  }
  async function applyIncomingMessageDeletion(peer, deletion, { allowPending = true } = {}) {
    const messages = await all('messages');
    const updates = MessageDeletions.applyToMessages(messages, peer, deletion, state.pubkey);
    if (!allowPending && !updates.length) return 0;
    for (const update of updates) {
      await put('messages', update.after);
      for (const targetId of MessageDeletions.messageEventIds(update.after)) {
        state.readReceiptCandidates.delete(targetId);
        state.readReceipts.delete(targetId);
      }
    }
    const targets = new Set(deletion.targetIds.map(target => String(target).toLowerCase()));
    for (const reaction of messages) {
      if (reaction.peer === peer && reaction.kind === 7 && targets.has(String(reaction.targetEventId || '').toLowerCase())) {
        await del('messages', reaction.id);
      }
    }
    const records = MessageDeletions.recordsFor(state.pubkey, peer, deletion);
    for (const record of records) await put('settings', record);
    await updateConversationAfterMessageDeletion(peer, updates);
    await renderConversations();
    if (state.activePeer === peer) {
      await updateConversationHeader(await get('conversations', peer));
      await renderMessages(peer);
    }
    return updates.length;
  }
  async function deletePrivateMessageForEveryone(peer, message) {
    const conversation = await get('conversations', peer);
    const identity = state.pubkey;
    if (!identity || !state.secret || !conversation || conversation.agent || (await get('agentAccess', peer))?.status === 'approved' ||
        message?.direction !== 'sent' || message.senderPubkey?.toLowerCase() !== identity || message.fromAgent || message.agentMessageId ||
        message.kind === 7 || message.deleted || !['sent', 'partial'].includes(message.status)) {
      throw new Error(localized('Only your delivered private messages can be deleted for everyone.', 'Só é possível apagar para todos mensagens privadas suas que já foram enviadas.'));
    }
    const members = conversation.group === true
      ? [...new Set(conversation.members || [])].map(value => String(value).toLowerCase()).sort()
      : [...new Set([identity, peer].map(value => String(value).toLowerCase()))].sort();
    if ((conversation.group === true && groupConversationId(members) !== peer) || members.length < 2 || members.length > MAX_NIP17_GROUP_MEMBERS ||
        !members.includes(identity) || members.some(member => !/^[0-9a-f]{64}$/i.test(member))) {
      throw new Error(localized('Could not verify this private conversation’s participants.', 'Não foi possível verificar as pessoas desta conversa privada.'));
    }
    const targetIds = MessageDeletions.messageEventIds(message);
    if (!targetIds.length) throw new Error(localized('This message has no Nostr event reference.', 'Esta mensagem não tem referência de evento Nostr.'));
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    if (state.pubkey !== identity || !state.secret) throw new Error(localized('The identity changed before the deletion was prepared.', 'A identidade mudou antes de preparar a exclusão.'));
    const secret = new Uint8Array(state.secret);
    let prepared;
    try {
      prepared = MessageDeletions.createNip17Deletion({
        nostr: N, secret, selfPubkey: identity, participants: members, targetIds,
        createdAt: Math.floor(Date.now() / 1000)
      });
    } finally { secret.fill(0); }
    const peerPubkey = members.find(member => member !== identity);
    const routePlan = members.length === 2
      ? Routing.planGiftWraps(prepared.wraps, identity, peerPubkey, relayLists[identity], relayLists[peerPubkey], N.verifyEvent)
      : Routing.planGroupGiftWraps(prepared.wraps, members, relayLists, N.verifyEvent);
    if (!routePlan.ready) throw new Error(localized('Could not prepare the encrypted deletion for this conversation.', 'Não foi possível preparar a exclusão criptografada para esta conversa.'));
    await connectAllRelays();
    let confirmedRecipients = 0;
    let requiredRecipients = 0;
    for (const delivery of routePlan.deliveries) {
      if (delivery.recipient === identity) continue;
      requiredRecipients += 1;
    }
    for (const delivery of routePlan.deliveries) {
      try {
        const confirmed = await publishToRelays(delivery.event, delivery.relays);
        if (delivery.recipient !== identity && confirmed) confirmedRecipients += 1;
      } catch { /* Try every recipient envelope; relay acceptance does not prove device processing. */ }
    }
    if (state.pubkey !== identity) throw new Error(localized('The identity changed while sending the deletion. Reload the conversation to check its state.', 'A identidade mudou durante o envio da exclusão. Recarregue a conversa para conferir o estado.'));
    if (!confirmedRecipients) throw new Error(localized('No recipient inbox relay confirmed the deletion. The message is still in your local history.', 'Nenhum relay de recebimento do destinatário confirmou a exclusão. A mensagem continua no seu histórico local.'));
    const deletion = MessageDeletions.parseRumor(prepared.rumor, members);
    if (!deletion) throw new Error(localized('The encrypted deletion could not be verified.', 'Não foi possível verificar a exclusão criptografada.'));
    await applyIncomingMessageDeletion(peer, deletion);
    if (confirmedRecipients < requiredRecipients) {
      showToast(localized(`Deletion confirmed by ${confirmedRecipients} of ${requiredRecipients} recipient inbox relays. Other devices may still show the message.`, `Exclusão confirmada por ${confirmedRecipients} de ${requiredRecipients} relays de recebimento. Outros aparelhos ainda podem mostrar a mensagem.`));
    } else {
      showToast(localized('Recipient relays confirmed the deletion request. Other copies may remain.', 'Os relays dos destinatários confirmaram o pedido de exclusão. Outras cópias podem permanecer.'));
    }
    return { confirmedRecipients, requiredRecipients };
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
    const agentAccess = group ? null : await get('agentAccess', peer);
    if (agentAccess?.status === 'blocked') return;
    const existingConversation = await get('conversations', peer);
    if (rumor.kind === 5) {
      const deletion = MessageDeletions.parseRumor(rumor, members);
      if (!deletion || existingConversation?.agent || agentAccess?.status === 'approved') return;
      if (group && existingConversation?.members?.length && groupConversationId(existingConversation.members) !== peer) return;
      if (!group && existingConversation?.group) return;
      await applyIncomingMessageDeletion(peer, deletion);
      return;
    }
    if (MessagePins?.hasTag(rumor)) {
      const pin = MessagePins.recordFromRumor(rumor);
      if (!pin || rumor.pubkey === state.pubkey || existingConversation?.agent || agentAccess?.status === 'approved') return;
      if (group && existingConversation?.members?.length && groupConversationId(existingConversation.members) !== peer) return;
      if (!group && existingConversation?.group) return;
      if (group && !existingConversation) {
        await put('conversations', { pubkey: peer, title: localized('Private group', 'Grupo privado'), group: true, members, lastMessage: '', lastAt: 0 });
      } else if (!group && !existingConversation) {
        await put('conversations', { pubkey: peer, title: '', lastMessage: '', lastAt: 0 });
      }
      await applyIncomingMessagePin(peer, pin);
      await renderConversations();
      return;
    }
    if (rumor.pubkey === state.pubkey && !edit) return;
    const chessTag = Array.isArray(rumor.tags)
      ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'app' && tag[1] === 'property-chess')
      : null;
    if (chessTag) {
      if (rumor.kind !== 14 || chessTag[2] !== '1' || group || existingConversation?.group || existingConversation?.agent || agentAccess?.status === 'approved') return;
      if (enc.encode(rumor.content).byteLength > 16384) return;
      let payload;
      try { payload = JSON.parse(rumor.content); } catch { return; }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.p !== 'property-chess' || !Number.isInteger(payload.v) || typeof payload.k !== 'string') return;
      const id = rumor.id || event.id;
      if (!/^[0-9a-f]{64}$/i.test(id || '') || await get('messages', id)) return;
      const createdAt = rumor.created_at * 1000;
      const message = {
        id, peer, text: localized('Chess game update', 'Atualização da partida de xadrez'), appId: 'property-chess', appPayload: payload,
        hiddenFromChat: true, senderPubkey: rumor.pubkey, createdAt, direction: 'received', status: 'delivered', nostrEventId: id
      };
      await put('messages', message);
      const previous = existingConversation || { pubkey: peer, title: '' };
      const updatedConversation = createdAt >= (previous.lastAt || 0)
        ? { ...previous, lastMessage: localized('♟ Chess game', '♟ Partida de xadrez'), lastAt: createdAt }
        : previous;
      await put('conversations', updatedConversation);
      await renderConversations();
      if (state.activePeer === peer) {
        await updateConversationHeader(updatedConversation);
        await renderMessages(peer);
      }
      for (const listener of chessSubscribers.get(peer) || []) {
        try { listener(payload); } catch {}
      }
      return;
    }
    if (rumor.kind === 7) {
      const targetTag = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'e' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) : null;
      if (!targetTag || !rumor.content || rumor.content.length > 64) return;
      const targetId = targetTag[1].toLowerCase();
      const targetMessage = (await all('messages')).find(message => message.peer === peer && message.deleted && MessageDeletions.messageEventIds(message).includes(targetId));
      if (targetMessage) return;
      const reactionId = rumor.id || event.id;
      if (!reactionId) return;
      const id = `reaction:${peer}:${reactionId}`;
      if (await get('messages', id)) return;
      await put('messages', { id, peer, kind: 7, targetEventId: targetTag[1], reaction: rumor.content, reactorPubkey: rumor.pubkey, senderPubkey: rumor.pubkey, createdAt: rumor.created_at * 1000, direction: 'received', status: 'delivered', nostrEventId: reactionId });
      if (state.activePeer === peer) await renderMessages(peer);
      return;
    }
    if (rumor.kind === 14 && rumor.pubkey !== state.pubkey) clearRemoteTyping(peer, rumor.pubkey);
    const subject = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'subject' && typeof tag[1] === 'string' && tag[1].trim() && tag[1].length <= 80)?.[1].trim() : '';
    const fileTagPresent = Array.isArray(rumor.tags) && rumor.tags.some(tag => Array.isArray(tag) && tag[0] === FileTransfers.TAG);
    let text = rumor.content;
    let mentionTokens = [];
    if (group && /nostr:(?:npub|nprofile)1/u.test(rumor.content)) {
      const names = new Map();
      const otherMembers = members.filter(member => member !== state.pubkey);
      const localConversations = await Promise.all(otherMembers.map(member => get('conversations', member).catch(() => null)));
      otherMembers.forEach((member, index) => {
        const profile = state.peerProfiles.get(member);
        names.set(member, localConversations[index]?.title || profile?.displayName || profile?.name || '');
      });
      const parsed = GroupMentions.fromWireContent(rumor.content, members, N.nip19.decode, pubkey => names.get(pubkey) || '');
      text = parsed.text;
      mentionTokens = parsed.mentions;
    }
    let parsedAgentMessage = null;
    let agentMessageError = '';
    const isAgentProtocol = !group && !fileTagPresent && rumor.content.includes(AgentMessages.PROTOCOL);
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
    const voiceMessage = !edit && !fromAgent ? await VoiceMessages.fromTags(rumor.tags) : null;
    if (voiceMessage) { text = VoiceMessages.FALLBACK_TEXT; mentionTokens = []; }
    const fileChunk = !edit && !fromAgent ? await FileTransfers.fromTags(rumor.tags) : null;
    if (fileTagPresent && !fileChunk) return;
    if (fileChunk && (voiceMessage || fromAgent || existingConversation?.agent || agentAccess?.status === 'approved')) return;
    if (fileChunk) { text = fileChunk.caption || ''; mentionTokens = []; }
    let fileTransferAlreadyStored = false;
    if (fileChunk) {
      const seenKey = `${peer}:${rumor.pubkey}:${fileChunk.transferId}`;
      fileTransferAlreadyStored = state.fileTransferSeen.has(seenKey);
      if (!fileTransferAlreadyStored) {
        fileTransferAlreadyStored = (await all('messages')).some(item => item.peer === peer && item.senderPubkey === rumor.pubkey && item.fileChunk?.transferId === fileChunk.transferId);
        state.fileTransferSeen.add(seenKey);
      }
    }
    const linkPreview = !edit && LinkPreview?.fromTags(rumor.tags, text) || null;
    const replyTag = Array.isArray(rumor.tags) ? rumor.tags.find(tag => Array.isArray(tag) && tag[0] === 'e' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) : null;
    const forwardedHops = fromAgent ? null : MessageForwards.fromTags(rumor.tags);
    const eventId = rumor.id || event.id;
    const senderDirection = rumor.pubkey === state.pubkey ? 'sent' : 'received';
    let message;
    if (edit) {
      const priorMessages = await all('messages');
      if (priorMessages.some(item => item.peer === peer && item.deleted && item.senderPubkey === rumor.pubkey && MessageDeletions.messageEventIds(item).includes(edit.rootId))) return;
      const incoming = {
        id: `edit:${peer}:${edit.rootId}`, peer, text, ...(mentionTokens.length ? { mentions: mentionTokens } : {}), senderPubkey: rumor.pubkey,
        createdAt: rumor.created_at * 1000, direction: senderDirection, status: 'delivered',
        nostrEventId: eventId, edit, linkPreview: null,
        ...(forwardedHops ? { forwarded: forwardedHops } : {}),
        ...(replyTag ? { replyToId: replyTag[1] } : {})
      };
      const result = MessageEdits.applyIncomingEdit(priorMessages, incoming, state.pubkey);
      if (!result.applied) return;
      message = await applyPendingMessageDeletion(result.message, peer);
      await put('messages', message);
    } else {
      const id = parsedAgentMessage ? `agent:${peer}:${parsedAgentMessage.messageId}` : eventId;
      if (await get('messages', id)) return;
      const original = { id, peer, text, ...(voiceMessage ? { voiceMessage } : {}), ...(fileChunk ? { fileChunk } : {}), ...(mentionTokens.length ? { mentions: mentionTokens } : {}), senderPubkey: rumor.pubkey, createdAt: rumor.created_at * 1000, direction: senderDirection, status: senderDirection === 'sent' ? 'sent' : 'delivered', nostrEventId: eventId, linkPreview, ...(forwardedHops ? { forwarded: forwardedHops } : {}), ...(replyTag ? { replyToId: replyTag[1] } : {}), ...(fromAgent ? { fromAgent: true } : {}), ...(parsedAgentMessage ? { agentMessageId: parsedAgentMessage.messageId, inReplyTo: parsedAgentMessage.inReplyTo } : {}), ...(agentMessageError ? { agentMessageError } : {}) };
      const merged = MessageEdits.mergeOriginalBehindEdit(await all('messages'), original, state.pubkey);
      message = await applyPendingMessageDeletion(merged?.message || original, peer);
      await put('messages', message);
    }
    const previous = existingConversation || { pubkey: peer, title: '' };
    const isLatest = !previous.lastAt || message.createdAt >= previous.lastAt;
    const previousUnreadCount = conversationUnreadCount(previous);
    const visibleConversation = hasVisibleConversation(peer);
    const unreadCount = edit || fileTransferAlreadyStored || message.deleted
      ? previousUnreadCount
      : senderDirection === 'received' && !visibleConversation
        ? Math.min(9999, previousUnreadCount + 1)
        : visibleConversation ? 0 : previousUnreadCount;
    const updatedConversation = { ...previous, unreadCount, ...(group ? { group: true, members } : {}), ...(subject ? { title: subject } : {}), ...(fromAgent ? { agent: true } : {}), ...(isLatest ? { lastMessage: message.deleted ? localized('Message deleted', 'Mensagem apagada') : fileChunk ? `📎 ${fileChunk.name}` : message.text, lastAt: message.createdAt } : {}) };
    await put('conversations', updatedConversation);
    await renderConversations();
    if (state.activePeer === peer) { await updateConversationHeader(updatedConversation); await updateAgentBlockControl(peer); await renderMessages(peer); }
    if (!edit && !message.deleted && senderDirection === 'received' && !visibleConversation && !fileTransferAlreadyStored) await notifyIncomingMessage(peer);
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
  function messagePinSettingId(peer) { return `message-pin:${state.pubkey}:${peer}`; }
  async function applyIncomingMessagePin(peer, pin) {
    const key = messagePinSettingId(peer);
    const current = await get('settings', key);
    const result = MessagePins.applyPinRecord(current || null, pin);
    if (!result.applied) return false;
    await put('settings', { id: key, ...result.record });
    if (state.activePeer === peer) await renderMessages(peer);
    return true;
  }
  async function sendConversationPin(peer, targetEventId, action) {
    const conversation = await get('conversations', peer);
    if (!state.pubkey || !conversation || conversation.agent || (await get('agentAccess', peer))?.status === 'approved') {
      throw new Error(localized('Message pins are available in private person-to-person chats and groups.', 'Fixar mensagens está disponível em conversas privadas e grupos.'));
    }
    const members = conversation.group === true
      ? [...new Set(conversation.members || [])].map(value => String(value).toLowerCase()).sort()
      : [...new Set([state.pubkey, peer].map(value => String(value).toLowerCase()))].sort();
    const minimumMembers = conversation.group === true ? 3 : 2;
    if (members.length < minimumMembers || members.length > MAX_NIP17_GROUP_MEMBERS || !members.includes(state.pubkey) || members.some(member => !/^[0-9a-f]{64}$/i.test(member))) {
      throw new Error(localized(`This conversation must have 2–${MAX_NIP17_GROUP_MEMBERS} valid participants.`, `Esta conversa precisa ter de 2 a ${MAX_NIP17_GROUP_MEMBERS} participantes válidos.`));
    }
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    await connectAllRelays();
    const prepared = MessagePins.createNip17Pin({ nostr: N, secret: state.secret, selfPubkey: state.pubkey, participants: members, action, targetEventId });
    const peerPubkey = members.find(member => member !== state.pubkey);
    const routePlan = members.length === 2
      ? Routing.planGiftWraps(prepared.wraps, state.pubkey, peerPubkey, relayLists[state.pubkey], relayLists[peerPubkey], N.verifyEvent)
      : Routing.planGroupGiftWraps(prepared.wraps, members, relayLists, N.verifyEvent);
    if (!routePlan.ready) throw new Error(localized('Could not prepare the private message pin envelopes. Check the conversation inbox relays.', 'Não foi possível preparar os envelopes privados da mensagem fixada. Confira os relays de recebimento da conversa.'));
    let confirmed = 0;
    for (const delivery of routePlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) confirmed += 1; }
      catch { /* Keep trying the other participant envelopes. */ }
    }
    if (confirmed) {
      const record = MessagePins.recordFromRumor(prepared.rumor);
      await applyIncomingMessagePin(peer, record);
    }
    if (confirmed === routePlan.deliveries.length) {
      showToast(action === 'pin'
        ? localized('Pinned message shared with this conversation.', 'Mensagem fixada compartilhada com a conversa.')
        : localized('Pinned message removed for this conversation.', 'Mensagem fixada removida para a conversa.'));
    } else if (confirmed) {
      showToast(localized('The pin reached only some participant relays.', 'A fixação chegou apenas a alguns relays dos participantes.'));
    } else {
      showToast(localized('No participant relay confirmed the pin update.', 'Nenhum relay dos participantes confirmou a atualização da fixação.'));
    }
    if (state.activePeer === peer) await renderMessages(peer);
    return { confirmedEnvelopeCount: confirmed, requiredEnvelopeCount: routePlan.deliveries.length };
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
  function conversationUnreadCount(conversation) {
    return Number.isSafeInteger(conversation?.unreadCount) ? Math.min(9999, Math.max(0, conversation.unreadCount)) : 0;
  }
  function unreadCountLabel(count) {
    return window.PropertyI18n?.language === 'pt-BR'
      ? `${count} ${count === 1 ? 'mensagem não lida' : 'mensagens não lidas'} neste aparelho. Recibos de leitura são uma configuração opcional separada.`
      : `${count} unread ${count === 1 ? 'message' : 'messages'} on this device. Read receipts are a separate optional setting.`;
  }
  function hasVisibleConversation(peer) {
    return state.activePeer === peer && state.activeView === 'messages' && document.visibilityState !== 'hidden';
  }
  async function markConversationRead(peer) {
    if (!peer) return false;
    const conversation = await get('conversations', peer);
    if (!conversation || conversationUnreadCount(conversation) === 0) return false;
    await put('conversations', { ...conversation, unreadCount: 0 });
    return true;
  }
  function currentConversationMute(peer) {
    if (!state.pubkey || !peer) return null;
    const record = state.notificationMutes.get(peer);
    if (!record) return null;
    if (NotificationPrefs.isMuted(record)) return record;
    state.notificationMutes.delete(peer);
    del('settings', NotificationPrefs.chatMuteId(state.pubkey, peer)).catch(() => {});
    return null;
  }
  async function openConversationMuteDialog(peer) {
    if (!state.pubkey || !peer) return;
    state.notificationMutePeer = peer;
    const conversation = await get('conversations', peer);
    const mute = await currentConversationMute(peer);
    $('notification-mute-chat').textContent = conversationLabel(conversation || peer);
    $('notification-mute-status').textContent = mute
      ? mute.until === 'forever'
        ? localized('Notifications are muted until you turn them back on.', 'As notificações estão silenciadas até você reativá-las.')
        : localized(`Notifications are muted until ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(mute.until))}.`, `As notificações estão silenciadas até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(mute.until))}.`)
      : localized('Notifications can be muted on this device. Unread counts remain visible; nothing is sent to relays.', 'Você pode silenciar notificações neste aparelho. As mensagens não lidas continuam visíveis; nada é enviado aos relays.');
    $('notification-mute-unmute').classList.toggle('hidden', !mute);
    $('notification-mute-dialog').showModal();
  }
  async function setConversationMute(choice) {
    const peer = state.notificationMutePeer;
    if (!state.pubkey || !peer) return;
    try {
      const record = NotificationPrefs.createMuteRecord(state.pubkey, peer, choice);
      await put('settings', record);
      state.notificationMutes.set(peer, record);
      $('notification-mute-dialog').close();
      state.notificationMutePeer = '';
      await renderConversations();
      showToast(localized('Notifications muted on this device.', 'Notificações silenciadas neste aparelho.'));
    } catch (error) { $('notification-mute-status').textContent = error.message || localized('Could not save this local setting.', 'Não foi possível salvar esta configuração local.'); }
  }
  async function clearConversationMute(peer = state.notificationMutePeer) {
    if (!state.pubkey || !peer) return;
    await del('settings', NotificationPrefs.chatMuteId(state.pubkey, peer));
    state.notificationMutes.delete(peer);
    if ($('notification-mute-dialog').open) $('notification-mute-dialog').close();
    state.notificationMutePeer = '';
    await renderConversations();
    showToast(localized('Notifications unmuted on this device.', 'Notificações reativadas neste aparelho.'));
  }
  async function renderNotificationSettings() {
    const button = $('profile-notifications-toggle');
    const status = $('profile-notifications-status');
    if (!state.pubkey) {
      button.disabled = true;
      button.textContent = localized('Unlock to manage notifications', 'Desbloqueie para configurar notificações');
      status.textContent = localized('Unlock this identity first. Notification preferences are saved separately for each identity on this device.', 'Desbloqueie esta identidade primeiro. As preferências ficam salvas separadamente para cada identidade neste aparelho.');
      return;
    }
    if (typeof Notification === 'undefined') {
      button.disabled = true;
      button.textContent = localized('Browser notifications unavailable', 'Notificações do navegador indisponíveis');
      status.textContent = localized('This browser cannot show Property notifications.', 'Este navegador não pode mostrar notificações do Property.');
      return;
    }
    if (Notification.permission === 'denied') {
      state.notificationsEnabled = false;
      button.disabled = true;
      button.textContent = localized('Blocked in browser settings', 'Bloqueadas nas configurações do navegador');
      status.textContent = localized('Property cannot request permission again. Change this site’s permission in your browser settings.', 'O Property não pode pedir permissão novamente. Altere a permissão deste site nas configurações do navegador.');
      return;
    }
    button.disabled = false;
    button.textContent = state.notificationsEnabled
      ? localized('Turn off notifications', 'Desativar notificações')
      : localized('Enable browser notifications', 'Ativar notificações do navegador');
    status.textContent = state.notificationsEnabled
      ? localized('When this app is open but hidden, new messages may show a generic system notice. Message text and contact names are not included. The operating system may suspend the app.', 'Quando este app estiver aberto, mas em segundo plano, novas mensagens podem gerar um aviso genérico do sistema. O texto e o nome do contato não aparecem. O sistema operacional pode suspender o app.')
      : localized('Optional. Property asks for permission only when you tap the button. It uses no push service and never includes message text in a notice.', 'Opcional. O Property pede permissão somente quando você toca no botão. Não usa serviço push e nunca inclui o texto da mensagem no aviso.');
  }
  async function toggleBrowserNotifications() {
    if (typeof Notification === 'undefined') return renderNotificationSettings();
    try {
      if (state.notificationsEnabled) {
        state.notificationsEnabled = false;
        await put('settings', { id: NotificationPrefs.notificationsId(state.pubkey), enabled: false });
      } else {
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') {
          state.notificationsEnabled = false;
          $('profile-notifications-status').textContent = localized('Permission was not granted; Property did not enable notifications.', 'A permissão não foi concedida; o Property não ativou notificações.');
          return renderNotificationSettings();
        }
        await put('settings', { id: NotificationPrefs.notificationsId(state.pubkey), enabled: true });
        state.notificationsEnabled = true;
      }
      await renderNotificationSettings();
    } catch {
      $('profile-notifications-status').textContent = localized('Could not update this local notification setting.', 'Não foi possível atualizar esta configuração local de notificações.');
    }
  }
  function queueAppBadge(count) {
    state.appBadgeQueue = state.appBadgeQueue.catch(() => false).then(() => AppBadge.apply(count, navigator));
    return state.appBadgeQueue;
  }
  function updateAppBadge(conversations) {
    if (!state.pubkey || !state.appBadgeEnabled || !AppBadge.canBadge(navigator)) return;
    const count = AppBadge.unreadCount(conversations);
    if (count === state.appBadgeLastCount) return;
    state.appBadgeLastCount = count;
    const identity = state.pubkey;
    void queueAppBadge(count).then(applied => {
      if (!applied && state.pubkey === identity && state.appBadgeLastCount === count) state.appBadgeLastCount = null;
    });
  }
  async function renderAppBadgeSettings() {
    const button = $('profile-app-badge-toggle');
    const status = $('profile-app-badge-status');
    if (!state.pubkey) {
      button.disabled = true;
      button.textContent = localized('Unlock to manage the app icon badge', 'Desbloqueie para configurar o selo do ícone');
      status.textContent = localized('The choice is saved separately for each identity on this device.', 'A opção fica salva separadamente para cada identidade neste aparelho.');
      return;
    }
    if (!AppBadge.canBadge(navigator)) {
      button.disabled = true;
      button.textContent = localized('App icon badge unavailable', 'Selo do ícone indisponível');
      status.textContent = localized('This browser or installation cannot show an app icon badge. Unread counts remain available inside Property.', 'Este navegador ou instalação não pode mostrar um selo no ícone. As contagens continuam disponíveis dentro do Property.');
      return;
    }
    button.disabled = false;
    button.textContent = state.appBadgeEnabled
      ? localized('Turn off app icon badge', 'Desativar selo do ícone')
      : localized('Show unread count on app icon', 'Mostrar não lidas no ícone');
    status.textContent = state.appBadgeEnabled
      ? localized('The installed app icon shows the local unread total. This never sends a count to relays.', 'O ícone do app instalado mostra o total local de mensagens não lidas. Essa contagem nunca é enviada aos relays.')
      : localized('Optional and off by default. An unread count may be visible on your home screen; enabling this sends nothing to relays.', 'Opcional e desligado por padrão. Uma contagem de não lidas poderá aparecer na tela inicial; ativar não envia nada aos relays.');
  }
  async function toggleAppBadge() {
    if (!state.pubkey || !AppBadge.canBadge(navigator)) return renderAppBadgeSettings();
    try {
      const enabled = !state.appBadgeEnabled;
      await put('settings', { id: AppBadge.preferenceId(state.pubkey), enabled });
      state.appBadgeEnabled = enabled;
      state.appBadgeLastCount = null;
      if (enabled) updateAppBadge(await all('conversations'));
      else {
        state.appBadgeLastCount = 0;
        await queueAppBadge(0);
      }
      await renderAppBadgeSettings();
    } catch {
      $('profile-app-badge-status').textContent = localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.');
    }
  }
  function conversationSearchSnippet(text, query) {
    const plain = RichText.preview(text || '');
    if (plain.length <= 112) return plain;
    const firstMatch = MessageSearch.matchRanges(plain, query)[0];
    const start = Math.max(0, (firstMatch?.[0] ?? 0) - 32);
    const end = Math.min(plain.length, start + 112);
    return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
  }
  async function readConversationSearchMessages() {
    const revision = state.conversationMessageSearchRevision;
    if (state.conversationMessageSearchCache?.revision === revision) return state.conversationMessageSearchCache.messages;
    const messages = (await all('messages')).filter(message => !message.hiddenFromChat);
    if (revision === state.conversationMessageSearchRevision) state.conversationMessageSearchCache = { revision, messages };
    return messages;
  }
  async function renderConversationRow(conversation, messageMatch = null, search = '') {
    const row = document.createElement('div'); row.className = 'conversation-row';
    const button = document.createElement('button'); button.className = `conversation-item${conversation.pubkey === state.activePeer ? ' active' : ''}`; button.type = 'button';
    const [agentAccess, mute] = await Promise.all([
      conversation.group ? Promise.resolve(null) : get('agentAccess', conversation.pubkey),
      currentConversationMute(conversation.pubkey)
    ]);
    const label = conversationLabel(conversation);
    const avatar = document.createElement('span'); avatar.className = `avatar${conversation.group ? ' group-avatar' : ''}`; avatar.textContent = conversation.group ? '◉' : label.slice(0, 1).toUpperCase();
    const info = document.createElement('span'); info.className = 'conversation-preview';
    const title = document.createElement('strong'); title.dataset.userContent = ''; title.textContent = label;
    const titleRow = document.createElement('span'); titleRow.className = 'conversation-title-row'; titleRow.append(title);
    if (conversation.pinned === true) {
      const pin = document.createElement('span'); pin.className = 'conversation-pin-indicator'; pin.textContent = '📌';
      pin.title = localized('Pinned conversation', 'Conversa fixada'); pin.setAttribute('aria-label', pin.title); titleRow.append(pin);
    }
    if (mute) {
      const muted = document.createElement('span'); muted.className = 'conversation-mute-indicator'; muted.textContent = '🔕';
      muted.title = localized('Notifications muted', 'Notificações silenciadas'); muted.setAttribute('aria-label', muted.title); titleRow.append(muted);
    }
    if (!conversation.group && !conversation.agent && !agentAccess) {
      const identityRecord = state.peerIdentityProofs.get(conversation.pubkey);
      const verifiedClaims = window.PropertyIdentityMarks?.verifiedGitHubClaims(conversation.pubkey, identityRecord, state.identityProofChecks) || [];
      const profile = state.peerProfiles.get(conversation.pubkey);
      const verifiedNip05 = window.PropertyIdentityMarks?.verifiedNip05Profile(conversation.pubkey, profile, state.peerNip05Checks) || false;
      if (verifiedClaims.length || verifiedNip05) {
        const marks = document.createElement('span'); marks.className = 'identity-marks'; marks.setAttribute('role', 'img');
        const markLabels = [];
        if (verifiedClaims.length) markLabels.push(localized('GitHub proof checked in this session: the public Gist account and Nostr key match the signed claim. This does not verify a real-world identity.', 'Prova GitHub conferida nesta sessão: a conta da Gist pública e a chave Nostr correspondem à declaração assinada. Isso não verifica uma identidade no mundo real.'));
        if (verifiedNip05) markLabels.push(localized('NIP-05 checked in this session: the identifier in this signed profile mapped to this Nostr key. This does not verify a real-world identity.', 'NIP-05 consultado nesta sessão: o identificador deste perfil assinado apontou para esta chave Nostr. Isso não verifica uma identidade no mundo real.'));
        marks.title = markLabels.join(' ');
        marks.setAttribute('aria-label', marks.title);
        if (verifiedClaims.length) {
          const mark = document.createElement('span'); mark.className = 'identity-mark'; mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true');
          marks.append(mark);
        }
        if (verifiedNip05) {
          const mark = document.createElement('span'); mark.className = 'identity-mark'; mark.textContent = '5'; mark.setAttribute('aria-hidden', 'true');
          marks.append(mark);
        }
        titleRow.append(marks);
      }
    }
    const preview = document.createElement('small'); preview.dataset.userContent = '';
    preview.dataset.conversationPreview = conversation.pubkey;
    preview.dataset.conversationGroup = String(conversation.group === true);
    preview.dataset.hasSearchMatch = String(Boolean(messageMatch));
    preview.dataset.messagePreview = messageMatch
      ? conversationSearchSnippet(messageMatch.text, search)
      : RichText.preview(conversation.lastMessage || (conversation.group ? `${conversation.members?.length || 0} ${window.PropertyI18n?.language === 'pt-BR' ? 'participantes' : 'members'}` : conversation.pubkey.slice(0, 16)));
    const activityPreview = typingActivityPreviewText(conversation.pubkey, conversation.group === true, Boolean(messageMatch));
    preview.textContent = activityPreview || preview.dataset.messagePreview;
    preview.classList.toggle('conversation-activity-preview', Boolean(activityPreview));
    info.append(titleRow);
    if (conversation.agent || agentAccess?.status === 'approved') { const agentBadge = document.createElement('small'); agentBadge.className = 'agent-chat-badge'; agentBadge.textContent = localized('AGENT PROTOCOL', 'PROTOCOLO DE AGENTE'); info.append(agentBadge); }
    if (messageMatch) {
      const matchLabel = document.createElement('small'); matchLabel.className = 'conversation-search-match-label';
      matchLabel.textContent = localized('Message match', 'Correspondência na mensagem'); info.append(matchLabel);
    }
    info.append(preview); button.append(avatar, info);
    const unreadCount = conversationUnreadCount(conversation);
    if (unreadCount > 0) {
      const unreadBadge = document.createElement('span'); unreadBadge.className = 'unread-count-badge';
      unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      unreadBadge.title = unreadCountLabel(unreadCount); unreadBadge.setAttribute('aria-label', unreadCountLabel(unreadCount));
      button.append(unreadBadge);
    }
    button.addEventListener('click', () => selectConversation(conversation.pubkey, messageMatch?.id || ''));
    const details = document.createElement('details'); details.className = 'conversation-folder-actions';
    const summary = document.createElement('summary'); summary.textContent = '···'; summary.setAttribute('aria-label', localized('Conversation options', 'Opções da conversa')); summary.title = summary.getAttribute('aria-label');
    const menu = document.createElement('div'); menu.className = 'folder-actions-menu';
    const muteButton = document.createElement('button'); muteButton.type = 'button';
    muteButton.textContent = mute ? localized('Unmute notifications', 'Reativar notificações') : localized('Mute notifications…', 'Silenciar notificações…');
    muteButton.addEventListener('click', () => {
      details.open = false;
      if (mute) void clearConversationMute(conversation.pubkey).catch(() => showToast(localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.')));
      else void openConversationMuteDialog(conversation.pubkey).catch(() => showToast(localized('Could not open notification settings.', 'Não foi possível abrir as configurações de notificação.')));
    });
    const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = conversation.pinned === true ? localized('Unpin chat', 'Desafixar conversa') : localized('Pin chat', 'Fixar conversa');
    pin.addEventListener('click', () => { details.open = false; void toggleConversationPin(conversation.pubkey); });
    const move = document.createElement('button'); move.type = 'button'; move.textContent = localized('Move to folder…', 'Mover para uma pasta…');
    move.addEventListener('click', () => { details.open = false; openMoveConversationFolder(conversation.pubkey); });
    menu.append(muteButton, pin, move); details.append(summary, menu); row.append(button, details); return row;
  }
  async function toggleConversationPin(pubkey) {
    try {
      const conversation = await get('conversations', pubkey);
      if (!conversation) return;
      const pinned = conversation.pinned !== true;
      await put('conversations', { ...conversation, pinned });
      await renderConversations();
      showToast(pinned ? localized('Chat pinned on this device.', 'Conversa fixada neste aparelho.') : localized('Chat unpinned on this device.', 'Conversa desafixada neste aparelho.'));
    } catch {
      showToast(localized('Could not update the local chat pin.', 'Não foi possível atualizar a fixação local da conversa.'));
    }
  }
  async function renderConversations() {
    const renderSequence = ++state.conversationListRenderSequence;
    const conversations = FolderStore.sortConversations(await all('conversations'));
    if (renderSequence !== state.conversationListRenderSequence) return;
    updateAppBadge(conversations);
    const rawSearch = $('conversation-search').value.trim();
    const search = MessageSearch.foldText(rawSearch).trim();
    const latestMatches = new Map();
    if (search) {
      const matches = MessageSearch.findLatestMatchesByPeer(await readConversationSearchMessages(), rawSearch);
      for (const match of matches) latestMatches.set(match.peer, match);
    }
    if (renderSequence !== state.conversationListRenderSequence) return;
    const list = $('conversation-list');
    list.replaceChildren();
    const filtered = conversations.filter(item => !search
      || MessageSearch.matchesText(`${conversationLabel(item)} ${item.pubkey || ''} ${item.lastMessage || ''}`, rawSearch)
      || latestMatches.has(item.pubkey));
    const config = await loadConversationFolders();
    if (renderSequence !== state.conversationListRenderSequence) return;
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
        const unreadTotal = section.conversations.reduce((total, conversation) => total + conversationUnreadCount(conversation), 0);
        toggle.setAttribute('aria-expanded', String(!section.collapsed)); toggle.setAttribute('aria-label', `${section.collapsed ? localized('Expand', 'Expandir') : localized('Collapse', 'Recolher')} ${name}${unreadTotal > 0 ? `; ${unreadCountLabel(unreadTotal)}` : ''}`);
        toggle.append(arrow, title, count);
        if (unreadTotal > 0) {
          const unread = document.createElement('span'); unread.className = 'unread-count-badge folder-unread-count';
          unread.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
          unread.title = unreadCountLabel(unreadTotal); unread.setAttribute('aria-label', unreadCountLabel(unreadTotal));
          toggle.append(unread);
        }
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
          for (const conversation of section.conversations) {
            const row = await renderConversationRow(conversation, latestMatches.get(conversation.pubkey), rawSearch);
            if (renderSequence !== state.conversationListRenderSequence) return;
            sectionNode.append(row);
          }
        }
      }
      list.append(sectionNode);
    }
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = localized('Your conversations will appear here.', 'Suas conversas aparecerão aqui.'); list.append(empty);
    }
  }
  async function selectConversation(pubkey, jumpToMessageId = '') {
    const previousPeer = state.activePeer;
    const changed = previousPeer !== pubkey;
    if (changed) {
      if (state.voiceRecorder && state.voiceRecorderPeer === previousPeer) cancelVoiceRecording({ notify: true });
      stopLocalPresence();
      clearAllRemotePresence();
      stopLocalTyping();
      cancelMessageEdit();
      clearLinkPreviewDraft();
      closeMessageSearch(false);
      if (previousPeer) await saveChatDraft(previousPeer, $('message-input').value).catch(() => {});
    }
    if (state.shareDraftId && state.shareDraftPeer !== pubkey) { state.shareDraftId = ''; state.shareDraftPeer = ''; }
    if (state.shareFileDraftId && state.shareFileDraftPeer !== pubkey) { state.shareFileDraftId = ''; state.shareFileDraftPeer = ''; state.shareFileDraftFiles = []; }
    state.activePeer = pubkey;
    audioPlayback.setContext(state.activeView, state.activePeer);
    if (changed) {
      const input = $('message-input');
      input.value = '';
      groupMentionPicker?.setDraft('', []);
      resizeMessageInput(input);
      const loadSequence = ++state.draftLoadSequence;
      const savedDraft = await loadChatDraftDetails(pubkey).catch(() => ({ text: '', mentions: [] }));
      if (state.activePeer === pubkey && state.draftLoadSequence === loadSequence && !input.value) {
        groupMentionPicker?.setDraft(savedDraft.text, savedDraft.mentions);
        resizeMessageInput(input);
      }
      if (state.activePeer === pubkey) updateLinkPreviewDraft();
    }
    state.currentConversation = null;
    state.replyingTo = null;
    updateReplyContext();
    $('empty-conversation').classList.add('hidden');
    $('conversation-pane').classList.remove('hidden');
    const conversation = await get('conversations', pubkey);
    await updateConversationHeader(conversation);
    await updateAgentBlockControl(pubkey);
    await renderMessages(pubkey, jumpToMessageId);
    if (window.innerWidth <= 800) {
      setActiveView('messages');
      setMobileConversationListOpen(false, { restoreFocus: true });
    }
    if (state.activeView === 'messages') sendReadReceiptsForVisibleRows();
    if (state.activeView === 'messages') await markConversationRead(pubkey);
    await renderConversations();
    startLocalPresence();
  }
  async function updateAgentBlockControl(pubkey) {
    const conversation = await get('conversations', pubkey);
    const access = conversation?.group ? null : await get('agentAccess', pubkey);
    const agentConversation = conversation?.agent === true || access?.status === 'approved' || access?.status === 'blocked';
    const button = $('agent-block-button');
    const blocked = access?.status === 'blocked';
    state.activeConversationBlocked = blocked;
    const canCall = Boolean(state.secret && conversation && conversation.group !== true &&
      conversation.agent !== true && access?.status !== 'approved' && !blocked &&
      /^[0-9a-f]{64}$/i.test(String(conversation.pubkey || '')) && conversation.pubkey !== state.pubkey);
    $('audio-call-button').hidden = !canCall;
    $('video-call-button').hidden = !canCall;
    button.classList.toggle('hidden', conversation?.group === true || !agentConversation);
    const blockLabel = blocked ? localized('Unblock agent', 'Desbloquear agente') : localized('Block agent', 'Bloquear agente');
    button.setAttribute('aria-label', blockLabel);
    button.title = blockLabel;
    $('message-input').disabled = blocked;
    document.querySelector('#send-form button[type="submit"]').disabled = blocked;
    $('message-input').placeholder = blocked
      ? localized('Agent blocked on this device', 'Agente bloqueado neste aparelho')
      : localized('Write a private message…', 'Escreva uma mensagem privada…');
    renderVoiceComposer();
    updateLinkPreviewDraft();
  }
  async function toggleAgentBlock() {
    const peer = state.activePeer;
    if (!peer) return;
    const current = await get('agentAccess', peer);
    if (current?.status === 'blocked') {
      await del('agentAccess', peer);
      showToast(localized('Agent unblocked on this device.', 'Agente desbloqueado neste aparelho.'));
    } else {
      await put('agentAccess', { pubkey: peer, status: 'blocked', blockedAt: Date.now() });
      showToast(localized('Agent blocked on this device. Conversation history was kept.', 'Agente bloqueado neste aparelho. O histórico foi mantido.'));
    }
    await updateAgentBlockControl(peer);
    await renderConversations();
  }
  function setMessageSearchText(node, value, ranges) {
    node.querySelectorAll('mark.message-search-hit').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    if (!ranges.length || !value) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let offset = 0;
    for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      const start = offset;
      offset += textNode.data.length;
      textNodes.push({ textNode, start, end: offset });
    }
    let rangeIndex = 0;
    for (const { textNode, start, end } of textNodes) {
      while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= start) rangeIndex++;
      const overlaps = [];
      for (let index = rangeIndex; index < ranges.length && ranges[index][0] < end; index++) overlaps.push(ranges[index]);
      if (!overlaps.length || !textNode.parentNode) continue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      const text = textNode.data;
      for (const [rangeStart, rangeEnd] of overlaps) {
        const localStart = Math.max(0, rangeStart - start);
        const localEnd = Math.min(text.length, rangeEnd - start);
        if (localStart > cursor) fragment.append(document.createTextNode(text.slice(cursor, localStart)));
        if (localEnd > cursor) {
          const mark = document.createElement('mark');
          mark.className = 'message-search-hit';
          mark.textContent = text.slice(Math.max(cursor, localStart), localEnd);
          fragment.append(mark);
          cursor = localEnd;
        }
      }
      if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
      textNode.replaceWith(fragment);
    }
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
  function beginReplyToMessage(peer, message) {
    if (peer !== state.activePeer || !nostrEventId(message)) return false;
    state.replyingTo = message;
    updateReplyContext();
    $('message-input').focus();
    return true;
  }
  function bindReplySwipe(bubble, peer, message, eventId) {
    let start = null;
    const isInteractive = target => Boolean(target?.closest?.('a,button,input,textarea,select,[contenteditable="true"],pre,code'));
    const clear = () => { start = null; bubble.style.removeProperty('--reply-swipe-offset'); };
    bubble.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || event.button !== 0 || event.isPrimary === false || isInteractive(event.target)) return;
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType };
    });
    bubble.addEventListener('pointermove', event => {
      if (!start || event.pointerId !== start.pointerId) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (deltaX > 0 && deltaX >= Math.abs(deltaY)) bubble.style.setProperty('--reply-swipe-offset', `${Math.min(deltaX, 40)}px`);
    });
    bubble.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.pointerId) return;
      const shouldReply = ChatGestures.shouldReplySwipe({
        pointerType: start.pointerType, startX: start.x, startY: start.y,
        endX: event.clientX, endY: event.clientY,
        hasEventReference: Boolean(eventId), interactiveTarget: isInteractive(event.target)
      });
      clear();
      if (shouldReply) beginReplyToMessage(peer, message);
    });
    bubble.addEventListener('pointercancel', event => { if (start?.pointerId === event.pointerId) clear(); });
  }
  function scheduleMessageDayRollover(peer) {
    clearTimeout(state.messageDayRolloverTimer);
    const nextDay = MessageDays.nextDayStart(Date.now());
    if (!Number.isFinite(nextDay)) return;
    state.messageDayRolloverTimer = setTimeout(() => {
      state.messageDayRolloverTimer = 0;
      if (state.activePeer === peer) void renderMessages(peer).catch(() => {});
    }, Math.max(1, nextDay - Date.now() + 50));
  }
  function updateMessageScrollButton() {
    const container = $('messages');
    const button = $('message-scroll-bottom');
    const status = $('message-scroll-status');
    if (!container || !button || !status) return;
    const atBottom = MessageScroll.isNearBottom({
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight
    });
    if (atBottom) state.unseenMessageCount = 0;
    button.hidden = atBottom;
    const copy = MessageScroll.buttonCopy(state.unseenMessageCount, window.PropertyI18n?.language || 'en');
    if (button.textContent !== copy.text) button.textContent = copy.text;
    if (button.getAttribute('aria-label') !== copy.ariaLabel) button.setAttribute('aria-label', copy.ariaLabel);
    const announcement = state.unseenMessageCount > 0 ? copy.ariaLabel : '';
    if (status.textContent !== announcement) status.textContent = announcement;
  }
  function renderAudioPlaybackControl({ peer, conversation, message, kind, url, title, duration = 0, downloadName }) {
    const id = kind === 'voice'
      ? `voice:${peer}:${message.id}`
      : `audio:${peer}:${message.fileTransfer.transferId}`;
    const voice = kind === 'voice';
    const titleText = title || localized('Audio', 'Áudio');
    const from = message.direction === 'sent'
      ? localized('You', 'Você')
      : conversation?.group === true && message.senderPubkey
        ? displayName(message.senderPubkey, localized('Group member', 'Participante do grupo'))
        : '';
    const track = {
      id, kind, url, peer, messageId: message.id, title: titleText, from,
      duration: duration / 1000,
      voiceLabel: localized('Voice message', 'Mensagem de voz'),
      audioLabel: localized('Audio', 'Áudio')
    };
    const control = document.createElement('div');
    control.className = 'audio-player-control';
    control.dataset.audioKey = id;
    control.dataset.audioKind = kind;
    control.dataset.audioTitle = titleText;
    control.dataset.duration = String(duration / 1000);
    const play = document.createElement('button');
    play.type = 'button'; play.className = 'audio-playback-button'; play.textContent = '▶';
    play.setAttribute('aria-label', voice
      ? localized('Play voice message', 'Reproduzir mensagem de voz')
      : localized(`Play ${titleText}`, `Reproduzir ${titleText}`));
    play.addEventListener('click', () => { void audioPlayback.toggle(track); });
    const seek = document.createElement('input');
    seek.type = 'range'; seek.className = 'audio-playback-seek'; seek.min = '0'; seek.max = String(Math.max(duration / 1000, 1));
    seek.step = '0.1'; seek.value = String(audioPlayback.getPosition(id)); seek.disabled = true;
    seek.setAttribute('aria-label', localized(`Seek ${titleText}`, `Avançar em ${titleText}`));
    seek.addEventListener('input', () => {
      if (audioPlayback.getState()?.id === id) audioPlayback.seek(Number(seek.value));
    });
    const time = document.createElement('span');
    time.className = 'audio-player-time'; time.textContent = duration > 0 ? `0:00 / ${audioTimeLabel(duration / 1000)}` : '0:00';
    const speed = document.createElement('button');
    speed.type = 'button'; speed.className = 'voice-message-speed'; speed.textContent = `${audioPlayback.getRate()}×`;
    speed.setAttribute('aria-label', `${localized('Playback speed', 'Velocidade de reprodução')} ${audioPlayback.getRate()}×`);
    speed.title = localized('Playback speed', 'Velocidade de reprodução');
    speed.addEventListener('click', () => { audioPlayback.cycleRate(); });
    const download = document.createElement('a');
    download.className = 'audio-player-download'; download.href = url;
    download.download = downloadName || 'property-voice-message.audio';
    download.rel = 'noopener noreferrer'; download.textContent = localized('Download', 'Baixar');
    control.append(play, seek, time, speed, download);
    return control;
  }
  async function prepareDirectFileDownload(peer, transfer, button, status) {
    button.disabled = true;
    status.hidden = false;
    status.textContent = localized('Verifying local file blocks…', 'Verificando os blocos locais do arquivo…');
    try {
      const file = { transferId: transfer.transferId, name: transfer.name, mime: transfer.mime,
        sizeBytes: transfer.sizeBytes, chunkBytes: DirectFileChunks.CHUNK_BYTES,
        totalChunks: transfer.totalChunks, sha256: transfer.sha256 };
      const blob = await directFileStore().createBlob(file);
      if (!blob) throw new Error(localized('Local file integrity verification failed. Download is disabled.', 'A verificação local de integridade falhou. O download foi desativado.'));
      const key = `${peer}:${transfer.transferId}`;
      const previous = state.fileObjectUrls.get(key);
      if (previous) URL.revokeObjectURL(previous);
      state.fileObjectUrls.set(key, URL.createObjectURL(blob));
      await renderMessages(peer);
    } catch (error) {
      status.textContent = error.message || localized('Could not prepare a verified download.', 'Não foi possível preparar um download verificado.');
      button.disabled = false;
    }
  }
  async function renderMessages(peer, jumpToMessageId = '') {
    state.readReceiptObserver?.disconnect();
    state.readReceiptObserver = null;
    state.readReceiptCandidates.clear();
    const entries = (await all('messages')).filter(message => message.peer === peer && !message.hiddenFromChat).sort((a, b) => a.createdAt - b.createdAt);
    const messages = MessageDeletions.coalesceDeletedMessages(FileTransfers.coalesceMessages(entries.filter(message => message.kind !== 7)));
    const activePlayback = audioPlayback.getState();
    if (activePlayback?.peer === peer) {
      const stillExists = messages.some(message =>
        (activePlayback.kind === 'voice' && activePlayback.id === `voice:${peer}:${message.id}` && Boolean(message.voiceMessage?.base64)) ||
        (activePlayback.kind === 'audio' && activePlayback.id === `audio:${peer}:${message.fileTransfer?.transferId}` && message.fileTransfer?.complete === true && !message.fileTransfer?.conflict)
      );
      if (!stillExists) audioPlayback.forget(activePlayback.id);
    }
    const playbackForCleanup = audioPlayback.getState();
    const activeVoiceIds = new Set(messages.filter(message => message.voiceMessage?.base64).map(message => message.id));
    for (const [id, url] of state.voiceObjectUrls) {
      if (activeVoiceIds.has(id)) continue;
      if (playbackForCleanup?.kind === 'voice' && playbackForCleanup.id === `voice:${playbackForCleanup.peer}:${id}`) continue;
      URL.revokeObjectURL(url);
      state.voiceObjectUrls.delete(id);
    }
    const activeFileIds = new Set(messages.filter(message => message.fileTransfer?.complete).map(message => `${peer}:${message.fileTransfer.transferId}`));
    for (const [id, url] of state.fileObjectUrls) {
      if (activeFileIds.has(id)) continue;
      if (playbackForCleanup?.kind === 'audio' && playbackForCleanup.id === `audio:${id}`) continue;
      URL.revokeObjectURL(url);
      state.fileObjectUrls.delete(id);
    }
    const messageByEventId = new Map();
    for (const message of messages) for (const eventId of [...MessageEdits.eventIds(message), ...MessageDeletions.messageEventIds(message)]) messageByEventId.set(eventId, message);
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
    const currentPin = conversation?.agent ? null : await get('settings', messagePinSettingId(peer));
    renderConversationPinBar(peer, messages, currentPin);
    const container = $('messages');
    const samePeer = container.dataset.peer === peer;
    const wasAtBottom = MessageScroll.isNearBottom({ scrollHeight: container.scrollHeight, scrollTop: container.scrollTop, clientHeight: container.clientHeight });
    const previousIds = new Set([...container.querySelectorAll('.message-row')].map(row => row.dataset.messageId).filter(Boolean));
    const previousLatest = Number(container.dataset.latestCreatedAt);
    const update = MessageScroll.classifyUpdate(messages, samePeer ? previousIds : new Set(), samePeer && Number.isFinite(previousLatest) ? previousLatest : null);
    if (!samePeer || update.hasOutgoing) state.unseenMessageCount = 0;
    else if (!wasAtBottom) state.unseenMessageCount += update.incomingCount;
    const bounds = container.getBoundingClientRect();
    const firstVisible = [...container.querySelectorAll('.message-row')].find(row => row.getBoundingClientRect().bottom > bounds.top);
    const anchor = samePeer && firstVisible ? { id: firstVisible.dataset.messageId, top: firstVisible.getBoundingClientRect().top } : null;
    const byEventId = messageByEventId;
    container.replaceChildren();
    scheduleMessageDayRollover(peer);
    if (!messages.length) {
      const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Esta conversa é privada. Envie uma mensagem para começar.'; container.append(empty); container.dataset.peer = peer; delete container.dataset.latestCreatedAt; state.unseenMessageCount = 0; updateMessageScrollButton(); refreshMessageSearch(); updateAudioPlaybackUI(); return;
    }
    let previousDay = NaN;
    let daySection = null;
    for (const message of messages) {
      const messageDay = MessageDays.dayStart(message.createdAt);
      if (!Number.isFinite(messageDay)) { previousDay = NaN; daySection = null; }
      else if (messageDay !== previousDay) {
        daySection = document.createElement('section'); daySection.className = 'message-day-section';
        daySection.dataset.day = String(messageDay);
        const divider = document.createElement('div'); divider.className = 'message-day-divider';
        const time = document.createElement('time'); time.dateTime = MessageDays.dateTime(message.createdAt);
        time.textContent = MessageDays.dayLabel(message.createdAt, Date.now(), window.PropertyI18n?.language || 'en');
        divider.append(time); daySection.append(divider); container.append(daySection);
        previousDay = messageDay;
      }
      const row = document.createElement('div'); row.className = `message-row${message.direction === 'sent' ? ' mine' : ''}`;
      row.dataset.messageId = message.id;
      const eventId = nostrEventId(message);
      if (eventId) row.dataset.nostrEventId = eventId;
      if (message.direction === 'received' && eventId && !message.deleted && !message.fromAgent && !message.agentMessageId) {
        row.dataset.readReceiptId = eventId;
        state.readReceiptCandidates.set(eventId, { peer, message });
      }
      row.dataset.eventIds = [...new Set([...MessageEdits.eventIds(message), ...MessageDeletions.messageEventIds(message)])].join(',');
      if (message.fromAgent) { const author = document.createElement('span'); author.className = 'agent-message-author'; author.textContent = message.agentMessageError ? 'Protocolo de agente · mensagem não reconhecida' : 'Protocolo de agente · identidade Nostr'; row.append(author); }
      if (conversation?.group && message.direction !== 'sent') { const author = document.createElement('span'); author.className = 'group-message-author'; author.textContent = displayName(message.senderPubkey || '', ''); row.append(author); }
      if (message.replyToId) {
        const parent = byEventId.get(message.replyToId);
        const quote = document.createElement('button'); quote.className = 'reply-reference'; quote.type = 'button';
        const author = parent?.direction === 'sent' ? (window.PropertyI18n?.language === 'pt-BR' ? 'Você' : 'You') : displayName(parent?.senderPubkey || peer, conversation?.group ? '' : conversation?.title || '');
        const parentText = parent?.deleted ? localized('Message deleted', 'Mensagem apagada') : parent?.fileTransfer ? `📎 ${parent.fileTransfer.name}${parent.text ? ` · ${parent.text}` : ''}` : RichText.preview(parent?.text || '');
        quote.textContent = parent ? `${author}: ${parentText.slice(0, 120)}` : localized('Reply to a message', 'Responder a uma mensagem');
        const quoteLabel = parent
          ? `${window.PropertyI18n?.language === 'pt-BR' ? 'Ir para a mensagem respondida' : 'Go to replied message'}: ${quote.textContent}`
          : (window.PropertyI18n?.language === 'pt-BR' ? 'A mensagem respondida não está neste histórico local' : 'Replied message is not in this local history');
        quote.setAttribute('aria-label', quoteLabel);
        quote.addEventListener('click', () => {
          const target = [...container.querySelectorAll('.message-row')].find(candidate => candidate.dataset.eventIds?.split(',').includes(message.replyToId));
          if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('message-highlight'); setTimeout(() => target.classList.remove('message-highlight'), 900); }
          else showToast(window.PropertyI18n?.language === 'pt-BR' ? 'A mensagem respondida não está neste histórico local.' : 'The replied message is not in this local history.');
        });
        row.append(quote);
      }
      const bubble = document.createElement('div'); bubble.className = 'message-bubble';
      let voice = message.voiceMessage;
      let audioUrl = state.voiceObjectUrls.get(message.id);
      if (voice && !audioUrl) {
        voice = await VoiceMessages.fromTags([[VoiceMessages.TAG, voice.mime, String(voice.durationMs), String(voice.sizeBytes), voice.sha256, voice.base64]]);
        if (voice) {
          const voiceBytes = VoiceMessages.bytesFromBase64(voice.base64);
          if (voiceBytes) {
            audioUrl = URL.createObjectURL(new Blob([voiceBytes], { type: voice.mime }));
            state.voiceObjectUrls.set(message.id, audioUrl);
          }
        }
      }
      if (message.deleted) {
        bubble.classList.add('message-deleted');
        bubble.textContent = localized('This message was deleted for everyone.', 'Esta mensagem foi apagada para todos.');
      } else if (message.fileTransfer) {
        const transfer = message.fileTransfer;
        const card = document.createElement('div'); card.className = 'file-transfer-card';
        const heading = document.createElement('div'); heading.className = 'file-transfer-heading';
        const icon = document.createElement('span'); icon.className = 'file-transfer-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '▤';
        const name = document.createElement('span'); name.className = 'file-transfer-name'; name.textContent = FileTransfers.safeName(transfer.name);
        heading.append(icon, name); card.append(heading);
        const details = document.createElement('span'); details.className = 'file-transfer-details';
        details.textContent = `${FileTransfers.formatSize(transfer.sizeBytes, window.PropertyI18n?.language || 'en')} · ${transfer.mime}`;
        card.append(details);
        const transferKey = `${peer}:${transfer.transferId}`;
        let fileUrl = state.fileObjectUrls.get(transferKey);
        if (transfer.conflict) {
          const status = document.createElement('span'); status.className = 'file-transfer-status';
          status.textContent = localized('Conflicting file parts were received. Download is disabled.', 'Foram recebidas partes conflitantes. O download está desativado.');
          card.append(status);
        } else if (!transfer.complete) {
          const status = document.createElement('span'); status.className = 'file-transfer-status';
          status.textContent = localized(`Waiting for encrypted parts · ${transfer.receivedChunks} of ${transfer.totalChunks} received`, `Aguardando partes criptografadas · ${transfer.receivedChunks} de ${transfer.totalChunks} recebidas`);
          card.append(status);
        } else {
          if (!fileUrl && transfer.direct) {
            const status = document.createElement('span'); status.className = 'file-transfer-status';
            status.textContent = localized('Stored on this device; integrity is checked before download.', 'Armazenado neste aparelho; a integridade é conferida antes do download.');
            const prepare = document.createElement('button'); prepare.type = 'button'; prepare.className = 'file-transfer-download';
            prepare.textContent = localized('Prepare verified download', 'Preparar download verificado');
            prepare.addEventListener('click', () => { void prepareDirectFileDownload(peer, transfer, prepare, status); });
            card.append(status, prepare);
          } else {
          if (!fileUrl) {
            const assembled = await FileTransfers.assemble(transfer.chunks);
            if (assembled) {
              fileUrl = URL.createObjectURL(new Blob([assembled.bytes], { type: transfer.mime }));
              state.fileObjectUrls.set(transferKey, fileUrl);
            }
          }
          if (fileUrl) {
            const previewKind = FileTransfers.previewKind(transfer.mime);
            if (previewKind === 'image') {
              const openImage = document.createElement('button'); openImage.type = 'button'; openImage.className = 'file-transfer-image-open';
              openImage.setAttribute('aria-label', localized(`View image ${FileTransfers.safeName(transfer.name)}`, `Ver imagem ${FileTransfers.safeName(transfer.name)}`));
              const preview = document.createElement('img'); preview.className = 'file-transfer-image';
              preview.src = fileUrl; preview.alt = ''; preview.loading = 'lazy'; preview.decoding = 'async';
              openImage.append(preview);
              openImage.addEventListener('click', () => state.imageViewer?.open(fileUrl, FileTransfers.safeName(transfer.name), openImage));
              card.append(openImage);
            } else if (previewKind === 'audio') {
              const safeName = FileTransfers.safeName(transfer.name);
              card.append(renderAudioPlaybackControl({ peer, conversation, message, kind: 'audio', url: fileUrl, title: safeName, downloadName: safeName }));
            } else if (previewKind === 'video') {
              const preview = document.createElement('video'); preview.className = 'file-transfer-media';
              preview.controls = true; preview.preload = 'none'; preview.playsInline = true; preview.src = fileUrl;
              preview.setAttribute('aria-label', localized(`Play ${FileTransfers.safeName(transfer.name)}`, `Reproduzir ${FileTransfers.safeName(transfer.name)}`));
              card.append(preview);
            }
            const download = document.createElement('a'); download.className = 'file-transfer-download';
            download.href = fileUrl; download.download = FileTransfers.safeName(transfer.name);
            download.rel = 'noopener noreferrer'; download.textContent = localized('Download verified file', 'Baixar arquivo verificado');
            if (previewKind !== 'audio') card.append(download);
            if (message.direction === 'sent' && !transfer.direct) {
              const confirmedChunks = new Set(entries.filter(entry => entry.fileChunk?.transferId === transfer.transferId && entry.status === 'sent').map(entry => entry.fileChunk.index)).size;
              if (confirmedChunks < transfer.totalChunks) {
                const status = document.createElement('span'); status.className = 'file-transfer-status';
                status.textContent = localized(`${confirmedChunks} of ${transfer.totalChunks} parts were confirmed by inbox relays.`, `${confirmedChunks} de ${transfer.totalChunks} partes foram confirmadas pelos relays de recebimento.`);
                card.append(status);
              }
            }
          } else {
            const status = document.createElement('span'); status.className = 'file-transfer-status';
            status.textContent = localized('File integrity verification failed. Download is disabled.', 'A verificação de integridade do arquivo falhou. O download está desativado.');
            card.append(status);
          }
          }
        }
        bubble.append(card);
        if (message.text) { const caption = document.createElement('div'); caption.className = 'file-transfer-caption'; RichText.renderInto(caption, message.text, window.PropertyI18n?.language || 'en'); bubble.append(caption); }
      } else if (voice && audioUrl && ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'].includes(voice.mime)) {
        const label = document.createElement('span'); label.className = 'voice-message-label';
        label.textContent = `${localized('Voice message', 'Mensagem de voz')} · ${VoiceMessages.formatDuration(voice.durationMs)}`;
        const downloadName = `property-voice-message.${({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' })[voice.mime] || 'audio'}`;
        const controls = renderAudioPlaybackControl({ peer, conversation, message, kind: 'voice', url: audioUrl, title: localized('Voice message', 'Mensagem de voz'), duration: voice.durationMs, downloadName });
        bubble.append(label, controls);
      } else if (!renderPaymentCard(bubble, message.text)) RichText.renderInto(bubble, message.text, window.PropertyI18n?.language || 'en');
      const forwardedLabel = MessageForwards?.label(message.forwarded, window.PropertyI18n?.language || 'en');
      if (forwardedLabel) {
        const forwarded = document.createElement('span'); forwarded.className = 'message-forwarded';
        forwarded.textContent = forwardedLabel; forwarded.setAttribute('aria-label', forwardedLabel); bubble.prepend(forwarded);
      }
      const safePreview = LinkPreview?.normalizePreview(message.linkPreview, message.text);
      if (safePreview) bubble.append(renderLinkPreview(safePreview));
      const locationCard = LocationCards?.render(RichText.locationText(message.text), window.PropertyI18n?.language || 'en');
      bindReplySwipe(bubble, peer, message, eventId);
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
      const readers = message.direction === 'sent' && eventId && !message.fromAgent && !message.agentMessageId
        ? [...(state.readReceipts.get(eventId.toLowerCase()) || [])] : [];
      if (readers.length) {
        const seen = document.createElement('span'); seen.className = 'message-read-receipt';
        const names = readers.map(pubkey => displayName(pubkey, ''));
        seen.textContent = conversation?.group
          ? localized(`Seen by ${names.join(', ')}`, `Visto por ${names.join(', ')}`)
          : localized('Seen', 'Visualizada');
        seen.setAttribute('aria-label', seen.textContent);
        meta.append(seen);
      }
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const reply = document.createElement('button'); reply.type = 'button'; reply.className = 'message-reply'; reply.textContent = localized('Reply', 'Responder'); reply.disabled = !eventId || message.deleted; reply.title = message.deleted ? localized('Deleted messages cannot be replied to.', 'Não é possível responder a mensagens apagadas.') : eventId ? localized('Reply to this message', 'Responder a esta mensagem') : localized('This older message has no Nostr event reference', 'Esta mensagem antiga não tem referência de evento Nostr');
      reply.addEventListener('click', () => {
        if (!eventId) { showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem antiga não tem uma referência de evento Nostr.' : 'This older message has no Nostr event reference.'); return; }
        beginReplyToMessage(peer, message);
      });
      const react = document.createElement('button'); react.type = 'button'; react.className = 'message-react'; react.textContent = localized('React', 'Reagir'); react.disabled = !eventId || message.deleted; react.setAttribute('aria-label', localized('React to this message', 'Reagir a esta mensagem')); react.title = localized('Choose a reaction', 'Escolher uma reação');
      const picker = document.createElement('div'); picker.id = `property-reaction-picker-${++reactionPickerSequence}`; picker.className = 'message-reaction-picker'; picker.hidden = true; picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', 'Choose a reaction');
      react.setAttribute('aria-controls', `${picker.id} reaction-emoji-dialog`); react.setAttribute('aria-expanded', 'false');
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
      const moreReactions = document.createElement('button'); moreReactions.type = 'button'; moreReactions.className = 'message-reaction-more'; moreReactions.textContent = 'More emoji…';
      moreReactions.addEventListener('click', () => {
        picker.hidden = true;
        react.setAttribute('aria-expanded', 'false');
        emojiPicker?.openForReaction({ trigger: react, onPick: emoji => sendPrivateReaction(peer, message, emoji).catch(error => showToast(error.message || 'Could not send reaction.')) });
      });
      picker.append(moreReactions);
      react.addEventListener('click', () => {
        picker.hidden = !picker.hidden;
        react.setAttribute('aria-expanded', String(!picker.hidden));
      });
      const menu = document.createElement('details'); menu.className = 'message-menu';
      const menuButton = document.createElement('summary'); menuButton.textContent = '⋮'; menuButton.setAttribute('aria-label', 'More message actions');
      const menuItems = document.createElement('div'); menuItems.className = 'message-menu-items';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = message.saved ? localized('Remove saved message', 'Remover dos salvos') : localized('Save message', 'Salvar mensagem'); save.disabled = Boolean(message.deleted);
      save.addEventListener('click', () => { menu.open = false; setMessageSaved(peer, message, !message.saved).catch(error => showToast(error.message || 'Could not update saved messages.')); });
      if (eventId && !message.deleted && message.kind !== 7 && !message.fromAgent && !message.agentMessageId && !conversation?.agent) {
        const isPinned = currentPin?.active === true && MessageDeletions.messageEventIds(message).includes(currentPin.targetEventId);
        const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = localized(isPinned ? 'Unpin message' : 'Pin message', isPinned ? 'Desafixar mensagem' : 'Fixar mensagem');
        pin.addEventListener('click', () => {
          menu.open = false;
          sendConversationPin(peer, eventId, isPinned ? 'unpin' : 'pin').catch(error => showToast(error.message || localized('Could not update the pinned message.', 'Não foi possível atualizar a mensagem fixada.')));
        });
        menuItems.append(pin);
      }
      if (message.direction === 'sent' && !message.voiceMessage && !message.fileTransfer && !message.fromAgent && !message.agentMessageId && message.kind !== 7 && !message.deleted && ['sent', 'partial'].includes(message.status) && eventId) {
        const editAction = document.createElement('button'); editAction.type = 'button'; editAction.textContent = localized('Edit message', 'Editar mensagem');
        editAction.addEventListener('click', () => { menu.open = false; startMessageEdit(peer, message); });
        menuItems.append(editAction);
      }
      if (message.direction === 'sent' && message.senderPubkey?.toLowerCase() === state.pubkey && !message.fromAgent && !message.agentMessageId && message.kind !== 7 && !message.deleted && ['sent', 'partial'].includes(message.status) && eventId && !conversation?.agent) {
        const deleteForEveryone = document.createElement('button'); deleteForEveryone.type = 'button'; deleteForEveryone.className = 'danger-text';
        deleteForEveryone.textContent = localized('Delete for everyone', 'Apagar para todos');
        deleteForEveryone.addEventListener('click', () => {
          menu.open = false;
          openMessageDeletionConfirmation(peer, message);
        });
        menuItems.append(deleteForEveryone);
      }
      const canForward = typeof message.text === 'string' && Boolean(message.text.trim()) && !message.voiceMessage && !message.fileTransfer && message.kind !== 7 && !message.deleted && !message.fromAgent && !message.agentMessageId;
      const forward = document.createElement('button'); forward.type = 'button'; forward.textContent = localized('Forward', 'Encaminhar'); forward.disabled = !canForward;
      forward.addEventListener('click', () => { menu.open = false; openForwardDialog(message).catch(error => showToast(error.message || 'Could not open forwarding.')); });
      const details = document.createElement('button'); details.type = 'button'; details.textContent = localized('Details', 'Detalhes');
      details.addEventListener('click', () => {
        menu.open = false;
        openMessageDetails(peer, message).catch(error => showToast(error.message || localized('Could not open message details.', 'Não foi possível abrir os detalhes da mensagem.')));
      });
      menuItems.append(save, details, forward); menu.append(menuButton, menuItems);
      actions.append(reply, react, picker, menu); row.append(bubble); if (locationCard) row.append(locationCard); if (reactionSummary) row.append(reactionSummary); row.append(meta, actions); (daySection || container).append(row);
    }
    container.dataset.peer = peer;
    if (Number.isFinite(update.latestCreatedAt)) container.dataset.latestCreatedAt = String(update.latestCreatedAt);
    else delete container.dataset.latestCreatedAt;
    if (!samePeer || wasAtBottom || update.hasOutgoing || !anchor) container.scrollTop = container.scrollHeight;
    else {
      const restored = [...container.querySelectorAll('.message-row')].find(row => row.dataset.messageId === anchor.id);
      if (restored) container.scrollTop += restored.getBoundingClientRect().top - anchor.top;
    }
    if (jumpToMessageId) {
      const target = [...container.querySelectorAll('.message-row')].find(row => row.dataset.messageId === jumpToMessageId);
      if (target) {
        target.classList.add('conversation-search-target');
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'center' });
      }
    }
    observeReadReceiptRows(container);
    sendReadReceiptsForVisibleRows();
    updateMessageScrollButton();
    refreshMessageSearch();
    updateAudioPlaybackUI();
  }
  function openMessageDeletionConfirmation(peer, message) {
    const dialog = $('message-delete-dialog');
    if (!dialog || !state.pubkey || !['sent', 'partial'].includes(message?.status)) return;
    state.pendingMessageDeletion = {
      peer,
      identity: state.pubkey,
      message: {
        peer, id: message.id, nostrEventId: message.nostrEventId, editRootId: message.editRootId,
        previousEventIds: Array.isArray(message.previousEventIds) ? [...message.previousEventIds] : [],
        deletedEventIds: Array.isArray(message.deletedEventIds) ? [...message.deletedEventIds] : [],
        fileTransfer: message.fileTransfer ? { eventIds: Array.isArray(message.fileTransfer.eventIds) ? [...message.fileTransfer.eventIds] : [] } : undefined,
        senderPubkey: message.senderPubkey, direction: message.direction, status: message.status,
        kind: message.kind, deleted: message.deleted, fromAgent: message.fromAgent, agentMessageId: message.agentMessageId
      }
    };
    $('message-delete-copy').textContent = localized(
      'Property will send an end-to-end encrypted deletion request. Relay acceptance does not prove that every device processed it. Offline devices, screenshots, exports, and other copies may remain; payments cannot be reversed.',
      'O Property enviará um pedido de exclusão criptografado de ponta a ponta. A confirmação do relay não prova que todos os aparelhos o processaram. Aparelhos offline, capturas de tela, exportações e outras cópias podem permanecer; pagamentos não são revertidos.'
    );
    $('message-delete-confirm').disabled = false;
    if (!dialog.open) dialog.showModal();
  }
  function renderConversationPinBar(peer, messages, pinRecord) {
    const bar = $('conversation-pin-bar');
    const jump = $('conversation-pin-jump');
    const label = $('conversation-pin-label');
    const unpin = $('conversation-pin-unpin');
    if (!bar || !jump || !label || !unpin) return;
    const active = pinRecord?.active === true && /^[0-9a-f]{64}$/i.test(pinRecord.targetEventId || '');
    if (!active) { bar.hidden = true; return; }
    const pinned = messages.find(message => MessageDeletions.messageEventIds(message).includes(pinRecord.targetEventId));
    bar.hidden = Boolean(pinned?.deleted);
    if (bar.hidden) return;
    const preview = pinned
      ? pinned.fileTransfer?.name ? `📎 ${FileTransfers.safeName(pinned.fileTransfer.name)}`
        : pinned.voiceMessage ? localized('Voice message', 'Mensagem de voz')
          : String(pinned.text || '').trim().slice(0, 120) || localized('Pinned item', 'Item fixado')
      : localized('Pinned message is not in this device’s local history.', 'A mensagem fixada não está no histórico local deste aparelho.');
    label.textContent = preview;
    jump.setAttribute('aria-label', `${localized('Pinned message', 'Mensagem fixada')}: ${preview}`);
    jump.title = preview;
    jump.onclick = () => {
      if (state.activePeer !== peer) return;
      const target = [...$('messages').querySelectorAll('.message-row')].find(row => row.dataset.eventIds?.split(',').includes(pinRecord.targetEventId));
      if (!target) { showToast(localized('The pinned message is not in this device’s local history.', 'A mensagem fixada não está no histórico local deste aparelho.')); return; }
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('message-highlight');
      setTimeout(() => target.classList.remove('message-highlight'), 900);
    };
    unpin.onclick = () => {
      unpin.disabled = true;
      sendConversationPin(peer, pinRecord.targetEventId, 'unpin')
        .catch(error => showToast(error.message || localized('Could not remove the pinned message.', 'Não foi possível remover a mensagem fixada.')))
        .finally(() => { unpin.disabled = false; });
    };
  }
  function nostrEventId(message) {
    if (typeof message?.nostrEventId === 'string' && /^[0-9a-f]{64}$/i.test(message.nostrEventId)) return message.nostrEventId;
    return typeof message?.id === 'string' && /^[0-9a-f]{64}$/i.test(message.id) ? message.id : '';
  }
  async function openMessageDetails(peer, message) {
    const conversation = await get('conversations', peer);
    const eventId = nostrEventId(message);
    const senderPubkey = message.senderPubkey || (message.direction === 'sent' ? state.pubkey : conversation?.group ? '' : peer);
    const timestamp = Number.isFinite(message.createdAt) ? new Date(message.createdAt) : null;
    const relayStatus = new Map([
      ['pending', localized('No planned encrypted envelope has a relay acknowledgement yet.', 'Nenhum envelope criptografado planejado recebeu confirmação de relay ainda.')],
      ['sent', localized('A relay acknowledged each planned envelope. This does not confirm that the recipient read it.', 'Um relay confirmou cada envelope planejado. Isso não confirma que a pessoa destinatária leu a mensagem.')],
      ['partial', localized('Some planned encrypted envelopes received relay acknowledgements; others did not.', 'Alguns envelopes criptografados receberam confirmação de relay; outros não.')],
      ['delivered', localized('This encrypted message reached this device through a relay.', 'Esta mensagem criptografada chegou a este aparelho por um relay.')]
    ]).get(message.status) || localized('No relay status is available for this local record.', 'Não há estado de relay disponível para este registro local.');
    const details = {
      format: 'Property NIP-17 message metadata v1',
      eventReferenceType: 'inner rumor reference; relays store encrypted gift-wrap events',
      rumorId: eventId || null,
      senderPubkey: senderPubkey || null,
      direction: message.direction === 'sent' ? 'sent' : 'received',
      conversationType: conversation?.group === true ? 'private-group' : 'one-to-one',
      createdAt: timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null,
      localRelayStatus: message.status || 'unknown',
      replyToRumorId: typeof message.replyToId === 'string' && /^[0-9a-f]{64}$/i.test(message.replyToId) ? message.replyToId.toLowerCase() : null,
      editSequence: Number.isSafeInteger(message.editSeq) && message.editSeq > 0 ? message.editSeq : null
    };
    state.messageDetailsPayload = JSON.stringify(details, null, 2);
    const fields = $('message-details-fields');
    fields.replaceChildren();
    const addField = (label, value, code = false) => {
      if (!value) return;
      const row = document.createElement('div');
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd');
      if (code) { const valueNode = document.createElement('code'); valueNode.textContent = value; description.append(valueNode); }
      else description.textContent = value;
      row.append(term, description); fields.append(row);
    };
    addField(localized('Conversation', 'Conversa'), conversation?.group === true ? localized('Private group', 'Grupo privado') : localized('One-to-one private chat', 'Conversa privada individual'));
    addField(localized('Direction', 'Direção'), message.direction === 'sent' ? localized('Sent by you', 'Enviada por você') : localized('Received', 'Recebida'));
    addField(localized('Original timestamp', 'Data e hora original'), timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString(window.PropertyI18n?.locale() || undefined) : '—');
    addField(localized('Sender public key', 'Chave pública de quem enviou'), senderPubkey, true);
    addField(localized('NIP-17 rumor reference', 'Referência do rumor NIP-17'), eventId, true);
    addField(localized('Reply reference', 'Referência da resposta'), message.replyToId, true);
    addField(localized('Relay status', 'Estado nos relays'), relayStatus);
    if (details.editSequence) addField(localized('Edit sequence', 'Sequência da edição'), String(details.editSequence));
    $('message-details-dialog').showModal();
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
    groupMentionPicker?.setDraft(state.editingDraft, state.editingDraftMentions);
    state.replyingTo = state.editingReplyingTo;
    state.editingMessage = null;
    state.editingDraft = '';
    state.editingDraftMentions = [];
    state.editingReplyingTo = null;
    updateEditContext();
    updateReplyContext();
    clearLinkPreviewDraft();
    resizeMessageInput(input);
    if (restoreFocus) input.focus();
  }
  function startMessageEdit(peer, message) {
    if (peer !== state.activePeer || message.direction !== 'sent' || message.kind === 7 || message.fromAgent || message.agentMessageId || message.deleted || !nostrEventId(message) || !['sent', 'partial'].includes(message.status)) return;
    if (state.editingMessage) cancelMessageEdit();
    const input = $('message-input');
    state.editingDraft = input.value;
    state.editingDraftMentions = groupMentionPicker?.getMentions() || [];
    state.editingReplyingTo = state.replyingTo;
    state.editingMessage = { peer, message: { ...message } };
    clearLinkPreviewDraft();
    state.replyingTo = null;
    updateReplyContext();
    updateEditContext();
    groupMentionPicker?.setDraft(message.text, message.mentions || []);
    resizeMessageInput(input);
    updateLinkPreviewDraft();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  async function editLastMessage() {
    const peer = state.activePeer;
    if (!peer || state.editingMessage || state.loadingLastMessageEdit) return;
    state.loadingLastMessageEdit = true;
    try {
      const message = (await all('messages'))
        .filter(item => item.peer === peer && !item.hiddenFromChat && item.direction === 'sent' && item.kind !== 7 && !item.fromAgent && !item.agentMessageId && !item.deleted && nostrEventId(item) && ['sent', 'partial'].includes(item.status))
        .sort((a, b) => b.createdAt - a.createdAt || String(b.id).localeCompare(String(a.id)))[0];
      if (message && state.activePeer === peer && !state.editingMessage) startMessageEdit(peer, message);
    } finally { state.loadingLastMessageEdit = false; }
  }
  async function editPrivateMessage(peer, message, text, mentionTokens = []) {
    const updatedText = text.trim();
    if (!updatedText || updatedText.length > 4000) throw new Error(localized('Messages must contain 1–4,000 characters.', 'As mensagens devem ter de 1 a 4.000 caracteres.'));
    if (peer !== state.activePeer || state.editingMessage?.message.id !== message.id) throw new Error(localized('This edit is no longer active.', 'Esta edição não está mais ativa.'));
    const conversation = await get('conversations', peer);
    if (!conversation || message.direction !== 'sent' || message.fromAgent || message.agentMessageId || message.kind === 7 || message.deleted || !['sent', 'partial'].includes(message.status)) {
      throw new Error(localized('Only your delivered private messages can be edited.', 'Só é possível editar suas mensagens privadas já entregues.'));
    }
    const group = conversation.group === true;
    const mentions = group ? GroupMentions.validMentions(updatedText, mentionTokens) : [];
    if (group && mentions.length !== mentionTokens.length) throw new TypeError(localized('A group mention changed while editing. Select the member again before saving.', 'Uma menção do grupo mudou durante a edição. Selecione a pessoa novamente antes de salvar.'));
    const previousMentions = group ? GroupMentions.validMentions(message.text, message.mentions || []) : [];
    if (updatedText === message.text && JSON.stringify(mentions) === JSON.stringify(previousMentions)) return { unchanged: true };
    if (!(await requestSecretSendConfirmation(updatedText, peer))) return { cancelled: true };
    if (peer !== state.activePeer || state.editingMessage?.message.id !== message.id) throw new Error(localized('This edit is no longer active.', 'Esta edição não está mais ativa.'));
    const wireText = group ? GroupMentions.toWireText(updatedText, mentions, N.nip19.npubEncode) : updatedText;
    const rootId = message.editRootId || nostrEventId(message);
    if (!rootId) throw new Error(localized('This message has no Nostr event reference and cannot be edited.', 'Esta mensagem não tem uma referência de evento Nostr e não pode ser editada.'));
    const members = conversation.group === true
      ? [...new Set(conversation.members || [])].sort()
      : [state.pubkey, peer].sort();
    const relayLists = Object.create(null);
    for (const member of members) relayLists[member] = await resolveInboxRelaysFor(member);
    if (!deferRender) await connectAllRelays();
    const edit = MessageEdits.createNip17Edit({
      nostr: N, secret: state.secret, selfPubkey: state.pubkey, participants: members,
      rootId, priorEventIds: MessageEdits.eventIds(message), sequence: (message.editSeq || 0) + 1,
      createdAt: Math.floor((message.createdAt || Date.now()) / 1000),
      replyToId: message.replyToId || '', subject: conversation.group ? conversation.title || '' : '', text: wireText,
      maxTextLength: group ? GroupMentions.MAX_WIRE_CHARS : 4000
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
      ...message, text: updatedText, ...(group ? { mentions } : {}), linkPreview: null, senderPubkey: state.pubkey, direction: 'sent',
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
  async function sendPrivateMessage(peer, text, replyTo = null, { quiet = false, secretConfirmed = false, mentionTokens = [], forwardedHops = null, voiceRecording = null, fileChunk = null, deferRender = false, chessPayload = null } = {}, linkPreview = null) {
    if (chessPayload !== null) {
      if (!secretConfirmed || !chessPayload || typeof chessPayload !== 'object' || Array.isArray(chessPayload) || chessPayload.p !== 'property-chess' || !Number.isInteger(chessPayload.v) || typeof chessPayload.k !== 'string') throw new TypeError('Invalid Property Chess message.');
      if (replyTo || forwardedHops !== null || voiceRecording || fileChunk) throw new TypeError('Property Chess messages cannot be combined with chat attachments or replies.');
      if (enc.encode(JSON.stringify(chessPayload)).byteLength > 16384) throw new TypeError('Property Chess message is too large.');
    }
    if (!secretConfirmed && !(await requestSecretSendConfirmation(text, peer))) {
      return { savedLocally: false, cancelled: true, confirmedEnvelopeCount: 0, requiredEnvelopeCount: 0 };
    }
    let fileChunkTag = null;
    if (fileChunk) {
      fileChunkTag = fileChunk.tag;
      const verified = await FileTransfers.fromTags([fileChunkTag]);
      if (!verified || verified.transferId !== fileChunk.transferId || verified.index !== fileChunk.index) throw new Error(localized('This file part failed its local integrity check. Select the file again.', 'Esta parte do arquivo falhou na verificação local. Selecione o arquivo novamente.'));
      fileChunk = verified;
    }
    if ((await get('conversations', peer))?.group === true) {
      if (chessPayload !== null) throw new Error('Property Chess is available only in direct conversations.');
      return sendPrivateGroupMessage(peer, text, replyTo, { quiet, secretConfirmed: true, linkPreview, mentionTokens, forwardedHops, voiceRecording, fileChunk, fileChunkTag, deferRender });
    }
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
    if (chessPayload !== null && agentConversation) throw new Error('Property Chess is available only in direct conversations between people.');
    if (voiceRecording && agentConversation) throw new Error(localized('Voice notes are not available in agent-protocol chats.', 'Mensagens de voz não estão disponíveis em conversas de protocolo de agente.'));
    if (fileChunk && agentConversation) throw new Error(localized('File attachments are not available in agent-protocol chats.', 'Anexos de arquivo não estão disponíveis em conversas de protocolo de agente.'));
    const agentMessageId = agentConversation ? AgentMessages.createMessageId() : null;
    const isChessMessage = chessPayload !== null;
    const messageText = isChessMessage ? localized('Chess game update', 'Atualização da partida de xadrez') : fileChunk ? (fileChunk.caption || '') : text;
    const wireContent = agentConversation ? AgentMessages.encodeEnvelope({
      conversationId: await AgentMessages.conversationId(state.pubkey, peer),
      messageId: agentMessageId,
      inReplyTo: replyTo ? (replyTo.agentMessageId || nostrEventId(replyTo)) : null,
      body: text,
    }) : isChessMessage ? JSON.stringify(chessPayload) : fileChunk ? fileChunkBody(fileChunk) : text;
    const replyEventId = replyTo ? nostrEventId(replyTo) : '';
    if (replyTo && !replyEventId) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem não pode ser citada como resposta Nostr.' : 'This message cannot be referenced as a Nostr reply.');
    const rumorTags = [['p', peer]];
    if (replyEventId) rumorTags.push(['e', replyEventId, '', 'reply']);
    if (isChessMessage) rumorTags.push(['app', 'property-chess', '1']);
    const previewTag = fileChunk || isChessMessage ? null : LinkPreview?.toTag(linkPreview, text);
    if (previewTag) rumorTags.push(previewTag);
    if (forwardedHops !== null) rumorTags.push(MessageForwards.toTag(forwardedHops));
    const voiceTag = voiceRecording ? await VoiceMessages.createTag(voiceRecording) : null;
    if (voiceTag) rumorTags.push(voiceTag);
    if (fileChunk) rumorTags.push(fileChunkTag);
    const voicePayload = voiceTag ? await VoiceMessages.fromTags([voiceTag]) : null;
    if (voiceTag && !voicePayload) throw new Error(localized('The voice recording failed its local integrity check.', 'A gravação de voz não passou pela verificação local de integridade.'));
    // Make one rumor and wrap that exact event for both participants, so NIP-17 reply IDs match on each device.
    const sentRumor = N.nip59.createRumor({ kind: 14, tags: rumorTags, content: wireContent }, state.secret);
    const wraps = [state.pubkey, peer].map(recipient => N.nip59.createWrap(N.nip59.createSeal(sentRumor, state.secret, recipient), recipient));
    if (voiceTag && wraps.some(event => VoiceMessages.relayEventBytes(event) > VoiceMessages.MAX_RELAY_EVENT_BYTES)) throw new Error(localized('This voice recording would exceed the safe Nostr relay message size. Record a shorter message.', 'Esta gravação excederia o tamanho seguro para relays Nostr. Grave uma mensagem mais curta.'));
    if (fileChunk && wraps.some(event => FileTransfers.relayEventBytes(event) > FileTransfers.MAX_RELAY_EVENT_BYTES)) throw new Error(localized('This file part exceeds the safe Nostr relay message size. Choose a smaller file.', 'Esta parte do arquivo excede o tamanho seguro para relays Nostr. Escolha um arquivo menor.'));
    const routePlan = Routing.planGiftWraps(wraps, state.pubkey, peer, state.inboxRelays, peerRelays, N.verifyEvent);
    if (!routePlan.ready) throw new Error('A mensagem NIP-17 não tem os dois envelopes válidos ou as listas de recebimento necessárias.');
    if (!Array.isArray(wraps) || wraps.length < 2 || wraps.some(event => event.kind !== 1059)) throw new Error('A biblioteca não gerou envelopes NIP-17 válidos.');
    const id = agentConversation ? `agent-out:${peer}:${agentMessageId}` : `${state.pubkey}:${crypto.randomUUID()}`;
    const message = { id, peer, text: messageText, ...(isChessMessage ? { appId: 'property-chess', appPayload: chessPayload, hiddenFromChat: true } : {}), ...(voicePayload ? { voiceMessage: voicePayload } : {}), ...(fileChunk ? { fileChunk } : {}), createdAt: Date.now(), direction: 'sent', status: 'pending', nostrEventId: sentRumor.id, linkPreview: previewTag ? linkPreview : null, ...(forwardedHops !== null ? { forwarded: forwardedHops } : {}), ...(replyEventId ? { replyToId: replyEventId } : {}), ...(agentConversation ? { agentMessageId, inReplyTo: replyTo ? (replyTo.agentMessageId || replyEventId) : null } : {}) };
    await put('messages', message);
    await put('conversations', { ...previous, ...(agentConversation ? { agent: true } : {}), lastMessage: isChessMessage ? localized('♟ Chess game', '♟ Partida de xadrez') : fileChunk ? `📎 ${fileChunk.name}` : text, lastAt: message.createdAt });
    if (!deferRender && state.activePeer === peer) await renderMessages(peer);
    if (!deferRender) await renderConversations();
    let sent = 0;
    const requiredEnvelopes = routePlan.deliveries.length;
    for (const delivery of routePlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) sent += 1; }
      catch { /* Keep the encrypted local copy and attempt the remaining envelope. */ }
    }
    message.status = sent === requiredEnvelopes ? 'sent' : sent > 0 ? 'partial' : 'pending';
    await put('messages', message);
    if (!deferRender && state.activePeer === peer) await renderMessages(peer);
    if (!quiet && !sent) showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Mensagem cifrada salva neste aparelho; nenhum relay confirmou o envio.' : 'Encrypted message saved on this device; no relay confirmed it.');
    else if (!quiet && sent < requiredEnvelopes) showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Entrega parcial: alguns envelopes NIP-17 não foram confirmados pelos relays.' : 'Partial delivery: some NIP-17 envelopes were not confirmed by relays.');
    return { savedLocally: true, confirmedEnvelopeCount: sent, requiredEnvelopeCount: requiredEnvelopes };
  }
  async function sendPrivateGroupMessage(peer, text, replyTo = null, { quiet = false, linkPreview = null, mentionTokens = [], forwardedHops = null, voiceRecording = null, fileChunk = null, fileChunkTag = null, deferRender = false } = {}) {
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
    const mentions = fileChunk ? [] : GroupMentions.validMentions(text, mentionTokens);
    if (mentions.length !== mentionTokens.length) throw new TypeError(localized('A group mention changed in the draft. Select the member again before sending.', 'Uma menção do grupo mudou no rascunho. Selecione a pessoa novamente antes de enviar.'));
    const wireText = fileChunk ? fileChunkBody(fileChunk) : GroupMentions.toWireText(text, mentions, N.nip19.npubEncode);
    const rumorTags = members.filter(member => member !== state.pubkey).map(member => ['p', member]);
    if (title) rumorTags.push(['subject', title]);
    if (replyEventId) rumorTags.push(['e', replyEventId, '', 'reply']);
    const previewTag = LinkPreview?.toTag(linkPreview, text);
    if (previewTag) rumorTags.push(previewTag);
    if (forwardedHops !== null) rumorTags.push(MessageForwards.toTag(forwardedHops));
    const voiceTag = voiceRecording ? await VoiceMessages.createTag(voiceRecording) : null;
    if (voiceTag) rumorTags.push(voiceTag);
    if (fileChunk) {
      const verified = await FileTransfers.fromTags([fileChunkTag]);
      if (!verified || verified.transferId !== fileChunk.transferId || verified.index !== fileChunk.index) throw new Error(localized('This file part failed its local integrity check. Select the file again.', 'Esta parte do arquivo falhou na verificação local. Selecione o arquivo novamente.'));
      rumorTags.push(fileChunkTag);
    }
    const voicePayload = voiceTag ? await VoiceMessages.fromTags([voiceTag]) : null;
    if (voiceTag && !voicePayload) throw new Error(localized('The voice recording failed its local integrity check.', 'A gravação de voz não passou pela verificação local de integridade.'));
    const sentRumor = N.nip59.createRumor({ kind: 14, tags: rumorTags, content: wireText }, state.secret);
    const wraps = members.map(recipient => N.nip59.createWrap(N.nip59.createSeal(sentRumor, state.secret, recipient), recipient));
    if (voiceTag && wraps.some(event => VoiceMessages.relayEventBytes(event) > VoiceMessages.MAX_RELAY_EVENT_BYTES)) throw new Error(localized('This voice recording would exceed the safe Nostr relay message size. Record a shorter message.', 'Esta gravação excederia o tamanho seguro para relays Nostr. Grave uma mensagem mais curta.'));
    if (fileChunk && wraps.some(event => FileTransfers.relayEventBytes(event) > FileTransfers.MAX_RELAY_EVENT_BYTES)) throw new Error(localized('This file part exceeds the safe Nostr relay message size. Choose a smaller file.', 'Esta parte do arquivo excede o tamanho seguro para relays Nostr. Escolha um arquivo menor.'));
    const routePlan = Routing.planGroupGiftWraps(wraps, members, relayLists, N.verifyEvent);
    if (!routePlan.ready) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Não foi possível preparar os envelopes do grupo. Confira as listas de recebimento NIP-17.' : 'Could not prepare the group envelopes. Check each participant’s NIP-17 inbox list.');
    const message = { id: `${state.pubkey}:${crypto.randomUUID()}`, peer, text: fileChunk ? (fileChunk.caption || '') : text, ...(voicePayload ? { voiceMessage: voicePayload } : {}), ...(fileChunk ? { fileChunk } : {}), ...(mentions.length ? { mentions } : {}), senderPubkey: state.pubkey, createdAt: Date.now(), direction: 'sent', status: 'pending', nostrEventId: sentRumor.id, linkPreview: previewTag ? linkPreview : null, ...(forwardedHops !== null ? { forwarded: forwardedHops } : {}), ...(replyEventId ? { replyToId: replyEventId } : {}) };
    await put('messages', message);
    await put('conversations', { ...previous, group: true, members, lastMessage: fileChunk ? `📎 ${fileChunk.name}` : text, lastAt: message.createdAt });
    if (!deferRender && state.activePeer === peer) await renderMessages(peer);
    if (!deferRender) await renderConversations();
    let sent = 0;
    for (const delivery of routePlan.deliveries) {
      try { if (await publishToRelays(delivery.event, delivery.relays)) sent += 1; }
      catch { /* Keep local copy and try every other recipient envelope. */ }
    }
    message.status = sent === routePlan.deliveries.length ? 'sent' : sent > 0 ? 'partial' : 'pending';
    await put('messages', message);
    if (!deferRender && state.activePeer === peer) await renderMessages(peer);
    if (!quiet && !sent) showToast('Encrypted group message saved on this device; no relay confirmed sending.');
    else if (!quiet && sent < routePlan.deliveries.length) showToast('Partial delivery: some group inbox relays did not confirm their envelopes.');
    return { savedLocally: true, confirmedEnvelopeCount: sent, requiredEnvelopeCount: routePlan.deliveries.length };
  }
  async function sendPrivateReaction(peer, message, reaction) {
    if ((await get('conversations', peer))?.group === true) return sendPrivateGroupReaction(peer, message, reaction);
    const agentAccess = await get('agentAccess', peer);
    if (agentAccess?.status === 'blocked') throw new Error('This contact is blocked on this device.');
    const targetId = nostrEventId(message);
    if (!targetId || !(REACTION_OPTIONS.includes(reaction) || await EmojiPicker.supportsEmoji(reaction))) throw new Error('This message cannot receive that reaction.');
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
    if (members.length < 3 || members.length > MAX_NIP17_GROUP_MEMBERS || !members.includes(state.pubkey) || !targetId || !(REACTION_OPTIONS.includes(reaction) || await EmojiPicker.supportsEmoji(reaction))) {
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
  function createGroupInviteLink() {
    const conversation = state.chatDetailsPeer ? get('conversations', state.chatDetailsPeer) : Promise.resolve(null);
    return Promise.resolve(conversation).then(group => {
      if (!state.secret || !state.pubkey || group?.group !== true || !Array.isArray(group.members)) throw new Error('Invalid group invitation.');
      const target = Contact.parsePublicKey($('group-invite-member-input').value).pubkey.toLowerCase();
      if (group.members.some(member => member.toLowerCase() === target)) throw new Error('Invalid group invitation.');
      const invite = GroupInvites.createInvitation({
        baseUrl: window.location.href,
        senderPubkey: state.pubkey,
        inviteePubkey: target,
        members: group.members,
        title: group.title || localized('Private group', 'Grupo privado'),
        createdAt: Math.floor(Date.now() / 1000),
        sign: template => N.finalizeEvent(template, state.secret),
        encrypt: (recipient, plaintext) => N.nip44.v2.encrypt(plaintext, N.nip44.v2.utils.getConversationKey(state.secret, recipient)),
        verify: event => N.verifyEvent(event)
      });
      state.groupInviteDraft = invite;
      $('group-invite-link').value = invite.url;
      $('group-invite-result').hidden = false;
      $('group-invite-qr').hidden = true;
      $('group-invite-qr').replaceChildren();
      $('group-invite-status').textContent = localized('Invitation created on this device. It is encrypted for the selected public key and has not been sent or published.', 'Convite criado neste aparelho. Ele é criptografado para a chave pública selecionada e não foi enviado nem publicado.');
    });
  }
  async function showGroupInvitePreview(value) {
    if (!state.secret || !state.pubkey) { state.pendingGroupInviteIntent = value; return; }
    try {
      const invite = GroupInvites.openInvitation(value, {
        recipientPubkey: state.pubkey,
        decrypt: (sender, ciphertext) => N.nip44.v2.decrypt(ciphertext, N.nip44.v2.utils.getConversationKey(state.secret, sender)),
        verify: event => N.verifyEvent(event)
      });
      state.pendingGroupInvite = invite;
      const senderNpub = N.nip19.npubEncode(invite.senderPubkey);
      $('group-invite-preview-from').textContent = localized(`Signed by ${senderNpub}`, `Assinado por ${senderNpub}`);
      $('group-invite-preview-room').textContent = invite.title;
      const memberRows = await Promise.all(invite.members.map(async member => {
        const local = member === state.pubkey ? null : await get('conversations', member).catch(() => null);
        const profile = state.peerProfiles.get(member);
        const name = member === state.pubkey ? localized('You', 'Você') : displayName(member, local?.title || profile?.displayName || profile?.name || '');
        return `${name} · npub…${N.nip19.npubEncode(member).slice(-8)}`;
      }));
      const list = $('group-invite-preview-members');
      list.replaceChildren(...memberRows.map(label => { const item = document.createElement('li'); item.textContent = label; return item; }));
      $('group-invite-preview-status').textContent = '';
      $('group-invite-preview-dialog').showModal();
    } catch {
      state.pendingGroupInvite = null;
      showToast(localized('This group invitation is invalid, changed, or addressed to a different key.', 'Este convite de grupo é inválido, foi alterado ou foi enviado para outra chave.'));
    }
  }
  async function acceptGroupInvite() {
    const invite = state.pendingGroupInvite;
    if (!invite || !state.secret || invite.recipientPubkey !== state.pubkey) {
      $('group-invite-preview-status').textContent = localized('Unlock the invited identity and open the link again.', 'Desbloqueie a identidade convidada e abra o link novamente.');
      return;
    }
    const id = groupConversationId(invite.members);
    if (!id) {
      $('group-invite-preview-status').textContent = localized('This participant list cannot form a private group.', 'Esta lista de participantes não pode formar um grupo privado.');
      return;
    }
    const previous = await get('conversations', id) || { pubkey: id, lastAt: 0, lastMessage: '' };
    await put('conversations', { ...previous, group: true, members: [...invite.members], title: previous.title || invite.title });
    state.pendingGroupInvite = null;
    $('group-invite-preview-dialog').close();
    await selectConversation(id);
    await renderConversations();
    showToast(localized('Group added on this device. No message was sent.', 'Grupo adicionado neste aparelho. Nenhuma mensagem foi enviada.'));
  }
  function setActiveView(view) {
    if (view !== 'messages' && state.voiceRecorder) cancelVoiceRecording({ notify: true });
    if (view !== 'messages') stopLocalPresence();
    state.activeView = view;
    audioPlayback.setContext(state.activeView, state.activePeer);
    if (view !== 'messages') setMobileConversationListOpen(false);
    for (const name of ['messages', 'hangout', 'apps', 'marketplace', 'node', 'saved']) {
      $(`${name}-view`).classList.toggle('hidden', name !== view);
      document.querySelector(`.nav-button[data-view="${name}"]`).classList.toggle('active', name === view);
    }
    if (view === 'messages' && state.activePeer) {
      markConversationRead(state.activePeer).then(changed => changed && renderConversations()).catch(() => {});
    }
    if (view === 'hangout') refreshHangout().catch(() => {});
    if (view === 'marketplace') refreshMarketplace().catch(() => {});
    if (view === 'saved') renderSavedMessages().catch(() => {});
    if (view === 'messages') startLocalPresence();
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
    if (message.fileTransfer) {
      const entries = (await all('messages')).filter(item => item.peer === peer && item.fileChunk?.transferId === message.fileTransfer.transferId &&
        (!message.senderPubkey || item.senderPubkey === message.senderPubkey || item.direction === 'sent'));
      for (const entry of entries) await put('messages', { ...entry, saved, ...(saved ? { savedAt: Date.now() } : { savedAt: 0 }) });
      if (state.activePeer === peer) await renderMessages(peer);
      await renderSavedMessages();
      return;
    }
    const updated = { ...message, saved, ...(saved ? { savedAt: Date.now() } : { savedAt: 0 }) };
    await put('messages', updated);
    if (state.activePeer === peer) await renderMessages(peer);
    await renderSavedMessages();
  }
  async function renderSavedMessages() {
    const list = $('saved-list');
    if (!list || !state.db) return;
    const saved = FileTransfers.coalesceMessages((await all('messages')).filter(message => message.kind !== 7 && !message.hiddenFromChat)).filter(message => message.saved === true).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
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
      const excerpt = document.createElement('div'); excerpt.className = 'saved-message-text'; RichText.renderInto(excerpt, message.fileTransfer ? `📎 ${message.fileTransfer.name}` : message.text, window.PropertyI18n?.language || 'en');
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
    if (!message || typeof message.text !== 'string' || !message.text.trim() || message.kind === 7 || message.deleted || message.fromAgent || message.agentMessageId) {
      throw new Error(localized('This message cannot be forwarded.', 'Esta mensagem não pode ser encaminhada.'));
    }
    state.forwardingMessage = message;
    $('forward-error').textContent = '';
    const list = $('forward-list'); list.replaceChildren();
    const conversations = (await all('conversations')).filter(item => item.pubkey !== message.peer && item.pubkey !== state.pubkey);
    const available = [];
    for (const conversation of conversations) if (conversation.group || (await get('agentAccess', conversation.pubkey))?.status !== 'blocked') available.push(conversation);
    if (!available.length) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = localized('No conversations to forward to.', 'Nenhuma conversa disponível para encaminhar.'); list.append(empty);
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
    const text = message.text;
    const forwardedHops = MessageForwards.next(message.forwarded);
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
        const result = await sendPrivateMessage(peer, text, null, { quiet: true, secretConfirmed: Boolean(finding), forwardedHops }, message.linkPreview);
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
  async function communityRelaySelf(relayUrl) {
    const relay = normalizeRelay(relayUrl);
    if (!relay.startsWith('wss://')) throw new Error(localized('NIP-29 communities need a secure relay URL.', 'Comunidades NIP-29 precisam de um endereço de relay seguro.'));
    const cached = state.communityRelaySelf.get(relay);
    if (cached) return cached;
    const task = (async () => {
      const endpoint = new URL(relay);
      endpoint.protocol = 'https:';
      endpoint.search = '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch(endpoint.href, {
          headers: { Accept: 'application/nostr+json' }, mode: 'cors', credentials: 'omit', cache: 'no-store',
          redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal
        });
        if (!response.ok) throw new Error(localized('The relay did not provide its NIP-11 identity.', 'O relay não forneceu sua identidade NIP-11.'));
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > 128 * 1024) throw new Error(localized('The relay information document is too large.', 'O documento de informações do relay é muito grande.'));
        let text;
        if (response.body?.getReader) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const parts = [];
          let total = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.byteLength;
              if (total > 128 * 1024) { await reader.cancel(); throw new Error(localized('The relay information document is too large.', 'O documento de informações do relay é muito grande.')); }
              parts.push(decoder.decode(value, { stream: true }));
            }
            parts.push(decoder.decode());
          } finally { reader.releaseLock(); }
          text = parts.join('');
        } else {
          text = await response.text();
          if (new TextEncoder().encode(text).byteLength > 128 * 1024) throw new Error(localized('The relay information document is too large.', 'O documento de informações do relay é muito grande.'));
        }
        let self;
        try { self = CommunityGroups.parseRelaySelfDocument(text); } catch { self = null; }
        if (!self) throw new Error(localized('The relay returned invalid NIP-11 information or has no valid self key.', 'O relay retornou informações NIP-11 inválidas ou não tem uma chave self válida.'));
        return self;
      } finally { clearTimeout(timer); }
    })();
    state.communityRelaySelf.set(relay, task);
    try { return await task; }
    catch (error) { if (state.communityRelaySelf.get(relay) === task) state.communityRelaySelf.delete(relay); throw error; }
  }
  function renderCommunityList() {
    const list = $('community-list');
    list.replaceChildren();
    if (!state.communities.length) {
      list.append(makeEmpty(localized('No public communities found', 'Nenhuma comunidade pública encontrada'), localized('Try another refresh after the selected relays are connected.', 'Tente atualizar quando os relays selecionados estiverem conectados.')));
      return;
    }
    for (const community of state.communities) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'community-card';
      const name = document.createElement('strong'); name.textContent = community.name;
      const about = document.createElement('span'); about.className = 'community-description'; about.textContent = community.about || localized('A public NIP-29 group.', 'Um grupo público NIP-29.');
      const origin = document.createElement('small');
      let host = community.relayUrl;
      try { host = new URL(community.relayUrl).host; } catch {}
      origin.textContent = `${host} · ${community.id}`;
      card.append(name, about, origin);
      if (community.parallelOrigin) {
        const note = document.createElement('small'); note.className = 'community-parallel-label';
        note.textContent = localized('Same ID on another relay · history kept separate', 'Mesmo ID em outro relay · histórico mantido separado');
        card.append(note);
      }
      card.addEventListener('click', () => openCommunity({ ...community, selfPubkey: community.relayPubkey }).catch(error => showToast(error.message || localized('Could not open this community.', 'Não foi possível abrir esta comunidade.'))));
      list.append(card);
    }
  }
  async function discoverCommunities() {
    const status = $('community-status');
    if (!state.relays.length) {
      status.textContent = localized('Select at least one relay in Settings before discovering communities.', 'Selecione pelo menos um relay nas Configurações antes de buscar comunidades.');
      return;
    }
    status.textContent = localized('Checking relay identity and looking for public communities…', 'Conferindo a identidade dos relays e buscando comunidades públicas…');
    $('community-list').replaceChildren(makeEmpty(localized('Searching selected relays', 'Buscando nos relays selecionados'), localized('Only communities with metadata signed by the relay’s NIP-11 self key are shown.', 'Só aparecem comunidades com metadados assinados pela chave self NIP-11 do relay.')));
    const sources = await Promise.all(state.relays.map(async relayUrl => {
      try {
        const selfPubkey = await communityRelaySelf(relayUrl);
        const events = await fetchEvents({ kinds: [39000], limit: 100 }, 7000, [relayUrl]);
        return { relayUrl: normalizeRelay(relayUrl), selfPubkey, events };
      } catch (error) { return { relayUrl: normalizeRelay(relayUrl), events: [], error: error.message || 'NIP-11 verification failed' }; }
    }));
    state.communities = CommunityGroups.markParallelOrigins(CommunityGroups.discoverableGroups(sources, (event, selfPubkey) =>
      Boolean(selfPubkey && event.pubkey?.toLowerCase() === selfPubkey && N.verifyEvent(event))));
    renderCommunityList();
    const unavailable = sources.filter(source => source.error).length;
    $('community-status').textContent = state.communities.length
      ? localized(`${state.communities.length} public communities found on your selected relays.`, `${state.communities.length} comunidades públicas encontradas nos relays selecionados.`) +
        (unavailable ? localized(` ${unavailable} relay identity could not be verified.`, ` Não foi possível verificar a identidade de ${unavailable} relay(s).`) : '')
      : localized(`No verified public communities found.${unavailable ? ` ${unavailable} relay identity could not be verified.` : ''}`, `Nenhuma comunidade pública verificada encontrada.${unavailable ? ` Não foi possível verificar a identidade de ${unavailable} relay(s).` : ''}`);
  }
  async function openCommunityReference() {
    const reference = CommunityGroups.parseGroupReference($('community-link-input').value, value => N.nip19.decode(value), normalizeRelay);
    if (!reference) throw new Error(localized('Enter a valid NIP-29 naddr link.', 'Informe um link naddr NIP-29 válido.'));
    const relayUrl = reference.relays[0] || state.relays[0];
    if (!relayUrl) throw new Error(localized('This group link has no relay hint. Select a relay in Settings first.', 'Este link não indica um relay. Selecione um relay nas Configurações primeiro.'));
    const selfPubkey = await communityRelaySelf(relayUrl);
    if (selfPubkey !== reference.relayPubkey) throw new Error(localized('The group address does not match this relay’s NIP-11 self key.', 'O endereço do grupo não corresponde à chave self NIP-11 deste relay.'));
    const events = await fetchEvents({ kinds: [39000], authors: [selfPubkey], '#d': [reference.groupId], limit: 20 }, 8000, [relayUrl]);
    const latest = events.filter(event => event.kind === 39000 && event.pubkey?.toLowerCase() === selfPubkey && N.verifyEvent(event))
      .sort((a, b) => b.created_at - a.created_at || String(b.id).localeCompare(String(a.id)))[0];
    const community = latest ? CommunityGroups.parseMetadata(latest, relayUrl, event => event.pubkey?.toLowerCase() === selfPubkey && N.verifyEvent(event)) : null;
    if (!community || community.id !== reference.groupId || community.private || community.hidden) {
      throw new Error(localized('This relay does not provide a verified public group matching the link.', 'Este relay não forneceu um grupo público verificado que corresponda ao link.'));
    }
    const verifiedCommunity = { ...community, selfPubkey };
    state.communities = CommunityGroups.markParallelOrigins([...state.communities.filter(item => item.key !== community.key), verifiedCommunity]);
    renderCommunityList();
    $('community-link-input').value = '';
    await openCommunity(verifiedCommunity, reference.inviteCode);
  }
  async function openCommunity(community, inviteCode = '') {
    if (!community || community.private || community.hidden || !community.selfPubkey) throw new Error(localized('This public community has not been verified by its relay.', 'Esta comunidade pública não foi verificada pelo relay.'));
    state.activeCommunity = community;
    state.activeCommunityEvents = [];
    state.activeCommunityModerators = new Set([community.selfPubkey]);
    const cachedAdmins = await get('settings', communityAdminCacheId(community)).catch(() => null);
    if (state.activeCommunity?.key !== community.key) return;
    state.communityMigrationAdmins = new Set((Array.isArray(cachedAdmins?.admins) ? cachedAdmins.admins.slice(0, 50) : []).map(value => String(value || '').toLowerCase()).filter(value => /^[0-9a-f]{64}$/.test(value)));
    state.communityMigrationCandidates = [];
    state.communityMigrationStatus = '';
    state.communityInviteCode = inviteCode;
    $('community-list').hidden = true;
    $('community-room').classList.remove('hidden');
    $('community-room-title').textContent = community.name;
    $('community-room-origin').textContent = `${community.relayUrl} · ${community.id}`;
    $('community-parallel-note').hidden = !community.parallelOrigin;
    $('community-parallel-note').textContent = localized('This group ID also appears on another relay. Property keeps this relay’s rules and history separate; the other entry may be a backup, migration, or fork.', 'Este ID de grupo também aparece em outro relay. O Property mantém as regras e o histórico deste relay separados; a outra entrada pode ser uma cópia de segurança, migração ou ramificação.');
    $('community-invite-code').value = inviteCode;
    $('community-status').textContent = '';
    $('community-room-feed').replaceChildren(makeEmpty(localized('Loading public group messages', 'Carregando mensagens públicas do grupo'), localized('Messages come only from this group’s relay.', 'As mensagens vêm somente do relay deste grupo.')));
    await refreshCommunityRoom();
  }
  function communityAdminCacheId(community) {
    return `community-admins:${state.pubkey}:${community.relayUrl}:${community.id}`;
  }
  async function refreshCommunityRoom() {
    const community = state.activeCommunity;
    if (!community) return;
    const [events, admins] = await Promise.all([
      fetchEvents({ kinds: [1, 9000, 9001, 9021, 9022], '#h': [community.id], limit: 250 }, 8000, [community.relayUrl]).catch(() => []),
      fetchEvents({ kinds: [39001], '#d': [community.id], limit: 10 }, 6000, [community.relayUrl]).catch(() => [])
    ]);
    if (state.activeCommunity?.key !== community.key) return;
    const currentEvents = events.filter(event => N.verifyEvent(event) && event.tags?.some(tag => Array.isArray(tag) && tag[0] === 'h' && tag[1] === community.id));
    const verifiedAdmins = admins.filter(event => event.kind === 39001 && event.pubkey?.toLowerCase() === community.selfPubkey && N.verifyEvent(event) &&
      event.tags?.some(tag => Array.isArray(tag) && tag[0] === 'd' && tag[1] === community.id))
      .sort((a, b) => b.created_at - a.created_at || String(b.id).localeCompare(String(a.id)))[0];
    const authorized = new Set([community.selfPubkey]);
    const listedAdmins = new Set();
    for (const tag of verifiedAdmins?.tags || []) if (listedAdmins.size < 50 && tag[0] === 'p' && /^[0-9a-f]{64}$/i.test(tag[1] || '')) {
      authorized.add(tag[1].toLowerCase());
      listedAdmins.add(tag[1].toLowerCase());
    }
    const merged = new Map([...state.activeCommunityEvents, ...currentEvents].map(event => [event.id, event]));
    state.activeCommunityEvents = [...merged.values()];
    state.activeCommunityModerators = authorized;
    if (listedAdmins.size) {
      const cacheId = communityAdminCacheId(community);
      await put('settings', { id: cacheId, admins: [...listedAdmins] }).catch(() => {});
    }
    if (state.activeCommunity?.key !== community.key) return;
    state.communityMigrationAdmins = new Set([...listedAdmins, ...state.communityMigrationAdmins].slice(0, 50));
    renderCommunityRoom();
    void refreshCommunityMigrationHints(community);
  }
  async function refreshCommunityMigrationHints(community) {
    if (!state.communityMigrationAdmins.size) return;
    state.communityMigrationStatus = 'checking';
    renderCommunityMigrationNotice();
    let adminLists = [];
    try {
      adminLists = await fetchEvents({ kinds: [10009], authors: [...state.communityMigrationAdmins].slice(0, 50), limit: 100 }, 7000, state.relays);
    } catch {
      if (state.activeCommunity?.key === community.key) {
        state.communityMigrationStatus = 'unavailable';
        renderCommunityMigrationNotice();
      }
      return;
    }
    if (state.activeCommunity?.key !== community.key) return;
    state.communityMigrationCandidates = CommunityGroups.migrationCandidates(adminLists, community, state.communityMigrationAdmins, N.verifyEvent, normalizeRelay);
    state.communityMigrationStatus = '';
    renderCommunityMigrationNotice();
  }
  function renderCommunityMigrationNotice() {
    const notice = $('community-migration-notice');
    notice.replaceChildren();
    const candidates = state.communityMigrationCandidates || [];
    notice.hidden = !candidates.length && !state.communityMigrationStatus;
    if (!candidates.length && state.communityMigrationStatus === 'checking') {
      const progress = document.createElement('p');
      progress.textContent = localized('Checking known admins’ public group lists for another relay origin…', 'Conferindo as listas públicas de grupo dos administradores conhecidos em busca de outra origem…');
      notice.append(progress);
      return;
    }
    if (!candidates.length && state.communityMigrationStatus === 'unavailable') {
      const unavailable = document.createElement('p');
      unavailable.textContent = localized('Could not check admin group lists on the selected relays.', 'Não foi possível consultar as listas dos administradores nos relays selecionados.');
      notice.append(unavailable);
      return;
    }
    if (!candidates.length) return;
    const description = document.createElement('p');
    description.textContent = localized(
      'A known group admin’s public list points to the same group ID on another relay. This could be a migration or a fork; histories and membership stay separate until you inspect it.',
      'A lista pública de um administrador conhecido aponta o mesmo ID de grupo em outro relay. Pode ser uma migração ou ramificação; histórico e participação continuam separados até você inspecionar.'
    );
    notice.append(description);
    for (const candidate of candidates) {
      const row = document.createElement('div'); row.className = 'community-migration-candidate';
      const label = document.createElement('span');
      label.textContent = `${candidate.name || candidate.id} · ${candidate.relayUrl}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary';
      const selected = state.relays.includes(candidate.relayUrl);
      button.textContent = selected
        ? localized('Inspect separate copy', 'Inspecionar cópia separada')
        : localized('Add this relay in Settings to inspect', 'Adicione este relay nas Configurações para inspecionar');
      button.disabled = !selected;
      if (selected) button.addEventListener('click', () => inspectCommunityCandidate(candidate).catch(error => showToast(error.message || localized('Could not inspect this group copy.', 'Não foi possível inspecionar esta cópia do grupo.'))));
      row.append(label, button); notice.append(row);
    }
  }
  async function inspectCommunityCandidate(candidate) {
    if (!candidate || !state.relays.includes(candidate.relayUrl)) throw new Error(localized('Select this relay in Settings before inspecting it.', 'Selecione este relay nas Configurações antes de inspecioná-lo.'));
    const selfPubkey = await communityRelaySelf(candidate.relayUrl);
    const events = await fetchEvents({ kinds: [39000], authors: [selfPubkey], '#d': [candidate.id], limit: 20 }, 8000, [candidate.relayUrl]);
    const latest = events.filter(event => event.kind === 39000 && event.pubkey?.toLowerCase() === selfPubkey && N.verifyEvent(event))
      .sort((a, b) => b.created_at - a.created_at || String(b.id).localeCompare(String(a.id)))[0];
    const community = latest ? CommunityGroups.parseMetadata(latest, candidate.relayUrl, event => event.pubkey?.toLowerCase() === selfPubkey && N.verifyEvent(event)) : null;
    if (!community || community.id !== candidate.id || community.private || community.hidden) {
      throw new Error(localized('No verified public group matching this admin list entry was found on that relay.', 'Não foi encontrado nesse relay um grupo público verificado que corresponda à lista do administrador.'));
    }
    const separate = { ...community, selfPubkey, parallelOrigin: true };
    state.communities = CommunityGroups.markParallelOrigins([...state.communities.filter(item => item.key !== community.key), separate]);
    renderCommunityList();
    await openCommunity({ ...separate, parallelOrigin: true });
  }
  function renderCommunityRoom() {
    const community = state.activeCommunity;
    if (!community) return;
    const events = state.activeCommunityEvents;
    const membership = CommunityGroups.membership(events, community.id, state.pubkey, N.verifyEvent, state.activeCommunityModerators);
    const pendingJoin = CommunityGroups.hasPendingJoin(events, community.id, state.pubkey, N.verifyEvent, state.activeCommunityModerators);
    const pendingLeave = CommunityGroups.hasPendingLeave(events, community.id, state.pubkey, N.verifyEvent, state.activeCommunityModerators);
    const status = membership === 'member'
      ? localized('The relay reports that you are a member.', 'O relay informa que você é participante.')
      : pendingLeave
        ? localized('Leave request sent; waiting for the relay to remove your membership.', 'Pedido de saída enviado; aguardando o relay remover sua participação.')
        : pendingJoin
          ? localized('Join request sent; delivery does not mean the relay has admitted you.', 'Pedido de entrada enviado; a entrega não significa que o relay já aceitou sua participação.')
          : community.closed
            ? localized('This group is closed. A valid invite code is needed for a join request to be honored.', 'Este grupo é fechado. É necessário um código de convite válido para que o pedido de entrada seja considerado.')
            : localized('You are not a confirmed member. This relay may require a join request before you can post.', 'Sua participação ainda não foi confirmada. Este relay pode exigir um pedido de entrada antes de você publicar.');
    $('community-membership').textContent = `${status} ${localized('Membership status is based on signed group events from this relay.', 'O estado de participação usa eventos assinados deste relay.')}`;
    renderCommunityMigrationNotice();
    $('community-join').hidden = membership === 'member' || pendingJoin;
    $('community-join').disabled = community.closed && !$('community-invite-code').value.trim();
    $('community-leave').hidden = membership !== 'member' && !pendingLeave;
    const supportsText = community.supportedKinds === null || community.supportedKinds.includes(1);
    const canPost = supportsText && (!community.restricted || membership === 'member');
    $('community-composer').hidden = !canPost;
    if (!supportsText) $('community-membership').textContent += localized(' This group does not advertise support for text posts.', ' Este grupo não anuncia suporte a mensagens de texto.');
    else if (community.restricted && !canPost) $('community-membership').textContent += localized(' Only confirmed members can post here.', ' Somente participantes confirmados podem publicar aqui.');
    const feed = $('community-room-feed');
    feed.replaceChildren();
    const posts = events.filter(event => event.kind === 1 && N.verifyEvent(event) && event.tags?.some(tag => Array.isArray(tag) && tag[0] === 'h' && tag[1] === community.id))
      .sort((a, b) => b.created_at - a.created_at || String(b.id).localeCompare(String(a.id))).slice(0, 100);
    if (!posts.length) feed.append(makeEmpty(localized('No text posts yet', 'Ainda não há mensagens de texto'), localized('This public group history is fetched from its hosting relay.', 'O histórico deste grupo público vem do relay que o hospeda.')));
    for (const post of posts) {
      const card = document.createElement('article'); card.className = 'community-post-card';
      const body = document.createElement('p'); body.dataset.userContent = ''; body.textContent = post.content;
      const author = document.createElement('small');
      const encoded = N.nip19.npubEncode(post.pubkey);
      author.textContent = `${encoded.slice(0, 15)}… · ${new Date(post.created_at * 1000).toLocaleString(window.PropertyI18n?.locale() || undefined)}`;
      card.append(body, author); feed.append(card);
    }
  }
  async function requestCommunityJoin() {
    const community = state.activeCommunity;
    if (!community) return;
    const inviteCode = $('community-invite-code').value.trim();
    if (community.closed && !inviteCode) throw new Error(localized('Enter an invite code for this closed group.', 'Informe um código de convite para este grupo fechado.'));
    const unsigned = CommunityGroups.createJoinRequest({ pubkey: state.pubkey, groupId: community.id, inviteCode });
    const event = finalize(unsigned.kind, unsigned.content, unsigned.tags);
    if (!(await publishToRelays(event, [community.relayUrl]))) throw new Error(localized('The hosting relay did not confirm delivery of the join request.', 'O relay que hospeda o grupo não confirmou a entrega do pedido de entrada.'));
    state.activeCommunityEvents.push(event);
    renderCommunityRoom();
    showToast(localized('Join request delivered. Relay acceptance is still required.', 'Pedido de entrada entregue. Ainda é necessária a aceitação do relay.'));
  }
  async function requestCommunityLeave() {
    const community = state.activeCommunity;
    if (!community) return;
    const unsigned = CommunityGroups.createLeaveRequest({ pubkey: state.pubkey, groupId: community.id });
    const event = finalize(unsigned.kind, unsigned.content, unsigned.tags);
    if (!(await publishToRelays(event, [community.relayUrl]))) throw new Error(localized('The hosting relay did not confirm delivery of the leave request.', 'O relay que hospeda o grupo não confirmou a entrega do pedido de saída.'));
    state.activeCommunityEvents.push(event);
    renderCommunityRoom();
    showToast(localized('Leave request delivered. The relay still needs to confirm removal.', 'Pedido de saída entregue. O relay ainda precisa confirmar a remoção.'));
  }
  async function publishCommunityPost() {
    const community = state.activeCommunity;
    if (!community) return;
    const content = $('community-post-text').value.trim();
    const membership = CommunityGroups.membership(state.activeCommunityEvents, community.id, state.pubkey, N.verifyEvent, state.activeCommunityModerators);
    if (community.restricted && membership !== 'member') throw new Error(localized('This relay has not confirmed your membership, so Property will not post to this restricted group.', 'Este relay ainda não confirmou sua participação; o Property não vai publicar neste grupo restrito.'));
    const previousIds = state.activeCommunityEvents.filter(event => event.kind === 1 && event.pubkey !== state.pubkey && N.verifyEvent(event))
      .sort((a, b) => b.created_at - a.created_at).slice(0, 3).map(event => event.id);
    const unsigned = CommunityGroups.createPublicPost({ pubkey: state.pubkey, groupId: community.id, content, previousIds, membershipStatus: membership, restricted: community.restricted });
    const event = finalize(unsigned.kind, unsigned.content, unsigned.tags);
    if (!(await publishToRelays(event, [community.relayUrl]))) throw new Error(localized('The hosting relay did not confirm the public post.', 'O relay que hospeda o grupo não confirmou a publicação.'));
    state.activeCommunityEvents.push(event);
    $('community-post-text').value = '';
    renderCommunityRoom();
    showToast(localized('Public post delivered to this group’s relay.', 'Publicação pública entregue ao relay deste grupo.'));
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
    const name = $('profile-name').value.trim();
    const about = $('profile-about').value.trim();
    const nip05 = $('profile-nip05').value.trim();
    if (name.length > 80) throw new Error(localized('Name must be 80 characters or fewer.', 'O nome deve ter no máximo 80 caracteres.'));
    if (about.length > 1_000) throw new Error(localized('About must be 1,000 characters or fewer.', 'O campo Sobre deve ter no máximo 1.000 caracteres.'));
    if (nip05.length > 160) throw new Error(localized('NIP-05 must be 160 characters or fewer.', 'O NIP-05 deve ter no máximo 160 caracteres.'));
    const websiteInput = $('profile-website').value.trim();
    const pictureInput = $('profile-picture').value.trim();
    const website = websiteInput ? PublicProfile.safeWebsite(websiteInput) : '';
    const picture = pictureInput ? PublicProfile.safeWebsite(pictureInput) : '';
    if (websiteInput && !website) throw new Error(localized('Website must be a valid HTTPS URL without credentials.', 'O site deve ser uma URL HTTPS válida, sem credenciais.'));
    if (pictureInput && !picture) throw new Error(localized('Picture must be a valid HTTPS URL without credentials.', 'A imagem deve ser uma URL HTTPS válida, sem credenciais.'));

    const profile = { id: `profile-${state.pubkey}`, name, about, website, picture, nip05 };
    await put('settings', profile);
    resetOwnNip05Check();
    $('profile-initial').textContent = name.slice(0, 1).toUpperCase() || 'L';
    const current = await readOwnPublicProfile();
    if (!current.reachable) {
      $('profile-save-status').textContent = localized('Profile saved on this device; saved relays could not be reached, so nothing was published.', 'Perfil salvo neste aparelho; não foi possível acessar os relays salvos, então nada foi publicado.');
      showToast(localized('Profile saved on this device; saved relays could not be reached, so nothing was published.', 'Perfil salvo neste aparelho; não foi possível acessar os relays salvos, então nada foi publicado.'));
      return;
    }
    const metadata = current.record ? { ...current.record.metadata } : {};
    for (const [key, value] of Object.entries({ name, display_name: name, about, website, picture, nip05 })) {
      if (value) metadata[key] = value;
      else delete metadata[key];
    }
    const content = JSON.stringify(metadata);
    if (enc.encode(content).byteLength > 16_384) {
      $('profile-save-status').textContent = localized('Profile saved on this device; public metadata is too large to publish safely.', 'Perfil salvo neste aparelho; os metadados públicos são grandes demais para publicar com segurança.');
      showToast(localized('Profile saved on this device; public metadata is too large to publish safely.', 'Perfil salvo neste aparelho; os metadados públicos são grandes demais para publicar com segurança.'));
      return;
    }
    const event = finalize(0, content);
    const sent = await publishToRelays(event);
    $('profile-save-status').textContent = sent
      ? localized('Profile published to connected relays.', 'Perfil publicado nos relays conectados.')
      : localized('Profile saved on this device; no relay confirmed publication.', 'Perfil salvo neste aparelho; nenhum relay confirmou a publicação.');
    showToast(sent
      ? localized('Profile saved locally and published to relays.', 'Perfil salvo localmente e publicado nos relays.')
      : localized('Profile saved on this device; no relay confirmed the profile.', 'Perfil salvo neste aparelho; nenhum relay confirmou o perfil.'));
  }
  async function readOwnPublicProfile(pubkey = state.pubkey) {
    const relays = [...new Set(state.relays.map(normalizeRelay))];
    for (const url of relays) connectRelay(url);
    const reachable = (await Promise.all(relays.map(async url => await waitForOpen(url) ? url : null))).filter(Boolean);
    if (!reachable.length) return { reachable: false, record: null, identityRecord: null };
    const events = await fetchEvents({ kinds: [0, IdentityProofs.KIND], authors: [pubkey], limit: 40 }, 7000, reachable);
    return {
      reachable: true,
      record: PublicProfile.latestRecord(events, pubkey, N.verifyEvent),
      identityRecord: IdentityProofs.latestRecord(events, pubkey, N.verifyEvent)
    };
  }
  async function loadOwnPublicProfile() {
    const pubkey = state.pubkey;
    const button = $('load-public-profile');
    const status = $('profile-save-status');
    button.disabled = true;
    showError('profile-error');
    status.textContent = localized('Loading the latest profile from your saved relays…', 'Carregando o perfil mais recente dos relays salvos…');
    try {
      const result = await readOwnPublicProfile(pubkey);
      if (!pubkey || state.pubkey !== pubkey || !$('profile-dialog').open) return;
      if (!result.reachable) {
        status.textContent = localized('Could not reach your saved relays. Nothing was loaded.', 'Não foi possível acessar seus relays salvos. Nada foi carregado.');
        return;
      }
      if (result.identityRecord) {
        await put('settings', { id: identityProofSettingId(state.pubkey), event: result.identityRecord.event, checkedAt: Date.now() });
      } else {
        await del('settings', identityProofSettingId(state.pubkey));
      }
      const github = result.identityRecord?.claims.find(claim => claim.platform === 'github');
      $('profile-github-username').value = github?.identity || '';
      $('profile-github-gist').value = github?.proof || '';
      $('profile-nip39-status').textContent = github
        ? localized('Signed GitHub link loaded from a saved relay.', 'Vínculo GitHub assinado carregado de um relay salvo.')
        : result.identityRecord?.claims.length
          ? localized('Other identity claims were loaded and will be preserved when you publish this link.', 'Outras declarações de identidade foram carregadas e serão preservadas ao publicar este vínculo.')
          : '';
      if (!result.record) {
        $('profile-name').value = '';
        $('profile-about').value = '';
        $('profile-website').value = '';
        $('profile-picture').value = '';
        $('profile-nip05').value = '';
        resetOwnNip05Check();
        status.textContent = result.identityRecord?.claims.length
          ? localized('No signed kind 0 profile was found; linked identity claims were loaded.', 'Nenhum perfil assinado kind 0 foi encontrado; as declarações de identidade vinculadas foram carregadas.')
          : localized('No signed public profile was found on your saved relays.', 'Nenhum perfil público assinado foi encontrado nos seus relays salvos.');
        return;
      }
      const { profile, metadata } = result.record;
      $('profile-name').value = profile.displayName || profile.name;
      $('profile-about').value = profile.about;
      $('profile-website').value = profile.website;
      $('profile-picture').value = PublicProfile.safeWebsite(metadata.picture);
      $('profile-nip05').value = profile.nip05;
      resetOwnNip05Check();
      status.textContent = localized('Profile loaded from a saved relay. Review it before saving.', 'Perfil carregado de um relay salvo. Confira antes de salvar.');
    } finally {
      button.disabled = false;
    }
  }
  async function copyGitHubVerificationText() {
    if (!state.npub) return;
    const text = IdentityProofs.verificationText(state.npub);
    try {
      await navigator.clipboard.writeText(text);
      $('profile-github-proof-text').hidden = true;
      $('profile-nip39-status').textContent = localized('Verification text copied. Paste it into one public Gist file.', 'Texto de verificação copiado. Cole-o em um arquivo de uma Gist pública.');
    } catch {
      const field = $('profile-github-proof-text');
      field.value = text;
      field.hidden = false;
      field.focus();
      field.select();
      $('profile-nip39-status').textContent = localized('Copy was blocked. Select the verification text above and copy it manually.', 'A cópia foi bloqueada. Selecione o texto de verificação acima e copie manualmente.');
    }
  }
  async function publishGitHubIdentity() {
    const button = $('publish-github-identity');
    const status = $('profile-nip39-status');
    const pubkey = state.pubkey;
    if (!pubkey || !state.secret) { status.textContent = localized('Unlock this identity before publishing.', 'Desbloqueie esta identidade antes de publicar.'); return; }
    const username = $('profile-github-username').value.trim();
    const gistId = $('profile-github-gist').value.trim();
    let github = null;
    if (username || gistId) {
      try { github = IdentityProofs.githubClaim(username, gistId); }
      catch (error) {
        status.textContent = error.code === 'nip39-invalid-github-username'
          ? localized('Enter a valid GitHub username.', 'Informe um nome de usuário GitHub válido.')
          : localized('Enter the public Gist ID.', 'Informe o ID da Gist pública.');
        return;
      }
    }
    button.disabled = true;
    status.textContent = localized('Checking saved relays before publishing…', 'Consultando os relays salvos antes de publicar…');
    try {
      const current = await readOwnPublicProfile(pubkey);
      if (state.pubkey !== pubkey || !state.secret || !$('profile-dialog').open) return;
      if (!current.reachable) {
        status.textContent = localized('Could not reach a saved relay. Nothing was published.', 'Não foi possível acessar um relay salvo. Nada foi publicado.');
        return;
      }
      const claims = current.identityRecord?.claims || [];
      const existingGitHub = claims.some(claim => claim.platform === 'github');
      if (!github && !existingGitHub) {
        status.textContent = localized('No published GitHub link was found to remove.', 'Nenhum vínculo GitHub publicado foi encontrado para remover.');
        return;
      }
      const nextClaims = claims.filter(claim => claim.platform !== 'github');
      if (github) nextClaims.push(github);
      const event = finalize(IdentityProofs.KIND, '', IdentityProofs.eventTags(nextClaims));
      status.textContent = localized('Publishing the signed identity link to your saved relays…', 'Publicando o vínculo de identidade assinado nos relays salvos…');
      const sent = await publishToRelays(event);
      if (state.pubkey !== pubkey || !state.secret || !$('profile-dialog').open) return;
      if (!sent) {
        status.textContent = localized('No relay confirmed the public identity link. It remains unpublished.', 'Nenhum relay confirmou o vínculo público. Ele não foi marcado como publicado.');
        return;
      }
      const record = IdentityProofs.parseEvent(event, pubkey, signed => N.verifyEvent(signed));
      if (!record) throw new Error('The signed NIP-39 event could not be verified locally.');
      await put('settings', { id: identityProofSettingId(pubkey), event, checkedAt: Date.now() });
      $('profile-github-username').value = github?.identity || '';
      $('profile-github-gist').value = github?.proof || '';
      $('profile-github-proof-text').hidden = true;
      status.textContent = github
        ? localized('Signed GitHub identity link published. It is a public claim until a contact verifies the Gist.', 'Vínculo GitHub assinado publicado. É uma declaração pública até que um contato verifique a Gist.')
        : localized('The public GitHub identity link was removed.', 'O vínculo público com o GitHub foi removido.');
    } catch (error) {
      status.textContent = error?.code?.startsWith?.('nip39-')
        ? localized('The identity link could not be published because it is invalid.', 'O vínculo de identidade não pôde ser publicado porque é inválido.')
        : localized('Could not publish the identity link. No claim was marked as published.', 'Não foi possível publicar o vínculo de identidade. Nenhuma declaração foi marcada como publicada.');
    } finally {
      if (state.pubkey === pubkey) button.disabled = false;
    }
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
    stopChessGame();
    if ($('chess-dialog')?.open) $('chess-dialog').close();
    if ($('property-app-chat-picker')?.open) $('property-app-chat-picker').close();
    state.imageViewer?.close();
    state.callController?.dispose();
    state.callController = null;
    state.call = null;
    state.callSignalSequences.clear();
    state.pendingCallPeer = '';
    state.pendingCallVideo = false;
    for (const id of ['call-consent-dialog', 'incoming-call-dialog', 'call-session-dialog']) if ($(id).open) $(id).close();
    const interruptedDirectFileTransfer = state.directFileController?.getState();
    let interruptedFileCleanup = Promise.resolve();
    if (interruptedDirectFileTransfer && !['completed', 'cancelled', 'declined', 'failed'].includes(interruptedDirectFileTransfer.status)) {
      interruptedFileCleanup = directFileStore().discardSession(interruptedDirectFileTransfer.transferId).catch(() => {});
    }
    state.directFileController?.dispose();
    state.directFileController = null;
    state.directFileTransfer = null;
    state.directFileSignalSequences.clear();
    state.pendingDirectFileOffer = null;
    state.pendingDirectFileRequest = null;
    state.directFileSendJob = null;
    state.directFileJobRunning = false;
    clearTimeout(state.directFileOfferExpiryTimer);
    state.directFileOfferExpiryTimer = 0;
    for (const id of ['file-direct-consent-dialog', 'incoming-direct-file-dialog']) if ($(id).open) $(id).close();
    state.pendingMessageDeletion = null;
    if ($('message-delete-dialog')?.open) $('message-delete-dialog').close();
    $('audio-call-button').hidden = true;
    $('video-call-button').hidden = true;
    cancelVoiceRecording();
    releaseVoiceObjectUrls();
    releaseFileObjectUrls();
    state.fileSendBusy = false;
    state.fileTransferSeen.clear();
    clearFileDrafts();
    if ($('file-attachment-dialog').open) $('file-attachment-dialog').close();
    state.activeConversationAgent = false;
    state.activeConversationBlocked = false;
    stopLocalPresence();
    clearAllRemotePresence();
    stopLocalTyping();
    clearAllRemoteTyping();
    state.typingSequences.clear();
    state.typingSeenEvents.clear();
    state.typingRelayLookups.clear();
    state.presenceSequences.clear();
    state.readReceiptObserver?.disconnect();
    state.readReceiptObserver = null;
    state.readReceiptSent.clear();
    state.readReceiptCandidates.clear();
    state.readReceipts.clear();
    cancelMessageEdit();
    if (state.activePeer) await saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
    if (state.account) { const updated = { ...state.account }; delete updated.session; await put('vault', updated); state.account = updated; }
    clearTimeout(state.idleTimer);
    clearTimeout(state.messageDayRolloverTimer); state.messageDayRolloverTimer = 0;
    state.identityProofCheckId++;
    state.identityProofChecks.clear();
    state.peerNip05Checks.clear();
    await interruptedFileCleanup;
    state.directFileStorage?.clearKey();
    if (state.secret) state.secret.fill(0);
    const clearAppBadgeOnLock = state.appBadgeEnabled || state.appBadgeLastCount !== null;
    state.iceSettings = IceServers.normalize({}); state.iceSettingsInvalid = false; $('ice-server-credential').value = '';
    state.secret = null; state.pubkey = ''; state.npub = ''; state.activePeer = ''; state.currentConversation = null; state.activeWorkspaceReady = false; state.notificationsEnabled = false; state.typingIndicatorsEnabled = false; state.readReceiptsEnabled = false; state.activeStatusEnabled = false; state.notificationMutes.clear(); state.notificationMutePeer = ''; state.pendingGroupInviteIntent = ''; state.pendingGroupInvite = null; state.groupInviteDraft = null; state.appBadgeEnabled = false; state.appBadgeLastCount = clearAppBadgeOnLock ? 0 : null;
    if ($('group-invite-preview-dialog').open) $('group-invite-preview-dialog').close();
    if (clearAppBadgeOnLock) void queueAppBadge(0);
    state.conversationMessageSearchCache = null; state.conversationMessageSearchRevision++;
    state.replyingTo = null; updateReplyContext();
    state.draftLoadSequence++;
    $('message-input').value = '';
    resizeMessageInput();
    renderVoiceComposer();
    clearLinkPreviewDraft();
    state.shareDraftId = ''; state.shareDraftPeer = ''; state.shareFileDraftId = ''; state.shareFileDraftPeer = '';
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
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (refreshing) return;
      if (!state.secret && !Array.from(document.querySelectorAll('input[type="password"]')).some(input => input.value)) {
        refreshing = true; window.location.reload();
      } else showToast('Nova versão disponível. Reabra o app quando terminar.');
    });
    navigator.serviceWorker.register('./sw.js?v=property-v76', { scope: './', updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Property: cache offline indisponível.', error));
  }
  function wireEvents() {
    state.imageViewer = ImageViewer.create({ dialog: $('image-viewer-dialog'), view: $('image-viewer-view'),
      image: $('image-viewer-image'), title: $('image-viewer-title'), closeButton: $('image-viewer-close') });
    const openNewChatDialog = () => {
      const dialog = $('new-chat-dialog');
      if (!dialog.open) dialog.showModal();
      updatePeerNip05LookupButton();
      requestAnimationFrame(() => $('peer-input').focus());
    };
    $('property-app-chess-open').addEventListener('click', () => openPropertyAppChatPicker().catch(error => showToast(error.message || localized('Could not open the app contact picker.', 'Não foi possível abrir a seleção de contatos do aplicativo.'))));
    $('property-app-chat-picker-close').addEventListener('click', () => $('property-app-chat-picker').close());
    $('property-app-chat-picker-new').addEventListener('click', () => {
      $('property-app-chat-picker').close();
      setActiveView('messages');
      $('agent-mode').checked = false;
      openNewChatDialog();
    });
    $('peer-input').addEventListener('input', () => {
      peerNip05LookupId += 1;
      $('peer-nip05-status').textContent = '';
      $('new-chat-error').textContent = '';
      updatePeerNip05LookupButton();
    });
    $('new-chat-dialog').addEventListener('close', () => {
      peerNip05LookupId += 1;
      updatePeerNip05LookupButton();
    });
    $('resolve-peer-nip05').addEventListener('click', () => resolvePeerNip05());
    const openContactShareDialog = () => {
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
      } catch (error) {
        const message = error.message || localized('Could not create the contact link.', 'Não foi possível criar o link de contato.');
        if ($('profile-dialog').open) showError('profile-error', message);
        else showToast(message);
      }
    };
    Pwa.bindInstallControls(document.querySelectorAll('[data-install-property]'), $('install-app-dialog'), () => showToast('Property installed.'));
    $('audio-call-button').addEventListener('click', () => openCallConsent(false));
    $('video-call-button').addEventListener('click', () => openCallConsent(true));
    $('call-consent-cancel').addEventListener('click', () => {
      state.pendingCallPeer = '';
      state.pendingCallVideo = false;
      $('call-consent-dialog').close();
    });
    $('call-consent-continue').addEventListener('click', () => beginOutgoingCall());
    $('call-consent-dialog').addEventListener('cancel', () => {
      state.pendingCallPeer = '';
      state.pendingCallVideo = false;
    });
    $('incoming-call-decline').addEventListener('click', () => declineIncomingCall());
    $('incoming-call-audio').addEventListener('click', () => answerIncomingCall(false));
    $('incoming-call-video').addEventListener('click', () => answerIncomingCall(true));
    $('incoming-call-dialog').addEventListener('cancel', event => {
      event.preventDefault();
      void declineIncomingCall();
    });
    $('call-end-button').addEventListener('click', () => {
      state.callController?.end().catch(error => showToast(error.message || localized('Could not end the call cleanly.', 'Não foi possível encerrar a chamada corretamente.')));
    });
    $('call-session-close').addEventListener('click', () => state.callController?.dismiss());
    $('call-session-minimize').addEventListener('click', () => {
      if (!state.call || callTerminal(state.call.status)) return;
      callWindow.minimize();
      $('call-session-dialog').close();
    });
    $('call-mini-restore').addEventListener('click', () => {
      if (!state.call) return;
      callWindow.restore();
      $('call-session-dialog').showModal();
    });
    $('call-mini-microphone').addEventListener('click', () => {
      const call = state.call;
      if (call && !callTerminal(call.status)) state.callController?.setMicrophoneEnabled(!call.microphoneEnabled);
    });
    $('call-mini-camera').addEventListener('click', () => {
      const call = state.call;
      if (call && !callTerminal(call.status)) state.callController?.setCameraEnabled(!call.cameraEnabled);
    });
    $('call-mini-screen-share').addEventListener('click', () => {
      const call = state.call;
      if (!call || callTerminal(call.status)) return;
      const operation = call.screenSharing
        ? state.callController?.stopScreenSharing()
        : state.callController?.startScreenSharing();
      operation?.catch(error => showToast(error?.message || localized('Could not change screen sharing.', 'Não foi possível alterar o compartilhamento de tela.')));
    });
    $('call-mini-end').addEventListener('click', () => {
      if (!state.call || callTerminal(state.call.status)) return;
      state.callController?.end().catch(error => showToast(error.message || localized('Could not end the call cleanly.', 'Não foi possível encerrar a chamada corretamente.')));
    });
    $('call-mini-dismiss').addEventListener('click', () => state.callController?.dismiss());
    $('call-session-dialog').addEventListener('cancel', event => {
      if (state.call && !callTerminal(state.call.status)) {
        event.preventDefault();
        state.callController?.end().catch(() => {});
      } else state.callController?.dismiss();
    });
    $('call-microphone-toggle').addEventListener('click', () => {
      const call = state.call;
      if (call) state.callController?.setMicrophoneEnabled(!call.microphoneEnabled);
    });
    $('call-camera-toggle').addEventListener('click', () => {
      const call = state.call;
      if (call) state.callController?.setCameraEnabled(!call.cameraEnabled);
    });
    $('call-device-settings').addEventListener('toggle', () => {
      if ($('call-device-settings').open) void refreshCallDeviceSettings();
    });
    $('call-audio-input').addEventListener('change', () => {
      const selectedId = $('call-audio-input').value;
      const result = state.callController?.setAudioInputDevice(selectedId);
      Promise.resolve(result).then(ok => {
        if (!ok) {
          $('call-audio-input').value = state.call?.audioInputId === 'default' ? '' : (state.call?.audioInputId || '');
          showToast(state.call?.error || localized('Could not switch the microphone.', 'Não foi possível trocar o microfone.'));
        }
        return refreshCallDeviceSettings();
      }).catch(error => showToast(error?.message || localized('Could not switch the microphone.', 'Não foi possível trocar o microfone.')));
    });
    $('call-video-input').addEventListener('change', () => {
      const result = state.callController?.setVideoInputDevice($('call-video-input').value);
      Promise.resolve(result).then(ok => {
        if (!ok) {
          $('call-video-input').value = state.call?.videoInputId === 'default' ? '' : (state.call?.videoInputId || '');
          showToast(state.call?.error || localized('Could not switch the camera.', 'Não foi possível trocar a câmera.'));
        }
        return refreshCallDeviceSettings();
      }).catch(error => showToast(error?.message || localized('Could not switch the camera.', 'Não foi possível trocar a câmera.')));
    });
    $('call-audio-output').addEventListener('change', () => {
      const result = state.callController?.setAudioOutputDevice($('call-audio-output').value);
      Promise.resolve(result).then(ok => {
        if (!ok) {
          $('call-audio-output').value = state.call?.audioOutputId === 'default' ? '' : (state.call?.audioOutputId || '');
          showToast(state.call?.error || localized('Could not switch the speaker.', 'Não foi possível trocar a saída de áudio.'));
        }
        return refreshCallDeviceSettings();
      }).catch(error => showToast(error?.message || localized('Could not switch the speaker.', 'Não foi possível trocar a saída de áudio.')));
    });
    globalThis.navigator?.mediaDevices?.addEventListener?.('devicechange', () => {
      if ($('call-device-settings').open) void refreshCallDeviceSettings();
    });
    $('call-screen-share-toggle').addEventListener('click', () => {
      const call = state.call;
      if (!call) return;
      const operation = call.screenSharing
        ? state.callController?.stopScreenSharing()
        : state.callController?.startScreenSharing();
      operation?.catch(error => showToast(error?.message || localized('Could not change screen sharing.', 'Não foi possível alterar o compartilhamento de tela.')));
    });
    emojiPicker = EmojiPicker.init({ owner: () => state.pubkey, onError: error => showToast(error?.message || 'Could not send reaction.') });
    groupMentionPicker = GroupMentions.createPicker({
      input: $('message-input'), panel: $('group-mention-picker'),
      enabled: () => state.currentConversation?.group === true,
      getCandidates: groupMentionCandidates,
      localize: (english, portuguese) => localized(english, portuguese)
    });
    $('messages').addEventListener('scroll', updateMessageScrollButton, { passive: true });
    $('message-scroll-bottom').addEventListener('click', () => {
      const container = $('messages');
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      state.unseenMessageCount = 0;
      updateMessageScrollButton();
    });
    window.addEventListener('property-contact-intent', event => {
      const contact = typeof event.detail?.value === 'string' ? event.detail.value : '';
      if (!contact) return;
      Pwa.consumeContactIntent();
      if (!state.pubkey) { state.pendingContactIntent = contact; return; }
      state.pendingContactIntent = '';
      state.pendingLaunchAction = '';
      openContactIntent(contact);
    });
    window.addEventListener('property-group-invite-intent', event => {
      const invite = typeof event.detail?.value === 'string' ? event.detail.value : '';
      if (!invite) return;
      Pwa.consumeGroupInviteIntent();
      if (!state.secret) { state.pendingGroupInviteIntent = invite; return; }
      state.pendingGroupInviteIntent = '';
      state.pendingLaunchAction = '';
      void showGroupInvitePreview(invite);
    });
    document.addEventListener('click', event => {
      const card = event.target?.closest?.('button[data-nostr-profile-code]');
      if (!card) return;
      openContactIntent(card.getAttribute('data-nostr-profile-code') || '');
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
    $('profile-button').addEventListener('click', () => {
      $('profile-dialog').showModal();
      renderNotificationSettings().catch(() => {});
      renderAppBadgeSettings().catch(() => {});
    });
    $('profile-notifications-toggle').addEventListener('click', () => toggleBrowserNotifications());
    $('profile-app-badge-toggle').addEventListener('click', () => toggleAppBadge());
    $('typing-indicators-enabled').addEventListener('change', async event => {
      const enabled = event.target.checked;
      state.typingIndicatorsEnabled = enabled;
      try {
        await put('settings', { id: typingPreferenceId(), enabled });
        if (!enabled) { stopLocalTyping(); stopLocalRecordingSignal(); }
        else if (state.voiceRecorder && state.voiceRecorderPeer === state.activePeer && !state.voiceRecorder.isPaused()) {
          startLocalRecordingSignal(state.voiceRecorderPeer);
        }
      } catch {
        state.typingIndicatorsEnabled = !enabled;
        event.target.checked = !enabled;
        showToast(localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.'));
      }
    });
    $('read-receipts-enabled').addEventListener('change', async event => {
      const enabled = event.target.checked;
      state.readReceiptsEnabled = enabled;
      try {
        await put('settings', { id: readReceiptsPreferenceId(), enabled });
        observeReadReceiptRows();
        if (enabled) sendReadReceiptsForVisibleRows();
      } catch {
        state.readReceiptsEnabled = !enabled;
        event.target.checked = !enabled;
        observeReadReceiptRows();
        showToast(localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.'));
      }
    });
    $('active-status-enabled').addEventListener('change', async event => {
      const enabled = event.target.checked;
      if (!enabled) stopLocalPresence();
      state.activeStatusEnabled = enabled;
      try {
        await put('settings', { id: activeStatusPreferenceId(), enabled });
        if (enabled) startLocalPresence();
      } catch {
        state.activeStatusEnabled = !enabled;
        event.target.checked = !enabled;
        if (state.activeStatusEnabled) startLocalPresence();
        else stopLocalPresence();
        showToast(localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.'));
      }
    });
    $('notification-mute-dialog').addEventListener('close', () => { state.notificationMutePeer = ''; });
    document.querySelectorAll('[data-notification-mute-choice]').forEach(button => {
      button.addEventListener('click', () => setConversationMute(button.dataset.notificationMuteChoice));
    });
    $('notification-mute-unmute').addEventListener('click', () => clearConversationMute().catch(() => {
      $('notification-mute-status').textContent = localized('Could not update this local setting.', 'Não foi possível atualizar esta configuração local.');
    }));
    $('chat-details-button').addEventListener('click', () => openChatDetails().catch(error => showToast(error.message || localized('Could not open conversation details.', 'Não foi possível abrir os detalhes da conversa.'))));
    $('chat-title').addEventListener('click', async () => {
      try {
        await openChatDetails();
        if (!state.activePeer || !$('chat-details-dialog').open) return;
        $('chat-local-name').focus({ preventScroll: true });
        $('chat-local-name').select();
      } catch (error) {
        showToast(error.message || localized('Could not edit this local name.', 'Não foi possível editar este nome local.'));
      }
    });
    $('group-invite-generate').addEventListener('click', () => createGroupInviteLink().catch(() => {
      $('group-invite-status').textContent = localized('Check the public key and try again. The room was not changed.', 'Confira a chave pública e tente novamente. A sala não foi alterada.');
    }));
    $('group-invite-copy').addEventListener('click', async () => {
      const value = $('group-invite-link').value;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast(localized('Encrypted group invite link copied.', 'Link de convite criptografado copiado.'));
      } catch {
        $('group-invite-link').focus();
        $('group-invite-link').select();
        $('group-invite-status').textContent = localized('Select the highlighted link and copy it from your browser menu.', 'Selecione o link destacado e copie pelo menu do navegador.');
      }
    });
    $('group-invite-show-qr').addEventListener('click', () => {
      try {
        const link = $('group-invite-link').value;
        if (!link) return;
        $('group-invite-qr').replaceChildren(QrCode.createSvg(link, localized('QR code for an encrypted group invitation', 'QR code para convite de grupo criptografado')));
        $('group-invite-qr').hidden = false;
      } catch {
        $('group-invite-status').textContent = localized('This invitation link is too large for a QR code. Copy the link instead.', 'Este link de convite é grande demais para um QR code. Copie o link.');
      }
    });
    $('group-invite-accept').addEventListener('click', () => acceptGroupInvite().catch(() => {
      $('group-invite-preview-status').textContent = localized('Could not save this group on the device.', 'Não foi possível salvar este grupo no aparelho.');
    }));
    $('group-invite-decline').addEventListener('click', () => {
      state.pendingGroupInvite = null;
      $('group-invite-preview-dialog').close();
    });
    $('group-invite-preview-dialog').addEventListener('close', () => { state.pendingGroupInvite = null; });
    $('load-chat-public-profile').addEventListener('click', () => loadChatPublicProfile());
    $('verify-profile-nip05').addEventListener('click', () => verifyOwnNip05());
    $('copy-github-proof-text').addEventListener('click', () => copyGitHubVerificationText().catch(() => {
      $('profile-nip39-status').textContent = localized('Could not prepare the verification text.', 'Não foi possível preparar o texto de verificação.');
    }));
    $('publish-github-identity').addEventListener('click', () => publishGitHubIdentity());
    $('profile-nip05').addEventListener('input', resetOwnNip05Check);
    $('verify-chat-nip05').addEventListener('click', () => verifyPeerNip05());
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
      renderIceSettings();
      $('relay-dialog').showModal();
    };
    $('open-settings').addEventListener('click', openRelaySettings);
    $('mobile-open-settings').addEventListener('click', openRelaySettings);
    $('first-use-open-relays').addEventListener('click', openRelaySettings);
    $('language-picker').addEventListener('change', renderFirstUseRelaySuggestions);
    $('language-picker').addEventListener('change', () => {
      renderChatDetailsForCurrentLanguage();
      renderIceSettings();
    });
    $('create-folder-button').addEventListener('click', () => openFolderEditor());
    $('folder-save').addEventListener('click', () => saveFolderEditor());
    $('folder-name-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveFolderEditor(); } });
    $('move-folder-save').addEventListener('click', () => saveMovedConversationFolder());
    $('move-folder-dialog').addEventListener('close', () => { state.folderMovingConversation = ''; });
    $('save-relays').addEventListener('click', async () => {
      try { await saveRelaySettings(parseRelayList($('relay-input').value)); $('relay-dialog').close(); showError('relay-error'); }
      catch (error) { showError('relay-error', error.message); }
    });
    $('save-ice-settings').addEventListener('click', () => saveIceSettings());
    $('publish-inbox-list').addEventListener('click', () => publishInboxRelayList().catch(error => showError('relay-error', error.message || 'Falha ao publicar a lista NIP-17.')));
    $('use-default-relays').addEventListener('click', () => {
      const selection = RelayDefaults.pick();
      $('relay-input').value = selection.join('\n');
      if (!state.inboxRelays.length) $('dm-relay-input').value = selection.slice(0, 3).join('\n');
    });
    $('new-chat-button').addEventListener('click', openNewChatDialog);
    $('mobile-new-chat-button').addEventListener('click', openNewChatDialog);
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
    $('empty-new-chat').addEventListener('click', openNewChatDialog);
    $('empty-join-chat').addEventListener('click', openNewChatDialog);
    $('empty-share-contact').addEventListener('click', openContactShareDialog);
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
        $('new-chat-dialog').close(); $('peer-input').value = ''; $('peer-name-input').value = ''; $('peer-relays-input').value = ''; $('agent-mode').checked = false; $('peer-nip05-status').textContent = ''; updatePeerNip05LookupButton(); showError('new-chat-error');
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
    $('voice-record-button').addEventListener('click', () => startVoiceRecording());
    $('voice-record-pause').addEventListener('click', () => toggleVoiceRecording());
    $('voice-record-stop').addEventListener('click', () => finishVoiceRecording());
    $('voice-record-cancel').addEventListener('click', () => cancelVoiceRecording({ notify: true }));
    $('voice-discard-button').addEventListener('click', () => clearVoiceDraft());
    $('voice-send-button').addEventListener('click', () => sendVoiceDraft());
    $('payment-card-button').addEventListener('click', () => {
      $('payment-card-error').textContent = '';
      updatePaymentCardNetworks();
      $('payment-card-dialog').showModal();
    });
    for (const input of document.querySelectorAll('input[name="payment-card-currency"]')) input.addEventListener('change', updatePaymentCardNetworks);
    $('payment-card-prev').addEventListener('click', () => movePaymentCurrency(-1));
    $('payment-card-next').addEventListener('click', () => movePaymentCurrency(1));
    $('payment-card-close').addEventListener('click', () => $('payment-card-dialog').close());
    $('payment-card-cancel').addEventListener('click', () => $('payment-card-dialog').close());
    $('payment-card-insert').addEventListener('click', insertPaymentCardDraft);
    $('payment-card-dialog').addEventListener('close', () => {
      $('payment-card-address').value = '';
      $('payment-card-amount').value = '';
      $('payment-card-note').value = '';
      $('payment-card-error').textContent = '';
    });
    $('attach-file-button').addEventListener('click', () => $('attach-file-input').click());
    $('file-attachment-add').addEventListener('click', () => $('attach-file-input').click());
    $('attach-file-input').addEventListener('change', event => {
      const files = event.target.files;
      if (files?.length) addFileDrafts(files);
      event.target.value = '';
    });
    const closeFileDialog = () => {
      if (state.fileSendBusy) return;
      clearFileDrafts();
      $('file-attachment-dialog').close();
      $('attach-file-button').focus();
    };
    $('file-attachment-close').addEventListener('click', closeFileDialog);
    $('file-attachment-cancel').addEventListener('click', closeFileDialog);
    $('file-attachment-send').addEventListener('click', () => sendFileDrafts());
    $('file-attachment-send-direct').addEventListener('click', requestDirectFileSend);
    $('file-direct-cancel-transfer').addEventListener('click', () => cancelDirectFileSend());
    $('file-direct-consent-continue').addEventListener('click', () => beginDirectFileSend());
    $('file-direct-consent-cancel').addEventListener('click', () => {
      state.pendingDirectFileRequest = null;
      $('file-direct-consent-dialog').close();
    });
    $('file-direct-consent-dialog').addEventListener('cancel', event => {
      event.preventDefault();
      state.pendingDirectFileRequest = null;
      $('file-direct-consent-dialog').close();
    });
    $('incoming-direct-file-accept').addEventListener('click', () => acceptIncomingDirectFiles());
    $('incoming-direct-file-decline').addEventListener('click', () => declineIncomingDirectFiles());
    $('incoming-direct-file-cancel').addEventListener('click', () => cancelIncomingDirectFiles());
    $('incoming-direct-file-dialog').addEventListener('cancel', event => {
      event.preventDefault();
      if (state.directFileTransfer?.direction === 'incoming' && state.directFileTransfer.status !== 'incoming') void cancelIncomingDirectFiles();
      else void declineIncomingDirectFiles();
    });
    $('file-attachment-dialog').addEventListener('cancel', event => {
      if (state.fileSendBusy) { event.preventDefault(); return; }
      clearFileDrafts();
    });
    $('file-attachment-dialog').addEventListener('close', () => {
      if (!state.fileSendBusy && state.fileDraftFiles.length) clearFileDrafts();
    });
    $('message-input').addEventListener('paste', event => {
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      event.preventDefault();
      if (addFileDrafts(files)) {
        const pastedText = event.clipboardData.getData('text/plain').trim();
        if (pastedText && !$('file-attachment-caption').value) $('file-attachment-caption').value = pastedText.slice(0, FileTransfers.MAX_CAPTION_CHARS);
      }
    });
    $('file-attachment-dialog').addEventListener('paste', event => {
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      event.preventDefault();
      if (addFileDrafts(files)) {
        const pastedText = event.clipboardData.getData('text/plain').trim();
        if (pastedText && !$('file-attachment-caption').value) $('file-attachment-caption').value = pastedText.slice(0, FileTransfers.MAX_CAPTION_CHARS);
      }
    });
    $('messages-view').addEventListener('dragover', event => {
      if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
    });
    $('messages-view').addEventListener('drop', event => {
      const files = event.dataTransfer?.files;
      if (!files?.length) return;
      event.preventDefault();
      addFileDrafts(files);
    });
    $('link-preview-button').addEventListener('click', () => {
      const url = LinkPreview?.firstLink($('message-input').value);
      if (!url || !state.activePeer || state.editingMessage) return;
      $('link-preview-consent-url').textContent = url;
      $('link-preview-consent-dialog').showModal();
    });
    $('link-preview-consent-close').addEventListener('click', () => $('link-preview-consent-dialog').close());
    $('link-preview-consent-cancel').addEventListener('click', () => $('link-preview-consent-dialog').close());
    $('link-preview-consent-dialog').addEventListener('cancel', event => { event.preventDefault(); $('link-preview-consent-dialog').close(); });
    $('link-preview-consent-fetch').addEventListener('click', () => {
      const consentedUrl = $('link-preview-consent-url').textContent;
      const currentUrl = LinkPreview?.firstLink($('message-input').value);
      $('link-preview-consent-dialog').close();
      if (!consentedUrl || currentUrl !== consentedUrl) { updateLinkPreviewDraft(); return; }
      void fetchComposerLinkPreview();
    });
    $('send-form').addEventListener('submit', async event => {
      event.preventDefault(); const input = $('message-input'); const text = input.value.trim(); const peer = state.activePeer; const replyTo = state.replyingTo; if (!text || !peer) return;
      stopLocalTyping();
      const mentionTokens = state.currentConversation?.group === true ? trimmedComposerMentions(text) : [];
      if (state.editingMessage) {
        const editing = state.editingMessage;
        const submit = document.querySelector('#send-form button[type="submit"]'); submit.disabled = true;
        try {
          const result = await editPrivateMessage(peer, editing.message, text, mentionTokens);
          if (result.cancelled) return;
          if (result.noRecipientAck) {
            showToast(localized('No recipient inbox relay confirmed the edit. The original message remains unchanged here.', 'Nenhum relay de recebimento confirmou a edição. A mensagem original continua neste aparelho.'));
            return;
          }
          if (result.unchanged) showToast(localized('The edited text is the same; nothing was sent.', 'O texto não mudou; nada foi enviado.'));
          const draft = state.editingDraft;
          const draftMentions = state.editingDraftMentions;
          state.replyingTo = state.editingReplyingTo;
          state.editingMessage = null; state.editingDraft = ''; state.editingDraftMentions = [];
          state.editingReplyingTo = null;
          updateEditContext();
          updateReplyContext();
          groupMentionPicker?.setDraft(draft, draftMentions);
          resizeMessageInput(input);
          await saveChatDraft(peer, input.value, draftMentions).catch(() => {});
          if (result.updated && result.confirmed < result.required) showToast(localized('Message edit sent to some recipients; delivery was partial.', 'A edição foi enviada a alguns participantes; a entrega foi parcial.'));
        } catch (error) { showToast(error.message || localized('Could not edit this message.', 'Não foi possível editar esta mensagem.')); }
        finally { submit.disabled = false; }
        return;
      }
      const sentShareId = state.shareDraftPeer === peer ? state.shareDraftId : '';
      const previewForMessage = !state.editingMessage && state.linkPreviewUrl === LinkPreview?.firstLink(text) ? state.linkPreview : null;
      const submit = document.querySelector('#send-form button[type="submit"]'); submit.disabled = true;
      try {
        const result = await sendPrivateMessage(peer, text, replyTo, { mentionTokens }, previewForMessage);
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
            const restoredDraft = sentShareId ? await loadChatDraftDetails(peer).catch(() => ({ text: '', mentions: [] })) : { text: '', mentions: [] };
            groupMentionPicker?.setDraft(restoredDraft.text, restoredDraft.mentions);
            resizeMessageInput(input);
            clearLinkPreviewDraft();
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
      resetOwnNip05Check();
      resetPeerNip05Check(state.peerProfiles.get(state.chatDetailsPeer));
      if (state.currentConversation) await updateConversationHeader(state.currentConversation);
      updateReplyContext(); await renderConversations();
      if (state.activePeer) await renderMessages(state.activePeer);
      if (state.activeView === 'saved') await renderSavedMessages();
      if (state.call) updateCallState(state.call);
    }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' && state.activeView === 'messages' && state.activePeer) {
        markConversationRead(state.activePeer).then(changed => changed && renderConversations()).catch(() => {});
        sendReadReceiptsForVisibleRows();
      }
    });
    $('message-input').addEventListener('keydown', event => {
      if (groupMentionPicker?.handleKeyDown(event)) return;
      const input = $('message-input');
      const overlayOpen = Boolean(document.querySelector('dialog[open]')) || !($('emoji-picker-panel')?.classList.contains('hidden'));
      if (!ChatGestures.isEditLastShortcut(event, input.value, { editing: Boolean(state.editingMessage) || state.loadingLastMessageEdit, overlayOpen })) return;
      event.preventDefault();
      editLastMessage().catch(error => showToast(error.message || localized('Could not edit this message.', 'Não foi possível editar esta mensagem.')));
    });
    $('message-input').addEventListener('input', event => {
      renderVoiceComposer();
      groupMentionPicker?.handleInput();
      resizeMessageInput(event.target);
      updateLinkPreviewDraft();
      noteLocalTyping();
      if (state.activePeer && !state.editingMessage) void saveChatDraft(state.activePeer, event.target.value).catch(() => {});
    });
    $('message-input').addEventListener('blur', () => stopLocalTyping());
    document.querySelectorAll('[data-format-marker]').forEach(button => button.addEventListener('click', () => {
      const input = $('message-input');
      if (!RichText.wrapSelection(input, button.dataset.formatMarker)) return;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }));
    $('conversation-search').addEventListener('input', renderConversations);
    $('message-delete-close').addEventListener('click', () => $('message-delete-dialog').close());
    $('message-delete-cancel').addEventListener('click', () => $('message-delete-dialog').close());
    $('message-delete-dialog').addEventListener('close', () => { state.pendingMessageDeletion = null; $('message-delete-confirm').disabled = false; });
    $('message-delete-confirm').addEventListener('click', async () => {
      const pending = state.pendingMessageDeletion;
      if (!pending || pending.identity !== state.pubkey) { $('message-delete-dialog').close(); return; }
      state.pendingMessageDeletion = null;
      $('message-delete-confirm').disabled = true;
      $('message-delete-dialog').close();
      try { await deletePrivateMessageForEveryone(pending.peer, pending.message); }
      catch (error) { showToast(error.message || localized('Could not send the deletion request.', 'Não foi possível enviar o pedido de exclusão.')); }
      finally { $('message-delete-confirm').disabled = false; }
    });
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
    $('now-playing-play').addEventListener('click', () => {
      const current = audioPlayback.getState();
      if (current) void audioPlayback.toggle(current);
    });
    $('now-playing-open').addEventListener('click', () => {
      const current = audioPlayback.getState();
      if (!current?.peer) return;
      setActiveView('messages');
      void selectConversation(current.peer, current.messageId).catch(error => showToast(error.message || localized('Could not open that conversation.', 'Não foi possível abrir essa conversa.')));
    });
    $('now-playing-seek').addEventListener('input', event => audioPlayback.seek(Number(event.target.value)));
    $('now-playing-rate').addEventListener('click', () => audioPlayback.cycleRate());
    $('now-playing-close').addEventListener('click', () => audioPlayback.stop());
    document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => setActiveView(button.dataset.view)));
    $('refresh-hangout').addEventListener('click', () => refreshHangout().catch(error => showToast(error.message || 'Falha ao carregar o Hangout.')));
    $('refresh-communities').addEventListener('click', () => discoverCommunities().catch(error => {
      $('community-status').textContent = error.message || localized('Could not discover communities.', 'Não foi possível buscar comunidades.');
      renderCommunityList();
    }));
    $('open-community-link').addEventListener('click', () => openCommunityReference().catch(error => {
      $('community-status').textContent = error.message || localized('Could not open this group link.', 'Não foi possível abrir este link de grupo.');
    }));
    $('community-link-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); openCommunityReference().catch(error => { $('community-status').textContent = error.message; }); }
    });
    $('community-back').addEventListener('click', () => {
      state.activeCommunity = null; state.activeCommunityEvents = []; state.activeCommunityModerators.clear(); state.communityInviteCode = '';
      $('community-room').classList.add('hidden'); $('community-list').hidden = false; $('community-invite-code').value = ''; $('community-post-text').value = '';
    });
    $('community-refresh-room').addEventListener('click', () => refreshCommunityRoom().catch(error => showToast(error.message || localized('Could not refresh this community.', 'Não foi possível atualizar esta comunidade.'))));
    $('community-invite-code').addEventListener('input', () => {
      if (state.activeCommunity) $('community-join').disabled = state.activeCommunity.closed && !$('community-invite-code').value.trim();
    });
    $('community-join').addEventListener('click', () => requestCommunityJoin().catch(error => showToast(error.message || localized('Could not request to join.', 'Não foi possível solicitar entrada.'))));
    $('community-leave').addEventListener('click', () => requestCommunityLeave().catch(error => showToast(error.message || localized('Could not request to leave.', 'Não foi possível solicitar saída.'))));
    $('community-post-button').addEventListener('click', () => publishCommunityPost().catch(error => showToast(error.message || localized('Could not publish this post.', 'Não foi possível publicar esta mensagem.'))));
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
    $('load-public-profile').addEventListener('click', () => loadOwnPublicProfile().catch(error => showError('profile-error', error.message || localized('Could not load the public profile.', 'Não foi possível carregar o perfil público.'))));
    $('save-profile').addEventListener('click', () => {
      showError('profile-error');
      savePublicProfile().catch(error => showError('profile-error', error.message || localized('Could not save the profile.', 'Não foi possível salvar o perfil.')));
    });
    $('export-backup').addEventListener('click', exportBackupWithPassword);
    $('copy-npub').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.npub); showToast('npub copiado.'); } catch { showError('profile-error', state.npub); } });
    $('message-details-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.messageDetailsPayload);
        showToast(localized('Message metadata copied. No message text or private key was included.', 'Metadados copiados. O texto da mensagem e a chave privada não foram incluídos.'));
      } catch { showToast(localized('Clipboard access is unavailable in this browser.', 'A área de transferência não está disponível neste navegador.')); }
    });
    $('share-contact').addEventListener('click', openContactShareDialog);
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
      if (document.hidden && state.voiceRecorder) cancelVoiceRecording({ notify: true });
      if (document.hidden) stopLocalPresence();
      if (document.hidden) stopLocalTyping();
      if (document.hidden && state.activePeer) void saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
      if (!document.hidden && state.pubkey) { resetIdleLock(); for (const url of effectiveRelayUrls()) connectRelay(url); startLocalPresence(); }
    });
    window.addEventListener('pagehide', () => {
      if (state.voiceRecorder) cancelVoiceRecording();
      if (state.call && !callTerminal(state.call.status)) state.callController?.end().catch(() => {});
      else state.callController?.dispose();
      stopLocalPresence();
      stopLocalTyping();
      if (state.activePeer) void saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
    });
    for (const eventName of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(eventName, resetIdleLock, { passive: true });
  }
  async function boot() {
    if (!N || !N.nip17 || !TypingSignals || typeof TypingSignals.create !== 'function' || typeof TypingSignals.summarizeActivity !== 'function' || typeof TypingSignals.createPresence !== 'function' || typeof TypingSignals.createCallSignal !== 'function' || typeof TypingSignals.createFileSignal !== 'function' || typeof TypingSignals.unwrap !== 'function' || !Calls || typeof Calls.create !== 'function' || !DirectTransfer || typeof DirectTransfer.create !== 'function' || !DirectFileEnvelope || typeof DirectFileEnvelope.create !== 'function' || typeof DirectFileEnvelope.validate !== 'function' || !ImageViewer || typeof ImageViewer.create !== 'function' || !N.nip19 || !Vault || !Routing || !Bridge || !bridge || !Nano || !Money || !Marketplace || !AgentMessages || !RelayDefaults || !ShareInbox || !Pwa || typeof Pwa.consumeGroupInviteIntent !== 'function' || !GroupInvites || typeof GroupInvites.createInvitation !== 'function' || typeof GroupInvites.openInvitation !== 'function' || !FolderStore || !ChatDrafts || !GroupMentions || typeof GroupMentions.createPicker !== 'function' || !NotificationPrefs || typeof NotificationPrefs.createMuteRecord !== 'function' || !AppBadge || typeof AppBadge.unreadCount !== 'function' || !MessageDays || typeof MessageDays.dayLabel !== 'function' || !MessageScroll || typeof MessageScroll.classifyUpdate !== 'function' || !RichText || typeof RichText.locationText !== 'function' || !LocationCards || typeof LocationCards.render !== 'function' || !MessageForwards || typeof MessageForwards.fromTags !== 'function' || typeof MessageForwards.toTag !== 'function' || !VoiceMessages || typeof VoiceMessages.createTag !== 'function' || typeof VoiceMessages.nextPlaybackRate !== 'function' || !FileTransfers || typeof FileTransfers.createTransfer !== 'function' || typeof FileTransfers.fromTags !== 'function' || typeof FileTransfers.assemble !== 'function' || typeof FileTransfers.coalesceMessages !== 'function' || !window.PropertyNostrEntities || !MessageEdits || typeof MessageEdits.createNip17Edit !== 'function' || !SecretGuard || typeof SecretGuard.findSecret !== 'function' || !QrCode || !EmojiPicker || typeof EmojiPicker.init !== 'function' || !ChatGestures || typeof ChatGestures.shouldReplySwipe !== 'function' || typeof ChatGestures.isEditLastShortcut !== 'function' || typeof Contact?.parsePublicKey !== 'function' || !PublicProfile || typeof PublicProfile.latest !== 'function' || typeof PublicProfile.latestRecord !== 'function') { $('auth-error').textContent = 'Os arquivos locais do protocolo, dos relays ou de contatos não carregaram. Recarregue o pacote do Property.'; return; }
    wireEvents();
    state.pendingLaunchAction = Pwa.consumeLaunchAction();
    state.pendingContactIntent = Pwa.consumeContactIntent();
    state.pendingGroupInviteIntent = Pwa.consumeGroupInviteIntent();
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
  document.getElementById('active-tab-reload')?.addEventListener('click', () => window.location.reload());
  document.addEventListener('DOMContentLoaded', () => startWithActiveTabLock(boot));
})();
