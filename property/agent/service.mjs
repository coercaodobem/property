import { MAX_TOOL_BODY_BYTES, PUBKEY, SEND_LIMIT, SEND_WINDOW_SECONDS, exactObject, normalizeRelay, validateToolText, validateConfig } from './core.mjs';

const HEX_ID = /^[0-9a-f]{32}$/;
const ACTIVITY_LIMIT = 30;
const ACTIVITY_WINDOW_SECONDS = 60;
const ACTIVITY_TTL_SECONDS = 60;

export class AgentService {
  constructor({ pubkey, loadConfig, saveConfig, transport, xnoTrades = null, xnoEscrow = null, now = () => Math.floor(Date.now() / 1000) }) {
    if (!PUBKEY.test(pubkey) || typeof loadConfig !== 'function' || typeof saveConfig !== 'function' || !transport) throw new Error('Dependências da bridge local incompletas.');
    this.pubkey = pubkey;
    this.loadConfig = loadConfig;
    this.saveConfig = saveConfig;
    this.transport = transport;
    this.xnoTrades = xnoTrades;
    this.xnoEscrow = xnoEscrow;
    this.now = now;
    this.mutationQueue = Promise.resolve();
    this.activeThinking = new Map();
    this.activityQuota = null;
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
      case 'activity': return this.activity(params);
      case 'xno.policy': return this.xnoPolicy(params);
      case 'xno.offer': return this.xnoCall('createOffer', params);
      case 'xno.pay': return this.xnoCall('payOffer', params);
      case 'xno.trade.status': return this.xnoCall('tradeStatus', params);
      case 'xno.receipt.verify': return this.xnoCall('verifyReceipt', params);
      case 'xno.dispute': return this.xnoCall('dispute', params);
      case 'xno.escrow.offer': return this.xnoEscrowCall('offer', params);
      case 'xno.escrow.open': return this.xnoEscrowCall('open', params);
      case 'xno.escrow.accept': return this.xnoEscrowCall('accept', params);
      case 'xno.escrow.fund': return this.xnoEscrowCall('fund', params);
      case 'xno.escrow.approve': return this.xnoEscrowCall('approve', params);
      case 'xno.escrow.dispute': return this.xnoEscrowCall('dispute', params);
      case 'xno.escrow.sync': return this.xnoEscrowCall('sync', params);
      case 'xno.escrow.resolve': return this.xnoEscrowCall('resolve', params);
      case 'xno.escrow.status': return this.xnoEscrowCall('status', params);
      case 'relay.add': return this.addInboxRelay(params);
      case 'agent.block': return this.changeBlockedAgent(params, true);
      case 'agent.unblock': return this.changeBlockedAgent(params, false);
      default: throw new Error('tool-not-allowed');
    }
  }

  async status(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const config = validateConfig(await this.loadConfig());
    return { unlocked: true, pubkey: this.pubkey, blocked_agents: config.blocked_pubkeys.length, relay_count: config.inbox_relays.length,
      xno_payments_configured: Boolean(this.xnoTrades) };
  }

  async xnoPolicy(params) {
    if (!exactObject(params, [])) throw new Error('invalid-arguments');
    const direct = this.xnoTrades ? await this.xnoTrades.policy() : { configured: false, escrow: false, reason: 'xno-wallet-not-configured' };
    const escrow = this.xnoEscrow ? await this.xnoEscrow.policy() : { custodian_configured: false };
    if (!escrow.custodian_configured) return direct;
    return { ...direct, custodian_configured: true, escrow_protocol: escrow.escrow_protocol, custody_model: escrow.custody_model,
      custody_account: escrow.account, custody_network: escrow.network, custody_max_raw_per_payment: escrow.max_raw_per_payment,
      custody_lifetime_budget_raw: escrow.lifetime_budget_raw, custody_confirmed_balance_raw: escrow.confirmed_balance_raw };
  }

  async xnoCall(method, params) {
    if (!this.xnoTrades) throw new Error('xno-wallet-not-configured');
    return this.xnoTrades[method](params);
  }

  async xnoEscrowCall(method, params) {
    if (!this.xnoEscrow) throw new Error('xno-escrow-not-configured');
    return this.xnoEscrow[method](params);
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

  async activity(params) {
    return this.#serialize(() => this.#performActivity(params));
  }

  #expireThinking(current) {
    for (const [peer, activity] of this.activeThinking) {
      if (activity.expiresAt <= current) this.activeThinking.delete(peer);
    }
  }

  #consumeActivityQuota(current) {
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    const window = Math.floor(current / ACTIVITY_WINDOW_SECONDS);
    const previous = this.activityQuota;
    if (previous && window < previous.window) throw new Error('logical-clock-rollback');
    const count = previous?.window === window ? previous.count : 0;
    if (count >= ACTIVITY_LIMIT) throw new Error('activity-quota-exceeded');
    this.activityQuota = { window, count: count + 1 };
  }

  async #performActivity(params) {
    if (!exactObject(params, ['conversation_pubkey', 'state']) || !PUBKEY.test(params.conversation_pubkey) || params.conversation_pubkey === this.pubkey || !['thinking', 'stop'].includes(params.state)) throw new Error('invalid-arguments');
    const peer = params.conversation_pubkey;
    const config = validateConfig(await this.loadConfig());
    if (config.blocked_pubkeys.includes(peer)) throw new Error('agent-blocked-locally');
    if (!config.inbox_relays.length) throw new Error('relay-not-configured');
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    this.#expireThinking(current);
    const wasThinking = this.activeThinking.has(peer);
    if (params.state === 'stop' && !wasThinking) return { state: 'stop', changed: false, relay_acks: 0, relay_attempts: 0 };
    if (params.state === 'thinking') this.#consumeActivityQuota(current);
    const result = await this.transport.sendActivity(peer, params.state, config.inbox_relays);
    if (params.state === 'thinking') this.activeThinking.set(peer, { relays: [...config.inbox_relays], expiresAt: current + ACTIVITY_TTL_SECONDS });
    else this.activeThinking.delete(peer);
    return { ...result, changed: params.state === 'thinking' ? !wasThinking : wasThinking, renewed: params.state === 'thinking' && wasThinking };
  }

  async #performSend(params) {
    if (!exactObject(params, ['conversation_pubkey', 'text', 'in_reply_to']) || !PUBKEY.test(params.conversation_pubkey) || params.conversation_pubkey === this.pubkey || !(params.in_reply_to === null || HEX_ID.test(params.in_reply_to))) throw new Error('invalid-arguments');
    const body = validateToolText(params.text);
    const config = validateConfig(await this.loadConfig());
    if (config.blocked_pubkeys.includes(params.conversation_pubkey)) throw new Error('agent-blocked-locally');
    if (!config.inbox_relays.length) throw new Error('relay-not-configured');
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid-logical-clock');
    this.#expireThinking(current);
    const window = Math.floor(current / SEND_WINDOW_SECONDS);
    if (config.quota.window !== null && window < config.quota.window) throw new Error('logical-clock-rollback');
    const count = config.quota.window === window ? config.quota.count : 0;
    if (count >= SEND_LIMIT) throw new Error('send-quota-exceeded');
    config.quota = { window, count: count + 1 };
    await this.saveConfig(config);
    const result = await this.transport.sendMessage(params.conversation_pubkey, body, params.in_reply_to, config.inbox_relays);
    await this.#stopThinkingAfterMessage(params.conversation_pubkey, config.inbox_relays);
    return result;
  }

  async #stopThinkingAfterMessage(peer, relays) {
    if (!this.activeThinking.has(peer)) return;
    this.activeThinking.delete(peer);
    try { await this.transport.sendActivity(peer, 'stop', relays); } catch { /* the remote indicator expires locally if this stop cannot be delivered */ }
  }

  async close() {
    const current = this.now();
    if (Number.isSafeInteger(current) && current >= 0) this.#expireThinking(current);
    const active = [...this.activeThinking.entries()];
    this.activeThinking.clear();
    await Promise.all(active.map(async ([peer, activity]) => {
      try { await this.transport.sendActivity(peer, 'stop', activity.relays); } catch { /* the remote indicator expires locally */ }
    }));
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
      if (block) this.activeThinking.delete(params.pubkey);
      config.blocked_pubkeys = [...blocked].sort();
      await this.saveConfig(config);
      return { pubkey: params.pubkey, blocked: block, changed: block !== alreadyBlocked };
    });
  }
}
