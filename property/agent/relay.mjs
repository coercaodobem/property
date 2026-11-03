import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { conversationId, eventInContext, normalizeRelay, secretBytesInContext } from './core.mjs';

const MAX_QUERY_EVENTS = 500;
const MAX_RELAY_FRAME_BYTES = 64 * 1024;
const WATCHDOG_MS = 5000;
const PUBKEY = /^[0-9a-f]{64}$/;

function waitSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('relay-watchdog')); }, WATCHDOG_MS);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('relay-unreachable')); }, { once: true });
  });
}

export class NostrAgentTransport {
  constructor({ nostr, messages, context, secretHex, pubkey, inboxRelays, onSent = () => {} }) {
    if (!PUBKEY.test(pubkey)) throw new Error('invalid-agent-pubkey');
    this.nostr = nostr;
    this.messages = messages;
    this.context = context;
    this.secret = secretBytesInContext(context, secretHex);
    this.pubkey = pubkey;
    this.inboxRelays = inboxRelays.map(normalizeRelay);
    this.onSent = onSent;
  }

  async listConversations(limit = 100, blockedPubkeys = []) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid-limit');
    const blocked = new Set(blockedPubkeys);
    const messages = await this.#decodeInbox();
    const latest = new Map();
    for (const item of messages) {
      if (blocked.has(item.conversation_pubkey)) continue;
      const current = latest.get(item.conversation_pubkey);
      if (!current || item.created_at > current.last_activity || (item.created_at === current.last_activity && item.message_id > current.last_message_id)) {
        latest.set(item.conversation_pubkey, { pubkey: item.conversation_pubkey, last_activity: item.created_at, last_message_id: item.message_id });
      }
    }
    return [...latest.values()].sort((a, b) => b.last_activity - a.last_activity || a.pubkey.localeCompare(b.pubkey)).slice(0, limit);
  }

  async readMessages(peer, limit = 100) {
    if (!PUBKEY.test(peer) || peer === this.pubkey || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid-arguments');
    const messages = await this.#decodeInbox(peer);
    return messages.sort((a, b) => a.created_at - b.created_at || a.message_id.localeCompare(b.message_id)).slice(-limit);
  }

  async #decodeInbox(peerFilter = null) {
    if (!this.inboxRelays.length) throw new Error('relay-not-configured');
    const all = [];
    for (const url of this.inboxRelays) all.push(...await this.#query(url, { kinds: [1059], '#p': [this.pubkey], limit: MAX_QUERY_EVENTS }));
    const eventIds = new Set();
    const messageIds = new Set();
    const decoded = [];
    for (const event of all) {
      if (!event || typeof event !== 'object') continue;
      let candidate;
      try { candidate = eventInContext(this.context, event); } catch { continue; }
      let authentic = false;
      try { authentic = this.nostr.verifyEvent(candidate); } catch { /* evento malformado: rejeitar sem abortar a leitura */ }
      if (!authentic || typeof candidate.id !== 'string' || eventIds.has(candidate.id)) continue;
      eventIds.add(candidate.id);
      let rumor;
      try { rumor = this.nostr.nip17.unwrapEvent(candidate, this.secret); } catch { continue; }
      if (!rumor || rumor.kind !== 14 || typeof rumor.pubkey !== 'string' || !PUBKEY.test(rumor.pubkey) || typeof rumor.content !== 'string') continue;
      let envelope;
      try { envelope = this.messages.decodeEnvelope(rumor.content); } catch { continue; }
      const recipients = Array.isArray(rumor.tags) ? rumor.tags.filter(tag => tag?.[0] === 'p' && PUBKEY.test(tag[1])).map(tag => tag[1]) : [];
      let peer;
      if (rumor.pubkey === this.pubkey) peer = recipients.find(pubkey => pubkey !== this.pubkey);
      else if (recipients.includes(this.pubkey)) peer = rumor.pubkey;
      if (!peer || peer === this.pubkey || (peerFilter && peer !== peerFilter)) continue;
      if (envelope.conversationId !== conversationId(this.pubkey, peer) || messageIds.has(envelope.messageId)) continue;
      messageIds.add(envelope.messageId);
      decoded.push({ message_id: envelope.messageId, in_reply_to: envelope.inReplyTo, conversation_pubkey: peer, direction: rumor.pubkey === this.pubkey ? 'sent' : 'received', body: envelope.body, created_at: Number.isSafeInteger(rumor.created_at) ? rumor.created_at : candidate.created_at });
    }
    return decoded;
  }

  async sendMessage(peer, body, inReplyTo = null, senderRelays = this.inboxRelays) {
    if (!PUBKEY.test(peer) || peer === this.pubkey) throw new Error('invalid-arguments');
    const myRelays = [...new Set(senderRelays.map(normalizeRelay))].slice(0, 3);
    if (!myRelays.length) throw new Error('relay-not-configured');
    const recipientRelays = await this.#discoverInboxRelays(peer, myRelays);
    const id = this.messages.createMessageId();
    const envelope = this.messages.encodeEnvelope({ conversationId: conversationId(this.pubkey, peer), messageId: id, inReplyTo, body });
    const wraps = this.nostr.nip17.wrapManyEvents(this.secret, [{ publicKey: peer }], envelope);
    let accepted = 0;
    let attempts = 0;
    const targets = new Map();
    for (const event of wraps) {
      const recipient = event.tags?.find(tag => tag[0] === 'p')?.[1];
      const relays = recipient === peer ? recipientRelays : recipient === this.pubkey ? myRelays : [];
      for (const relay of relays) {
        const url = normalizeRelay(relay);
        const key = `${url}\0${event.id}`;
        if (!targets.has(key)) targets.set(key, { url, event });
      }
    }
    if (!targets.size) throw new Error('relay-not-configured');
    for (const target of targets.values()) {
      attempts++;
      try { if (await this.#publish(target.url, target.event)) accepted++; } catch { /* a rejeição fica refletida no ACK agregado */ }
    }
    this.onSent({ message_id: id, accepted, attempts });
    if (accepted === 0) throw new Error('relay-disconnected');
    return { status: accepted === attempts ? 'relay_accepted' : 'partial_relay_acceptance', message_id: id, relay_acks: accepted, relay_attempts: attempts };
  }

  async #discoverInboxRelays(peer, lookupRelays) {
    const candidates = [];
    for (const url of lookupRelays) {
      try { candidates.push(...await this.#query(url, { kinds: [10050], authors: [peer], limit: 20 })); } catch { /* outro relay ainda pode responder */ }
    }
    const valid = [];
    for (const event of candidates) {
      let candidate;
      try { candidate = eventInContext(this.context, event); } catch { continue; }
      try {
        if (candidate.kind !== 10050 || candidate.pubkey !== peer || !this.nostr.verifyEvent(candidate) || !Array.isArray(candidate.tags)) continue;
        const relays = [];
        for (const tag of candidate.tags) {
          if (tag[0] !== 'relay' || typeof tag[1] !== 'string') continue;
          try { relays.push(normalizeRelay(tag[1])); } catch { /* tag inválida não entra no caminho de rede */ }
        }
        const unique = [...new Set(relays)].slice(0, 3);
        if (unique.length) valid.push({ createdAt: candidate.created_at, relays: unique });
      } catch { /* perfil inválido é ignorado */ }
    }
    valid.sort((a, b) => b.createdAt - a.createdAt);
    return valid[0]?.relays || lookupRelays;
  }

  async announceInboxRelays(relays) {
    const values = [...new Set(relays.map(normalizeRelay))].slice(0, 3);
    if (!values.length) throw new Error('relay-not-configured');
    const template = { kind: 10050, created_at: Math.floor(Date.now() / 1000), tags: values.map(url => ['relay', url]), content: '' };
    this.context.propertyAgentRelayTemplate = JSON.stringify(template);
    this.context.propertyAgentRelaySecret = this.secret;
    let event;
    try { event = vm.runInContext('NostrTools.finalizeEvent(JSON.parse(propertyAgentRelayTemplate), propertyAgentRelaySecret)', this.context, { timeout: 5000 }); }
    catch { throw new Error('relay-list-sign-failed'); }
    finally { this.context.propertyAgentRelayTemplate = ''; this.context.propertyAgentRelaySecret = null; }
    if (!this.nostr.verifyEvent(event)) throw new Error('relay-list-sign-failed');
    let acks = 0;
    for (const url of values) {
      try { if (await this.#publish(url, event)) acks++; } catch { /* o resultado agregado representa relays indisponíveis */ }
    }
    this.inboxRelays = values;
    if (acks === 0) throw new Error('relay-disconnected');
    return { acks, attempts: values.length };
  }

  async #query(url, filter) {
    const socket = new WebSocket(normalizeRelay(url));
    await waitSocketOpen(socket);
    const subId = `pa-${randomUUID()}`;
    const events = [];
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.close(); reject(new Error('relay-watchdog')); }, WATCHDOG_MS);
        const cleanup = () => { clearTimeout(timer); socket.removeEventListener('message', listener); socket.removeEventListener('error', onError); };
        const onError = () => { cleanup(); reject(new Error('relay-unreachable')); };
        const listener = event => {
          let frame;
          try {
            if (typeof event.data !== 'string' || Buffer.byteLength(event.data, 'utf8') > MAX_RELAY_FRAME_BYTES) throw new Error('relay-frame-too-large');
            frame = JSON.parse(event.data);
          } catch (error) {
            if (error?.message === 'relay-frame-too-large') { cleanup(); socket.close(); reject(error); }
            return;
          }
          if (frame[0] === 'EVENT' && frame[1] === subId && frame[2]) { if (events.length < MAX_QUERY_EVENTS) events.push(frame[2]); return; }
          if (frame[0] === 'EOSE' && frame[1] === subId) { cleanup(); resolve(events.slice(0, MAX_QUERY_EVENTS)); }
        };
        socket.addEventListener('message', listener);
        socket.addEventListener('error', onError);
        socket.send(JSON.stringify(['REQ', subId, filter]));
      });
    } finally { try { socket.send(JSON.stringify(['CLOSE', subId])); } catch {} socket.close(); }
  }

  async #publish(url, event) {
    const socket = new WebSocket(normalizeRelay(url));
    await waitSocketOpen(socket);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.close(); reject(new Error('relay-watchdog')); }, WATCHDOG_MS);
        const cleanup = () => { clearTimeout(timer); socket.removeEventListener('message', listener); socket.removeEventListener('error', onError); };
        const onError = () => { cleanup(); reject(new Error('relay-unreachable')); };
        const listener = frameEvent => {
          let frame;
          try {
            if (typeof frameEvent.data !== 'string' || Buffer.byteLength(frameEvent.data, 'utf8') > MAX_RELAY_FRAME_BYTES) throw new Error('relay-frame-too-large');
            frame = JSON.parse(frameEvent.data);
          } catch (error) {
            if (error?.message === 'relay-frame-too-large') { cleanup(); socket.close(); reject(error); }
            return;
          }
          if (frame[0] !== 'OK' || frame[1] !== event.id) return;
          cleanup();
          resolve(frame[2] === true);
        };
        socket.addEventListener('message', listener);
        socket.addEventListener('error', onError);
        socket.send(JSON.stringify(['EVENT', event]));
      });
    } finally { socket.close(); }
  }
}
