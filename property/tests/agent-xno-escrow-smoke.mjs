import assert from 'node:assert/strict';
import { createXnoEscrowService, XNO_ESCROW_PROTOCOL } from '../agent/xno-escrow.mjs';
import { emptyXnoJournal, validateXnoJournal } from '../agent/xno-trades.mjs';

const buyerPub = 'a'.repeat(64), sellerPub = 'b'.repeat(64), custodianPub = 'c'.repeat(64), arbiterPub = 'd'.repeat(64), outsiderPub = 'f'.repeat(64);
const buyerAccount = `nano_1${'1'.repeat(59)}`, sellerAccount = `nano_3${'3'.repeat(59)}`, escrowAccount = `nano_1${'4'.repeat(59)}`;
const relay = 'ws://127.0.0.1:7447';
const now = 1_900_000_000;
const tradeIds = ['1'.repeat(32), '2'.repeat(32), '3'.repeat(32), '4'.repeat(32)];
const txids = ['d'.repeat(64).toUpperCase(), 'e'.repeat(64).toUpperCase()];
const payoutIds = ['f'.repeat(64).toUpperCase(), 'a'.repeat(64).toUpperCase()];
const inbox = { buyer: [], seller: [], custodian: [], arbiter: [] };
const journals = { buyer: emptyXnoJournal(), seller: emptyXnoJournal(), custodian: emptyXnoJournal(), arbiter: emptyXnoJournal() };
const deposits = new Map();
const receiveHashes = new Set();
const sentByKey = new Map();
const sentCustodyByKey = new Map();
const calls = { buyerSend: [], receive: [], custodySend: [] };
let messageCounter = 0;
let tradeCounter = 0;
let custodyBalance = 0n;
let loseNextReceiveResponse = true;
let loseNextPayoutResponse = true;
let failNextStatus = null;

function id() { return (++messageCounter).toString(16).padStart(32, '0'); }
function buildTransport(role, pubkey) {
  return {
    async readMessages(peer, limit) {
      assert.equal(limit, 100);
      return inbox[role].filter(message => message.conversation_pubkey === peer).slice(-limit).map(message => structuredClone(message));
    },
    async sendMessage(peer, body, inReplyTo, relays) {
      assert.deepEqual(relays, [relay]);
      const payload = JSON.parse(body);
      if (failNextStatus && role === 'custodian' && peer === failNextStatus.peer && payload.type === 'contract' && payload.status === failNextStatus.status) {
        failNextStatus = null;
        throw new Error('synthetic-status-delivery-failure');
      }
      const messageId = id();
      const recipientRole = peer === buyerPub ? 'buyer' : peer === sellerPub ? 'seller' : peer === custodianPub ? 'custodian' : peer === arbiterPub ? 'arbiter' : null;
      assert.ok(recipientRole, `unexpected recipient ${peer}`);
      inbox[recipientRole].push({ message_id: messageId, in_reply_to: inReplyTo, conversation_pubkey: pubkey,
        direction: 'received', body, created_at: now });
      return { status: 'relay_accepted', message_id: messageId, relay_acks: 1, relay_attempts: 1 };
    },
  };
}

