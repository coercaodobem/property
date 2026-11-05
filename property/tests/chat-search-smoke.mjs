import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/chat-search.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: 'chat-search.js' });
const search = context.window.PropertyMessageSearch;
const messages = [
  { id: 'old-1', kind: 14, text: 'Café na praça: amanhã' },
  { id: 'old-2', kind: 14, text: 'O encontro será na CAFETERIA' },
  { id: 'reaction', kind: 7, text: 'Café na praça: amanhã' },
  { id: 'old-3', kind: 14, text: 'Amanhã, café com amigos' },
  { id: 'no-match', kind: 14, text: 'mensagem sem os termos' },
  { id: 'latest', kind: 14, text: 'cafe\u0301 na praça amanhã' }
];

assert.deepEqual(Array.from(search.findMessageIds(messages, 'CAFE')), ['old-1', 'old-2', 'old-3', 'latest']);
assert.deepEqual(Array.from(search.findMessageIds(messages, 'amanha cafe')), ['old-1', 'old-3', 'latest'],
  'all words match in any order, ignoring case and accents');
assert.deepEqual(Array.from(search.findMessageIds(messages, 'not present')), []);
assert.deepEqual(Array.from(search.findMessageIds(messages, '   ')), []);
assert.deepEqual(Array.from(search.findMessageIds([{ id: 'reaction', kind: 7, text: 'café' }], 'cafe')), [],
  'reaction records are not searchable messages');

const text = '✨ Café, cafe\u0301, café!';
const ranges = Array.from(search.matchRanges(text, 'cafe'), range => Array.from(range));
assert.deepEqual(ranges, [[2, 6], [8, 13], [15, 19]], 'highlight ranges map accents and emoji back to original UTF-16 offsets');
assert.deepEqual(Array.from(search.matchRanges('café amanhã', 'cafe amanha'), range => Array.from(range)), [[0, 4], [5, 11]],
  'multiword highlights remain separate when their source spans do not overlap');
assert.deepEqual(Array.from(search.matchRanges('café', 'missing')), []);
assert.equal(search.foldText('Ação'), 'acao');

console.log('PASS: local chat search is case/accent insensitive, keeps message order, skips reactions, and maps safe highlight spans');
