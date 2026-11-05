import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'web/index.html'), 'utf8');
const about = await readFile(join(root, 'web/about.html'), 'utf8');
const manifest = JSON.parse(await readFile(join(root, 'web/manifest.webmanifest'), 'utf8'));
const app = await readFile(join(root, 'web/app.js'), 'utf8');
const contact = await readFile(join(root, 'web/contact.js'), 'utf8');
const agentMessages = await readFile(join(root, 'web/agent-messaging.js'), 'utf8');
const sw = await readFile(join(root, 'web/sw.js'), 'utf8');
const vault = await readFile(join(root, 'web/vault.js'), 'utf8');
const routing = await readFile(join(root, 'web/routing.js'), 'utf8');
const forwarding = await readFile(join(root, 'web/forwarding.js'), 'utf8');
const nano = await readFile(join(root, 'web/nano.js'), 'utf8');
const marketplace = await readFile(join(root, 'web/marketplace.js'), 'utf8');
const campaigns = await readFile(join(root, 'web/campaigns.js'), 'utf8');
const css = await readFile(join(root, 'web/styles.css'), 'utf8');
const pagesWorkflow = await readFile(join(root, '../.github/workflows/property-pages.yml'), 'utf8');
const relayLauncher = await readFile(join(root, 'relay/start.sh'), 'utf8');
assert.match(html, /Content-Security-Policy/);
assert.match(html, /vendor\/nostr-tools-2\.25\.2\.bundle\.js/);
assert.match(html, /rel="manifest"/);
assert.match(html, /href="\.\/about\.html"/);
assert.match(about, /Content-Security-Policy/);
assert.match(about, /Identity and messages/);
assert.doesNotMatch(about, /<script\b/i, 'about page has no executable scripts');
assert.doesNotMatch(about, /(?:src|href)=["']https?:/i, 'about page has no external runtime resources');
assert.match(sw, /nostr-tools-2\.25\.2\.bundle\.js/);
assert.match(sw, /vault\.js/);
assert.match(sw, /about\.html/);
assert.match(html, /\.\/vault\.js/);
assert.match(html, /\.\/routing\.js/);
assert.match(html, /\.\/forwarding\.js/);
assert.match(sw, /routing\.js/);
assert.match(sw, /forwarding\.js/);
assert.match(html, /\.\/nano\.js/);
assert.match(sw, /nano\.js/);
assert.match(html, /\.\/marketplace\.js/);
assert.match(sw, /marketplace\.js/);
assert.match(html, /\.\/campaigns\.js/);
assert.match(sw, /campaigns\.js/);
assert.match(sw, /const CACHE = 'property-shell-v\d+'/);
assert.match(html, /id="locked-node-status"/, 'locked identity shows an explicit active public-node status');
assert.match(html, /id="stop-locked-node"/, 'locked user can stop the opt-in public bridge');
assert.match(app, /lockIdentity\(\{ preservePublicBridge = false \} = \{\}\)/, 'manual lock and idle lock have separate bridge behavior');
assert.match(app, /lockIdentity\(\{ preservePublicBridge: true \}\)/, 'idle lock clears identity but retains the opt-in public bridge');
assert.match(app, /state\.bridgeEnabled && state\.relays\.includes\(url\)/, 'public bridge can reconnect without an unlocked identity');
assert.match(app, /relays: \[\],/, 'fresh installs have no configured relays');
assert.match(app, /const PUBLIC_RELAY_EXAMPLES = \['wss:\/\/relay\.damus\.io', 'wss:\/\/nos\.lol'\]/);
assert.match(app, /PUBLIC_RELAY_EXAMPLES\.join/);
assert.match(html, /No relay is configured automatically/);
assert.match(html, /Load public examples/);
assert.match(app, /Campaigns\.selectSponsoredCampaigns/);
assert.match(html, /\.\/contact\.js/);
assert.doesNotMatch(html, /agent-pairing\.js|agent-invite|approve-agent-invite/, 'PWA no longer loads an invitation or approval flow');
assert.match(html, /\.\/agent-messaging\.js/);
assert.match(sw, /agent-messaging\.js/);
assert.match(agentMessages, /property-agent-message\/v1/);
assert.match(app, /AgentMessages\.decodeEnvelope/);
assert.doesNotMatch(app, /agentConversationStarted|agentPairing|approveAgentInvite|inspectAgentInvite/, 'the active app has no agent pairing gate');
assert.match(app, /AgentMessages\.encodeEnvelope\(/, 'human messages to an agent carry a versioned request envelope');
assert.match(app, /previous\.agent === true/, 'a user can choose the agent protocol for one direct conversation');
assert.match(app, /const isAgentProtocol = rumor\.content\.includes\(AgentMessages\.PROTOCOL\)/, 'valid agent messages do not require pairing or a preceding human request');
assert.match(app, /message\.text/);
assert.match(html, /id="open-agent-manager"/);
assert.match(html, /id="agent-mode" type="checkbox"/);
assert.match(html, /There are no invitations, pairing, or per-message approvals/);
assert.doesNotMatch(sw, /agent-pairing\.js/);
await assert.rejects(access(join(root, 'web/agent-pairing.js')), 'obsolete approval-flow module must not be shipped');
assert.match(app, /Contact\.parsePublicKey/);
assert.match(contact, /não busca nomes de usuário/);
assert.match(sw, /contact\.js/);
assert.match(app, /campaigns-\$\{state\.pubkey\}/);
assert.match(app, /noopener noreferrer/);
assert.match(about, /A node signature does not confirm payment on the Bitcoin, Monero, or Nano networks/i);
assert.match(html, /id="show-node-campaigns" type="checkbox"/);
assert.match(campaigns, /verifyEvent\(event\)/);
assert.match(app, /navigator\.serviceWorker\.register/);
assert.match(vault, /iterations: ITERATIONS/);
assert.match(sw, /caches\.match/);
assert.match(vault, /const ITERATIONS = 600000/);
assert.match(app, /Vault\.createVault/);
assert.match(app, /nip17\.wrapManyEvents/);
assert.match(app, /planGiftWraps/);
assert.match(app, /forwardRelayEvent/);
assert.match(app, /startBridgeSubscription/);
assert.match(app, /browser-bridge/);
assert.match(app, /forwardInboxGiftWrap/);
assert.match(app, /price_raw/);
assert.match(app, /Marketplace\.displayPrice/);
assert.match(app, /Marketplace\.selectActiveProducts/);
assert.match(app, /Marketplace\.makeProductDeletion/);
assert.match(app, /eventSourceHints/);
assert.match(app, /sources\.add\(url\)/);
assert.match(html, /id="delete-product-dialog"/);
assert.match(html, /id="product-dialog-title"/);
assert.match(app, /publishInboxRelayList/);
assert.match(routing, /event\.kind !== 10050/);
assert.match(forwarding, /verifyEvent/);
assert.match(forwarding, /MAX_EVENTS_PER_MINUTE/);
assert.match(nano, /10n \*\* 30n/);
assert.match(nano, /xnoToRaw/);
assert.match(nano, /rawToXno/);
assert.match(marketplace, /price_raw/);
assert.match(marketplace, /selectActiveProducts/);
assert.match(marketplace, /makeProductDeletion/);
assert.match(marketplace, /safeExternalImageUrl/);
assert.match(marketplace, /toAtomic/);
assert.match(html, /id="product-currency"/);
assert.match(html, /\.\/money\.js/);
assert.match(sw, /money\.js/);
assert.match(relayLauncher, /PACKAGE_PARTS_DIR/);
assert.match(relayLauncher, /PORTABLE_SHA256/);
assert.ok(app.includes('finalize(30018,'));
assert.match(app, /kinds: \[1\]/);
assert.doesNotMatch(app, /\beval\s*\(|new Function\s*\(/);
assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, 'runtime JavaScript must be local');
assert.doesNotMatch(html, /<link[^>]+href=["']https?:[^"']+\.css/i, 'runtime CSS must be local');
for (const action of ['actions/checkout', 'actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages']) {
  assert.ok(pagesWorkflow.includes(action), `Pages workflow includes ${action}`);
}
assert.equal([...pagesWorkflow.matchAll(/uses:\s*[\w-]+\/[\w-]+@[0-9a-f]{40}/g)].length, 5, 'every workflow action is pinned to a commit SHA');
const pagesBase = new URL('https://coercaodobem.github.io/property/');
const shellMatch = sw.match(/const SHELL = \[(.*?)\];/s);
assert.ok(shellMatch, 'service worker declares its offline shell');
const shellPaths = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const pagePaths = [...`${html}\n${about}`.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
const manifestPaths = [manifest.start_url, manifest.scope, ...manifest.icons.map(icon => icon.src)];
for (const path of [...shellPaths, ...pagePaths, ...manifestPaths]) {
  const resolved = new URL(path, pagesBase);
  assert.equal(resolved.origin, pagesBase.origin, `static reference stays on the Pages origin: ${path}`);
  assert.ok(resolved.pathname.startsWith('/property/'), `static reference stays under the repository path: ${path}`);
}
const webRoot = join(root, 'web');
async function localAssetPath(reference, label) {
  const resolved = new URL(reference, pagesBase);
  assert.equal(resolved.origin, pagesBase.origin, `${label} must stay on the app origin: ${reference}`);
  assert.ok(resolved.pathname.startsWith('/property/'), `${label} must stay under /property/: ${reference}`);
  const relativePath = decodeURIComponent(resolved.pathname.slice('/property/'.length));
  const absolutePath = resolve(webRoot, relativePath);
  assert.ok(absolutePath === webRoot || absolutePath.startsWith(webRoot + sep), `${label} cannot escape the local web bundle: ${reference}`);
  await access(absolutePath);
  return resolved.pathname;
}
function collectStaticReferences(markup) {
  const references = new Set();
  for (const pattern of [
    /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["']/gi,
    /<(?:img|source|video|audio|track|iframe)\b[^>]*\bsrc=["']([^"']+)["']/gi
  ]) for (const match of markup.matchAll(pattern)) references.add(match[1]);
  return references;
}
const shellPathnames = new Set();
assert.doesNotMatch(pagesWorkflow, /property\/direct|npm run build:web/, 'Pages publishes only the unified Property PWA');
await assert.rejects(access(join(root, 'direct')), { code: 'ENOENT' }, 'the separate app is absent from the Property product tree');
await assert.rejects(access(join(webRoot, 'direct')), { code: 'ENOENT' }, 'Property has no separate or legacy /direct app route');
for (const path of shellPaths) {
  shellPathnames.add(await localAssetPath(path, 'service-worker precache entry'));
}
for (const path of new Set([manifest.start_url, './index.html', './about.html'])) {
  const pathname = await localAssetPath(path, 'offline navigation document');
  assert.ok(shellPathnames.has(pathname), `offline service-worker shell must precache navigation document ${path}`);
}
const staticReferences = new Set([
  ...collectStaticReferences(html),
  ...collectStaticReferences(about),
  ...manifest.icons.map(icon => icon.src),
  ...[...css.matchAll(/url\(\s*(?:["']([^"']+)["']|([^)'"\s]+))\s*\)/gi)].map(match => match[1] || match[2]),
  ...[...css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)].map(match => match[1])
]);
for (const reference of staticReferences) {
  if (/^data:/i.test(reference)) continue;
  const pathname = await localAssetPath(reference, 'static shell dependency');
  assert.ok(shellPathnames.has(pathname), `offline service-worker shell must precache ${reference}`);
}
const workerRegistration = app.match(/navigator\.serviceWorker\.register\(\s*["']([^"']+)["']/);
assert.ok(workerRegistration, 'PWA registers a service worker');
await localAssetPath(workerRegistration[1], 'service-worker script');
assert.doesNotMatch(`${html}\n${about}`, /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:)?\/\//i,
  'HTML cannot load executable code or styles from another origin');
assert.doesNotMatch(`${app}\n${sw}`, /\bimportScripts\s*\(|\bimport\s*\(\s*["']https?:/i,
  'the app and service worker cannot import remote executable code');
for (const localPath of ['./about.html', './styles.css', './vault.js', './routing.js', './forwarding.js', './nano.js', './money.js', './marketplace.js', './campaigns.js', './contact.js', './agent-messaging.js', './manifest.webmanifest', './assets/icon.svg', './vendor/nostr-tools-2.25.2.bundle.js', './app.js']) {
  await access(join(root, 'web', localPath));
}
await access(join(root, 'relay/dist-parts/manifest.txt'));
const syntax = spawnSync('node', ['--check', join(root, 'web/app.js')], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
const bash = spawnSync('bash', ['-n', join(root, 'relay/start.sh')], { encoding: 'utf8' });
assert.equal(bash.status, 0, bash.stderr || bash.stdout);
assert.ok(css.length > 5000, 'responsive app styles exist');
console.log('PASS: local-only web assets, CSP, unified Property PWA packaging, segmented relay package, pinned Pages workflow, no eval, JS/shell syntax');
