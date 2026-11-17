import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(join(root, path), 'utf8');
const [html, app, about, aboutPtBR, i18n, sw, helper] = await Promise.all([
  read('web/index.html'), read('web/app.js'), read('web/about.html'), read('web/about.pt-BR.html'),
  read('web/i18n.js'), read('web/sw.js'), read('web/explore-feed.js')
]);

const sandbox = { window: {} };
vm.runInNewContext(helper, sandbox, { filename: 'explore-feed.js' });
const feed = sandbox.window.PropertyExploreFeed;
assert.ok(feed, 'the local Explore feed helper is available');

const event = (id, kind, created_at, content) => ({ id: id.repeat(64), pubkey: 'a'.repeat(64), kind, created_at, content });
const fixtures = [
  event('1', 1, 10, 'public older'),
  event('2', 1059, 30, 'PRIVATE MESSAGE MUST NOT APPEAR'),
  event('3', 14, 20, 'private rumor event'),
  event('4', 1, 40, 'public newer'),
  event('4', 1, 50, 'duplicate ID'),
  { ...event('5', 1, 60, 'invalid'), pubkey: 'bad' }
];
const posts = JSON.parse(JSON.stringify(feed.publicPosts(fixtures, item => item.kind === 1)));
assert.deepEqual(posts.map(item => item.content), ['public newer', 'public older']);
assert.equal(posts.filter(item => item.id === '4'.repeat(64)).length, 1, 'duplicate event IDs are collapsed');
assert.ok(posts.every(item => item.kind === 1), 'only validated public-note fixtures reach the view');
assert.equal(feed.state({ loading: true, online: false }), 'loading');
assert.equal(feed.state({ online: false, count: 0 }), 'offline');
assert.equal(feed.state({ online: true, count: 0 }), 'empty');
assert.equal(feed.state({ online: true, count: 2 }), 'ready');
assert.equal(feed.state({ error: true, online: true }), 'error');
assert.equal(feed.canWrite({ guestReadOnly: true, secret: null, pubkey: '' }), false);
assert.equal(feed.canWrite({ guestReadOnly: false, secret: new Uint8Array([1]), pubkey: '' }), false);
assert.equal(feed.canWrite({ guestReadOnly: false, secret: new Uint8Array([1]), pubkey: 'a'.repeat(64) }), true);

assert.match(html, /<body class="guest-mode">/);
assert.match(html, /id="auth-screen" class="auth-layout hidden"/);
assert.match(html, /id="workspace" class="workspace"/);
assert.match(html, /data-view="hangout"[^>]*>[\s\S]*?<span>Explore<\/span>/);
assert.match(html, /id="guest-messages-view"/);
assert.match(html, /id="hangout-list"[^>]*aria-busy="true"/);
assert.ok(html.indexOf('explore-feed.js') < html.indexOf('app.js'), 'feed policy loads before the app');
assert.match(sw, /explore-feed\.js\?v=property-v1/, 'the PWA caches the feed policy offline');
assert.match(app, /fetchEvents\(\{ kinds: \[1\], limit: 50 \}\)/, 'Explore requests public kind 1 events');
assert.match(app, /PropertyExploreFeed\.publicPosts\(events, event => isProtocolEvent\(event, 'public_note'\)\)/);
assert.match(app, /state\.guestReadOnly \? \{ enabled: false \} : await getCampaignSettings\(\)/);
assert.match(app, /if \(!PropertyExploreFeed\.canWrite\(state\)\) \{ openGuestIdentityPrompt\(\); return; \}[\s\S]*?const event = finalize\(1, content\)/, 'guest publishing exits before event signing');
assert.match(app, /if \(!PropertyExploreFeed\.canWrite\(state\)\) throw new Error\(localized\('Sign in or create an identity before publishing\.'/);
assert.ok(html.includes('data-view="messages"'), 'the existing conversation navigation remains available');
assert.match(about, /Open Explore/);
assert.match(aboutPtBR, /Abrir Explorar/);
assert.match(about, /Browse public posts before creating an identity/);
assert.match(aboutPtBR, /Navegue pelas publicações públicas antes de criar uma identidade/);
assert.match(about, /<a class="button primary" href="\.\/index\.html">Open Explore/);
assert.match(aboutPtBR, /<a class="button primary" href="\.\/index\.html">Abrir Explorar/);
assert.ok(about.indexOf('<h3>Browse public posts</h3>') < about.indexOf('<h3>Create your local identity</h3>'), 'About presents public reading before identity creation');
assert.ok(aboutPtBR.indexOf('<h3>Navegue pelas publicações públicas</h3>') < aboutPtBR.indexOf('<h3>Crie sua identidade local</h3>'), 'the Brazilian Portuguese About page presents public reading first');
assert.match(i18n, /\['Explore', 'Explorar'\]/);
assert.match(i18n, /\['Feed is offline', 'Feed offline'\]/);
assert.match(i18n, /\['Back to Explore', 'Voltar para Explorar'\]/);

console.log('PASS: Explore fixtures, public-only filtering, feed states, guest write boundary, navigation, offline shell, About and localization.');
