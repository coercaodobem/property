'use strict';
(() => {
  const RATES = Object.freeze([1, 1.5, 2]);
  const MAX_REMEMBERED_TRACKS = 100;

  function create(options = {}) {
    const audio = options.audio || new Audio();
    const onState = typeof options.onState === 'function' ? options.onState : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const mediaSession = options.mediaSession || globalThis.navigator?.mediaSession;
    const positions = new Map();
    let current = null;
    let rate = 1;
    let context = { view: 'messages', peer: '' };
    let pendingPosition = 0;

    function duration() {
      if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
      return Number.isFinite(current?.duration) && current.duration >= 0 ? current.duration : 0;
    }

    function position() {
      return Number.isFinite(audio.currentTime) && audio.currentTime >= 0
        ? audio.currentTime
        : (positions.get(current?.id) || 0);
    }

    function remember() {
      if (!current) return;
      const at = position();
      const length = duration();
      if (at > 0.05 && (!(length > 0) || at < length - 0.05)) {
        positions.delete(current.id);
        positions.set(current.id, at);
        while (positions.size > MAX_REMEMBERED_TRACKS) positions.delete(positions.keys().next().value);
      } else positions.delete(current.id);
    }

    function mediaMetadata() {
      if (!mediaSession) return;
      try {
        if (!current) {
          mediaSession.metadata = null;
          mediaSession.playbackState = 'none';
          return;
        }
        if (typeof globalThis.MediaMetadata === 'function') {
          const label = current.kind === 'voice' ? current.voiceLabel : current.audioLabel;
          mediaSession.metadata = new globalThis.MediaMetadata({ title: label, artist: 'Property' });
        }
        mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
        if (duration() > 0 && typeof mediaSession.setPositionState === 'function') {
          mediaSession.setPositionState({ duration: duration(), position: Math.min(position(), duration()), playbackRate: rate });
        }
      } catch { /* Media Session is optional and may reject unsupported position data. */ }
    }

    function snapshot() {
      if (!current) return null;
      return Object.freeze({
        ...current,
        position: position(),
        duration: duration(),
        playbackRate: rate,
        playing: audio.paused !== true && audio.ended !== true,
        away: context.view !== 'messages' || context.peer !== current.peer
      });
    }

    function notify() {
      mediaMetadata();
      onState(snapshot());
    }

    function seekPendingPosition() {
      if (!current || !(pendingPosition > 0) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      try { audio.currentTime = Math.min(pendingPosition, Math.max(0, audio.duration - 0.05)); } catch { /* Metadata may still be incomplete. */ }
      pendingPosition = 0;
    }

    function releaseMediaSource() {
      try {
        audio.pause();
        audio.removeAttribute?.('src');
        audio.src = '';
        audio.load?.();
      } catch { /* Source cleanup is best-effort across browser implementations. */ }
    }

    function validTrack(track) {
      return track && typeof track.id === 'string' && track.id.length > 0 && track.id.length <= 320 &&
        (track.kind === 'voice' || track.kind === 'audio') && typeof track.url === 'string' && track.url.startsWith('blob:') &&
        typeof track.peer === 'string' && track.peer.length > 0 && track.peer.length <= 128 &&
        typeof track.title === 'string' && track.title.length > 0 && track.title.length <= 180 &&
        typeof track.from === 'string' && track.from.length <= 120;
    }

    async function play(track) {
      if (!validTrack(track)) return false;
      if (current?.id === track.id) return resume();
      remember();
      current = null;
      pendingPosition = 0;
      releaseMediaSource();
      current = Object.freeze({
        id: track.id,
        kind: track.kind,
        title: track.title,
        from: track.from,
        peer: track.peer,
        messageId: typeof track.messageId === 'string' ? track.messageId : '',
        url: track.url,
        duration: Number.isFinite(track.duration) && track.duration >= 0 ? track.duration : 0,
        voiceLabel: typeof track.voiceLabel === 'string' && track.voiceLabel ? track.voiceLabel : 'Voice message',
        audioLabel: typeof track.audioLabel === 'string' && track.audioLabel ? track.audioLabel : 'Audio'
      });
      pendingPosition = positions.get(current.id) || 0;
      audio.preload = 'metadata';
      audio.playbackRate = rate;
      audio.src = current.url;
      audio.load?.();
      seekPendingPosition();
      notify();
      return resume();
    }

    function pause() {
      if (!current) return false;
      remember();
      try { audio.pause(); } catch { /* A stopped media element needs no further action. */ }
      notify();
      return true;
    }

    async function resume() {
      if (!current || typeof audio.play !== 'function') return false;
      try {
        const result = audio.play();
        if (result && typeof result.then === 'function') await result;
        notify();
        return true;
      } catch (error) {
        onError(error);
        notify();
        return false;
      }
    }

    function toggle(track) {
      if (current?.id !== track?.id) return play(track);
      return audio.paused ? resume() : pause();
    }

    function stop({ clearPosition = false } = {}) {
      if (!current) return false;
      const previous = current;
      remember();
      current = null;
      pendingPosition = 0;
      releaseMediaSource();
      if (clearPosition) positions.delete(previous.id);
      notify();
      return true;
    }

    function forget(id) {
      if (current?.id === id) return stop({ clearPosition: true });
      return positions.delete(id);
    }

    function seek(seconds) {
      if (!current || !Number.isFinite(seconds)) return false;
      const end = duration();
      const next = Math.max(0, end > 0 ? Math.min(end, seconds) : seconds);
      try { audio.currentTime = next; } catch { return false; }
      remember();
      notify();
      return true;
    }

    function setRate(next) {
      if (!RATES.includes(next)) return false;
      rate = next;
      if (current) {
        try { audio.playbackRate = rate; } catch { /* A browser may reject changing rate during a state transition. */ }
      }
      notify();
      return true;
    }

    function cycleRate() {
      const index = RATES.indexOf(rate);
      setRate(RATES[(index + 1) % RATES.length]);
      return rate;
    }

    function setContext(view, peer) {
      context = { view: typeof view === 'string' ? view : 'messages', peer: typeof peer === 'string' ? peer : '' };
      notify();
    }

    function onPlay() { if (current) notify(); }
    function onPause() { if (current) { remember(); notify(); } }
    function onTime() { if (current) { seekPendingPosition(); remember(); notify(); } }
    function onMetadata() { if (current) { seekPendingPosition(); notify(); } }
    function onEnded() {
      if (!current) return;
      positions.delete(current.id);
      current = null;
      pendingPosition = 0;
      releaseMediaSource();
      notify();
    }
    function onPlaybackError(event) {
      if (!current) return;
      const error = event?.error || new Error('The selected audio could not be played.');
      current = null;
      pendingPosition = 0;
      releaseMediaSource();
      notify();
      onError(error);
    }
    audio.addEventListener?.('play', onPlay);
    audio.addEventListener?.('pause', onPause);
    audio.addEventListener?.('timeupdate', onTime);
    audio.addEventListener?.('durationchange', onMetadata);
    audio.addEventListener?.('loadedmetadata', onMetadata);
    audio.addEventListener?.('ended', onEnded);
    audio.addEventListener?.('error', onPlaybackError);

    if (mediaSession?.setActionHandler) {
      try { mediaSession.setActionHandler('play', () => { void resume(); }); } catch { /* Optional action. */ }
      try { mediaSession.setActionHandler('pause', pause); } catch { /* Optional action. */ }
      try { mediaSession.setActionHandler('seekto', details => seek(Number(details?.seekTime))); } catch { /* Optional action. */ }
    }

    return Object.freeze({
      play, pause, resume, toggle, stop, forget, seek, setRate, cycleRate, setContext,
      getState: snapshot,
      getRate: () => rate,
      getPosition: id => positions.get(id) || 0,
      clear() {
        stop();
        positions.clear();
        if (!current) notify();
      },
      dispose() {
        stop({ clearPosition: true });
        positions.clear();
        audio.removeEventListener?.('play', onPlay);
        audio.removeEventListener?.('pause', onPause);
        audio.removeEventListener?.('timeupdate', onTime);
        audio.removeEventListener?.('durationchange', onMetadata);
        audio.removeEventListener?.('loadedmetadata', onMetadata);
        audio.removeEventListener?.('ended', onEnded);
        audio.removeEventListener?.('error', onPlaybackError);
        if (mediaSession?.setActionHandler) {
          for (const action of ['play', 'pause', 'seekto']) try { mediaSession.setActionHandler(action, null); } catch { /* Optional action. */ }
        }
      }
    });
  }

  window.PropertyAudioPlayback = Object.freeze({ RATES, MAX_REMEMBERED_TRACKS, create });
})();
