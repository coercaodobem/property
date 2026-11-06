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
  const FileTransfers = window.PropertyFileTransfers;
  const MessageEdits = window.PropertyMessageEdits;
  const SecretGuard = window.PropertySecretGuard;
  const QrCode = window.PropertyQrCode;
  const Nip05 = window.PropertyNip05;
  const EmojiPicker = window.PropertyEmojiPicker;
  const ChatGestures = window.PropertyChatGestures;
  const TypingSignals = window.PropertyTypingSignals;
  const REACTION_OPTIONS = ['👍', '❤️', '😂', '🎉', '👀'];
  const MAX_NIP17_GROUP_MEMBERS = 10;
  const MAX_FILE_BATCH_FILES = 5;
  const MAX_FILE_BATCH_BYTES = 4 * 1024 * 1024;
  const eventSourceHints = new WeakMap();
  let emojiPicker = null;
  let groupMentionPicker = null;
  let reactionPickerSequence = 0;
  let ownNip05CheckId = 0;
  let peerNip05CheckId = 0;
  const state = {
    db: null, account: null, secret: null, pubkey: '', npub: '', relays: [],
    inboxRelays: [], peerInboxRelays: new Map(), peerRelayHints: new Map(),
    sockets: new Map(), fetchSubs: new Map(), pendingAcks: new Map(), activePeer: '',
    currentConversation: null,
    activeView: 'messages', toastTimer: 0, reconnectTimers: new Map(), unlocking: false, idleTimer: 0, replyingTo: null, editingMessage: null, editingDraft: '', editingDraftMentions: [], editingReplyingTo: null, forwardingMessage: null, autoSelectedRelays: false,
    typingIndicatorsEnabled: true, typingSession: null, typingSequence: 0, typingRelayLookups: new Map(), remoteTyping: new Map(), typingTimers: new Map(), typingSequences: new Map(), typingSeenEvents: new Set(),
    readReceiptsEnabled: false, readReceiptSent: new Set(), readReceipts: new Map(), readReceiptCandidates: new Map(), readReceiptObserver: null,
    activeStatusEnabled: false, localPresenceSession: null, remotePresence: new Map(), presenceTimers: new Map(), presenceSequences: new Map(),
    peerProfiles: new Map(), peerProfileLookupStatuses: new Map(), peerIdentityProofs: new Map(), identityProofChecks: new Map(), chatDetailsPeer: '', identityProofCheckId: 0,
    conversationFolders: null, folderEditingId: '', folderMovingConversation: '',
    messageSearchOpen: false, messageSearchIds: [], messageSearchIndex: -1,
    conversationMessageSearchCache: null, conversationMessageSearchRevision: 0,
    bridgeEnabled: false, bridgeSubscriptions: new Map(), bridgeRefreshTimer: 0, editingProduct: null, deletingProduct: null,
    storageReady: false, activeWorkspaceReady: false, notificationsEnabled: false, notificationMutes: new Map(), notificationMutePeer: '', appBadgeEnabled: false, appBadgeLastCount: null, appBadgeQueue: Promise.resolve(), messageDayRolloverTimer: 0, unseenMessageCount: 0, pendingLaunchAction: '', pendingContactIntent: '', contactShare: null, messageDetailsPayload: '', shareItems: [], shareDraftId: '', shareDraftPeer: '', pendingShareForNewChat: '', draftLoadSequence: 0, pendingSecretResolve: null, loadingLastMessageEdit: false, conversationListRenderSequence: 0,
    linkPreview: null, linkPreviewUrl: '', linkPreviewSequence: 0, linkPreviewBusy: false, linkPreviewStatus: '',
    voiceRecorder: null, voiceRecorderPeer: '', voiceRecorderStartedAt: 0, voiceTimer: 0, voiceStopping: false, voiceSequence: 0,
    voiceDrafts: new Map(), voiceObjectUrls: new Map(), fileObjectUrls: new Map(), fileDraftObjectUrls: new Map(), fileDraftTransferIds: new Map(), fileDraftFiles: [], fileSendBusy: false, fileTransferSeen: new Set(), activeConversationAgent: false, activeConversationBlocked: false
  };
  const SHARE_LAUNCH_ACTIONS = new Set(['share', 'share-full', 'share-error']);
  let propertyTabChannel = null;
  let propertyTabIsOwner = false;
  let pendingTabShareAction = '';
  let shareHandoffAnnounced = false;
  const N = window.NostrTools;
  const bridge = Bridge?.createBridge(event => N.verifyEvent(event));

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
  async function updateConversationHeader(conversation) {
    if (!conversation) return;
    state.currentConversation = conversation;
    const agentAccess = conversation.group ? null : await get('agentAccess', conversation.pubkey);
    state.activeConversationAgent = !conversation.group && (conversation.agent === true || agentAccess?.status === 'approved');
    $('chat-title').dataset.userContent = '';
    $('chat-title').textContent = conversationLabel(conversation);
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
      $('voice-recording-time').textContent = VoiceMessages.formatDuration(elapsed);
      $('voice-recording-label').textContent = state.voiceRecorderStartedAt
        ? localized('Recording', 'Gravando')
        : localized('Waiting for microphone permission…', 'Aguardando permissão do microfone…');
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
    send.disabled = state.fileSendBusy || state.fileDraftFiles.length === 0;
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
    if (combined.some(file => !Number.isSafeInteger(file.size) || file.size > FileTransfers.MAX_FILE_BYTES)) {
      showToast(localized('Each file must be 2 MiB or smaller.', 'Cada arquivo precisa ter no máximo 2 MiB.')); return false;
    }
    if (combined.reduce((total, file) => total + file.size, 0) > MAX_FILE_BATCH_BYTES) {
      showToast(localized('The combined file size must be 4 MiB or smaller.', 'O tamanho total dos arquivos precisa ser de no máximo 4 MiB.')); return false;
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
    $('file-attachment-caption').value = '';
    setFileAttachmentStatus('');
    renderFileDrafts();
  }
  function cancelVoiceRecording({ notify = false } = {}) {
    const recorder = state.voiceRecorder;
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
    state.voiceStopping = true;
    const sequence = state.voiceSequence;
    const peer = state.voiceRecorderPeer;
    clearVoiceTimer();
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
        clearFileDrafts();
        $('file-attachment-dialog').close();
        if (state.replyingTo) { state.replyingTo = null; updateReplyContext(); }
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
  function renderRemoteTyping() {
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
      const allThinking = senders.every(item => item.action === 'thinking');
      output.textContent = allThinking
        ? localized('Several people are thinking…', 'Várias pessoas estão pensando…')
        : localized('Several people are typing…', 'Várias pessoas estão digitando…');
      return;
    }
    const sender = senders[0].sender;
    const profile = state.peerProfiles.get(sender);
    const conversationName = state.currentConversation?.group === true ? '' : state.currentConversation?.title || '';
    const name = displayName(sender, conversationName || profile?.displayName || profile?.name || '');
    output.textContent = `${name} ${senders[0].action === 'thinking'
      ? localized('is thinking…', 'está pensando…')
      : localized('is typing…', 'está digitando…')}`;
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
  async function sendTypingSignal(session, action) {
    const senderPubkey = state.pubkey;
    const secret = state.secret;
    if (!senderPubkey || !secret || session.senderPubkey !== senderPubkey ||
        (action === 'typing' && !state.typingIndicatorsEnabled)) return;
    let deliveries;
    try { deliveries = TypingSignals.create(N, secret, session.participants, action, nextTypingSequence()); }
    catch { return; }
    await Promise.all(deliveries.map(async ({ recipient, event }) => {
      const relays = await resolveTypingRelays(recipient);
      if (!relays.length || state.pubkey !== senderPubkey || state.secret !== secret) return;
      await publishEphemeralToRelays(event, relays).catch(() => {});
    }));
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
    if (!state.secret || !state.pubkey || state.typingSeenEvents.has(event.id)) return;
    const signal = TypingSignals.unwrap(N, event, state.secret);
    if (!signal || signal.sender === state.pubkey) return;
    state.typingSeenEvents.add(event.id);
    if (state.typingSeenEvents.size > 500) state.typingSeenEvents.delete(state.typingSeenEvents.values().next().value);
    const group = signal.action === 'read' ? signal.group : signal.participants.length > 2;
    const peer = group ? groupConversationId(signal.participants) : signal.participants.find(member => member !== state.pubkey);
    if (!peer || (signal.action !== 'read' && peer !== state.activePeer)) return;
    const conversation = await get('conversations', peer).catch(() => null);
    if (!conversation || (conversation.group === true) !== group) return;
    if (group) {
      const knownMembers = [...new Set((conversation.members || []).map(key => String(key).toLowerCase()))].sort();
      if (knownMembers.length !== signal.participants.length || knownMembers.some((key, index) => key !== signal.participants[index])) return;
    } else if (conversation.pubkey !== signal.sender) return;
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
    clearTimeout(state.typingTimers.get(key));
    state.typingTimers.delete(key);
    state.remoteTyping.delete(key);
    if (signal.action === 'typing' || signal.action === 'thinking') {
      state.remoteTyping.set(key, { peer, sender: signal.sender, sequence: signal.sequence, action: signal.action });
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
    if (error?.code === 'nip05-http-error') return localized('The domain returned an unusable response. Redirects are not accepted.', 'O domínio retornou uma resposta inválida. Redirecionamentos não são aceitos.');
    if (error?.code === 'nip05-response-too-large') return localized('The domain response exceeded the size limit.', 'A resposta do domínio excedeu o limite de tamanho.');
    if (error?.code === 'nip05-invalid-response') return localized('The domain did not return a valid NIP-05 response.', 'O domínio não retornou uma resposta NIP-05 válida.');
    if (error?.code === 'nip05-network-error') return localized('Could not check the domain. The browser may block the request, for example because of CORS.', 'Não foi possível consultar o domínio. O navegador pode bloquear a solicitação, por exemplo por CORS.');
    return localized('The NIP-05 check is unavailable.', 'A consulta NIP-05 está indisponível.');
  }
  async function performNip05Check(identifier, pubkey, status, button, isCurrent) {
    button.disabled = true;
    status.textContent = localized('Checking the domain mapping…', 'Consultando o vínculo do domínio…');
    try {
      const result = await Nip05.check(identifier, pubkey);
      if (!isCurrent()) return;
      status.textContent = result.matches
        ? localized('The domain mapping matches this Nostr key. This does not verify a real-world identity.', 'O domínio aponta para esta chave Nostr. Isso não verifica uma identidade no mundo real.')
        : localized('The domain mapping does not match this Nostr key.', 'O domínio não aponta para esta chave Nostr.');
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
    return performNip05Check(identifier, peer, $('chat-profile-nip05-status'), $('verify-chat-nip05'), () =>
      checkId === peerNip05CheckId && $('chat-details-dialog').open && state.chatDetailsPeer === peer && state.peerProfiles.get(peer)?.nip05 === identifier
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
    state.secret = secret;
    resetIdleLock();
    state.pubkey = N.getPublicKey(secret);
    state.npub = N.nip19.npubEncode(state.pubkey);
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
    if (rumor.kind === 14 && rumor.pubkey !== state.pubkey) clearRemoteTyping(peer, rumor.pubkey);
    const existingConversation = await get('conversations', peer);
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
      const incoming = {
        id: `edit:${peer}:${edit.rootId}`, peer, text, ...(mentionTokens.length ? { mentions: mentionTokens } : {}), senderPubkey: rumor.pubkey,
        createdAt: rumor.created_at * 1000, direction: senderDirection, status: 'delivered',
        nostrEventId: eventId, edit, linkPreview: null,
        ...(forwardedHops ? { forwarded: forwardedHops } : {}),
        ...(replyTag ? { replyToId: replyTag[1] } : {})
      };
      const result = MessageEdits.applyIncomingEdit(await all('messages'), incoming, state.pubkey);
      if (!result.applied) return;
      message = result.message;
      await put('messages', message);
    } else {
      const id = parsedAgentMessage ? `agent:${peer}:${parsedAgentMessage.messageId}` : eventId;
      if (await get('messages', id)) return;
      const original = { id, peer, text, ...(voiceMessage ? { voiceMessage } : {}), ...(fileChunk ? { fileChunk } : {}), ...(mentionTokens.length ? { mentions: mentionTokens } : {}), senderPubkey: rumor.pubkey, createdAt: rumor.created_at * 1000, direction: senderDirection, status: senderDirection === 'sent' ? 'sent' : 'delivered', nostrEventId: eventId, linkPreview, ...(forwardedHops ? { forwarded: forwardedHops } : {}), ...(replyTag ? { replyToId: replyTag[1] } : {}), ...(fromAgent ? { fromAgent: true } : {}), ...(parsedAgentMessage ? { agentMessageId: parsedAgentMessage.messageId, inReplyTo: parsedAgentMessage.inReplyTo } : {}), ...(agentMessageError ? { agentMessageError } : {}) };
      const merged = MessageEdits.mergeOriginalBehindEdit(await all('messages'), original, state.pubkey);
      message = merged?.message || original;
      await put('messages', message);
    }
    const previous = existingConversation || { pubkey: peer, title: '' };
    const isLatest = !previous.lastAt || message.createdAt >= previous.lastAt;
    const previousUnreadCount = conversationUnreadCount(previous);
    const visibleConversation = hasVisibleConversation(peer);
    const unreadCount = edit || fileTransferAlreadyStored
      ? previousUnreadCount
      : senderDirection === 'received' && !visibleConversation
        ? Math.min(9999, previousUnreadCount + 1)
        : visibleConversation ? 0 : previousUnreadCount;
    const updatedConversation = { ...previous, unreadCount, ...(group ? { group: true, members } : {}), ...(subject ? { title: subject } : {}), ...(fromAgent ? { agent: true } : {}), ...(isLatest ? { lastMessage: fileChunk ? `📎 ${fileChunk.name}` : message.text, lastAt: message.createdAt } : {}) };
    await put('conversations', updatedConversation);
    await renderConversations();
    if (state.activePeer === peer) { await updateConversationHeader(updatedConversation); await updateAgentBlockControl(peer); await renderMessages(peer); }
    if (!edit && senderDirection === 'received' && !visibleConversation && !fileTransferAlreadyStored) await notifyIncomingMessage(peer);
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
    const messages = await all('messages');
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
    const preview = document.createElement('small'); preview.dataset.userContent = '';
    preview.textContent = messageMatch
      ? conversationSearchSnippet(messageMatch.text, search)
      : RichText.preview(conversation.lastMessage || (conversation.group ? `${conversation.members?.length || 0} ${window.PropertyI18n?.language === 'pt-BR' ? 'participantes' : 'members'}` : conversation.pubkey.slice(0, 16)));
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
      clearAllRemoteTyping();
      cancelMessageEdit();
      clearLinkPreviewDraft();
      closeMessageSearch(false);
      if (previousPeer) await saveChatDraft(previousPeer, $('message-input').value).catch(() => {});
    }
    if (state.shareDraftId && state.shareDraftPeer !== pubkey) { state.shareDraftId = ''; state.shareDraftPeer = ''; }
    state.activePeer = pubkey;
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
  async function renderMessages(peer, jumpToMessageId = '') {
    state.readReceiptObserver?.disconnect();
    state.readReceiptObserver = null;
    state.readReceiptCandidates.clear();
    const entries = (await all('messages')).filter(message => message.peer === peer).sort((a, b) => a.createdAt - b.createdAt);
    const messages = FileTransfers.coalesceMessages(entries.filter(message => message.kind !== 7));
    const activeVoiceIds = new Set(messages.filter(message => message.voiceMessage?.base64).map(message => message.id));
    for (const [id, url] of state.voiceObjectUrls) {
      if (activeVoiceIds.has(id)) continue;
      URL.revokeObjectURL(url);
      state.voiceObjectUrls.delete(id);
    }
    const activeFileIds = new Set(messages.filter(message => message.fileTransfer?.complete).map(message => `${peer}:${message.fileTransfer.transferId}`));
    for (const [id, url] of state.fileObjectUrls) {
      if (activeFileIds.has(id)) continue;
      URL.revokeObjectURL(url);
      state.fileObjectUrls.delete(id);
    }
    const messageByEventId = new Map();
    for (const message of messages) for (const eventId of [...MessageEdits.eventIds(message), ...(message.fileTransfer?.eventIds || [])]) messageByEventId.set(eventId, message);
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
      const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Esta conversa é privada. Envie uma mensagem para começar.'; container.append(empty); container.dataset.peer = peer; delete container.dataset.latestCreatedAt; state.unseenMessageCount = 0; updateMessageScrollButton(); refreshMessageSearch(); return;
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
      if (message.direction === 'received' && eventId && !message.fromAgent && !message.agentMessageId) {
        row.dataset.readReceiptId = eventId;
        state.readReceiptCandidates.set(eventId, { peer, message });
      }
      row.dataset.eventIds = MessageEdits.eventIds(message).join(',');
      if (message.fromAgent) { const author = document.createElement('span'); author.className = 'agent-message-author'; author.textContent = message.agentMessageError ? 'Protocolo de agente · mensagem não reconhecida' : 'Protocolo de agente · identidade Nostr'; row.append(author); }
      if (conversation?.group && message.direction !== 'sent') { const author = document.createElement('span'); author.className = 'group-message-author'; author.textContent = displayName(message.senderPubkey || '', ''); row.append(author); }
      if (message.replyToId) {
        const parent = byEventId.get(message.replyToId);
        const quote = document.createElement('button'); quote.className = 'reply-reference'; quote.type = 'button';
        const author = parent?.direction === 'sent' ? (window.PropertyI18n?.language === 'pt-BR' ? 'Você' : 'You') : displayName(parent?.senderPubkey || peer, conversation?.group ? '' : conversation?.title || '');
        const parentText = parent?.fileTransfer ? `📎 ${parent.fileTransfer.name}${parent.text ? ` · ${parent.text}` : ''}` : RichText.preview(parent?.text || '');
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
      if (message.fileTransfer) {
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
              const preview = document.createElement('img'); preview.className = 'file-transfer-image';
              preview.src = fileUrl; preview.alt = FileTransfers.safeName(transfer.name); preview.loading = 'lazy'; preview.decoding = 'async';
              card.append(preview);
            } else if (previewKind === 'audio') {
              const preview = document.createElement('audio'); preview.className = 'file-transfer-media';
              preview.controls = true; preview.preload = 'none'; preview.src = fileUrl;
              preview.setAttribute('aria-label', localized(`Play ${FileTransfers.safeName(transfer.name)}`, `Reproduzir ${FileTransfers.safeName(transfer.name)}`));
              card.append(preview);
            } else if (previewKind === 'video') {
              const preview = document.createElement('video'); preview.className = 'file-transfer-media';
              preview.controls = true; preview.preload = 'none'; preview.playsInline = true; preview.src = fileUrl;
              preview.setAttribute('aria-label', localized(`Play ${FileTransfers.safeName(transfer.name)}`, `Reproduzir ${FileTransfers.safeName(transfer.name)}`));
              card.append(preview);
            }
            const download = document.createElement('a'); download.className = 'file-transfer-download';
            download.href = fileUrl; download.download = FileTransfers.safeName(transfer.name);
            download.rel = 'noopener noreferrer'; download.textContent = localized('Download verified file', 'Baixar arquivo verificado');
            card.append(download);
            if (message.direction === 'sent') {
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
        bubble.append(card);
        if (message.text) { const caption = document.createElement('div'); caption.className = 'file-transfer-caption'; RichText.renderInto(caption, message.text, window.PropertyI18n?.language || 'en'); bubble.append(caption); }
      } else if (voice && audioUrl && ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'].includes(voice.mime)) {
        const label = document.createElement('span'); label.className = 'voice-message-label';
        label.textContent = `${localized('Voice message', 'Mensagem de voz')} · ${VoiceMessages.formatDuration(voice.durationMs)}`;
        const audio = document.createElement('audio'); audio.className = 'voice-message-audio'; audio.controls = true; audio.preload = 'none'; audio.src = audioUrl;
        audio.setAttribute('aria-label', `${localized('Play voice message', 'Reproduzir mensagem de voz')} · ${VoiceMessages.formatDuration(voice.durationMs)}`);
        audio.addEventListener('play', () => {
          $('messages').querySelectorAll('audio.voice-message-audio').forEach(other => { if (other !== audio) other.pause(); });
        });
        const controls = document.createElement('div'); controls.className = 'voice-message-actions';
        const speed = document.createElement('button'); speed.type = 'button'; speed.className = 'voice-message-speed'; speed.textContent = '1×';
        speed.setAttribute('aria-label', `${localized('Playback speed', 'Velocidade de reprodução')} 1×`);
        speed.title = localized('Playback speed', 'Velocidade de reprodução');
        speed.addEventListener('click', () => {
          audio.playbackRate = VoiceMessages.nextPlaybackRate(audio.playbackRate);
          speed.textContent = `${audio.playbackRate}×`;
          speed.setAttribute('aria-label', `${localized('Playback speed', 'Velocidade de reprodução')} ${audio.playbackRate}×`);
        });
        const download = document.createElement('a'); download.className = 'voice-message-download'; download.href = audioUrl;
        download.download = `property-voice-message.${({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' })[voice.mime] || 'audio'}`;
        download.rel = 'noopener noreferrer'; download.textContent = localized('Download voice audio', 'Baixar áudio');
        controls.append(speed, download);
        bubble.append(label, audio, controls);
      } else RichText.renderInto(bubble, message.text, window.PropertyI18n?.language || 'en');
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
      const reply = document.createElement('button'); reply.type = 'button'; reply.className = 'message-reply'; reply.textContent = 'Reply'; reply.disabled = !eventId; reply.title = eventId ? 'Reply to this message' : 'This older message has no Nostr event reference';
      reply.addEventListener('click', () => {
        if (!eventId) { showToast(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem antiga não tem uma referência de evento Nostr.' : 'This older message has no Nostr event reference.'); return; }
        beginReplyToMessage(peer, message);
      });
      const react = document.createElement('button'); react.type = 'button'; react.className = 'message-react'; react.textContent = 'React'; react.disabled = !eventId; react.setAttribute('aria-label', 'React to this message'); react.title = 'Choose a reaction';
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
      const save = document.createElement('button'); save.type = 'button'; save.textContent = message.saved ? 'Remove saved message' : 'Save message';
      save.addEventListener('click', () => { menu.open = false; setMessageSaved(peer, message, !message.saved).catch(error => showToast(error.message || 'Could not update saved messages.')); });
      if (message.direction === 'sent' && !message.voiceMessage && !message.fileTransfer && !message.fromAgent && !message.agentMessageId && message.kind !== 7 && !message.deleted && ['sent', 'partial'].includes(message.status) && eventId) {
        const editAction = document.createElement('button'); editAction.type = 'button'; editAction.textContent = localized('Edit message', 'Editar mensagem');
        editAction.addEventListener('click', () => { menu.open = false; startMessageEdit(peer, message); });
        menuItems.append(editAction);
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
        .filter(item => item.peer === peer && item.direction === 'sent' && item.kind !== 7 && !item.fromAgent && !item.agentMessageId && !item.deleted && nostrEventId(item) && ['sent', 'partial'].includes(item.status))
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
  async function sendPrivateMessage(peer, text, replyTo = null, { quiet = false, secretConfirmed = false, mentionTokens = [], forwardedHops = null, voiceRecording = null, fileChunk = null, deferRender = false } = {}, linkPreview = null) {
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
    if ((await get('conversations', peer))?.group === true) return sendPrivateGroupMessage(peer, text, replyTo, { quiet, secretConfirmed: true, linkPreview, mentionTokens, forwardedHops, voiceRecording, fileChunk, fileChunkTag, deferRender });
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
    if (voiceRecording && agentConversation) throw new Error(localized('Voice notes are not available in agent-protocol chats.', 'Mensagens de voz não estão disponíveis em conversas de protocolo de agente.'));
    if (fileChunk && agentConversation) throw new Error(localized('File attachments are not available in agent-protocol chats.', 'Anexos de arquivo não estão disponíveis em conversas de protocolo de agente.'));
    const agentMessageId = agentConversation ? AgentMessages.createMessageId() : null;
    const messageText = fileChunk ? (fileChunk.caption || '') : text;
    const wireContent = agentConversation ? AgentMessages.encodeEnvelope({
      conversationId: await AgentMessages.conversationId(state.pubkey, peer),
      messageId: agentMessageId,
      inReplyTo: replyTo ? (replyTo.agentMessageId || nostrEventId(replyTo)) : null,
      body: text,
    }) : fileChunk ? fileChunkBody(fileChunk) : text;
    const replyEventId = replyTo ? nostrEventId(replyTo) : '';
    if (replyTo && !replyEventId) throw new Error(window.PropertyI18n?.language === 'pt-BR' ? 'Esta mensagem não pode ser citada como resposta Nostr.' : 'This message cannot be referenced as a Nostr reply.');
    const rumorTags = [['p', peer]];
    if (replyEventId) rumorTags.push(['e', replyEventId, '', 'reply']);
    const previewTag = fileChunk ? null : LinkPreview?.toTag(linkPreview, text);
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
    const message = { id, peer, text: messageText, ...(voicePayload ? { voiceMessage: voicePayload } : {}), ...(fileChunk ? { fileChunk } : {}), createdAt: Date.now(), direction: 'sent', status: 'pending', nostrEventId: sentRumor.id, linkPreview: previewTag ? linkPreview : null, ...(forwardedHops !== null ? { forwarded: forwardedHops } : {}), ...(replyEventId ? { replyToId: replyEventId } : {}), ...(agentConversation ? { agentMessageId, inReplyTo: replyTo ? (replyTo.agentMessageId || replyEventId) : null } : {}) };
    await put('messages', message);
    await put('conversations', { ...previous, ...(agentConversation ? { agent: true } : {}), lastMessage: fileChunk ? `📎 ${fileChunk.name}` : text, lastAt: message.createdAt });
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
  function setActiveView(view) {
    if (view !== 'messages' && state.voiceRecorder) cancelVoiceRecording({ notify: true });
    if (view !== 'messages') stopLocalPresence();
    state.activeView = view;
    if (view !== 'messages') setMobileConversationListOpen(false);
    for (const name of ['messages', 'hangout', 'marketplace', 'node', 'saved']) {
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
    const saved = FileTransfers.coalesceMessages((await all('messages')).filter(message => message.kind !== 7)).filter(message => message.saved === true).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
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
    if (state.secret) state.secret.fill(0);
    const clearAppBadgeOnLock = state.appBadgeEnabled || state.appBadgeLastCount !== null;
    state.secret = null; state.pubkey = ''; state.npub = ''; state.activePeer = ''; state.currentConversation = null; state.activeWorkspaceReady = false; state.notificationsEnabled = false; state.typingIndicatorsEnabled = false; state.readReceiptsEnabled = false; state.activeStatusEnabled = false; state.notificationMutes.clear(); state.notificationMutePeer = ''; state.appBadgeEnabled = false; state.appBadgeLastCount = clearAppBadgeOnLock ? 0 : null;
    if (clearAppBadgeOnLock) void queueAppBadge(0);
    state.conversationMessageSearchCache = null; state.conversationMessageSearchRevision++;
    state.replyingTo = null; updateReplyContext();
    state.draftLoadSequence++;
    $('message-input').value = '';
    resizeMessageInput();
    renderVoiceComposer();
    clearLinkPreviewDraft();
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
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (refreshing) return;
      if (!state.secret && !Array.from(document.querySelectorAll('input[type="password"]')).some(input => input.value)) {
        refreshing = true; window.location.reload();
      } else showToast('Nova versão disponível. Reabra o app quando terminar.');
    });
    navigator.serviceWorker.register('./sw.js?v=property-v64', { scope: './', updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Property: cache offline indisponível.', error));
  }
  function wireEvents() {
    const openNewChatDialog = () => {
      const dialog = $('new-chat-dialog');
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => $('peer-input').focus());
    };
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
        if (!enabled) stopLocalTyping();
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
      $('relay-dialog').showModal();
    };
    $('open-settings').addEventListener('click', openRelaySettings);
    $('mobile-open-settings').addEventListener('click', openRelaySettings);
    $('first-use-open-relays').addEventListener('click', openRelaySettings);
    $('language-picker').addEventListener('change', renderFirstUseRelaySuggestions);
    $('language-picker').addEventListener('change', () => {
      renderChatDetailsForCurrentLanguage();
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
    $('voice-record-button').addEventListener('click', () => startVoiceRecording());
    $('voice-record-stop').addEventListener('click', () => finishVoiceRecording());
    $('voice-record-cancel').addEventListener('click', () => cancelVoiceRecording({ notify: true }));
    $('voice-discard-button').addEventListener('click', () => clearVoiceDraft());
    $('voice-send-button').addEventListener('click', () => sendVoiceDraft());
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
      stopLocalPresence();
      stopLocalTyping();
      if (state.activePeer) void saveChatDraft(state.activePeer, $('message-input').value).catch(() => {});
    });
    for (const eventName of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(eventName, resetIdleLock, { passive: true });
  }
  async function boot() {
    if (!N || !N.nip17 || !TypingSignals || typeof TypingSignals.create !== 'function' || typeof TypingSignals.createPresence !== 'function' || typeof TypingSignals.unwrap !== 'function' || !N.nip19 || !Vault || !Routing || !Bridge || !bridge || !Nano || !Money || !Marketplace || !AgentMessages || !RelayDefaults || !ShareInbox || !Pwa || !FolderStore || !ChatDrafts || !GroupMentions || typeof GroupMentions.createPicker !== 'function' || !NotificationPrefs || typeof NotificationPrefs.createMuteRecord !== 'function' || !AppBadge || typeof AppBadge.unreadCount !== 'function' || !MessageDays || typeof MessageDays.dayLabel !== 'function' || !MessageScroll || typeof MessageScroll.classifyUpdate !== 'function' || !RichText || typeof RichText.locationText !== 'function' || !LocationCards || typeof LocationCards.render !== 'function' || !MessageForwards || typeof MessageForwards.fromTags !== 'function' || typeof MessageForwards.toTag !== 'function' || !VoiceMessages || typeof VoiceMessages.createTag !== 'function' || typeof VoiceMessages.nextPlaybackRate !== 'function' || !FileTransfers || typeof FileTransfers.createTransfer !== 'function' || typeof FileTransfers.fromTags !== 'function' || typeof FileTransfers.assemble !== 'function' || typeof FileTransfers.coalesceMessages !== 'function' || !window.PropertyNostrEntities || !MessageEdits || typeof MessageEdits.createNip17Edit !== 'function' || !SecretGuard || typeof SecretGuard.findSecret !== 'function' || !QrCode || !EmojiPicker || typeof EmojiPicker.init !== 'function' || !ChatGestures || typeof ChatGestures.shouldReplySwipe !== 'function' || typeof ChatGestures.isEditLastShortcut !== 'function' || typeof Contact?.parsePublicKey !== 'function' || !PublicProfile || typeof PublicProfile.latest !== 'function' || typeof PublicProfile.latestRecord !== 'function') { $('auth-error').textContent = 'Os arquivos locais do protocolo, dos relays ou de contatos não carregaram. Recarregue o pacote do Property.'; return; }
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
  document.getElementById('active-tab-reload')?.addEventListener('click', () => window.location.reload());
  document.addEventListener('DOMContentLoaded', () => startWithActiveTabLock(boot));
})();
