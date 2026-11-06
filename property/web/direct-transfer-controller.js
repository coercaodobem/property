'use strict';
(() => {
  const MAX_SDP_CHARS = 16384;
  const MAX_FRAME_BYTES = 65536;
  const MAX_GIFT_WRAP_BYTES = 60000;
  const ICE_GATHERING_WATCHDOG_MS = 12000;
  const FRAME_ACK_WATCHDOG_MS = 30000;
  const CHANNEL_LABEL = 'property-private-files-v1';
  const DEFAULT_ICE_SERVERS = Object.freeze([
    Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
    Object.freeze({ urls: 'stun:stun1.l.google.com:19302' })
  ]);
  const TRANSFER_ID_RE = /^[0-9a-f]{32}$/i;
  const PUBKEY_RE = /^[0-9a-f]{64}$/i;

  function validDescription(type, sdp) {
    return (type === 'offer' || type === 'answer') && typeof sdp === 'string' && sdp.length > 0 &&
      sdp.length <= MAX_SDP_CHARS && sdp.startsWith('v=0\r\n') &&
      /(?:^|\r?\n)m=application\s/.test(sdp) && /webrtc-datachannel|a=sctp-port:/i.test(sdp);
  }

  function create(options = {}) {
    const PeerConnection = options.RTCPeerConnection || globalThis.RTCPeerConnection;
    const createPeerConnection = options.createPeerConnection || (configuration => new PeerConnection(configuration));
    const cryptoImpl = options.crypto || globalThis.crypto;
    const sendSignal = typeof options.onSignal === 'function' ? options.onSignal : async () => {};
    const onState = typeof options.onState === 'function' ? options.onState : () => {};
    const receiveEnvelope = typeof options.onEnvelope === 'function' ? options.onEnvelope : async () => false;
    const iceServers = Array.isArray(options.iceServers) ? options.iceServers : DEFAULT_ICE_SERVERS;
    let current = null;

    function manifestSummary(files) {
      return { files: files.length, totalChunks: files.reduce((sum, file) => sum + file.totalChunks, 0),
        totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0) };
    }

    function snapshot(session = current) {
      if (!session) return null;
      return Object.freeze({ transferId: session.transferId, peer: session.peer, direction: session.direction,
        status: session.status, error: session.error || '', ...manifestSummary(session.files),
        sentChunks: session.sentChunks, receivedChunks: session.receivedChunks });
    }

    function update(session, status, error = '') {
      if (current !== session) return;
      session.status = status;
      session.error = error;
      onState(snapshot(session));
    }

    function release(session) {
      if (session.ackTimer) clearTimeout(session.ackTimer);
      session.ackTimer = 0;
      if (session.pendingAck) {
        session.pendingAck.resolve(false);
        session.pendingAck = null;
      }
      if (session.pendingComplete) {
        session.pendingComplete.resolve(false);
        session.pendingComplete = null;
      }
      const channel = session.channel;
      if (channel) {
        channel.onopen = null;
        channel.onclose = null;
        channel.onerror = null;
        channel.onmessage = null;
        try { channel.close(); } catch { /* The channel may already be closed by the browser. */ }
        session.channel = null;
      }
      const pc = session.peerConnection;
      if (pc) {
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.ondatachannel = null;
        try { pc.close(); } catch { /* The browser may have already released the peer connection. */ }
        session.peerConnection = null;
      }
    }

    function terminal(session, status, error = '') {
      if (current !== session) return false;
      if (session.status !== status) update(session, status, error);
      release(session);
      return true;
    }

    function validateStart({ peer, transferId, files }) {
      const normalized = options.normalizeFileManifests?.(files) || null;
      if (!normalized || !TRANSFER_ID_RE.test(transferId || '') || !PUBKEY_RE.test(peer || '')) return null;
      return { peer: peer.toLowerCase(), transferId: transferId.toLowerCase(), files: normalized };
    }

    function createSession(details, direction, status) {
      return current = { ...details, direction, status, error: '', peerConnection: null, channel: null,
        sentChunks: 0, receivedChunks: 0, expectedChunks: manifestSummary(details.files).totalChunks,
        pendingAck: null, pendingComplete: null, ackTimer: 0, answerReceived: false };
    }

    function waitForIceGathering(session) {
      const pc = session.peerConnection;
      if (pc.iceGatheringState === 'complete') return Promise.resolve(true);
      return new Promise(resolve => {
        let finished = false;
        const finish = complete => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          pc.removeEventListener?.('icegatheringstatechange', check);
          if (pc.onicegatheringstatechange === check) pc.onicegatheringstatechange = null;
          resolve(complete);
        };
        const check = () => { if (pc.iceGatheringState === 'complete' || current !== session) finish(pc.iceGatheringState === 'complete'); };
        const timer = setTimeout(() => finish(false), ICE_GATHERING_WATCHDOG_MS);
        if (typeof pc.addEventListener === 'function') pc.addEventListener('icegatheringstatechange', check);
        else pc.onicegatheringstatechange = check;
        check();
      });
    }

    function makePeerConnection(session) {
      if (typeof createPeerConnection !== 'function' || (!options.createPeerConnection && typeof PeerConnection !== 'function')) {
        throw new Error('This browser does not support direct file transfer.');
      }
      const pc = createPeerConnection({ iceServers });
      session.peerConnection = pc;
      pc.ondatachannel = event => attachChannel(session, event.channel);
      const changed = () => {
        if (current !== session) return;
        const connection = pc.connectionState || pc.iceConnectionState;
        if (connection === 'failed') terminal(session, 'failed', 'No direct data path was found.');
        else if (connection === 'disconnected' && session.status !== 'completed') update(session, 'reconnecting');
      };
      pc.onconnectionstatechange = changed;
      pc.oniceconnectionstatechange = changed;
      return pc;
    }

    function sendFrame(session, frame) {
      if (current !== session || !session.channel || session.channel.readyState !== 'open') return false;
      const data = JSON.stringify(frame);
      const size = new TextEncoder().encode(data).byteLength;
      if (size > MAX_FRAME_BYTES) return false;
      try { session.channel.send(data); return true; } catch { return false; }
    }

    function failPending(session, error) {
      if (session.pendingAck) { session.pendingAck.resolve(false); session.pendingAck = null; }
      if (session.pendingComplete) { session.pendingComplete.resolve(false); session.pendingComplete = null; }
      terminal(session, 'failed', error);
    }

    async function handleFrame(session, raw) {
      if (current !== session || typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_FRAME_BYTES) return;
      let frame;
      try { frame = JSON.parse(raw); } catch { failPending(session, 'The other device sent an invalid transfer frame.'); return; }
      if (!frame || frame.v !== 1 || frame.transferId !== session.transferId || typeof frame.action !== 'string') {
        failPending(session, 'The other device sent a transfer frame for a different session.');
        return;
      }
      if (session.direction === 'outgoing') {
        if (frame.action === 'ack' && Number.isSafeInteger(frame.sequence) && typeof frame.accepted === 'boolean' &&
            session.pendingAck?.sequence === frame.sequence) {
          const pending = session.pendingAck;
          session.pendingAck = null;
          clearTimeout(session.ackTimer);
          session.ackTimer = 0;
          pending.resolve(frame.accepted);
          if (!frame.accepted) terminal(session, 'failed', 'The recipient rejected a direct file part.');
          return;
        }
        if (frame.action === 'complete' && Number.isSafeInteger(frame.receivedChunks) &&
            frame.receivedChunks === session.expectedChunks && session.pendingComplete) {
          const pending = session.pendingComplete;
          session.pendingComplete = null;
          clearTimeout(session.ackTimer);
          session.ackTimer = 0;
          update(session, 'completed');
          pending.resolve(true);
          return;
        }
        failPending(session, 'The other device returned an unexpected transfer response.');
        return;
      }
      if (frame.action === 'chunk' && Number.isSafeInteger(frame.sequence) && frame.sequence === session.receivedChunks + 1 &&
          frame.sequence <= session.expectedChunks && frame.event && frame.event.kind === 1059) {
        let accepted = false;
        try { accepted = (await receiveEnvelope({ peer: session.peer, transferId: session.transferId,
          sequence: frame.sequence, event: frame.event, files: session.files })) === true; }
        catch { accepted = false; }
        if (current !== session) return;
        if (!sendFrame(session, { v: 1, action: 'ack', transferId: session.transferId, sequence: frame.sequence, accepted })) {
          failPending(session, 'Could not acknowledge the received file part.');
          return;
        }
        if (!accepted) { failPending(session, 'A file part failed validation and was not saved.'); return; }
        session.receivedChunks += 1;
        update(session, 'receiving');
        return;
      }
      if (frame.action === 'finish' && Number.isSafeInteger(frame.totalChunks) &&
          frame.totalChunks === session.expectedChunks && session.receivedChunks === session.expectedChunks) {
        if (!sendFrame(session, { v: 1, action: 'complete', transferId: session.transferId, receivedChunks: session.receivedChunks })) {
          failPending(session, 'Could not confirm the completed direct transfer.');
          return;
        }
        update(session, 'completed');
        return;
      }
      failPending(session, 'The other device sent an unexpected transfer frame.');
    }

    function attachChannel(session, channel) {
      if (current !== session || !channel || channel.label !== CHANNEL_LABEL || channel.ordered === false) {
        try { channel?.close?.(); } catch { /* Ignore an untrusted or duplicate channel. */ }
        return false;
      }
      if (session.channel && session.channel !== channel) {
        try { channel.close(); } catch { /* Keep the first accepted channel. */ }
        return false;
      }
      session.channel = channel;
      channel.binaryType = 'arraybuffer';
      channel.onopen = () => { if (current === session) update(session, session.direction === 'incoming' ? 'receiving' : 'connected'); };
      channel.onmessage = event => { void handleFrame(session, event.data); };
      channel.onerror = () => { if (current === session) failPending(session, 'The direct file channel failed.'); };
      channel.onclose = () => {
        if (current === session && !['completed', 'cancelled', 'declined', 'failed'].includes(session.status)) {
          failPending(session, 'The direct file channel closed before completion.');
        }
      };
      if (channel.readyState === 'open') channel.onopen();
      return true;
    }

    async function prepareLocalDescription(session, description, action) {
      await session.peerConnection.setLocalDescription(description);
      if (!(await waitForIceGathering(session))) throw new Error('The browser could not finish preparing a direct network path.');
      if (current !== session) return false;
      const sdp = session.peerConnection.localDescription?.sdp;
      if (!validDescription(action === 'file-offer' ? 'offer' : 'answer', sdp)) throw new Error('The browser produced an invalid direct-transfer description.');
      await sendSignal({ action, peer: session.peer, transferId: session.transferId, files: action === 'file-offer' ? session.files : undefined, sdp });
      return current === session;
    }

    async function startOutgoing({ peer, transferId, files }) {
      if (current && !['completed', 'cancelled', 'declined', 'failed'].includes(current.status)) throw new Error('A direct transfer is already active.');
      if (current) dismiss();
      const details = validateStart({ peer, transferId, files });
      if (!details) throw new TypeError('Invalid direct file transfer recipient, identifier, or manifest.');
      const session = createSession(details, 'outgoing', 'preparing');
      try {
        const pc = makePeerConnection(session);
        session.channel = null;
        const channel = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
        attachChannel(session, channel);
        const offer = await pc.createOffer();
        if (current !== session) return false;
        await prepareLocalDescription(session, offer, 'file-offer');
        if (current === session) update(session, 'offered');
        return current === session;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'Could not start the direct file transfer.');
        return false;
      }
    }

    function receiveOffer({ peer, transferId, files, sdp }) {
      if (current && !['completed', 'cancelled', 'declined', 'failed'].includes(current.status)) return false;
      if (current) dismiss();
      const details = validateStart({ peer, transferId, files });
      if (!details || !validDescription('offer', sdp)) return false;
      createSession({ ...details, remoteOffer: sdp }, 'incoming', 'incoming');
      update(current, 'incoming');
      return true;
    }

    async function acceptIncoming() {
      const session = current;
      if (!session || session.direction !== 'incoming' || session.status !== 'incoming') return false;
      try {
        update(session, 'preparing');
        const pc = makePeerConnection(session);
        await pc.setRemoteDescription({ type: 'offer', sdp: session.remoteOffer });
        const answer = await pc.createAnswer();
        if (current !== session) return false;
        await prepareLocalDescription(session, answer, 'file-answer');
        if (current === session) update(session, 'connecting');
        return current === session;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'Could not accept the direct file transfer.');
        return false;
      }
    }

    async function receiveAnswer({ peer, transferId, sdp }) {
      const session = current;
      if (!session || session.direction !== 'outgoing' || session.transferId !== String(transferId || '').toLowerCase() ||
          session.peer !== String(peer || '').toLowerCase() || !['offered', 'connected', 'connecting'].includes(session.status) || session.answerReceived ||
          !validDescription('answer', sdp)) return false;
      try {
        await session.peerConnection.setRemoteDescription({ type: 'answer', sdp });
        if (current === session) { session.answerReceived = true; if (session.status !== 'connected') update(session, 'connecting'); }
        return current === session;
      } catch (error) {
        terminal(session, 'failed', error?.message || 'The other device’s answer could not be opened.');
        return false;
      }
    }

    function receiveEnd({ peer, transferId, action }) {
      const session = current;
      if (!session || session.transferId !== String(transferId || '').toLowerCase() ||
          session.peer !== String(peer || '').toLowerCase() ||
          !['file-reject', 'file-cancel'].includes(action)) return false;
      return terminal(session, action === 'file-reject' ? 'declined' : 'cancelled');
    }

    function sendEnvelope(event) {
      const session = current;
      if (!session || session.direction !== 'outgoing' || session.status === 'completed' ||
          !session.channel || session.channel.readyState !== 'open' || event?.kind !== 1059 ||
          session.pendingAck || session.sentChunks >= session.expectedChunks) return Promise.resolve(false);
      let encodedEvent;
      try { encodedEvent = JSON.stringify(event); } catch { return Promise.resolve(false); }
      if (new TextEncoder().encode(encodedEvent).byteLength > MAX_GIFT_WRAP_BYTES) return Promise.resolve(false);
      const sequence = session.sentChunks + 1;
      return new Promise(resolve => {
        session.pendingAck = { sequence, resolve };
        session.ackTimer = setTimeout(() => {
          session.ackTimer = 0;
          if (session.pendingAck?.sequence !== sequence) return;
          session.pendingAck = null;
          resolve(false);
          terminal(session, 'failed', 'No acknowledgement arrived for a direct file part.');
        }, FRAME_ACK_WATCHDOG_MS);
        if (!sendFrame(session, { v: 1, action: 'chunk', transferId: session.transferId, sequence, event })) {
          clearTimeout(session.ackTimer);
          session.ackTimer = 0;
          session.pendingAck = null;
          resolve(false);
          terminal(session, 'failed', 'The direct channel could not send this file part.');
        }
      }).then(accepted => {
        if (accepted && current === session) { session.sentChunks += 1; update(session, 'sending'); }
        return accepted;
      });
    }

    function finish() {
      const session = current;
      if (!session || session.direction !== 'outgoing' || session.status === 'completed' ||
          session.sentChunks !== session.expectedChunks || session.pendingComplete ||
          !session.channel || session.channel.readyState !== 'open') return Promise.resolve(false);
      return new Promise(resolve => {
        session.pendingComplete = { resolve };
        session.ackTimer = setTimeout(() => {
          session.ackTimer = 0;
          if (!session.pendingComplete) return;
          session.pendingComplete = null;
          resolve(false);
          terminal(session, 'failed', 'The other device did not confirm the completed transfer.');
        }, FRAME_ACK_WATCHDOG_MS);
        if (!sendFrame(session, { v: 1, action: 'finish', transferId: session.transferId, totalChunks: session.expectedChunks })) {
          clearTimeout(session.ackTimer);
          session.ackTimer = 0;
          session.pendingComplete = null;
          resolve(false);
          terminal(session, 'failed', 'Could not send the transfer completion signal.');
        }
      });
    }

    async function end(action = 'file-cancel') {
      const session = current;
      if (!session || ['completed', 'cancelled', 'declined', 'failed'].includes(session.status)) return false;
      if (!['file-reject', 'file-cancel'].includes(action)) throw new TypeError('Invalid direct file transfer ending action.');
      try { await sendSignal({ action, peer: session.peer, transferId: session.transferId }); }
      finally { terminal(session, action === 'file-reject' ? 'declined' : 'cancelled'); }
      return true;
    }

    function dismiss() {
      if (!current || !['completed', 'cancelled', 'declined', 'failed'].includes(current.status)) return false;
      const previous = current;
      current = null;
      release(previous);
      onState(null);
      return true;
    }

    function dispose() {
      if (!current) return false;
      const previous = current;
      current = null;
      release(previous);
      onState(null);
      return true;
    }

    return Object.freeze({ startOutgoing, receiveOffer, acceptIncoming, receiveAnswer, receiveEnd,
      sendEnvelope, finish, end, dismiss, dispose, getState: () => snapshot() });
  }

  globalThis.PropertyDirectTransfer = Object.freeze({ MAX_SDP_CHARS, MAX_FRAME_BYTES, MAX_GIFT_WRAP_BYTES,
    ICE_GATHERING_WATCHDOG_MS, FRAME_ACK_WATCHDOG_MS, CHANNEL_LABEL, DEFAULT_ICE_SERVERS, validDescription, create });
})();
