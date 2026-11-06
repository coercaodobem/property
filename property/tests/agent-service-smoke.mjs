import assert from 'node:assert/strict';
import { AgentService } from '../agent/service.mjs';
import { createEmptyConfig, validateConfig } from '../agent/core.mjs';

const self = 'a'.repeat(64);
const peer = 'b'.repeat(64);
const blockedPeer = 'c'.repeat(64);
let config = createEmptyConfig(self);
const sends = [];
const announcements = [];
const activities = [];
const transport = {
  async listConversations(limit, blocked) {
    assert.equal(limit, 100);
    return [{ pubkey: peer, last_activity: 1_900_000_000, last_message_id: '1'.repeat(32) },
      ...(blocked.includes(blockedPeer) ? [] : [{ pubkey: blockedPeer, last_activity: 1_900_000_001, last_message_id: '2'.repeat(32) }])];
  },
  async readMessages(pubkey) { return [{ conversation_pubkey: pubkey, message_id: '3'.repeat(32), in_reply_to: null, direction: 'received', body: 'chegou sem pareamento', created_at: 1_900_000_000 }]; },
  async sendMessage(...args) { sends.push(args); return { status: 'relay_accepted', message_id: '4'.repeat(32), relay_acks: 1, relay_attempts: 1 }; },
  async sendActivity(...args) { activities.push(args); return { status: 'relay_accepted', state: args[1], relay_acks: 1, relay_attempts: 1 }; },
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
const thinking = await service.dispatch('activity', { conversation_pubkey: peer, state: 'thinking' });
assert.equal(thinking.state, 'thinking'); assert.equal(thinking.changed, true); assert.equal(thinking.renewed, false);
const refreshed = await service.dispatch('activity', { conversation_pubkey: peer, state: 'thinking' });
assert.equal(refreshed.changed, false); assert.equal(refreshed.renewed, true);
const sent = await service.dispatch('send', { conversation_pubkey: peer, text: 'mensagem direta', in_reply_to: null });
assert.equal(sent.status, 'relay_accepted');
assert.deepEqual(sends[0], [peer, 'mensagem direta', null, ['ws://127.0.0.1:7447']]);
assert.deepEqual(activities.map(item => item.slice(0, 2)), [[peer, 'thinking'], [peer, 'thinking'], [peer, 'stop']], 'sending a message ends the private thinking status');
const redundantStop = await service.dispatch('activity', { conversation_pubkey: peer, state: 'stop' });
assert.equal(redundantStop.changed, false); assert.equal(activities.length, 3);
await assert.rejects(service.dispatch('activity', { conversation_pubkey: peer, state: 'thinking', status: 'reading secrets' }), /invalid-arguments/);

await service.dispatch('activity', { conversation_pubkey: blockedPeer, state: 'thinking' });
const activityCountBeforeBlock = activities.length;
await service.dispatch('agent.block', { pubkey: blockedPeer });
assert.ok(config.blocked_pubkeys.includes(blockedPeer));
await service.close();
assert.equal(activities.length, activityCountBeforeBlock, 'blocking a peer clears local activity without sending another signal to the blocked identity');
await assert.rejects(service.dispatch('read', { conversation_pubkey: blockedPeer, limit: 1 }), /agent-blocked-locally/);
await assert.rejects(service.dispatch('send', { conversation_pubkey: blockedPeer, text: 'blocked', in_reply_to: null }), /agent-blocked-locally/);
await assert.rejects(service.dispatch('activity', { conversation_pubkey: blockedPeer, state: 'thinking' }), /agent-blocked-locally/);
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

const quotaPeer = 'd'.repeat(64);
const quotaService = new AgentService({ pubkey: self, loadConfig: async () => config, saveConfig: async value => { config = structuredClone(value); }, transport, now: () => 1_900_000_000 });
for (let index = 0; index < 30; index++) {
  const contact = index.toString(16).padStart(64, '0');
  await quotaService.dispatch('activity', { conversation_pubkey: contact, state: 'thinking' });
}
await assert.rejects(quotaService.dispatch('activity', { conversation_pubkey: quotaPeer, state: 'thinking' }), /activity-quota-exceeded/);
const quotaStop = await quotaService.dispatch('activity', { conversation_pubkey: '0'.repeat(64), state: 'stop' });
assert.equal(quotaStop.changed, true, 'an active indicator can always be cleared after the refresh quota is reached');
assert.equal(activities.at(-1)[1], 'stop');
await quotaService.close();

let expiryNow = 1_900_000_000;
const expiryActivities = [];
const expiryService = new AgentService({ pubkey: self, loadConfig: async () => config, saveConfig: async value => { config = structuredClone(value); },
  transport: { ...transport, async sendActivity(...args) { expiryActivities.push(args); return { status: 'relay_accepted', state: args[1], relay_acks: 1, relay_attempts: 1 }; } },
  now: () => expiryNow });
const expiredPeer = 'e'.repeat(64), activePeer = 'f'.repeat(64);
await expiryService.dispatch('activity', { conversation_pubkey: expiredPeer, state: 'thinking' });
expiryNow += 61;
await expiryService.dispatch('activity', { conversation_pubkey: activePeer, state: 'thinking' });
const expiredStop = await expiryService.dispatch('activity', { conversation_pubkey: expiredPeer, state: 'stop' });
assert.equal(expiredStop.changed, false, 'an expired local activity state is removed before handling a stop');
await expiryService.close();
assert.deepEqual(expiryActivities.map(item => [item[0], item[1]]), [[expiredPeer, 'thinking'], [activePeer, 'thinking'], [activePeer, 'stop']],
  'expiry prunes stale states and daemon close stops only the current active indicator');

await assert.rejects(service.dispatch('invite.make', {}), /tool-not-allowed/);
await assert.rejects(service.dispatch('contact.configure', {}), /tool-not-allowed/);
process.stdout.write('PASS: agente envia mensagens e estados thinking privados sem aprovação; estados sem texto, limite fixo, bloqueio local revogável e migração v3.\n');
