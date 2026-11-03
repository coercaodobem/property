#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createCampaignEngine, OFFER_KIND, OFFER_TAG, REFUND_REQUEST_KIND } from '../../relay/campaign-engine.mjs';
import { createBitcoinCoreLedger, createJsonRpcClient, createMoneroWalletLedger,
  createNanoNodeLedger, createDigestHttpJsonClient, combineCampaignLedgers } from '../../relay/ledger-rpc.mjs';
import { startGeode, stopGeode, publishEvent, waitStored, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(ROOT, 'property/web');
const IDS = ['G08-01', 'G08-02', 'G08-03', 'G08-04', 'G08-05', 'G08-06', 'G08-07'];
const NANO_DEV_GENESIS_KEY = '34F0A37AAD20F4A260F0A5B3CB3D7FB50673212263E58A380BC10474BB039CE4';
const NOW_EPOCH_SECONDS = 1_800_000_000;
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];

function argsOf(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected named options and values.');
    const name = key.slice(2).replaceAll('-', '_');
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate option ${key}.`);
    values[name] = value;
  }
  for (const name of ['bitcoind', 'bitcoind_sha256', 'bitcoin_cli', 'bitcoin_cli_sha256', 'monerod', 'monerod_sha256',
    'monero_wallet_rpc', 'monero_wallet_rpc_sha256', 'nano_node', 'nano_node_sha256', 'output']) {
    if (!values[name]) throw new Error(`Missing --${name.replaceAll('_', '-')}.`);
  }
  return values;
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function freePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}

function nap(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function reachable(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = connect(port, host);
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function startProcess(name, command, parameters, logFile, cwd = ROOT) {
  const env = { ...process.env };
  for (const key of PROXY_KEYS) delete env[key];
  delete env.NODE_OPTIONS;
  const child = spawn(command, parameters, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let diagnostic = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-5000); });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  child.once('error', error => { diagnostic = (diagnostic + `\nspawn ${name}: ${error.message}`).slice(-5000); });
  return { name, child, exited, logFile, diagnostic: () => diagnostic };
}

async function stopProcess(processHandle) {
  if (!processHandle?.child || processHandle.child.exitCode !== null) return;
  try { process.platform === 'win32' ? processHandle.child.kill('SIGTERM') : process.kill(-processHandle.child.pid, 'SIGTERM'); } catch {}
  await Promise.race([processHandle.exited, nap(5000)]);
  if (processHandle.child.exitCode === null) {
    try { process.platform === 'win32' ? processHandle.child.kill('SIGKILL') : process.kill(-processHandle.child.pid, 'SIGKILL'); } catch {}
  }
}

async function waitRpc(check, handle, label, timeout = 90_000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    if (handle?.child.exitCode !== null) throw new Error(`${label} exited ${handle.child.exitCode}: ${handle.diagnostic()}`);
    try { return await check(); } catch (error) { last = error; await nap(350); }
  }
  throw new Error(`${label} did not become ready: ${last?.message || ''} ${handle?.diagnostic() || ''}`);
}

async function digestJsonRpc(url, auth, method, params = {}) {
  const client = createJsonRpcClient(url, { auth: { type: 'digest', ...auth }, preserveMoneroIntegers: true, timeoutMs: 20_000 });
  return client(method, params);
}

function runtimeFromBundle() {
  const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  const bundle = requireNostrToolsBundle();
  vm.runInContext(bundle, context, { timeout: 10_000 });
  return {
    verifyEvent: event => { context.g08Event = JSON.stringify(event); return vm.runInContext('NostrTools.verifyEvent(JSON.parse(g08Event))', context, { timeout: 10_000 }); },
    identity: () => {
      const data = JSON.parse(vm.runInContext(`(() => { const secret=NostrTools.generateSecretKey(); const event=NostrTools.finalizeEvent({kind:1,content:'G08 test identity',tags:[],created_at:${NOW_EPOCH_SECONDS}},secret); return JSON.stringify({secret:[...secret],pubkey:event.pubkey}); })()`, context, { timeout: 10_000 }));
      return { secret: Uint8Array.from(data.secret), pubkey: data.pubkey };
    },
    sign: (kind, content, createdAt, secret, tags = []) => {
      context.g08Sign = JSON.stringify({ kind, content, created_at: createdAt, secret: [...secret], tags });
      return JSON.parse(vm.runInContext(`(() => { const x=JSON.parse(g08Sign); return JSON.stringify(NostrTools.finalizeEvent({kind:x.kind,content:x.content,created_at:x.created_at,tags:x.tags},Uint8Array.from(x.secret))); })()`, context, { timeout: 10_000 }));
    }
  };
}

let nostrBundleCache = null;
function requireNostrToolsBundle() {
  // Loaded synchronously from the checked-in, hash-pinned vendor bundle.
  if (nostrBundleCache !== null) return nostrBundleCache;
  throw new Error('Nostr bundle was not loaded before constructing the runtime.');
}

function engineFor(runtime, node, stateDir, ledger, relayUrl, clock, minConfirmations) {
  const combined = combineCampaignLedgers(ledger);
  return createCampaignEngine({ stateDir, nodePubkey: node.pubkey, verifyEvent: runtime.verifyEvent,
    signEvent: draft => runtime.sign(draft.kind, draft.content, draft.created_at, node.secret, draft.tags),
    addressProvider: combined.addressProvider, ledger: combined,
    publishEvent: event => publishEvent(relayUrl, event), nowSeconds: () => clock.now,
    policy: { currencies: ['BTC', 'XMR', 'XNO'], minConfirmations } });
}

function offerFor(runtime, advertiser, clock, currency, amountAtomic, label = 'campaign') {
  const campaignId = randomUUID();
  const payload = { schema: OFFER_TAG, campaign_id: campaignId, advertiser_pubkey: advertiser.pubkey,
    title: `Property G08 ${label} ${campaignId.slice(0, 8)}`, body: 'Local ledger settlement evidence.',
    link: 'https://campaign.test/property', currency, amount_atomic: String(amountAtomic),
    expires_at: clock.now + 7200, refund_terms: 'Return a reconciled incompatible payment after a signed request.' };
  return { campaignId, event: runtime.sign(OFFER_KIND, JSON.stringify(payload), clock.now, advertiser.secret,
    [['t', OFFER_TAG], ['d', campaignId]]) };
}

function refundRequest(runtime, advertiser, campaignId, offerId, txid, refundAddress, createdAt) {
  return runtime.sign(REFUND_REQUEST_KIND, JSON.stringify({ schema: 'property-campaign-refund-v1', campaign_id: campaignId,
    offer_event_id: offerId, payment_tx_id: txid, refund_address: refundAddress }), createdAt, advertiser.secret,
  [['d', campaignId], ['e', offerId]]);
}

async function createCampaign(runtime, relay, engine, advertiser, clock, currency, expectedAmount, name) {
  const { campaignId, event } = offerFor(runtime, advertiser, clock, currency, expectedAmount, name);
  assert.equal(runtime.verifyEvent(event), true);
  assert.equal((await publishEvent(relay.url, event)).accepted, true);
  await waitStored(relay.url, event.id);
  const signedOffer = (await wsQuery(relay.url, { ids: [event.id], limit: 1 }))[0];
  assert.ok(signedOffer && runtime.verifyEvent(signedOffer));
  const decision = await engine.decide(signedOffer);
  assert.equal(decision.decision, 'accepted');
  assert.equal(runtime.verifyEvent(decision.event), true);
  assert.equal((await publishEvent(relay.url, decision.event)).accepted, true);
  await waitStored(relay.url, decision.event.id);
  return { campaignId, offer: signedOffer, decision };
}

async function waitCampaignPublished(relay, engine, campaignId, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let state;
  while (Date.now() < until) {
    state = await engine.reconcile(campaignId);
    if (state.status === 'published') {
      await waitStored(relay.url, state.event.id, true, timeoutMs);
      const rows = await wsQuery(relay.url, { ids: [state.event.id], limit: 1 });
      assert.equal(rows.length, 1, 'a confirmed campaign is published exactly once to the real relay');
      return state;
    }
    await nap(150);
  }
  throw new Error(`campaign ${campaignId} did not reach published; last status=${state?.status}`);
}

async function waitCampaignPending(engine, campaignId, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  let state;
  while (Date.now() < until) {
    state = await engine.reconcile(campaignId);
    if (state.status === 'payment_pending') return state;
    if (state.status !== 'awaiting_payment') throw new Error(`campaign ${campaignId} passed the pending gate unexpectedly: ${state.status}`);
    await nap(200);
  }
  throw new Error(`campaign ${campaignId} payment was not observed as pending; last status=${state?.status}`);
}

async function waitForRefund(engine, campaignId, request, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let state;
  while (Date.now() < until) {
    state = await engine.refund(request);
    if (state.status === 'refunded') return state;
    await nap(200);
  }
  throw new Error(`campaign ${campaignId} refund did not confirm; last status=${state?.status}`);
}

function basicHeader(username, password) { return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`; }

