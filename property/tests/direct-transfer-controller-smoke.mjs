import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../web/direct-transfer-controller.js', import.meta.url), 'utf8');
const chunksSource = await readFile(new URL('../web/direct-file-chunks.js', import.meta.url), 'utf8');
const context = { TextEncoder, setTimeout, clearTimeout, crypto: webcrypto, Uint8Array, ArrayBuffer };
vm.runInNewContext(chunksSource, context, { timeout: 5000 });
vm.runInNewContext(source, context, { timeout: 5000 });
const Direct = context.PropertyDirectTransfer;
const Chunks = context.PropertyDirectFileChunks;
const peer = 'ab'.repeat(32);
const transferId = 'cd'.repeat(16);
const files = [{ transferId: 'ef'.repeat(16), name: 'sample.txt', mime: 'text/plain', sizeBytes: 3,
  chunkBytes: Chunks.CHUNK_BYTES, totalChunks: 1, sha256: '12'.repeat(32) }];
const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\n';

assert.equal(Direct.validDescription('offer', sdp), true);
assert.equal(Direct.validDescription('offer', 'v=0\r\nm=audio 9 RTP/SAVPF 111\r\n'), false);

const channels = [];
let offerer = null;
class FakeDataChannel {
  constructor(label) { this.label = label; this.ordered = true; this.readyState = 'connecting'; this.peer = null; }
  pair(other) {
    this.peer = other; other.peer = this;
    this.readyState = other.readyState = 'open';
    this.onopen?.(); other.onopen?.();
  }
  send(data) { assert.equal(this.readyState, 'open'); this.peer?.onmessage?.({ data }); }
  close() { this.readyState = 'closed'; if (this.peer) this.peer.readyState = 'closed'; }
}
class FakePeerConnection {
  constructor(configuration) { this.configuration = configuration; this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.closed = false; }
  createDataChannel(label) { const channel = new FakeDataChannel(label); channels.push(channel); offerer = this; this.channel = channel; return channel; }
  async createOffer() { return { type: 'offer', sdp }; }
  async createAnswer() { return { type: 'answer', sdp }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (description.type === 'offer') {
      const remote = new FakeDataChannel(Direct.CHANNEL_LABEL);
      this.ondatachannel?.({ channel: remote });
      offerer.channel.pair(remote);
    }
  }
  close() { this.closed = true; this.connectionState = 'closed'; }
}

const manifests = files => files.map(({ transferId, name, mime, sizeBytes, totalChunks, sha256 }) => ({ transferId, name, mime, sizeBytes, totalChunks, sha256 }));
const signalSets = [[], []];
const states = [[], []];
const received = [];
const peerConnections = [];
const normalizeFileManifests = list => Chunks.normalizeFileManifests(list);
const first = Direct.create({
  getIceConfiguration: () => ({ iceServers: [{ urls: ['turn:turn.example:3478'], username: 'u', credential: 'c' }], iceTransportPolicy: 'relay' }),
  createPeerConnection: configuration => { const peerConnection = new FakePeerConnection(configuration); peerConnections.push(peerConnection); return peerConnection; }, normalizeFileManifests,
  async onSignal(signal) { signalSets[0].push(signal); }, onState(value) { states[0].push(value); }
});
const second = Direct.create({
  createPeerConnection: configuration => new FakePeerConnection(configuration), normalizeFileManifests,
  async onSignal(signal) { signalSets[1].push(signal); }, onState(value) { states[1].push(value); },
  async onEnvelope(envelope) { received.push(envelope); return envelope.peer === peer && envelope.sequence === 1 && envelope.event.id === 'event-1'; }
});

assert.equal(await first.startOutgoing({ peer, transferId, files }), true);
assert.equal(peerConnections[0].configuration.iceTransportPolicy, 'relay', 'direct file setup honors relay-only routing');
assert.equal(peerConnections[0].configuration.iceServers[0].credential, 'c');
assert.equal(first.getState().status, 'offered');
assert.equal(signalSets[0][0].action, 'file-offer');
assert.equal(second.receiveOffer({ peer: '98'.repeat(32), ...signalSets[0][0] }), true, 'receiver identifies the offer sender independently');
assert.equal(second.getState().status, 'incoming');
assert.equal(await second.acceptIncoming(), true, 'explicit acceptance prepares the data channel');
const answer = signalSets[1][0];
const resumeSignal = signalSets[1][1];
assert.equal(answer.action, 'file-answer');
assert.equal(resumeSignal.action, 'file-resume');
assert.deepEqual(Array.from(resumeSignal.resumeOffsets), [0]);
assert.equal(first.receiveResume({ peer, ...resumeSignal }), true, 'resume metadata may arrive before the WebRTC answer');
assert.equal(await first.receiveAnswer({ peer, ...answer }), true);
assert.equal(first.getState().status, 'connected');
assert.equal(channels[0].readyState, 'open');
assert.equal(await first.sendEnvelope({ kind: 1059, id: 'event-1', tags: [], content: 'ciphertext' }), true);
assert.equal(received.length, 1);
assert.equal(first.getState().sentChunks, 1);
assert.equal(second.getState().receivedChunks, 1);
assert.equal(await first.finish(), true);
assert.equal(first.getState().status, 'completed');
assert.equal(second.getState().status, 'completed');
assert.equal(first.dismiss(), true);
assert.equal(second.dismiss(), true);

