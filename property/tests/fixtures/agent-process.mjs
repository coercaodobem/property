import { createInterface } from 'node:readline';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const role = process.env.PROPERTY_G3_AGENT_ROLE;
if (!['alpha', 'beta'].includes(role)) throw new Error('Synthetic agent role is invalid.');
const stateFile = resolve(process.env.PROPERTY_G3_AGENT_STATE || '');
const root = resolve(process.env.PROPERTY_G3_PROPERTY_ROOT || '.');
const context = { crypto: webcrypto, TextEncoder, TextDecoder, URL, btoa, atob, Date, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(`${root}/web/vendor/nostr-tools-2.25.2.bundle.js`, 'utf8'), context, { timeout: 5000 });
vm.runInContext(await readFile(`${root}/web/agent-messaging.js`, 'utf8'), context, { timeout: 5000 });
context.roleSecretHex = `${'00'.repeat(31)}${role === 'alpha' ? 'c9' : 'ca'}`;
const agent = vm.runInContext(`(() => {
  const secret = Uint8Array.from(roleSecretHex.match(/.{2}/g), value => parseInt(value, 16));
  return { secret, pubkey: NostrTools.getPublicKey(secret) };
})()`, context);
const N = context.NostrTools;
const AgentMessages = context.PropertyAgentMessages;
const sockets = new Map();
const seen = new Set(JSON.parse(await readFile(stateFile, 'utf8').catch(() => '[]')));
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let subscriptionCounter = 0;

