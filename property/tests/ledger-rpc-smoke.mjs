import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNanoNodeLedger } from '../relay/ledger-rpc.mjs';

const auth = `Basic ${Buffer.from('local-test:ephemeral-test-only').toString('base64')}`;
const sourceByAccount = new Map([
  ['nano_3e3j5tkog48pnny9dmfzj1r16pg8t1e76dz5tmac6iq689wyjfpiij4txtdo', { type: 'open', source: 'a'.repeat(64), receive: 'b'.repeat(64), amount: '1' }],
  ['nano_3er7x8cg41rotmdwk5td979wwry68b83mhqzn5qg6xur1ykxskxjwuor38t3', { type: 'state', source: 'c'.repeat(64), receive: 'd'.repeat(64), amount: '2' }]
]);
let finalized = false;

const server = createServer(async (request, response) => {
  if (request.headers.authorization !== auth) {
    response.writeHead(401).end();
    return;
  }
  let body = '';
  for await (const chunk of request) body += chunk;
  const { action, ...params } = JSON.parse(body);
  let result;
  if (action === 'version') result = { network: 'dev' };
  else if (action === 'account_history') {
    const transfer = sourceByAccount.get(params.account);
    assert.ok(transfer, 'history was requested only for a fixture account');
    result = { history: [{ type: transfer.type, ...(transfer.type === 'state' ? { subtype: 'receive', link: transfer.source } : { source: transfer.source }),
      hash: transfer.receive, amount: transfer.amount, confirmed: String(finalized) }] };
  } else if (action === 'block_info') result = { confirmed: String(finalized) };
  else {
    response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `unexpected action ${action}` }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
});

const stateDir = await mkdtemp(path.join(os.tmpdir(), 'property-ledger-rpc-smoke-'));
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const ledger = createNanoNodeLedger({ rpcUrl: `http://127.0.0.1:${server.address().port}/`,
    username: 'local-test', password: 'ephemeral-test-only', wallet: 'fixture-wallet', stateDir,
    expectedNetwork: 'dev', minConfirmations: 1 });
  const [openAddress, stateAddress] = [...sourceByAccount.keys()];

  const openPending = await ledger.lookupPayment({ address: openAddress, currency: 'XNO' });
  assert.deepEqual(openPending && { amount: openPending.amount_atomic, txid: openPending.txid,
    confirmations: openPending.confirmations, proof: openPending.proof },
  { amount: '1', txid: 'a'.repeat(64), confirmations: 0, proof: true },
  'Nano raw account history exposes its first receive as open/source and confirmed as a string');

  const statePending = await ledger.lookupPayment({ address: stateAddress, currency: 'XNO' });
  assert.equal(statePending.amount_atomic, '2');
  assert.equal(statePending.confirmations, 0);
  assert.equal(statePending.proof, true);

  finalized = true;
  const confirmed = await ledger.lookupPayment({ address: openAddress, currency: 'XNO' });
  assert.equal(confirmed.confirmations, 1, 'string "true" from Nano block_info is normalized to confirmation');
  assert.equal(confirmed.txid, 'a'.repeat(64));
  console.log('PASS: Nano v28 raw open/state receive history and string confirmation values are reconciled exactly.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(stateDir, { recursive: true, force: true });
}
