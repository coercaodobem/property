import { MAX_TOOL_BODY_BYTES, PUBKEY, SEND_LIMIT, SEND_WINDOW_SECONDS, exactObject, normalizeRelay, validateToolText, validateConfig } from './core.mjs';

const HEX_ID = /^[0-9a-f]{32}$/;

export class AgentService {
  constructor({ pubkey, loadConfig, saveConfig, transport, now = () => Math.floor(Date.now() / 1000) }) {
    if (!PUBKEY.test(pubkey) || typeof loadConfig !== 'function' || typeof saveConfig !== 'function' || !transport) throw new Error('Dependências da bridge local incompletas.');
    this.pubkey = pubkey;
    this.loadConfig = loadConfig;
    this.saveConfig = saveConfig;
    this.transport = transport;
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
      case 'relay.add': return this.addInboxRelay(params);
      case 'agent.block': return this.changeBlockedAgent(params, true);
      case 'agent.unblock': return this.changeBlockedAgent(params, false);
      default: throw new Error('tool-not-allowed');
    }
  }

  async status(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    return { unlocked: true, pubkey: this.pubkey, blocked_agents: config.blocked_pubkeys.length, relay_count: config.inbox_relays.length };
  }

  async list(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    const conversations = await this.transport.listConversations(100, config.blocked_pubkeys);
    if (!Array.isArray(conversations) || conversations.length > 100) throw new Error('invalid-transport-response');
    return { conversations: conversations.map(item => {
      if (!item || !PUBKEY.test(item.pubkey) || item.pubkey === this.pubkey || !Number.isSafeInteger(item.last_activity) || !HEX_ID.test(item.last_message_id)) throw new Error('invalid-transport-response');
      return { pubkey: item.pubkey, last_activity: item.last_activity, last_message_id: item.last_message_id };
    }) };
  }

  async read(params) {
    if (!exactObject(params, ['conversation_pubkey', 'limit']) || !PUBKEY.test(params.conversation_pubkey) || params.conversation_pubkey === this.pubkey || !Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    if (config.blocked_pubkeys.includes(params.conversation_pubkey)) throw new Error('agent-blocked-locally');
    if (!config.inbox_relays.length) throw new Error('relay-not-configured');
    const messages = await this.transport.readMessages(params.conversation_pubkey, params.limit);
    if (!Array.isArray(messages) || messages.length > params.limit) throw new Error('invalid-transport-response');
    return { conversation_pubkey: params.conversation_pubkey, messages: messages.map(message => {
      if (!message || message.conversation_pubkey !== params.conversation_pubkey || !['sent', 'received'].includes(message.direction) || typeof message.body !== 'string' || Buffer.byteLength(message.body, 'utf8') > MAX_TOOL_BODY_BYTES || !HEX_ID.test(message.message_id) || !(message.in_reply_to === null || HEX_ID.test(message.in_reply_to)) || !Number.isSafeInteger(message.created_at)) throw new Error('invalid-transport-response');
      return { message_id: message.message_id, in_reply_to: message.in_reply_to, direction: message.direction, body: message.body, created_at: message.created_at };
    }) };
  }

  async send(params) {
    return this.#serialize(() => this.#performSend(params));
  }

  async #performSend(params) {
    if (!exactObject(params, ['conversation_pubkey', 'text', 'in_reply_to']) || !PUBKEY.test(params.conversation_pubkey) || params.conversation_pubkey === this.pubkey || !(params.in_reply_to === null || HEX_ID.test(params.in_reply_to))) throw new Error('invalid-arguments');
    const body = validateToolText(params.text);
    const config = validateConfig(await this.loadConfig());
    if (config.blocked_pubkeys.includes(params.conversation_pubkey)) throw new Error('agent-blocked-locally');
    if (!config.inbox_relays.length) throw new Error('relay-not-configured');
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    const window = Math.floor(current / SEND_WINDOW_SECONDS);
    if (config.quota.window !== null && window < config.quota.window) throw new Error('logical-clock-rollback');
    const count = config.quota.window === window ? config.quota.count : 0;
    if (count >= SEND_LIMIT) throw new Error('send-quota-exceeded');
    config.quota = { window, count: count + 1 };
    await this.saveConfig(config);
    return await this.transport.sendMessage(params.conversation_pubkey, body, params.in_reply_to, config.inbox_relays);
  }

  async addInboxRelay(params) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['relay']) || typeof params.relay !== 'string') throw new Error('invalid-arguments');
      const relay = normalizeRelay(params.relay);
      const config = validateConfig(await this.loadConfig());
      const relays = config.inbox_relays.includes(relay) ? config.inbox_relays : [...config.inbox_relays, relay];
      if (relays.length > 3) throw new Error('relay-limit-reached');
      config.inbox_relays = relays;
      await this.saveConfig(config);
      const announcement = await this.transport.announceInboxRelays(relays);
      return { relay_count: relays.length, announcement_acks: announcement.acks, announcement_attempts: announcement.attempts };
    });
  }

  async changeBlockedAgent(params, block) {
    return this.#serialize(async () => {
      if (!exactObject(params, ['pubkey']) || !PUBKEY.test(params.pubkey) || params.pubkey === this.pubkey) throw new Error('invalid-arguments');
      const config = validateConfig(await this.loadConfig());
      const blocked = new Set(config.blocked_pubkeys);
      const alreadyBlocked = blocked.has(params.pubkey);
      if (block) blocked.add(params.pubkey); else blocked.delete(params.pubkey);
      if (blocked.size > 500) throw new Error('agent-block-limit-reached');
      config.blocked_pubkeys = [...blocked].sort();
      await this.saveConfig(config);
      return { pubkey: params.pubkey, blocked: block, changed: block !== alreadyBlocked };
    });
  }
}