let resumeFallbackCallback = null;
const legacySignals = [];
const legacySender = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  setResumeWatchdog(callback) { resumeFallbackCallback = callback; return 1; }, clearResumeWatchdog() {},
  async onSignal(signal) { legacySignals.push(signal); } });
const legacyTransferId = '23'.repeat(16);
assert.equal(await legacySender.startOutgoing({ peer, transferId: legacyTransferId, files }), true);
const legacyChannel = channels.at(-1);
legacyChannel.readyState = 'open';
legacyChannel.onopen();
assert.equal(await legacySender.receiveAnswer({ peer, transferId: legacyTransferId, sdp }), true);
assert.equal(legacySender.getState().status, 'connecting', 'new senders wait briefly for optional resume metadata from older clients');
assert.equal(typeof resumeFallbackCallback, 'function');
resumeFallbackCallback();
assert.equal(legacySender.getState().status, 'connected', 'missing resume metadata falls back to the existing full transfer');
legacySender.dismiss();

const largeFile = { transferId: '12'.repeat(16), name: 'archive.bin', mime: 'application/octet-stream',
  sizeBytes: Chunks.CHUNK_BYTES * 16 + 3, chunkBytes: Chunks.CHUNK_BYTES,
  totalChunks: 17, sha256: '34'.repeat(32) };
const largeSignals = [[], []];
const storedParts = [];
let completionChecks = 0;
const largeSender = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  async onSignal(signal) { largeSignals[0].push(signal); } });
const largeReceiver = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  async onSignal(signal) { largeSignals[1].push(signal); },
  async onPart(part) { storedParts.push(part); return true; },
  async onComplete({ files: completedFiles, caption }) { completionChecks += 1; return completedFiles[0].sha256 === largeFile.sha256 && caption === 'archive context'; } });
assert.equal(await largeSender.startOutgoing({ peer, transferId: '56'.repeat(16), files: [largeFile], caption: 'archive context' }), true);
assert.equal(largeSignals[0][0].caption, 'archive context');
assert.equal(largeReceiver.receiveOffer(largeSignals[0][0]), true);
assert.equal(await largeReceiver.acceptIncoming(), true);
assert.equal(largeSignals[1][1].action, 'file-resume');
assert.equal(await largeSender.receiveAnswer({ peer, ...largeSignals[1][0] }), true);
assert.equal(largeSender.getState().status, 'connecting', 'the sender waits for resume metadata before starting chunks');
assert.equal(largeSender.receiveResume({ peer, ...largeSignals[1][1] }), true);
assert.equal(largeSender.getState().status, 'connected');
for (let index = 0; index < largeFile.totalChunks; index += 1) {
  const length = Chunks.expectedChunkSize(largeFile.sizeBytes, largeFile.totalChunks, index);
  const bytes = new Uint8Array(length).fill(index % 251);
  const sha256 = await Chunks.digestHex(bytes, webcrypto);
  assert.equal(await largeSender.sendPart({ fileIndex: 0, index, bytes, sha256 }), true,
    `part ${index} should be sent; sender=${JSON.stringify(largeSender.getState())} receiver=${JSON.stringify(largeReceiver.getState())}`);
}
assert.equal(storedParts.length, 17);
assert.equal(largeSender.getState().sentChunks, 17);
assert.equal(largeReceiver.getState().receivedChunks, 17);
assert.equal(await largeSender.finish(), true);
assert.equal(completionChecks, 1, 'receiver validates the completed file set before acknowledging completion');
assert.equal(largeReceiver.getState().status, 'completed');
largeSender.dismiss(); largeReceiver.dismiss();

