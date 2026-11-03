import { randomBytes } from 'node:crypto';
import { MAX_TOOL_BODY_BYTES, PUBKEY, SEND_LIMIT, SEND_WINDOW_SECONDS, exactObject, normalizeRelay, validateToolText, validateConfig } from './core.mjs';

const HEX_ID = /^[0-9a-f]{32}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export class AgentService {
  constructor({ pubkey, loadConfig, saveConfig, transport, createInvite, now = () => Math.floor(Date.now() / 1000) }) {
    if (!PUBKEY.test(pubkey) || typeof loadConfig !== 'function' || typeof saveConfig !== 'function' || !transport || typeof createInvite !== 'function') throw new Error('Dependências da bridge local incompletas.');
    this.pubkey = pubkey;
    this.loadConfig = loadConfig;
    this.saveConfig = saveConfig;
    this.transport = transport;
    this.createInvite = createInvite;
    this.now = now;
    this.mutationQueue = Promise.resolve();
  }

  #serialize(task) {
    const next = this.mutationQueue.then(task);
    this.mutationQueue = next.catch(() => {});
    return next;
  }

  async dispatch(method, params) {
    switch (method) {
      case 'status': return this.status(params);
      case 'list': return this.list(params);
      case 'read': return this.read(params);
      case 'send': return this.send(params);
      case 'approval.request': return this.requestApproval(params);
      case 'approval.list': return this.listPendingApprovals(params);
      case 'approval.get': return this.getPendingApproval(params);
      case 'approval.decide': return this.decideApproval(params);
      case 'contact.grant': return this.grantContact(params);
      case 'contact.revoke': return this.revokeContact(params);
      case 'relay.add': return this.addInboxRelay(params);
      case 'invite.make': return this.invite(params);
      default: throw new Error('tool-not-allowed');
    }
  }

  async invite(params) {
    if (!exactObject(params, ['name', 'recipient_pubkey']) || typeof params.name !== 'string' || !params.name.trim() || params.name.length > 80 || CONTROL.test(params.name) || !(params.recipient_pubkey === null || PUBKEY.test(params.recipient_pubkey))) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    return this.createInvite({ name: params.name.trim(), recipientPubkey: params.recipient_pubkey, relayHints: [...config.inbox_relays] });
  }

  async status(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    return { unlocked: true, pubkey: this.pubkey, approved_conversations: config.contacts.filter(contact => contact.status === 'approved').length, relay_count: config.inbox_relays.length };
  }

  async list(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    return { conversations: config.contacts.filter(contact => contact.status === 'approved').map(contact => ({ pubkey: contact.pubkey, name: contact.name, read: contact.read, send: contact.send })) };
  }

  async read(params) {
    if (!exactObject(params, ['conversation_pubkey', 'limit']) || !PUBKEY.test(params.conversation_pubkey) || !Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    const contact = config.contacts.find(item => item.pubkey === params.conversation_pubkey && item.status === 'approved');
    if (!contact || !contact.read) throw new Error('conversation-read-not-approved');
    if (!config.inbox_relays.length) throw new Error('relay-not-configured');
    const messages = await this.transport.readMessages(contact.pubkey, params.limit);
    if (!Array.isArray(messages) || messages.length > params.limit) throw new Error('invalid-transport-response');
    return { conversation_pubkey: contact.pubkey, messages: messages.map(message => {
      if (!message || message.conversation_pubkey !== contact.pubkey || !['sent', 'received'].includes(message.direction) || typeof message.body !== 'string' || Buffer.byteLength(message.body, 'utf8') > MAX_TOOL_BODY_BYTES || !HEX_ID.test(message.message_id) || !(message.in_reply_to === null || HEX_ID.test(message.in_reply_to)) || !Number.isSafeInteger(message.created_at)) throw new Error('invalid-transport-response');
      return { message_id: message.message_id, in_reply_to: message.in_reply_to, direction: message.direction, body: message.body, created_at: message.created_at };
    }) };
  }

  async send(params) {
    return this.#serialize(() => this.#performSend(params));
  }

  async #performSend(params) {
    if (!exactObject(params, ['conversation_pubkey', 'text', 'in_reply_to']) || !PUBKEY.test(params.conversation_pubkey) || !(params.in_reply_to === null || HEX_ID.test(params.in_reply_to))) throw new Error('invalid-arguments');
    const body = validateToolText(params.text);
    const config = validateConfig(await this.loadConfig());
    const contact = config.contacts.find(item => item.pubkey === params.conversation_pubkey && item.status === 'approved');
    if (!contact || !contact.send) throw new Error('conversation-send-not-approved');
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    const window = Math.floor(current / SEND_WINDOW_SECONDS);
    if (config.quota.window !== null && window < config.quota.window) throw new Error('logical-clock-rollback');
    const count = config.quota.window === window ? config.quota.count : 0;
    if (count >= SEND_LIMIT) throw new Error('send-quota-exceeded');
    config.quota = { window, count: count + 1 };
    await this.saveConfig(config);
    return await this.transport.sendMessage(contact.pubkey, body, params.in_reply_to);
  }

  async requestApproval(params) {
    return this.#serialize(() => this.#performApprovalRequest(params));
  }

  async listPendingApprovals(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, [])) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      return { request_ids: config.pending_approvals.filter(item => item.status === 'pending').map(item => item.id) };
    });
  }

  async getPendingApproval(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['request_id']) || !HEX_ID.test(params.request_id)) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      const request = config.pending_approvals.find(item => item.id === params.request_id && item.status === 'pending');
      if (!request) throw new Error('approval-request-not-found');
      const { id, conversation_pubkey, permission, reason, created_at } = request;
      return { id, conversation_pubkey, permission, reason, created_at };
    });
  }

  async decideApproval(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['request_id', 'decision']) || !HEX_ID.test(params.request_id) || !['approve', 'deny'].includes(params.decision)) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      const index = config.pending_approvals.findIndex(item => item.id === params.request_id && item.status === 'pending');
      if (index < 0) throw new Error('approval-request-not-found');
      const request = config.pending_approvals[index];
      if (params.decision === 'approve') {
        const contact = config.contacts.find(item => item.pubkey === request.conversation_pubkey && item.status === 'approved');
        if (!contact) throw new Error('approval-contact-not-approved');
        contact[request.permission] = true;
      }
      const status = params.decision === 'approve' ? 'approved' : 'denied';
      config.pending_approvals[index] = { ...request, status };
      await this.saveConfig(config);
      return { request_id: request.id, conversation_pubkey: request.conversation_pubkey, permission: request.permission, status };
    });
  }

  async grantContact(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['pubkey', 'name', 'relays', 'read', 'send']) || !PUBKEY.test(params.pubkey) || typeof params.name !== 'string' || !params.name.trim() || params.name.length > 80 || CONTROL.test(params.name) || !Array.isArray(params.relays) || params.relays.length < 1 || params.relays.length > 3 || typeof params.read !== 'boolean' || typeof params.send !== 'boolean' || (!params.read && !params.send)) throw new Error('invalid-arguments');
      if (params.pubkey === this.pubkey) throw new Error('contact-self-forbidden');
      const relays = params.relays.map(normalizeRelay);
      if (new Set(relays).size !== relays.length) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      const contacts = config.contacts.filter(item => item.pubkey !== params.pubkey);
      if (contacts.length >= 100) throw new Error('contact-limit-reached');
      contacts.push({ pubkey: params.pubkey, name: params.name.trim(), relays, read: params.read, send: params.send, status: 'approved' });
      config.contacts = contacts;
      await this.saveConfig(config);
      return { pubkey: params.pubkey, read: params.read, send: params.send };
    });
  }

  async revokeContact(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['pubkey']) || !PUBKEY.test(params.pubkey) || params.pubkey === this.pubkey) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      const contact = config.contacts.find(item => item.pubkey === params.pubkey && item.status === 'approved');
      if (!contact) throw new Error('contact-not-found');
      config.contacts = config.contacts.filter(item => item.pubkey !== params.pubkey);
      await this.saveConfig(config);
      return { pubkey: params.pubkey, revoked: true };
    });
  }

  async addInboxRelay(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['relay']) || typeof params.relay !== 'string') throw new Error('invalid-arguments');
      const relay = normalizeRelay(params.relay);
      const config = validateConfig(await this.loadConfig());
      if (config.inbox_relays.includes(relay)) throw new Error('relay-already-configured');
      if (config.inbox_relays.length >= 3) throw new Error('relay-limit-reached');
      config.inbox_relays.push(relay);
      await this.saveConfig(config);
      return { relay_count: config.inbox_relays.length, restart_required: true };
    });
  }

  async #performApprovalRequest(params) {
    if (!exactObject(params, ['conversation_pubkey', 'permission', 'reason']) || !PUBKEY.test(params.conversation_pubkey) || !['read', 'send'].includes(params.permission) || typeof params.reason !== 'string' || !params.reason.trim() || params.reason.length > 300 || CONTROL.test(params.reason)) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    while (config.pending_approvals.length >= 100) {
      const resolvedIndex = config.pending_approvals.findIndex(item => item.status !== 'pending');
      if (resolvedIndex < 0) throw new Error('approval-queue-full');
      config.pending_approvals.splice(resolvedIndex, 1);
    }
    const id = randomBytes(16).toString('hex');
    config.pending_approvals.push({ id, conversation_pubkey: params.conversation_pubkey, permission: params.permission, reason: params.reason.trim(), created_at: this.now(), status: 'pending' });
    await this.saveConfig(config);
    return { request_id: id, status: 'pending_human_approval', granted: false, message: 'Nenhuma permissão foi alterada. A pessoa proprietária deve revisar no terminal local com: property-agent requests --review.' };
  }
}
