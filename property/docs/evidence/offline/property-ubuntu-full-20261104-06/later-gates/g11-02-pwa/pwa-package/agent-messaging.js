'use strict';
(() => {
  const PROTOCOL = 'property-agent-message/v1';
  const VERSION = 1;
  const MAX_BODY_BYTES = 8_192;
  const MAX_ENVELOPE_BYTES = 16 * 1024;
  const ID = /^[0-9a-f]{32}$/;
  const PUBKEY = /^[0-9a-f]{64}$/;
  const KEYS = ['body', 'conversation_id', 'in_reply_to', 'message_id', 'protocol', 'version'];

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function exactObject(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }
  function validateJson(raw) {
    let index = 0;
    function whitespace() { while (/\s/.test(raw[index] || '')) index++; }
    function stringToken() {
      const start = index++;
      while (index < raw.length) {
        if (raw[index] === '\\') { index += 2; continue; }
        if (raw[index++] === '"') {
          try { return JSON.parse(raw.slice(start, index)); }
          catch { fail('malformed', 'O envelope tem uma string JSON inválida.'); }
        }
      }
      fail('malformed', 'O envelope tem uma string JSON incompleta.');
    }
    function value(depth) {
      whitespace();
      if (depth > 4) fail('depth', 'O envelope ultrapassa a profundidade JSON permitida.');
      if (raw[index] === '"') { stringToken(); return; }
      if (raw[index] === '{') {
        index++; whitespace();
        const keys = new Set();
        if (raw[index] === '}') { index++; return; }
        while (index < raw.length) {
          whitespace();
          if (raw[index] !== '"') fail('malformed', 'O envelope contém uma chave JSON inválida.');
          const key = stringToken();
          if (keys.has(key)) fail('duplicate-key', 'O envelope repete um campo JSON.');
          keys.add(key); whitespace();
          if (raw[index++] !== ':') fail('malformed', 'O envelope contém um separador inválido.');
          value(depth + 1); whitespace();
          if (raw[index] === '}') { index++; return; }
          if (raw[index++] !== ',') fail('malformed', 'O envelope contém uma lista de campos inválida.');
        }
        fail('malformed', 'O envelope contém um objeto incompleto.');
      }
      if (raw[index] === '[') {
        index++; whitespace();
        if (raw[index] === ']') { index++; return; }
        while (index < raw.length) {
          value(depth + 1); whitespace();
          if (raw[index] === ']') { index++; return; }
          if (raw[index++] !== ',') fail('malformed', 'O envelope contém uma lista inválida.');
        }
        fail('malformed', 'O envelope contém uma lista incompleta.');
      }
      const rest = raw.slice(index);
      const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(rest)?.[0];
      if (!token) fail('malformed', 'O envelope contém um valor JSON inválido.');
      index += token.length;
    }
    value(0); whitespace();
    if (index !== raw.length) fail('malformed', 'Há conteúdo extra depois do envelope JSON.');
  }
  function encodeEnvelope(fields) {
    const envelope = {
      protocol: PROTOCOL,
      version: VERSION,
      conversation_id: fields.conversationId,
      message_id: fields.messageId,
      in_reply_to: fields.inReplyTo ?? null,
      body: fields.body,
    };
    validateEnvelope(envelope);
    const text = JSON.stringify(envelope);
    if (new TextEncoder().encode(text).length > MAX_ENVELOPE_BYTES) fail('envelope-too-large', 'O envelope excede 16 KiB.');
    return text;
  }
  function validateEnvelope(envelope) {
    if (!exactObject(envelope, KEYS)) fail('schema', 'A mensagem do agente tem campos ausentes ou desconhecidos.');
    if (envelope.protocol !== PROTOCOL || envelope.version !== VERSION) fail('unknown-version', 'Esta versão da mensagem do agente não é compatível.');
    if (typeof envelope.conversation_id !== 'string' || !ID.test(envelope.conversation_id) || typeof envelope.message_id !== 'string' || !ID.test(envelope.message_id)) fail('invalid-id', 'A mensagem do agente contém um identificador inválido.');
    if (envelope.in_reply_to !== null && (typeof envelope.in_reply_to !== 'string' || !ID.test(envelope.in_reply_to))) fail('invalid-correlation', 'A referência de resposta da mensagem é inválida.');
    if (typeof envelope.body !== 'string') fail('invalid-body', 'O corpo da mensagem do agente precisa ser texto.');
    if (new TextEncoder().encode(envelope.body).length > MAX_BODY_BYTES) fail('body-too-large', 'O corpo da mensagem ultrapassa 8 KiB.');
    return Object.freeze({ protocol: PROTOCOL, version: VERSION, conversationId: envelope.conversation_id, messageId: envelope.message_id, inReplyTo: envelope.in_reply_to, body: envelope.body });
  }
  function decodeEnvelope(raw) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_ENVELOPE_BYTES) fail('envelope-too-large', 'O envelope está vazio ou excede 16 KiB.');
    validateJson(raw);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { fail('malformed', 'O envelope da mensagem do agente está malformado.'); }
    return validateEnvelope(parsed);
  }
  function createMessageId(randomBytes = length => crypto.getRandomValues(new Uint8Array(length))) {
    const bytes = randomBytes(16);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 16) fail('random-failed', 'Não foi possível gerar um ID seguro para a mensagem.');
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function conversationId(firstPubkey, secondPubkey) {
    if (!PUBKEY.test(firstPubkey) || !PUBKEY.test(secondPubkey) || firstPubkey === secondPubkey) fail('invalid-identity', 'As identidades da conversa são inválidas.');
    const pair = [firstPubkey, secondPubkey].sort().join(':');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`property-agent-conversation/v1:${pair}`)));
    return [...digest.subarray(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function createRateLimiter({ limit = 30, windowSeconds = 60, now = () => Math.floor(Date.now() / 1000) } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) fail('invalid-limit', 'A cota local é inválida.');
    const counts = new Map();
    return Object.freeze({
      consume(agentPubkey) {
        if (!PUBKEY.test(agentPubkey)) fail('invalid-identity', 'A identidade do agente é inválida.');
        const current = now();
        if (!Number.isSafeInteger(current) || current < 0) fail('invalid-clock', 'O relógio lógico da cota é inválido.');
        const window = Math.floor(current / windowSeconds);
        const previous = counts.get(agentPubkey);
        if (previous && window < previous.window) fail('clock-rollback', 'O relógio lógico recuou; o envio foi bloqueado com segurança.');
        const count = previous?.window === window ? previous.count : 0;
        if (count >= limit) fail('rate-limit', 'O agente atingiu a cota local de envio.');
        counts.set(agentPubkey, { window, count: count + 1 });
        return count + 1;
      },
    });
  }
  window.PropertyAgentMessages = Object.freeze({ PROTOCOL, VERSION, MAX_BODY_BYTES, MAX_ENVELOPE_BYTES, createMessageId, conversationId, encodeEnvelope, decodeEnvelope, createRateLimiter });
})();
