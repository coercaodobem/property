import assert from 'node:assert/strict';
import { AgentService } from '../agent/service.mjs';
import { createEmptyConfig, validateConfig } from '../agent/core.mjs';

const self = 'a'.repeat(64);
const peer = 'b'.repeat(64);
const blockedPeer = 'c'.repeat(64);
let config = createEmptyConfig(self);
const sends = [];
const announcements = [];
const transport = {
  async listConversations(limit, blocked) {
    assert.equal(limit, 100);
    return [{ pubkey: peer, last_activity: 1_900_000_000, last_message_id: '1'.repeat(32) },
      ...(blocked.includes(blockedPeer) ? [] : [{ pubkey: blockedPeer, last_activity: 1_900_000_001, last_message_id: '2'.repeat(32) }])];
  },
  async readMessages(pubkey) { return [{ conversation_pubkey: pubkey, message_id: '3'.repeat(32), in_reply_to: null, direction: 'received', body: 'chegou sem pareamento', created_at: 1_900_000_000 }]; },
  async sendMessage(...args) { sends.push(args); return { status: 'relay_accepted', message_id: '4'.repeat(32), relay_acks: 1, relay_attempts: 1 }; },
  async announceInboxRelays(relays) { announcements.push([...relays]); return { acks: relays.length, attempts: relays.length }; },
};
const service = new AgentService({ pubkey: self, loadConfig: async () => config, saveConfig: async value => { config = structuredClone(value); }, transport, now: () => 1_900_000_000 });

const added = await service.dispatch('relay.add', { relay: 'ws://127.0.0.1:7447' });
assert.deepEqual(added, { relay_count: 1, announcement_acks: 1, announcement_attempts: 1 });
assert.deepEqual(announcements, [['ws://127.0.0.1:7447']]);

const listed = await service.dispatch('list', {});
assert.deepEqual(listed.conversations.map(item => item.pubkey), [peer, blockedPeer]);
const read = await service.dispatch('read', { conversation_pubkey: peer, limit: 10 });
assert.equal(read.messages[0].body, 'chegou sem pareamento');
const sent = await service.dispatch('send', { conversation_pubkey: peer, text: 'mensagem direta', in_reply_to: null });
assert.equal(sent.status, 'relay_accepted');
assert.deepEqual(sends[0], [peer, 'mensagem direta', null, ['ws://127.0.0.1:7447']]);

await service.dispatch('agent.block', { pubkey: blockedPeer });
assert.ok(config.blocked_pubkeys.includes(blockedPeer));
await assert.rejects(service.dispatch('read', { conversation_pubkey: blockedPeer, limit: 1 }), /agent-blocked-locally/);
await assert.rejects(service.dispatch('send', { conversation_pubkey: blockedPeer, text: 'blocked', in_reply_to: null }), /agent-blocked-locally/);
await service.dispatch('agent.unblock', { pubkey: blockedPeer });
assert.equal(config.blocked_pubkeys.includes(blockedPeer), false);
assert.equal((await service.dispatch('status', {})).blocked_agents, 0);

const legacy = validateConfig({ schema: 'property-agent-config/v2', version: 2, pubkey: self, inbox_relays: [], contacts: [
  { pubkey: peer, name: 'approved-old-contact', relays: [], read: true, send: true, status: 'approved' },
  { pubkey: blockedPeer, name: 'blocked-old-contact', relays: [], read: false, send: false, status: 'blocked' },
], quota: { window: null, count: 0 } });
assert.equal(legacy.schema, 'property-agent-config/v3');
assert.deepEqual(legacy.blocked_pubkeys, [blockedPeer]);
assert.equal('contacts' in legacy, false, 'migration removes the allowlist while preserving local blocks');

await assert.rejects(service.dispatch('invite.make', {}), /tool-not-allowed/);
await assert.rejects(service.dispatch('contact.configure', {}), /tool-not-allowed/);
process.stdout.write('PASS: agentes leem e enviam sem pareamento, sem pedido de aprovação e com bloqueio local revogável; migração v3 preserva somente bloqueios.\n');
