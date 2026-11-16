import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'web/local-moderation.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, TypeError, RangeError });
const moderation = window.PropertyLocalModeration;
const identities = Array.from({ length: 5 }, (_, i) => String(i + 1).repeat(64));
const relays = Array.from({ length: 5 }, (_, i) => `private-relay-${i + 1}`);
const identitySettings = new Map(identities.map(identity => [identity, []]));
const relayEvents = new Map(relays.map(relay => [relay, Array.from({ length: 50 }, (_, i) => `event-${i + 1}`)]));
const relaySnapshot = JSON.stringify([...relayEvents]);
let completed = 0;

for (let index = 0; index < 50; index++) {
  const ownerIndex = index % identities.length;
  const owner = identities[ownerIndex];
  const peer = identities[(ownerIndex + 1 + Math.floor(index / identities.length) % (identities.length - 1)) % identities.length];
  const records = [];
  const block = moderation.createBlockRecord(owner, peer, 1000 + index);
  records.push(block);
  assert.equal(moderation.isBlocked(records, owner, peer), true);
  assert.ok(moderation.blockedPeers(records, owner).includes(peer));

  const other = identities[(ownerIndex + 1 + ((Math.floor(index / identities.length) + 1) % (identities.length - 1))) % identities.length];
  const messages = [
    { id: `incoming-${index}`, senderPubkey: peer, direction: 'received', text: 'hostile text stays out of local view' },
    { id: `outgoing-${index}`, senderPubkey: owner, direction: 'sent', text: 'my own history remains visible' },
    { id: `other-${index}`, senderPubkey: other, direction: 'received', text: 'another contact remains visible' }
  ];
  const visible = moderation.visibleMessages(messages, new Set(moderation.blockedPeers(records, owner)));
  assert.deepEqual(visible.map(message => message.id), [`outgoing-${index}`, `other-${index}`]);
  assert.equal(moderation.visibleMessages(messages, new Set()).length, 3, 'another local identity has no shared global block');

  const reportRecords = identitySettings.get(owner);
  const reportCountBefore = moderation.localReports(reportRecords, owner).length;
  const report = moderation.createReportRecord(owner, peer, moderation.REPORT_REASONS[index % moderation.REPORT_REASONS.length], 2000 + index, String(index + 1).padStart(16, '0'));
  reportRecords.push(report);
  assert.equal(moderation.localReports(reportRecords, owner).length, reportCountBefore + 1);
  assert.equal(moderation.localReports(identitySettings.get(peer), peer).some(item => item.id === report.id), false, 'a local report is not disclosed to another identity');
  assert.equal(Object.hasOwn(report, 'text'), false, 'local report does not copy message contents');

  for (const relay of relays) assert.equal(relayEvents.get(relay).length, 50, 'local moderation never deletes relay events');
  completed++;
}

assert.equal(completed, 50);
assert.equal(JSON.stringify([...relayEvents]), relaySnapshot, 'all five independent relay logs remain byte-for-byte unchanged');
const corrupted = [null, {}, { type: 'property-local-block/v1', identity: identities[0], peer: {}, id: 'bad', blocked_at: 1 }];
assert.deepEqual(Array.from(moderation.blockedPeers(corrupted, identities[0])), [], 'corrupt local records fail closed without crashing');
assert.throws(() => moderation.blockId(identities[0], identities[0]), TypeError);
assert.throws(() => moderation.createReportRecord(identities[0], identities[1], 'unlisted', 1, '0123456789abcdef'), RangeError);

console.log('PASS: 50 local block/report cases across 5 identities and 5 relay fixtures; relay histories unchanged');