const directWallet = {
  account: buyerAccount, maxRawPerPayment: 100n, lifetimeBudgetRaw: 150n,
  async assertReady() { return { ready: true, account: buyerAccount, network: 'dev' }; },
  async send({ destination, amountRaw, idempotencyKey }) {
    assert.equal(destination, escrowAccount);
    assert.equal(amountRaw, '40');
    calls.buyerSend.push({ destination, amountRaw, idempotencyKey });
    if (!sentByKey.has(idempotencyKey)) {
      const depositTxid = txids[tradeCounter - 1];
      sentByKey.set(idempotencyKey, depositTxid);
      deposits.set(depositTxid, { source: buyerAccount, destination, amountRaw, confirmed: true });
    }
    return { txid: sentByKey.get(idempotencyKey) };
  },
  async inspectSendForReceipt({ txid, destination, amountRaw, source }) {
    const payment = deposits.get(txid.toUpperCase());
    assert.ok(payment, 'buyer must verify its own payment transaction');
    assert.deepEqual({ destination, amountRaw, source }, { destination: payment.destination, amountRaw: payment.amountRaw, source: payment.source });
    return { txid: txid.toUpperCase(), source, destination, amount_raw: amountRaw, confirmed: payment.confirmed };
  },
};
const sellerWallet = {
  account: sellerAccount, maxRawPerPayment: 100n, lifetimeBudgetRaw: 150n,
  async assertReady() { return { ready: true, account: sellerAccount, network: 'dev' }; },
};
const custodyWallet = {
  account: escrowAccount, network: 'dev', maxRawPerPayment: 100n, lifetimeBudgetRaw: 100n,
  async assertReady() { return { ready: true, account: escrowAccount, network: 'dev' }; },
  async inspectSendForReceipt({ txid, destination, amountRaw, source }) {
    const payment = deposits.get(txid.toUpperCase());
    assert.equal(destination, escrowAccount);
    assert.equal(source, buyerAccount);
    assert.equal(amountRaw, '40');
    assert.ok(payment, 'deposit must exist in the synthetic ledger');
    assert.deepEqual(payment, { source, destination, amountRaw, confirmed: true });
    return { txid: txid.toUpperCase(), source, destination, amount_raw: amountRaw, confirmed: true, status: 'confirmed' };
  },
  async receiveConfirmed({ txid, sourceAccount, amountRaw }) {
    assert.equal(sourceAccount, buyerAccount);
    assert.equal(amountRaw, '40');
    calls.receive.push(txid);
    if (!receiveHashes.has(txid)) {
      receiveHashes.add(txid);
      custodyBalance += BigInt(amountRaw);
      if (loseNextReceiveResponse) { loseNextReceiveResponse = false; throw new Error('synthetic-lost-receive-response'); }
    }
    return { received: true, receive_txid: '9'.repeat(64).toUpperCase() };
  },
  async policy() {
    return { configured: true, network: 'dev', account: escrowAccount, max_raw_per_payment: '100', lifetime_budget_raw: '100',
      confirmed_balance_raw: custodyBalance.toString(), node_version: 'synthetic' };
  },
  async send({ destination, amountRaw, idempotencyKey }) {
    assert.ok([buyerAccount, sellerAccount].includes(destination));
    assert.equal(amountRaw, '40');
    calls.custodySend.push({ destination, amountRaw, idempotencyKey });
    if (!sentCustodyByKey.has(idempotencyKey)) {
      assert.ok(custodyBalance >= BigInt(amountRaw));
      custodyBalance -= BigInt(amountRaw);
      sentCustodyByKey.set(idempotencyKey, payoutIds[sentCustodyByKey.size]);
      if (loseNextPayoutResponse) { loseNextPayoutResponse = false; throw new Error('synthetic-lost-payout-response'); }
    }
    return { txid: sentCustodyByKey.get(idempotencyKey) };
  },
};

function service(role, options = {}) {
  const pubkey = role === 'buyer' ? buyerPub : role === 'seller' ? sellerPub : role === 'custodian' ? custodianPub : arbiterPub;
  const peers = { buyer: buyerPub, seller: sellerPub, custodian: custodianPub };
  return createXnoEscrowService({ pubkey, wallet: options.wallet ?? null, escrowWallet: options.escrowWallet ?? null,
    transport: buildTransport(role, pubkey), blockedPubkeys: () => [], relays: () => [relay],
    loadJournal: async () => structuredClone(journals[role]), saveJournal: async value => { journals[role] = structuredClone(value); },
    now: () => now, randomId: () => tradeIds[tradeCounter++] });
}

const buyer = service('buyer', { wallet: directWallet });
const seller = service('seller', { wallet: sellerWallet });
const custodian = service('custodian', { escrowWallet: custodyWallet });
const arbiter = service('arbiter');
assert.equal((await custodian.policy()).custodian_configured, true);
await assert.rejects(buyer.offer({ escrow_pubkey: custodianPub, arbiter_pubkey: buyerPub, seller_pubkey: sellerPub, seller_account: sellerAccount,
  amount_raw: '40', terms: 'Árbitro não pode ser o comprador.', expires_in_seconds: 3600 }), /xno-escrow-peer-invalid/);

async function requestAndOpen(amount = '40') {
  const request = await buyer.offer({ escrow_pubkey: custodianPub, arbiter_pubkey: arbiterPub, seller_pubkey: sellerPub, seller_account: sellerAccount,
    amount_raw: amount, terms: 'Entrega de um artefato digital com hash acordado.', expires_in_seconds: 3600 });
  const opened = await custodian.open({ buyer_pubkey: buyerPub, request_message_id: request.request_message_id });
  assert.equal(opened.status, 'awaiting_seller');
  assert.equal(opened.escrow_account, escrowAccount);
  return { request, opened };
}
function latestContract(role, status) {
  const peer = role === 'buyer' || role === 'seller' ? custodianPub : null;
  return inbox[role].filter(item => item.conversation_pubkey === peer && item.direction === 'received').map(item => {
    try { return { item, body: JSON.parse(item.body) }; } catch { return null; }
  }).filter(item => item?.body.protocol === XNO_ESCROW_PROTOCOL && item.body.type === 'contract' && (!status || item.body.status === status)).at(-1);
}

