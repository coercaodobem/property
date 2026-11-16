#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startGeode, stopGeode } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const PRIVATE_MESSAGE_COUNT = 50;
const PUBLIC_EVENT_COUNT = 100;
const PARTITION_TRANSITIONS = 40;
const CONFLICTING_UPDATES = 20;
const RESTARTS_PER_RELAY = 2;
const RETRY_FIXTURES = 20;
const FAILURE_FIXTURES = 10;
const FIXED_EVENT_EPOCH = 1_794_384_000;
const GROUPS = Object.freeze([[0, 1], [2, 3], [4]]);
const IDENTITY_GROUPS = Object.freeze([0, 0, 1, 1, 2, 2]);
const BATCH_SIZE = 75;
const WATCHDOG_MS = 20_000;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(result, name)) throw new Error(`Duplicate option --${name.replaceAll('_', '-')}.`);
    result[name] = value;
  }
  if (!result.output) throw new Error('Missing --output.');
  return result;
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function makeNostrRuntime() {
  const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(WEB, 'vendor/nostr-tools-2.25.2.bundle.js')), context, { timeout: 10_000 });
  vm.runInContext(readFileSync(path.join(WEB, 'money.js')), context, { timeout: 5_000 });
  vm.runInContext(readFileSync(path.join(WEB, 'protocol-contract.js')), context, { timeout: 5_000 });
  vm.runInContext(readFileSync(path.join(WEB, 'public-profile.js')), context, { timeout: 5_000 });
  vm.runInContext(readFileSync(path.join(WEB, 'marketplace.js')), context, { timeout: 5_000 });
  vm.runInContext(readFileSync(path.join(WEB, 'routing.js')), context, { timeout: 5_000 });
  function evaluate(name, value, code) {
    context[name] = JSON.stringify(value);
    return vm.runInContext(code, context, { timeout: 15_000 });
  }
  const sign = (kind, content, createdAt, secret, tags = []) => JSON.parse(evaluate('g4SignInput', { kind, content, createdAt, secret, tags },
    `(() => { const x=JSON.parse(g4SignInput); return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,created_at:x.createdAt,tags:x.tags},Uint8Array.from(x.secret))); })()`));
  const wrapMany = (secret, recipientPubkey, body) => JSON.parse(evaluate('g4WrapInput', { secret, recipientPubkey, body },
    `(() => { const x=JSON.parse(g4WrapInput); return JSON.stringify(NostrTools.nip17.wrapManyEvents(Uint8Array.from(x.secret),[{publicKey:x.recipientPubkey}],x.body)); })()`));
  const unwrap = (event, secret) => {
    try {
      return JSON.parse(evaluate('g4UnwrapInput', { event, secret },
        `(() => { const x=JSON.parse(g4UnwrapInput); const rumor=NostrTools.nip17.unwrapEvent(x.event,Uint8Array.from(x.secret)); return JSON.stringify({ok:Boolean(rumor),rumor:rumor||null}); })()`));
    } catch { return { ok: false, rumor: null }; }
  };
  const verify = event => Boolean(evaluate('g4EventInput', event, 'NostrTools.verifyEvent(JSON.parse(g4EventInput))'));
  return { context, sign, wrapMany, unwrap, verify };
}

