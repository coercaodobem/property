import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import vm from 'node:vm';
import { createCampaignEngine, OFFER_KIND, OFFER_TAG } from '../../relay/campaign-engine.mjs';
import { createCampaignOperator, runCampaignOperatorStdio } from '../../relay/campaign-operator.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const OUTPUT = path.resolve(process.argv[2] || '/tmp/property-campaign-g8-fixed-count.json');
const BASE_NOW = 1_800_000_000;
const CURRENCIES = ['BTC', 'XMR', 'XNO'];
const SCENARIOS = ['publish', 'replace', 'expire', 'duplicate', 'pending', 'mismatch', 'hold', 'reject'];
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-campaign-g8-fixed-'));
let logicalNow = BASE_NOW;
let addressSequence = 0;
const payments = new Map();
const published = [];
const refundCalls = [];
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['../../web/vendor/nostr-tools-2.25.2.bundle.js', '../../web/protocol-contract.js',
  '../../web/money.js', '../../web/campaigns.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}
const N = context.NostrTools;
const Campaigns = context.PropertyCampaigns;

function secretFor(scalar) {
  const value = Array(32).fill(0);
  value[31] = scalar;
  return value;
}

function identity(scalar) {
  const secret = secretFor(scalar);
  context.identitySecret = secret;
  return { secret, pubkey: N.getPublicKey(Uint8Array.from(secret)) };
}

function signWith(who) {
  return draft => {
    context.signInput = JSON.stringify({ ...draft, secret: who.secret });
    return vm.runInContext(`(() => { const x=JSON.parse(signInput); return NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret)); })()`, context, { timeout: 5000 });
  };
}

const advertiser = identity(1);
const node = identity(2);
const id = value => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const digest = value => createHash('sha256').update(value).digest('hex');

function makeOffer(currency, sequence, createdAt, { campaignId = id(sequence), expiresAt = createdAt + 60, title } = {}) {
  const payload = { schema: OFFER_TAG, campaign_id: campaignId, advertiser_pubkey: advertiser.pubkey,
    title: title || `Campaign ${currency} ${sequence}`, body: 'Synthetic local campaign fixture',
    link: 'https://campaign.test/property', currency, amount_atomic: '100', expires_at: expiresAt,
    refund_terms: 'Signed refund request is required for a confirmed mismatch.' };
  context.offerInput = JSON.stringify({ kind: OFFER_KIND, content: JSON.stringify(payload), created_at: createdAt,
    tags: [['t', OFFER_TAG], ['d', campaignId]], secret: advertiser.secret });
  return vm.runInContext(`(() => { const x=JSON.parse(offerInput); return NostrTools.finalizeEvent({kind:x.kind,content:x.content,tags:x.tags,created_at:x.created_at},Uint8Array.from(x.secret)); })()`, context, { timeout: 5000 });
}

function createEngine(currency, name, options = {}) {
  const who = options.node || node;
  const stateDir = path.join(temp, `${currency}-${name}`);
  const ledger = {
    async lookupPayment({ address, currency: requestCurrency }) {
      assert.equal(requestCurrency, currency);
      return structuredClone(payments.get(address) || null);
    },
    async refundPayment(request) { refundCalls.push({ currency, key: request.idempotencyKey }); return { confirmed: false }; },
  };
  const engine = createCampaignEngine({
    stateDir, nodePubkey: who.pubkey, verifyEvent: N.verifyEvent, signEvent: signWith(who),
    addressProvider: async ({ campaignId }) => `${currency.toLowerCase()}-g8-invoice-${++addressSequence}-${campaignId}`,
    ledger,
    publishEvent: async (event, scope) => { published.push({ event, scope, currency }); return { accepted: true }; },
    nowSeconds: () => logicalNow,
    policy: options.policy || {},
  });
  return { engine, operator: createCampaignOperator(engine) };
}

const counts = Object.fromEntries(CURRENCIES.map(currency => [currency, {
  submitted: 0, policy_decisions: 0, accepted: 0, rejected: 0, published: 0, replaced: 0,
  expired: 0, duplicate_replays: 0, payment_pending: 0, mismatches: 0, held: 0,
  invalid_signatures: 0, unsupported_return: 0, retention_pruned: 0,
} ]));
const report = { schema_version: 1, gate: 'G8-campaign-fixed-count', result: 'RUNNING', seed: 'property-g8-campaign-fixed-v1',
  logical_now_start: BASE_NOW, currency_counts: counts, operator_tools: {}, accounting: {}, privacy: {},
  external_endpoints: [], relay_network: 'in-memory local fixture', funds_used: false };

try {
  assert.equal(Campaigns.TAG, 'property-sponsored-v2');
  let sequence = 1;
  const engines = {};
  for (const currency of CURRENCIES) {
    const base = CURRENCIES.indexOf(currency) * 1000;
    const { engine, operator } = createEngine(currency, 'cycles');
    engines[currency] = { engine, operator };
    const policyDecisionByOffer = new Map();

    for (let index = 0; index < 20; index++) {
      const scenario = SCENARIOS[index % SCENARIOS.length];
      logicalNow = BASE_NOW + base + index * 100;
      const fixtureSequence = base + index + 1;
      const offer = makeOffer(currency, fixtureSequence, logicalNow);
      counts[currency].submitted++;
      assert.equal(N.verifyEvent(offer), true);
      const recordsBeforeInspect = await engine.list();
      const beforeInspect = (await operator.dispatch({ jsonrpc: '2.0', id: `inspect-${currency}-${index}`,
        method: 'campaign/inspect', params: { offer_event: offer } })).result;
      assert.equal(beforeInspect.recommendation, 'accept');
      const afterInspect = await engine.list();
      assert.equal(afterInspect.length, recordsBeforeInspect.length, 'inspect has no state or address side effect');

      let decidedEventId;
      if (scenario === 'reject') {
        const rejected = await operator.dispatch({ jsonrpc: '2.0', id: `reject-${currency}-${index}`,
          method: 'campaign/reject', params: { offer_event: offer } });
        assert.equal(rejected.result.decision, 'rejected');
        const rejection = JSON.parse(rejected.result.event.content);
        assert.equal(rejection.reason, 'operator_rejected');
        assert.equal(Object.hasOwn(rejection, 'payment_address'), false);
        assert.equal(rejected.result.record.payment_address, undefined);
        policyDecisionByOffer.set(offer.id, rejected.result.event.id);
        counts[currency].rejected++;
        decidedEventId = rejected.result.event.id;
      } else {
        const scope = { mode: 'selected-relays', relays: ['ws://127.0.0.1:7777/'] };
        const accepted = await operator.dispatch({ jsonrpc: '2.0', id: `accept-${currency}-${index}`,
          method: 'campaign/accept', params: { offer_event: offer, publication_scope: scope } });
        assert.equal(accepted.result.decision, 'accepted');
        assert.deepEqual(accepted.result.record.publication_scope, scope);
        policyDecisionByOffer.set(offer.id, accepted.result.event.id);
        decidedEventId = accepted.result.event.id;
        counts[currency].accepted++;
        policyDecisionByOffer.set(offer.id, accepted.result.event.id);

        if (scenario === 'replace') {
          const replacement = makeOffer(currency, fixtureSequence, logicalNow + 1,
            { campaignId: accepted.result.record.campaign_id, title: 'Changed replacement terms' });
          const preview = await operator.dispatch({ jsonrpc: '2.0', id: `replace-inspect-${currency}-${index}`,
            method: 'campaign/inspect', params: { offer_event: replacement } });
          assert.equal(preview.result.recommendation, 'reject');
          assert.equal(preview.result.reason, 'campaign_id_conflict');
          const rejectedReplacement = await operator.dispatch({ jsonrpc: '2.0', id: `replace-${currency}-${index}`,
            method: 'campaign/reject', params: { offer_event: replacement } });
          assert.equal(JSON.parse(rejectedReplacement.result.event.content).reason, 'campaign_id_conflict');
          assert.equal((await engine.get(accepted.result.record.campaign_id)).offer_event_id, offer.id);
          policyDecisionByOffer.set(replacement.id, rejectedReplacement.result.event.id);
          assert.notEqual(rejectedReplacement.result.event.id, decidedEventId);
          counts[currency].replaced++;
        } else if (scenario === 'expire') {
          logicalNow = accepted.result.record.expires_at + 1;
          const expired = await engine.reconcile(accepted.result.record.campaign_id);
          assert.equal(expired.status, 'expired');
          assert.equal(published.some(row => row.event.tags?.some(tag => tag[1] === `property-sponsored-v2:${offer.tags.find(tag => tag[0] === 'd')[1]}`)), false);
          counts[currency].expired++;
        } else if (scenario === 'pending') {
          payments.set(accepted.result.record.payment_address, { address: accepted.result.record.payment_address,
            currency, amount_atomic: '100', txid: digest(`${currency}/${fixtureSequence}`), confirmations: 0, proof: true });
          const pending = await engine.reconcile(accepted.result.record.campaign_id);
          assert.equal(pending.status, 'payment_pending');
          counts[currency].payment_pending++;
        } else if (scenario === 'mismatch') {
          payments.set(accepted.result.record.payment_address, { address: accepted.result.record.payment_address,
            currency, amount_atomic: '101', txid: digest(`${currency}/mismatch/${fixtureSequence}`), confirmations: 1, proof: true });
          const mismatch = await engine.reconcile(accepted.result.record.campaign_id);
          assert.equal(mismatch.status, 'refund_due');
          assert.equal(mismatch.record.payment_mismatch, true);
          counts[currency].mismatches++;
        } else if (scenario === 'publish' || scenario === 'duplicate') {
          payments.set(accepted.result.record.payment_address, { address: accepted.result.record.payment_address,
            currency, amount_atomic: '100', txid: digest(`${currency}/paid/${fixtureSequence}`), confirmations: 1, proof: true });
          const first = await engine.reconcile(accepted.result.record.campaign_id);
          assert.equal(first.status, 'published');
          assert.equal(N.verifyEvent(first.event), true);
          const body = JSON.parse(first.event.content);
          assert.deepEqual(Object.keys(body).sort(), ['acceptance_event_id', 'amount_atomic', 'body', 'currency', 'expires_at',
            'link', 'node_pubkey', 'offer_event_id', 'payment_tx_id', 'schema', 'title'].sort());
          const visible = Campaigns.selectSponsoredCampaigns([first.event], N.verifyEvent, { nowSeconds: logicalNow });
          assert.equal(visible.length, 1);
          assert.equal(visible[0].title, body.title);
          const callsAfterFirst = published.filter(row => row.event.id === first.event.id).length;
          assert.equal(callsAfterFirst, 1);
          const replay = await engine.reconcile(accepted.result.record.campaign_id);
          assert.equal(replay.status, 'published');
          assert.equal(published.filter(row => row.event.id === first.event.id).length, 1, 'duplicate reconcile publishes once');
          assert.deepEqual(published.find(row => row.event.id === first.event.id).scope, { scope });
          if (scenario === 'duplicate') {
            const offerReplay = await operator.dispatch({ jsonrpc: '2.0', id: `duplicate-${currency}-${index}`,
              method: 'campaign/accept', params: { offer_event: offer } });
            assert.equal(offerReplay.result.event.id, accepted.result.event.id);
            counts[currency].duplicate_replays++;
          }
          counts[currency].published++;
        } else if (scenario === 'hold') {
          const nextScope = { mode: 'selected-relays', relays: ['ws://127.0.0.1:8888/'] };
          const scoped = await operator.dispatch({ jsonrpc: '2.0', id: `scope-${currency}-${index}`,
            method: 'campaign/set-publication-scope', params: { campaign_id: accepted.result.record.campaign_id, scope: nextScope } });
          assert.deepEqual(scoped.result.publication_scope, nextScope);
          assert.equal(scoped.result.status, 'awaiting_payment');
          counts[currency].held++;
        }
      }
      assert.equal(policyDecisionByOffer.get(offer.id), decidedEventId);
      counts[currency].policy_decisions++;
    }
    assert.equal(policyDecisionByOffer.size, counts[currency].policy_decisions + counts[currency].replaced,
      'every valid signed proposal has exactly one durable decision; replay does not add another');

    for (let index = 0; index < 5; index++) {
      logicalNow = BASE_NOW + base + 5_000 + index * 10;
      const offer = makeOffer(currency, base + 501 + index, logicalNow);
      const before = (await engine.list()).length;
      const tampered = structuredClone(offer);
      tampered.content += ' ';
      assert.equal(N.verifyEvent(tampered), false);
      const response = await operator.dispatch({ jsonrpc: '2.0', id: `invalid-${currency}-${index}`,
        method: 'campaign/inspect', params: { offer_event: tampered } });
      assert.equal(response.error.code, -32000);
      assert.equal((await engine.list()).length, before);
      counts[currency].invalid_signatures++;
    }

    const disabled = createEngine(currency, 'disabled', { policy: { enabled: false } });
    for (let index = 0; index < 10; index++) {
      logicalNow = BASE_NOW + base + 8_000 + index * 10;
      const offer = makeOffer(currency, base + 601 + index, logicalNow);
      const preview = await disabled.operator.dispatch({ jsonrpc: '2.0', id: `disabled-inspect-${currency}-${index}`,
        method: 'campaign/inspect', params: { offer_event: offer } });
      assert.equal(preview.result.recommendation, 'reject');
      assert.equal(preview.result.reason, 'campaigns_disabled_by_node');
      const result = await disabled.operator.dispatch({ jsonrpc: '2.0', id: `disabled-reject-${currency}-${index}`,
        method: 'campaign/reject', params: { offer_event: offer } });
      assert.equal(result.result.decision, 'rejected');
      assert.equal(result.result.record.payment_address, undefined);
      assert.equal(JSON.parse(result.result.event.content).reason, 'campaigns_disabled_by_node');
      assert.equal(refundCalls.filter(row => row.currency === currency).length, 0);
      counts[currency].unsupported_return++;
    }
  }

  for (const file of ['../../web/app.js', '../../web/campaigns.js', '../../relay/campaign-engine.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /sendBeacon|click_count|view_count|impression_count|analytics\.track/i,
      `campaign code ${file} must not contain user-level click/view analytics`);
  }
  const renderSource = await readFile(new URL('../../web/app.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../../web/i18n.js', import.meta.url), 'utf8');
  const renderStart = renderSource.indexOf('async function renderNodeCampaigns');
  const renderEnd = renderSource.indexOf('async function refreshHangout', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.doesNotMatch(renderSource.slice(renderStart, renderEnd), /fetch\s*\(|XMLHttpRequest|sendBeacon/i,
    'rendering the campaign card must not send a request');
  assert.match(renderSource, /label\.textContent = 'SPONSORED · PAYMENT NOT VERIFIED BY THE CLIENT'/,
    'the default sponsored label must be English');
  assert.match(i18nSource, /\['SPONSORED · PAYMENT NOT VERIFIED BY THE CLIENT', 'PATROCINADO · PAGAMENTO NÃO VERIFICADO PELO CLIENTE'\]/,
    'the sponsored label must have the Brazilian Portuguese translation');
  assert.ok(i18nSource.includes('const offer = /^Node offer: ([\\s\\S]*) · identity ([\\s\\S]*)$/'),
    'the dynamic currency offer line must be translated in both language directions');

  const { operator } = engines.BTC;
  const accounting = await operator.dispatch({ jsonrpc: '2.0', id: 'accounting', method: 'campaign/export-accounting', params: {} });
  assert.equal(accounting.result.reconciled_entries, accounting.result.entry_count);
  assert.ok(accounting.result.entries.every(row => row.offer_event_id && row.decision_event_id && row.signer_pubkey &&
    row.currency && /^\d+$/.test(row.amount_atomic) && row.status));
  report.accounting = { entries: accounting.result.entry_count, reconciled_entries: accounting.result.reconciled_entries,
    currency_totals: accounting.result.currencies };

  const retention = {};
  for (const currency of CURRENCIES) {
    const pair = engines[currency];
    const before = await pair.operator.dispatch({ jsonrpc: '2.0', id: `before-prune-${currency}`,
      method: 'campaign/list', params: {} });
    const prune = await pair.operator.dispatch({ jsonrpc: '2.0', id: `prune-${currency}`,
      method: 'campaign/prune-terminal', params: { before_epoch_seconds: logicalNow } });
    assert.ok(prune.result.pruned > 0);
    const after = await pair.operator.dispatch({ jsonrpc: '2.0', id: `after-prune-${currency}`,
      method: 'campaign/list', params: {} });
    assert.equal(after.result.length, before.result.length, 'retention compacts records but preserves replay tombstones');
    for (const record of after.result.filter(row => row.retention_pruned)) {
      assert.equal('body' in record, false);
      assert.equal('link' in record, false);
      assert.equal('payment_address' in record, false);
      assert.ok(record.decision_event?.id, 'signed policy decision remains available for replay protection');
    }
    retention[currency] = prune.result;
    counts[currency].retention_pruned = prune.result.pruned;
  }
  report.privacy = { external_endpoints: [], client_requests_during_render: 0, click_view_fields_in_campaign_schema: 0,
    rejected_offer_payment_addresses: 0, rejected_returns: 'UNSUPPORTED_RETURN; no payment address was issued; no automatic refund is advertised' };
  report.operator_tools = { names: operator.toolNames, count: operator.toolNames.length, tcp_listener: false,
    stdio_transport_only: true, publication_scope_selectable_before_payment_confirmation: true,
    retention_control: retention };
  report.result = 'PASS';

  const input = new PassThrough();
  const output = new PassThrough();
  const outputChunks = [];
  output.on('data', chunk => outputChunks.push(chunk));
  const cli = runCampaignOperatorStdio(operator, { input, output, maxLineBytes: 4096 });
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 'stdio-list', method: 'campaign/list', params: {} })}\n`);
  await cli;
  const cliResponse = JSON.parse(Buffer.concat(outputChunks).toString('utf8').trim());
  assert.equal(cliResponse.id, 'stdio-list');
  assert.ok(Array.isArray(cliResponse.result));
  report.operator_tools.stdio_list_response = true;

  const printable = JSON.stringify(report);
  assert.doesNotMatch(printable, /secretHex|private_key|wallet_password|rpc_password/);
  await (await import('node:fs/promises')).writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ gate: report.gate, result: report.result, currency_counts: report.currency_counts,
    operator_tools: report.operator_tools.count, external_endpoints: report.external_endpoints })}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
