#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startAppServer, startProxy, loadRuntime, startGeode, stopGeode, wsQuery, publishEvent,
  waitStored, startNode, disableNode, closeNode, waitUntil, assertNoExternal
} from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASES = ['G06-01', 'G06-02', 'G06-03', 'G06-04', 'G06-05', 'G06-06', 'G06-07', 'G06-08'];
const NOW_EPOCH_SECONDS = 1_800_000_000;
const LOGICAL_CLOCK_STEP_MS = 1_000;
const IDLE_TIMEOUT_MS = 1_800_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeText = value => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g, '/home/<USER>').slice(0, 1200);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option ${key}.`);
    options[name] = value;
  }
  for (const name of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version',
    'playwright_package_sha256', 'browser_executable_sha256', 'output']) {
    if (!options[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  if (options.engine !== 'chromium') throw new Error('G06 requires the manifest-pinned Chromium engine.');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g06-'));
  const outputDir = path.resolve(options.output);
  const reportPath = path.join(outputDir, 'browser-g06-report.json');
  const report = { schema_version: 1, network_isolation: { mode: process.env.PROPERTY_NETWORK_ISOLATION || 'not isolated' },
    cases: CASES.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    nodes: [], relays: [], external_requests: [], websockets: [], denied_proxy_attempts: [], page_errors: [],
    hangout: {}, marketplace: {}, deletion: {}, security: {}, contact: {} };
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const mark = (id, status, reason) => { Object.assign(report.cases.find(row => row.case === id), { status, reason }); checkpoint(); };
  checkpoint();
  const nodes = new Map();
  const relays = [];
  let runtime, app, proxy;
  let allRelayUrls = [];
  let activeCase = CASES[0];
  let activeStep = 'browser and relay setup';
  let seller, buyer, bridge;

  async function relayEvents(url, filter) { return wsQuery(url, filter); }
  async function untilValue(getter, timeoutMs, message) {
    const deadline = Date.now() + timeoutMs;
    do {
      const value = await getter();
      if (value) return value;
      await sleep(150);
    } while (Date.now() < deadline);
    throw new Error(message);
  }
  async function latestProduct(url, author, id) {
    const events = await relayEvents(url, { kinds: [30018], authors: [author], limit: 100 });
    return events.map(event => {
      try { return { event, data: JSON.parse(event.content) }; } catch { return null; }
    }).filter(item => item?.data?.id === id).sort((a, b) => b.event.created_at - a.event.created_at || a.event.id.localeCompare(b.event.id))[0] || null;
  }
  async function productEvents(url, author) { return relayEvents(url, { kinds: [30018], authors: [author], limit: 200 }); }
  async function publishFromUi(node, { name, currency, amount, description = 'Termos combinados diretamente entre as pessoas.', offerType = 'item', expiry = 'never' }) {
    await node.page.locator('#publish-product-button').click();
    await node.page.locator('#product-dialog').waitFor({ state: 'visible' });
    await node.page.locator('#product-name').fill(name);
    await node.page.locator('#product-offer-type').selectOption(offerType);
    await node.page.locator('#product-description').fill(description);
    await node.page.locator('#product-currency').selectOption(currency);
    await node.page.locator('#product-expiry').selectOption(expiry);
    await node.page.locator('#product-price').fill(amount);
    await node.page.locator('#product-image').fill('');
    await node.page.locator('#publish-product').click();
    await node.page.locator('#product-dialog').waitFor({ state: 'hidden', timeout: 15000 });
  }
  async function refreshProductFor(node, name) {
    await node.page.locator('#refresh-marketplace').click();
    try {
      await node.page.waitForFunction(expected => [...document.querySelectorAll('#marketplace-list .product-card')]
        .some(card => card.textContent.includes(expected)), name, { timeout: 15000 });
    } catch {
      const rendered = (await node.page.locator('#marketplace-list').textContent()).slice(0, 1000);
      throw new Error(`Offer ${name} did not render after refresh; marketplace text: ${rendered}`);
    }
  }
  async function closeProductDialog(node) {
    if (await node.page.locator('#product-dialog').isVisible()) {
      await node.page.locator('#product-dialog .dialog-head button').click();
      await node.page.locator('#product-dialog').waitFor({ state: 'hidden' });
    }
  }
  async function publishToFiveRelays(event) {
    const acknowledgements = await Promise.all(allRelayUrls.map(url => publishEvent(url, event)));
    assert.ok(acknowledgements.every(ack => ack.accepted), `signed event ${event.id} is accepted by each local relay`);
    return acknowledgements;
  }
  async function setGeneralRelays(node, urls) {
    await node.page.locator('#open-settings').click();
    await node.page.locator('#relay-dialog').waitFor({ state: 'visible' });
    await node.page.locator('#relay-input').fill(urls.join('\n'));
    await node.page.locator('#save-relays').click();
    await node.page.locator('#relay-dialog').waitFor({ state: 'hidden' });
    await node.page.waitForFunction(count => document.querySelector('#connection-label')?.textContent.trim() ===
      `${count}/${count} relay${count === 1 ? '' : 's'}`, urls.length, { timeout: 20000 });
  }

  try {
    app = startAppServer();
    proxy = startProxy();
    await Promise.all([app.ready, proxy.ready]);
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    runtime = await loadRuntime(options, proxy.server.address().port);
    report.browser = runtime.evidence;
    report.local_origin = origin;
    for (let i = 0; i < 5; i++) {
      const relay = await startGeode(28480 + i, temp, `G06 relay ${i + 1}`);
      relays.push(relay);
      report.relays.push({ url: relay.url, process_id: relay.child.pid, data_dir_mode: 'temporary private directory' });
    }
    const r1 = relays[0].url;
    const r2 = relays[4].url;
    allRelayUrls = relays.map(relay => relay.url);
    const sellerIdentity = runtime.createIdentity();
    const buyerIdentity = runtime.createIdentity();
    const logicalClock = { epochMs: NOW_EPOCH_SECONDS * 1000, idleDelayMs: IDLE_TIMEOUT_MS };
    seller = await startNode(runtime, origin, report, 'G06 seller A', [r1], { secretHex: sellerIdentity.secretHex, bridge: false, logicalClock });
    buyer = await startNode(runtime, origin, report, 'G06 buyer B', [r2], { secretHex: buyerIdentity.secretHex, bridge: false, logicalClock });
    assert.equal(seller.id.pubkey, sellerIdentity.pubkey);
    assert.equal(buyer.id.pubkey, buyerIdentity.pubkey);
    bridge = await startNode(runtime, origin, report, 'G06 public relay bridge', allRelayUrls, { logicalClock });
    nodes.set('seller', seller); nodes.set('buyer', buyer); nodes.set('bridge', bridge);
    report.identities = { seller_pubkey: seller.id.pubkey, buyer_pubkey: buyer.id.pubkey, bridge_pubkey: bridge.id.pubkey };

    activeCase = 'G06-01';
    activeStep = 'publish and discover Hangout post';
    await buyer.page.locator('button[data-view="hangout"]').click();
    await buyer.page.locator('#hangout-list .empty-state').waitFor({ state: 'visible', timeout: 12000 });
    assert.equal(await buyer.page.locator('#hangout-list .hangout-card').count(), 0, 'an empty Hangout feed is represented as an empty state');
    report.hangout.empty_feed_state = true;
    const hangoutText = `property-g06-public-${crypto.randomUUID()}`;
    await seller.page.locator('button[data-view="hangout"]').click();
    await seller.page.locator('#hangout-text').fill(hangoutText);
    await seller.page.locator('#publish-hangout').click();
    await waitUntil(async () => (await wsQuery(r1, { kinds: [1], authors: [seller.id.pubkey], limit: 50 }))
      .some(event => event.content === hangoutText), 12000, 'seller Hangout event was not stored at R1');
    const hangoutEvent = (await wsQuery(r1, { kinds: [1], authors: [seller.id.pubkey], limit: 50 }))
      .find(event => event.content === hangoutText);
    assert.ok(hangoutEvent && runtime.verifyEvent(hangoutEvent));
    await waitStored(r2, hangoutEvent.id, true);
    await buyer.page.locator('button[data-view="hangout"]').click();
    await buyer.page.waitForFunction(text => [...document.querySelectorAll('#hangout-list .hangout-card')]
      .some(card => card.textContent.includes(text)), hangoutText, { timeout: 15000 });
    const hangoutCard = buyer.page.locator('#hangout-list .hangout-card').filter({ hasText: hangoutText });
    assert.equal(await hangoutCard.count(), 1);
    assert.ok((await hangoutCard.locator('h3').textContent()).endsWith(seller.id.npub.slice(-8)), 'UI shows the event author identity');
    await hangoutCard.getByRole('button', { name: /Contact privately|Conversar em privado/i }).click();
    await buyer.page.waitForFunction(() => Boolean(document.querySelector('#chat-subtitle')?.textContent), null, { timeout: 8000 });
    assert.equal((await buyer.page.locator('#chat-subtitle').textContent()).trim(), seller.id.npub,
      'Hangout contact action opens a conversation for the author, not a room or public feed');
    assert.ok(await buyer.page.locator('#hangout-list').textContent().then(value => value.includes(hangoutText)), 'public post remains visibly in the public feed');
    assert.equal((await wsQuery(r2, { ids: [hangoutEvent.id], limit: 2 })).length, 1, 'relay copy retains the same event ID');
    report.hangout = { ...report.hangout, event_id: hangoutEvent.id, author: hangoutEvent.pubkey, R1_signature_valid: runtime.verifyEvent(hangoutEvent),
      R5_copy_same_id: true, public_feed_label_visible: true, contact_target_npub: seller.id.npub, private_room_created: false };
    mark('G06-01', 'PASS', 'A signed public kind-1 post traversed five actual Geode relays through the PWA bridge. Buyer B saw the author, and the contact action selected that author in private-message navigation while the post remained public; an empty-feed state was also checked.');

    activeCase = 'G06-02';
    activeStep = 'publish, discover, and edit BTC/XMR/XNO offers';
    await seller.page.locator('button[data-view="marketplace"]').click();
    const offers = [
      { currency: 'BTC', unit: 'satoshi', one: '0.00000001', two: '0.00000002', title: `G06 one sat ${crypto.randomUUID()}` },
      { currency: 'XMR', unit: 'piconero', one: '0.000000000001', two: '0.000000000002', title: `G06 one piconero ${crypto.randomUUID()}` },
      { currency: 'XNO', unit: 'raw', one: `0.${'0'.repeat(29)}1`, two: `0.${'0'.repeat(29)}2`, title: `G06 one raw ${crypto.randomUUID()}` }
    ];
    const offerEvidence = [];
    for (const offer of offers) {
      await publishFromUi(seller, { name: offer.title, currency: offer.currency, amount: offer.one });
      await untilValue(async () => (await productEvents(r1, seller.id.pubkey)).some(event => {
        try { return JSON.parse(event.content).name === offer.title; } catch { return false; }
      }), 10_000, 'first listing did not appear');
      const initialEvents = await productEvents(r1, seller.id.pubkey);
      const initialEvent = initialEvents.find(event => { try { return JSON.parse(event.content).name === offer.title; } catch { return false; } });
      assert.ok(initialEvent && runtime.verifyEvent(initialEvent), `${offer.currency} listing signature is valid`);
      const initialData = JSON.parse(initialEvent.content);
      assert.equal(initialData.price_atomic, '1', `${offer.currency} stores one atomic unit as a decimal string`);
      if (offer.currency === 'XNO') assert.equal(initialData.price_raw, '1', 'XNO raw remains an exact integer string');
      const d = initialEvent.tags.find(tag => tag[0] === 'd')?.[1];
      assert.equal(initialData.id, d, 'listing content ID matches its addressable d tag');
      await waitStored(r2, initialEvent.id, true);
      await buyer.page.locator('button[data-view="marketplace"]').click();
      await refreshProductFor(buyer, offer.title);
      const initialCard = buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offer.title });
      const expectedOne = offer.currency === 'BTC' ? '0.00000001 BTC' : offer.currency === 'XMR' ? '0.000000000001 XMR' : `${offer.one} XNO`;
      assert.equal((await initialCard.locator('.product-price').textContent()).trim(), expectedOne);

      await seller.page.evaluate(({ repetitions, stepMs }) => window.__propertyTestClock.advance(repetitions, stepMs),
        { repetitions: 2, stepMs: LOGICAL_CLOCK_STEP_MS });
      await seller.page.locator('#refresh-marketplace').click();
      const ownCard = seller.page.locator('#marketplace-list .product-card').filter({ hasText: offer.title });
      await ownCard.getByRole('button', { name: /Edit|Editar/i }).click();
      await seller.page.locator('#product-price').fill(offer.two);
      await seller.page.locator('#publish-product').click();
      await seller.page.locator('#product-dialog').waitFor({ state: 'hidden', timeout: 15000 });
      const updated = await untilValue(async () => {
        const candidate = await latestProduct(r1, seller.id.pubkey, d);
        return candidate?.data.price_atomic === '2' ? candidate : null;
      }, 12000, `updated ${offer.currency} listing was not stored`);
      assert.equal(updated.data.currency, offer.currency);
      assert.equal(updated.data.id, d);
      assert.equal(updated.event.tags.find(tag => tag[0] === 'd')?.[1], d);
      assert.ok(runtime.verifyEvent(updated.event));
      await waitStored(r2, updated.event.id, true);
      await refreshProductFor(buyer, offer.title);
      const updatedCard = buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offer.title });
      const expectedTwo = offer.currency === 'BTC' ? '0.00000002 BTC' : offer.currency === 'XMR' ? '0.000000000002 XMR' : `${offer.two} XNO`;
      assert.equal((await updatedCard.locator('.product-price').textContent()).trim(), expectedTwo);
      offerEvidence.push({ currency: offer.currency, unit: offer.unit, initial_atomic: initialData.price_atomic,
        updated_atomic: updated.data.price_atomic, product_d: d, initial_event_id: initialEvent.id, updated_event_id: updated.event.id,
        seller_signature_valid: runtime.verifyEvent(updated.event), R5_copy: true, initial_ui_price: expectedOne, updated_ui_price: expectedTwo });
    }
    const bounds = await seller.page.evaluate(() => Object.fromEntries(Object.entries(PropertyMoney.CURRENCIES).map(([currency, spec]) => {
      const maxAccepted = PropertyMoney.validateAtomic(spec.max, currency);
      let overMaxRejected = false;
      try { PropertyMoney.validateAtomic((BigInt(spec.max) + 1n).toString(), currency); } catch { overMaxRejected = true; }
      return [currency, { max_accepted: maxAccepted, over_max_rejected: overMaxRejected }];
    })));
    assert.ok(Object.values(bounds).every(item => item.over_max_rejected));
    report.marketplace = { offers: offerEvidence, currency_atomic_bounds: bounds, amount_representation: 'decimal integer strings; no float used for atomic values' };
    mark('G06-02', 'PASS', 'The browser published, discovered, and edited one satoshi, one piconero, and one raw through an actual five-relay Geode bridge. Exact atomic strings, event authorship, stable d tags, signatures, and rendered prices survived each round-trip; currency maxima and overflow were checked.');

    activeCase = 'G06-03';
    activeStep = 'seller withdrawal and stale-copy rejection';
    const btc = offerEvidence.find(item => item.currency === 'BTC');
    const xmr = offerEvidence.find(item => item.currency === 'XMR');
    const btcLatest = await latestProduct(r1, seller.id.pubkey, btc.product_d);
    await seller.page.locator('#refresh-marketplace').click();
    const btcCard = seller.page.locator('#marketplace-list .product-card').filter({ hasText: offers[0].title });
    await btcCard.getByRole('button', { name: /Withdraw offer|Retirar oferta/i }).click();
    await seller.page.locator('#delete-product-dialog').waitFor({ state: 'visible' });
    await seller.page.locator('#confirm-delete-product').click();
    await seller.page.locator('#delete-product-dialog').waitFor({ state: 'hidden', timeout: 15000 });
    const deletionEvents = await wsQuery(r1, { kinds: [5], authors: [seller.id.pubkey], limit: 50 });
    const deletion = deletionEvents.find(event => event.tags.some(tag => tag[0] === 'a' && tag[1] === `30018:${seller.id.pubkey}:${btc.product_d}`));
    assert.ok(deletion && runtime.verifyEvent(deletion), 'seller signed an addressable withdrawal event');
    assert.ok(deletion.created_at >= btcLatest.event.created_at);
    await waitStored(r2, btcLatest.event.id, false);
    const replayAck = await publishEvent(r2, btcLatest.event);
    await waitStored(r2, btcLatest.event.id, false);
    const relayProductsAfterDelete = await productEvents(r2, seller.id.pubkey);
    const activeNamesAfterDelete = await buyer.page.evaluate(events => PropertyMarketplace.selectActiveProducts(events, NostrTools.verifyEvent)
      .map(product => product.data.name), relayProductsAfterDelete);
    report.deletion = { seller_signed_withdrawal_id: deletion.id, seller_withdrawal_signature_valid: runtime.verifyEvent(deletion),
      old_copy_replayed_to_R5_after_tombstone: true, tombstone_removed_prior_copy: true,
      replay_ack: replayAck, relay_product_copies_after_withdrawal: relayProductsAfterDelete.map(event => {
        try { return { id: event.id, d: event.tags.find(tag => tag[0] === 'd')?.[1], name: JSON.parse(event.content).name }; } catch { return { id: event.id }; }
      }), active_names_after_withdrawal: activeNamesAfterDelete };
    assert.ok(activeNamesAfterDelete.includes(offers[1].title), 'withdrawing one product must preserve the seller\'s other offers');
    activeStep = 'render XMR after BTC withdrawal';
    await refreshProductFor(buyer, offers[1].title);
    assert.equal(await buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offers[0].title }).count(), 0,
      'republishing the older product copy after its NIP-09 request does not resurrect it');

    activeStep = 'reject unauthorized deletion';
    const xmrLatest = await latestProduct(r1, seller.id.pubkey, xmr.product_d);
    const address = `30018:${seller.id.pubkey}:${xmr.product_d}`;
    const unauthorized = runtime.sign(5, '', xmrLatest.event.created_at + 1,
      buyerIdentity.secret, [['a', address], ['e', xmrLatest.event.id], ['k', '30018']]);
    assert.equal((await publishEvent(r2, unauthorized)).accepted, true, 'relay accepted the validly signed unauthorized deletion fixture');
    await refreshProductFor(buyer, offers[1].title);
    assert.equal(await buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offers[1].title }).count(), 1,
      'another author cannot withdraw the seller listing');
    activeStep = 'reject earlier-timestamp deletion';
    const earlyDeletion = runtime.sign(5, '', Math.max(0, xmrLatest.event.created_at - 1), sellerIdentity.secret,
      [['a', address], ['e', xmrLatest.event.id], ['k', '30018']]);
    const survivesInvalidTimestamp = await buyer.page.evaluate(({ product, deletionEvent }) =>
      PropertyMarketplace.selectActiveProducts([product, deletionEvent], NostrTools.verifyEvent)
        .some(active => active.id === product.id), { product: xmrLatest.event, deletionEvent: earlyDeletion });
    assert.equal(survivesInvalidTimestamp, true, 'client reducer ignores a deletion older than its product version');
    assert.equal(await buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offers[1].title }).count(), 1,
      'the live relay offer stays visible after local evaluation of the invalid timestamp fixture');
    report.deletion = { ...report.deletion, old_copy_did_not_resurrect: true, unauthorized_deletion_id: unauthorized.id,
      unauthorized_author_could_not_withdraw: true, earlier_timestamp_deletion_fixture_id: earlyDeletion.id,
      client_ignored_older_deletion_timestamp: true, relay_unmodified_by_older_deletion_fixture: true };
    mark('G06-03', 'PASS', 'Seller withdrawal hid the offer even after the older signed event was replayed to R5. Geode rejected reinsertion under its deletion tombstone. Another author could not remove an offer; the client reducer ignored an older deletion timestamp without sending that fixture to the relay.');

    activeCase = 'G06-04';
    activeStep = 'filter malicious, expired, malformed, and unsupported listings';
    const maliciousHtml = '<img src="https://tracker.invalid/pixel" onerror="window.__propertyG06Pwned=1"><script>window.__propertyG06Pwned=2</script>';
    const safeId = `g06-safe-${crypto.randomUUID()}`;
    const safeFixture = runtime.sign(30018, JSON.stringify({ id: safeId, stall_id: 'g06-security', name: `G06 safe text ${safeId}`,
      description: maliciousHtml, images: ['http://127.0.0.1:9/tracker.svg'], currency: 'BTC', price: 0.00000001, price_atomic: '1' }),
      NOW_EPOCH_SECONDS, sellerIdentity.secret, [['d', safeId]]);
    const now = NOW_EPOCH_SECONDS;
    const expiredId = `g06-expired-${crypto.randomUUID()}`;
    const expiredFixture = runtime.sign(30018, JSON.stringify({ id: expiredId, stall_id: 'g06-security', name: `G06 expired ${expiredId}`,
      description: '', images: [], currency: 'BTC', price: 0.00000001, price_atomic: '1' }), now, sellerIdentity.secret,
      [['d', expiredId], ['expiration', String(now - 1)]]);
    const unknownId = `g06-unknown-${crypto.randomUUID()}`;
    const unknownFixture = runtime.sign(30018, JSON.stringify({ id: unknownId, stall_id: 'g06-security', name: `G06 unknown ${unknownId}`,
      description: '', images: [], currency: 'USD', price: 1, price_atomic: '1' }), now, sellerIdentity.secret, [['d', unknownId]]);
    const malformedId = `g06-malformed-${crypto.randomUUID()}`;
    const malformedFixture = runtime.sign(30018, '{malformed', now, sellerIdentity.secret, [['d', malformedId]]);
    const duplicateDId = `g06-duplicate-d-${crypto.randomUUID()}`;
    const duplicateDFixture = runtime.sign(30018, JSON.stringify({ id: duplicateDId, stall_id: 'g06-security', name: `G06 duplicate d ${duplicateDId}`,
      description: '', images: [], currency: 'BTC', price: 0.00000001, price_atomic: '1' }), now, sellerIdentity.secret,
      [['d', duplicateDId], ['d', `${duplicateDId}-other`]]);
    const futureId = `g06-future-${crypto.randomUUID()}`;
    const futureFixture = runtime.sign(30018, JSON.stringify({ id: futureId, stall_id: 'g06-security', name: `G06 future timestamp ${futureId}`,
      description: '', images: [], currency: 'BTC', price: 0.00000001, price_atomic: '1' }), now + 301, sellerIdentity.secret, [['d', futureId]]);
    const fixtures = [safeFixture, unknownFixture, malformedFixture, duplicateDFixture];
    const fixtureAcks = [];
    for (const event of fixtures) {
      const ack = await publishEvent(r2, event);
      fixtureAcks.push({ id: event.id, accepted: ack.accepted, message: ack.message });
      assert.equal(ack.accepted, true, `relay rejected signed case fixture ${event.id}: ${ack.message}`);
    }
    const timeFixtureAcks = [];
    for (const event of [expiredFixture, futureFixture]) {
      const ack = await publishEvent(r2, event);
      timeFixtureAcks.push({ id: event.id, accepted: ack.accepted, message: ack.message });
      if (ack.accepted) await waitStored(r2, event.id, true);
    }
    const relayFixtures = await productEvents(r2, seller.id.pubkey);
    const activeWithTimeFixtures = await buyer.page.evaluate(({ events, invalidTimes }) =>
      PropertyMarketplace.selectActiveProducts([...events, ...invalidTimes], NostrTools.verifyEvent).map(product => product.id),
      { events: relayFixtures, invalidTimes: [expiredFixture, futureFixture] });
    assert.equal(activeWithTimeFixtures.includes(expiredFixture.id), false, 'client reducer rejects an expired event');
    assert.equal(activeWithTimeFixtures.includes(futureFixture.id), false, 'client reducer rejects a future timestamp fixture');
    await buyer.page.locator('#refresh-marketplace').click();
    const safeCard = buyer.page.locator('#marketplace-list .product-card').filter({ hasText: `G06 safe text ${safeId}` });
    await safeCard.waitFor({ state: 'visible', timeout: 12000 });
    assert.ok((await safeCard.textContent()).includes(maliciousHtml), 'untrusted description remains literal text');
    assert.equal(await safeCard.locator('img, script').count(), 0, 'untrusted HTML did not create executable or fetching elements');
    assert.equal(await safeCard.locator('a').count(), 0, 'unsafe image URL did not become a link');
    assert.equal(await buyer.page.evaluate(() => window.__propertyG06Pwned), undefined);
    for (const id of [expiredId, unknownId, malformedId, duplicateDId, futureId]) {
      const name = id === expiredId ? `G06 expired ${id}` : id === unknownId ? `G06 unknown ${id}` : id === malformedId ? '' :
        id === duplicateDId ? `G06 duplicate d ${id}` : `G06 future timestamp ${id}`;
      if (name) assert.equal(await buyer.page.locator('#marketplace-list .product-card').filter({ hasText: name }).count(), 0,
        `${id} is not rendered as a valid active offer`);
    }
    report.security.time_fixture_relay_acks = timeFixtureAcks;
    report.security.fixture_relay_acks = fixtureAcks;

    const invalidInputs = [
      { name: `G06 invalid precision ${crypto.randomUUID()}`, currency: 'BTC', amount: '0.000000001' },
      { name: `G06 overflow ${crypto.randomUUID()}`, currency: 'XMR', amount: '18446744.073709551616' },
      { name: `G06 unknown currency ${crypto.randomUUID()}`, currency: 'USD', amount: '1', addCurrency: true }
    ];
    for (const invalid of invalidInputs) {
      activeStep = `block invalid ${invalid.currency} form input`;
      await seller.page.locator('button[data-view="marketplace"]').click();
      await seller.page.locator('#publish-product-button').click();
      await seller.page.locator('#product-dialog').waitFor({ state: 'visible' });
      if (invalid.addCurrency) await seller.page.evaluate(() => {
        const select = document.querySelector('#product-currency');
        if (![...select.options].some(option => option.value === 'USD')) select.add(new Option('USD · unsupported', 'USD'));
      });
      await seller.page.locator('#product-name').fill(invalid.name);
      await seller.page.locator('#product-description').fill('invalid case');
      await seller.page.locator('#product-currency').selectOption(invalid.currency);
      await seller.page.locator('#product-price').fill(invalid.amount);
      await seller.page.locator('#publish-product').click();
      await seller.page.waitForFunction(() => Boolean(document.querySelector('#product-error')?.textContent.trim()), null, { timeout: 8000 });
      assert.equal(await seller.page.locator('#product-dialog').isVisible(), true, 'invalid offer stays in the form for correction');
      assert.equal((await productEvents(r1, seller.id.pubkey)).some(event => { try { return JSON.parse(event.content).name === invalid.name; } catch { return false; } }), false,
        'invalid offer is not published to a relay');
      await closeProductDialog(seller);
    }
    const safeUrl = await seller.page.evaluate(() => PropertyMarketplace.safeExternalImageUrl('http://127.0.0.1:9/tracker.svg'));
    assert.equal(safeUrl, '');
    report.security = { ...report.security, expired_event_rejected_by_expiration_tag: true, future_timestamp_hidden: true, unknown_currency_hidden: true, malformed_content_hidden: true,
      duplicate_address_tag_hidden: true, unsafe_http_image_not_linked_or_loaded: true, injected_html_rendered_as_text: true,
      script_execution: false, unsupported_currency_submission_blocked: true, excess_precision_submission_blocked: true,
      overflow_submission_blocked: true, invalid_submissions_published: false };
    mark('G06-04', 'PASS', 'Expired and future-timestamp, unknown-currency, malformed, and ambiguous-address listings were filtered. The browser blocked excess precision, overflow, and unsupported-currency submissions; unsafe image URLs were not linked or fetched, and injected markup remained literal text.');

    activeCase = 'G06-05';
    activeStep = 'contact correct seller without checkout/payment events';
    const buyerBefore = await wsQuery(r2, { kinds: [1, 5, 7, 14, 1059, 30017, 30018, 30019, 30078, 9734, 23194], limit: 300 });
    await buyer.page.locator('button[data-view="marketplace"]').click();
    await refreshProductFor(buyer, offers[1].title);
    const selectedCard = buyer.page.locator('#marketplace-list .product-card').filter({ hasText: offers[1].title });
    const displayedBeforeContact = (await selectedCard.textContent()).trim();
    assert.ok(displayedBeforeContact.includes('0.000000000002 XMR'));
    await selectedCard.getByRole('button', { name: /Contact(?: the)? seller|Falar com vendedor/i }).click();
    await buyer.page.waitForFunction(() => Boolean(document.querySelector('#chat-subtitle')?.textContent), null, { timeout: 8000 });
    assert.equal((await buyer.page.locator('#chat-subtitle').textContent()).trim(), seller.id.npub, 'marketplace contact targets the listing author');
    assert.ok((await selectedCard.textContent()).includes('0.000000000002 XMR'), 'displayed price and offer terms remain intact');
    assert.equal(await buyer.page.locator('#marketplace-view').getByRole('button', { name: /checkout|pagar|comprar agora|custódia/i }).count(), 0,
      'marketplace contact does not create a checkout or payment control');
    const finePrint = (await seller.page.locator('#product-dialog .fine-print').textContent()).trim();
    assert.match(finePrint, /draft/i); assert.match(finePrint, /não processa pagamentos|does not process payments/i);
    assert.match(finePrint, /provide custody|nem oferece custódia/i);
    const buyerAfter = await wsQuery(r2, { kinds: [1, 5, 7, 14, 1059, 30017, 30018, 30019, 30078, 9734, 23194], limit: 300 });
    assert.deepEqual(buyerAfter.map(event => event.id).sort(), buyerBefore.map(event => event.id).sort(),
      'contact initiation does not publish a checkout, payment, or private-message event');
    report.contact = { target_pubkey: seller.id.pubkey, target_npub: seller.id.npub, offer_price_preserved: true,
      event_ids_before_and_after_equal: true, checkout_or_payment_event_created: false, private_message_sent: false,
      nip15_draft_notice: finePrint };
    mark('G06-05', 'PASS', 'Contact from the marketplace opened the correct seller conversation target without changing the displayed offer, publishing any payment/checkout/private-message event, or exposing a checkout control. The UI identifies NIP-15 as draft and states that payments/custody are not handled.');

    activeCase = 'G06-06';
    activeStep = 'versioned-offer lifecycle through all five real relays';
    // Keep the bridge quota intact. The lifecycle fixture contains 121 events,
    // so publish each signed event directly to every isolated test relay.
    await disableNode(bridge);
    const lifecycleStart = NOW_EPOCH_SECONDS;
    const lifecycle = { created: 0, edited: 0, withdrawn: 0, expired: 0, offers_by_currency: {}, event_ids: [], deletion_ids_by_offer: {} };
    async function createLifecycleProduct({ id, currency, atomic, createdAt, expiresAt = null, name }) {
      const input = { id, stallId: `g6-lifecycle-${currency}`, name, terms: `Deterministic terms for ${name}`,
        offerType: 'item', images: [], currency, atomic, sellerPubkey: seller.id.pubkey,
        paymentRail: currency === 'BTC' ? 'bitcoin-onchain' : currency === 'XMR' ? 'monero-onchain' : 'nano-direct',
        relayHints: [], expiresAt };
      const content = await seller.page.evaluate(value => PropertyProtocol.canonicalJson(PropertyMarketplace.makeOfferData(value)), input);
      const tags = [['d', id]];
      if (expiresAt !== null) tags.push(['expiration', String(expiresAt)]);
      return runtime.sign(30018, content, createdAt, sellerIdentity.secret, tags);
    }
    const lifecycleBases = new Map();
    for (const currency of ['BTC', 'XMR', 'XNO']) {
      lifecycle.offers_by_currency[currency] = { created: 20, edited: 10, withdrawn: 10, expired: 10 };
      for (let index = 0; index < 20; index++) {
        const id = `g6-lifecycle-${currency}-${String(index).padStart(2, '0')}`;
        const expiresAt = index >= 10 ? lifecycleStart + 100 : null;
        const event = await createLifecycleProduct({ id, currency, atomic: '1', createdAt: lifecycleStart + index,
          expiresAt, name: id });
        await publishToFiveRelays(event);
        lifecycleBases.set(id, event); lifecycle.event_ids.push(event.id); lifecycle.created++;
        if (expiresAt !== null) lifecycle.expired++;
      }
    }
    const lifecycleEdits = new Map();
    for (const currency of ['BTC', 'XMR', 'XNO']) for (let index = 0; index < 10; index++) {
      const id = `g6-lifecycle-${currency}-${String(index).padStart(2, '0')}`;
      const edit = await createLifecycleProduct({ id, currency, atomic: '2', createdAt: lifecycleStart + 15 + index,
        name: `${id}-edited` });
      await publishToFiveRelays(edit);
      lifecycleEdits.set(id, edit); lifecycle.event_ids.push(edit.id); lifecycle.edited++;
    }
    for (const currency of ['BTC', 'XMR', 'XNO']) for (let index = 0; index < 10; index++) {
      const id = `g6-lifecycle-${currency}-${String(index).padStart(2, '0')}`;
      const edit = lifecycleEdits.get(id);
      const request = await seller.page.evaluate(value => PropertyMarketplace.makeProductDeletion(value), edit);
      const deletion = runtime.sign(request.kind, request.content, lifecycleStart + 30 + index, sellerIdentity.secret, request.tags);
      await publishToFiveRelays(deletion);
      lifecycle.event_ids.push(deletion.id); lifecycle.deletion_ids_by_offer[id] = { deletion_id: deletion.id, edited_event_id: edit.id };
      lifecycle.withdrawn++;
    }
    const unrelatedLifecycleOffer = await createLifecycleProduct({ id: 'g6-lifecycle-unrelated', currency: 'BTC', atomic: '3',
      createdAt: lifecycleStart + 2, name: 'g6-lifecycle-unrelated' });
    await publishToFiveRelays(unrelatedLifecycleOffer);
    lifecycle.event_ids.push(unrelatedLifecycleOffer.id);
    for (const relayUrl of allRelayUrls) {
      // NIP-33 replaces old address versions and NIP-09 tombstones hide withdrawn
      // products, so convergence is judged on current heads plus signed delete
      // records, never by requiring every superseded payload to remain queryable.
      const rows = await wsQuery(relayUrl, { kinds: [30018, 5], authors: [seller.id.pubkey], limit: 500 });
      const deletionRows = rows.filter(event => event.kind === 5);
      const expectedWithdrawnIds = Object.keys(lifecycle.deletion_ids_by_offer).sort();
      const observedWithdrawnIds = deletionRows.flatMap(event => {
        const address = event.tags.find(tag => tag[0] === 'a')?.[1] || '';
        return expectedWithdrawnIds.filter(id => address === `30018:${seller.id.pubkey}:${id}`);
      }).sort();
      assert.deepEqual(observedWithdrawnIds, expectedWithdrawnIds, `${relayUrl} serves all 30 signed withdrawal tombstones`);
      for (const id of expectedWithdrawnIds) {
        const expected = lifecycle.deletion_ids_by_offer[id];
        const deletion = deletionRows.find(event => event.id === expected.deletion_id);
        assert.ok(deletion && runtime.verifyEvent(deletion), `${relayUrl} serves the signed withdrawal for ${id}`);
        assert.ok(deletion.tags.some(tag => tag[0] === 'e' && tag[1] === expected.edited_event_id), `${relayUrl} tombstone references the latest edited event for ${id}`);
      }
      const reduceAt = now => buyer.page.evaluate(({ events, at }) => PropertyMarketplace.selectActiveProducts(events, NostrTools.verifyEvent, at)
        .map(product => ({ id: product.data.id, atomic: product.data.price_atomic })).filter(product => product.id.startsWith('g6-lifecycle-'))
        .sort((a, b) => a.id.localeCompare(b.id)), { events: rows, at: now });
      const beforeExpiryRows = await reduceAt(lifecycleStart + 40);
      const expectedBeforeExpiry = ['g6-lifecycle-unrelated', ...['BTC', 'XMR', 'XNO'].flatMap(currency =>
        Array.from({ length: 10 }, (_, offset) => `g6-lifecycle-${currency}-${String(offset + 10).padStart(2, '0')}`))]
        .sort((a, b) => a.localeCompare(b));
      assert.deepEqual(beforeExpiryRows.map(item => item.id), expectedBeforeExpiry,
        `${relayUrl} exposes the 30 non-withdrawn, non-expired current offers plus unrelated control`);
      assert.ok(beforeExpiryRows.filter(item => item.id !== 'g6-lifecycle-unrelated').every(item => item.atomic === '1'),
        `${relayUrl} serves the expected current version of each retained replaceable offer`);
      const afterExpiryRows = await reduceAt(lifecycleStart + 101);
      assert.deepEqual(afterExpiryRows.map(item => item.id), ['g6-lifecycle-unrelated'],
        `${relayUrl} expires only the tagged offers and preserves unrelated events`);
      lifecycle[`relay_${allRelayUrls.indexOf(relayUrl) + 1}`] = { queried_current_events: rows.length,
        deletion_tombstones: deletionRows.length, signed_withdrawals_verified: expectedWithdrawnIds.length,
        active_before_expiry: beforeExpiryRows.length, active_after_expiry: afterExpiryRows.length,
        current_heads_and_tombstones_agree: true, signature_checked_by_client_reducer: true };
    }
    report.marketplace = { ...report.marketplace, five_relay_lifecycle: lifecycle,
      amounts_per_currency: lifecycle.offers_by_currency };
    mark('G06-06', 'PASS', 'Published 20 synthetic offers per currency, edited 10, withdrew 10 and expired 10 per currency. Each of five local Geode relays served the same current replaceable heads, all 30 signed withdrawal tombstones, and identical active state before and after the logical expiry boundary. Superseded/deleted payloads were not incorrectly required to remain queryable. Bridge coverage passed earlier; this larger fixed-count batch bypassed its explicit forwarding quota.');

    activeCase = 'G06-07';
    activeStep = '50 Hangout journeys: author, duplicate, relay change, private contact, empty and malformed posts';
    const hangoutAuthors = Array.from({ length: 10 }, () => runtime.createIdentity());
    const hangoutPosts = [];
    for (let index = 0; index < 50; index++) {
      const identity = hangoutAuthors[index % hangoutAuthors.length];
      const content = index === 0
        ? `<img src="https://tracker.invalid/hangout" onerror="window.__g6HangoutPwned=1"> G06 journey ${index}`
        : `G06 Hangout fixed journey ${String(index).padStart(2, '0')}`;
      const event = runtime.sign(1, content, NOW_EPOCH_SECONDS + 100 + index, identity.secret, []);
      assert.ok(runtime.verifyEvent(event));
      await publishToFiveRelays(event);
      hangoutPosts.push(event);
    }
    const hostileLocalEvents = [
      { ...hangoutPosts[0], content: `${hangoutPosts[0].content} changed after signing` },
      runtime.sign(1, 'x'.repeat(16385), NOW_EPOCH_SECONDS + 160, hangoutAuthors[0].secret, []),
      runtime.sign(1, 'future G6 Hangout post', NOW_EPOCH_SECONDS + 301, hangoutAuthors[0].secret, [])
    ];
    const malformedRejected = await buyer.page.evaluate(({ events, now }) => events.every(event => {
      try { PropertyProtocol.validateEventFamily(event, 'public_note', NostrTools.verifyEvent, now); return false; }
      catch { return true; }
    }), { events: hostileLocalEvents, now: NOW_EPOCH_SECONDS });
    assert.equal(malformedRejected, true, 'tampered signature, oversized post, and future-dated post fail closed locally');
    for (const relayUrl of allRelayUrls) {
      const relayPosts = await untilValue(async () => {
        const events = await wsQuery(relayUrl, { kinds: [1], authors: hangoutAuthors.map(identity => identity.pubkey), limit: 100 });
        return hangoutPosts.every(post => events.some(event => event.id === post.id)) ? events : null;
      }, 30000, `Hangout events did not converge to ${relayUrl}`);
      const matching = relayPosts.filter(event => hangoutPosts.some(post => post.id === event.id));
      assert.equal(new Set(matching.map(event => event.id)).size, 50, `duplicate relay copies deduplicate at ${relayUrl}`);
      assert.ok(matching.every(event => runtime.verifyEvent(event)), `all displayed Hangout authors are signed at ${relayUrl}`);
    }
    await setGeneralRelays(buyer, allRelayUrls);
    for (let index = 0; index < 50; index++) {
      if (index === 25) {
        await setGeneralRelays(buyer, [relays[3].url]);
      }
      const locale = index < 25 ? 'en' : 'pt-BR';
      await buyer.page.locator('#language-picker').selectOption(locale);
      if (index === 0) {
        await buyer.page.locator('button[data-view="hangout"]').click();
        await buyer.page.locator('#hangout-list .hangout-card').first().waitFor({ state: 'visible', timeout: 15000 });
        assert.equal(await buyer.page.locator('#hangout-list .hangout-card').count(), 50, 'Hangout UI deduplicates the same 50 events returned by five relays');
        const hostileCard = buyer.page.locator(`#hangout-list .hangout-card[data-event-id="${hangoutPosts[0].id}"]`);
        await hostileCard.waitFor({ state: 'visible' });
        assert.equal(await hostileCard.locator('img,script').count(), 0, 'untrusted Hangout markup remains plain text');
        assert.equal(await buyer.page.evaluate(() => window.__g6HangoutPwned), undefined);
      }
      if (index === 25) {
        await buyer.page.locator('#refresh-hangout').click();
        await buyer.page.waitForFunction(() => document.querySelectorAll('#hangout-list .hangout-card').length === 50, null, { timeout: 15000 });
      }
      const post = hangoutPosts[index];
      const card = buyer.page.locator(`#hangout-list .hangout-card[data-event-id="${post.id}"]`);
      await card.waitFor({ state: 'visible', timeout: 15000 });
      const expectedSuffix = await buyer.page.evaluate(pubkey => NostrTools.nip19.npubEncode(pubkey).slice(-8), post.pubkey);
      assert.ok((await card.locator('h3').textContent()).endsWith(expectedSuffix), `journey ${index} exposes the matching signed author key`);
      const expectedNpub = await buyer.page.evaluate(pubkey => NostrTools.nip19.npubEncode(pubkey), post.pubkey);
      const buttonName = locale === 'en' ? /Contact privately/i : /Conversar em privado/i;
      await card.getByRole('button', { name: buttonName }).click();
      await buyer.page.waitForFunction(expected => document.querySelector('#chat-subtitle')?.textContent.trim() === expected,
        expectedNpub, { timeout: 8000 });
      assert.equal((await buyer.page.locator('#chat-subtitle').textContent()).trim(), expectedNpub, `journey ${index} opens a private conversation with the signed author`);
      await buyer.page.locator('button[data-view="hangout"]').click();
      await card.waitFor({ state: 'visible', timeout: 15000 });
    }
    const privateEventsAfterHangout = await wsQuery(relays[3].url, { kinds: [14, 1059], authors: [buyer.id.pubkey], limit: 200 });
    assert.equal(privateEventsAfterHangout.length, 0, 'opening 50 author conversations does not publish messages');
    report.hangout = { ...report.hangout, fixed_journeys: 50, language_journeys: { en: 25, 'pt-BR': 25 },
      verified_authors: 50, unique_events_after_five_relay_dedupe: 50, relay_change: { from: r2, to: relays[3].url },
      direct_message_targets_selected: 50, messages_sent: 0, empty_feed_state_checked: true,
      hostile_markup_rendered_as_text: true, malformed_signature_size_and_timestamp_fixtures_rejected: malformedRejected,
      five_relays_converged: true };
    mark('G06-07', 'PASS', 'Completed 50 PWA Hangout journeys against signed authors. Duplicate copies from five relays rendered once; the buyer changed from R5 to R4, direct-contact navigation selected the post author without sending a message, and malformed local fixtures failed closed. English and pt-BR each covered 25 journeys.');

    activeCase = 'G06-08';
    activeStep = '50 marketplace browser journeys across both languages';
    await setGeneralRelays(seller, allRelayUrls);
    const marketplaceJourneys = [];
    const amountByCurrency = { BTC: '0.00000001', XMR: '0.000000000001', XNO: `0.${'0'.repeat(29)}1` };
    const currencyCycle = ['BTC', 'XMR', 'XNO'];
    for (let index = 0; index < 50; index++) {
      const locale = index < 25 ? 'en' : 'pt-BR';
      const localeIndex = index % 25;
      const currency = currencyCycle[localeIndex % currencyCycle.length];
      const title = `G06 ${locale} browse contact withdraw ${String(index).padStart(2, '0')} ${crypto.randomUUID()}`;
      await seller.page.locator('#language-picker').selectOption(locale);
      await buyer.page.locator('#language-picker').selectOption(locale);
      await seller.page.locator('button[data-view="marketplace"]').click();
      await publishFromUi(seller, { name: title, currency, amount: amountByCurrency[currency],
        description: 'Public offer terms; contact opens a private chat.', offerType: index % 2 ? 'service' : 'item',
        expiry: index % 4 === 0 ? '86400' : 'never' });
      const published = await untilValue(async () => {
        const events = await productEvents(r1, seller.id.pubkey);
        const event = events.find(candidate => { try { return JSON.parse(candidate.content).name === title; } catch { return false; } });
        return event ? { event, data: JSON.parse(event.content) } : null;
      }, 12000, `browser journey ${index} offer did not publish`);
      assert.equal(published.data.schema, 'property-marketplace-offer/v1');
      assert.equal(published.data.offer_type, index % 2 ? 'service' : 'item');
      assert.equal(published.data.seller_pubkey, seller.id.pubkey);
      assert.equal(published.data.price_atomic, currency === 'BTC' ? '1' : '1');
      assert.equal(published.data.payment_rail, currency === 'BTC' ? 'bitcoin-onchain' : currency === 'XMR' ? 'monero-onchain' : 'nano-direct');
      assert.ok(published.data.expires_at === null || Number.isSafeInteger(published.data.expires_at));
      assert.deepEqual(published.data.relay_hints, [], 'local ws relay addresses are omitted from the public hint list');
      assert.equal(await waitStored(r2, published.event.id, true), true, 'offer reaches buyer through R5');
      await buyer.page.locator('button[data-view="marketplace"]').click();
      await refreshProductFor(buyer, title);
      const card = buyer.page.locator('#marketplace-list .product-card').filter({ hasText: title });
      const publicEyebrow = (await buyer.page.locator('#marketplace-view .feature-header .eyebrow').textContent()).trim();
      assert.match(publicEyebrow, /PUBLIC|PÚBLIC/i, 'the marketplace view is visibly public');
      assert.ok((await card.locator('.product-price').textContent()).trim().includes(currency));
      assert.doesNotMatch(await card.textContent(), /\bpaid\b|\bpago\b|\bpaga\b/i, 'a listing never appears paid');
      const contactName = locale === 'en' ? /Contact(?: the)? seller/i : /Falar com vendedor/i;
      await card.getByRole('button', { name: contactName }).click();
      await buyer.page.waitForFunction(expected => document.querySelector('#chat-subtitle')?.textContent.trim() === expected,
        seller.id.npub, { timeout: 8000 });
      assert.equal((await buyer.page.locator('#chat-subtitle').textContent()).trim(), seller.id.npub, `journey ${index} private contact targets seller`);
      assert.match(await buyer.page.locator('#composer-note').textContent(), /NIP-17|inbox relay|relays de recebimento/i,
        'the conversation names its private protocol or explains the inbox relay prerequisite');
      await seller.page.locator('#refresh-marketplace').click();
      const sellerCard = seller.page.locator('#marketplace-list .product-card').filter({ hasText: title });
      await sellerCard.waitFor({ state: 'visible', timeout: 12000 });
      await sellerCard.getByRole('button', { name: /Withdraw offer|Retirar oferta/i }).click();
      await seller.page.locator('#delete-product-dialog').waitFor({ state: 'visible' });
      await seller.page.locator('#confirm-delete-product').click();
      await seller.page.locator('#delete-product-dialog').waitFor({ state: 'hidden', timeout: 15000 });
      const deletion = await untilValue(async () => (await wsQuery(r1, { kinds: [5], authors: [seller.id.pubkey], limit: 500 }))
        .find(event => event.tags.some(tag => tag[0] === 'a' && tag[1] === `30018:${seller.id.pubkey}:${published.data.id}`)),
      12000, `browser journey ${index} withdrawal was not signed/published`);
      assert.ok(runtime.verifyEvent(deletion));
      await waitStored(relays[3].url, deletion.id, true);
      marketplaceJourneys.push({ sequence: index + 1, language: locale, currency, offer_id: published.data.id, title,
        event_id: published.event.id, withdrawal_id: deletion.id, author_binding: true, exact_amount: true,
        contact_target: seller.id.npub, private_message_sent: false, paid_claim: false });
    }
    await buyer.page.locator('button[data-view="marketplace"]').click();
    await buyer.page.locator('#refresh-marketplace').click();
    for (const journey of marketplaceJourneys) {
      assert.equal(await buyer.page.locator('#marketplace-list .product-card').filter({ hasText: journey.title }).count(), 0,
        `withdrawn offer ${journey.sequence} is absent from the buyer view`);
    }
    report.marketplace = { ...report.marketplace, multilingual_browser_journeys: marketplaceJourneys,
      browser_journey_count: 50, languages: { en: 25, 'pt-BR': 25 }, public_private_labels_clear: true,
      contact_did_not_publish_message: true, withdrawal_events_signed: 50, false_paid_indicators: 0 };
    mark('G06-08', 'PASS', 'Completed 50 real PWA marketplace journeys (25 English, 25 Brazilian Portuguese) across BTC/XMR/XNO. Each published the versioned offer, browsed it from the other identity, checked public/private and no-paid labeling, opened the seller conversation, and withdrew the offer with a signed NIP-09 request.');

    report.denied_proxy_attempts = proxy.attempts;
    await assertNoExternal(report);
    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    checkpoint();
    process.stdout.write(JSON.stringify({ result: report.result, cases: report.cases, output: outputDir }) + '\n');
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const row = report.cases.find(item => item.case === activeCase);
    if (row && row.status === 'NOT_RUN') Object.assign(row, {
      status: /playwright|executable|version mismatch|ENOENT|permission|launch/i.test(error.message) ? 'BLOCKED' : 'FAIL',
      reason: safeText(error.message || error)
    });
    for (const item of report.cases) if (item.status === 'NOT_RUN') Object.assign(item, {
      status: 'BLOCKED', reason: `Earlier case ${activeCase} did not pass; dependent G06 scenario was not started.`
    });
    report.result = report.cases.some(item => item.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    report.error = safeText(error.message || error);
    report.current_case = activeCase;
    report.current_step = activeStep;
    report.error_stack = safeText(error.stack || '');
    report.node_diagnostics = [...nodes.values()].map(node => ({ label: node.label, subscriptions: node.subscriptions,
      eoses: node.eoses, received: node.received, forwarded: node.forwarded, errors: node.errors }));
    report.denied_proxy_attempts = proxy?.attempts || [];
    checkpoint();
    process.stderr.write(`${report.result}: ${report.error}\n`);
    return report.result === 'BLOCKED' ? 2 : 1;
  } finally {
    await Promise.all([...nodes.values()].map(closeNode));
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
