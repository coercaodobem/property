#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentService } from '../../agent/service.mjs';
import { createEmptyConfig, eventInContext, loadNostr, secretBytesInContext } from '../../agent/core.mjs';
import { NostrAgentTransport } from '../../agent/relay.mjs';
import { GEODE_SHA256, prepareGeodeRuntime, startGeode, stopGeode } from './geode-fixture-g5.mjs';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXED_NOW = 1_900_000_000;
const EXCHANGES = 50;
const directions = [
  { sender: 0, recipient: 1, count: 17, label: 'agent-a-to-b' },
  { sender: 1, recipient: 2, count: 17, label: 'agent-b-to-c' },
  { sender: 2, recipient: 0, count: 16, label: 'agent-c-to-a' },
];
const proxies = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
for (const key of proxies) delete process.env[key];

const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g5-agent-relays-'));
await chmod(temp, 0o700);
const relays = [];
const agents = [];
const reportDir = path.join(PROPERTY_ROOT, 'docs/evidence/product-completion/G5');
let querySequence = 0;
let thirdIdentityDecryptionAttempts = 0;

async function queryRelay(url, filter) {
  const socket = new WebSocket(url);
  const sub = `property-g5-query-${String(++querySequence).padStart(4, '0')}`;
  return await new Promise((resolve, reject) => {
    const events = new Map();
    const watchdog = setTimeout(() => { socket.close(); reject(new Error(`G5 relay query watchdog: ${url}`)); }, 12000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', sub, filter])));
    socket.addEventListener('message', event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === sub && frame[2]?.id) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === sub) { clearTimeout(watchdog); socket.close(); resolve([...events.values()]); }
    });
    socket.addEventListener('error', () => { clearTimeout(watchdog); reject(new Error(`G5 relay query failed: ${url}`)); }, { once: true });
  });
}

