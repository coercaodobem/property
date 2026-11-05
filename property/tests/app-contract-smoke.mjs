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
const chatSearch = await readFile(join(root, 'web/chat-search.js'), 'utf8');
const relayDefaults = await readFile(join(root, 'web/relay-defaults.js'), 'utf8');
const shareInbox = await readFile(join(root, 'web/share-inbox.js'), 'utf8');
const pwa = await readFile(join(root, 'web/pwa.js'), 'utf8');
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
const ghostlyArchiveReadme = await readFile(join(root, '../archive/ghostly-source/apps/web/README.md'), 'utf8');
const ghostlyArchivePackage = await readFile(join(root, '../archive/ghostly-source/apps/web/package.json'), 'utf8');
const ghostlyArchiveVite = await readFile(join(root, '../archive/ghostly-source/apps/web/vite.config.ts'), 'utf8');
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
assert.match(html, /\.\/chat-search\.js/);
assert.match(html, /\.\/pwa\.js\?v=property-v33/);
assert.match(html, /\.\/i18n\.js\?v=property-v34/);
assert.match(html, /\.\/app\.js\?v=property-v34/);
assert.match(sw, /chat-search\.js/);
assert.match(sw, /pwa\.js\?v=property-v33/);
assert.match(html, /data-install-property/);
assert.match(html, /id="install-app-dialog"/);
assert.match(html, /id="message-search-bar"/);
assert.match(html, /id="message-search-button"/);
assert.match(app, /MessageSearch\.findMessageIds/);
assert.match(app, /MessageSearch\.matchRanges/);
assert.doesNotMatch(chatSearch, /\bfetch\s*\(|\bWebSocket\b|\binnerHTML\b/, 'in-chat search only filters local text and never parses message text as HTML');
assert.doesNotMatch(html, /Property Direct|property\/direct/i, 'the shipped app has no separate Direct product or route');
assert.match(ghostlyArchiveReadme, /Archived Ghostly source reference/);
assert.match(ghostlyArchiveReadme, /not built or published by the Property Pages workflow/);
assert.doesNotMatch(ghostlyArchiveReadme, /Property Direct|property\/direct/i, 'archived Ghostly source is not described as another Property product');
assert.match(ghostlyArchivePackage, /Archived upstream Ghostly browser client retained for local UX research/);
assert.doesNotMatch(ghostlyArchivePackage, /Property Direct|property\/direct/i, 'archived metadata does not label a second Property product');
assert.doesNotMatch(ghostlyArchiveVite, /property\/direct/i, 'archived build config does not create a Property sub-app route');
assert.match(html, /id="mobile-open-conversations"[^>]*aria-controls="conversation-list"/);
assert.match(html, /id="close-mobile-conversations"/);
assert.match(app, /setMobileConversationListOpen\(true, \{ focus: true \}\)/);
assert.match(app, /knownConversations\.length\) setMobileConversationListOpen\(true\)/);
assert.match(css, /workspace\.mobile-conversations-open \.sidebar/);
assert.match(pagesWorkflow, /path:\s*property\/web/);
await assert.rejects(access(join(root, 'web/direct')), 'the Pages bundle contains no second browser app');
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
assert.match(app, /RelayDefaults\.initialSelection\(relaySettings\)/, 'fresh installs select bundled relay suggestions automatically');
assert.match(app, /autoSelected: true/, 'the generated relay selection is saved locally');
assert.match(app, /if \(!state\.pubkey && !state\.bridgeEnabled\) return/, 'relay suggestions do not connect before identity activation');
assert.match(html, /randomly picks two relays from a list included in the app/);
assert.match(html, /Choose another random pair/);
assert.match(html, /Public relays can see your IP address and public event metadata/);
assert.match(app, /const inboxSuggestion = state\.inboxRelays\.length \? state\.inboxRelays : state\.relays\.slice\(0, 3\)/, 'an unset inbox list is prefilled from the selected relays');
assert.match(app, /publishInboxRelayList\(\)\.catch\(error => showError\('relay-error'/, 'publishing the public inbox list remains an explicit user action');
assert.match(app, /if \(!state\.inboxRelays\.length\) \$\('dm-relay-input'\)\.value = selection\.slice\(0, 3\)\.join\('\\n'\)/, 'choosing a new random general-relay pair updates the unsaved inbox suggestion too');
assert.match(html, /id="inbox-relay-note"/);
assert.match(html, /Publishing makes the relay URLs public as NIP-17 routing metadata/);
assert.match(html, /\.\/relay-defaults\.js/);
assert.match(sw, /relay-defaults\.js/);
assert.match(html, /\.\/share-inbox\.js\?v=property-v33/);
assert.match(sw, /share-inbox\.js\?v=property-v33/);
assert.match(shareInbox, /MAX_PENDING = 10/);
assert.match(shareInbox, /MAX_REQUEST_BYTES = 64 \* 1024/);
assert.match(app, /ShareInbox\.formatText/);
assert.match(app, /prepareShareDraft\(/);
assert.match(app, /ShareInbox\.remove\(sentShareId\)/, 'a shared item is removed only after the user sends from the normal conversation composer');
assert.ok(manifest.share_target && typeof manifest.share_target === 'object');
assert.equal(manifest.share_target.method, 'POST');
assert.equal(manifest.share_target.enctype, 'application/x-www-form-urlencoded');
assert.deepEqual(Object.values(manifest.share_target.params), ['title', 'text', 'url']);
assert.doesNotMatch(JSON.stringify(manifest.share_target), /files/i, 'the Property share target never requests shared files');
assert.match(sw, /request\.body\.getReader/, 'incoming content is read with a byte limit');
assert.match(sw, /target\.searchParams\.set\('launch', result\)/, 'shared content is never placed in the redirect URL');
assert.match(html, /id="share-item-preview"[^>]*data-user-content/, 'external text is isolated from the translation layer');
assert.match(html, /id="share-use-draft"/);
assert.match(html, /id="share-discard"/);
assert.match(html, /id="share-later"/);
assert.match(app, /Pwa\.consumeLaunchAction\(\)/, 'PWA shortcut launch actions are consumed only by the Property app');
assert.match(app, /state\.pendingLaunchAction = ''/, 'shortcut actions are applied only once after the identity activates');
assert.match(pwa, /LAUNCH_ACTIONS = new Set\(\['new-chat', 'hangout', 'marketplace', 'node', 'saved', 'share', 'share-full', 'share-error'\]\)/);
assert.match(pwa, /beforeinstallprompt/);
assert.match(pwa, /appinstalled/);
assert.match(relayDefaults, /wss:\/\/relay\.damus\.io/);
assert.match(relayDefaults, /wss:\/\/nos\.lol/);
assert.match(app, /mobile-conversations-open/);
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
assert.match(app, /const isAgentProtocol = !group && rumor\.content\.includes\(AgentMessages\.PROTOCOL\)/, 'agent envelopes stay scoped to direct conversations and do not redefine group chat');
assert.match(html, /id="group-dialog"/, 'private groups are a dialog inside the single Property PWA');
assert.match(app, /Routing\.planGroupGiftWraps\(/, 'group delivery uses Property’s existing NIP-17 relay routing');
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
assert.match(app, /N\.nip59\.createWrap\(N\.nip59\.createSeal/, 'Property seals one shared NIP-17 rumor separately for each direct or group participant');
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
const pagesActions = pagesWorkflow.split('\n').filter(line => /^\s*uses:\s*/.test(line));
assert.ok(pagesActions.length > 0 && pagesActions.every(line => /uses:\s*[\w-]+\/[\w-]+@[0-9a-f]{40}(?:\s|$)/.test(line)), 'every workflow action is pinned to a commit SHA');
const pagesBase = new URL('https://coercaodobem.github.io/property/');
const shellMatch = sw.match(/const SHELL = \[(.*?)\];/s);
assert.ok(shellMatch, 'service worker declares its offline shell');
const shellPaths = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const pagePaths = [...`${html}\n${about}`.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(manifest.shortcuts.map(shortcut => shortcut.url), ['./?launch=new-chat', './?launch=marketplace', './?launch=hangout']);
const manifestPaths = [manifest.start_url, manifest.scope, ...manifest.icons.map(icon => icon.src),
  ...manifest.shortcuts.flatMap(shortcut => [shortcut.url, ...shortcut.icons.map(icon => icon.src)])];
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
assert.doesNotMatch(`${app}\n${sw}`, /\bimport\s*\(\s*["']https?:/i,
  'the app and service worker cannot import remote executable code');
assert.match(sw, /importScripts\('\.\/share-inbox\.js\?v=property-v33'\);/,
  'the service worker imports only Property local source for the share inbox');
for (const localPath of ['./about.html', './styles.css', './relay-defaults.js', './share-inbox.js', './vault.js', './routing.js', './forwarding.js', './nano.js', './money.js', './marketplace.js', './campaigns.js', './contact.js', './agent-messaging.js', './manifest.webmanifest', './assets/icon.svg', './vendor/nostr-tools-2.25.2.bundle.js', './app.js']) {
  await access(join(root, 'web', localPath));
}
await access(join(root, 'relay/dist-parts/manifest.txt'));
const syntax = spawnSync('node', ['--check', join(root, 'web/app.js')], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
const bash = spawnSync('bash', ['-n', join(root, 'relay/start.sh')], { encoding: 'utf8' });
assert.equal(bash.status, 0, bash.stderr || bash.stdout);
assert.ok(css.length > 5000, 'responsive app styles exist');
console.log('PASS: local-only web assets, CSP, unified Property PWA packaging, segmented relay package, pinned Pages workflow, no eval, JS/shell syntax');
