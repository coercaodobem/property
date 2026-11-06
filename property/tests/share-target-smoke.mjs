import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { File } from 'node:buffer';
import vm from 'node:vm';

const [helperSource, workerSource, manifestSource, html] = await Promise.all([
  readFile(new URL('../web/share-inbox.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/manifest.webmanifest', import.meta.url), 'utf8'),
  readFile(new URL('../web/index.html', import.meta.url), 'utf8')
]);

const helperContext = { TextEncoder, Uint8Array, Math, String, Array, Object, Number };
helperContext.globalThis = helperContext;
vm.createContext(helperContext);
vm.runInContext(helperSource, helperContext);
const helper = helperContext.PropertyShareInbox;

assert.equal(helper.MAX_PENDING, 10);
assert.equal(helper.MAX_FILE_COUNT, 5);
assert.equal(helper.MAX_FILE_BYTES, 2 * 1024 * 1024);
assert.equal(helper.MAX_BATCH_BYTES, 4 * 1024 * 1024);
assert.equal(helper.MAX_PENDING_BYTES, 8 * 1024 * 1024);
assert.equal(helper.MAX_REQUEST_BYTES, 4 * 1024 * 1024 + 64 * 1024);
assert.equal(helper.MAX_MESSAGE_BYTES, 8 * 1024);
const normalized = helper.normalize({ title: 'Link\u0000 title', text: 'Check this', url: 'https://example.test/item' });
assert.equal(normalized.title, 'Link title', 'control characters are stripped from shared fields');
assert.equal(helper.formatText(normalized), 'Link title\nCheck this\nhttps://example.test/item');
assert.deepEqual(JSON.parse(JSON.stringify(helper.fromFormData({ get: key => ({ title: 'Shared title', text: 'Shared body', url: new Blob(['ignored']) })[key] }))), {
  title: 'Shared title', text: 'Shared body', url: '', tooLarge: false, truncated: false
}, 'legacy URL encoded shares still accept text fields');
const sharedFile = new File(['local file body'], 'notes.txt', { type: 'text/plain' });
const normalizedFiles = helper.normalize({ text: 'Review this', files: [sharedFile] });
assert.equal(normalizedFiles.files.length, 1, 'valid files are retained for local review');
assert.equal(normalizedFiles.files[0].name, 'notes.txt');
const fileStub = (name, size) => ({ name, type: 'application/octet-stream', size, async arrayBuffer() { return new ArrayBuffer(0); } });
const cappedBatch = helper.normalize({ files: Array.from({ length: helper.MAX_FILE_COUNT + 1 }, (_, index) => fileStub(`item-${index}.bin`, 1)) });
assert.equal(cappedBatch.files.length, helper.MAX_FILE_COUNT, 'file-count limit accepts only the declared maximum');
assert.ok(cappedBatch.fileWarnings.includes('item-5.bin'), 'files over the count limit are identified');
const tooLargeFile = new File(['x'.repeat(helper.MAX_FILE_BYTES + 1)], 'large.bin', { type: 'application/octet-stream' });
const limitedFiles = helper.normalize({ files: [tooLargeFile] });
assert.equal((limitedFiles.files || []).length, 0);
assert.deepEqual(JSON.parse(JSON.stringify(limitedFiles.fileWarnings)), ['large.bin'], 'unsupported file sizes are disclosed by name');
const long = helper.formatText({ text: '🙂'.repeat(5000), title: '', url: '' });
assert.ok(long.length <= helper.MAX_MESSAGE_CHARS, 'formatted draft fits the message character limit');
assert.ok(helper.byteLength(long) <= helper.MAX_MESSAGE_BYTES, 'formatted draft fits the message byte limit');
assert.ok(!/[\uD800-\uDBFF]$/.test(long), 'truncation does not split a surrogate pair');
assert.equal(helper.normalize({ text: '🙂'.repeat(5000) }).truncated, true, 'the UI can disclose truncation before the person sends');
assert.deepEqual(JSON.parse(JSON.stringify(helper.normalize({ tooLarge: true }))), {
  title: '', text: '', url: '', tooLarge: true, truncated: false
});

const records = [];
let nextId = 1;
const storage = {
  async all() { return records.map(item => ({ ...item })); },
  async enqueue(item, limit, byteLimit) {
    const pendingBytes = records.reduce((total, row) => total + (row.files || []).reduce((sum, file) => sum + file.size, 0), 0);
    const itemBytes = (item.files || []).reduce((sum, file) => sum + file.size, 0);
    if (records.length >= limit || pendingBytes + itemBytes > byteLimit) return { accepted: false, item: null };
    const saved = { ...item, id: nextId++ };
    records.push(saved);
    return { accepted: true, item: { ...saved } };
  },
  async remove(id) { const index = records.findIndex(item => item.id === id); if (index >= 0) records.splice(index, 1); }
};
const inbox = helper.create(storage);
const first = await inbox.enqueue({ title: 'Local only', text: 'Review me', url: 'https://example.test' });
assert.equal(first.accepted, true);
assert.equal((await inbox.list()).length, 1);
assert.equal((await inbox.enqueue({ title: '', text: '', url: '' })).empty, true, 'empty share payloads are not queued');
await inbox.remove(first.item.id);
assert.equal((await inbox.list()).length, 0);
for (let index = 0; index < helper.MAX_PENDING; index += 1) assert.equal((await inbox.enqueue({ text: `item-${index}` })).accepted, true);
assert.equal((await inbox.enqueue({ text: 'overflow' })).accepted, false, 'the newest share is rejected when the local queue is full');
records.splice(0, records.length);
nextId = 1;
assert.equal((await inbox.enqueue({ files: [fileStub('a.bin', helper.MAX_FILE_BYTES), fileStub('b.bin', helper.MAX_FILE_BYTES)] })).accepted, true);
assert.equal((await inbox.enqueue({ files: [fileStub('c.bin', helper.MAX_FILE_BYTES), fileStub('d.bin', helper.MAX_FILE_BYTES)] })).accepted, true);
assert.equal((await inbox.enqueue({ files: [fileStub('overflow.bin', 1)] })).accepted, false, 'pending file blobs respect the local total-byte cap');

