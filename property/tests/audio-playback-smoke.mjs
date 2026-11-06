import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/audio-playback.js', import.meta.url), 'utf8');
const context = {
  window: {}, Event, EventTarget,
  MediaMetadata: class MediaMetadata { constructor(data) { Object.assign(this, data); } }
};
vm.runInNewContext(source, context, { timeout: 5000 });
const Playback = context.window.PropertyAudioPlayback;

class FakeAudio extends EventTarget {
  constructor() { super(); this.paused = true; this.ended = false; this.duration = NaN; this.currentTime = 0; this.playbackRate = 1; this.src = ''; }
  async play() { this.paused = false; this.ended = false; this.dispatchEvent(new Event('play')); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {
    if (!this.src) { this.duration = NaN; this.currentTime = 0; return; }
    this.duration = 10;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  tick(seconds) { this.currentTime = seconds; this.dispatchEvent(new Event('timeupdate')); }
  finish() { this.currentTime = this.duration; this.ended = true; this.paused = true; this.dispatchEvent(new Event('ended')); }
}

const audio = new FakeAudio();
const changes = [];
const handlers = new Map();
const mediaSession = {
  metadata: null,
  playbackState: 'none',
  setActionHandler(action, handler) { handlers.set(action, handler); },
  setPositionState(position) { this.position = position; }
};
const player = Playback.create({ audio, mediaSession, onState: state => changes.push(state) });
const first = { id: 'voice:peer-a:m1', kind: 'voice', url: 'blob:voice-one', title: 'Voice message', from: 'Ari', peer: 'peer-a', messageId: 'm1', duration: 8, voiceLabel: 'Voice message' };
const second = { id: 'audio:peer-b:file-2', kind: 'audio', url: 'blob:audio-two', title: 'Song demo.ogg', from: 'You', peer: 'peer-b', messageId: 'm2', duration: 0, audioLabel: 'Audio' };

assert.equal(await player.play(first), true, 'a validated local voice note starts');
assert.equal(player.getState().playing, true);
assert.equal(mediaSession.playbackState, 'playing');
assert.equal(mediaSession.metadata.title, 'Voice message', 'system media metadata uses a generic private title');
audio.tick(3.25);
assert.equal(player.getPosition(first.id), 3.25, 'the message position is remembered for this session');
assert.equal(handlers.has('seekto'), true, 'system seek controls are available when supported');
player.setContext('hangout', 'peer-b');
assert.equal(player.getState().away, true, 'audio state survives navigation away from its conversation');
assert.equal(await player.toggle(second), true, 'a second audio track can replace the first without leaving a live element');
assert.equal(audio.src, second.url);
assert.equal(player.getPosition(first.id), 3.25, 'switching tracks preserves the first track position');
assert.equal(player.getState().id, second.id);
assert.equal(await player.toggle(second), true, 'toggling active playback pauses it');
assert.equal(player.getState().playing, false);
assert.equal(await player.toggle(second), true, 'toggling a paused track resumes it');
player.setRate(1.5);
assert.equal(audio.playbackRate, 1.5);
assert.equal(player.getState().playbackRate, 1.5);
assert.equal(player.cycleRate(), 2);
assert.equal(player.cycleRate(), 1);
assert.equal(player.seek(4.5), true);
assert.equal(audio.currentTime, 4.5);
assert.equal(player.getPosition(second.id), 4.5);
player.setContext('messages', 'peer-b');
assert.equal(player.getState().away, false, 'the chat bubble can own the controls again when its conversation is open');
assert.equal(await player.stop(), true);
assert.equal(audio.src, '', 'closing playback releases the media source');
assert.equal(player.getPosition(second.id), 4.5, 'closing playback preserves the per-message position');
assert.equal(await player.play(second), true);
assert.equal(audio.currentTime, 4.5, 'reopening a paused track resumes from its saved position');
audio.finish();
assert.equal(player.getState(), null, 'completed playback clears the global bar');
assert.equal(audio.src, '', 'completed playback releases the local media source');
assert.equal(player.getPosition(second.id), 0, 'a completed track starts at the beginning next time');
assert.equal(await player.play({ ...first, url: 'https://media.example/audio.ogg' }), false, 'remote media sources are rejected');
assert.ok(changes.length >= 12, 'fixed media state changes notify the UI');
player.clear();
assert.equal(player.getPosition(first.id), 0, 'locking clears remembered media positions');
assert.equal(mediaSession.playbackState, 'none');

console.log('PASS: one local audio player survives view changes, preserves session positions, exposes accessible controls, and clears on lock');
