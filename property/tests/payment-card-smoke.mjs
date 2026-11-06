import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, BigInt, Object };
vm.createContext(context);
vm.runInContext(fs.readFileSync('property/web/money.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('property/web/payment-card.js', 'utf8'), context);
const Cards = context.window.PropertyPaymentCard;

for (const currency of ['BTC', 'XMR', 'XNO']) {
  const network = currency === 'BTC' ? 'mainnet' : currency === 'XMR' ? 'stagenet' : 'beta';
  const content = Cards.build({ currency, network, amount: '0.125', address: 'A'.repeat(40), note: 'For the agreed offer' });
  const parsed = Cards.parse(content);
  assert.equal(parsed.currency, currency);
  assert.equal(parsed.network, network);
  assert.equal(parsed.amount, '0.125');
  assert.equal(parsed.note, 'For the agreed offer');
  assert.equal(Cards.build(parsed), content);
}

const noAmount = Cards.build({ currency: 'XNO', network: 'mainnet', address: 'nano_' + '1'.repeat(60) });
assert.equal(Cards.parse(noAmount).amount, '');
for (const value of [
  { currency: 'DOGE', network: 'mainnet', address: 'A'.repeat(30) },
  { currency: 'BTC', network: 'stagenet', address: 'A'.repeat(30) },
  { currency: 'XMR', network: 'mainnet', address: 'short' },
  { currency: 'BTC', network: 'mainnet', address: 'A'.repeat(30) + '\nhttps://evil.example' },
  { currency: 'BTC', network: 'mainnet', amount: '1e-8', address: 'A'.repeat(30) },
  { currency: 'BTC', network: 'mainnet', amount: '0', address: 'A'.repeat(30) },
  { currency: 'BTC', network: 'mainnet', amount: '0.1', address: 'A'.repeat(30), note: 'safe\nextra' },
  { currency: 'XNO', network: 'mainnet', amount: '1.' + '0'.repeat(31), address: 'A'.repeat(30) }
]) assert.throws(() => Cards.build(value));

assert.equal(Cards.parse('[Property payment details v1]\nCurrency: BTC\nNetwork: mainnet\nAddress: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nAddress: BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'), null);
assert.equal(Cards.parse('[Property payment details v1]\nCurrency: BTC\nNetwork: mainnet\nAmount: 1 XMR\nAddress: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null);
assert.equal(Cards.parse('[Property payment details v1]\nCurrency: BTC\nNetwork: mainnet\nAddress: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n<script>alert(1)</script>'), null);
assert.equal(Cards.networkLabel('testnet'), 'Testnet');
console.log('payment-card: exact currency amounts, strict network labels, readable round-trip and hostile input checks passed');
