import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/message-scroll.js', import.meta.url), 'utf8'), context);
const Scroll = context.window.PropertyMessageScroll;

assert.equal(Scroll.isNearBottom({ scrollHeight: 1000, scrollTop: 829, clientHeight: 100 }), true);
assert.equal(Scroll.isNearBottom({ scrollHeight: 1000, scrollTop: 828, clientHeight: 100 }), false);
assert.equal(Scroll.isNearBottom({ scrollHeight: 1000, scrollTop: 0, clientHeight: 0 }), false);
assert.equal(Scroll.isNearBottom({ scrollHeight: 1, scrollTop: 0, clientHeight: 1 }, -1), false);

const oldMessages = [
  { id: 'old', direction: 'received', createdAt: 1000 },
  { id: 'mine', direction: 'sent', createdAt: 1100 }
];
const previousIds = new Set(oldMessages.map(message => message.id));
const incoming = Scroll.classifyUpdate([...oldMessages,
  { id: 'same-second', direction: 'received', createdAt: 1100 },
  { id: 'new', direction: 'received', createdAt: 1200 },
  { id: 'history-catchup', direction: 'received', createdAt: 900 }
], previousIds, 1100);
assert.deepEqual(JSON.parse(JSON.stringify(incoming)), { incomingCount: 2, hasOutgoing: false, latestCreatedAt: 1200 });

const outgoing = Scroll.classifyUpdate([...oldMessages,
  { id: 'outgoing', direction: 'sent', createdAt: 1300 }
], previousIds, 1100);
assert.deepEqual(JSON.parse(JSON.stringify(outgoing)), { incomingCount: 0, hasOutgoing: true, latestCreatedAt: 1300 });
assert.equal(Scroll.classifyUpdate(oldMessages, previousIds, 1100).incomingCount, 0, 'rerendering existing IDs adds no unread count');
assert.equal(Scroll.classifyUpdate([{ id: 'first', direction: 'received', createdAt: 1200 }], new Set(), null).incomingCount, 0,
  'opening a chat with existing history does not count it as new');

assert.deepEqual(JSON.parse(JSON.stringify(Scroll.buttonCopy(0, 'en'))), { text: '↓', ariaLabel: 'Scroll to bottom' });
assert.deepEqual(JSON.parse(JSON.stringify(Scroll.buttonCopy(1, 'en'))), { text: '↓ 1 new', ariaLabel: '1 new message, scroll to bottom' });
assert.deepEqual(JSON.parse(JSON.stringify(Scroll.buttonCopy(3, 'en'))), { text: '↓ 3 new', ariaLabel: '3 new messages, scroll to bottom' });
assert.deepEqual(JSON.parse(JSON.stringify(Scroll.buttonCopy(1, 'pt-BR'))), { text: '↓ 1 nova', ariaLabel: '1 mensagem nova, rolar para o fim' });
assert.deepEqual(JSON.parse(JSON.stringify(Scroll.buttonCopy(2, 'pt-BR'))), { text: '↓ 2 novas', ariaLabel: '2 mensagens novas, rolar para o fim' });
assert.equal(Scroll.buttonCopy(-2, 'pt-BR').text, '↓', 'invalid counts are not exposed');

console.log('PASS: chat scroll button counts only newly arrived messages, preserves history catch-up, and localizes accessible labels');
