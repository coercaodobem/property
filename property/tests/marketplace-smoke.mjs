import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['vendor/nostr-tools-2.25.2.bundle.js', 'nano.js', 'money.js', 'marketplace.js']) {
  vm.runInContext(await readFile(new URL(`../web/${file}`, import.meta.url), 'utf8'), context, { timeout: 5000 });
}
const { PropertyNanoUnits: nano, PropertyMarketplace: market } = context;
const N = context.NostrTools;

function sign(template, secret) {
  context.marketplaceTemplateJson = JSON.stringify(template);
  context.marketplaceSecretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(marketplaceTemplateJson), Uint8Array.from(marketplaceSecretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}

assert.deepEqual(JSON.parse(JSON.stringify(market.parsePrice('0,25 XNO', nano))), {
  price: 0.25, currency: 'XNO', raw: '250000000000000000000000000000', atomic: '250000000000000000000000000000'
});
assert.equal(market.parsePrice('0.00000001', nano).raw, '10000000000000000000000');
assert.equal(market.displayPrice({ price: 0.25, currency: 'XNO', price_raw: '250000000000000000000000000000' }, nano), '0.25 XNO');
assert.equal(market.displayPrice({ price: 1.5, currency: 'XNO', price_raw: 'not-raw' }, nano), 'Preço inválido');
assert.equal(market.displayPrice({ price: 50, currency: 'USD' }, nano), 'Preço inválido');
assert.equal(market.safeExternalImageUrl('https://example.org/image.png'), 'https://example.org/image.png');
for (const unsafe of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://example.org/image.png', 'https://user:pass@example.org/image.png', 'https://127.0.0.1/image.png', 'https://localhost/image.png']) {
  assert.equal(market.safeExternalImageUrl(unsafe), '', `rejects unsafe external image link: ${unsafe}`);
}
for (const invalid of ['-1', '1e3', '0.0000000000000000000000000000001', '2 USD', '', '9007199254740992 XNO', '9007199254740991.1 XNO']) {
  assert.throws(() => market.parsePrice(invalid, nano), undefined, `rejects invalid marketplace price: ${invalid}`);
}

assert.equal(market.parsePrice('0.000000000001 XMR', nano).atomic, '1');
assert.equal(market.parsePrice('0,25', nano, 'XMR').currency, 'XMR');
assert.equal(market.displayPrice({ price: 0, currency: 'XMR', price_atomic: '1' }, nano), '0.000000000001 XMR');
assert.equal(market.displayPrice({ price: 0, currency: 'XMR', price_raw: '1' }, nano), '0 XMR', 'Nano raw must not be interpreted as Monero units');
assert.throws(() => market.parsePrice('0.0000000000001 XMR', nano));
assert.equal(market.parsePrice('0.00000001 BTC', nano).atomic, '1');
assert.equal(market.displayPrice({ currency: 'BTC', price_atomic: '1', price: 0.00000001 }, nano), '0.00000001 BTC');
assert.throws(() => market.parsePrice('0.000000001 BTC', nano));
const seller = N.generateSecretKey();
const sellerPub = N.getPublicKey(seller);
const other = N.generateSecretKey();
const d = 'product-123e4567-e89b-42d3-a456-426614174000';
const now = Math.floor(Date.now() / 1000);
function product(createdAt, name, id = d, author = sellerPub, secret = seller) {
  return sign({ kind: 30018, pubkey: author, created_at: createdAt, tags: [['d', d]], content: JSON.stringify({
    id, stall_id: 'stall-1', name, description: '', images: [], currency: 'XNO', price: 0.25,
    price_raw: '250000000000000000000000000000', quantity: null, specs: [], shipping: []
  }) }, secret);
}
const original = product(now, 'Oferta antiga');
const updated = product(now + 1, 'Oferta editada');
assert.equal(market.productAddress(updated), `30018:${sellerPub}:${d}`, 'edit keeps the addressable product ID stable');
assert.equal(market.selectActiveProducts([original, updated], N.verifyEvent).length, 1);
assert.equal(market.selectActiveProducts([original, updated], N.verifyEvent)[0].data.name, 'Oferta editada');
const deletionTemplate = market.makeProductDeletion(updated);
assert.deepEqual(JSON.parse(JSON.stringify(deletionTemplate.tags)), [
  ['a', `30018:${sellerPub}:${d}`], ['e', updated.id], ['k', '30018']
]);
const deletion = sign({ ...deletionTemplate, pubkey: sellerPub, created_at: now + 2 }, seller);
assert.equal(market.selectActiveProducts([updated, deletion], N.verifyEvent).length, 0, 'author deletion hides the addressable listing');
const otherAuthorDeletion = sign({ ...deletionTemplate, pubkey: N.getPublicKey(other), created_at: now + 2 }, other);
assert.equal(market.selectActiveProducts([updated, otherAuthorDeletion], N.verifyEvent).length, 1, 'another author cannot delete a listing');
const earlyDeletion = sign({ ...deletionTemplate, pubkey: sellerPub, created_at: now }, seller);
assert.equal(market.selectActiveProducts([updated, earlyDeletion], N.verifyEvent).length, 1, 'a deletion request cannot hide a newer update');
const mismatchedId = product(now + 3, 'ID inconsistente', 'different-id');
assert.equal(market.selectActiveProducts([mismatchedId], N.verifyEvent).length, 0, 'content ID must match the addressable d tag');
assert.equal(market.makeProductDeletion({ ...updated, tags: [['d', 'one'], ['d', 'two']] }), null, 'ambiguous product IDs cannot be withdrawn');

const baseProduct = { id: d, stall_id: 'stall-1', name: 'Oferta válida', description: '', images: [], currency: 'XNO',
  price: 0.25, price_atomic: '250000000000000000000000000000', price_raw: '250000000000000000000000000000' };
function fixture(data, tags = [['d', d]], createdAt = now) {
  return sign({ kind: 30018, pubkey: sellerPub, created_at: createdAt, tags,
    content: typeof data === 'string' ? data : JSON.stringify(data) }, seller);
}
const expired = fixture(baseProduct, [['d', d], ['expiration', String(now)]]);
assert.equal(market.selectActiveProducts([expired], N.verifyEvent, now).length, 0, 'expired listing is hidden at its expiry second');
const futureExpiry = fixture({ ...baseProduct, id: 'future-expiry' }, [['d', 'future-expiry'], ['expiration', String(now + 1)]]);
assert.equal(market.selectActiveProducts([futureExpiry], N.verifyEvent, now).length, 1, 'future expiration keeps a listing active');
const ambiguousExpiry = fixture(baseProduct, [['d', d], ['expiration', String(now + 30)], ['expiration', String(now + 60)]]);
assert.equal(market.selectActiveProducts([ambiguousExpiry], N.verifyEvent, now).length, 0, 'duplicate expiry tags fail closed');
const unknownCurrency = fixture({ ...baseProduct, currency: 'USD', price: 1, price_atomic: '100' }, [['d', d]]);
assert.equal(market.selectActiveProducts([unknownCurrency], N.verifyEvent, now).length, 0, 'unknown currency is not rendered');
const overflowPrice = fixture({ ...baseProduct, currency: 'XMR', price: 1, price_atomic: '18446744073709551616', price_raw: undefined }, [['d', d]]);
assert.equal(market.selectActiveProducts([overflowPrice], N.verifyEvent, now).length, 0, 'amount above the XMR maximum is rejected');
const inconsistentPrice = fixture({ ...baseProduct, price: 0.5 }, [['d', d]]);
assert.equal(market.selectActiveProducts([inconsistentPrice], N.verifyEvent, now).length, 0, 'rounded NIP-15 number cannot disagree with the exact amount');
const malformed = fixture('{not-json', [['d', d]]);
assert.equal(market.selectActiveProducts([malformed], N.verifyEvent, now).length, 0, 'malformed listing is ignored');
const futureEvent = fixture({ ...baseProduct, id: 'future-event' }, [['d', 'future-event']], now + 301);
assert.equal(market.selectActiveProducts([futureEvent], N.verifyEvent, now).length, 0, 'listing timestamp beyond clock tolerance is rejected');
const otherD = 'other-product-address';
const targetedProduct = sign({ kind: 30018, pubkey: sellerPub, created_at: now, tags: [['d', d]],
  content: JSON.stringify({ ...baseProduct, name: 'Oferta a retirar' }) }, seller);
const unrelatedProduct = sign({ kind: 30018, pubkey: sellerPub, created_at: now, tags: [['d', otherD]],
  content: JSON.stringify({ ...baseProduct, id: otherD, name: 'Outra oferta', currency: 'XMR', price: 0.000000000001,
    price_atomic: '1', price_raw: undefined }) }, seller);
const targetedAddressDeletion = sign({ kind: 5, pubkey: sellerPub, created_at: now + 1, content: '',
  tags: [['a', `30018:${sellerPub}:${d}`], ['e', targetedProduct.id], ['k', '30018']] }, seller);
const activeAfterTargetedDeletion = market.selectActiveProducts([targetedProduct, unrelatedProduct, targetedAddressDeletion], N.verifyEvent, now + 1);
assert.deepEqual(JSON.parse(JSON.stringify(activeAfterTargetedDeletion.map(event => event.data.id))), [otherD],
  'withdrawing one addressable product preserves other offers by the same author');

console.log('PASS: marketplace BTC/XMR/XNO exatos, edição addressable, exclusão NIP-09, expiração e validação de listagens');
