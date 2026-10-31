import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const relayUrl = process.argv[2] || 'ws://127.0.0.1:7447';
const summaryFile = process.argv[3] || null;
const bundle = await readFile(new URL('../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8');
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context); vm.runInContext(bundle, context, { timeout: 5000 });
vm.runInContext(await readFile(new URL('../web/money.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
vm.runInContext(await readFile(new URL('../web/marketplace.js', import.meta.url), 'utf8'), context, { timeout: 5000 });
const N = context.NostrTools;
const Marketplace = context.PropertyMarketplace;
const alice = N.generateSecretKey();
const bob = N.generateSecretKey();
const bobPub = N.getPublicKey(bob);
const message = `relay-smoke-${crypto.randomUUID()}`;
const listingTime = Math.floor(Date.now() / 1000) - 3;
const wraps = N.nip17.wrapManyEvents(alice, [{ publicKey: bobPub }], message);
const alicePub = N.getPublicKey(alice);
function signEvent(template, secret) {
  context.eventTemplateJson = JSON.stringify(template);
  context.secretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(eventTemplateJson), Uint8Array.from(secretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}
function verifyEvent(event) {
  context.eventJson = JSON.stringify(event);
  return vm.runInContext('NostrTools.verifyEvent(JSON.parse(eventJson))', context, { timeout: 5000 });
}
const inboxList = signEvent({ kind: 10050, pubkey: bobPub, tags: [['relay', relayUrl]], content: '', created_at: Math.floor(Date.now() / 1000) }, bob);
const stallId = `stall-${crypto.randomUUID()}`;
const productId = `product-${crypto.randomUUID()}`;
const stall = signEvent({ kind: 30017, pubkey: alicePub, tags: [['d', stallId]], content: JSON.stringify({ id: stallId, name: 'Property Test Stall', currency: 'XNO', shipping: [] }), created_at: listingTime }, alice);
const product = signEvent({
  kind: 30018,
  pubkey: alicePub,
  tags: [['d', productId]],
  content: JSON.stringify({ id: productId, stall_id: stallId, name: 'XNO precision test', description: 'Local integration test', images: [], currency: 'XNO', price: 0.25, price_raw: '250000000000000000000000000000', quantity: null, specs: [], shipping: [] }),
  created_at: listingTime
}, alice);
const moneroId = `product-${crypto.randomUUID()}`;
const moneroProduct = signEvent({
  kind: 30018, pubkey: alicePub, tags: [['d', moneroId]], created_at: listingTime,
  content: JSON.stringify({ id: moneroId, stall_id: stallId, name: 'XMR precision test', currency: 'XMR', price: 0.000000000001, price_atomic: '1' })
}, alice);
const bitcoinId = `product-${crypto.randomUUID()}`;
const bitcoinProduct = signEvent({
  kind: 30018, pubkey: alicePub, tags: [['d', bitcoinId]], created_at: listingTime,
  content: JSON.stringify({ id: bitcoinId, stall_id: stallId, name: 'BTC precision test', currency: 'BTC', price: 0.00000001, price_atomic: '1' })
}, alice);
const updatedProduct = signEvent({
  kind: 30018, pubkey: alicePub, tags: [['d', productId]], created_at: listingTime + 1,
  content: JSON.stringify({ id: productId, stall_id: stallId, name: 'XNO precision updated', description: 'NIP-15 update', images: [], currency: 'XNO', price: 0.5, price_raw: '500000000000000000000000000000', quantity: null, specs: [], shipping: [] })
}, alice);
const productDeletion = signEvent({
  kind: 5, pubkey: alicePub, created_at: listingTime + 2,
  tags: [['a', `30018:${alicePub}:${productId}`], ['e', updatedProduct.id], ['k', '30018']], content: ''
}, alice);
const acknowledgedEvents = new Map();
function recordAcknowledged(event) { acknowledgedEvents.set(event.id, event); }

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(relayUrl);
    const timer = setTimeout(() => { socket.close(); reject(new Error(`timeout conectando em ${relayUrl}`)); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`falha ao conectar em ${relayUrl}`)); }, { once: true });
  });
}
function waitFrame(socket, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('timeout aguardando resposta Nostr')); }, timeout);
    function listener(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (!predicate(frame)) return;
      clearTimeout(timer); socket.removeEventListener('message', listener); resolve(frame);
    }
    socket.addEventListener('message', listener);
  });
}
const socket = await openSocket();
try {
  for (const wrap of wraps) {
    const ack = waitFrame(socket, frame => frame[0] === 'OK' && frame[1] === wrap.id);
    socket.send(JSON.stringify(['EVENT', wrap]));
    const result = await ack;
    assert.equal(result[2], true, `relay accepted gift wrap ${wrap.id}: ${result[3] || ''}`);
    recordAcknowledged(wrap);
  }
  const inboxAck = waitFrame(socket, frame => frame[0] === 'OK' && frame[1] === inboxList.id);
  socket.send(JSON.stringify(['EVENT', inboxList]));
  const inboxResult = await inboxAck;
  assert.equal(inboxResult[2], true, `relay accepted kind-10050 inbox list: ${inboxResult[3] || ''}`);
  recordAcknowledged(inboxList);
  for (const listing of [stall, product, moneroProduct, bitcoinProduct]) {
    const listingAck = waitFrame(socket, frame => frame[0] === 'OK' && frame[1] === listing.id);
    socket.send(JSON.stringify(['EVENT', listing]));
    const result = await listingAck;
    assert.equal(result[2], true, `relay accepted NIP-15 event ${listing.kind}: ${result[3] || ''}`);
    recordAcknowledged(listing);
  }
  const events = new Map();
  const query = 'test-' + crypto.randomUUID();
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não concluiu consulta kind 1059')), 7000);
    socket.addEventListener('message', function onMessage(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === query) events.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === query) { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(); }
    });
  });
  socket.send(JSON.stringify(['REQ', query, { kinds: [1059], '#p': [bobPub], limit: 20 }]));
  await done;
  const recipientEvents = [...events.values()].filter(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === bobPub));
  assert.ok(recipientEvents.length >= 1, 'relay retained recipient gift wrap');
  const decrypted = recipientEvents.map(event => N.nip17.unwrapEvent(event, bob)).find(rumor => rumor.content === message);
  assert.ok(decrypted, 'recipient recovered private NIP-17 content');
  const inboxQuery = 'inbox-' + crypto.randomUUID();
  const inboxEvents = new Map();
  const inboxDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não concluiu consulta kind 10050')), 7000);
    socket.addEventListener('message', function onMessage(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === inboxQuery) inboxEvents.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === inboxQuery) { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(); }
    });
  });
  socket.send(JSON.stringify(['REQ', inboxQuery, { kinds: [10050], authors: [bobPub], limit: 20 }]));
  await inboxDone;
  assert.ok([...inboxEvents.values()].some(event => event.id === inboxList.id && verifyEvent(event)), 'recipient kind-10050 list is discoverable and signature-valid');
  assert.ok([...events.values()].every(event => !event.content.includes(message)), 'relay never received plaintext');
  const listingQuery = `listing-${crypto.randomUUID()}`;
  const listings = new Map();
  const listingDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não concluiu consulta de produto NIP-15')), 7000);
    socket.addEventListener('message', function onMessage(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === listingQuery) listings.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === listingQuery) { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(); }
    });
  });
  socket.send(JSON.stringify(['REQ', listingQuery, { ids: [product.id, moneroProduct.id, bitcoinProduct.id], limit: 4 }]));
  await listingDone;
  const storedProduct = listings.get(product.id);
  assert.ok(storedProduct && verifyEvent(storedProduct), 'relay serves the valid signed NIP-15 product');
  const productContent = JSON.parse(storedProduct.content);
  assert.equal(productContent.price_raw, '250000000000000000000000000000', 'exact raw amount survives event storage');
  assert.equal(productContent.price, 0.25, 'NIP-15 numeric amount remains unchanged');
  const storedMonero = listings.get(moneroProduct.id);
  assert.ok(storedMonero && verifyEvent(storedMonero));
  assert.equal(Marketplace.displayPrice(JSON.parse(storedMonero.content)), '0.000000000001 XMR', 'one piconero survives relay round-trip');
  const storedBitcoin = listings.get(bitcoinProduct.id);
  assert.ok(storedBitcoin && verifyEvent(storedBitcoin));
  assert.equal(Marketplace.displayPrice(JSON.parse(storedBitcoin.content)), '0.00000001 BTC', 'one satoshi survives relay round-trip');
  const updateAck = waitFrame(socket, frame => frame[0] === 'OK' && frame[1] === updatedProduct.id);
  socket.send(JSON.stringify(['EVENT', updatedProduct]));
  const updateResult = await updateAck;
  assert.equal(updateResult[2], true, `relay accepted addressable NIP-15 update: ${updateResult[3] || ''}`);
  recordAcknowledged(updatedProduct);
  const latestQuery = `listing-latest-${crypto.randomUUID()}`;
  const latestEvents = new Map();
  const latestDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não concluiu consulta de atualização NIP-15')), 7000);
    socket.addEventListener('message', function onMessage(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === latestQuery) latestEvents.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === latestQuery) { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(); }
    });
  });
  socket.send(JSON.stringify(['REQ', latestQuery, { kinds: [30018], authors: [alicePub], '#d': [productId], limit: 5 }]));
  await latestDone;
  const latestProduct = Marketplace.selectActiveProducts([...latestEvents.values()], verifyEvent).find(event => event.data.id === productId);
  assert.ok(latestProduct, 'relay serves the updated addressable product');
  assert.equal(JSON.parse(latestProduct.content).price_raw, '500000000000000000000000000000', 'update replaces the addressable listing');

  const deleteAck = waitFrame(socket, frame => frame[0] === 'OK' && frame[1] === productDeletion.id);
  socket.send(JSON.stringify(['EVENT', productDeletion]));
  const deleteResult = await deleteAck;
  assert.equal(deleteResult[2], true, `relay accepted NIP-09 product withdrawal: ${deleteResult[3] || ''}`);
  recordAcknowledged(productDeletion);
  const allListingQuery = `listing-delete-${crypto.randomUUID()}`;
  const allListingEvents = new Map();
  const allListingDone = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não concluiu consulta de retirada NIP-15')), 7000);
    socket.addEventListener('message', function onMessage(event) {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame[0] === 'EVENT' && frame[1] === allListingQuery) allListingEvents.set(frame[2].id, frame[2]);
      if (frame[0] === 'EOSE' && frame[1] === allListingQuery) { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(); }
    });
  });
  socket.send(JSON.stringify(['REQ', allListingQuery, { kinds: [30018, 5], authors: [alicePub], limit: 20 }]));
  await allListingDone;
  const visibleProducts = Marketplace.selectActiveProducts([...allListingEvents.values()], verifyEvent);
  assert.equal(visibleProducts.some(item => item.data.id === productId), false, 'withdrawal event hides the listing even if a relay returns its old copy');
  if (summaryFile) {
    const acceptedEvents = [...acknowledgedEvents.values()].map(event => ({
      id: event.id,
      kind: event.kind,
      sha256: createHash('sha256').update(JSON.stringify({
        id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind,
        tags: event.tags, content: event.content
      })).digest('hex')
    }));
    const excludedAfterMutation = [
      { id: product.id, reason: 'superseded by a newer addressable NIP-15 event with the same author and d tag' },
      { id: updatedProduct.id, reason: 'targeted by the acknowledged NIP-09 deletion event' }
    ];
    const excludedIds = new Set(excludedAfterMutation.map(event => event.id));
    const persistedEvents = acceptedEvents.filter(event => !excludedIds.has(event.id));
    await writeFile(summaryFile, JSON.stringify({
      schema_version: 1,
      accepted_events: acceptedEvents,
      persisted_events: persistedEvents,
      excluded_after_protocol_mutation: excludedAfterMutation
    }, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(`PASS: relay ${relayUrl} handled encrypted NIP-17, kind-10050 routing, exact-raw NIP-15 create/update, and signed withdrawal`);
} finally { socket.close(); }
