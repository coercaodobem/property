import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, Event, CustomEvent, EventTarget, btoa, atob, console, setTimeout, clearTimeout, performance: { now: () => 1000 } };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/voice-messages.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const result = await vm.runInContext(`(async () => {
  const voice = PropertyVoiceMessages;
  const nostr = NostrTools;
  const senderSecret = new Uint8Array(32).fill(1);
  const recipients = [new Uint8Array(32).fill(2), new Uint8Array(32).fill(3)];
  const senderPubkey = nostr.getPublicKey(senderSecret);
  const recipientPubkeys = recipients.map(secret => nostr.getPublicKey(secret));
  const sampleBytes = Uint8Array.from({ length: voice.MAX_AUDIO_BYTES }, (_, index) => index % 251);
  const recording = { blob: new Blob([sampleBytes], { type: 'audio/webm;codecs=opus' }), mime: 'audio/webm;codecs=opus', durationMs: voice.MAX_DURATION_MS };
  const mediaTag = await voice.createTag(recording);
  const groupRumor = nostr.nip59.createRumor({
    kind: 14,
    tags: [...recipientPubkeys.map(pubkey => ['p', pubkey]), mediaTag],
    content: voice.FALLBACK_TEXT
  }, senderSecret);
  const memberSecrets = [...recipients, senderSecret];
  const memberPubkeys = [...recipientPubkeys, senderPubkey];
  const groupWraps = memberPubkeys.map(pubkey => nostr.nip59.createWrap(nostr.nip59.createSeal(groupRumor, senderSecret, pubkey), pubkey));
  const groupOpened = groupWraps.map((event, index) => nostr.nip17.unwrapEvent(event, memberSecrets[index]));
  const directRumor = nostr.nip59.createRumor({ kind: 14, tags: [['p', recipientPubkeys[0]], mediaTag], content: voice.FALLBACK_TEXT }, senderSecret);
  const directSecrets = [senderSecret, recipients[0]];
  const directPubkeys = [senderPubkey, recipientPubkeys[0]];
  const directWraps = directPubkeys.map(pubkey => nostr.nip59.createWrap(nostr.nip59.createSeal(directRumor, senderSecret, pubkey), pubkey));
  const directOpened = directWraps.map((event, index) => nostr.nip17.unwrapEvent(event, directSecrets[index]));
  const opened = [...groupOpened, ...directOpened];
  const parsed = await voice.fromTags(directOpened[0].tags);
  const damaged = mediaTag.slice();
  damaged[5] = damaged[5].slice(0, -4) + 'AAAA';
  const badHash = await voice.fromTags([...recipientPubkeys.map(pubkey => ['p', pubkey]), damaged]);
  const duplicate = await voice.fromTags([...recipientPubkeys.map(pubkey => ['p', pubkey]), mediaTag, mediaTag]);
  const malformedSize = mediaTag.slice(); malformedSize[3] = String(voice.MAX_AUDIO_BYTES + 1);
  const tooLarge = await voice.fromTags([...recipientPubkeys.map(pubkey => ['p', pubkey]), malformedSize]);
  let shortRecordingRejected = false;
  try { await voice.createTag({ ...recording, durationMs: voice.MIN_DURATION_MS - 1 }); } catch { shortRecordingRejected = true; }
  let badMimeRejected = false;
  try { await voice.createTag({ ...recording, mime: 'text/html' }); } catch { badMimeRejected = true; }
  let largeRecordingRejected = false;
  try { await voice.createTag({ ...recording, blob: new Blob([new Uint8Array(voice.MAX_AUDIO_BYTES + 1)], { type: 'audio/webm' }) }); } catch { largeRecordingRejected = true; }
  let wrongRecipientRejected = false;
  try { nostr.nip17.unwrapEvent(directWraps[1], recipients[1]); } catch { wrongRecipientRejected = true; }
  const allWraps = [...directWraps, ...groupWraps];
  const wrapperSizes = allWraps.map(event => voice.relayEventBytes(event));
  return {
    fallback: opened.every(event => event.content === voice.FALLBACK_TEXT),
    directRumorSharedAcrossRecipients: directOpened.every(event => event.id === directRumor.id),
    groupRumorSharedAcrossRecipients: groupOpened.every(event => event.id === groupRumor.id),
    directWrapCount: directWraps.length,
    groupWrapCount: groupWraps.length,
    payloadIntegrity: parsed?.sizeBytes === voice.MAX_AUDIO_BYTES && parsed.durationMs === voice.MAX_DURATION_MS && parsed.mime === 'audio/webm' && parsed.sha256 === mediaTag[4],
    wrongRecipientRejected,
    outerRouteTagsOnly: allWraps.every(event => event.tags.length === 1 && event.tags[0][0] === 'p'),
    encryptedPayloadNotVisible: allWraps.every(event => !event.content.includes(mediaTag[5]) && !event.content.includes(voice.FALLBACK_TEXT)),
    wrapperSizes,
    wrapperSizeLimit: wrapperSizes.every(bytes => bytes <= voice.MAX_RELAY_EVENT_BYTES),
    tamperedAudioRejected: badHash === null,
    duplicateAudioTagsRejected: duplicate === null,
    oversizedTagRejected: tooLarge === null,
    shortRecordingRejected,
    badMimeRejected,
    largeRecordingRejected,
    formatDuration: voice.formatDuration(5400),
    playbackRates: [voice.nextPlaybackRate(1), voice.nextPlaybackRate(1.5), voice.nextPlaybackRate(2), voice.nextPlaybackRate(99)]
  };
})()`, context, { timeout: 30000 });

