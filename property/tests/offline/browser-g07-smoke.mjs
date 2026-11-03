#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCampaignEngine, OFFER_KIND, OFFER_TAG, REFUND_REQUEST_KIND } from '../../relay/campaign-engine.mjs';
import { closeNode, loadRuntime, publishEvent, startAppServer,
  startGeode, startNode, startProxy, stopGeode, waitStored, waitUntil, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASE_IDS = ['G07-01', 'G07-02', 'G07-03', 'G07-04', 'G07-05', 'G07-06', 'G07-07'];
const TEST_DESTINATION = 'https://campaign.test/property';
const NOW_EPOCH_SECONDS = 1_800_000_000;
const LATE_PAYMENT_EXPIRY_SECONDS = 1;
const LATE_PAYMENT_POST_EXPIRY_STEP_SECONDS = 1;
const EXPOSURE_WINDOW_SECONDS = 86_400;
const IDLE_TIMEOUT_MS = 1_800_000;
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
const safeText = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1000);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option ${key}.`);
    options[name] = value;
  }
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (options.engine !== 'chromium') throw new Error('G07 requires the pinned Chromium engine.');
  return options;
}

function campaignOffer(runtime, advertiser, simNow, values = {}) {
  const campaignId = values.campaignId || randomUUID();
  const payload = {
    schema: OFFER_TAG, campaign_id: campaignId, advertiser_pubkey: advertiser.pubkey,
    title: values.title || `Property G07 ${campaignId.slice(0, 8)}`,
    body: values.body || 'Relay comunitário com disponibilidade local.', link: values.link || TEST_DESTINATION,
    currency: values.currency || 'XNO', amount_atomic: values.amountAtomic || '1',
    expires_at: values.expiresAt || simNow + 900,
    refund_terms: values.refundTerms || 'Pagamento incompatível ou atrasado pode ser reembolsado mediante pedido assinado.'
  };
  return runtime.sign(OFFER_KIND, JSON.stringify(payload), simNow, advertiser.secret, [['t', OFFER_TAG], ['d', campaignId]]);
}
function engineFor(runtime, node, stateDir, ledger, publish, nowSeconds, policy = {}) {
  return createCampaignEngine({ stateDir, nodePubkey: node.pubkey, verifyEvent: runtime.verifyEvent,
    signEvent: draft => runtime.sign(draft.kind, draft.content, draft.created_at, node.secret, draft.tags),
    addressProvider: async ({ campaignId, currency }) => `${currency}-offline-${node.pubkey.slice(0, 10)}-${campaignId}`,
    ledger, publishEvent: publish, nowSeconds, policy });
}
function requestEvent(runtime, advertiser, campaignId, offerId, txid, createdAt) {
  return runtime.sign(REFUND_REQUEST_KIND, JSON.stringify({ schema: 'property-campaign-refund-v1', campaign_id: campaignId,
    offer_event_id: offerId, payment_tx_id: txid, refund_address: 'refund-destination-from-signed-advertiser-request' }),
  createdAt, advertiser.secret, [['d', campaignId], ['e', offerId]]);
}
async function waitForCampaign(page, title, expected = true) {
  if (expected) await page.locator('#node-campaigns-list .campaign-card').filter({ hasText: title }).waitFor({ state: 'visible', timeout: 10000 });
  else await page.locator('#node-campaigns-list .campaign-card').filter({ hasText: title }).waitFor({ state: 'detached', timeout: 10000 });
}
async function readCampaignSettings(page, pubkey) {
  return page.evaluate(async key => new Promise((resolve, reject) => {
    const request = indexedDB.open('liberdade-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('settings', 'readonly'), get = tx.objectStore('settings').get(key);
      get.onsuccess = () => resolve(get.result || null); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close();
    };
  }), `campaigns-${pubkey}`);
}
async function writeExposure(page, pubkey, campaignId, timestamp) {
  await page.evaluate(async ({ key, id, at }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('liberdade-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings');
      const get = store.get(key);
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { const saved = get.result || { id: key, enabled: true, blockedNodes: [], exposures: {} };
        saved.enabled = true; saved.exposures = { ...(saved.exposures || {}), [id]: at }; store.put(saved); };
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), { key: `campaigns-${pubkey}`, id: campaignId, at: timestamp });
}
async function openChat(page, peerNpub, title) {
  await page.locator('#new-chat-button').click(); await page.locator('#new-chat-dialog').waitFor({ state: 'visible' });
  await page.locator('#peer-input').fill(peerNpub); await page.locator('#peer-name-input').fill(title);
  await page.locator('#start-chat-button').click(); await page.locator('#new-chat-dialog').waitFor({ state: 'hidden' });
  await page.locator('#conversation-pane').waitFor({ state: 'visible' });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g07-'));
  const outputDir = path.resolve(options.output), reportPath = path.join(outputDir, 'browser-g07-report.json');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const report = { schema_version: 1, cases: CASE_IDS.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    relays: [], nodes: [], decisions: [], campaign_state: [], payments: [], privacy: {}, external_requests: [],
    denied_proxy_attempts: [], websockets: [], page_errors: [], test_destination_hits: [] };
  const checkpoint = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  const mark = (id, status, reason) => { Object.assign(report.cases.find(row => row.case === id), { status, reason }); return checkpoint(); };
  const nodes = [];
  const relays = [];
  let app, proxy, runtime, activeCase = CASE_IDS[0], activeStep = 'initialize offline lab';
  try {
    app = startAppServer(); proxy = startProxy(); await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    runtime = await loadRuntime(options, proxy.server.address().port);
    report.browser = runtime.evidence; report.local_origin = origin;
    for (const key of PROXY_KEYS) delete process.env[key];
    for (let index = 0; index < 2; index++) {
      const relay = await startGeode(28472 + index, temp, `relay ${index + 1}`);
      relays.push(relay); report.relays.push({ url: relay.url, process_id: relay.child.pid, independent: true });
    }
    const [r1, r2] = relays.map(relay => relay.url);
    const advertiser = runtime.createIdentity(), nodeA = runtime.createIdentity(), nodeB = runtime.createIdentity(), buyer = runtime.createIdentity();
    const simClock = { now: NOW_EPOCH_SECONDS };
    const ledgerPayments = new Map(), ledgerRefunds = new Map();
    const ledgerCounters = { lookup: 0, refund: 0 };
    const ledger = {
      async lookupPayment({ address, currency }) {
        ledgerCounters.lookup++;
        const payment = ledgerPayments.get(address);
        return payment ? structuredClone({ ...payment, currency: payment.currency ?? currency }) : null;
      },
      async refundPayment(request) {
        ledgerCounters.refund++;
        if (!ledgerRefunds.has(request.idempotencyKey)) ledgerRefunds.set(request.idempotencyKey, {
          confirmed: true, txid: createHash('sha256').update(`refund:${request.idempotencyKey}`).digest('hex'), fee_atomic: '1'
        });
        return structuredClone(ledgerRefunds.get(request.idempotencyKey));
      }
    };
    const publishToBoth = async event => {
      const a = await publishEvent(r1, event), b = await publishEvent(r2, event);
      return { accepted: a.accepted && b.accepted, relays: [a, b] };
    };
    const engineAPath = path.join(temp, 'node-a-state'), engineBPath = path.join(temp, 'node-b-state');
    let engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    const engineB = engineFor(runtime, nodeB, engineBPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC'], minConfirmations: 1 });

    activeCase = 'G07-01'; activeStep = 'deliver one signed proposal to two independent nodes';
    const primaryOffer = campaignOffer(runtime, advertiser, simClock.now, { expiresAt: simClock.now + 180 });
    assert.equal(runtime.verifyEvent(primaryOffer), true);
    for (const url of [r1, r2]) assert.equal((await publishEvent(url, primaryOffer)).accepted, true);
    await waitStored(r1, primaryOffer.id); await waitStored(r2, primaryOffer.id);
    const offerAtA = (await wsQuery(r1, { ids: [primaryOffer.id], limit: 1 }))[0];
    const offerAtB = (await wsQuery(r2, { ids: [primaryOffer.id], limit: 1 }))[0];
    assert.ok(offerAtA && offerAtB && runtime.verifyEvent(offerAtA) && runtime.verifyEvent(offerAtB));
    const [acceptedA, rejectedB] = await Promise.all([engineA.decide(offerAtA), engineB.decide(offerAtB)]);
    assert.equal(acceptedA.decision, 'accepted');
    assert.equal(rejectedB.decision, 'rejected');
    assert.equal(JSON.parse(rejectedB.event.content).reason, 'currency_not_accepted');
    assert.equal(rejectedB.record.status, 'rejected');
    assert.equal(acceptedA.record.status, 'awaiting_payment');
    assert.equal(runtime.verifyEvent(acceptedA.event), true); assert.equal(runtime.verifyEvent(rejectedB.event), true);
    await publishEvent(r1, acceptedA.event); await publishEvent(r2, rejectedB.event);
    await waitStored(r1, acceptedA.event.id); await waitStored(r2, rejectedB.event.id);
    assert.equal((await wsQuery(r1, { kinds: [30078], limit: 20 })).length, 0,
      'independent acceptance is not an ad and cannot publish without a confirmed payment');
    assert.equal((await engineA.get(acceptedA.record.campaign_id)).status, 'awaiting_payment');
    assert.equal((await engineB.get(rejectedB.record.campaign_id)).status, 'rejected');
    report.decisions.push({ offer_id: primaryOffer.id, node_a: acceptedA.event.id, node_a_status: acceptedA.decision,
      node_b: rejectedB.event.id, node_b_status: rejectedB.decision, node_b_reason: JSON.parse(rejectedB.event.content).reason,
      decision_signatures_valid: true, node_state_directories: [engineAPath, engineBPath].map(value => path.basename(value)) });
    await mark('G07-01', 'PASS', 'The same signed offer was fetched from two independent Geode relays. Node A accepted under its XNO policy; node B independently rejected under its BTC-only policy. Both signed decisions persisted separately, and neither created a campaign before payment.');

    activeCase = 'G07-02'; activeStep = 'verify decision binding, refusal, and changed terms';
    const acceptanceContent = JSON.parse(acceptedA.event.content);
    assert.deepEqual({ offer_event_id: acceptanceContent.offer_event_id, terms_hash: acceptanceContent.terms_hash,
      currency: acceptanceContent.currency, amount_atomic: acceptanceContent.amount_atomic,
      expires_at: acceptanceContent.expires_at, refund_terms: acceptanceContent.refund_terms,
      payment_address: acceptanceContent.payment_address, node_pubkey: acceptanceContent.node_pubkey }, {
      offer_event_id: primaryOffer.id, terms_hash: acceptedA.record.terms_hash, currency: 'XNO', amount_atomic: '1',
      expires_at: primaryOffer.created_at + 180, refund_terms: 'Pagamento incompatível ou atrasado pode ser reembolsado mediante pedido assinado.',
      payment_address: acceptedA.record.payment_address, node_pubkey: nodeA.pubkey
    });
    assert.equal('payment_address' in JSON.parse(rejectedB.event.content), false, 'a rejection exposes no payment address');
    const alteredDecision = JSON.parse(JSON.stringify(acceptedA.event));
    alteredDecision.content = alteredDecision.content.replace('"amount_atomic":"1"', '"amount_atomic":"2"');
    assert.equal(runtime.verifyEvent(alteredDecision), false, 'editing a signed decision invalidates its signature');
    // Reuse the original signed addressable campaign id while changing the signed offer terms.
    const changedPayload = { ...JSON.parse(primaryOffer.content), amount_atomic: '2' };
    const changedOfferSigned = runtime.sign(OFFER_KIND, JSON.stringify(changedPayload), simClock.now, advertiser.secret,
      [['t', OFFER_TAG], ['d', acceptedA.record.campaign_id]]);
    const conflictDecision = await engineA.decide(changedOfferSigned);
    assert.equal(conflictDecision.decision, 'rejected');
    assert.equal(JSON.parse(conflictDecision.event.content).reason, 'campaign_id_conflict');
    assert.equal((await engineA.get(acceptedA.record.campaign_id)).status, 'awaiting_payment', 'changed terms cannot overwrite the original binding');
    assert.equal((await wsQuery(r1, { kinds: [30078], limit: 20 })).length, 0, 'rejected and altered terms publish no campaign');
    await mark('G07-02', 'PASS', 'The signed acceptance binds the offer ID, terms hash, currency, integer amount, exclusive address, deadline, refund terms, and node identity. Rejection contains no payment address. Edited decision signatures fail; a new altered offer using the same campaign ID is rejected without replacing the original accepted state.');

    activeCase = 'G07-03'; activeStep = 'walk the real engine through payment, campaign publication, expiry, rejection and refund';
    engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    assert.equal((await engineA.reconcile(acceptedA.record.campaign_id)).status, 'awaiting_payment', 'offer without funds stays pending');
    const acceptedPayment = { address: acceptedA.record.payment_address, currency: 'XNO', amount_atomic: '1',
      txid: 'a'.repeat(64), confirmations: 0, proof: true };
    ledgerPayments.set(acceptedPayment.address, acceptedPayment);
    assert.equal((await engineA.reconcile(acceptedA.record.campaign_id)).status, 'payment_pending', 'mempool/unconfirmed payment does not publish');
    engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    ledgerPayments.set(acceptedPayment.address, { ...acceptedPayment, confirmations: 1 });
    const published = await engineA.reconcile(acceptedA.record.campaign_id);
    assert.equal(published.status, 'published');
    const campaignEvent = published.event;
    assert.equal(campaignEvent.kind, 30078); assert.equal(runtime.verifyEvent(campaignEvent), true);
    const campaignData = JSON.parse(campaignEvent.content);
    assert.deepEqual({ offer_event_id: campaignData.offer_event_id, acceptance_event_id: campaignData.acceptance_event_id,
      payment_tx_id: campaignData.payment_tx_id, amount_atomic: campaignData.amount_atomic, currency: campaignData.currency,
      node_pubkey: campaignData.node_pubkey }, { offer_event_id: primaryOffer.id, acceptance_event_id: acceptedA.event.id,
      payment_tx_id: acceptedPayment.txid, amount_atomic: '1', currency: 'XNO', node_pubkey: nodeA.pubkey });
    await waitStored(r1, campaignEvent.id); await waitStored(r2, campaignEvent.id);
    engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    assert.equal((await engineA.reconcile(acceptedA.record.campaign_id)).status, 'published');
    assert.equal((await wsQuery(r1, { kinds: [30078], limit: 20 })).filter(event => event.id === campaignEvent.id).length, 1);
    simClock.now = campaignData.expires_at + 1;
    const expiration = await engineA.reconcile(acceptedA.record.campaign_id);
    assert.equal(expiration.status, 'expired'); assert.equal(expiration.event.kind, 5); assert.equal(runtime.verifyEvent(expiration.event), true);
    await waitStored(r1, campaignEvent.id, false); await waitStored(r2, campaignEvent.id, false);
    assert.equal((await engineA.get(acceptedA.record.campaign_id)).status, 'expired', 'restart preserves the expiry transition');
    report.campaign_state.push({ offer: 'awaiting_payment', unconfirmed: 'payment_pending', confirmed: 'confirmed_then_published',
      expiry: 'signed_kind_5_tombstone', relay_copies_removed: true, campaign_event_id: campaignEvent.id,
      expiration_event_id: expiration.event.id, accepted_once: true, no_duplicate_campaign_event: true });
    await mark('G07-03', 'PASS', 'The persisted production engine traversed awaiting payment → unconfirmed → confirmed → published → expired using a deterministic ledger adapter. It also preserved node B’s rejection and reloaded the same accepted state after restart; expiry removed the campaign copy with a signed NIP-09 tombstone.');

    activeCase = 'G07-04'; activeStep = 'reconcile duplicates, late and mismatched payments and signed refunds';
    const lateOffer = campaignOffer(runtime, advertiser, simClock.now,
      { expiresAt: simClock.now + LATE_PAYMENT_EXPIRY_SECONDS });
    const lateAcceptance = await engineA.decide(lateOffer);
    simClock.now = JSON.parse(lateOffer.content).expires_at + LATE_PAYMENT_POST_EXPIRY_STEP_SECONDS;
    const latePayment = { address: lateAcceptance.record.payment_address, currency: 'XNO', amount_atomic: '1',
      txid: 'f'.repeat(64), confirmations: 1, proof: true };
    ledgerPayments.set(latePayment.address, latePayment);
    const lateReconciliation = await engineA.reconcile(lateAcceptance.record.campaign_id);
    assert.equal(lateReconciliation.status, 'refund_due', 'payment first observed after the logical deadline is not published');
    assert.equal((await engineA.reconcile(lateAcceptance.record.campaign_id)).status, 'refund_due',
      'repeated late-payment reconciliation remains idempotent');
    assert.equal((await wsQuery(r1, { kinds: [30078], limit: 50 })).some(event => event.content.includes(lateOffer.id)), false,
      'late payment never creates an active campaign');
    const mismatchScenarios = [
      { label: 'wrong_amount', patch: { amount_atomic: '2', currency: 'XNO' } },
      { label: 'wrong_currency', patch: { amount_atomic: '1', currency: 'BTC' } },
      { label: 'wrong_address', patch: { amount_atomic: '1', currency: 'XNO', address: 'another-address' } }
    ];
    const mismatchRecords = [];
    for (const [index, scenario] of mismatchScenarios.entries()) {
      const offer = campaignOffer(runtime, advertiser, simClock.now, { expiresAt: simClock.now + 300 });
      const result = await engineA.decide(offer);
      const address = result.record.payment_address;
      const mismatchTx = String(index + 2).repeat(64);
      ledgerPayments.set(address, { address, currency: 'XNO', amount_atomic: '1', txid: mismatchTx, confirmations: 1, proof: true, ...scenario.patch });
      const recon = await engineA.reconcile(result.record.campaign_id);
      assert.equal(recon.status, 'refund_due', `${scenario.label} must remain visible for reconciliation`);
      assert.equal((await engineA.get(result.record.campaign_id)).status, 'refund_due');
      mismatchRecords.push({ case: scenario.label, campaign_id: result.record.campaign_id, status: recon.status, txid: mismatchTx });
    }
    const refundOffer = campaignOffer(runtime, advertiser, simClock.now, { expiresAt: simClock.now + 300 });
    const refundAcceptance = await engineA.decide(refundOffer);
    const refundAddress = refundAcceptance.record.payment_address;
    const refundTx = 'd'.repeat(64);
    ledgerPayments.set(refundAddress, { address: refundAddress, currency: 'XNO', amount_atomic: '2', txid: refundTx, confirmations: 1, proof: true });
    assert.equal((await engineA.reconcile(refundAcceptance.record.campaign_id)).status, 'refund_due');
    const refundRequest = requestEvent(runtime, advertiser, refundAcceptance.record.campaign_id, refundOffer.id, refundTx, simClock.now);
    const beforeRefundCalls = ledgerCounters.refund;
    const refunded = await engineA.refund(refundRequest);
    assert.equal(refunded.status, 'refunded'); assert.equal(refunded.refund.amount_atomic, '2');
    engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    assert.equal((await engineA.refund(refundRequest)).status, 'refunded');
    assert.equal(ledgerCounters.refund, beforeRefundCalls + 1, 'repeated signed request does not debit twice');
    assert.equal((await wsQuery(r1, { kinds: [30078], limit: 50 })).some(event => event.id && event.content.includes(refundOffer.id)), false,
      'mismatched amounts never publish a campaign');
    report.payments.push({ late_payment: { observed_after_expiry: true, status: lateReconciliation.status, published: false,
      deadline_advance_seconds: LATE_PAYMENT_EXPIRY_SECONDS + LATE_PAYMENT_POST_EXPIRY_STEP_SECONDS }, mismatch_scenarios: mismatchRecords, refund_tx: refunded.refund.txid,
      refund_amount_atomic: refunded.refund.amount_atomic, refund_request_signed: runtime.verifyEvent(refundRequest),
      refund_repeat_debit_count: ledgerCounters.refund - beforeRefundCalls, lookup_count: ledgerCounters.lookup,
      duplicate_payment_notifications: 'same persisted txid reconciled without a second campaign event' });
    await mark('G07-04', 'PASS', 'Duplicate reconciliation after restart preserved one campaign event. Wrong amount, currency, or destination stayed in refund_due and never activated an ad. A signed advertiser refund request returned the exact observed amount; retry after engine restart used the ledger idempotency key and produced one debit.');

    activeCase = 'G07-05'; activeStep = 'exercise PWA opt-in, sponsor labeling, local block and local exposure cap';
    const appReport = report;
    const logicalClock = { epochMs: simClock.now * 1000, idleDelayMs: IDLE_TIMEOUT_MS };
    const clientA = await startNode(runtime, origin, appReport, 'viewer-a-node-a', [r1, r2],
      { secretHex: nodeA.secretHex, inboxRelays: [r1], logicalClock });
    const clientB = await startNode(runtime, origin, appReport, 'viewer-b-node-b', [r1, r2],
      { secretHex: nodeB.secretHex, inboxRelays: [r1], testDestinationUrl: TEST_DESTINATION, logicalClock });
    nodes.push(clientA, clientB);
    assert.equal(clientA.id.pubkey, nodeA.pubkey); assert.equal(clientB.id.pubkey, nodeB.pubkey);
    for (const node of nodes) await node.page.locator('button[data-view="hangout"]').click();
    assert.equal(await clientA.page.locator('#show-node-campaigns').isChecked(), false, 'campaign preference starts off on this device');
    assert.equal(await clientB.page.locator('#show-node-campaigns').isChecked(), false, 'campaign preference starts off on the second device');
    assert.equal(await clientA.page.locator('#node-campaigns-section').isVisible(), false);
    const clientCampaign = await wsQuery(r1, { ids: [campaignEvent.id], limit: 1 });
    assert.equal(clientCampaign.length, 0, 'expired ad is no longer served to clients');
    // Reconcile a new funded offer to make a currently live event for the PWA cases.
    engineA = engineFor(runtime, nodeA, engineAPath, ledger, publishToBoth, () => simClock.now,
      { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations: 1 });
    const uiOffer = campaignOffer(runtime, advertiser, simClock.now, { expiresAt: simClock.now + 1200 });
    await publishEvent(r1, uiOffer); await publishEvent(r2, uiOffer);
    const uiAccepted = await engineA.decide((await wsQuery(r1, { ids: [uiOffer.id], limit: 1 }))[0]);
    const uiAcceptance = JSON.parse(uiAccepted.event.content);
    const uiPayment = { address: uiAcceptance.payment_address, currency: 'XNO', amount_atomic: '1', txid: 'e'.repeat(64), confirmations: 1, proof: true };
    ledgerPayments.set(uiPayment.address, uiPayment);
    const uiPublished = await engineA.reconcile(uiAccepted.record.campaign_id);
    assert.equal(uiPublished.status, 'published'); await waitStored(r1, uiPublished.event.id); await waitStored(r2, uiPublished.event.id);
    const uiTitle = JSON.parse(uiPublished.event.content).title;
    await clientA.page.locator('#show-node-campaigns').check();
    await waitForCampaign(clientA.page, uiTitle, true);
    assert.match((await clientA.page.locator('#node-campaigns-list .campaign-card').textContent()).toUpperCase(), /PATROCINADO/);
    assert.equal(await clientA.page.locator('#hangout-list .campaign-card').count(), 0, 'campaign remains outside the public-post feed');
    const campaignSettingsA = await readCampaignSettings(clientA.page, nodeA.pubkey);
    const uiCampaignD = `property-sponsored-v2:${uiAccepted.record.campaign_id}`;
    assert.equal(campaignSettingsA.enabled, true); assert.ok(Number.isSafeInteger(campaignSettingsA.exposures[uiCampaignD]));
    await clientA.page.locator('#refresh-hangout').click();
    await waitUntil(async () => (await clientA.page.locator('#node-campaigns-list .campaign-card').count()) === 0, 5000,
      'second view inside the local exposure window should be capped');
    await writeExposure(clientA.page, nodeA.pubkey, uiCampaignD, simClock.now - EXPOSURE_WINDOW_SECONDS - 1);
    await clientA.page.locator('#refresh-hangout').click(); await waitForCampaign(clientA.page, uiTitle, true);
    await clientA.page.locator('#node-campaigns-list').getByRole('button', { name: 'Ocultar este node' }).click();
    const blockedSettings = await readCampaignSettings(clientA.page, nodeA.pubkey);
    assert.ok(blockedSettings.blockedNodes.includes(nodeA.pubkey), 'the source node was blocked in local settings');
    assert.equal(await clientA.page.locator('#node-campaigns-list .campaign-card').count(), 0);
    assert.equal(await clientB.page.locator('#node-campaigns-list .campaign-card').count(), 0, 'second user remains opted out');
    report.privacy.pwa_settings = { opt_in_off_by_default_for_both: true, campaign_label: 'PATROCINADO',
      separated_from_hangout_feed: true, local_exposure_recorded: true, immediate_repeat_hidden: true,
      local_node_block: nodeA.pubkey, blocked_only_for_A: true, B_remains_opted_out: true };
    await mark('G07-05', 'PASS', 'PWA campaigns were off on both devices until opt-in, rendered with a sponsored label in their own section, and stayed separate from Hangout posts. The 86,401-second logical exposure boundary, local node block, and distinct device preferences were verified through the PWA’s IndexedDB state.');

    activeCase = 'G07-06'; activeStep = 'inspect browser requests and make one explicit local test-link click';
    assert.deepEqual(report.external_requests, [], 'viewing and refreshing a campaign created no external HTTP request');
    const webOrigins = await clientB.page.locator('script[src]').evaluateAll(nodes => nodes.map(node => new URL(node.src, location.href).origin));
    assert.ok(webOrigins.every(value => value === origin), 'all active scripts are served by the local app origin');
    assert.equal(await clientB.page.locator('#node-campaigns-list img').count(), 0, 'campaign has no remote image or pixel');
    assert.equal(await clientB.page.locator('#node-campaigns-list a').count(), 0, 'opt-out hides the campaign link');
    await clientB.page.locator('#show-node-campaigns').check(); await waitForCampaign(clientB.page, uiTitle, true);
    assert.equal(await clientB.page.locator('#node-campaigns-list a').count(), 1, 'only the explicit destination link is available');
    assert.deepEqual(report.external_requests, [], 'the external destination was not opened merely by rendering');
    const [destination] = await Promise.all([
      clientB.page.waitForEvent('popup'),
      clientB.page.locator('#node-campaigns-list a').click()
    ]);
    await destination.locator('#local-destination').waitFor({ state: 'visible' });
    assert.equal((await destination.locator('#local-destination').textContent()).trim(), 'Local test destination reached.');
    await destination.close();
    const expectedRequest = `GET ${new URL(TEST_DESTINATION).origin}${new URL(TEST_DESTINATION).pathname}`;
    assert.deepEqual(report.external_requests, [expectedRequest], 'only the user-clicked URL appeared as external browser traffic');
    assert.equal(report.test_destination_hits.length, 1);
    assert.equal(report.test_destination_hits[0].action, 'navigation');
    assert.deepEqual(proxy.attempts, [], 'the local browser proxy saw no remote call');
    assert.ok(report.websockets.every(value => /^ws:\/\/127\.0\.0\.1:/.test(value)), 'relay traffic used localhost WebSockets only');
    assert.deepEqual(report.page_errors, [], 'no browser errors occurred');
    report.privacy.traffic = { external_http_before_click: [], user_clicked_destination: TEST_DESTINATION,
      only_external_http_request: expectedRequest, telemetry_or_pixel_requests: 0, local_proxy_attempts: 0,
      websocket_destinations: [...new Set(report.websockets)], scripts_local: true };
    await mark('G07-06', 'PASS', 'Campaign discovery and rendering generated no external HTTP requests, pixel, remote script, or proxy attempt. The HTTPS link opened only after an explicit click and was intercepted by an in-memory offline destination; relay sockets stayed on localhost.');

    activeCase = 'G07-07'; activeStep = 'verify independent local preferences and private messaging without advertising revenue';
    const bSettingsBefore = await readCampaignSettings(clientB.page, nodeB.pubkey);
    assert.equal(bSettingsBefore.enabled, true);
    assert.deepEqual(bSettingsBefore.blockedNodes, [], 'A’s node block does not apply to B');
    await clientA.page.locator('button[data-view="messages"]').click();
    await openChat(clientA.page, clientB.id.npub, 'Node B privado');
    const privateText = `property-g07-private-${randomUUID()}`;
    await clientA.page.locator('#message-input').fill(privateText);
    await clientA.page.locator('#send-form button[type="submit"]').click();
    await clientA.page.locator('#messages .message-row').filter({ hasText: privateText }).waitFor({ state: 'visible', timeout: 15000 });
    await clientB.page.locator('button[data-view="messages"]').click();
    await openChat(clientB.page, clientA.id.npub, 'Node A privado');
    await clientB.page.locator('#messages .message-bubble').filter({ hasText: privateText }).waitFor({ state: 'visible', timeout: 15000 });
    const privateEvents = await wsQuery(r1, { kinds: [1059], limit: 200 });
    const wraps = privateEvents.filter(event => event.kind === 1059 && event.tags.some(tag => tag[0] === 'p' && tag[1] === nodeB.pubkey));
    assert.ok(wraps.length >= 1); assert.ok(wraps.every(event => runtime.verifyEvent(event) && !event.content.includes(privateText)));
    const activeSettings = await Promise.all([readCampaignSettings(clientA.page, nodeA.pubkey), readCampaignSettings(clientB.page, nodeB.pubkey)]);
    assert.equal(activeSettings[0].enabled, true); assert.ok(activeSettings[0].blockedNodes.includes(nodeA.pubkey));
    assert.equal(activeSettings[1].enabled, true); assert.deepEqual(activeSettings[1].blockedNodes, []);
    const financialEvents = await wsQuery(r1, { kinds: [9734, 23194, 23195], limit: 100 });
    assert.deepEqual(financialEvents, [], 'communication produced no payment or hidden checkout event');
    report.privacy.independent_preferences = { A_campaigns_enabled: activeSettings[0].enabled,
      A_blocked_node: nodeA.pubkey, B_campaigns_enabled: activeSettings[1].enabled, B_blocked_nodes: activeSettings[1].blockedNodes };
    report.privacy.private_messaging = { recipient_pubkey: nodeB.pubkey, plaintext_visible_only_in_ui: true,
      relay_envelopes_valid: wraps.every(runtime.verifyEvent), relay_envelopes_contain_plaintext: false,
      payment_or_checkout_event_count: financialEvents.length, message_event_ids: wraps.map(event => event.id) };
    assert.deepEqual(report.external_requests, [`GET ${new URL(TEST_DESTINATION).origin}${new URL(TEST_DESTINATION).pathname}`],
      'only the user-clicked destination was requested outside the local app origin');
    await mark('G07-07', 'PASS', 'Node A and node B kept separate local opt-in/block settings. While one device blocked the campaign node and another rejected its offer, the PWA still completed a NIP-17 private message; relays stored signed encrypted envelopes without plaintext or payment/checkout events.');

    report.simulated_ledger = { deterministic: true, scope: 'G07 state-machine harness only', lookups: ledgerCounters.lookup,
      refund_calls: ledgerCounters.refund, not_a_chain_or_G08_evidence: true };
    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    await checkpoint();
    process.stdout.write(`${JSON.stringify({ result: report.result, cases: report.cases, output: outputDir })}\n`);
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const current = report.cases.find(row => row.case === activeCase);
    if (current?.status === 'NOT_RUN') Object.assign(current, { status: /playwright|executable|version mismatch|ENOENT|permission|launch/i.test(error.message) ? 'BLOCKED' : 'FAIL',
      reason: safeText(error.message || error) });
    for (const row of report.cases) if (row.status === 'NOT_RUN') Object.assign(row, {
      status: 'BLOCKED', reason: `${activeCase} did not pass; dependent G07 scenario was not started.`
    });
    report.result = report.cases.some(row => row.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    report.error = safeText(error.message || error); report.current_case = activeCase; report.current_step = activeStep;
    report.error_stack = safeText(error.stack || ''); report.node_diagnostics = nodes.map(node => ({ label: node.label,
      subscriptions: node.subscriptions, eoses: node.eoses, received: node.received, forwarded: node.forwarded, errors: node.errors }));
    report.denied_proxy_attempts = proxy?.attempts || [];
    await checkpoint().catch(() => {});
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await Promise.all(nodes.map(closeNode));
    await runtime?.browser?.close().catch(() => {});
    for (const relay of relays.reverse()) await stopGeode(relay);
    for (const server of [app?.server, proxy?.server]) if (server?.listening) await new Promise(resolve => {
      server.close(() => resolve()); server.closeAllConnections?.();
    });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(`BLOCKED: ${safeText(error.message || error)}\n`); process.exitCode = 2; });
}