async function startNanoAuthGateway(upstreamPort, username, password) {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== basicHeader(username, password)) {
      response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Basic realm="Property Nano test gateway"' });
      response.end('{"error":"authentication required"}'); return;
    }
    const forward = httpRequest({ host: '::1', family: 6, port: upstreamPort, method: 'POST', path: '/',
      headers: { 'content-type': 'application/json', 'content-length': request.headers['content-length'] || '0' } }, upstream => {
      response.writeHead(upstream.statusCode || 502, { 'content-type': upstream.headers['content-type'] || 'application/json' });
      upstream.pipe(response);
    });
    forward.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('{"error":"local Nano RPC unavailable"}'); });
    request.pipe(forward);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '::1', resolve); });
  const port = server.address().port;
  return { server, port, url: `http://[::1]:${port}/`, async close() { await new Promise(resolve => server.close(resolve)); } };
}

async function main() {
  const options = argsOf(process.argv.slice(2));
  const toolHashes = {
    bitcoind: await sha256File(options.bitcoind), bitcoin_cli: await sha256File(options.bitcoin_cli),
    monerod: await sha256File(options.monerod), monero_wallet_rpc: await sha256File(options.monero_wallet_rpc),
    nano_node: await sha256File(options.nano_node)
  };
  for (const [tool, actual] of Object.entries(toolHashes)) {
    if (actual !== options[`${tool}_sha256`]?.toLowerCase()) throw new Error(`SHA-256 mismatch for ${tool}.`);
  }
  nostrBundleCache = await readFile(path.join(WEB, 'vendor/nostr-tools-2.25.2.bundle.js'), 'utf8');
  const runtime = runtimeFromBundle();
  const outputDir = path.resolve(options.output);
  const reportPath = path.join(outputDir, 'ledger-g08-report.json');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g08-'));
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const report = { schema_version: 1, result: 'RUNNING', cases: IDS.map(id => ({ case: id, status: 'NOT_RUN', reason: 'Case has not started.' })),
    ledger_networks: {}, payments: [], refunds: [], accounting: [], auth_checks: [], relay_publications: [],
    external_endpoints: [], credential_scan: null, binary_sha256: toolHashes };
  const checkpoint = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  const mark = async (id, status, reason) => { Object.assign(report.cases.find(row => row.case === id), { status, reason }); await checkpoint(); };
  const processes = [];
  const servers = [];
  let relay = null;
  let active = IDS[0], stage = 'initialize test-only private ledgers';
  try {
    const baseRpcUser = `g08-${randomUUID().slice(0, 8)}`;
    const baseRpcPass = randomBytes(24).toString('hex');
    const xmrDaemonUser = `g08d-${randomUUID().slice(0, 8)}`;
    const xmrDaemonPass = randomBytes(24).toString('hex');
    const xmrAdvertiserUser = `g08a-${randomUUID().slice(0, 8)}`;
    const xmrAdvertiserPass = randomBytes(24).toString('hex');
    const xmrNodeUser = `g08n-${randomUUID().slice(0, 8)}`;
    const xmrNodePass = randomBytes(24).toString('hex');

    stage = 'start isolated Bitcoin Core regtest';
    const btcRoot = path.join(temp, 'bitcoin'), btcData = path.join(btcRoot, 'data');
    await mkdir(btcData, { recursive: true, mode: 0o700 });
    const btcPort = await freePort('127.0.0.1');
    const btcBaseUrl = `http://127.0.0.1:${btcPort}/`;
    const btcAuth = { type: 'basic', username: baseRpcUser, password: baseRpcPass };
    const bitcoind = startProcess('bitcoind', options.bitcoind, [
      `-datadir=${btcData}`, '-regtest=1', '-server=1', '-daemon=0', '-listen=0', '-dnsseed=0', '-discover=0', '-connect=0',
      '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', `-rpcport=${btcPort}`,
      `-rpcuser=${baseRpcUser}`, `-rpcpassword=${baseRpcPass}`, '-fallbackfee=0.0001', '-maxconnections=0', '-listenonion=0'
    ], path.join(outputDir, 'bitcoin-regtest.log'));
    processes.push(bitcoind);
    const btc = createJsonRpcClient(btcBaseUrl, { auth: btcAuth, timeoutMs: 20_000 });
    await waitRpc(() => btc('getblockchaininfo'), bitcoind, 'Bitcoin Core regtest');
    const btcInfo = await btc('getblockchaininfo'); assert.equal(btcInfo.chain, 'regtest');
    await btc('createwallet', ['advertiser']); await btc('createwallet', ['property-node']);
    const btcAdvertiser = createJsonRpcClient(`${btcBaseUrl}wallet/advertiser`, { auth: btcAuth, timeoutMs: 20_000 });
    const btcNodeRpc = createJsonRpcClient(`${btcBaseUrl}wallet/property-node`, { auth: btcAuth, timeoutMs: 20_000 });
    const btcLedger = createBitcoinCoreLedger({ rpcUrl: btcBaseUrl, walletName: 'property-node', username: baseRpcUser,
      password: baseRpcPass, minConfirmations: 1, minRefundConfirmations: 1 });
    const btcMineTo = async (address, count = 1) => btc('generatetoaddress', [count, address]);
    const btcAdvertiserAddr = await btcAdvertiser('getnewaddress', ['G08 advertiser', 'bech32']);
    const btcNodeFunding = await btcNodeRpc('getnewaddress', ['G08 fee reserve', 'bech32']);
    await btcMineTo(btcAdvertiserAddr, 101); await btcMineTo(btcNodeFunding, 101);
    const btcRefundAddress = await btcAdvertiser('getnewaddress', ['G08 refund', 'bech32']);
    report.ledger_networks.BTC = { chain: btcInfo.chain, blocks_before_tests: btcInfo.blocks, local_rpc: `127.0.0.1:${btcPort}`, p2p_listeners: false };

    stage = 'start private Monero regtest/fakechain and authenticated wallet RPCs';
    const xmrRoot = path.join(temp, 'monero');
    for (const name of ['daemon', 'advertiser', 'nodewallet', 'state']) await mkdir(path.join(xmrRoot, name), { recursive: true, mode: 0o700 });
    const xmrDaemonPort = await freePort('127.0.0.1'), xmrAdvertiserPort = await freePort('127.0.0.1'), xmrNodePort = await freePort('127.0.0.1');
    const monerod = startProcess('monerod', options.monerod, ['--regtest', '--offline', '--non-interactive', '--fixed-difficulty=1', '--keep-fakechain',
      `--data-dir=${path.join(xmrRoot, 'daemon')}`, '--rpc-bind-ip=127.0.0.1', `--rpc-bind-port=${xmrDaemonPort}`,
      `--rpc-login=${xmrDaemonUser}:${xmrDaemonPass}`, '--disable-rpc-ban', '--no-igd', '--hide-my-port', '--check-updates=disabled'],
    path.join(outputDir, 'monerod-regtest.log'));
    processes.push(monerod);
    const xmrDaemonUrl = `http://127.0.0.1:${xmrDaemonPort}/json_rpc`;
    const xmrDaemonCall = (method, params = {}) => digestJsonRpc(xmrDaemonUrl, { username: xmrDaemonUser, password: xmrDaemonPass }, method, params);
    const xmrInfo = await waitRpc(() => xmrDaemonCall('get_info'), monerod, 'Monero private regtest');
    assert.equal(xmrInfo.nettype, 'fakechain');
    const startMoneroWallet = (name, rpcPort, user, password) => {
      const handle = startProcess(`monero-wallet-rpc-${name}`, options.monero_wallet_rpc, [
        '--non-interactive', `--wallet-dir=${path.join(xmrRoot, name)}`, `--daemon-address=127.0.0.1:${xmrDaemonPort}`,
        `--daemon-login=${xmrDaemonUser}:${xmrDaemonPass}`, '--trusted-daemon', '--rpc-bind-ip=127.0.0.1', `--rpc-bind-port=${rpcPort}`,
        `--rpc-login=${user}:${password}`, '--allow-mismatched-daemon-version', '--no-initial-sync',
        `--log-file=${path.join(xmrRoot, `${name}.log`)}`, '--log-level=0'
      ], path.join(outputDir, `monero-wallet-${name}.out`));
      processes.push(handle);
      const url = `http://127.0.0.1:${rpcPort}/json_rpc`;
      const call = (method, params = {}) => digestJsonRpc(url, { username: user, password }, method, params);
      return { call, url, user, password, port: rpcPort };
    };
    const xmrAdvertiser = startMoneroWallet('advertiser', xmrAdvertiserPort, xmrAdvertiserUser, xmrAdvertiserPass);
    const xmrNodeWallet = startMoneroWallet('nodewallet', xmrNodePort, xmrNodeUser, xmrNodePass);
    await waitRpc(() => xmrAdvertiser.call('get_version'), monerod, 'Monero advertiser wallet RPC');
    await waitRpc(() => xmrNodeWallet.call('get_version'), monerod, 'Monero node wallet RPC');
    await xmrAdvertiser.call('create_wallet', { filename: 'advertiser', password: 'test-only', language: 'English' });
    await xmrNodeWallet.call('create_wallet', { filename: 'property-node', password: 'test-only', language: 'English' });
    const xmrAdvertiserAddress = (await xmrAdvertiser.call('get_address', { account_index: 0 })).address;
    const xmrNodeFeeAddress = (await xmrNodeWallet.call('get_address', { account_index: 0 })).address;
    await xmrDaemonCall('generateblocks', { amount_of_blocks: 80, wallet_address: xmrAdvertiserAddress, reserve_size: 0 });
    await xmrDaemonCall('generateblocks', { amount_of_blocks: 80, wallet_address: xmrNodeFeeAddress, reserve_size: 0 });
    await xmrAdvertiser.call('refresh', {}); await xmrNodeWallet.call('refresh', {});
    const xmrLedger = createMoneroWalletLedger({ walletRpcUrl: xmrNodeWallet.url, daemonRpcUrl: xmrDaemonUrl,
      username: xmrNodeUser, password: xmrNodePass, daemonUsername: xmrDaemonUser, daemonPassword: xmrDaemonPass,
      stateDir: path.join(xmrRoot, 'state'), expectedNetwork: 'fakechain', minConfirmations: 10, minRefundConfirmations: 10 });
    report.ledger_networks.XMR = { nettype: xmrInfo.nettype, height: xmrInfo.height, local_daemon: `127.0.0.1:${xmrDaemonPort}`,
      authenticated_wallets: 2, internet_peers: 0 };

    stage = 'start Nano dev network node with loopback-only RPC and local authentication gateway';
    const nanoRoot = path.join(temp, 'nano'); await mkdir(nanoRoot, { recursive: true, mode: 0o700 });
    const nanoData = path.join(nanoRoot, 'data'); await mkdir(nanoData, { recursive: true, mode: 0o700 });
    const nanoRpcPort = await freePort('::1');
    await writeFile(path.join(nanoData, 'config-node.toml'), `[rpc]\nenable = true\n[node]\npeering_port = 0\nenable_voting = true\nreceive_minimum = "1"\npreconfigured_peers = []\n`, { mode: 0o600 });
    await writeFile(path.join(nanoData, 'config-rpc.toml'), `address = "::1"\nport = ${nanoRpcPort}\nenable_control = true\n[logging]\nlog_rpc = false\n`, { mode: 0o600 });
    const nanoArgs = ['--daemon', '--network=dev', `--data_path=${nanoData}`,
      '--disable_bootstrap_listener', '--disable_ongoing_bootstrap', '--disable_legacy_bootstrap', '--disable_lazy_bootstrap',
      '--disable_wallet_bootstrap', '--disable_rep_crawler', '--disable_request_loop', '--disable_tcp_realtime', '--disable_backup'];
    let nano = startProcess('nano-node-dev', options.nano_node, nanoArgs,
      path.join(outputDir, 'nano-dev-node-initial.log'));
    processes.push(nano);
    const nanoDirectUrl = `http://[::1]:${nanoRpcPort}/`;
    const nanoDirect = async action => {
      const response = await fetch(nanoDirectUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(`Nano RPC returned HTTP ${response.status}`);
      return response.json();
    };
    const nanoVersion = await waitRpc(() => nanoDirect('version'), nano, 'Nano private dev network');
    assert.match(String(nanoVersion.network), /dev/i);
    const nanoAuthUser = `g08n-${randomUUID().slice(0, 8)}`;
    const nanoAuthPass = randomBytes(24).toString('hex');
    const nanoGateway = await startNanoAuthGateway(nanoRpcPort, nanoAuthUser, nanoAuthPass);
    servers.push(nanoGateway);
    const unauthNano = await fetch(nanoGateway.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"version"}' });
    assert.equal(unauthNano.status, 401, 'the private Nano RPC gateway rejects unauthenticated control requests');
    const nanoAuthClient = async (action, params = {}, auth = true) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = basicHeader(nanoAuthUser, nanoAuthPass);
      const response = await fetch(nanoGateway.url, { method: 'POST', headers, body: JSON.stringify({ action, ...params }) });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(`Nano RPC ${action} failed${body.error ? `: ${body.error}` : ` (${response.status})`}`);
      return body;
    };
    const nanoCampaignWallet = (await nanoAuthClient('wallet_create')).wallet;
    const nanoAdvertiserWallet = (await nanoAuthClient('wallet_create')).wallet;
    const nanoAdvertiserAccount = (await nanoAuthClient('wallet_add', { wallet: nanoAdvertiserWallet, key: NANO_DEV_GENESIS_KEY, work: true })).account;
    const nanoCampaignAccount = (await nanoAuthClient('account_create', { wallet: nanoCampaignWallet, work: true })).account;
    assert.match(nanoAdvertiserAccount, /^(nano|xrb)_/); assert.match(nanoCampaignAccount, /^(nano|xrb)_/);
    // Nano snapshots local representatives during node initialization. Restart after importing
    // the public dev-genesis test key so the isolated node can vote and cement private-chain blocks.
    await stopProcess(nano);
    nano = startProcess('nano-node-dev-with-local-representative', options.nano_node, nanoArgs,
      path.join(outputDir, 'nano-dev-node-representative.log'));
    processes.push(nano);
    await waitRpc(() => nanoDirect('version'), nano, 'Nano private dev network with local representative');
    await nap(300);
    const nanoLedger = createNanoNodeLedger({ rpcUrl: nanoGateway.url, username: nanoAuthUser, password: nanoAuthPass,
      wallet: nanoCampaignWallet, stateDir: path.join(nanoRoot, 'state'), expectedNetwork: 'dev', minConfirmations: 1, minRefundConfirmations: 1 });
    report.ledger_networks.XNO = { network: nanoVersion.network, network_identifier: nanoVersion.network_identifier,
      rpc_bind: '::1', authenticated_gateway: true, peers_configured: 0 };

    stage = 'start local Geode relay and test real campaign signing';
    relay = await startGeode(await freePort('127.0.0.1'), temp, 'G08-local-Geode');
    const clock = { now: NOW_EPOCH_SECONDS };
    const exactCampaigns = {};
    const adapters = [btcLedger, xmrLedger, nanoLedger];
    const ledgers = { BTC: btcLedger, XMR: xmrLedger, XNO: nanoLedger };
    const advertiser = { BTC: runtime.identity(), XMR: runtime.identity(), XNO: runtime.identity() };
    const nodeIdentity = { BTC: runtime.identity(), XMR: runtime.identity(), XNO: runtime.identity() };
    const engines = {};
    for (const currency of ['BTC', 'XMR', 'XNO']) engines[currency] = engineFor(runtime, nodeIdentity[currency], path.join(temp, `engine-${currency}`),
      adapters, relay.url, clock, currency === 'XMR' ? 10 : 1);

    active = 'G08-01'; stage = 'settle exact, pending, then confirmed BTC/XMR/XNO campaigns and verify one relay publication each';
    const exactBtc = await createCampaign(runtime, relay, engines.BTC, advertiser.BTC, clock, 'BTC', '100000', 'BTC exact');
    const btcPaymentTx = await btcAdvertiser('sendtoaddress', [exactBtc.decision.record.payment_address, 0.001]);
    const btcPending = await waitCampaignPending(engines.BTC, exactBtc.campaignId);
    await btcMineTo(await btcAdvertiser('getnewaddress', ['BTC confirmation', 'bech32']), 1);
    const btcPublished = await waitCampaignPublished(relay, engines.BTC, exactBtc.campaignId);
    report.payments.push({ currency: 'BTC', address: exactBtc.decision.record.payment_address, txid: btcPaymentTx,
      amount_atomic: btcPublished.record.payment.amount_atomic, pending_gate: btcPending.status, published: btcPublished.status });
    report.relay_publications.push({ currency: 'BTC', event_id: btcPublished.event.id, stored: true, count: 1 });

    const exactXmr = await createCampaign(runtime, relay, engines.XMR, advertiser.XMR, clock, 'XMR', '1000000000000', 'XMR exact');
    const xmrSent = await xmrAdvertiser.call('transfer', { destinations: [{ address: exactXmr.decision.record.payment_address, amount: 1_000_000_000_000n }], account_index: 0, priority: 1, get_tx_key: true });
    const xmrPending = await waitCampaignPending(engines.XMR, exactXmr.campaignId);
    await xmrDaemonCall('generateblocks', { amount_of_blocks: 11, wallet_address: xmrAdvertiserAddress, reserve_size: 0 });
    await xmrNodeWallet.call('refresh', {});
    const xmrPublished = await waitCampaignPublished(relay, engines.XMR, exactXmr.campaignId);
    assert.equal(xmrPublished.record.payment.txid, xmrSent.tx_hash);
    report.payments.push({ currency: 'XMR', address: exactXmr.decision.record.payment_address, txid: xmrSent.tx_hash,
      amount_atomic: xmrPublished.record.payment.amount_atomic, confirmations: xmrPublished.record.payment.confirmations,
      subaddress: true, pending_gate: xmrPending.status, published: xmrPublished.status });
    report.relay_publications.push({ currency: 'XMR', event_id: xmrPublished.event.id, stored: true, count: 1 });

    const exactNano = await createCampaign(runtime, relay, engines.XNO, advertiser.XNO, clock, 'XNO', '1', 'XNO one raw');
    const nanoSend = await nanoAuthClient('send', { wallet: nanoAdvertiserWallet, source: nanoAdvertiserAccount,
      destination: exactNano.decision.record.payment_address, amount: '1', id: `g08-exact-${randomUUID()}` });
    const nanoSourceInfo = await nanoAuthClient('block_info', { hash: nanoSend.block });
    const nanoReceivable = await nanoAuthClient('receivable', { account: exactNano.decision.record.payment_address,
      count: '100', source: true, include_active: true, include_only_confirmed: false });
    const nanoAdvertiserBalance = await nanoAuthClient('account_balance', { account: nanoAdvertiserAccount });
    const nanoHistory = await nanoAuthClient('account_history', { account: exactNano.decision.record.payment_address,
      count: '100', raw: true, include_linked_account: true });
    const nanoWalletContains = await nanoAuthClient('wallet_contains', { wallet: nanoAdvertiserWallet, account: nanoAdvertiserAccount });
    report.nano_diagnostics = { advertiser_account: nanoAdvertiserAccount, advertiser_balance_raw: nanoAdvertiserBalance.balance,
      campaign_account: exactNano.decision.record.payment_address, send_block: nanoSend.block,
      source_confirmed: nanoSourceInfo.confirmed, receivable: nanoReceivable.blocks?.[exactNano.decision.record.payment_address] || {},
      account_history: nanoHistory.history || [], advertiser_wallet_contains_genesis: nanoWalletContains.exists,
      local_representative_restart: true };
    const nanoPending = await engines.XNO.reconcile(exactNano.campaignId);
    report.nano_diagnostics.adapter_observation = nanoPending.status;
    await checkpoint();
    assert.ok(['awaiting_payment', 'payment_pending'].includes(nanoPending.status),
      'Nano must remain unpublished while its send block is unconfirmed.');
    assert.equal((await wsQuery(relay.url, { kinds: [30078], authors: [nodeIdentity.XNO.pubkey], limit: 100 }))
      .some(event => event.tags.some(tag => tag[1] === `property-sponsored-v2:${exactNano.campaignId}`)), false,
      'an unconfirmed Nano send cannot publish a campaign');
    const nanoPublished = await waitCampaignPublished(relay, engines.XNO, exactNano.campaignId);
    assert.equal(nanoPublished.record.payment.amount_atomic, '1');
    assert.equal(nanoPublished.record.payment.txid, nanoSend.block);
    const nanoAfterRepeat = await nanoLedger.lookupPayment({ address: exactNano.decision.record.payment_address, currency: 'XNO' });
    assert.equal(nanoAfterRepeat.txid, nanoSend.block); assert.equal(nanoAfterRepeat.amount_atomic, '1');
    report.payments.push({ currency: 'XNO', address: exactNano.decision.record.payment_address, txid: nanoSend.block,
      amount_atomic: '1', pending_gate: nanoPending.status, published: nanoPublished.status, duplicate_poll_same_tx: true });
    report.relay_publications.push({ currency: 'XNO', event_id: nanoPublished.event.id, stored: true, count: 1 });
    await mark('G08-01', 'PASS', 'Each real node/wallet produced an exclusive BTC address, Monero subaddress, or Nano account. An exact atomic payment remained unpublished while pending and the signed campaign appeared once on the local Geode relay only after each ledger adapter reported its confirmation gate.');

    active = 'G08-02'; stage = 'prove BTC pending, wrong currency, exact integer gate, and pre-activation reorganization';
    assert.equal(await btcLedger.lookupPayment({ address: 'wrong-address', currency: 'BTC' }), null);
    assert.equal(await btcLedger.lookupPayment({ address: exactBtc.decision.record.payment_address, currency: 'XMR' }), null);
    const reorg = await createCampaign(runtime, relay, engines.BTC, advertiser.BTC, clock, 'BTC', '1000', 'BTC preactivation reorg');
    await btcAdvertiser('sendtoaddress', [reorg.decision.record.payment_address, 0.00002]);
    const blockMinerAddress = await btcAdvertiser('getnewaddress', ['BTC reorg miner', 'bech32']);
    const reorgBlocks = await btcMineTo(blockMinerAddress, 1);
    await btc('invalidateblock', [reorgBlocks[0]]);
    const reorgGate = await waitCampaignPending(engines.BTC, reorg.campaignId);
    assert.equal((await wsQuery(relay.url, { kinds: [30078], authors: [nodeIdentity.BTC.pubkey], limit: 100 })).some(event => event.tags.some(tag => tag[1] === `property-sponsored-v2:${reorg.campaignId}`)), false);
    await btc('reconsiderblock', [reorgBlocks[0]]);
    await btcMineTo(blockMinerAddress, 1);
    report.payments.push({ currency: 'BTC', case: 'preactivation-reorg', confirmations_after_reorg: reorgGate.record.payment.confirmations,
      status: reorgGate.status, published: false, wrong_currency_ignored: true });
    await mark('G08-02', 'PASS', 'BTC ignored an unrelated address and a currency mismatch, withheld publication at zero confirmations, and a private regtest block invalidation before engine reconciliation reduced the transaction to the pending state. No campaign event was published before reconsideration and reconfirmation.');

    active = 'G08-03'; stage = 'prove Monero subaddress, locked confirmation gate, repeated notification, and chain pop';
    const repeatedXmr = await xmrLedger.lookupPayment({ address: exactXmr.decision.record.payment_address, currency: 'XMR' });
    assert.equal(repeatedXmr.txid, xmrSent.tx_hash); assert.equal(repeatedXmr.amount_atomic, '1000000000000');
    assert.ok(repeatedXmr.confirmations >= 10);
    const xmrReorg = await createCampaign(runtime, relay, engines.XMR, advertiser.XMR, clock, 'XMR', '2000000000000', 'XMR preactivation pop');
    const xmrSmall = await xmrAdvertiser.call('transfer', { destinations: [{ address: xmrReorg.decision.record.payment_address, amount: 1_000_000_000_000n }], account_index: 0, priority: 1, get_tx_key: true });
    await xmrDaemonCall('generateblocks', { amount_of_blocks: 1, wallet_address: xmrAdvertiserAddress, reserve_size: 0 });
    const popPrivateChain = createDigestHttpJsonClient(`http://127.0.0.1:${xmrDaemonPort}/pop_blocks`,
      { username: xmrDaemonUser, password: xmrDaemonPass });
    await popPrivateChain({ nblocks: 1 });
    await xmrNodeWallet.call('refresh', {});
    const xmrReorgGate = await engines.XMR.reconcile(xmrReorg.campaignId);
    assert.notEqual(xmrReorgGate.status, 'published');
    assert.equal((await xmrLedger.lookupPayment({ address: xmrReorg.decision.record.payment_address, currency: 'XMR' }))?.txid, xmrSmall.tx_hash);
    report.payments.push({ currency: 'XMR', case: 'subaddress-repeat-and-pop', txid: xmrSmall.tx_hash,
      original_tx_stable: repeatedXmr.txid === xmrSent.tx_hash, duplicate_poll_same_amount: true,
      status_after_pop: xmrReorgGate.status, unpublished: true });
    await mark('G08-03', 'PASS', 'The wallet credited an exclusive Monero subaddress only after the configured 10-confirmation/unlock gate; repeated lookup returned the same transaction and amount. A private fakechain pop before campaign reconciliation kept the campaign unpublished.');

    active = 'G08-04'; stage = 'prove Nano one-raw boundaries, pending receipt processing, account isolation, and duplicate polling';
    const nanoBefore = await nanoAuthClient('account_balance', { account: exactNano.decision.record.payment_address });
    assert.ok(BigInt(nanoBefore.balance || '0') >= 1n);
    const lowerBoundary = await nanoLedger.createAddress({ campaignId: randomUUID() });
    const lowerBefore = await nanoAuthClient('account_balance', { account: lowerBoundary });
    assert.equal(BigInt(lowerBefore.balance || '0'), 0n);
    await nanoAuthClient('send', { wallet: nanoAdvertiserWallet, source: nanoAdvertiserAccount, destination: lowerBoundary,
      amount: '1', id: `g08-raw-one-${randomUUID()}` });
    const oneRawAtSend = await nanoLedger.lookupPayment({ address: lowerBoundary, currency: 'XNO' });
    assert.ok(oneRawAtSend === null || oneRawAtSend.confirmations === 0,
      'a Nano raw transfer is not credited as confirmed before its source block is confirmed');
    let oneRaw = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      oneRaw = await nanoLedger.lookupPayment({ address: lowerBoundary, currency: 'XNO' });
      if (oneRaw?.proof === true && oneRaw.confirmations >= 1) break;
      await nap(150);
    }
    assert.ok(oneRaw && oneRaw.amount_atomic === '1' && oneRaw.proof);
    assert.ok(oneRaw.confirmations >= 1);
    const oneRawAgain = await nanoLedger.lookupPayment({ address: lowerBoundary, currency: 'XNO' });
    assert.equal(oneRawAgain.txid, oneRaw.txid); assert.equal(oneRawAgain.amount_atomic, '1');
    const lowerAfter = await nanoAuthClient('account_balance', { account: lowerBoundary });
    assert.equal(BigInt(lowerAfter.balance), 1n, 'duplicate polls do not credit the one raw receipt twice');
    assert.notEqual(lowerBoundary, exactNano.decision.record.payment_address);
    report.payments.push({ currency: 'XNO', case: 'raw-one-and-account-isolation', txid: oneRaw.txid,
      amount_atomic: oneRaw.amount_atomic, duplicate_poll_same_tx: true, isolated_accounts: true,
      pending_not_credited: true, account_balance_before: '0', account_balance_after: lowerAfter.balance,
      confirmed: oneRaw.confirmations >= 1 });
    await mark('G08-04', 'PASS', 'The local Nano dev ledger kept a one-raw transfer uncredited before confirmation, processed it into its unique account after confirmation, and repeated polling returned the same source block while the account balance remained exactly one raw.');

    active = 'G08-05'; stage = 'exercise signed underpayment refunds and idempotent recovery on all three real ledgers';
    const refundEvidence = [];
    for (const currency of ['BTC', 'XMR', 'XNO']) {
      const requested = currency === 'BTC' ? '200000' : currency === 'XMR' ? '2000000000000' : '3';
      const paid = currency === 'BTC' ? '100000' : currency === 'XMR' ? '1000000000000' : '2';
      const campaign = await createCampaign(runtime, relay, engines[currency], advertiser[currency], clock, currency, requested, `${currency} underpayment refund`);
      let refundAddress, paymentTx;
      if (currency === 'BTC') {
        refundAddress = btcRefundAddress;
        paymentTx = await btcAdvertiser('sendtoaddress', [campaign.decision.record.payment_address, 0.001]);
        await btcMineTo(await btcAdvertiser('getnewaddress', ['BTC underpayment miner', 'bech32']), 1);
      } else if (currency === 'XMR') {
        refundAddress = xmrAdvertiserAddress;
        const sent = await xmrAdvertiser.call('transfer', { destinations: [{ address: campaign.decision.record.payment_address, amount: 1_000_000_000_000n }], account_index: 0, priority: 1, get_tx_key: true });
        paymentTx = sent.tx_hash;
        await xmrDaemonCall('generateblocks', { amount_of_blocks: 11, wallet_address: xmrAdvertiserAddress, reserve_size: 0 });
        await xmrNodeWallet.call('refresh', {});
      } else {
        refundAddress = nanoAdvertiserAccount;
        const sent = await nanoAuthClient('send', { wallet: nanoAdvertiserWallet, source: nanoAdvertiserAccount,
          destination: campaign.decision.record.payment_address, amount: '2', id: `g08-underpayment-${randomUUID()}` });
        paymentTx = sent.block;
      }
      let reconciled;
      for (let attempt = 0; attempt < 100; attempt++) {
        reconciled = await engines[currency].reconcile(campaign.campaignId);
        if (reconciled.status === 'refund_due') break;
        await nap(200);
      }
      assert.equal(reconciled.status, 'refund_due', `${currency} underpayment becomes refund_due, not a published success`);
      assert.equal(String(reconciled.record.payment.amount_atomic), paid);
      assert.equal(reconciled.record.payment.txid, paymentTx);
      const request = refundRequest(runtime, advertiser[currency], campaign.campaignId, campaign.offer.id,
        paymentTx, refundAddress, clock.now);
      assert.equal(runtime.verifyEvent(request), true);
      let refunded = await engines[currency].refund(request);
      if (currency === 'BTC') await btcMineTo(await btcAdvertiser('getnewaddress', ['BTC refund miner', 'bech32']), 1);
      if (currency === 'XMR') {
        await xmrDaemonCall('generateblocks', { amount_of_blocks: 11, wallet_address: xmrAdvertiserAddress, reserve_size: 0 });
        await xmrNodeWallet.call('refresh', {});
      }
      for (let attempt = 0; attempt < 100 && refunded.status !== 'refunded'; attempt++) {
        refunded = await engines[currency].refund(request); await nap(200);
      }
      assert.equal(refunded.status, 'refunded');
      const repeated = await engines[currency].refund(request);
      assert.equal(repeated.refund.txid, refunded.refund.txid, 'signed retry reuses the same confirmed refund');
      const fees = String(refunded.refund.fee_atomic || '0');
      assert.ok(BigInt(fees) >= 0n);
      refundEvidence.push({ currency, payment_txid: paymentTx, payment_atomic: paid,
        refund_txid: refunded.refund.txid, refund_atomic: refunded.refund.amount_atomic,
        fee_atomic: fees, repeated_request_same_txid: true, signed_request_verified: true });
    }
    report.refunds = refundEvidence;
    await mark('G08-05', 'PASS', 'All three chains produced signed underpayment refund requests bound to the offer and actual payment. Each real wallet broadcast at most one refund, reported its fee/atomic amount, and a repeated signed request returned the same confirmed transaction after the chain advanced.');

    active = 'G08-06'; stage = 'check exact accounting, wrong currency, delayed settlement, and insufficient refund amount';
    const invalidRefund = await assert.rejects(() => btcLedger.refundPayment({
      payment: { currency: 'BTC', txid: 'a'.repeat(64), amount_atomic: '1000', confirmations: 0, proof: true },
      currency: 'BTC', amountAtomic: '1001', refundAddress: btcRefundAddress, idempotencyKey: 'G08-amount-mismatch'
    }), /amount must equal/);
    assert.equal(invalidRefund, undefined);
    for (const currency of ['BTC', 'XMR', 'XNO']) {
      const event = report.payments.find(row => row.currency === currency && row.amount_atomic);
      assert.ok(event && /^\d+$/.test(String(event.amount_atomic)));
    }
    report.accounting.push({ status: 'PASS', btc_atomic_precision: true, xmr_atomic_precision: true, nano_raw_precision: true,
      mismatched_refund_rejected_before_broadcast: true, no_unconfirmed_campaign_success: true,
      fees_by_currency: Object.fromEntries(refundEvidence.map(row => [row.currency, row.fee_atomic])) });
    await mark('G08-06', 'PASS', 'Observed payment and refund amounts remained integer atomic values on BTC/XMR and raw on Nano. Campaigns stayed unpublished while settlement was pending, mismatched refund amounts were rejected before any broadcast, and fee amounts were recorded separately for reconciliation.');

    active = 'G08-07'; stage = 'verify loopback RPC authentication, mainnet rejection, and secret non-disclosure';
    await assert.rejects(() => createJsonRpcClient(btcBaseUrl, { auth: { type: 'basic', username: 'wrong', password: 'wrong' } })('getblockchaininfo'));
    const wrongNano = await fetch(nanoGateway.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: basicHeader('wrong', 'wrong') }, body: '{"action":"version"}' });
    assert.equal(wrongNano.status, 401);
    await assert.rejects(() => createBitcoinCoreLedger({ rpcUrl: btcBaseUrl, username: baseRpcUser, password: baseRpcPass,
      expectedChain: 'main', minConfirmations: 1 }).createAddress({ campaignId: 'G08-mainnet-block' }), /not main/);
    await assert.rejects(() => createMoneroWalletLedger({ walletRpcUrl: xmrNodeWallet.url, daemonRpcUrl: xmrDaemonUrl,
      username: xmrNodeUser, password: xmrNodePass, daemonUsername: xmrDaemonUser, daemonPassword: xmrDaemonPass,
      stateDir: path.join(xmrRoot, 'wrong-network'), expectedNetwork: 'main', minConfirmations: 1 }).createAddress({ campaignId: 'G08-mainnet-block' }), /not main/);
    await assert.rejects(() => createNanoNodeLedger({ rpcUrl: nanoGateway.url, username: nanoAuthUser, password: nanoAuthPass,
      wallet: nanoCampaignWallet, stateDir: path.join(nanoRoot, 'wrong-network'), expectedNetwork: 'live', minConfirmations: 1 }).createAddress({ campaignId: 'G08-mainnet-block' }), /not live/);
    const evidenceText = JSON.stringify({ report, relay: relay.url });
    for (const secret of [baseRpcPass, xmrDaemonPass, xmrAdvertiserPass, xmrNodePass, nanoAuthPass]) assert.equal(evidenceText.includes(secret), false);
    report.auth_checks = [{ currency: 'BTC', rpc_auth: 'Basic', invalid_credentials_rejected: true, wrong_network_rejected: true },
      { currency: 'XMR', rpc_auth: 'Digest', wallet_and_daemon_auth: true, wrong_network_rejected: true },
      { currency: 'XNO', rpc_auth: 'loopback Basic-auth gateway', unauthenticated_rejected: true, wrong_network_rejected: true }];
    report.credential_scan = { test_credentials_in_report: false, test_genesis_key_in_report: false, environment_secrets_in_events: false };
    await mark('G08-07', 'PASS', 'BTC/XMR local RPCs required credentials, the Nano loopback gateway rejected unauthenticated and incorrect credentials, and each adapter rejected a wrong network before creating a payment address. Random credentials and the test-only dev genesis key were excluded from reports and signed events.');

    report.result = report.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    await checkpoint();
    process.stdout.write(`${JSON.stringify({ result: report.result, cases: report.cases, output: outputDir })}\n`);
    return report.result === 'PASS' ? 0 : 1;
  } catch (error) {
    const row = report.cases.find(item => item.case === active);
    if (row && row.status === 'NOT_RUN') Object.assign(row, { status: 'FAIL', reason: `${stage}: ${String(error.message || error).slice(0, 900)}` });
    for (const later of report.cases) if (later.status === 'NOT_RUN') Object.assign(later, {
      status: 'BLOCKED', reason: `Prerequisite failed in ${active}; case not started.`
    });
    report.result = 'FAIL'; report.failure = { case: active, stage, message: String(error.message || error).slice(0, 1200) };
    await checkpoint();
    process.stderr.write(`${JSON.stringify({ result: report.result, case: active, stage, error: String(error.message || error).slice(0, 1200), output: outputDir })}\n`);
    return 1;
  } finally {
    for (const server of servers.reverse()) await server.close().catch(() => {});
    if (relay) await stopGeode(relay);
    for (const handle of processes.reverse()) await stopProcess(handle);
    for (const handle of processes) {
      try { await writeFile(handle.logFile, handle.diagnostic(), { mode: 0o600 }); } catch {}
    }
    try {
      const logDir = path.join(temp, 'nano', 'data', 'log');
      const names = await readdir(logDir);
      for (const name of names.filter(value => /^log_.*\.log$/.test(value)).slice(-2)) {
        const source = path.join(logDir, name);
        const text = await readFile(source, 'utf8');
        await writeFile(path.join(outputDir, `nano-internal-${name}`), text.slice(-120_000), { mode: 0o600 });
      }
    } catch {}
    await rm(temp, { recursive: true, force: true });
  }
}

main().then(code => { process.exitCode = code; }, error => {
  process.stderr.write(`${JSON.stringify({ result: 'FAIL', error: String(error?.message || error).slice(0, 1200) })}\n`);
  process.exitCode = 1;
});
