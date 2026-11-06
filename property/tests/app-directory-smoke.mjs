import assert from 'node:assert/strict';

globalThis.window = {};
await import('../web/app-directory.js');
const { directHumanConversations } = window.PropertyAppDirectory;

const self = 'a'.repeat(64);
const human = 'b'.repeat(64);
const secondHuman = 'c'.repeat(64);
const group = 'd'.repeat(64);
const agent = 'e'.repeat(64);
const approvedAgent = 'f'.repeat(64);
const blockedAgent = '1'.repeat(64);
const candidates = [
  { pubkey: human, title: 'Alice' },
  { pubkey: group, group: true, title: 'Private room' },
  { pubkey: agent, agent: true, title: 'Explicit agent chat' },
  { pubkey: self, title: 'Self' },
  { pubkey: approvedAgent, title: 'Approved agent peer' },
  { pubkey: blockedAgent, title: 'Blocked agent peer' },
  { pubkey: secondHuman, title: 'Bob' },
  { pubkey: 'not-a-key', title: 'Malformed' },
  { pubkey: human, title: 'Duplicate contact row' },
  null
];
const access = [
  { pubkey: approvedAgent, status: 'approved' },
  { pubkey: blockedAgent, status: 'blocked' },
  { pubkey: secondHuman, status: 'pending' }
];

assert.deepEqual(
  directHumanConversations(candidates, self, access).map(item => item.pubkey),
  [human, secondHuman],
  'the local app picker includes unique direct people and excludes groups, agents, self, malformed keys and approved/blocked agents'
);
assert.deepEqual(directHumanConversations(candidates, 'invalid', access), [], 'an invalid local identity cannot produce chat targets');
assert.deepEqual(directHumanConversations(null, self, access), [], 'a broken conversation store fails closed');
assert.deepEqual(directHumanConversations(candidates, self, null), [], 'missing agent records fail closed so unknown agent chats cannot be offered as people');

console.log('PASS: built-in app chat picker exposes only unique, valid one-to-one human conversations and fails closed on invalid inputs');
