import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
for (const path of ['property/web/money.js', 'property/web/payment-card.js', 'property/web/payment-uris.js']) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
}
const api = context.window.PropertyPaymentUris;
const amountFor = (currency, amount, address, network = 'mainnet', note = '') =>
  api.build({ currency, network, amount, address, note });

const btc = amountFor('BTC', '0.00000001', '175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W', 'mainnet', 'Offer #7 & thanks');
assert.equal(btc.uri, 'bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount=0.00000001&message=Offer%20%237%20%26%20thanks');
assert.equal(btc.amountIncluded, true);

const btcTestnet = amountFor('BTC', '0.25', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'testnet');
assert.equal(btcTestnet.uri, 'bitcoin:?tb=tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq&amount=0.25');
assert.throws(() => amountFor('BTC', '1', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'mainnet'), { code: 'address-network-mismatch' });
assert.throws(() => amountFor('BTC', '1', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'signet'), { code: 'network-ambiguous' });
assert.throws(() => amountFor('BTC', '1', 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet'), { code: 'address-network-mismatch' });

const moneroAddress = '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx3skxNgYeYTRj5UzqtReoS44qo9mtmXCqY45DJ852K5Jv2684Rge';
const xmr = amountFor('XMR', '1.000000000001', moneroAddress, 'mainnet', 'Dinner');
assert.equal(xmr.uri, `monero:${moneroAddress}?tx_amount=1.000000000001&tx_description=Dinner`);
assert.equal(api.moneroNetwork(moneroAddress), 'mainnet');
assert.throws(() => amountFor('XMR', '1', moneroAddress, 'testnet'), { code: 'address-network-mismatch' });

const nanoAddress = 'nano_3wm37qz19zhei7nzscjcopbrbnnachs4p1gnwo5oroi3qonw6inwgoeuufdp';
const xno = amountFor('XNO', '1.000000000000000000000000000001', nanoAddress, 'mainnet', 'Book');
assert.equal(xno.uri, `nano:${nanoAddress}?amount=1000000000000000000000000000001&message=Book`);
assert.throws(() => amountFor('XNO', '1', nanoAddress, 'beta'), { code: 'network-ambiguous' });

assert.equal(amountFor('BTC', '', '175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W').amountIncluded, false);
assert.throws(() => amountFor('BTC', '1', 'javascript:alert(1)'), /single-line wallet address/u);
console.log('payment-uris: BTC/BIP-321, Monero and Nano requests preserve exact amounts and fail closed on ambiguous networks');