assert.equal(result.fallback, true, 'unknown NIP-17 clients retain a readable voice-message fallback');
assert.equal(result.directRumorSharedAcrossRecipients, true, 'the direct sender and recipient decrypt the same NIP-17 rumor');
assert.equal(result.groupRumorSharedAcrossRecipients, true, 'every group member decrypts the same NIP-17 rumor');
assert.equal(result.directWrapCount, 2);
assert.equal(result.groupWrapCount, 3);
assert.equal(result.payloadIntegrity, true, 'voice bytes are bounded, hashed and validated before playback');
assert.equal(result.wrongRecipientRejected, true);
assert.equal(result.outerRouteTagsOnly, true, 'outer gift wraps route only to their intended recipient');
assert.equal(result.encryptedPayloadNotVisible, true, 'outer relay events reveal neither fallback nor audio data');
assert.equal(result.wrapperSizeLimit, true, `every wrapped event remains under the ${context.PropertyVoiceMessages.MAX_RELAY_EVENT_BYTES}-byte safety limit: ${result.wrapperSizes}`);
assert.equal(result.tamperedAudioRejected, true);
assert.equal(result.duplicateAudioTagsRejected, true);
assert.equal(result.oversizedTagRejected, true);
assert.equal(result.shortRecordingRejected, true);
assert.equal(result.badMimeRejected, true);
assert.equal(result.largeRecordingRejected, true);
assert.equal(result.formatDuration, '0:05');
assert.deepEqual(Array.from(result.playbackRates), [1.5, 2, 1, 1]);

let clock = 1000;
let stoppedTracks = 0;
class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(mime) { return mime === 'audio/webm;codecs=opus'; }
  constructor(stream, options) { super(); this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  pause() { if (this.state === 'recording') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    const data = new Event('dataavailable'); Object.defineProperty(data, 'data', { value: new Blob([new Uint8Array(128)], { type: 'audio/webm;codecs=opus' }) });
    this.dispatchEvent(data); this.dispatchEvent(new Event('stop'));
  }
}
const stream = { getTracks: () => [{ stop() { stoppedTracks++; } }] };
const recorder = new context.PropertyVoiceMessages.Recorder({ mediaDevices: { getUserMedia: async () => stream }, RecorderClass: FakeMediaRecorder, now: () => clock });
await recorder.start();
clock += 1500;
const captured = await recorder.stop();
assert.equal(captured.durationMs, 1500, 'recording duration uses the injected logical clock');
assert.equal(captured.blob.size, 128);
assert.equal(stoppedTracks, 1, 'the microphone track is released immediately after stop');

clock = 2000;
const pausedRecorder = new context.PropertyVoiceMessages.Recorder({ mediaDevices: { getUserMedia: async () => stream }, RecorderClass: FakeMediaRecorder, now: () => clock });
await pausedRecorder.start();
clock += 1500;
assert.equal(pausedRecorder.pause(), true);
assert.equal(pausedRecorder.isPaused(), true);
assert.equal(pausedRecorder.elapsed(), 1500);
clock += 8000;
assert.equal(pausedRecorder.elapsed(), 1500, 'time spent paused does not count toward the recording or its 10-second cap');
assert.equal(pausedRecorder.resume(), true);
clock += 1250;
assert.equal(pausedRecorder.elapsed(), 2750);
assert.equal(pausedRecorder.pause(), true);
clock += 4000;
const resumed = await pausedRecorder.stop();
assert.equal(resumed.durationMs, 2750, 'stopping while paused keeps only recorded intervals');
assert.equal(resumed.blob.size, 128);
assert.equal(pausedRecorder.resume(), false, 'a stopped recorder cannot resume');
assert.equal(stoppedTracks, 2, 'the microphone is released after a paused recording is stopped');
assert.equal(pausedRecorder.pause(), false, 'a stopped recorder cannot pause');

console.log(`PASS: private NIP-17 voice payloads, pause/resume excludes paused time, direct (2) and group (3) recipient wrapping/isolation, ${result.wrapperSizes.length} bounded relay envelopes, integrity guards, and microphone release`);
