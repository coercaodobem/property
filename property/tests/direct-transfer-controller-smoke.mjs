import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/direct-transfer-controller.js', import.meta.url), 'utf8');
const context = { TextEncoder, setTimeout, clearTimeout };
vm.runInNewContext(source, context, { timeout: 5000 });
const Direct = context.PropertyDirectTransfer;
const peer = 'ab'.repeat(32);
const transferId = 'cd'.repeat(16);
const files = [{ transferId: 'ef'.repeat(16), name: 'sample.txt', mime: 'text/plain', sizeBytes: 3, totalChunks: 1, sha256: '12'.repeat(32) }];
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
const normalizeFileManifests = list => Array.isArray(list) && list.length > 0 && list.length <= 5 &&
  list.every(item => Number.isSafeInteger(item.sizeBytes) && item.sizeBytes >= 0 && item.sizeBytes <= 2 * 1024 * 1024) &&
  list.reduce((sum, item) => sum + item.sizeBytes, 0) <= 4 * 1024 * 1024
  ? list.map(item => Object.freeze({ ...item })) : null;
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
assert.equal(answer.action, 'file-answer');
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

await assert.rejects(() => first.startOutgoing({ peer, transferId, files: [{ ...files[0], sizeBytes: 5 * 1024 * 1024 }] }), /manifest/);
assert.equal(Direct.validDescription('answer', 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' + 'x'.repeat(17000)), false);

console.log('PASS: direct file controller enforces consent gating, ordered acknowledgements, completion, peer binding and bounded manifests');