class RelayClient {
  constructor(url) {
    assert.match(url, /^ws:\/\/127\.0\.0\.1:\d+\/?$/, 'G4 relay endpoints stay on loopback');
    this.url = url.endsWith('/') ? url : `${url}/`;
    this.socket = new WebSocket(this.url);
    this.acks = new Map();
    this.subscriptions = new Map();
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Loopback relay did not open before watchdog: ${url}`)), WATCHDOG_MS);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`Loopback relay WebSocket failed: ${url}`)); }, { once: true });
    });
    this.socket.addEventListener('message', message => this.onMessage(String(message.data)));
  }
  onMessage(text) {
    let frame;
    try { frame = JSON.parse(text); } catch { return; }
    if (!Array.isArray(frame)) return;
    if (frame[0] === 'OK' && typeof frame[1] === 'string' && typeof frame[2] === 'boolean') {
      const waiter = this.acks.get(frame[1]);
      if (waiter) { this.acks.delete(frame[1]); clearTimeout(waiter.timer); waiter.resolve({ accepted: frame[2], response: typeof frame[3] === 'string' ? frame[3].slice(0, 160) : '' }); }
    } else if (frame[0] === 'EVENT' && typeof frame[1] === 'string' && frame[2]?.id) {
      this.subscriptions.get(frame[1])?.events.push(frame[2]);
    } else if (frame[0] === 'EOSE' && typeof frame[1] === 'string') {
      const subscription = this.subscriptions.get(frame[1]);
      if (subscription) { this.subscriptions.delete(frame[1]); clearTimeout(subscription.timer); subscription.resolve(subscription.events); }
    }
  }
  async publishBatch(events) {
    await this.ready;
    assert.ok(events.length <= BATCH_SIZE, `publish batch is bounded to ${BATCH_SIZE}`);
    assert.equal(new Set(events.map(event => event.id)).size, events.length, 'one event ID appears once per batch');
    const promises = events.map(event => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.acks.delete(event.id); reject(new Error(`Relay ACK watchdog expired for ${event.id}`)); }, WATCHDOG_MS);
      this.acks.set(event.id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify(['EVENT', event])); }
      catch (error) { clearTimeout(timer); this.acks.delete(event.id); reject(error); }
    }));
    return Promise.all(promises);
  }
  async publish(event) { return (await this.publishBatch([event]))[0]; }
  async query(ids) {
    await this.ready;
    assert.ok(ids.length > 0 && ids.length <= 150, 'query ID batch is fixed and bounded');
    const id = `g4-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.subscriptions.delete(id); reject(new Error(`Relay query watchdog expired at ${this.url}`)); }, WATCHDOG_MS);
      this.subscriptions.set(id, { events: [], resolve, reject, timer });
      this.socket.send(JSON.stringify(['REQ', id, { ids, limit: ids.length + 1 }]));
    });
  }
  async close() {
    for (const waiter of this.acks.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('Relay client closed.')); }
    this.acks.clear();
    for (const subscription of this.subscriptions.values()) { clearTimeout(subscription.timer); subscription.reject(new Error('Relay client closed.')); }
    this.subscriptions.clear();
    try { this.socket.close(); } catch {}
  }
}

function groupForRelay(relayIndex) { return GROUPS.findIndex(group => group.includes(relayIndex)); }
function relayRateConfig(port, dataDirectory) {
  const databaseFile = JSON.stringify(path.join(dataDirectory, 'events.db'));
  return `[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[database]\nin_memory = false\nfile = ${databaseFile}\n\n[rate_limits]\nevents_per_minute = 10000\nevent_burst = 10000\nreqs_per_minute = 10000\nreq_burst = 10000\n`;
}
function digestIds(events) { return createHash('sha256').update(events.map(event => event.id).sort().join('\n')).digest('hex'); }
function signedEventFields(event) {
  return Object.fromEntries(['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'].map(field => [field, event?.[field]]));
}
function countById(events) { const counts = new Map(); for (const event of events) counts.set(event.id, (counts.get(event.id) || 0) + 1); return counts; }
function assertStoredOnce(events, expected, verifyEvent) {
  const counts = countById(events);
  assert.equal(events.length, expected.length, 'query returns exactly the expected number of events');
  assert.deepEqual([...counts.values()], Array(events.length).fill(1), 'each event ID appears exactly once');
  const expectedById = new Map(expected.map(event => [event.id, event]));
  for (const actual of events) {
    const original = expectedById.get(actual.id);
    assert.ok(original, `relay returned unexpected event ${actual.id}`);
    assert.equal(verifyEvent(actual), true, 'stored signature and ID remain valid');
    assert.deepEqual(signedEventFields(actual), signedEventFields(original), 'storage/forwarding preserves every signed event field');
  }
}

