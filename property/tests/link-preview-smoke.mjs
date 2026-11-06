import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/link-preview.js', import.meta.url), 'utf8');
const sandbox = { URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source, sandbox, { filename: 'link-preview.js' });
const preview = sandbox.PropertyLinkPreview;

const url = 'https://news.example.test/story?id=4';
assert.equal(preview.publicHttpsUrl('HTTPS://News.Example.test:443/story?id=4'), url);
assert.equal(preview.publicHttpsUrl('http://news.example.test/story'), null);
assert.equal(preview.publicHttpsUrl('https://user:secret@news.example.test/story'), null);
assert.equal(preview.publicHttpsUrl('https://127.0.0.1/admin'), null);
assert.equal(preview.publicHttpsUrl('https://[::1]/admin'), null);
assert.equal(preview.publicHttpsUrl('https://printer.local/admin'), null);
assert.equal(preview.publicHttpsUrl('https://news.example.test:8443/story'), null);
assert.equal(preview.firstLink('See https://news.example.test/story?id=4).'), url);
assert.equal(preview.firstLink('```https://news.example.test/story``` no public link'), null);

const html = `<!doctype html><html><head><title>Fallback title</title>
  <meta property="og:site_name" content="News &amp; Notes">
  <meta property="og:title" content="A useful &amp; safe title">
  <meta name="description" content="Details from the page &lt;em&gt;as text&lt;/em&gt;">
  <script>const fake = '<meta property="og:title" content="wrong">';</script>
</head><body><meta property="og:title" content="body value"><img src="https://tracker.example/pixel"></body></html>`;
const parsed = preview.parsePage(html, url);
assert.deepEqual(JSON.parse(JSON.stringify(parsed)), {
  v: 1, url, title: 'A useful & safe title', description: 'Details from the page <em>as text</em>', site: 'News & Notes'
});
assert.equal(preview.parsePage('<html><head><title>Local</title></head></html>', 'http://news.example.test'), null);
assert.equal(preview.parsePage('x'.repeat(preview.MAX_HTML_BYTES + 1), url), null);

const previewTag = preview.toTag(parsed, `Read this: ${url}`);
assert.equal(previewTag[0], preview.TAG);
assert.equal(JSON.stringify(preview.fromTags([previewTag], `Read this: ${url}`)), JSON.stringify(parsed));
assert.equal(preview.fromTags([previewTag], 'The link was removed'), null, 'a preview cannot detach from the link in the message');
assert.equal(preview.fromTags([previewTag, previewTag], `Read this: ${url}`), null, 'duplicate preview tags fail closed');
assert.equal(preview.fromTags([[preview.TAG, 'x'.repeat(preview.MAX_TAG_BYTES + 1)]], `Read this: ${url}`), null);
assert.equal(preview.toTag({ ...parsed, url: 'https://other.example.test/' }, `Read this: ${url}`), null);

let request;
const fetched = await preview.fetchPreview(url, async (requestedUrl, options) => {
  request = { url: requestedUrl, options };
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
});
assert.equal(fetched.title, 'A useful & safe title');
assert.equal(request.url, url);
assert.equal(request.options.method, 'GET');
assert.equal(request.options.credentials, 'omit');
assert.equal(request.options.referrerPolicy, 'no-referrer');
assert.equal(request.options.redirect, 'error');
assert.equal(request.options.cache, 'no-store');
assert.equal(request.options.headers.Accept, 'text/html');
let forbiddenCalls = 0;
assert.equal(await preview.fetchPreview('https://192.168.1.1/admin', async () => { forbiddenCalls++; }), null);
assert.equal(await preview.fetchPreview('http://news.example.test/story', async () => { forbiddenCalls++; }), null);
assert.equal(forbiddenCalls, 0, 'invalid and local targets are rejected before making a request');
assert.equal(await preview.fetchPreview(url, async () => ({ ok: true, redirected: true, headers: { get: () => 'text/html' } })), null);
assert.equal(await preview.fetchPreview(url, async () => new Response('image', { status: 200, headers: { 'content-type': 'image/png' } })), null);
assert.equal(await preview.fetchPreview(url, async () => new Response('x'.repeat(preview.MAX_HTML_BYTES + 1), { status: 200, headers: { 'content-type': 'text/html' } })), null);

console.log('PASS: link previews are opt-in data, bounded, HTTPS-only, credential/referrer/redirect-free, text-only and tied to the encrypted message link');
