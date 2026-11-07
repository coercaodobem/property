import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, Uint8Array, ArrayBuffer, DataView, Blob, TextEncoder, setTimeout, clearTimeout };
for (const path of ['../web/direct-file-chunks.js', '../web/direct-file-storage.js', '../web/direct-transfer-controller.js']) {
  vm.runInNewContext(await readFile(new URL(path, import.meta.url), 'utf8'), context, { timeout: 5000 });
}
const Chunks = context.PropertyDirectFileChunks;
const Storage = context.PropertyDirectFileStorage;
const Direct = context.PropertyDirectTransfer;
const hashImplementation = await import('../web/chess/vendor/noble-hashes/sha2.js');

const peer = 'ab'.repeat(32);
const identity = { secret: new Uint8Array(32).fill(7), pubkey: '12'.repeat(32) };
const stored = new Map();
function createStorage() {
  return Storage.create({ crypto: webcrypto, hashImplementation, getIdentity: () => identity,
    putPart: async record => stored.set(`${record.transferId}:${record.index}`, record),
    listParts: async transferId => [...stored.values()].filter(record => record.transferId === transferId),
    listResumeTransferIds: async (resumePeer, fingerprint) => [...new Set([...stored.values()].filter(record =>
      record.peer === resumePeer && record.direction === 'received' && record.resumeFingerprint === fingerprint)
      .map(record => record.transferId))],
    deleteParts: async transferId => { for (const [key, record] of stored) if (record.transferId === transferId) stored.delete(key); } });
}
let storage = createStorage();

const sourceBytes = Uint8Array.from({ length: Chunks.CHUNK_BYTES * 2 + 1 }, (_, index) => (index * 17) % 251);
const sourceFile = new Blob([sourceBytes], { type: 'application/octet-stream' });
Object.defineProperties(sourceFile, { name: { value: 'resumable.bin' } });
const manifest = await Chunks.createManifest(sourceFile, { transferId: 'ef'.repeat(16), hashImplementation, cryptoImpl: webcrypto });
const outerTransfer = '23'.repeat(16);
const signals = [[], []];
let offerer = null;
let acceptedParts = 0;
let resolveTwoAccepted;
const twoAccepted = new Promise(resolve => { resolveTwoAccepted = resolve; });

class FakeDataChannel {
  constructor(label) { this.label = label; this.ordered = true; this.readyState = 'connecting'; this.peer = null; }
  pair(other) { this.peer = other; other.peer = this; this.readyState = other.readyState = 'open'; this.onopen?.(); other.onopen?.(); }
  send(data) { assert.equal(this.readyState, 'open'); this.peer?.onmessage?.({ data }); }
  close() { this.readyState = 'closed'; if (this.peer) this.peer.readyState = 'closed'; }
}
class FakePeerConnection {
  constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'new'; }
  createDataChannel(label) { this.channel = new FakeDataChannel(label); offerer = this; return this.channel; }
  async createOffer() { return { type: 'offer', sdp }; }
  async createAnswer() { return { type: 'answer', sdp }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    if (description.type !== 'offer') return;
    const remote = new FakeDataChannel(Direct.CHANNEL_LABEL);
    this.ondatachannel?.({ channel: remote });
    offerer.channel.pair(remote);
  }
  close() { this.connectionState = 'closed'; }
}
const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\n';
const normalizeFileManifests = files => Chunks.normalizeFileManifests(files);

function createControllers() {
  return [Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection(),
    async onSignal(signal) { signals[0].push(signal); } }),
  Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection(),
    async getResumeOffsets(files, recipient) { return storage.verifiedResumeOffsets(files, recipient); },
    async onSignal(signal) { signals[1].push(signal); },
    async onPart(part) {
      const result = await storage.savePart({ file: part.file, index: part.index, bytes: part.bytes, sha256: part.sha256,
        sessionId: part.transferId, peer: part.peer, direction: 'received' });
      if (result) { acceptedParts += 1; if (acceptedParts === 2) resolveTwoAccepted(); }
      return result;
    },
    async onComplete({ files }) { return storage.verifyFiles(files); } })];
}

let [sender, receiver] = createControllers();
assert.equal(await sender.startOutgoing({ peer, transferId: outerTransfer, files: [manifest] }), true);
assert.equal(receiver.receiveOffer(signals[0].at(-1)), true);
assert.equal(await receiver.acceptIncoming(), true);
assert.equal(await sender.receiveAnswer({ peer, ...signals[1].at(-2) }), true);
assert.equal(sender.receiveResume({ peer, ...signals[1].at(-1) }), true);
assert.equal(sender.getState().status, 'connected');

