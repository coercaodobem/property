import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/call-controller.js', import.meta.url), 'utf8');
const context = { window: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context, { timeout: 5000 });
const Calls = context.window.PropertyCalls;

class FakeTrack {
  constructor(kind, deviceId = '') { this.kind = kind; this.deviceId = deviceId; this.enabled = true; this.stopped = false; this.readyState = 'live'; this.onended = null; }
  getSettings() { return { deviceId: this.deviceId }; }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  end() { this.readyState = 'ended'; this.onended?.(); }
}

class FakeStream {
  constructor(video, audio = true, deviceIds = {}) { this.audio = audio ? [new FakeTrack('audio', deviceIds.audio)] : []; this.video = video ? [new FakeTrack('video', deviceIds.video)] : []; }
  getAudioTracks() { return this.audio; }
  getVideoTracks() { return this.video; }
  getTracks() { return [...this.audio, ...this.video]; }
  addTrack(track) { (track.kind === 'audio' ? this.audio : this.video).push(track); }
  removeTrack(track) { const tracks = track.kind === 'audio' ? this.audio : this.video; const index = tracks.indexOf(track); if (index >= 0) tracks.splice(index, 1); }
}

class FakePeerConnection {
  constructor(configuration) { this.configuration = configuration; this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.closed = false; }
  addTrack(track) {
    (this.tracks ||= []).push(track);
    const sender = { track, replacements: [], async replaceTrack(nextTrack) { if (this.failNextReplacement) { this.failNextReplacement = false; throw new Error('replaceTrack failed'); } this.track = nextTrack; this.replacements.push(nextTrack); } };
    (this.senders ||= []).push(sender);
    return sender;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' + (this.tracks?.some(track => track.kind === 'video') ? 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' : '') }; }
  async createAnswer() {
    const acceptsVideo = this.tracks?.some(track => track.kind === 'video') && this.remoteDescription?.sdp.includes('m=video');
    const refusesVideo = !this.tracks?.some(track => track.kind === 'video') && this.remoteDescription?.sdp.includes('m=video');
    return { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' +
      (acceptsVideo ? 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' : refusesVideo ? 'm=video 0 UDP/TLS/RTP/SAVPF 96\r\na=inactive\r\n' : '') };
  }
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
let iceConfiguration = { iceServers: [{ urls: 'stun:first.example' }] };
const mediaDevices = { async getUserMedia({ video }) { const stream = new FakeStream(video); streams.push(stream); return stream; } };
const controller = Calls.create({
  mediaDevices,
  getIceConfiguration() { return iceConfiguration; },
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

iceConfiguration = { iceServers: [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }], iceTransportPolicy: 'relay' };
assert.equal(await controller.startOutgoing({ peer, callId: '56'.repeat(16), video: true }), true);
assert.equal(controller.getState().status, 'ringing');
assert.equal(signals.at(-1).action, 'call-offer');
assert.equal(signals.at(-1).media, 'video');
assert.equal(signals.at(-1).sdp.includes('m=video'), true);
assert.equal(peers[0].configuration.iceServers[0].urls, 'stun:first.example');
assert.equal(peers[1].configuration.iceTransportPolicy, 'relay', 'the latest relay-only setting applies to the next call');
assert.equal(peers[1].configuration.iceServers[0].credential, 'c');
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

const screenStreams = [];
const screenLocalStreams = [];
const screenPeers = [];
const screenMediaDevices = {
  async getUserMedia({ video }) { return new FakeStream(video); },
  async getDisplayMedia(constraints) {
    assert.equal(constraints.video, true, 'screen capture requests video');
    assert.equal(constraints.audio, false, 'screen capture does not request system audio');
    const stream = new FakeStream(true, false);
    screenStreams.push(stream);
    return stream;
  }
};
const screenController = Calls.create({
  mediaDevices: screenMediaDevices,
  createPeerConnection(configuration) { const pc = new FakePeerConnection(configuration); screenPeers.push(pc); return pc; },
  onSignal: async () => {},
  onLocalStream(stream) { screenLocalStreams.push(stream); }
});
const screenCallId = '01'.repeat(16);
assert.equal(await screenController.startOutgoing({ peer, callId: screenCallId, video: true }), true);
assert.equal(screenController.getState().screenShareAvailable, false, 'screen share waits for a negotiated video answer');
assert.equal(await screenController.receiveAnswer({ peer, callId: screenCallId, media: 'video', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }), true);
assert.equal(screenController.getState().screenShareAvailable, true);
assert.equal(await screenController.startScreenSharing(), false, 'screen capture cannot start before the direct call is connected');
const screenPc = screenPeers[0];
screenPc.connectionState = 'connected';
screenPc.onconnectionstatechange();
const cameraTrack = screenPc.senders.find(sender => sender.track.kind === 'video').track;
const videoSender = screenPc.senders.find(sender => sender.track.kind === 'video');
assert.equal(await screenController.startScreenSharing(), true);
assert.equal(screenController.getState().screenSharing, true);
assert.equal(screenController.getState().cameraEnabled, false);
assert.equal(cameraTrack.enabled, false, 'camera is disabled while its sender carries the selected screen');
assert.equal(videoSender.track, screenStreams[0].getVideoTracks()[0]);
assert.equal(screenLocalStreams.at(-1), screenStreams[0], 'local preview changes to the selected screen');
assert.equal(screenController.setCameraEnabled(false), false, 'camera toggle is unavailable while sharing');
assert.equal(await screenController.stopScreenSharing(), true);
assert.equal(videoSender.track, cameraTrack, 'stopping restores the camera track');
assert.equal(cameraTrack.enabled, true, 'stopping restores the prior camera enabled state');
assert.equal(screenStreams[0].getVideoTracks()[0].stopped, true);
assert.equal(screenController.getState().screenSharing, false);
assert.equal(screenLocalStreams.at(-1), screenLocalStreams[0]);
assert.equal(screenLocalStreams.at(-1).getVideoTracks()[0], cameraTrack, 'local preview returns to the camera');

assert.equal(screenController.setCameraEnabled(false), true);
assert.equal(await screenController.startScreenSharing(), true);
assert.equal(await screenController.stopScreenSharing(), true);
assert.equal(cameraTrack.enabled, false, 'a previously disabled camera stays disabled after screen sharing');
assert.equal(screenStreams[1].getVideoTracks()[0].stopped, true);

assert.equal(screenController.setCameraEnabled(true), true);
assert.equal(await screenController.startScreenSharing(), true);
const browserEndedTrack = screenStreams[2].getVideoTracks()[0];
browserEndedTrack.end();
await new Promise(resolve => setImmediate(resolve));
assert.equal(screenController.getState().screenSharing, false, 'browser capture stop restores the camera automatically');
assert.equal(browserEndedTrack.stopped, true);
assert.equal(videoSender.track, cameraTrack);

assert.equal(await screenController.startScreenSharing(), true);
const hangupScreenTrack = screenStreams[3].getVideoTracks()[0];
assert.equal(await screenController.end(), true);
assert.equal(hangupScreenTrack.stopped, true, 'ending the call stops the active display capture track');
assert.equal(screenPc.closed, true);
assert.equal(screenLocalStreams.at(-1), null);
assert.equal(screenController.dismiss(), true);
assert.equal(screenController.receiveOffer({ peer, callId: '02'.repeat(16), media: 'video', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }), true);
assert.equal(await screenController.acceptIncoming(true), true, 'the recipient can accept a video call and share their screen');
assert.equal(screenController.getState().screenShareAvailable, true);
const incomingScreenPc = screenPeers.at(-1);
incomingScreenPc.connectionState = 'connected';
incomingScreenPc.onconnectionstatechange();
assert.equal(await screenController.startScreenSharing(), true);
assert.equal(screenController.getState().screenSharing, true);
assert.equal(await screenController.end(), true);
assert.equal(screenStreams[4].getVideoTracks()[0].stopped, true);
screenController.dispose();

const deviceStreams = [];
const deviceMedia = {
  async enumerateDevices() {
    return [
      { deviceId: 'mic-a', kind: 'audioinput', label: 'Built-in microphone' },
      { deviceId: 'mic-b', kind: 'audioinput', label: 'USB microphone' },
      { deviceId: 'camera-a', kind: 'videoinput', label: 'Front camera' },
      { deviceId: 'camera-b', kind: 'videoinput', label: 'USB camera' },
      { deviceId: 'speaker-a', kind: 'audiooutput', label: 'Built-in speaker' },
      { deviceId: 'speaker-b', kind: 'audiooutput', label: 'Headphones' }
    ];
  },
  async getUserMedia(constraints) {
    const deviceId = value => value && typeof value === 'object' ? value.deviceId?.exact || '' : '';
    if (deviceId(constraints.audio) === 'mic-denied') throw new Error('device unavailable');
    const stream = new FakeStream(constraints.video !== false, constraints.audio !== false, {
      audio: deviceId(constraints.audio), video: deviceId(constraints.video)
    });
    deviceStreams.push(stream);
    return stream;
  }
};
const remoteAudio = { sinkId: 'default', async setSinkId(deviceId) { this.sinkId = deviceId || 'default'; } };
const devicePeers = [];
const deviceController = Calls.create({
  mediaDevices: deviceMedia,
  remoteAudioElement: remoteAudio,
  createPeerConnection(configuration) { const pc = new FakePeerConnection(configuration); devicePeers.push(pc); return pc; },
  async onSignal() {}
});
const deviceCallId = '45'.repeat(16);
assert.equal(await deviceController.startOutgoing({ peer, callId: deviceCallId, video: true }), true);
assert.equal(deviceController.getState().deviceSelectionAvailable, true);
assert.equal(deviceController.getState().audioOutputSelectionAvailable, true);
assert.equal((await deviceController.listDevices()).length, 6);
assert.equal(await deviceController.receiveAnswer({ peer, callId: deviceCallId, media: 'video', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }), true);
devicePeers[0].connectionState = 'connected';
devicePeers[0].onconnectionstatechange();
const deviceAudioSender = devicePeers[0].senders.find(sender => sender.track.kind === 'audio');
const deviceVideoSender = devicePeers[0].senders.find(sender => sender.track.kind === 'video');
const originalAudio = deviceAudioSender.track;
const originalCamera = deviceVideoSender.track;
assert.equal(deviceController.setMicrophoneEnabled(false), true);
assert.equal(await deviceController.setAudioInputDevice('mic-b'), true);
assert.equal(deviceAudioSender.track.deviceId, 'mic-b');
assert.equal(deviceAudioSender.track.enabled, false, 'changing microphones preserves the mute state');
assert.equal(originalAudio.stopped, true, 'a replaced microphone is stopped');
assert.equal(deviceController.getState().audioInputId, 'mic-b');
assert.equal(deviceController.setCameraEnabled(false), true);
assert.equal(await deviceController.setVideoInputDevice('camera-b'), true);
assert.equal(deviceVideoSender.track.deviceId, 'camera-b');
assert.equal(deviceVideoSender.track.enabled, false, 'changing cameras preserves the camera-off state');
assert.equal(originalCamera.stopped, true, 'a replaced camera is stopped');
assert.equal(deviceController.getState().videoInputId, 'camera-b');
assert.equal(await deviceController.setAudioOutputDevice('speaker-b'), true);
assert.equal(remoteAudio.sinkId, 'speaker-b');
assert.equal(deviceController.getState().audioOutputId, 'speaker-b');
const retainedAudio = deviceAudioSender.track;
assert.equal(await deviceController.setAudioInputDevice('mic-denied'), false, 'a device switch fails closed when browser access is denied');
assert.equal(deviceAudioSender.track, retainedAudio, 'a rejected device switch preserves the current sender');
assert.equal(retainedAudio.stopped, false, 'a rejected device switch keeps the current microphone live');
assert.equal(deviceController.getState().deviceSettingsBusy, false, 'device controls unlock after a failed switch');
deviceAudioSender.failNextReplacement = true;
assert.equal(await deviceController.setAudioInputDevice('mic-a'), false, 'a rejected WebRTC track replacement fails closed');
assert.equal(deviceAudioSender.track, retainedAudio, 'a rejected WebRTC replacement keeps the previous sender track');
assert.equal(retainedAudio.stopped, false, 'the previous microphone remains live when WebRTC rejects a replacement');
assert.equal(await deviceController.end(), true);
deviceController.dismiss();
assert.equal(retainedAudio.stopped, true, 'ending the call stops the selected microphone');
assert.equal(deviceVideoSender.track.stopped, true, 'ending the call stops the selected camera');
assert.equal(remoteAudio.sinkId, 'default', 'ending the call resets the session-only speaker choice');

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

console.log('PASS: WebRTC call controller covers calls, media-device selection, screen sharing and cleanup');