const manifest = JSON.parse(manifestSource);
assert.deepEqual(JSON.parse(JSON.stringify(manifest.share_target)), {
  action: './?launch=share', method: 'POST', enctype: 'multipart/form-data',
  params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*', 'audio/*', 'video/*', 'text/*', 'application/pdf', 'application/zip', 'application/octet-stream'] }] }
});
assert.match(html, /id="share-file-preview"/);
assert.match(html, /id="share-file-warning"/);
assert.match(html, /id="share-dialog"/);
assert.match(html, /id="share-item-preview"[^>]*data-user-content/);
assert.match(html, /id="share-use-draft"/);
assert.match(html, /id="share-discard"/);
assert.match(html, /id="share-later"/);

const listeners = new Map();
const workerSelf = {
  location: { origin: 'https://property.example' },
  registration: { scope: 'https://property.example/property/' },
  clients: { claim: async () => {} },
  addEventListener(name, callback) { listeners.set(name, callback); },
  skipWaiting: async () => {}
};
const workerContext = {
  self: workerSelf, URL, URLSearchParams, TextDecoder, Uint8Array, Number, Promise, Response,
  importScripts() {}, caches: { keys: async () => [], open: async () => ({ addAll: async () => {}, put: async () => {} }), delete: async () => {}, match: async () => null },
  fetch: async () => new Response('ok')
};
workerContext.PropertyShareInbox = Object.assign({}, inbox, {
  fromFormData: helper.fromFormData,
  MAX_REQUEST_BYTES: helper.MAX_REQUEST_BYTES
});
vm.createContext(workerContext);
vm.runInContext(workerSource, workerContext);

async function postShare(fields, extra = {}) {
  const isFormData = fields instanceof FormData;
  const body = isFormData ? fields : new URLSearchParams(fields).toString();
  const request = new Request('https://property.example/property/?launch=share', {
    method: 'POST',
    headers: { ...(isFormData ? {} : { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(new TextEncoder().encode(body).length) }), ...extra },
    body
  });
  let responsePromise;
  listeners.get('fetch')({ request, respondWith(value) { responsePromise = Promise.resolve(value); } });
  return responsePromise;
}

records.splice(0, records.length);
const acceptedResponse = await postShare({ title: 'Private link', text: 'A draft', url: 'https://example.test/secret-path' });
assert.equal(acceptedResponse.status, 303);
assert.equal(acceptedResponse.headers.get('location'), 'https://property.example/property/?launch=share');
assert.ok(!(await acceptedResponse.text()).includes('secret-path'));
assert.equal((await inbox.list())[0].title, 'Private link');

records.splice(0, records.length);
nextId = 1;
const multipartShare = new FormData();
multipartShare.set('text', 'Review this local file');
multipartShare.append('files', sharedFile);
const fileShareResponse = await postShare(multipartShare);
assert.equal(fileShareResponse.headers.get('location'), 'https://property.example/property/?launch=share');
const storedFileShare = (await inbox.list())[0];
assert.equal(storedFileShare.text, 'Review this local file');
assert.equal(storedFileShare.files[0].name, 'notes.txt', 'the service worker queues shared files locally for explicit review');

records.splice(0, records.length);
nextId = 1;
const oversized = 'x'.repeat(helper.MAX_REQUEST_BYTES + 1);
const oversizedResponse = await postShare({ text: oversized });
assert.equal(oversizedResponse.headers.get('location'), 'https://property.example/property/?launch=share');
assert.deepEqual(JSON.parse(JSON.stringify((await inbox.list())[0])), {
  title: '', text: '', url: '', tooLarge: true, truncated: false, id: 1
}, 'oversized content is replaced by a local size notice, never stored partially');

records.splice(0, records.length);
for (let index = 0; index < helper.MAX_PENDING; index += 1) await inbox.enqueue({ text: `full-${index}` });
const fullResponse = await postShare({ text: 'not stored' });
assert.equal(fullResponse.headers.get('location'), 'https://property.example/property/?launch=share-full');
assert.equal((await inbox.list()).length, helper.MAX_PENDING);

assert.match(workerSource, /target\.searchParams\.set\('launch', result\)/, 'redirects carry only a fixed launch status, never shared fields');
assert.match(workerSource, /request\.body\.getReader/);
assert.match(workerSource, /url\.origin !== self\.location\.origin/);
assert.match(workerSource, /event\.request\.method === 'POST'/);
assert.match(workerSource, /startsWith\('multipart\/form-data'\)/);
console.log('PASS: local share target bounds text and files, queues files locally, and requires explicit review before sending');
