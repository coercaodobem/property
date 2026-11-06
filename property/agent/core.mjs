import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const AGENT_VERSION = '0.4.0';
export const MCP_VERSION = '2026-07-28';
export const MAX_IPC_BYTES = 32 * 1024;
export const MAX_TOOL_BODY_BYTES = 8 * 1024;
export const SEND_LIMIT = 30;
export const SEND_WINDOW_SECONDS = 60;
export const PUBKEY = /^[0-9a-f]{64}$/;
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function profileName(value = 'default') {
  const name = String(value);
  if (!PROFILE.test(name)) throw new Error('Perfil inválido. Use letras minúsculas, números, hífen ou sublinhado.');
  return name;
}

export function normalizeRelay(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Relay inválido.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) throw new Error('Relays de produção precisam usar WSS; WS só é aceito em loopback.');
  if (url.username || url.password || url.hash || url.search) throw new Error('Relay contém componentes não permitidos.');
  return url.toString().replace(/\/$/, '');
}

export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateConfig(value) {
  const legacyV1 = exactObject(value, ['schema', 'version', 'pubkey', 'inbox_relays', 'contacts', 'pending_approvals', 'quota']) && value.schema === 'property-agent-config/v1' && value.version === 1 && Array.isArray(value.pending_approvals) && value.pending_approvals.length <= 100;
  const legacyV2 = exactObject(value, ['schema', 'version', 'pubkey', 'inbox_relays', 'contacts', 'quota']) && value.schema === 'property-agent-config/v2' && value.version === 2;
  const currentV3 = exactObject(value, ['schema', 'version', 'pubkey', 'inbox_relays', 'blocked_pubkeys', 'quota']) && value.schema === 'property-agent-config/v3' && value.version === 3;
  if ((!legacyV1 && !legacyV2 && !currentV3) || !PUBKEY.test(value.pubkey) || !Array.isArray(value.inbox_relays) || value.inbox_relays.length > 3 || (!currentV3 && (!Array.isArray(value.contacts) || value.contacts.length > 100)) || !exactObject(value.quota, ['window', 'count'])) throw new Error('Configuração do agente incompatível.');
  const relays = [...new Set(value.inbox_relays.map(normalizeRelay))];
  if (relays.length !== value.inbox_relays.length) throw new Error('A lista local de relays contém duplicatas.');
  const blocked = currentV3 ? value.blocked_pubkeys : value.contacts.filter(contact => contact?.status === 'blocked').map(contact => contact.pubkey);
  if (!Array.isArray(blocked) || blocked.length > 500 || blocked.some(pubkey => !PUBKEY.test(pubkey) || pubkey === value.pubkey) || new Set(blocked).size !== blocked.length) throw new Error('A lista local de agentes bloqueados é inválida.');
  if (!currentV3) {
    const seen = new Set();
    for (const contact of value.contacts) {
      if (!exactObject(contact, ['pubkey', 'name', 'relays', 'read', 'send', 'status']) || !PUBKEY.test(contact.pubkey) || contact.pubkey === value.pubkey || typeof contact.name !== 'string' || !contact.name.trim() || contact.name.length > 80 || !Array.isArray(contact.relays) || contact.relays.length > 3 || typeof contact.read !== 'boolean' || typeof contact.send !== 'boolean' || !['approved', 'revoked', 'blocked'].includes(contact.status)) throw new Error('Contato autorizado inválido.');
      if (seen.has(contact.pubkey)) throw new Error('Contato duplicado na allowlist.');
      seen.add(contact.pubkey);
      const targets = [...new Set(contact.relays.map(normalizeRelay))];
      if (targets.length !== contact.relays.length) throw new Error('Relays duplicados no contato.');
    }
  }
  if (!(value.quota.window === null || (Number.isSafeInteger(value.quota.window) && value.quota.window >= 0)) || !Number.isSafeInteger(value.quota.count) || value.quota.count < 0 || value.quota.count > SEND_LIMIT) throw new Error('Estado da cota do agente inválido.');
  if (!currentV3) return { schema: 'property-agent-config/v3', version: 3, pubkey: value.pubkey, inbox_relays: value.inbox_relays, blocked_pubkeys: blocked, quota: value.quota };
  return value;
}

