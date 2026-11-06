import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/call-controller.js', import.meta.url), 'utf8');
const context = { window: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context, { timeout: 5000 });
const Calls = context.window.PropertyCalls;

class FakeTrack {
  constructor(kind) { this.kind = kind; this.enabled = true; this.stopped = false; }
  stop() { this.stopped = true; }
}

class FakeStream {
  constructor(video) { this.audio = [new FakeTrack('audio')]; this.video = video ? [new FakeTrack('video')] : []; }
  getAudioTracks() { return this.audio; }
  getVideoTracks() { return this.video; }
  getTracks() { return [...this.audio, ...this.video]; }
}

class FakePeerConnection {
  constructor(configuration) { this.configuration = configuration; this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.closed = false; }
  addTrack(track) { (this.tracks ||= []).push(track); }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' + (this.tracks?.some(track => track.kind === 'video') ? 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' : '') }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' + (this.remoteDescription?.sdp.includes('m=video') ? 'm=video 0 UDP/TLS/RTP/SAVPF 96\r\na=inactive\r\n' : '') }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  addEventListener() {}
  removeEventListener() {}
  close() { this.closed = true; }
}

const signals = [];
const states = [];
const remoteStreams = [];
const localStreams = [];
const streams = [];
const peers = [];
const mediaDevices = { async getUserMedia({ video }) { const stream = new FakeStream(video); streams.push(stream); return stream; } };
const controller = Calls.create({
  mediaDevices,
  createPeerConnection(configuration) { const pc = new FakePeerConnection(configuration); peers.push(pc); return pc; },
  async onSignal(signal) { signals.push(signal); },
  onState(state) { states.push(state); },
  onRemoteStream(stream) { remoteStreams.push(stream); },
  onLocalStream(stream) { localStreams.push(stream); }
});
const peer = 'a'.repeat(64);
const callId = '12'.repeat(16);

assert.equal(Calls.validCallId(callId), true);
assert.equal(Calls.validCallId('not-a-call-id'), false);
assert.equal(Calls.validDescription('offer', 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', 'audio'), true);
assert.equal(Calls.validDescription('offer', 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', 'video'), false);
assert.equal(controller.receiveOffer({ peer, callId, media: 'video', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }), true);
assert.equal(controller.getState().status, 'incoming');
assert.equal(controller.receiveOffer({ peer, callId: '34'.repeat(16), media: 'audio', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }), false, 'only one call can be active');
assert.equal(controller.receiveEnd({ peer: 'b'.repeat(64), callId, action: 'call-decline' }), false, 'another identity cannot end this call');
assert.equal(await controller.acceptIncoming(false), true, 'incoming video can be answered without opening the camera');
assert.equal(controller.getState().status, 'connecting');
assert.equal(controller.getState().localMedia, 'audio');
assert.equal(localStreams[0], streams[0]);
assert.equal(signals[0].action, 'call-answer');
assert.equal(signals[0].media, 'audio');
assert.equal(signals[0].peer, peer);
assert.equal(signals[0].sdp.includes('m=video 0'), true, 'audio-only answers refuse the offered video track');
assert.equal(streams[0].getVideoTracks().length, 0);
assert.equal(peers[0].remoteDescription.type, 'offer');
const remote = { id: 'remote-stream' };
peers[0].ontrack({ streams: [remote] });
assert.equal(remoteStreams.at(-1), remote);
assert.equal(controller.receiveEnd({ peer, callId, action: 'call-hangup' }), true);
assert.equal(controller.getState().status, 'ended');
assert.equal(streams[0].getAudioTracks()[0].stopped, true);
assert.equal(peers[0].closed, true);
assert.equal(remoteStreams.at(-1), null);
assert.equal(localStreams.at(-1), null);
assert.equal(controller.dismiss(), true);

assert.equal(await controller.startOutgoing({ peer, callId: '56'.repeat(16), video: true }), true);
assert.equal(controller.getState().status, 'ringing');
assert.equal(signals.at(-1).action, 'call-offer');
assert.equal(signals.at(-1).media, 'video');
assert.equal(signals.at(-1).sdp.includes('m=video'), true);
assert.equal(peers[1].configuration.iceServers.length, 2);
assert.equal(controller.setMicrophoneEnabled(false), true);
assert.equal(controller.getState().microphoneEnabled, false);
assert.equal(streams[1].getAudioTracks()[0].enabled, false);
assert.equal(controller.setCameraEnabled(false), true);
assert.equal(controller.getState().cameraEnabled, false);
assert.equal(streams[1].getVideoTracks()[0].enabled, false);
assert.equal(await controller.receiveAnswer({ peer, callId: '56'.repeat(16), media: 'audio', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }), true);
assert.equal(peers[1].remoteDescription.type, 'answer');
peers[1].connectionState = 'connected';
peers[1].onconnectionstatechange();
assert.equal(controller.getState().status, 'connected');
assert.equal(await controller.end(), true);
assert.equal(signals.at(-1).action, 'call-hangup');
assert.equal(controller.getState().status, 'ended');
assert.equal(streams[1].getVideoTracks()[0].stopped, true);
assert.equal(peers[1].closed, true);
assert.equal(localStreams.at(-1), null);

assert.equal(controller.receiveOffer({ peer, callId: '90'.repeat(16), media: 'audio', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }), true, 'a declined call can be replaced');
assert.equal(controller.receiveEnd({ peer, callId: '90'.repeat(16), action: 'call-decline' }), true);
assert.equal(await controller.startOutgoing({ peer, callId: 'ab'.repeat(16) }), true, 'terminal declined calls do not block a new call');
assert.equal(controller.receiveEnd({ peer, callId: 'ab'.repeat(16), action: 'call-busy' }), true);
assert.equal(await controller.startOutgoing({ peer, callId: 'cd'.repeat(16) }), true, 'terminal busy calls do not block a new call');
assert.equal(await controller.receiveAnswer({ peer, callId: 'cd'.repeat(16), media: 'video', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }), false, 'an audio-only offer cannot be answered with video');
controller.dispose();

const missingMedia = Calls.create({ mediaDevices: {}, createPeerConnection: () => new FakePeerConnection({}), onSignal: async () => {} });
assert.equal(await missingMedia.startOutgoing({ peer, callId: '78'.repeat(16) }), false);
assert.equal(missingMedia.getState().status, 'failed');
assert.match(missingMedia.getState().error, /microphone and camera/);

const deniedSignals = [];
const deniedAnswer = Calls.create({
  mediaDevices: { async getUserMedia() { throw new Error('permission denied'); } },
  createPeerConnection: () => new FakePeerConnection({}),
  async onSignal(signal) { deniedSignals.push(signal); }
});
assert.equal(deniedAnswer.receiveOffer({ peer, callId: 'ef'.repeat(16), media: 'audio', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }), true);
assert.equal(await deniedAnswer.acceptIncoming(false), false);
assert.equal(deniedSignals[0].action, 'call-decline', 'permission failure tells the caller the answer could not proceed');
assert.equal(deniedAnswer.getState().status, 'failed');

console.log('PASS: WebRTC call controller covers incoming, outgoing, media controls, remote hangup, privacy cleanup and unsupported media');
