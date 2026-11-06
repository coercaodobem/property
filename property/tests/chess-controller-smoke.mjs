import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChessController } from '../web/chess/build/game.js';
import { commitment, deal } from '../web/chess/build/toss.js';
import { MAX_MESSAGE_BYTES, PROTOCOL, parseMessage } from '../web/chess/build/protocol.js';

function pairApis() {
  const handlers = [new Map([['message', new Set()], ['peer', new Set()]]), new Map([['message', new Set()], ['peer', new Set()]])];
  const stores = [new Map(), new Map()];
  const apis = [0, 1].map(side => ({
    context: async () => ({ inChat: true, peer: { open: true }, locale: 'en' }),
    storage: {
      get: async key => structuredClone(stores[side].get(key)),
      set: async (key, value) => stores[side].set(key, structuredClone(value)),
      delete: async key => stores[side].delete(key),
    },
    chat: {
      send: async data => {
        for (const listener of handlers[1 - side].get('message')) listener(structuredClone(data));
      },
      on: (event, listener) => {
        const group = handlers[side].get(event);
        group.add(listener);
        return () => group.delete(listener);
      },
    },
  }));
  return { apis, stores };
}

async function settleRepeatedly(games, repetitions = 12) {
  for (let i = 0; i < repetitions; i += 1) {
    await Promise.all(games.map(game => game.settled()));
  }
}

test('Property chess protocol has a domain-specific identity and rejects oversized or malformed input', () => {
  assert.equal(PROTOCOL, 'property-chess');
  assert.deepEqual(parseMessage({ p: PROTOCOL, v: 1, k: 'move', g: '0'.repeat(16), n: 0, m: 'e2e4' }), {
    ok: true,
    message: { k: 'move', g: '0'.repeat(16), n: 0, m: 'e2e4' },
  });
  assert.equal(parseMessage({ p: PROTOCOL, v: 1, k: 'move', g: 'bad', n: 0, m: 'e2e4' }).reason, 'malformed');
  assert.equal(parseMessage({ p: PROTOCOL, v: 1, k: 'move', g: '0'.repeat(16), n: 0, m: 'e2e4', extra: 'x'.repeat(MAX_MESSAGE_BYTES) }).reason, 'too-big');
});

test('Property chess colour toss is deterministic and independent of participant order', () => {
  const alice = '11'.repeat(32);
  const bob = '22'.repeat(32);
  const fromAlice = deal(alice, bob);
  const fromBob = deal(bob, alice);
  assert.equal(commitment(alice), commitment(alice));
  assert.equal(fromAlice.g, fromBob.g);
  assert.notEqual(fromAlice.me, fromBob.me);
  assert.throws(() => deal(alice, alice), /same salt/);
});

test('two offline Property clients establish, exchange a legal move, and recover their saved board after reopening', async () => {
  const { apis } = pairApis();
  const makeGames = () => [
    new ChessController(apis[0], { random: bytes => new Uint8Array(bytes).fill(0x11), now: () => 100 }),
    new ChessController(apis[1], { random: bytes => new Uint8Array(bytes).fill(0x22), now: () => 100 }),
  ];
  let games = makeGames();
  await Promise.all(games.map(game => game.start()));
  await settleRepeatedly(games);

  assert.equal(games[0].view().phase, 'playing');
  assert.equal(games[1].view().phase, 'playing');
  assert.equal(games[0].view().fen, games[1].view().fen);
  assert.notEqual(games[0].view().me, games[1].view().me);

  const white = games.find(game => game.view().me === 'w');
  assert.ok(white);
  assert.equal(await white.move('e2', 'e4'), true);
  await settleRepeatedly(games);
  assert.equal(games[0].view().plies, 1);
  assert.equal(games[1].view().plies, 1);
  assert.equal(games[0].view().fen, games[1].view().fen);
  assert.equal(await white.move('e7', 'e5'), false);

  games.forEach(game => game.stop());
  games = makeGames();
  await Promise.all(games.map(game => game.start()));
  await settleRepeatedly(games);
  assert.equal(games[0].view().plies, 1);
  assert.equal(games[1].view().plies, 1);
  assert.equal(games[0].view().fen, games[1].view().fen);
  games.forEach(game => game.stop());
});