function waitOpen(socket, url) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`relay open failed: ${url}`)); }, 20000);
    function cleanup() { clearTimeout(timer); socket.removeEventListener('open', onOpen); socket.removeEventListener('error', onError); }
    function onOpen() { cleanup(); resolve(); }
    function onError() { cleanup(); reject(new Error(`relay open failed: ${url}`)); }
    socket.addEventListener('open', onOpen, { once: true }); socket.addEventListener('error', onError, { once: true });
  });
}
async function connect(urls) {
  const opened = [];
  for (const url of urls) {
    let socket = sockets.get(url);
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      socket = new WebSocket(url); sockets.set(url, socket);
    }
    await waitOpen(socket, url); opened.push(url);
  }
  return opened;
}
function requestFrame(url, predicate, send) {
  const socket = sockets.get(url);
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error(`relay is not connected: ${url}`);
  return new Promise((resolve, reject) => {
    const seenFrames = [];
    const timer = setTimeout(() => { cleanup(); reject(new Error(`relay response missing: ${url}; frames=${JSON.stringify(seenFrames)}`)); }, 20000);
    function cleanup() { clearTimeout(timer); socket.removeEventListener('message', onMessage); }
    function onMessage(message) {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (seenFrames.length < 6) seenFrames.push([frame[0] || 'unknown', typeof frame[1] === 'string' ? frame[1].slice(0, 24) : null, typeof frame[2] === 'boolean' ? frame[2] : null, typeof frame[3] === 'string' ? frame[3].slice(0, 80) : null]);
      if (!predicate(frame)) return;
      cleanup(); resolve(frame);
    }
    socket.addEventListener('message', onMessage);
    try { send(socket); } catch (error) { cleanup(); reject(error); }
  });
}
async function publish(url, event) {
  const response = await requestFrame(url, frame => frame[0] === 'OK' && frame[1] === event.id, socket => socket.send(JSON.stringify(['EVENT', event])));
  return { accepted: response[2] === true, message: typeof response[3] === 'string' ? response[3].slice(0, 160) : '' };
}
async function query(url, filter) {
  const subId = `g3-${role}-${++subscriptionCounter}`;
  const events = new Map();
  const socket = sockets.get(url);
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error(`relay is not connected: ${url}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`relay query incomplete: ${url}`)); }, 20000);
    function cleanup() { clearTimeout(timer); socket.removeEventListener('message', onMessage); try { socket.send(JSON.stringify(['CLOSE', subId])); } catch {} }
    function onMessage(message) {
      let frame; try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === subId && frame[2]?.id) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === subId) { cleanup(); resolve({ events: [...events.values()], eose: true }); }
    }
    socket.addEventListener('message', onMessage);
    try { socket.send(JSON.stringify(['REQ', subId, filter])); }
    catch (error) { cleanup(); reject(error); }
  });
}
async function persistSeen() {
  await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.tmp`;
  await writeFile(temporary, JSON.stringify([...seen].sort()), { mode: 0o600 });
  await rename(temporary, stateFile);
}
async function receive({ event, expectedSender, conversationId }) {
  if (!event || event.kind !== 1059) return { status: 'rejected', code: 'invalid-signature' };
  context.fixtureEventJson = JSON.stringify(event);
  const nostrEvent = vm.runInContext('JSON.parse(fixtureEventJson)', context);
  if (!N.verifyEvent(nostrEvent)) return { status: 'rejected', code: 'invalid-signature' };
  let rumor;
  try { rumor = N.nip17.unwrapEvent(nostrEvent, agent.secret); }
  catch { return { status: 'rejected', code: 'not-for-agent-or-invalid-wrap' }; }
  if (!rumor || rumor.kind !== 14 || rumor.pubkey !== expectedSender) return { status: 'rejected', code: 'unexpected-author' };
  let message;
  try { message = AgentMessages.decodeEnvelope(rumor.content); }
  catch (error) { return { status: 'rejected', code: error?.code || 'invalid-envelope' }; }
  if (message.conversationId !== conversationId) return { status: 'rejected', code: 'wrong-conversation' };
  if (seen.has(message.messageId)) return { status: 'duplicate', messageId: message.messageId };
  seen.add(message.messageId); await persistSeen();
  return { status: 'accepted', messageId: message.messageId, inReplyTo: message.inReplyTo, body: message.body };
}
async function receiveHumanText({ event, expectedSender, conversationId }) {
  if (!event || event.kind !== 1059) return { status: 'rejected', code: 'invalid-signature' };
  context.fixtureEventJson = JSON.stringify(event);
  const nostrEvent = vm.runInContext('JSON.parse(fixtureEventJson)', context);
  if (!N.verifyEvent(nostrEvent)) return { status: 'rejected', code: 'invalid-signature' };
  let rumor;
  try { rumor = N.nip17.unwrapEvent(nostrEvent, agent.secret); }
  catch { return { status: 'rejected', code: 'not-for-agent-or-invalid-wrap' }; }
  if (!rumor || rumor.kind !== 14 || rumor.pubkey !== expectedSender || typeof rumor.content !== 'string') return { status: 'rejected', code: 'unexpected-human-author' };
  let envelope;
  try { envelope = AgentMessages.decodeEnvelope(rumor.content); }
  catch (error) { return { status: 'rejected', code: error?.code || 'invalid-envelope' }; }
  if (envelope.conversationId !== conversationId || envelope.inReplyTo !== null) return { status: 'rejected', code: 'wrong-human-request' };
  return { status: 'accepted-human-text', body: envelope.body, messageId: envelope.messageId };
}
async function inspectAgentEnvelope({ event, expectedSender, conversationId }) {
  if (!event || event.kind !== 1059) return { status: 'rejected', code: 'invalid-event' };
  context.fixtureEventJson = JSON.stringify(event);
  const nostrEvent = vm.runInContext('JSON.parse(fixtureEventJson)', context);
  if (!N.verifyEvent(nostrEvent)) return { status: 'rejected', code: 'invalid-signature' };
  let rumor;
  try { rumor = N.nip17.unwrapEvent(nostrEvent, agent.secret); }
  catch { return { status: 'rejected', code: 'not-for-agent-or-invalid-wrap' }; }
  if (!rumor || rumor.kind !== 14 || rumor.pubkey !== expectedSender) return { status: 'rejected', code: 'unexpected-author' };
  let envelope;
  try { envelope = AgentMessages.decodeEnvelope(rumor.content); }
  catch (error) { return { status: 'rejected', code: error?.code || 'invalid-envelope' }; }
  if (envelope.conversationId !== conversationId) return { status: 'rejected', code: 'wrong-conversation' };
  return { status: 'accepted', messageId: envelope.messageId, body: envelope.body };
}
async function handle(command) {
  switch (command.op) {
    case 'identity': return { pubkey: agent.pubkey };
    case 'connect': return { opened: await connect(command.urls || []) };
    case 'disconnect': {
      for (const url of command.urls || []) {
        const socket = sockets.get(url);
        if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, 'G3 synthetic partition');
        sockets.delete(url);
      }
      return { disconnected: command.urls || [] };
    }
    case 'make-envelope': {
      const content = AgentMessages.encodeEnvelope({ conversationId: command.conversationId, messageId: command.messageId, inReplyTo: command.inReplyTo ?? null, body: command.body });
      return { wraps: N.nip17.wrapManyEvents(agent.secret, [{ publicKey: command.recipientPubkey }], content) };
    }
    case 'publish-inbox-list': {
      context.fixtureRelayUrls = JSON.stringify(command.urls || []);
      context.fixtureSecretHex = Buffer.from(agent.secret).toString('hex');
      const event = vm.runInContext(`(() => {
        const secret = Uint8Array.from(fixtureSecretHex.match(/.{2}/g), value => parseInt(value, 16));
        const relays = JSON.parse(fixtureRelayUrls);
        return NostrTools.finalizeEvent({ kind: 10050, created_at: Math.floor(Date.now() / 1000), tags: relays.map(url => ['relay', url]), content: '' }, secret);
      })()`, context);
      await Promise.all((command.publishTo || command.urls || []).map(url => publish(url, event)));
      return { eventId: event.id, published: true };
    }
    case 'make-raw-fixture': return { wraps: N.nip17.wrapManyEvents(agent.secret, [{ publicKey: command.recipientPubkey }], command.content) };
    case 'publish': return publish(command.url, command.event);
    case 'query': return query(command.url, command.filter);
    case 'receive': return receive(command);
    case 'receive-human-text': return receiveHumanText(command);
    case 'inspect-agent-envelope': return inspectAgentEnvelope(command);
    case 'snapshot': return { seenMessageIds: seen.size };
    case 'shutdown': {
      for (const socket of sockets.values()) { try { socket.close(1000, 'G3 test complete'); } catch {} }
      sockets.clear(); return { stopped: true };
    }
    default: throw new Error('Unsupported synthetic agent operation.');
  }
}

input.on('line', line => {
  let command;
  try { command = JSON.parse(line); }
  catch { process.stdout.write(`${JSON.stringify({ id: null, error: 'invalid-command-json' })}\n`); return; }
  Promise.resolve().then(() => handle(command)).then(result => {
    process.stdout.write(`${JSON.stringify({ id: command.id, result })}\n`);
  }, error => {
    process.stdout.write(`${JSON.stringify({ id: command.id, error: `${command.op}: ${error.message}`.slice(0, 800) })}\n`);
  });
});
