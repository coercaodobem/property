import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, URL, btoa, atob };
context.window = context; vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/agent-messaging.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const messages = context.PropertyAgentMessages;
const cases = [];
function pass(id) { cases.push({ id, result: 'PASS' }); }
const id = number => number.toString(16).padStart(32, '0');
const valid = (number, body = `mensagem ${number}`) => ({ protocol: messages.PROTOCOL, version: 1, conversation_id: id(900), message_id: id(number), in_reply_to: null, body });

for (let index = 1; index <= 10; index++) {
  const input = valid(index, index === 1 ? 'olá 🌿' : `mensagem ${index}`);
  const encoded = messages.encodeEnvelope({ conversationId: input.conversation_id, messageId: input.message_id, inReplyTo: null, body: input.body });
  const decoded = messages.decodeEnvelope(encoded);
  assert.equal(decoded.body, input.body);
  assert.equal(decoded.messageId, id(index));
  pass(`G3-envelope-valid-${String(index).padStart(2, '0')}`);
}

const bad = [
  ['unknown-protocol', { ...valid(20), protocol: 'property-agent-message/v2' }, /compatível/],
  ['unknown-version', { ...valid(21), version: 2 }, /compatível/],
  ['unknown-field', { ...valid(22), command: 'run' }, /campos ausentes ou desconhecidos/],
  ['missing-field', (() => { const item = valid(23); delete item.in_reply_to; return item; })(), /campos ausentes ou desconhecidos/],
  ['bad-conversation-id', { ...valid(24), conversation_id: 'z'.repeat(32) }, /identificador inválido/],
  ['bad-message-id', { ...valid(25), message_id: 'a'.repeat(31) }, /identificador inválido/],
  ['bad-correlation', { ...valid(26), in_reply_to: 'not-an-id' }, /referência de resposta/],
  ['body-not-text', { ...valid(27), body: { command: 'run' } }, /precisa ser texto/],
  ['body-over-8192-bytes', { ...valid(28), body: 'é'.repeat(4097) }, /ultrapassa 8 KiB/],
];
for (const [name, value, message] of bad) {
  assert.throws(() => messages.decodeEnvelope(JSON.stringify(value)), message);
  pass(`G3-envelope-reject-${name}`);
}
const duplicate = `{"protocol":"property-agent-message/v1","version":1,"conversation_id":"${id(900)}","message_id":"${id(30)}","in_reply_to":null,"in_reply_to":null,"body":"x"}`;
assert.throws(() => messages.decodeEnvelope(duplicate), /repete um campo/); pass('G3-envelope-reject-duplicate-key');
const tooDeep = `{"protocol":"property-agent-message/v1","version":1,"conversation_id":"${id(900)}","message_id":"${id(31)}","in_reply_to":null,"body":[[[[[[]]]]]]}`;
assert.throws(() => messages.decodeEnvelope(tooDeep), /profundidade/); pass('G3-envelope-reject-excess-depth');
assert.throws(() => messages.decodeEnvelope('x'.repeat(16 * 1024 + 1)), /16 KiB/); pass('G3-envelope-reject-over-16KiB');

const firstPubkey = '11'.repeat(32), secondPubkey = '22'.repeat(32);
const conversationA = await messages.conversationId(firstPubkey, secondPubkey);
const conversationB = await messages.conversationId(secondPubkey, firstPubkey);
assert.match(conversationA, /^[0-9a-f]{32}$/); assert.equal(conversationA, conversationB);
pass('G3-conversation-id-order-independent');
await assert.rejects(() => messages.conversationId(firstPubkey, firstPubkey), /identidades.*inválidas/);
pass('G3-conversation-id-rejects-self');

let now = 1_900_000_000;
const limiter = messages.createRateLimiter({ limit: 30, windowSeconds: 60, now: () => now });
for (let index = 1; index <= 30; index++) assert.equal(limiter.consume(firstPubkey), index);
assert.throws(() => limiter.consume(firstPubkey), error => error.code === 'rate-limit');
pass('G3-rate-limit-fixed-window-30');
now += 60;
assert.equal(limiter.consume(firstPubkey), 1);
pass('G3-rate-limit-resets-next-logical-window');

const nonce = vm.runInContext('PropertyAgentMessages.createMessageId(length => Uint8Array.from({ length }, (_, index) => index))', context);
assert.equal(nonce, '000102030405060708090a0b0c0d0e0f');
pass('G3-message-id-fixed-random-fixture');

console.log(JSON.stringify({ gate: 'G3', suite: 'envelope-unit', status: 'PASS_TECHNICAL', seed: 'property-agent-envelope-fixed-v1', logicalNow: 1_900_000_000, caseCount: cases.length, cases }, null, 2));