async function publishChunked(client, events, allowRejected = false) {
  const responses = [];
  for (let offset = 0; offset < events.length; offset += BATCH_SIZE) {
    const batch = events.slice(offset, offset + BATCH_SIZE);
    const result = await client.publishBatch(batch);
    if (!allowRejected) assert.ok(result.every(item => item.accepted), `relay accepted ${batch.length} signed events`);
    responses.push(...result);
  }
  return responses;
}

async function queryChunked(client, ids) {
  const events = [];
  for (let offset = 0; offset < ids.length; offset += 100) events.push(...await client.query(ids.slice(offset, offset + 100)));
  return events;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  assert.match(await readFile('/etc/os-release', 'utf8'), /^ID=ubuntu$/m, 'G4 relay run is restricted to Ubuntu');
  const output = path.resolve(args.output);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-product-g4-relays-'));
  const runtime = makeNostrRuntime();
  const report = {
    schema_version: 1, gate: 'G4', suite: 'isolated-five-relay-fixed-count', result: 'RUNNING',
    operating_system: 'Ubuntu Linux x86_64', runtime: { node: process.version, nostr_bundle: 'bundled nostr-tools 2.25.2' },
    predefined_variables: { synthetic_identities: 6, isolated_relays: 5, relay_groups: GROUPS.map(group => [...group]),
      private_messages_per_ordered_identity_pair: PRIVATE_MESSAGE_COUNT, public_events: PUBLIC_EVENT_COUNT,
      relay_rate_limits: { events_per_minute: 10000, event_burst: 10000, reqs_per_minute: 10000, req_burst: 10000 },
      partition_transitions: PARTITION_TRANSITIONS, conflicting_profile_offer_updates: CONFLICTING_UPDATES,
      restarts_per_relay: RESTARTS_PER_RELAY, repeated_event_fixtures: RETRY_FIXTURES, failure_fixtures_per_category: FAILURE_FIXTURES,
      fixed_event_epoch: FIXED_EVENT_EPOCH },
    cases: [], relays: [], private_messages: {}, public_events: {}, partition_recovery: {}, conflicts: {},
    restart_retry: {}, failure_fixtures: {}, egress: { external_targets: [], relay_targets_loopback_only: true }
  };
  let activeCase = 'G04-setup';
  const mark = (name, details) => report.cases.push({ case: name, status: 'PASS', ...details });
  const relays = [], clients = [];
  try {
    for (let index = 0; index < 5; index++) {
      activeCase = `G04-setup-relay-${index + 1}`;
      const port = await reserveLoopbackPort();
      const label = `G4 isolated relay ${index + 1}`;
      const relay = await startGeode(port, temp, label, relayRateConfig(port, path.join(temp, `${label} data`)));
      relay.g4Port = port; relay.g4Label = label; relays.push(relay);
      clients.push(new RelayClient(relay.url));
    }
    await Promise.all(clients.map(client => client.ready));
    report.relays = relays.map((relay, index) => ({ relay: `R${index + 1}`, endpoint: '127.0.0.1', port: relay.g4Port,
      storage: 'private isolated directory', group: groupForRelay(index) }));

    const identities = Array.from({ length: 6 }, (_, index) => {
      const secret = Array(32).fill(0); secret[31] = index + 1;
      const publicEvent = runtime.sign(1, `synthetic identity ${index + 1}`, FIXED_EVENT_EPOCH, secret);
      return { secret, pubkey: publicEvent.pubkey, group: IDENTITY_GROUPS[index] };
    });
    assert.equal(new Set(identities.map(identity => identity.pubkey)).size, 6);

    activeCase = 'G04-public-100-and-partitions-40';
    const publicEvents = Array.from({ length: PUBLIC_EVENT_COUNT }, (_, index) => {
      const author = identities[index % identities.length];
      return runtime.sign(1, `property-g4-public-${String(index + 1).padStart(3, '0')}`, FIXED_EVENT_EPOCH + 100 + index, author.secret);
    });
    const partitionEvents = publicEvents.slice(0, PARTITION_TRANSITIONS);
    const transitionGroups = partitionEvents.map((event, index) => ({ event, group: index % GROUPS.length }));
    const partitionByRelay = Array.from({ length: 5 }, () => []);
    for (const transition of transitionGroups) for (const relayIndex of GROUPS[transition.group]) partitionByRelay[relayIndex].push(transition.event);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], partitionByRelay[relayIndex]);
    const transitionIds = partitionEvents.map(event => event.id);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) {
      const observed = await queryChunked(clients[relayIndex], transitionIds);
      const relayGroup = groupForRelay(relayIndex);
      const expected = transitionGroups.filter(item => item.group === relayGroup).map(item => item.event);
      assertStoredOnce(observed, expected, runtime.verify);
    }
    const remainingPublic = publicEvents.slice(PARTITION_TRANSITIONS);
    const remainingByRelay = Array.from({ length: 5 }, () => []);
    for (let offset = 0; offset < remainingPublic.length; offset++) {
      const event = remainingPublic[offset], group = offset % GROUPS.length;
      for (const relayIndex of GROUPS[group]) remainingByRelay[relayIndex].push(event);
    }
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], remainingByRelay[relayIndex]);
    const partitionedPublicIds = digestIds(partitionEvents);
    report.partition_recovery.transitions = transitionGroups.map((item, index) => ({ ordinal: index + 1, group: item.group, state: 'partitioned' }));
    report.partition_recovery.isolation_matrix_passed = true;
    report.partition_recovery.transitions_completed = transitionGroups.length;
    report.partition_recovery.partitioned_event_ids_sha256 = partitionedPublicIds;
    mark('G04-PARTITION-40', { transitions: transitionGroups.length, group_distribution: GROUPS.map((_, group) => transitionGroups.filter(item => item.group === group).length),
      disconnected_groups_did_not_observe_other_group_events: true });

    activeCase = 'G04-conflicting-profile-offer-updates-20';
    const profileUpdates = [], productUpdates = [];
    for (let pair = 0; pair < 5; pair++) {
      const createdAt = FIXED_EVENT_EPOCH + pair;
      const profileVariants = ['left', 'right'].map(label => runtime.sign(0, JSON.stringify({ name: `Profile ${pair} ${label}` }), createdAt, identities[0].secret));
      profileUpdates.push(...profileVariants.map((event, variant) => ({ event, group: variant === 0 ? pair % 3 : (pair + 1) % 3 })));
      const productId = `property-g4-offer-${pair}`;
      const productVariants = ['left', 'right'].map((label, variant) => {
        const price = 1 + pair + variant;
        const payload = { id: productId, stall_id: 'property-g4-stall', name: `Offline offer ${pair} ${label}`,
          description: 'Synthetic partition convergence fixture', images: [], currency: 'BTC', price, price_atomic: String(price * 100_000_000),
          quantity: null, specs: [], shipping: [] };
        return runtime.sign(30018, runtime.context.PropertyProtocol.canonicalJson(payload), createdAt, identities[0].secret, [['d', productId]]);
      });
      productUpdates.push(...productVariants.map((event, variant) => ({ event, group: variant === 0 ? pair % 3 : (pair + 1) % 3 })));
    }
    assert.equal(profileUpdates.length + productUpdates.length, CONFLICTING_UPDATES);
    const conflictUpdates = [...profileUpdates, ...productUpdates];
    const conflictsByRelay = Array.from({ length: 5 }, () => []);
    for (const update of conflictUpdates) for (const relayIndex of GROUPS[update.group]) conflictsByRelay[relayIndex].push(update.event);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], conflictsByRelay[relayIndex]);
    const expectedProfile = runtime.context.PropertyPublicProfile.latestRecord(profileUpdates.map(item => item.event), identities[0].pubkey, runtime.verify);
    const expectedProducts = runtime.context.PropertyMarketplace.selectActiveProducts(productUpdates.map(item => item.event), runtime.verify, FIXED_EVENT_EPOCH + 1000);
    assert.equal(expectedProducts.length, 5, 'app product reducer selects one latest revision for each of five offers');
    const conflictIds = conflictUpdates.map(item => item.event.id);

    activeCase = 'G04-reconnect-and-fanout';
    const allPublicAndConflicts = [...publicEvents, ...conflictUpdates.map(item => item.event)];
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], allPublicAndConflicts, true);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) {
      const publicObserved = await queryChunked(clients[relayIndex], publicEvents.map(event => event.id));
      assertStoredOnce(publicObserved, publicEvents, runtime.verify);
      const profileObserved = await clients[relayIndex].query(profileUpdates.map(item => item.event.id));
      assert.equal(profileObserved.length, 1, 'one replaceable public profile remains at each relay');
      assert.equal(profileObserved[0].id, expectedProfile.event.id, 'profile conflict resolves to the documented latest timestamp/tie-break winner');
      assert.equal(runtime.verify(profileObserved[0]), true);
      const productIds = productUpdates.map(item => item.event.id);
      const productObserved = await clients[relayIndex].query(productIds);
      assert.equal(productObserved.length, 5, 'one parameterized product revision remains for each of five offers');
      const observedProductsByAddress = new Map(productObserved.map(event => [event.tags.find(tag => tag[0] === 'd')?.[1], event]));
      const expectedProductsByAddress = new Map(expectedProducts.map(event => [event.tags.find(tag => tag[0] === 'd')?.[1], event]));
      assert.deepEqual([...observedProductsByAddress.keys()].sort(), [...expectedProductsByAddress.keys()].sort());
      for (const [address, expected] of expectedProductsByAddress) {
        const actual = observedProductsByAddress.get(address);
        assert.equal(actual.id, expected.id, `offer ${address} conflict resolves to the documented winner`);
        assert.equal(runtime.verify(actual), true);
      }
    }
    const latestProfileId = expectedProfile.event.id;
    const productWinnerIds = expectedProducts.map(event => event.id).sort();
    report.public_events = { count: publicEvents.length, unique_id_digest: digestIds(publicEvents), all_five_relays_converged: true,
      stored_copies_per_relay: publicEvents.length };
    report.partition_recovery.reconnected_all_five_relays = true;
    report.partition_recovery.public_event_convergence_count = publicEvents.length;
    report.conflicts = { conflicting_update_count: conflictUpdates.length, profile_updates: profileUpdates.length,
      product_updates: productUpdates.length, winner_rule: 'greatest created_at; equal timestamps choose the lexicographically lower event ID',
      profile_winner_id: latestProfileId, product_winner_ids: productWinnerIds, same_winner_on_every_relay: true,
      conflicting_event_ids_sha256: digestIds(conflictUpdates.map(item => item.event)) };
    mark('G04-PUBLIC-100', { events: publicEvents.length, relays: 5, signatures_and_ids_preserved: true, one_copy_per_id: true });
    mark('G04-CONFLICT-20', { updates: conflictUpdates.length, profile_updates: profileUpdates.length, offer_updates: productUpdates.length,
      deterministic_latest_and_tie_break_convergence: true, same_result_on_all_relays: true });

    activeCase = 'G04-private-messages-1500';
    const privateByRelay = Array.from({ length: 5 }, () => []);
    const privateRows = [];
    let unauthorizedDecryptions = 0;
    for (let senderIndex = 0; senderIndex < identities.length; senderIndex++) {
      for (let recipientIndex = 0; recipientIndex < identities.length; recipientIndex++) {
        if (senderIndex === recipientIndex) continue;
        const sender = identities[senderIndex], recipient = identities[recipientIndex];
        const senderRelay = GROUPS[sender.group][0], recipientRelay = GROUPS[recipient.group][0];
        for (let repetition = 1; repetition <= PRIVATE_MESSAGE_COUNT; repetition++) {
          const body = `property-g4-private-${senderIndex}-${recipientIndex}-${repetition}`;
          const wraps = runtime.wrapMany(sender.secret, recipient.pubkey, body);
          const senderWrap = wraps.find(event => event.kind === 1059 && event.tags.some(tag => tag[0] === 'p' && tag[1] === sender.pubkey));
          const recipientWrap = wraps.find(event => event.kind === 1059 && event.tags.some(tag => tag[0] === 'p' && tag[1] === recipient.pubkey));
          assert.ok(senderWrap && recipientWrap && senderWrap.id !== recipientWrap.id);
          for (const event of [senderWrap, recipientWrap]) {
            assert.equal(runtime.verify(event), true);
            assert.equal(JSON.stringify(event).includes(body), false, 'relay event never contains message plaintext');
          }
          assert.equal(runtime.unwrap(senderWrap, sender.secret).rumor?.content, body, 'sender decrypts its own local envelope');
          assert.equal(runtime.unwrap(recipientWrap, recipient.secret).rumor?.content, body, 'recipient decrypts its own inbox envelope');
          for (let outsiderIndex = 0; outsiderIndex < identities.length; outsiderIndex++) {
            if (outsiderIndex === senderIndex || outsiderIndex === recipientIndex) continue;
            const result = runtime.unwrap(recipientWrap, identities[outsiderIndex].secret);
            assert.equal(result.ok, false, `nonparticipant identity ${outsiderIndex} cannot decrypt recipient envelope`);
            unauthorizedDecryptions += 1;
          }
          privateByRelay[senderRelay].push(senderWrap);
          privateByRelay[recipientRelay].push(recipientWrap);
          privateRows.push({ senderIndex, recipientIndex, senderRelay, recipientRelay, senderWrap, recipientWrap });
        }
      }
    }
    assert.equal(privateRows.length, 30 * PRIVATE_MESSAGE_COUNT);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], privateByRelay[relayIndex]);
    const privateIds = privateRows.flatMap(row => [row.senderWrap.id, row.recipientWrap.id]);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) {
      const expectedEvents = privateByRelay[relayIndex];
      const stored = await queryChunked(clients[relayIndex], expectedEvents.map(event => event.id));
      assertStoredOnce(stored, expectedEvents, runtime.verify);
    }
    const forwardedByRelay = Array.from({ length: 5 }, () => []);
    for (const row of privateRows) {
      const senderForward = (row.senderRelay + 1) % 5;
      const recipientForward = (row.recipientRelay + 1) % 5;
      forwardedByRelay[senderForward].push(row.senderWrap);
      forwardedByRelay[recipientForward].push(row.recipientWrap);
    }
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) await publishChunked(clients[relayIndex], forwardedByRelay[relayIndex], true);
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) {
      const forwarded = await queryChunked(clients[relayIndex], forwardedByRelay[relayIndex].map(event => event.id));
      assertStoredOnce(forwarded, forwardedByRelay[relayIndex], runtime.verify);
    }
    assert.equal(privateIds.length, 3000);
    report.private_messages = { directed_identity_pairs: 30, messages_per_direction: PRIVATE_MESSAGE_COUNT,
      total_private_messages: privateRows.length, wrapped_events: privateIds.length, authorized_decryptions: privateRows.length * 2,
      unauthorized_decryption_attempts: unauthorizedDecryptions, unauthorized_decryptions: 0,
      stored_and_forwarded_signatures_and_ids_unchanged: true, message_plaintext_in_relays: false,
      event_ids_sha256: digestIds(privateRows.flatMap(row => [row.senderWrap, row.recipientWrap])) };
    mark('G04-PRIVATE-1500', { identity_count: identities.length, ordered_directions: 30, messages_per_direction: PRIVATE_MESSAGE_COUNT,
      total_messages: privateRows.length, intended_decryptions: privateRows.length * 2, rejected_nonparticipant_decryptions: unauthorizedDecryptions,
      stable_signed_ids_after_storage_and_forwarding: true, plaintext_seen_by_relays: false });

    activeCase = 'G04-failure-fixtures-10-per-category';
    const routing = runtime.context.PropertyNostrRouting;
    const malformedTemplate = runtime.wrapMany(identities[0].secret, identities[1].pubkey, 'malformed envelope fixture').find(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === identities[1].pubkey));
    let malformedRejected = 0;
    for (let index = 0; index < FAILURE_FIXTURES; index++) {
      const corrupted = structuredClone(malformedTemplate);
      corrupted.content = `${corrupted.content.slice(0, index)}${corrupted.content[index] === 'A' ? 'B' : 'A'}${corrupted.content.slice(index + 1)}`;
      assert.equal(runtime.verify(corrupted), false);
      assert.equal(runtime.unwrap(corrupted, identities[1].secret).ok, false);
      malformedRejected += 1;
    }

    let oversizedRejected = 0;
    for (let index = 0; index < FAILURE_FIXTURES; index++) {
      const oversized = runtime.sign(1059, `x${index}`.padEnd(32_769, 'x'), FIXED_EVENT_EPOCH, identities[0].secret, [['p', identities[1].pubkey]]);
      assert.throws(() => runtime.context.PropertyProtocol.validateEventFamily(oversized, 'private_message', runtime.verify, FIXED_EVENT_EPOCH + 2000));
      oversizedRejected += 1;
    }

    let duplicateAcksIgnored = 0;
    for (let index = 0; index < FAILURE_FIXTURES; index++) {
      const urls = ['ws://127.0.0.1:4101', 'ws://127.0.0.1:4102'];
      const tracker = routing.createRelayResponseTracker(urls, urls);
      assert.equal(routing.recordRelayResponse(tracker, urls[0], true), true);
      assert.equal(routing.recordRelayResponse(tracker, urls[0], false), false);
      assert.equal(routing.recordRelayResponse(tracker, 'ws://127.0.0.1:4103', true), false);
      const summary = routing.summarizeRelayResponses(tracker);
      assert.deepEqual(JSON.parse(JSON.stringify(summary)), { acceptedRelayUrls: [urls[0]], rejectedRelayUrls: [], unansweredRelayUrls: [urls[1]] });
      duplicateAcksIgnored += 1;
    }

    const unavailablePort = await reserveLoopbackPort();
    const unavailableUrl = `ws://127.0.0.1:${unavailablePort}/`;
    let unavailableCount = 0;
    for (let index = 0; index < FAILURE_FIXTURES; index++) {
      const failure = await new Promise(resolve => {
        const socket = new WebSocket(unavailableUrl);
        const timer = setTimeout(() => { try { socket.close(); } catch {} resolve('watchdog'); }, WATCHDOG_MS);
        socket.addEventListener('error', () => { clearTimeout(timer); resolve('unavailable'); }, { once: true });
        socket.addEventListener('open', () => { clearTimeout(timer); socket.close(); resolve('unexpected-open'); }, { once: true });
      });
      assert.equal(failure, 'unavailable', 'unavailable relay did not acknowledge or accept a publish');
      const tracker = routing.createRelayResponseTracker([unavailableUrl], []);
      assert.deepEqual(JSON.parse(JSON.stringify(routing.summarizeRelayResponses(tracker))), {
        acceptedRelayUrls: [], rejectedRelayUrls: [], unansweredRelayUrls: [unavailableUrl]
      });
      unavailableCount += 1;
    }
    assert.equal(malformedRejected, FAILURE_FIXTURES); assert.equal(oversizedRejected, FAILURE_FIXTURES);
    assert.equal(duplicateAcksIgnored, FAILURE_FIXTURES); assert.equal(unavailableCount, FAILURE_FIXTURES);
    report.failure_fixtures = { malformed_envelope: { count: malformedRejected, decrypted: 0 }, unavailable_relay: { count: unavailableCount, fabricated_acknowledgements: 0 },
      oversized_event: { count: oversizedRejected, accepted_by_property_contract: 0 },
      duplicate_relay_response: { count: duplicateAcksIgnored, duplicate_or_unaddressed_acknowledgements_counted: 0 } };
    mark('G04-FAILURES-10-EACH', { malformed_envelopes: malformedRejected,
      unavailable_relays: unavailableCount, oversized_events: oversizedRejected, duplicate_ack_fixtures: duplicateAcksIgnored,
      false_delivery_or_read_receipts: 0 });

    activeCase = 'G04-restart-and-repeat-20';
    const persistentByRelay = Array.from({ length: 5 }, (_, relayIndex) => [...new Map([
      ...publicEvents,
      expectedProfile.event,
      ...expectedProducts,
      ...privateByRelay[relayIndex],
      ...forwardedByRelay[relayIndex]
    ].map(event => [event.id, event])).values()]);
    for (const client of clients) await client.close();
    clients.length = 0;
    let restartPersistenceChecks = 0;
    for (const relay of relays) {
      for (let repeat = 0; repeat < RESTARTS_PER_RELAY; repeat++) {
        await stopGeode(relay);
        const restarted = await startGeode(relay.g4Port, temp, relay.g4Label);
        Object.assign(relay, restarted, { g4Port: relay.g4Port, g4Label: relay.g4Label });
        const relayIndex = relays.indexOf(relay);
        const verificationClient = new RelayClient(relay.url);
        await verificationClient.ready;
        const expected = persistentByRelay[relayIndex];
        const retained = await queryChunked(verificationClient, expected.map(event => event.id));
        assertStoredOnce(retained, expected, runtime.verify);
        await verificationClient.close();
        restartPersistenceChecks += 1;
      }
    }
    for (const relay of relays) clients.push(new RelayClient(relay.url));
    await Promise.all(clients.map(client => client.ready));
    const retryEvents = [];
    for (let index = 0; index < RETRY_FIXTURES; index++) {
      const relayIndex = index % 5;
      const source = privateByRelay[relayIndex][0] || forwardedByRelay[relayIndex][0];
      assert.ok(source);
      const acknowledgement = await clients[relayIndex].publish(source);
      retryEvents.push({ relayIndex, event: source, acknowledgement });
    }
    for (let relayIndex = 0; relayIndex < 5; relayIndex++) {
      const selected = retryEvents.filter(item => item.relayIndex === relayIndex).map(item => item.event);
      const queried = await queryChunked(clients[relayIndex], [...new Set(selected.map(event => event.id))]);
      assertStoredOnce(queried, [...new Map(selected.map(event => [event.id, event])).values()], runtime.verify);
    }
    assert.ok(retryEvents.every(item => typeof item.acknowledgement.accepted === 'boolean'), 'retry ACKs are actual observed frames');
    report.restart_retry = { relays: relays.length, restarts_each: RESTARTS_PER_RELAY,
      total_restarts: relays.length * RESTARTS_PER_RELAY, retry_fixtures: retryEvents.length,
      acknowledgements_observed: retryEvents.length, acknowledgements_fabricated: 0,
      unique_logical_messages_per_event_id: true, restart_persistence_checks: restartPersistenceChecks,
      retained_logical_event_ids_per_relay: persistentByRelay.map(events => events.length), persistent_data_survived_restarts: true,
      duplicate_ids_sha256: digestIds(retryEvents.map(item => item.event)) };
    mark('G04-RESTART-10-RETRY-20', { relay_count: relays.length, restarts_per_relay: RESTARTS_PER_RELAY,
      retries: retryEvents.length, one_stored_copy_per_event_id: true, only_observed_ack_frames_counted: true });

    const evidenceText = JSON.stringify(report);
    assert.doesNotMatch(evidenceText, /nsec1|nsec[a-z0-9]{20,}|secretHex|private_key/i, 'sanitized relay evidence never records private keys');
    report.result = report.cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    assert.equal(report.result, 'PASS');
  } catch (error) {
    report.result = 'FAIL';
    report.failure = { case: activeCase, error: String(error?.message || error).replaceAll(/\s+/g, ' ').slice(0, 1200) };
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    for (const relay of [...relays].reverse()) await stopGeode(relay).catch(() => {});
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(path.join(output, 'relay-fixed-count-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  process.stdout.write(`${JSON.stringify({ result: report.result, cases: report.cases.map(item => item.case), failure: report.failure || null })}\n`);
  return report.result === 'PASS' ? 0 : 1;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/\s+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
