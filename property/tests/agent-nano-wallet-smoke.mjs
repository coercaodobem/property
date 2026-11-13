import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createNanoAgentWallet, validateXnoWalletConfig } from '../agent/nano-wallet.mjs';

const account = `nano_1${'1'.repeat(59)}`;
const destination = `nano_3${'3'.repeat(59)}`;
const walletId = 'a'.repeat(64);
const txid = 'b'.repeat(64).toUpperCase();
const receiveTxid = 'c'.repeat(64).toUpperCase();
const rpcUsername = 'offline-user';
const rpcPassword = 'synthetic-gateway-password';
const walletPassword = 'synthetic-wallet-password';
const expectedAuth = `Basic ${Buffer.from(`${rpcUsername}:${rpcPassword}`).toString('base64')}`;
const actions = [];
const sends = new Map();
let network = 'dev';
let balance = '100';
let accounts = [account];
let confirmed = false;
let receivable = true;
let receiveCreated = false;
let loseReceiveResponse = true;

const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk.toString('utf8');
  if (request.headers.authorization !== expectedAuth) {
    response.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}');
    return;
  }
  const parsed = JSON.parse(body);
  actions.push(parsed.action);
  let result;
  switch (parsed.action) {
    case 'version': result = { network, node_vendor: 'Synthetic Nano Test Node' }; break;
    case 'password_enter': result = { valid: parsed.password === walletPassword ? '1' : '0' }; break;
    case 'account_list': result = { accounts }; break;
    case 'wallet_contains': result = { exists: parsed.account === account ? '1' : '0' }; break;
    case 'account_balance': result = { balance, receivable: '0' }; break;
    case 'send': {
      const old = sends.get(parsed.id);
      if (old && (old.destination !== parsed.destination || old.amount !== parsed.amount || old.source !== parsed.source)) {
        result = { error: 'idempotency parameters mismatch' };
      } else {
        if (!old) sends.set(parsed.id, { destination: parsed.destination, amount: parsed.amount, source: parsed.source, block: txid });
        result = { block: sends.get(parsed.id).block };
      }
      break;
    }
    case 'block_info': {
      const sent = [...sends.values()].find(item => item.block === parsed.hash);
      if (parsed.hash === receiveTxid && receiveCreated) result = { hash: receiveTxid, amount: '40', confirmed: 'true', subtype: 'receive',
        contents: { type: 'state', subtype: 'receive', account, link: txid } };
      else if (!sent) result = { error: 'block not found' };
      else result = { hash: txid, amount: sent.amount, confirmed: confirmed ? 'true' : 'false', subtype: 'send',
        contents: { type: 'state', account: sent.source, link_as_account: sent.destination } };
      break;
    }
    case 'receivable': result = { blocks: receivable ? { [txid]: { amount: '40', source: destination } } : {} }; break;
    case 'account_history': result = { history: receiveCreated ? [{ hash: receiveTxid, amount: '40', subtype: 'receive',
      contents: { type: 'state', subtype: 'receive', account, link: txid } }] : [], previous: '' }; break;
    case 'receive':
      assert.equal(parsed.account, account);
      assert.equal(parsed.block, txid);
      receiveCreated = true;
      receivable = false;
      if (loseReceiveResponse) { loseReceiveResponse = false; response.destroy(); return; }
      result = { block: receiveTxid };
      break;
    case 'wallet_lock': result = { success: '' }; break;
    default: result = { error: 'action not implemented by fixture' };
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const config = { rpc_url: `http://127.0.0.1:${address.port}/`, rpc_username: rpcUsername, rpc_password: rpcPassword,
  wallet_password: walletPassword, wallet_id: walletId, account, network: 'dev', max_raw_per_payment: '50', lifetime_budget_raw: '200' };
const wallet = createNanoAgentWallet(config);

await wallet.assertReady();
assert.ok(actions.includes('password_enter'));
assert.ok(actions.includes('account_list'));
assert.ok(actions.includes('wallet_contains'));
assert.ok(actions.includes('account_balance'));
assert.deepEqual(await wallet.policy(), { configured: true, network: 'dev', account, max_raw_per_payment: '50', lifetime_budget_raw: '200', confirmed_balance_raw: '100', node_version: 'Synthetic Nano Test Node' });

const idempotencyKey = `property-xno:${'1'.repeat(64)}`;
const sent = await wallet.send({ destination, amountRaw: '40', idempotencyKey });
const repeated = await wallet.send({ destination, amountRaw: '40', idempotencyKey });
assert.equal(sent.txid, txid);
assert.equal(repeated.txid, txid);
assert.equal(sends.size, 1, 'Nano RPC idempotency key maps repeated sends to one block');
await assert.rejects(wallet.send({ destination, amountRaw: '51', idempotencyKey: `property-xno:${'2'.repeat(64)}` }), /xno-payment-limit-exceeded/);
await assert.rejects(wallet.send({ destination: account, amountRaw: '1', idempotencyKey }), /xno-send-arguments-invalid/);
await assert.rejects(wallet.send({ destination, amountRaw: '01', idempotencyKey }), /amount_raw-invalid/);

const pending = await wallet.inspectSend({ txid, destination, amountRaw: '40', source: account });
assert.equal(pending.confirmed, false);
await assert.rejects(wallet.inspectSend({ txid, destination, amountRaw: '39', source: account }), /xno-transaction-does-not-match-trade/);
await assert.rejects(wallet.inspectSend({ txid, destination: account, amountRaw: '40', source: account }), /xno-transaction-does-not-match-trade/);
confirmed = true;
const confirmedSend = await wallet.inspectSendForReceipt({ txid, destination, amountRaw: '40', source: account });
assert.equal(confirmedSend.confirmed, true);
const incomingFixture = [...sends.values()][0];
incomingFixture.source = destination;
incomingFixture.destination = account;
confirmed = false;
assert.deepEqual(await wallet.receiveConfirmed({ txid, sourceAccount: destination, amountRaw: '40' }), { received: false, reason: 'xno-payment-not-confirmed' });
confirmed = true;
await assert.rejects(wallet.receiveConfirmed({ txid, sourceAccount: account, amountRaw: '40' }), /xno-transaction-does-not-match-trade/);
await assert.rejects(wallet.receiveConfirmed({ txid, sourceAccount: destination, amountRaw: '39' }), /xno-transaction-does-not-match-trade/);
await assert.rejects(wallet.receiveConfirmed({ txid, sourceAccount: destination, amountRaw: '40' }), /socket hang up|other side closed|ECONNRESET/);
const recovered = await wallet.receiveConfirmed({ txid, sourceAccount: destination, amountRaw: '40' });
assert.deepEqual(recovered, { received: true, receive_txid: receiveTxid });
const duplicateRecovery = await wallet.receiveConfirmed({ txid, sourceAccount: destination, amountRaw: '40' });
assert.deepEqual(duplicateRecovery, { received: true, receive_txid: receiveTxid });
assert.equal(actions.filter(action => action === 'receive').length, 1, 'recovery finds the exact confirmed receive block without issuing a duplicate receive');

network = 'live';
await assert.rejects(wallet.assertReady(), /xno-wrong-network/);
network = 'dev';
accounts = [account, destination];
await assert.rejects(wallet.assertReady(), /xno-wallet-must-have-one-dedicated-account/);
accounts = [account];

assert.throws(() => validateXnoWalletConfig({ ...config, rpc_url: 'http://example.com:8080' }), /xno-rpc-must-be-authenticated-loopback/);
assert.throws(() => validateXnoWalletConfig({ ...config, rpc_url: `http://localhost:${address.port}/` }), /xno-rpc-must-be-authenticated-loopback/);
const wrongAuth = await fetch(`http://127.0.0.1:${address.port}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"version"}' });
assert.equal(wrongAuth.status, 401);

await wallet.lock();
await new Promise(resolve => server.close(resolve));
const caseIds = ['dedicated-account-unlock-and-live-network-check', 'raw-send-with-local-per-payment-cap', 'same-id-is-idempotent', 'invalid-amount-and-self-send-refused',
  'pending-and-confirmed-ledger-checks', 'wrong-amount-or-recipient-refused', 'unconfirmed-and-mismatched-incoming-refused', 'lost-receive-response-recovered-from-account-history', 'confirmed-incoming-transfer-received-once', 'duplicate-receive-recovery-deduplicated', 'wrong-network-refused',
  'multi-account-wallet-refused', 'remote-and-localhost-rpc-hosts-refused', 'unauthenticated-gateway-request-refused'];
process.stdout.write(JSON.stringify({ gate: 'G9-XNO-wallet-adapter', profile: 'offline', seed: 'property-xno-wallet-fixed-v1', cases: caseIds.map(id => ({ id, result: 'PASS' })),
  caseCount: caseIds.length, nanoRpcRequests: actions.length, syntheticTransfers: sends.size, fundsUsed: false, outsideNetwork: false,
  secretValuesInReport: false }, null, 2) + '\n');
