import { randomUUID } from 'node:crypto';
import { conversationId, eventInContext, normalizeRelay, secretBytesInContext } from './core.mjs';

const MAX_QUERY_EVENTS = 500;
const MAX_RELAY_FRAME_BYTES = 64 * 1024;
const WATCHDOG_MS = 5000;

function waitSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('relay-watchdog')); }, WATCHDOG_MS);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('relay-unreachable')); }, { once: true });
  });
}

export class NostrAgentTransport {
  constructor({ nostr, messages, context, secretHex, pubkey, inboxRelays, getContact, onSent = () => {} }) {
    this.nostr = nostr;
    this.messages = messages;
    this.context = context;
    this.secret = secretBytesInContext(context, secretHex);
    this.pubkey = pubkey;
    this.inboxRelays = inboxRelays.map(normalizeRelay);
    this.getContact = getContact;
    this.onSent = onSent;
  }

  async readMessages(peer, limit = 100) {
    if (!this.inboxRelays.length) throw new Error('relay-not-configured');
    const all = [];
    for (const url of this.inboxRelays) all.push(...await this.#query(url, { kinds: [1059], '#p': [this.pubkey], limit: MAX_QUERY_EVENTS }));
    const dedupe = new Set();
    const messageDedupe = new Set();
    const decoded = [];
    const expectedConversation = conversationId(this.pubkey, peer);
    for (const event of all) {
      if (!event || typeof event !== 'object') continue;
      this.context.propertyAgentEventJson = JSON.stringify(event);
      let candidate;
      try { candidate = eventInContext(this.context, event); } catch { continue; }
      let authentic = false;
      try { authentic = this.nostr.verifyEvent(candidate); } catch { /* evento malformado: rejeitar sem abortar a leitura */ }
      if (!authentic) continue;
      if (typeof candidate.id !== 'string' || dedupe.has(candidate.id)) continue;
      dedupe.add(candidate.id);
      let rumor;
      try { rumor = this.nostr.nip17.unwrapEvent(candidate, this.secret); } catch { continue; }
      if (!rumor || rumor.kind !== 14 || ![this.pubkey, peer].includes(rumor.pubkey) || typeof rumor.content !== 'string') continue;
      let envelope;
      try { envelope = this.messages.decodeEnvelope(rumor.content); } catch { continue; }
      if (envelope.conversationId !== expectedConversation) continue;
      if (messageDedupe.has(envelope.messageId)) continue;
      messageDedupe.add(envelope.messageId);
      decoded.push({ message_id: envelope.messageId, in_reply_to: envelope.inReplyTo, conversation_pubkey: peer, direction: rumor.pubkey === this.pubkey ? 'sent' : 'received', body: envelope.body, created_at: Number.isSafeInteger(rumor.created_at) ? rumor.created_at : event.created_at, relay_event_id: event.id });
    }
    decoded.sort((a, b) => a.created_at - b.created_at || a.message_id.localeCompare(b.message_id));
    return decoded.slice(-limit).map(({ relay_event_id, ...message }) => message);
  }

  async sendMessage(peer, body, inReplyTo = null) {
    const contact = await this.getContact(peer);
    if (!contact || contact.status !== 'approved' || contact.send !== true) throw new Error('conversation-send-not-approved');
    const id = this.messages.createMessageId();
    const envelope = this.messages.encodeEnvelope({ conversationId: conversationId(this.pubkey, peer), messageId: id, inReplyTo, body });
    const wraps = this.nostr.nip17.wrapManyEvents(this.secret, [{ publicKey: peer }], envelope);
    let accepted = 0;
    let attempts = 0;
    const targets = new Map();
    for (const event of wraps) {
      const recipient = event.tags?.find(tag => tag[0] === 'p')?.[1];
      const relays = recipient === peer ? contact.relays : recipient === this.pubkey ? this.inboxRelays : [];
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