try {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  const { binary } = await prepareGeodeRuntime(temp);
  for (let index = 0; index < 3; index++) relays.push(await startGeode({ baseDir: temp, binary, port: 28480 + index, index }));
  const relayUrls = relays.map(relay => relay.url);
  const { context, nostr, messages } = await loadNostr(PROPERTY_ROOT);

  for (let index = 0; index < 3; index++) {
    const secretHex = (index + 1).toString(16).padStart(64, '0');
    const secret = secretBytesInContext(context, secretHex);
    const pubkey = nostr.getPublicKey(secret);
    const config = createEmptyConfig(pubkey);
    config.inbox_relays = relayUrls;
    let configValue = structuredClone(config);
    const transport = new NostrAgentTransport({ nostr, messages, context, secretHex, pubkey, inboxRelays: relayUrls });
    const service = new AgentService({ pubkey, loadConfig: async () => structuredClone(configValue), saveConfig: async value => { configValue = structuredClone(value); }, transport, now: () => FIXED_NOW });
    agents.push({ name: `agent-${String.fromCharCode(97 + index)}`, pubkey, secretHex, secret, transport, service, configValue: () => configValue });
  }

  for (const agent of agents) {
    const announced = await agent.transport.announceInboxRelays(relayUrls, relayUrls);
    assert.deepEqual(announced, { acks: 3, attempts: 3 });
  }
  for (const [index, relay] of relays.entries()) {
    for (const agent of agents) {
      const events = await queryRelay(relay.url, { kinds: [10050], authors: [agent.pubkey], limit: 10 });
      assert.ok(events.some(event => event.kind === 10050 && event.pubkey === agent.pubkey && nostr.verifyEvent(eventInContext(context, event))), `relay ${index} stores a valid inbox announcement for ${agent.name}`);
    }
  }

  const manifest = [];
  for (const direction of directions) {
    const sender = agents[direction.sender], recipient = agents[direction.recipient];
    for (let count = 1; count <= direction.count; count++) {
      const body = `property-g5-${direction.label}-${String(count).padStart(2, '0')}`;
      const sent = await sender.service.dispatch('send', { conversation_pubkey: recipient.pubkey, text: body, in_reply_to: null });
      assert.equal(sent.status, 'relay_accepted', `${direction.label}/${count} is accepted by every declared relay`);
      assert.equal(sent.relay_acks, 6, 'each NIP-17 self/recipient envelope is accepted on three selected relays');
      assert.equal(sent.relay_attempts, 6);
      manifest.push({ direction: direction.label, sender: direction.sender, recipient: direction.recipient, body, messageId: sent.message_id });
    }
  }
  assert.equal(manifest.length, EXCHANGES);

  for (const direction of directions) {
    const sender = agents[direction.sender], recipient = agents[direction.recipient];
    const received = await recipient.service.dispatch('read', { conversation_pubkey: sender.pubkey, limit: 100 });
    const incoming = received.messages.filter(message => message.direction === 'received');
    assert.equal(incoming.length, direction.count, `${recipient.name} decrypts every message from ${sender.name} exactly once after three-relay dedupe`);
    const actual = incoming.map(message => message.body).sort();
    const expected = manifest.filter(item => item.direction === direction.label).map(item => item.body).sort();
    assert.deepEqual(actual, expected);
    const third = agents.find((_, index) => index !== direction.sender && index !== direction.recipient);
    const outsider = await third.service.dispatch('read', { conversation_pubkey: sender.pubkey, limit: 100 });
    assert.deepEqual(outsider.messages, [], `${third.name} cannot read a conversation addressed to ${recipient.name}`);
  }

  const perRelayEvents = [];
  for (const relay of relays) {
    const events = await queryRelay(relay.url, { kinds: [1059], limit: 1000 });
    assert.equal(events.length, EXCHANGES * 2, 'each exchange creates one NIP-17 wrapper for its sender and one for its recipient');
    for (const event of events) {
      const inContext = eventInContext(context, event);
      assert.equal(nostr.verifyEvent(inContext), true, 'every stored gift wrap has a valid signature');
      assert.ok(event.tags.every(tag => tag[0] !== 'p' || agents.some(agent => tag[1] === agent.pubkey)), 'gift wraps route only to the participating sender or recipient');
      assert.ok(!manifest.some(item => event.content.includes(item.body)), 'relay ciphertext contains none of the plaintext exchange bodies');
    }
    perRelayEvents.push({ url: relay.url, signed_ciphertext_wrappers: events.length,
      event_ids_sha256: createHash('sha256').update(events.map(event => event.id).sort().join('\n')).digest('hex') });
  }
  assert.equal(new Set(perRelayEvents.map(item => item.event_ids_sha256)).size, 1, 'all three independent relays hold the same signed envelope set');

  for (const item of manifest) {
    const recipient = agents[item.recipient];
    const outsider = agents.find((_, index) => index !== item.sender && index !== item.recipient);
    const events = await queryRelay(relays[item.recipient].url, { kinds: [1059], '#p': [recipient.pubkey], limit: 1000 });
    const targetEvent = events.find(event => {
      try {
        const rumor = nostr.nip17.unwrapEvent(eventInContext(context, event), recipient.secret);
        return rumor?.content?.includes(item.messageId) || false;
      } catch { return false; }
    });
    assert.ok(targetEvent, `recipient ${recipient.name} has a decryptable envelope for ${item.direction}/${item.messageId}`);
    let opened = null;
    try { opened = nostr.nip17.unwrapEvent(eventInContext(context, targetEvent), outsider.secret); } catch {}
    thirdIdentityDecryptionAttempts++;
    assert.ok(!opened || typeof opened.content !== 'string' || !opened.content.includes(item.body), `nonparticipant ${outsider.name} cannot decrypt ${item.direction}`);
  }

  const result = {
    gate: 'G5', status: 'PASS_AUTOMATED_OFFLINE', seed: 'property-g5-three-geode-relay-agent-exchange-v1',
    operating_system: `${process.platform}/${process.arch}`, node: process.version,
    external_connections: 0, external_models: 0, real_participants: 0, real_funds: false, public_relays: false,
    geode_sha256: GEODE_SHA256, relay_count: relays.length,
    agent_pubkey_sha256: agents.map(agent => createHash('sha256').update(agent.pubkey).digest('hex')),
    fixed_exchanges: EXCHANGES, exchanges_per_direction: Object.fromEntries(directions.map(item => [item.label, item.count])),
    per_relay_events: perRelayEvents, ciphertext_contains_plaintext: false,
    third_identity_decryption_attempts: thirdIdentityDecryptionAttempts, all_recipients_decrypted_exactly_once: true,
    manifest_sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  };
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(reportDir, 'agent-relay-exchanges.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  for (const agent of agents) { agent.secret.fill(0); agent.transport.secret.fill(0); agent.transport.context.propertyAgentSecretHex = ''; }
  for (const relay of relays.reverse()) await stopGeode(relay).catch(error => process.stderr.write(`cleanup: ${error.message}\n`));
  await rm(temp, { recursive: true, force: true });
}