const first = await requestAndOpen();
const sellerContract = latestContract('seller', 'awaiting_seller');
assert.ok(sellerContract);
sellerWallet.account = buyerAccount;
await assert.rejects(seller.accept({ escrow_pubkey: custodianPub, contract_message_id: sellerContract.item.message_id, decision: 'accept' }), /xno-escrow-seller-account-mismatch/);
sellerWallet.account = sellerAccount;
const accepted = await seller.accept({ escrow_pubkey: custodianPub, contract_message_id: sellerContract.item.message_id, decision: 'accept' });
assert.equal(accepted.status, 'awaiting_deposit');
assert.equal((await custodian.sync({ trade_id: first.request.trade_id })).status, 'awaiting_deposit');
const buyerContract = latestContract('buyer', 'awaiting_deposit');
assert.ok(buyerContract);
const funding = await buyer.fund({ escrow_pubkey: custodianPub, contract_message_id: buyerContract.item.message_id });
assert.equal(funding.status, 'deposit_submitted');
assert.equal(funding.escrow_account, escrowAccount);
assert.equal(journals.buyer.budget_committed_raw, '40', 'escrow deposits consume the same lifetime budget as direct XNO payments');
await assert.rejects(buyer.fund({ escrow_pubkey: outsiderPub, contract_message_id: buyerContract.item.message_id }), /xno-escrow-message-not-authenticated/);
await assert.rejects(buyer.fund({ escrow_pubkey: custodianPub, contract_message_id: sellerContract.item.message_id }), /xno-escrow-message-not-authenticated/);
assert.equal((await seller.accept({ escrow_pubkey: custodianPub, contract_message_id: sellerContract.item.message_id, decision: 'accept' })).duplicate, true);
await assert.rejects(custodian.sync({ trade_id: 'f'.repeat(32) }), /xno-escrow-trade-not-found/);
await assert.rejects(arbiter.resolve({ custodian_pubkey: custodianPub, trade_id: first.request.trade_id, outcome: 'refund', summary: 'sem disputa' }), /xno-escrow-dispute-required/);
assert.equal((await custodian.open({ buyer_pubkey: buyerPub, request_message_id: first.request.request_message_id })).status, 'awaiting_deposit');
await assert.rejects(custodian.sync({ trade_id: first.request.trade_id, extra: true }), /invalid-arguments/);

await assert.rejects(custodian.sync({ trade_id: first.request.trade_id }), /synthetic-lost-receive-response/);
const funded = await custodian.sync({ trade_id: first.request.trade_id });
assert.equal(funded.status, 'funded');
assert.equal(custodyBalance, 40n, 'lost receive response is recovered without double credit');
assert.equal(calls.receive.length, 2);
const fundedBuyerContract = latestContract('buyer', 'funded');
assert.ok(fundedBuyerContract);
deposits.get(funding.txid).confirmed = false;
await assert.rejects(buyer.approve({ escrow_pubkey: custodianPub, trade_id: first.request.trade_id }), /xno-escrow-deposit-not-confirmed/);
deposits.get(funding.txid).confirmed = true;
const approval = await buyer.approve({ escrow_pubkey: custodianPub, trade_id: first.request.trade_id });
assert.equal(approval.status, 'release-approved');
await assert.rejects(buyer.approve({ escrow_pubkey: custodianPub, trade_id: 'f'.repeat(32) }), /xno-escrow-trade-not-found/);
await assert.rejects(custodian.sync({ trade_id: first.request.trade_id }), /synthetic-lost-payout-response/);
const released = await custodian.sync({ trade_id: first.request.trade_id });
assert.equal(released.status, 'settled');
assert.equal(released.resolution, 'release');
assert.equal(released.destination, sellerAccount);
assert.equal(custodyBalance, 0n, 'release pays only the contract seller account');
assert.equal(sentCustodyByKey.size, 1, 'lost payout response and retry produce one transfer');
assert.equal((await buyer.status({ trade_id: first.request.trade_id })).status, 'settled');