for (let index = 0; index < 2; index += 1) {
  const part = await Chunks.readChunk(sourceFile, manifest, index, webcrypto);
  assert.equal(await sender.sendPart({ fileIndex: 0, index, bytes: part.bytes, sha256: part.sha256 }), true);
}
await twoAccepted;
assert.equal(acceptedParts, 2, 'the interrupted attempt stored exactly the first two blocks');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], peer)), [2]);
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], '34'.repeat(32))), [0], 'a different peer cannot resume these blocks');
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([{ ...manifest, name: 'changed.bin' }], peer)), [0], 'a changed manifest cannot resume these blocks');

const firstKey = `${manifest.transferId}:0`;
const originalFirst = stored.get(firstKey);
stored.set(firstKey, { ...originalFirst, bytes: new Uint8Array(originalFirst.bytes).fill(0) });
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], peer)), [0], 'a corrupted prefix block forces a full send');
stored.set(firstKey, originalFirst);
stored.delete(firstKey);
assert.deepEqual(Array.from(await storage.verifiedResumeOffsets([manifest], peer)), [0], 'a later block cannot bridge a missing prefix');
stored.set(firstKey, originalFirst);

assert.equal(await sender.end('file-cancel'), true);
receiver.receiveEnd({ peer, transferId: outerTransfer, action: 'file-cancel' });
sender.dismiss(); receiver.dismiss();

signals[0].length = 0;
signals[1].length = 0;
acceptedParts = 0;
resolveTwoAccepted = () => {};
[sender, receiver] = createControllers();
const samePageRetryTransfer = '45'.repeat(16);
assert.equal(await sender.startOutgoing({ peer, transferId: samePageRetryTransfer, files: [manifest] }), true);
assert.equal(receiver.receiveOffer(signals[0][0]), true);
assert.equal(await receiver.acceptIncoming(), true);
assert.deepEqual(Array.from(signals[1][1].resumeOffsets), [2], 'the same-page retry keeps the authenticated prefix');
assert.equal(await sender.receiveAnswer({ peer, ...signals[1][0] }), true);
assert.equal(sender.receiveResume({ peer, ...signals[1][1] }), true);
for (let count = 0; count < 8 && sender.getState().status !== 'connected'; count += 1) await Promise.resolve();
assert.equal(sender.getState().status, 'connected');
assert.equal(await sender.end('file-cancel'), true);
receiver.receiveEnd({ peer, transferId: samePageRetryTransfer, action: 'file-cancel' });
sender.dismiss(); receiver.dismiss();

signals[0].length = 0;
signals[1].length = 0;
acceptedParts = 0;
storage = createStorage(); // Simulates a full page reload: only encrypted IndexedDB-style records survive.
[sender, receiver] = createControllers();
const retryTransfer = '67'.repeat(16);
const reselectedManifest = await Chunks.createManifest(sourceFile, { transferId: '98'.repeat(16), hashImplementation, cryptoImpl: webcrypto });
assert.equal(await sender.startOutgoing({ peer, transferId: retryTransfer, files: [reselectedManifest] }), true);
assert.equal(receiver.receiveOffer(signals[0][0]), true);
assert.equal(await receiver.acceptIncoming(), true);
assert.deepEqual(Array.from(signals[1][1].resumeOffsets), [2]);
assert.equal(await sender.receiveAnswer({ peer, ...signals[1][0] }), true);
assert.equal(sender.receiveResume({ peer, ...signals[1][1] }), true);
for (let count = 0; count < 8 && sender.getState().status !== 'connected'; count += 1) await Promise.resolve();
assert.equal(sender.getState().status, 'connected');
assert.equal(receiver.getState().receivedChunks, 2, 'receiver confirms the persisted prefix before accepting later sequence numbers');
const finalPart = await Chunks.readChunk(sourceFile, reselectedManifest, 2, webcrypto);
assert.equal(await sender.sendPart({ fileIndex: 0, index: 2, bytes: finalPart.bytes, sha256: finalPart.sha256 }), true);
assert.equal(acceptedParts, 1, 'the retry transferred exactly the missing third block');
assert.equal(receiver.getState().receivedChunks, 3);
assert.equal(await sender.finish(), true);
const restored = await storage.createBlob(reselectedManifest);
assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), sourceBytes, 'the resumed file passes the whole-file hash and byte comparison');
assert.equal(stored.has(`${manifest.transferId}:0`), true, 'rebinding a prefix preserves the original encrypted source blocks');
sender.dismiss(); receiver.dismiss();

console.log('PASS G04-27: same-page and post-reload resume, encrypted prefix, fixed invalid-prefix cases, peer confirmation and whole-file integrity');
