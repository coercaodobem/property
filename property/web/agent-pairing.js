'use strict';
(() => {
  const SCHEMA = 'property-agent-invite/v1';
  const INVITE_TAG = 'property-agent-invite-v1';
  const INVITE_KIND = 30078;
  const MAX_INVITE_LIFETIME_SECONDS = 24 * 60 * 60;
  const EVENT_KEYS = ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags'];
  const CONTENT_KEYS = ['agent_name', 'expires_at', 'nonce', 'protocol', 'recipient_pubkey', 'relay_hints'];
  const PUBLIC_KEY = /^[0-9a-f]{64}$/;
  const NONCE = /^[0-9a-f]{32}$/;

  function fail(message) { throw new Error(message); }
  function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
  }
  function normalizeRelay(value) {
    let url;
    try { url = new URL(value); } catch { fail('O convite contém um relay inválido.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) fail('O convite contém um relay não autorizado.');
    if (url.username || url.password || url.hash) fail('O convite contém um relay inválido.');
    return url.toString().replace(/\/$/, '');
  }
  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function base64UrlToBytes(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('O formato do convite é inválido.');
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  }
  function encodeInvite(event, baseUrl = '') {
    const json = new TextEncoder().encode(JSON.stringify(event));
    const token = bytesToBase64Url(json);
    if (!baseUrl) return `property-agent-invite:v1:${token}`;
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      fail('O link do convite precisa usar HTTPS (ou localhost para testes).');
    }
    url.searchParams.set('agentInvite', token);
    return url.toString();
  }
  function decodeInvite(input) {
    const value = String(input || '').trim();
    let token = '';
    if (value.startsWith('property-agent-invite:v1:')) token = value.slice('property-agent-invite:v1:'.length);
    else {
      try {
        const url = new URL(value);
        token = url.searchParams.get('agentInvite') || '';
      } catch { /* mensagem de erro uniforme abaixo */ }
    }
    if (!token || token.length > 24_000) fail('Cole um convite Property válido.');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(token))); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('O formato')) throw error;
      fail('O conteúdo do convite está malformado.');
    }
  }
  function normalizePermissions(permissions, contacts) {
    if (!Array.isArray(permissions) || permissions.length > 100) fail('As permissões selecionadas são inválidas.');
    const allowedContacts = new Set(contacts);
    const seen = new Set();
    const result = { read: [], send: [] };
    for (const item of permissions) {
      if (!isPlainObject(item) || !exactKeys(item, ['conversationPubkey', 'read', 'send']) || !PUBLIC_KEY.test(item.conversationPubkey) || typeof item.read !== 'boolean' || typeof item.send !== 'boolean') {
        fail('As permissões selecionadas são inválidas.');
      }
      if (!allowedContacts.has(item.conversationPubkey)) fail('Só é possível autorizar uma conversa já existente neste aparelho.');
      if (seen.has(item.conversationPubkey)) fail('A conversa foi selecionada mais de uma vez.');
      seen.add(item.conversationPubkey);
      if (item.read) result.read.push(item.conversationPubkey);
      if (item.send) result.send.push(item.conversationPubkey);
    }
    return result;
  }

  function createPairing({ nostr, storage, now = () => Math.floor(Date.now() / 1000), randomBytes = length => crypto.getRandomValues(new Uint8Array(length)) }) {
    if (!nostr || typeof nostr.finalizeEvent !== 'function' || typeof nostr.verifyEvent !== 'function' || typeof nostr.getPublicKey !== 'function') fail('A implementação Nostr local não está disponível.');
    for (const method of ['getInvite', 'getAccess', 'commitDecision', 'transitionAccess', 'listAccess']) {
      if (typeof storage?.[method] !== 'function') fail('O armazenamento local de pareamento está indisponível.');
    }

    function makeInvite(secret, { name, recipientPubkey = '', relayHints = [], expiresAt, baseUrl = '' } = {}) {
      const createdAt = now();
      const label = String(name || '').trim();
      if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) fail('Defina um nome de agente de até 80 caracteres.');
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= createdAt || expiresAt - createdAt > MAX_INVITE_LIFETIME_SECONDS) fail('O convite precisa expirar em até 24 horas.');
      if (recipientPubkey && !PUBLIC_KEY.test(recipientPubkey)) fail('A chave pública destinatária do convite é inválida.');
      if (!Array.isArray(relayHints) || relayHints.length > 3) fail('O convite aceita no máximo três relays.');
      const relays = [...new Set(relayHints.map(normalizeRelay))];
      const nonceBytes = randomBytes(16);
      if (!(nonceBytes instanceof Uint8Array) || nonceBytes.length !== 16) fail('Não foi possível gerar o identificador seguro do convite.');
      const content = {
        protocol: SCHEMA,
        agent_name: label,
        nonce: [...nonceBytes].map(byte => byte.toString(16).padStart(2, '0')).join(''),
        expires_at: expiresAt,
        recipient_pubkey: recipientPubkey || null,
        relay_hints: relays,
      };
      const event = nostr.finalizeEvent({ kind: INVITE_KIND, created_at: createdAt, tags: [['d', INVITE_TAG]], content: JSON.stringify(content) }, secret);
      return { event, invite: encodeInvite(event, baseUrl) };
    }

    function inspectInvite(input, { humanPubkey, allowedRelays = [] } = {}) {
      const event = decodeInvite(input);
      if (!exactKeys(event, EVENT_KEYS) || event.kind !== INVITE_KIND || !PUBLIC_KEY.test(event.pubkey) || !Number.isSafeInteger(event.created_at) || typeof event.content !== 'string' || event.content.length > 4096 || !Array.isArray(event.tags) || event.tags.length !== 1 || !Array.isArray(event.tags[0]) || event.tags[0].length !== 2 || event.tags[0][0] !== 'd' || event.tags[0][1] !== INVITE_TAG || !nostr.verifyEvent(event)) {
        fail('Assinatura ou estrutura do convite inválida.');
      }
      let content;
      try { content = JSON.parse(event.content); } catch { fail('O conteúdo do convite está malformado.'); }
      if (!exactKeys(content, CONTENT_KEYS) || content.protocol !== SCHEMA || typeof content.agent_name !== 'string' || !content.agent_name.trim() || content.agent_name.length > 80 || /[\u0000-\u001f\u007f]/.test(content.agent_name) || !NONCE.test(content.nonce) || !Number.isSafeInteger(content.expires_at) || !(content.recipient_pubkey === null || PUBLIC_KEY.test(content.recipient_pubkey)) || !Array.isArray(content.relay_hints) || content.relay_hints.length > 3) {
        fail('O convite usa campos inválidos ou desconhecidos.');
      }
      const current = now();
      if (event.created_at > current || content.expires_at <= current || content.expires_at <= event.created_at || content.expires_at - event.created_at > MAX_INVITE_LIFETIME_SECONDS) fail('O convite está expirado ou tem validade inválida.');
      if (content.recipient_pubkey && content.recipient_pubkey !== humanPubkey) fail('Este convite foi criado para outra identidade Property.');
      const allowed = new Set(allowedRelays.map(normalizeRelay));
      const relays = content.relay_hints.map(normalizeRelay);
      if (relays.some(relay => !allowed.has(relay))) fail('O convite sugere um relay que você não autorizou. Nenhuma conexão foi iniciada.');
      return Object.freeze({ agentPubkey: event.pubkey, agentName: content.agent_name.trim(), expiresAt: content.expires_at, nonce: content.nonce, relayHints: Object.freeze(relays), event });
    }

    async function decisionRecord(invite, status) {
      const input = new TextEncoder().encode(`${invite.agentPubkey}:${invite.nonce}`);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
      const id = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (await storage.getInvite(id)) fail('Este convite já foi usado.');
      return { id, agentPubkey: invite.agentPubkey, status, decidedAt: now(), inviteExpiresAt: invite.expiresAt };
    }

    async function approve(input, { humanPubkey, allowedRelays = [], contacts = [], permissions = [] } = {}) {
      const invite = inspectInvite(input, { humanPubkey, allowedRelays });
      const grants = normalizePermissions(permissions, contacts);
      const existing = await storage.getAccess(invite.agentPubkey);
      if (existing?.status === 'blocked') fail('Este agente está bloqueado. Desbloqueie-o explicitamente antes de parear um novo convite.');
      if (existing?.status === 'approved') fail('Este agente já está pareado. Revogue o acesso antes de reavaliar permissões.');
      const decision = await decisionRecord(invite, 'approved');
      const access = {
        pubkey: invite.agentPubkey,
        name: invite.agentName,
        status: 'approved',
        permissions: grants,
        pairedAt: now(),
        updatedAt: now(),
        revocationNotice: 'not-sent',
      };
      await storage.commitDecision(decision, access);
      return { ...access, permissions: { read: [...grants.read], send: [...grants.send] } };
    }

    async function decline(input, { humanPubkey, allowedRelays = [] } = {}) {
      const invite = inspectInvite(input, { humanPubkey, allowedRelays });
      const existing = await storage.getAccess(invite.agentPubkey);
      if (existing?.status === 'blocked' || existing?.status === 'approved') fail('O estado atual deste agente não permite recusar um novo convite.');
      const decision = await decisionRecord(invite, 'declined');
      await storage.commitDecision(decision, null);
      return { status: 'declined', agentPubkey: invite.agentPubkey };
    }

    async function transition(pubkey, status) {
      if (!PUBLIC_KEY.test(pubkey)) fail('A identidade do agente é inválida.');
      if (!['blocked', 'revoked', 'unblocked'].includes(status)) fail('Ação de acesso desconhecida.');
      return storage.transitionAccess(pubkey, status, now());
    }
    async function canRead(pubkey, conversationPubkey) {
      const access = await storage.getAccess(pubkey);
      return access?.status === 'approved' && access.permissions.read.includes(conversationPubkey);
    }
    async function canSend(pubkey, conversationPubkey) {
      const access = await storage.getAccess(pubkey);
      return access?.status === 'approved' && access.permissions.send.includes(conversationPubkey);
    }
    return Object.freeze({ makeInvite, inspectInvite, approve, decline, block: pubkey => transition(pubkey, 'blocked'), revoke: pubkey => transition(pubkey, 'revoked'), unblock: pubkey => transition(pubkey, 'unblocked'), canRead, canSend, list: () => storage.listAccess() });
  }

  window.PropertyAgentPairing = Object.freeze({ SCHEMA, INVITE_KIND, MAX_INVITE_LIFETIME_SECONDS, createPairing, encodeInvite });
})();
