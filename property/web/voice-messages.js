'use strict';
(() => {
  const TAG = 'property-voice-v1';
  const FALLBACK_TEXT = '🎤 Voice message';
  const MAX_DURATION_MS = 10_000;
  const MIN_DURATION_MS = 400;
  const MAX_AUDIO_BYTES = 18_000;
  const MAX_RELAY_EVENT_BYTES = 60_000;
  const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
  const MIMES = Object.freeze(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);

  function preferredMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
    if (typeof MediaRecorderClass !== 'function') return '';
    for (const mime of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg']) {
      try { if (MediaRecorderClass.isTypeSupported?.(mime)) return mime; } catch {}
    }
    try { return MediaRecorderClass.isTypeSupported?.('audio/webm') ? 'audio/webm' : ''; } catch { return ''; }
  }

  function base64FromBytes(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x4000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x4000)));
    }
    return btoa(binary);
  }

  function bytesFromBase64(value) {
    if (typeof value !== 'string' || !value.length || value.length > MAX_BASE64_CHARS || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
    try {
      const binary = atob(value);
      if (!binary.length || binary.length > MAX_AUDIO_BYTES) return null;
      return Uint8Array.from(binary, character => character.charCodeAt(0));
    } catch { return null; }
  }

  async function createTag(recording, cryptoImpl = globalThis.crypto) {
    if (!recording || !recording.blob || typeof recording.blob.arrayBuffer !== 'function' || !Number.isSafeInteger(recording.durationMs) ||
        recording.durationMs < MIN_DURATION_MS || recording.durationMs > MAX_DURATION_MS) throw new TypeError('Voice recording is invalid or outside the supported duration.');
    const mime = String(recording.mime || recording.blob.type || '').split(';', 1)[0].trim().toLowerCase();
    if (!MIMES.includes(mime)) throw new TypeError('This audio format cannot be sent as a private voice message.');
    const bytes = new Uint8Array(await recording.blob.arrayBuffer());
    if (bytes.length < 1 || bytes.length > MAX_AUDIO_BYTES) throw new RangeError('Voice recording is too large for a standard Nostr relay event. Record a shorter message.');
    const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return Object.freeze([TAG, mime, String(recording.durationMs), String(bytes.length), hash, base64FromBytes(bytes)]);
  }

  async function fromTags(tags, cryptoImpl = globalThis.crypto) {
    if (!Array.isArray(tags)) return null;
    const matches = tags.filter(tag => Array.isArray(tag) && tag[0] === TAG);
    if (matches.length !== 1) return null;
    const tag = matches[0];
    if (tag.length !== 6 || !MIMES.includes(tag[1])) return null;
    if (typeof tag[2] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(tag[2])) return null;
    if (typeof tag[3] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(tag[3])) return null;
    const durationMs = Number(tag[2]);
    const sizeBytes = Number(tag[3]);
    if (!Number.isSafeInteger(durationMs) || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS ||
        !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_AUDIO_BYTES || !/^[0-9a-f]{64}$/.test(tag[4] || '')) return null;
    const bytes = bytesFromBase64(tag[5]);
    if (!bytes || bytes.length !== sizeBytes) return null;
    const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== tag[4]) return null;
    return Object.freeze({ version: 1, mime: tag[1], durationMs, sizeBytes, sha256: hash, base64: tag[5] });
  }

  function relayEventBytes(event, encoder = new TextEncoder()) {
    try { return encoder.encode(JSON.stringify(event)).byteLength; } catch { return Infinity; }
  }

  function formatDuration(durationMs) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) return '0:00';
    const seconds = Math.floor(durationMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function nextPlaybackRate(rate) {
    const rates = [1, 1.5, 2];
    const index = rates.indexOf(rate);
    return rates[index < 0 ? 0 : (index + 1) % rates.length];
  }

  class Recorder {
    constructor({ mediaDevices = globalThis.navigator?.mediaDevices, RecorderClass = globalThis.MediaRecorder, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
      this.mediaDevices = mediaDevices;
      this.RecorderClass = RecorderClass;
      this.now = now;
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
      this.startedAt = null;
      this.closed = false;
    }

    async start() {
      if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== 'function' || !this.RecorderClass) throw new Error('This browser cannot record voice messages.');
      const mimeType = preferredMimeType(this.RecorderClass);
      if (!mimeType) throw new Error('This browser does not offer a supported voice recording format.');
      this.stream = await this.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.closed) { this.release(); return; }
      try {
        this.recorder = new this.RecorderClass(this.stream, { mimeType, audioBitsPerSecond: 16_000 });
        this.recorder.addEventListener('dataavailable', event => { if (event.data?.size > 0) this.chunks.push(event.data); });
        this.recorder.start();
        this.startedAt = this.now();
      } catch (error) {
        this.release();
        throw new Error(error instanceof Error ? error.message : 'Could not start recording.');
      }
    }

    elapsed() {
      return this.startedAt === null ? 0 : Math.max(0, Math.min(MAX_DURATION_MS, Math.round(this.now() - this.startedAt)));
    }

    async stop() {
      const recorder = this.recorder;
      if (!recorder || this.closed) throw new Error('There is no active voice recording.');
      const durationMs = this.elapsed();
      if (recorder.state !== 'inactive') {
        await new Promise((resolve, reject) => {
          recorder.addEventListener('stop', resolve, { once: true });
          recorder.addEventListener('error', event => reject(event.error || new Error('Voice recording failed.')), { once: true });
          try { recorder.stop(); } catch (error) { reject(error); }
        });
      }
      const blob = new Blob(this.chunks, { type: recorder.mimeType || preferredMimeType(this.RecorderClass) });
      this.release();
      if (durationMs < MIN_DURATION_MS) throw new Error('The recording was too short. Hold the microphone a little longer.');
      if (!blob.size) throw new Error('The browser did not return any audio. Try recording again.');
      if (blob.size > MAX_AUDIO_BYTES) throw new Error('This recording is too large for a standard Nostr relay event. Record a shorter message.');
      const mime = String(blob.type || '').split(';', 1)[0].trim().toLowerCase();
      if (!MIMES.includes(mime)) throw new Error('This browser returned an unsupported audio format.');
      return Object.freeze({ blob, mime, durationMs });
    }

    cancel() {
      if (this.closed) return;
      const recorder = this.recorder;
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        try { recorder.stop(); } catch {}
      }
      this.chunks = [];
      this.release();
    }

    release() {
      if (this.closed) return;
      this.closed = true;
      for (const track of this.stream?.getTracks?.() || []) { try { track.stop(); } catch {} }
      this.stream = null;
      this.chunks = [];
    }
  }

  globalThis.PropertyVoiceMessages = Object.freeze({
    TAG, FALLBACK_TEXT, MAX_DURATION_MS, MIN_DURATION_MS, MAX_AUDIO_BYTES, MAX_RELAY_EVENT_BYTES,
    preferredMimeType, createTag, fromTags, bytesFromBase64, relayEventBytes, formatDuration, nextPlaybackRate, Recorder
  });
})();
