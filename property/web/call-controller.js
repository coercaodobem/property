'use strict';
(() => {
  const MAX_SDP_CHARS = 16_384;
  const ICE_GATHERING_WATCHDOG_MS = 12_000;
  const DEFAULT_ICE_SERVERS = Object.freeze([
    Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
    Object.freeze({ urls: 'stun:stun1.l.google.com:19302' })
  ]);

  function validCallId(value) { return typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value); }
  function validDescription(type, sdp, media) {
    return (type === 'offer' || type === 'answer') && typeof sdp === 'string' &&
      sdp.length > 0 && sdp.length <= MAX_SDP_CHARS && sdp.startsWith('v=0\r\n') &&
      /(?:^|\r?\n)m=audio\s/.test(sdp) && (media !== 'video' || /(?:^|\r?\n)m=video\s/.test(sdp));
  }

  function create(options = {}) {
    const mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices;
    const PeerConnection = options.RTCPeerConnection || globalThis.RTCPeerConnection;
    const createPeerConnection = options.createPeerConnection || (configuration => new PeerConnection(configuration));
    const emitSignal = typeof options.onSignal === 'function' ? options.onSignal : async () => {};
    const onState = typeof options.onState === 'function' ? options.onState : () => {};
    const onRemoteStream = typeof options.onRemoteStream === 'function' ? options.onRemoteStream : () => {};
    const onLocalStream = typeof options.onLocalStream === 'function' ? options.onLocalStream : () => {};
    const iceServers = Array.isArray(options.iceServers) ? options.iceServers : DEFAULT_ICE_SERVERS;
    let current = null;

    function snapshot(session = current) {
      if (!session) return null;
      return Object.freeze({
        callId: session.callId,
        peer: session.peer,
        outgoing: session.outgoing,
        requestedMedia: session.requestedMedia,
        localMedia: session.localMedia,
        status: session.status,
        microphoneEnabled: session.localStream?.getAudioTracks().some(track => track.enabled) ?? false,
        cameraEnabled: session.localStream?.getVideoTracks().some(track => track.enabled) ?? false,
        error: session.error || ''
      });
    }

    function update(session, status, error = '') {
      if (current !== session) return;
      session.status = status;
      session.error = error;
      onState(snapshot(session));
    }

    function releaseMedia(session) {
      for (const track of session.localStream?.getTracks?.() || []) {
        try { track.stop(); } catch { /* A stopped browser track needs no further action. */ }
      }
      session.localStream = null;
      onLocalStream(null);
      session.peerConnection?.close?.();
      session.peerConnection = null;
      session.remoteStream = null;
      onRemoteStream(null);
    }

    function terminal(session, status, error = '') {
      if (current !== session) return false;
      releaseMedia(session);
      update(session, status, error);
      return true;
    }

    async function getLocalStream(video) {
      if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
        throw new Error('This browser does not provide microphone and camera access.');
      }
      const stream = await mediaDevices.getUserMedia({ audio: true, video: video === true });
      if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
        for (const track of stream?.getTracks?.() || []) track.stop();
        throw new Error('The browser did not provide an audio track.');
      }
      return stream;
    }

    function waitForIceGathering(session) {
      const pc = session.peerConnection;
      if (pc.iceGatheringState === 'complete') return Promise.resolve();
      return new Promise(resolve => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          pc.removeEventListener?.('icegatheringstatechange', check);
          if (pc.onicegatheringstatechange === check) pc.onicegatheringstatechange = null;
          resolve();
        };
        const check = () => { if (pc.iceGatheringState === 'complete' || current !== session) finish(); };
        const timer = setTimeout(finish, ICE_GATHERING_WATCHDOG_MS);
        if (typeof pc.addEventListener === 'function') pc.addEventListener('icegatheringstatechange', check);
        else pc.onicegatheringstatechange = check;
        check();
      });
    }

    function makePeerConnection(session) {
      if (typeof createPeerConnection !== 'function' || (!options.createPeerConnection && typeof PeerConnection !== 'function')) {
        throw new Error('This browser does not support direct WebRTC calls.');
      }
      const pc = createPeerConnection({ iceServers });
      session.peerConnection = pc;
      pc.ontrack = event => {
        if (current !== session) return;
        const stream = event.streams?.[0] || null;
        session.remoteStream = stream;
        onRemoteStream(stream);
      };
      const connectionChanged = () => {
        if (current !== session) return;
        const state = pc.connectionState || pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') update(session, 'connected');
        else if (state === 'disconnected') update(session, 'reconnecting');
        else if (state === 'failed') terminal(session, 'no-path', 'No direct media path was found.');
      };
      pc.onconnectionstatechange = connectionChanged;
      pc.oniceconnectionstatechange = connectionChanged;
      return pc;
    }

    async function prepareLocalDescription(session, description, signalAction, media) {
      const pc = session.peerConnection;
      await pc.setLocalDescription(description);
      await waitForIceGathering(session);
      if (current !== session || session.status === 'ended') return false;
      const sdp = pc.localDescription?.sdp;
      if (!validDescription(signalAction === 'call-offer' ? 'offer' : 'answer', sdp, media)) {
        throw new Error('The browser produced an invalid call description.');
      }
      await emitSignal({ action: signalAction, callId: session.callId, peer: session.peer, media, sdp });
      return current === session;
    }

    async function startOutgoing({ peer, callId, video = false }) {
        if (current && !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(current.status)) throw new Error('A call is already active.');
      if (current) dismiss();
      if (!validCallId(callId) || typeof peer !== 'string' || !/^[0-9a-f]{64}$/i.test(peer)) throw new TypeError('Invalid call recipient or identifier.');
      const session = current = { callId, peer: peer.toLowerCase(), outgoing: true, requestedMedia: video ? 'video' : 'audio', localMedia: video ? 'video' : 'audio', status: 'requesting-media', peerConnection: null, localStream: null, remoteStream: null, error: '' };
      update(session, 'requesting-media');
      try {
        session.localStream = await getLocalStream(video);
        if (current !== session) { for (const track of session.localStream.getTracks()) track.stop(); return false; }
        onLocalStream(session.localStream);
        const pc = makePeerConnection(session);
        for (const track of session.localStream.getTracks()) pc.addTrack(track, session.localStream);
        const offer = await pc.createOffer();
        await prepareLocalDescription(session, offer, 'call-offer', session.requestedMedia);
        if (current === session && session.status !== 'no-path') update(session, 'ringing');
        return current === session;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'Could not start this call.');
        return false;
      }
    }

    function receiveOffer({ peer, callId, media, sdp }) {
      if (!validCallId(callId) || typeof peer !== 'string' || !/^[0-9a-f]{64}$/i.test(peer) ||
          !['audio', 'video'].includes(media) || !validDescription('offer', sdp, media)) return false;
      if (current && !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(current.status)) return false;
      if (current) dismiss();
      const session = current = { callId, peer: peer.toLowerCase(), outgoing: false, requestedMedia: media, localMedia: '', remoteOffer: sdp, status: 'incoming', peerConnection: null, localStream: null, remoteStream: null, error: '' };
      update(session, 'incoming');
      return true;
    }

    async function acceptIncoming(video = false) {
      const session = current;
      if (!session || session.outgoing || session.status !== 'incoming') return false;
      const withVideo = video === true && session.requestedMedia === 'video';
      session.localMedia = withVideo ? 'video' : 'audio';
      update(session, 'requesting-media');
      try {
        session.localStream = await getLocalStream(withVideo);
        if (current !== session) { for (const track of session.localStream.getTracks()) track.stop(); return false; }
        onLocalStream(session.localStream);
        const pc = makePeerConnection(session);
        for (const track of session.localStream.getTracks()) pc.addTrack(track, session.localStream);
        await pc.setRemoteDescription({ type: 'offer', sdp: session.remoteOffer });
        const answer = await pc.createAnswer();
        await prepareLocalDescription(session, answer, 'call-answer', session.localMedia);
        if (current === session && session.status !== 'no-path') update(session, 'connecting');
        return current === session;
      } catch (error) {
        if (current === session && session.status === 'requesting-media') {
          try { await emitSignal({ action: 'call-decline', callId: session.callId, peer: session.peer }); } catch { /* A permission or setup failure may leave no signal route. */ }
        }
        terminal(session, 'failed', error?.message || 'Could not answer this call.');
        return false;
      }
    }

    async function receiveAnswer({ peer, callId, media, sdp }) {
      const session = current;
      if (!session || !session.outgoing || session.callId !== callId || session.peer !== String(peer || '').toLowerCase() ||
          !['audio', 'video'].includes(media) || (session.requestedMedia === 'audio' && media !== 'audio') ||
          !validDescription('answer', sdp, media) || !session.peerConnection) return false;
      try {
        await session.peerConnection.setRemoteDescription({ type: 'answer', sdp });
        if (current === session) update(session, 'connecting');
        return true;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'The other person’s answer could not be opened.');
        return false;
      }
    }

    function receiveEnd({ peer, callId, action }) {
      const session = current;
      if (!session || session.callId !== callId || session.peer !== String(peer || '').toLowerCase() ||
          !['call-decline', 'call-busy', 'call-hangup'].includes(action)) return false;
      const status = action === 'call-busy' ? 'busy' : action === 'call-decline' ? 'declined' : 'ended';
      return terminal(session, status);
    }

    async function end(action = 'call-hangup') {
      const session = current;
      if (!session || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
      if (!['call-decline', 'call-hangup'].includes(action)) throw new TypeError('Invalid local call ending action.');
      try { await emitSignal({ action, callId: session.callId, peer: session.peer }); }
      finally { terminal(session, action === 'call-decline' ? 'declined' : 'ended'); }
      return true;
    }

    function setMicrophoneEnabled(enabled) {
      if (typeof enabled !== 'boolean' || !current?.localStream) return false;
      const tracks = current.localStream.getAudioTracks();
      if (!tracks.length) return false;
      for (const track of tracks) track.enabled = enabled;
      onState(snapshot());
      return true;
    }

    function setCameraEnabled(enabled) {
      if (typeof enabled !== 'boolean' || !current?.localStream || current.localMedia !== 'video') return false;
      const tracks = current.localStream.getVideoTracks();
      if (!tracks.length) return false;
      for (const track of tracks) track.enabled = enabled;
      onState(snapshot());
      return true;
    }

    function dismiss() {
      if (!current || !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(current.status)) return false;
      const previous = current;
      current = null;
      releaseMedia(previous);
      onState(null);
      return true;
    }

    function dispose() {
      if (!current) return false;
      const previous = current;
      current = null;
      releaseMedia(previous);
      onState(null);
      return true;
    }

    return Object.freeze({
      startOutgoing,
      receiveOffer,
      acceptIncoming,
      receiveAnswer,
      receiveEnd,
      end,
      setMicrophoneEnabled,
      setCameraEnabled,
      dismiss,
      dispose,
      getState: () => snapshot()
    });
  }

  window.PropertyCalls = Object.freeze({ MAX_SDP_CHARS, ICE_GATHERING_WATCHDOG_MS, DEFAULT_ICE_SERVERS, validCallId, validDescription, create });
})();
