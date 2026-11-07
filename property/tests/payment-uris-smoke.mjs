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
const btcCard = api.parse(btc.uri);
assert.equal(btcCard.currency, 'BTC');
assert.equal(btcCard.network, 'mainnet');
assert.equal(btcCard.amount, '0.00000001');
assert.equal(btcCard.note, 'Offer #7 & thanks');
assert.equal(btcCard.source, 'wallet-uri');

const btcLabeled = api.build({ currency: 'BTC', network: 'mainnet', amount: '0.125', address: '175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W', label: 'Property', note: 'Support the project' });
assert.equal(btcLabeled.uri, 'bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount=0.125&label=Property&message=Support%20the%20project');
const parsedLabeledBtc = api.parse(btcLabeled.uri);
assert.equal(parsedLabeledBtc.label, 'Property');
assert.equal(parsedLabeledBtc.note, 'Support the project');
assert.equal(api.build(parsedLabeledBtc).uri, btcLabeled.uri, 'the card keeps both BIP 321 label and message when opened in a wallet');

const btcTestnet = amountFor('BTC', '0.25', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'testnet');
assert.equal(btcTestnet.uri, 'bitcoin:?tb=tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq&amount=0.25');
const parsedBtcTestnet = api.parse(btcTestnet.uri);
assert.equal(parsedBtcTestnet.network, 'testnet');
assert.equal(parsedBtcTestnet.address, 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq');
assert.throws(() => amountFor('BTC', '1', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'mainnet'), { code: 'address-network-mismatch' });
assert.throws(() => amountFor('BTC', '1', 'tb1qghfhmd4zh7ncpmxl3qzhmq566jk8ckq4gafnmq', 'signet'), { code: 'network-ambiguous' });
assert.throws(() => amountFor('BTC', '1', 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet'), { code: 'address-network-mismatch' });

const moneroAddress = '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx3skxNgYeYTRj5UzqtReoS44qo9mtmXCqY45DJ852K5Jv2684Rge';
const xmr = amountFor('XMR', '1.000000000001', moneroAddress, 'mainnet', 'Dinner');
assert.equal(xmr.uri, `monero:${moneroAddress}?tx_amount=1.000000000001&tx_description=Dinner`);
assert.equal(api.moneroNetwork(moneroAddress), 'mainnet');
const xmrWithName = api.build({ currency: 'XMR', network: 'mainnet', amount: '1.000000000001', address: moneroAddress, recipientName: 'Property', note: 'Dinner' });
assert.equal(xmrWithName.uri, `monero:${moneroAddress}?tx_amount=1.000000000001&recipient_name=Property&tx_description=Dinner`);
const parsedXmr = api.parse(xmrWithName.uri);
assert.equal(parsedXmr.currency, 'XMR');
assert.equal(parsedXmr.network, 'mainnet');
assert.equal(parsedXmr.amount, '1.000000000001');
assert.equal(parsedXmr.recipientName, 'Property');
assert.equal(parsedXmr.note, 'Dinner');
assert.equal(api.build(parsedXmr).uri, xmrWithName.uri, 'the Monero card retains the recipient name and transaction description');
const xmrWithPaymentId = api.build({ currency: 'XMR', network: 'mainnet', amount: '1', address: moneroAddress, paymentId: 'ABCDEF0123456789', recipientName: 'Property', note: 'Dinner' });
assert.equal(xmrWithPaymentId.uri, `monero:${moneroAddress}?tx_payment_id=abcdef0123456789&tx_amount=1&recipient_name=Property&tx_description=Dinner`);
const parsedXmrPaymentId = api.parse(xmrWithPaymentId.uri);
assert.equal(parsedXmrPaymentId.paymentId, 'abcdef0123456789');
assert.equal(api.build(parsedXmrPaymentId).uri, xmrWithPaymentId.uri, 'the Monero card retains its payment ID when opened in a wallet');
assert.throws(() => api.build({ currency: 'XMR', network: 'mainnet', address: moneroAddress, paymentId: '0123456789abcde' }), { code: 'invalid-payment-id' });
assert.throws(() => amountFor('XMR', '1', moneroAddress, 'testnet'), { code: 'address-network-mismatch' });

const nanoAddress = 'nano_3wm37qz19zhei7nzscjcopbrbnnachs4p1gnwo5oroi3qonw6inwgoeuufdp';
const xno = amountFor('XNO', '1.000000000000000000000000000001', nanoAddress, 'mainnet', 'Book');
assert.equal(xno.uri, `nano:${nanoAddress}?amount=1000000000000000000000000000001&message=Book`);
assert.throws(() => amountFor('XNO', '1', nanoAddress, 'beta'), { code: 'network-ambiguous' });

assert.equal(amountFor('BTC', '', '175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W').amountIncluded, false);
assert.throws(() => amountFor('BTC', '1', 'javascript:alert(1)'), /single-line wallet address/u);
assert.equal(api.parse('BITCOIN:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?LABEL=Property').label, 'Property', 'Bitcoin URI scheme and keys are case-insensitive while the recipient label remains visible');
assert.equal(api.parse('bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount=1&amount=2'), null, 'duplicate payment parameters fail closed');
assert.equal(api.parse('bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount='), null, 'an empty amount is not silently changed to an amountless request');
assert.equal(api.parse('bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?lightning=lnbc123'), null, 'unsupported Bitcoin payment instructions are never reduced to an on-chain address');
assert.equal(api.parse('bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?req-future=1'), null, 'unknown required Bitcoin instructions fail closed');
assert.equal(api.parse('monero:' + moneroAddress + '?tx_amount=1&tx_payment_id=0123456789abcde'), null, 'malformed Monero payment IDs fail closed');
assert.equal(api.parse('monero:' + moneroAddress + '?tx_amount=1&tx_payment_id=0123456789abcdef0'), null, 'overlong Monero payment IDs fail closed');
assert.equal(api.parse('monero:' + moneroAddress + '?tx_amount='), null, 'an empty Monero amount is not silently removed');
assert.equal(api.parse('monero:' + moneroAddress + '?tx_description=' + encodeURIComponent('line\nfeed')), null, 'encoded control characters are not rendered');
assert.equal(api.parse('nano:' + nanoAddress + '?amount=1'), null, 'Nano wallet URIs stay text because they do not identify mainnet versus beta');
assert.equal(api.parse('https://wallet.example/pay?address=' + moneroAddress), null, 'web payment links are not fetched or interpreted');
console.log('payment-uris: BTC/BIP-321 and Monero payment messages retain supported fields including 16-hex payment IDs; unsafe or incomplete URIs fail closed');