const resumeFile = { transferId: '78'.repeat(16), name: 'resume.bin', mime: 'application/octet-stream',
  sizeBytes: Chunks.CHUNK_BYTES * 2 + 1, chunkBytes: Chunks.CHUNK_BYTES, totalChunks: 3, sha256: '90'.repeat(32) };
const resumeSignals = [[], []];
let resumedParts = 0;
const resumeSender = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  async onSignal(signal) { resumeSignals[0].push(signal); } });
const resumeReceiver = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  async getResumeOffsets() { return [2]; },
  async onSignal(signal) { resumeSignals[1].push(signal); },
  async onPart(part) { assert.equal(part.sequence, 3); resumedParts += 1; return true; },
  async onComplete({ files: completedFiles }) { return completedFiles[0].sha256 === resumeFile.sha256; } });
assert.equal(await resumeSender.startOutgoing({ peer, transferId: '91'.repeat(16), files: [resumeFile] }), true);
assert.equal(resumeReceiver.receiveOffer(resumeSignals[0][0]), true);
assert.equal(await resumeReceiver.acceptIncoming(), true);
assert.equal(resumeSignals[1][1].action, 'file-resume');
assert.deepEqual(Array.from(resumeSignals[1][1].resumeOffsets), [2]);
assert.equal(await resumeSender.receiveAnswer({ peer, ...resumeSignals[1][0] }), true);
assert.equal(resumeSender.getState().status, 'connecting');
assert.equal(resumeSender.receiveResume({ peer, ...resumeSignals[1][1] }), true);
for (let count = 0; count < 8 && resumeSender.getState().status !== 'connected'; count += 1) await Promise.resolve();
assert.equal(resumeSender.getState().status, 'connected', 'sender starts only after receiver confirms the verified resume prefix');
assert.equal(resumeReceiver.getState().receivedChunks, 2, 'receiver advances its sequence only after matching resume confirmation');
const finalBytes = new Uint8Array(1).fill(7);
assert.equal(await resumeSender.sendPart({ fileIndex: 0, index: 2, bytes: finalBytes,
  sha256: await Chunks.digestHex(finalBytes, webcrypto) }), true);
assert.equal(resumedParts, 1, 'only the missing third chunk traverses the direct channel');
assert.equal(resumeReceiver.getState().receivedChunks, 3);
assert.equal(await resumeSender.finish(), true);
resumeSender.dismiss(); resumeReceiver.dismiss();

const malformedSignals = [];
let malformedReceives = 0;
const malformedSender = Direct.create({ normalizeFileManifests, createPeerConnection: configuration => new FakePeerConnection(configuration),
  async onSignal(signal) { malformedSignals.push(signal); } });
const malformedReceiver = Direct.create({ normalizeFileManifests, createPeerConnection: configuration => new FakePeerConnection(configuration),
  async onEnvelope() { malformedReceives += 1; return true; } });
const malformedTransferId = '56'.repeat(16);
assert.equal(await malformedSender.startOutgoing({ peer, transferId: malformedTransferId, files }), true);
assert.equal(malformedReceiver.receiveOffer(malformedSignals[0]), true);
assert.equal(await malformedReceiver.acceptIncoming(), true);
channels.at(-1).send(JSON.stringify({ v: 1, action: 'chunk', transferId: malformedTransferId, sequence: 2,
  event: { kind: 1059, id: 'out-of-order', tags: [], content: 'ciphertext' } }));
await Promise.resolve();
assert.equal(malformedReceives, 0, 'out-of-order chunks never reach the message storage callback');
assert.equal(malformedReceiver.getState().status, 'failed');
malformedSender.dispose();
malformedReceiver.dispose();

let refused = false;
const rejecting = Direct.create({ normalizeFileManifests, createPeerConnection: () => new FakePeerConnection({}),
  async onSignal(signal) { refused = signal.action === 'file-reject'; } });
assert.equal(rejecting.receiveOffer({ peer, transferId, files, sdp }), true);
assert.equal(await rejecting.end('file-reject'), true);
assert.equal(refused, true);
assert.equal(rejecting.getState().status, 'declined');

await assert.rejects(() => first.startOutgoing({ peer, transferId, files: [{ ...files[0], sizeBytes: Chunks.MAX_FILE_BYTES + 1,
  totalChunks: Chunks.expectedChunkCount(Chunks.MAX_FILE_BYTES + 1) }] }), /manifest/);
assert.equal(Direct.validDescription('answer', 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' + 'x'.repeat(17000)), false);

console.log('PASS: direct file controller enforces consent gating, bounded binary blocks, batched acknowledgements, final verification and manifest limits');