export function createEmptyConfig(pubkey) {
  if (!PUBKEY.test(pubkey)) throw new Error('Identidade pública do agente inválida.');
  return { schema: 'property-agent-config/v3', version: 3, pubkey, inbox_relays: [], blocked_pubkeys: [], quota: { window: null, count: 0 } };
}

export async function loadNostr(PROPERTY_ROOT) {
  const agentRoot = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(agentRoot, 'vendor', 'nostr-tools-2.25.2.bundle.js'),
    path.join(PROPERTY_ROOT, 'web', 'vendor', 'nostr-tools-2.25.2.bundle.js'),
  ];
  let source;
  let resolved;
  for (const candidate of candidates) {
    try { source = await readFile(candidate, 'utf8'); resolved = candidate; break; } catch { /* tenta o outro local do pacote */ }
  }
  if (!source) throw new Error('O pacote local nostr-tools 2.25.2 não foi encontrado. Reinstale o runtime Property Agent.');
  const context = { crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, URL, btoa, atob, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 5000, filename: resolved });
  const envelopeCandidates = [path.join(agentRoot, 'agent-messaging.js'), path.join(PROPERTY_ROOT, 'web', 'agent-messaging.js')];
  let envelopeLoaded = false;
  for (const envelopePath of envelopeCandidates) {
    try { vm.runInContext(await readFile(envelopePath, 'utf8'), context, { timeout: 5000, filename: envelopePath }); envelopeLoaded = true; break; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (!envelopeLoaded) throw new Error('O esquema local de mensagens do agente não foi encontrado. Reinstale o runtime Property Agent.');
  const activityCandidates = [path.join(agentRoot, 'typing-signals.js'), path.join(PROPERTY_ROOT, 'web', 'typing-signals.js')];
  let activityLoaded = false;
  for (const activityPath of activityCandidates) {
    try { vm.runInContext(await readFile(activityPath, 'utf8'), context, { timeout: 5000, filename: activityPath }); activityLoaded = true; break; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (!activityLoaded) throw new Error('O módulo local de atividade privada não foi encontrado. Reinstale o runtime Property Agent.');
  if (!context.NostrTools?.nip17 || !context.PropertyAgentMessages || !context.PropertyTypingSignals) throw new Error('Os módulos locais de protocolo não carregaram.');
  return Object.freeze({ context, nostr: context.NostrTools, messages: context.PropertyAgentMessages, activitySignals: context.PropertyTypingSignals });
}

export function secretBytesInContext(context, secretHex) {
  if (!/^[0-9a-f]{64}$/.test(secretHex)) throw new Error('A chave do agente no cofre é inválida.');
  context.propertyAgentSecretHex = secretHex;
  try { return vm.runInContext('Uint8Array.from(propertyAgentSecretHex.match(/.{2}/g), value => parseInt(value, 16))', context, { timeout: 1000 }); }
  finally { context.propertyAgentSecretHex = ''; }
}

export function eventInContext(context, event) {
  context.propertyAgentEventJson = JSON.stringify(event);
  try { return vm.runInContext('JSON.parse(propertyAgentEventJson)', context, { timeout: 1000 }); }
  finally { context.propertyAgentEventJson = ''; }
}

export function conversationId(first, second) {
  if (!PUBKEY.test(first) || !PUBKEY.test(second) || first === second) throw new Error('As identidades da conversa são inválidas.');
  return createHash('sha256').update(`property-agent-conversation/v1:${[first, second].sort().join(':')}`).digest('hex').slice(0, 32);
}

export function createMessageId() { return randomBytes(16).toString('hex'); }

export function validateToolText(value) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > MAX_TOOL_BODY_BYTES || /\u0000/.test(value)) throw new Error('A mensagem precisa ser texto de até 8 KiB, sem bytes nulos.');
  return value;
}
