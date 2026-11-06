'use strict';
(() => {
  const MAX_SDP_CHARS = 16_384;
  const ICE_GATHERING_WATCHDOG_MS = 12_000;
  const ICE_RESTART_GRACE_MS = 1_000;
  const ICE_RESTART_REPLY_MS = 8_000;
  const ICE_RECONNECT_LIMIT_MS = 24_000;
  const MAX_ICE_RESTARTS = 3;
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
    const remoteAudioElement = options.remoteAudioElement || null;
    const iceServers = Array.isArray(options.iceServers) ? options.iceServers : DEFAULT_ICE_SERVERS;
    const schedule = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    const unschedule = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    let current = null;

    function peerConnectionConfiguration() {
      if (typeof options.getIceConfiguration !== 'function') return { iceServers };
      const configuration = options.getIceConfiguration();
      if (!configuration || !Array.isArray(configuration.iceServers)) throw new TypeError('Invalid WebRTC ICE configuration.');
      return {
        iceServers: configuration.iceServers,
        ...(configuration.iceTransportPolicy === 'relay' ? { iceTransportPolicy: 'relay' } : {})
      };
    }

    function snapshot(session = current) {
      if (!session) return null;
      return Object.freeze({
        callId: session.callId,
        peer: session.peer,
        outgoing: session.outgoing,
        requestedMedia: session.requestedMedia,
        localMedia: session.localMedia,
        status: session.status,
        localMediaReady: Boolean(session.localStream),
        deviceSelectionAvailable: typeof mediaDevices?.enumerateDevices === 'function',
        audioOutputSelectionAvailable: typeof remoteAudioElement?.setSinkId === 'function',
        audioInputId: session.audioInputId || '',
        videoInputId: session.videoInputId || '',
        audioOutputId: session.audioOutputId || '',
        deviceSettingsBusy: session.deviceTransition === true,
        microphoneEnabled: session.localStream?.getAudioTracks().some(track => track.enabled) ?? false,
        cameraEnabled: !session.screenTrack && (session.localStream?.getVideoTracks().some(track => track.enabled) ?? false),
        screenSharing: Boolean(session.screenTrack),
        screenShareBusy: session.screenTransition === true,
        screenShareAvailable: session.localMedia === 'video' && session.videoNegotiated === true &&
          typeof mediaDevices?.getDisplayMedia === 'function' && typeof session.videoSender?.replaceTrack === 'function',
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
      clearRestartTimers(session);
      if (session.screenTrack) {
        session.screenTrack.onended = null;
        try { session.screenTrack.stop(); } catch { /* A stopped browser track needs no further action. */ }
      }
      for (const track of session.screenStream?.getTracks?.() || []) {
        try { track.stop(); } catch { /* A stopped browser track needs no further action. */ }
      }
      session.screenTrack = null;
      session.screenStream = null;
      session.videoSender = null;
      for (const track of session.localStream?.getTracks?.() || []) {
        try { track.stop(); } catch { /* A stopped browser track needs no further action. */ }
      }
      session.localStream = null;
      onLocalStream(null);
      session.peerConnection?.close?.();
      session.peerConnection = null;
      session.remoteStream = null;
      onRemoteStream(null);
      if (typeof remoteAudioElement?.setSinkId === 'function' && session.audioOutputId && session.audioOutputId !== 'default') {
        try { remoteAudioElement.setSinkId('')?.catch?.(() => {}); } catch { /* Output reset is best-effort after the call ends. */ }
      }
    }

    function terminal(session, status, error = '') {
      if (current !== session) return false;
      releaseMedia(session);
      update(session, status, error);
      return true;
    }

    function clearRestartTimers(session) {
      for (const key of ['restartGraceTimer', 'restartReplyTimer', 'reconnectLimitTimer']) {
        if (session[key] !== null && session[key] !== undefined) unschedule(session[key]);
        session[key] = null;
      }
    }

    function noPath(session) {
      if (current !== session) return false;
      clearRestartTimers(session);
      return terminal(session, 'no-path', 'The direct media path could not be restored.');
    }

    function restartCapability(session) {
      return session?.localRestartIce === true && session.peerRestartIce === true &&
        typeof session.peerConnection?.createOffer === 'function';
    }

    function scheduleIceRestart(session, immediate = false) {
      if (current !== session || !session.everConnected || !session.outgoing || session.restartInFlight ||
          !restartCapability(session) || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
      if (session.reconnectLimitTimer === null) {
        session.reconnectLimitTimer = schedule(() => noPath(session), ICE_RECONNECT_LIMIT_MS);
      }
      if (session.restartGraceTimer !== null) return true;
      session.restartGraceTimer = schedule(() => {
        session.restartGraceTimer = null;
        void restartIce(session);
      }, immediate ? 0 : ICE_RESTART_GRACE_MS);
      return true;
    }

    async function restartIce(session) {
      if (current !== session || !session.everConnected || !session.outgoing || session.restartInFlight ||
          !restartCapability(session) || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
      if (session.restartAttempts >= MAX_ICE_RESTARTS) return noPath(session);
      const pc = session.peerConnection;
      if (!pc || (pc.signalingState && pc.signalingState !== 'stable')) {
        scheduleIceRestart(session);
        return false;
      }
      session.restartAttempts += 1;
      const restartId = session.restartAttempts;
      session.pendingRestartId = restartId;
      session.restartInFlight = true;
      update(session, 'reconnecting');
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        if (current !== session || session.pendingRestartId !== restartId) return false;
        await prepareLocalDescription(session, offer, 'call-restart-offer', session.requestedMedia, { restartId });
        if (current !== session || session.pendingRestartId !== restartId) return false;
        session.restartReplyTimer = schedule(async () => {
          session.restartReplyTimer = null;
          if (current !== session || session.pendingRestartId !== restartId) return;
          if (session.restartAttempts >= MAX_ICE_RESTARTS) {
            noPath(session);
            return;
          }
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch {
            noPath(session);
            return;
          }
          if (current !== session || session.pendingRestartId !== restartId) return;
          session.pendingRestartId = 0;
          session.restartInFlight = false;
          scheduleIceRestart(session, true);
        }, ICE_RESTART_REPLY_MS);
        return true;
      } catch (error) {
        if (current === session && session.pendingRestartId === restartId) {
          session.pendingRestartId = 0;
          session.restartInFlight = false;
          session.error = error?.message || 'Could not restart the direct media path.';
          if (session.restartAttempts >= MAX_ICE_RESTARTS) noPath(session);
          else scheduleIceRestart(session, true);
        }
        return false;
      }
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
      const pc = createPeerConnection(peerConnectionConfiguration());
      session.peerConnection = pc;
      pc.ontrack = event => {
        if (current !== session) return;
        const stream = event.streams?.[0] || null;
        session.remoteStream = stream;
        onRemoteStream(stream);
      };
      const connectionChanged = () => {
        if (current !== session) return;
        const connection = pc.connectionState;
        const ice = pc.iceConnectionState;
        if (connection === 'failed' || ice === 'failed') {
          if (!session.everConnected) {
            terminal(session, 'no-path', 'No direct media path was found.');
            return;
          }
          update(session, 'reconnecting');
          if (session.outgoing) {
            if (!restartCapability(session)) noPath(session);
            else scheduleIceRestart(session, true);
          } else if (!restartCapability(session)) noPath(session);
          else if (session.reconnectLimitTimer === null) session.reconnectLimitTimer = schedule(() => noPath(session), ICE_RECONNECT_LIMIT_MS);
          return;
        }
        if (connection === 'disconnected' || ice === 'disconnected') {
          if (!session.everConnected) {
            update(session, 'connecting');
            return;
          }
          update(session, 'reconnecting');
          if (session.outgoing) {
            if (!restartCapability(session)) noPath(session);
            else scheduleIceRestart(session);
          } else if (!restartCapability(session)) noPath(session);
          else if (session.reconnectLimitTimer === null) session.reconnectLimitTimer = schedule(() => noPath(session), ICE_RECONNECT_LIMIT_MS);
          return;
        }
        if (connection === 'connected' || connection === 'completed' || ice === 'connected' || ice === 'completed') {
          session.everConnected = true;
          clearRestartTimers(session);
          session.restartAttempts = 0;
          session.pendingRestartId = 0;
          session.restartInFlight = false;
          update(session, 'connected');
        }
      };
      pc.onconnectionstatechange = connectionChanged;
      pc.oniceconnectionstatechange = connectionChanged;
      return pc;
    }

    function addLocalTracks(session, pc) {
      for (const track of session.localStream.getTracks()) {
        const sender = pc.addTrack(track, session.localStream);
        if (track.kind === 'audio') {
          session.audioSender = sender;
          session.audioTrack = track;
          session.audioInputId = track.getSettings?.().deviceId || '';
        } else if (track.kind === 'video') {
          session.videoSender = sender;
          session.cameraTrack = track;
          session.videoInputId = track.getSettings?.().deviceId || '';
        }
      }
      session.audioOutputId = remoteAudioElement?.sinkId || '';
    }

    async function prepareLocalDescription(session, description, signalAction, media, details = {}) {
      const pc = session.peerConnection;
      await pc.setLocalDescription(description);
      await waitForIceGathering(session);
      if (current !== session || session.status === 'ended') return false;
      const sdp = pc.localDescription?.sdp;
      const offerAction = signalAction === 'call-offer' || signalAction === 'call-restart-offer';
      if (!validDescription(offerAction ? 'offer' : 'answer', sdp, media)) {
        throw new Error('The browser produced an invalid call description.');
      }
      await emitSignal({ action: signalAction, callId: session.callId, peer: session.peer, media, sdp, ...details });
      return current === session;
    }

    async function startOutgoing({ peer, callId, video = false }) {
        if (current && !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(current.status)) throw new Error('A call is already active.');
      if (current) dismiss();
      if (!validCallId(callId) || typeof peer !== 'string' || !/^[0-9a-f]{64}$/i.test(peer)) throw new TypeError('Invalid call recipient or identifier.');
      const session = current = { callId, peer: peer.toLowerCase(), outgoing: true, requestedMedia: video ? 'video' : 'audio', localMedia: video ? 'video' : 'audio', videoNegotiated: false, localRestartIce: true, peerRestartIce: false, restartAttempts: 0, pendingRestartId: 0, lastRemoteRestartId: 0, restartInFlight: false, restartGraceTimer: null, restartReplyTimer: null, reconnectLimitTimer: null, everConnected: false, audioSender: null, audioTrack: null, audioInputId: '', audioOutputId: '', videoSender: null, cameraTrack: null, videoInputId: '', deviceTransition: false, screenTrack: null, screenStream: null, screenTransition: false, cameraEnabledBeforeShare: true, status: 'requesting-media', peerConnection: null, localStream: null, remoteStream: null, error: '' };
      update(session, 'requesting-media');
      try {
        session.localStream = await getLocalStream(video);
        if (current !== session) { for (const track of session.localStream.getTracks()) track.stop(); return false; }
        onLocalStream(session.localStream);
        const pc = makePeerConnection(session);
        addLocalTracks(session, pc);
        const offer = await pc.createOffer();
        await prepareLocalDescription(session, offer, 'call-offer', session.requestedMedia, { restartIce: true });
        if (current === session && session.status !== 'no-path') update(session, 'ringing');
        return current === session;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'Could not start this call.');
        return false;
      }
    }

    function receiveOffer({ peer, callId, media, sdp, restartIce: peerRestartIce = false }) {
      if (!validCallId(callId) || typeof peer !== 'string' || !/^[0-9a-f]{64}$/i.test(peer) ||
          !['audio', 'video'].includes(media) || !validDescription('offer', sdp, media) || typeof peerRestartIce !== 'boolean') return false;
      if (current && !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(current.status)) return false;
      if (current) dismiss();
      const session = current = { callId, peer: peer.toLowerCase(), outgoing: false, requestedMedia: media, localMedia: '', videoNegotiated: false, localRestartIce: true, peerRestartIce, restartAttempts: 0, pendingRestartId: 0, lastRemoteRestartId: 0, restartInFlight: false, restartGraceTimer: null, restartReplyTimer: null, reconnectLimitTimer: null, everConnected: false, audioSender: null, audioTrack: null, audioInputId: '', audioOutputId: '', videoSender: null, cameraTrack: null, videoInputId: '', deviceTransition: false, screenTrack: null, screenStream: null, screenTransition: false, cameraEnabledBeforeShare: true, remoteOffer: sdp, status: 'incoming', peerConnection: null, localStream: null, remoteStream: null, error: '' };
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
        addLocalTracks(session, pc);
        await pc.setRemoteDescription({ type: 'offer', sdp: session.remoteOffer });
        const answer = await pc.createAnswer();
        await prepareLocalDescription(session, answer, 'call-answer', session.localMedia, { restartIce: true });
        session.videoNegotiated = session.localMedia === 'video';
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

    async function receiveAnswer({ peer, callId, media, sdp, restartIce: peerRestartIce = false }) {
      const session = current;
      if (!session || !session.outgoing || session.callId !== callId || session.peer !== String(peer || '').toLowerCase() ||
          !['audio', 'video'].includes(media) || (session.requestedMedia === 'audio' && media !== 'audio') ||
          !validDescription('answer', sdp, media) || !session.peerConnection || typeof peerRestartIce !== 'boolean') return false;
      try {
        await session.peerConnection.setRemoteDescription({ type: 'answer', sdp });
        if (current === session) {
          session.videoNegotiated = media === 'video';
          session.peerRestartIce = peerRestartIce;
          update(session, 'connecting');
          if (session.everConnected && !restartCapability(session)) noPath(session);
        }
        return true;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'The other person’s answer could not be opened.');
        return false;
      }
    }

    async function receiveRestartOffer({ peer, callId, media, sdp, restartId }) {
      const session = current;
      if (!session || session.outgoing || session.callId !== callId || session.peer !== String(peer || '').toLowerCase() ||
          !session.everConnected || !restartCapability(session) || !Number.isSafeInteger(restartId) ||
          restartId <= session.lastRemoteRestartId || restartId > MAX_ICE_RESTARTS || media !== session.requestedMedia ||
          !validDescription('offer', sdp, media) || !session.peerConnection ||
          ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
      session.lastRemoteRestartId = restartId;
      session.restartInFlight = true;
      update(session, 'reconnecting');
      try {
        await session.peerConnection.setRemoteDescription({ type: 'offer', sdp });
        if (current !== session || session.lastRemoteRestartId !== restartId) return false;
        const answer = await session.peerConnection.createAnswer();
        await prepareLocalDescription(session, answer, 'call-restart-answer', media, { restartId });
        if (current !== session || session.lastRemoteRestartId !== restartId) return false;
        session.restartInFlight = false;
        return true;
      } catch (error) {
        if (current === session) {
          session.restartInFlight = false;
          session.error = error?.message || 'Could not answer the ICE restart.';
        }
        return false;
      }
    }

    async function receiveRestartAnswer({ peer, callId, media, sdp, restartId }) {
      const session = current;
      if (!session || !session.outgoing || session.callId !== callId || session.peer !== String(peer || '').toLowerCase() ||
          !session.everConnected || !restartCapability(session) || session.pendingRestartId !== restartId ||
          !Number.isSafeInteger(restartId) || restartId < 1 || restartId > MAX_ICE_RESTARTS || media !== session.requestedMedia ||
          !validDescription('answer', sdp, media) || !session.peerConnection) return false;
      try {
        await session.peerConnection.setRemoteDescription({ type: 'answer', sdp });
        if (current !== session || session.pendingRestartId !== restartId) return false;
        if (session.restartReplyTimer !== null) unschedule(session.restartReplyTimer);
        session.restartReplyTimer = null;
        session.pendingRestartId = 0;
        session.restartInFlight = false;
        update(session, 'reconnecting');
        return true;
      } catch (error) {
        if (current === session) {
          session.error = error?.message || 'The ICE restart answer could not be applied.';
          if (session.restartAttempts >= MAX_ICE_RESTARTS) noPath(session);
          else scheduleIceRestart(session, true);
        }
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
      if (current.screenTrack) return false;
      const tracks = current.localStream.getVideoTracks();
      if (!tracks.length) return false;
      for (const track of tracks) track.enabled = enabled;
      onState(snapshot());
      return true;
    }

    async function listDevices() {
      if (typeof mediaDevices?.enumerateDevices !== 'function') return [];
      const devices = await mediaDevices.enumerateDevices();
      return (Array.isArray(devices) ? devices : []).filter(device =>
        device && typeof device.deviceId === 'string' &&
        ['audioinput', 'videoinput', 'audiooutput'].includes(device.kind)
      ).slice(0, 96).map(device => Object.freeze({
        deviceId: device.deviceId,
        kind: device.kind,
        label: typeof device.label === 'string' ? device.label.slice(0, 120) : ''
      }));
    }

    async function replaceInputDevice(kind, deviceId) {
      const session = current;
      if (!session || typeof deviceId !== 'string' ||
          typeof mediaDevices?.getUserMedia !== 'function' || session.deviceTransition || session.screenTransition ||
          ['incoming', 'ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status) ||
          typeof session.localStream?.removeTrack !== 'function' || typeof session.localStream?.addTrack !== 'function') return false;
      if (kind === 'video' && (session.localMedia !== 'video' || session.screenTrack)) return false;
      const sender = kind === 'audio' ? session.audioSender : session.videoSender;
      const previousTrack = kind === 'audio' ? session.audioTrack : session.cameraTrack;
      if (!sender || typeof sender.replaceTrack !== 'function' || !previousTrack) return false;

      session.deviceTransition = true;
      update(session, session.status, '');
      let replacementStream = null;
      let replacementTrack = null;
      let senderChanged = false;
      let previousRemoved = false;
      let replacementAdded = false;
      const previousDeviceId = kind === 'audio' ? session.audioInputId : session.videoInputId;
      try {
        const constraint = deviceId ? { deviceId: { exact: deviceId } } : true;
        replacementStream = await mediaDevices.getUserMedia(kind === 'audio'
          ? { audio: constraint, video: false }
          : { audio: false, video: constraint });
        const tracks = kind === 'audio' ? replacementStream?.getAudioTracks?.() : replacementStream?.getVideoTracks?.();
        replacementTrack = tracks?.find(track => track?.readyState !== 'ended' && typeof track?.stop === 'function');
        if (!replacementTrack) throw new Error(`The browser did not provide a ${kind} track.`);
        if (current !== session || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;

        replacementTrack.enabled = previousTrack.enabled;
        await sender.replaceTrack(replacementTrack);
        senderChanged = true;
        if (current !== session || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
        session.localStream.removeTrack(previousTrack);
        previousRemoved = true;
        session.localStream.addTrack(replacementTrack);
        replacementAdded = true;
        if (kind === 'audio') {
          session.audioTrack = replacementTrack;
          session.audioInputId = replacementTrack.getSettings?.().deviceId || deviceId;
        } else {
          session.cameraTrack = replacementTrack;
          session.videoInputId = replacementTrack.getSettings?.().deviceId || deviceId;
        }
        onLocalStream(session.localStream);
        update(session, session.status, '');
        previousTrack.stop();
        replacementStream = null;
        return true;
      } catch (error) {
        if (current === session && session.localStream) {
          if (replacementAdded) session.localStream.removeTrack(replacementTrack);
          if (previousRemoved) session.localStream.addTrack(previousTrack);
          if (kind === 'audio') {
            session.audioTrack = previousTrack;
            session.audioInputId = previousDeviceId;
          } else {
            session.cameraTrack = previousTrack;
            session.videoInputId = previousDeviceId;
          }
          if (replacementAdded || previousRemoved) {
            try { onLocalStream(session.localStream); } catch { /* The previous capture remains the rollback source. */ }
          }
          if (senderChanged) {
            try { await sender.replaceTrack(previousTrack); } catch { /* Keep the prior track when the browser rejects a replacement. */ }
          }
        }
        if (current === session && !['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) {
          update(session, session.status, error?.message || `Could not switch the ${kind} device.`);
        }
        return false;
      } finally {
        if (replacementStream) {
          for (const track of replacementStream.getTracks?.() || []) {
            try { track.stop(); } catch { /* A replaced or rejected device track needs no further use. */ }
          }
        } else if (replacementTrack && current !== session) {
          try { replacementTrack.stop(); } catch { /* The call ended while switching devices. */ }
        }
        if (current === session) {
          session.deviceTransition = false;
          onState(snapshot(session));
        }
      }
    }

    async function setAudioOutputDevice(deviceId) {
      const session = current;
      if (!session || typeof deviceId !== 'string' || typeof remoteAudioElement?.setSinkId !== 'function' ||
          session.deviceTransition || ['incoming', 'ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) return false;
      session.deviceTransition = true;
      update(session, session.status, '');
      try {
        await remoteAudioElement.setSinkId(deviceId);
        if (current !== session) return false;
        session.audioOutputId = remoteAudioElement.sinkId || deviceId;
        update(session, session.status, '');
        return true;
      } catch (error) {
        if (current === session) update(session, session.status, error?.message || 'Could not switch the audio output.');
        return false;
      } finally {
        if (current === session) {
          session.deviceTransition = false;
          onState(snapshot(session));
        }
      }
    }

    function setAudioInputDevice(deviceId) { return replaceInputDevice('audio', deviceId); }
    function setVideoInputDevice(deviceId) { return replaceInputDevice('video', deviceId); }

    async function startScreenSharing() {
      const session = current;
      if (!session || session.status !== 'connected' || session.screenTransition || session.deviceTransition || session.screenTrack ||
          session.localMedia !== 'video' || !session.videoNegotiated ||
          typeof mediaDevices?.getDisplayMedia !== 'function' || typeof session.videoSender?.replaceTrack !== 'function') return false;

      session.screenTransition = true;
      update(session, session.status);
      let stream;
      try {
        stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream?.getVideoTracks?.().find(candidate => candidate?.readyState !== 'ended');
        if (!track || typeof track.stop !== 'function') throw new Error('The browser did not provide a screen video track.');
        if (current !== session || ['ended', 'failed', 'no-path', 'busy', 'declined'].includes(session.status)) {
          for (const item of stream.getTracks?.() || []) item.stop?.();
          return false;
        }
        session.screenStream = stream;
        session.screenTrack = track;
        session.cameraEnabledBeforeShare = session.cameraTrack?.enabled ?? false;
        if (session.cameraTrack) session.cameraTrack.enabled = false;
        await session.videoSender.replaceTrack(track);
        if (current !== session || session.screenTrack !== track) return false;
        track.onended = () => { void stopScreenSharing(); };
        onLocalStream(stream);
        update(session, session.status, '');
        if (track.readyState === 'ended') void stopScreenSharing();
        return true;
      } catch (error) {
        if (current === session) {
          if (session.cameraTrack) session.cameraTrack.enabled = session.cameraEnabledBeforeShare;
          session.screenTrack = null;
          session.screenStream = null;
          for (const track of stream?.getTracks?.() || []) {
            try { track.stop(); } catch { /* A stopped browser track needs no further action. */ }
          }
          onLocalStream(session.localStream);
          update(session, session.status, error?.message || 'Could not start screen sharing.');
        }
        return false;
      } finally {
        if (current === session) {
          session.screenTransition = false;
          onState(snapshot(session));
        }
      }
    }

    async function stopScreenSharing() {
      const session = current;
      const screenTrack = session?.screenTrack;
      if (!session || !screenTrack || session.screenTransition) return false;
      session.screenTransition = true;
      update(session, session.status);
      screenTrack.onended = null;
      try {
        await session.videoSender.replaceTrack(session.cameraTrack || null);
        if (current !== session || session.screenTrack !== screenTrack) return false;
        if (session.cameraTrack) session.cameraTrack.enabled = session.cameraEnabledBeforeShare;
        session.screenTrack = null;
        for (const track of session.screenStream?.getTracks?.() || []) {
          try { track.stop(); } catch { /* A stopped browser track needs no further action. */ }
        }
        session.screenStream = null;
        onLocalStream(session.localStream);
        update(session, session.status, '');
        return true;
      } catch (error) {
        if (current === session) {
          screenTrack.onended = () => { void stopScreenSharing(); };
          update(session, session.status, error?.message || 'Could not stop screen sharing.');
        }
        return false;
      } finally {
        if (current === session) {
          session.screenTransition = false;
          onState(snapshot(session));
        }
      }
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
      receiveRestartOffer,
      receiveRestartAnswer,
      setMicrophoneEnabled,
      setCameraEnabled,
      startScreenSharing,
      stopScreenSharing,
      listDevices,
      setAudioInputDevice,
      setVideoInputDevice,
      setAudioOutputDevice,
      dismiss,
      dispose,
      getState: () => snapshot()
    });
  }

  window.PropertyCalls = Object.freeze({ MAX_SDP_CHARS, ICE_GATHERING_WATCHDOG_MS, DEFAULT_ICE_SERVERS, validCallId, validDescription, create });
})();