const second = await requestAndOpen();
const secondSellerContract = latestContract('seller', 'awaiting_seller');
const secondAccepted = await seller.accept({ escrow_pubkey: custodianPub, contract_message_id: secondSellerContract.item.message_id, decision: 'accept' });
assert.equal(secondAccepted.status, 'awaiting_deposit');
await custodian.sync({ trade_id: second.request.trade_id });
const secondBuyerContract = latestContract('buyer', 'awaiting_deposit');
const secondFunding = await buyer.fund({ escrow_pubkey: custodianPub, contract_message_id: secondBuyerContract.item.message_id });
assert.equal(secondFunding.status, 'deposit_submitted');
failNextStatus = { peer: arbiterPub, status: 'funded' };
await assert.rejects(custodian.sync({ trade_id: second.request.trade_id }), /xno-escrow-status-delivery-incomplete/);
assert.equal(journals.custodian.escrows[second.request.trade_id].status, 'funded', 'the funded status is persisted before retrying partial notice delivery');
assert.equal((await custodian.sync({ trade_id: second.request.trade_id })).status, 'funded', 'a later sync retries only the missing status notice');
const sellerFunded = await seller.status({ trade_id: second.request.trade_id });
assert.equal(sellerFunded.status, 'funded');
const filed = await seller.dispute({ escrow_pubkey: custodianPub, trade_id: second.request.trade_id, summary: 'Entrega não corresponde ao termo assinado.' });
assert.equal(filed.status, 'dispute-filed');
assert.equal((await custodian.sync({ trade_id: second.request.trade_id })).status, 'disputed');
await assert.rejects(buyer.approve({ escrow_pubkey: custodianPub, trade_id: second.request.trade_id }), /xno-escrow-not-funded/);
const ruling = await arbiter.resolve({ custodian_pubkey: custodianPub, trade_id: second.request.trade_id, outcome: 'refund', summary: 'Evidência sintética confirma a devolução conforme acordo.' });
assert.equal(ruling.status, 'ruling-submitted');
const refunded = await custodian.sync({ trade_id: second.request.trade_id });
assert.equal(refunded.status, 'settled');
assert.equal(refunded.resolution, 'refund');
assert.equal(refunded.destination, buyerAccount);
assert.equal(custodyBalance, 0n);
assert.equal(sentCustodyByKey.size, 2);
await assert.rejects(arbiter.resolve({ custodian_pubkey: custodianPub, trade_id: second.request.trade_id, outcome: 'release', summary: 'tentativa de reversão' }), /xno-escrow-dispute-required/);
assert.equal((await buyer.status({ trade_id: second.request.trade_id })).resolution, 'refund');

const legacy = { schema: 'property-agent-xno-journal/v1', version: 1, budget_committed_raw: '0', offers: {}, payments: {}, receipts: {}, disputes: {} };
assert.deepEqual(validateXnoJournal(legacy).escrows, {}, 'legacy journals gain an empty escrow map without losing their recorded payments');
const third = await requestAndOpen('60');
assert.equal(third.opened.status, 'awaiting_seller');
const fourth = await buyer.offer({ escrow_pubkey: custodianPub, arbiter_pubkey: arbiterPub, seller_pubkey: sellerPub, seller_account: sellerAccount,
  amount_raw: '50', terms: 'Segundo compromisso ainda sem depósito.', expires_in_seconds: 3600 });
await assert.rejects(custodian.open({ buyer_pubkey: buyerPub, request_message_id: fourth.request_message_id }), /xno-escrow-liability-cap-exceeded/);
assert.equal(calls.buyerSend.length, 2);
assert.deepEqual(calls.custodySend.map(call => call.destination), [sellerAccount, sellerAccount, buyerAccount]);
assert.equal(journals.buyer.budget_committed_raw, '80', 'both outbound deposits remain counted in the buyer lifetime budget after settlement');
const cases = [
  'four-distinct-contract-parties-and-fixed-account-binding',
  'buyer-request-and-custodian-contract-field-binding',
  'seller-acceptance-refuses-mismatched-local-nano-account',
  'duplicate-open-and-accept-do-not-create-new-contracts',
  'unknown-peer-and-message-ids-fail-closed',
  'buyer-cannot-fund-a-seller-contract-or-outsider-custodian',
  'exact-confirmed-deposit-is-verified-by-custodian',
  'buyer-independently-verifies-deposit-confirmation-before-release',
  'lost-receive-response-recovers-without-double-credit',
  'buyer-approved-release-pays-only-contract-agreed-seller-account',
  'lost-payout-response-retries-without-duplicate-transfer',
  'seller-dispute-pauses-settlement',
  'buyer-cannot-release-while-disputed',
  'arbiter-cannot-rule-before-dispute',
  'independent-arbiter-refund-pays-only-contract-bound-buyer-account',
  'arbiter-ruling-is-immutable-after-settlement',
  'partial-status-delivery-retries-only-missing-notice',
  'aggregate-open-liability-cap-is-enforced',
  'buyer-escrow-deposits-count-against-lifetime-budget',
  'legacy-journal-migrates-with-empty-escrow-map',
];
process.stdout.write(JSON.stringify({ gate: 'G10-XNO-custodial-escrow', profile: 'offline', seed: 'property-xno-escrow-fixed-v1', logicalNow: now,
  cases: cases.map(id => ({ id, result: 'PASS' })), caseCount: cases.length, trades: 2, pendingCapRequests: 2,
  syntheticDepositRaw: ['40', '40'], syntheticPayoutRaw: ['40', '40'], syntheticPayouts: [sellerAccount, buyerAccount],
  relayUsed: 'in-memory transport fixture', liveNanoRpc: false, fundsUsed: false, cryptographicNip17ValidatedHere: false,
  separateNip17RelayGate: 'G4', trustBoundary: 'custodial operator can bypass software and move pooled funds' }, null, 2) + '\n');
