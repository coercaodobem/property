import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, console, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/direct-file-chunks.js', '../web/typing-signals.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const result = vm.runInContext(`(() => {
  const nostr = NostrTools;
  const a = nostr.generateSecretKey();
  const b = nostr.generateSecretKey();
  const c = nostr.generateSecretKey();
  const aPub = nostr.getPublicKey(a);
  const bPub = nostr.getPublicKey(b);
  const cPub = nostr.getPublicKey(c);
  const start = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'typing', 101);
  const recording = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'recording', 102);
  const stop = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'stop', 103);
  const thinking = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'thinking', 104);
  const messageId = 'ab'.repeat(32);
  const groupReceipt = PropertyTypingSignals.createReadReceipt(nostr, a, [aPub, bPub, cPub], bPub, messageId, 105, true);
  const activePresence = PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub], true, 107);
  const inactivePresence = PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub], false, 108);
  const callId = 'cd'.repeat(16);
  const videoSdp = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'm=video 9 UDP/TLS/RTP/SAVPF 96'].join('\\r\\n') + '\\r\\n';
  const callOffer = PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, callId, 'call-offer', 111, { media: 'video', sdp: videoSdp });
  const callAnswer = PropertyTypingSignals.createCallSignal(nostr, b, [aPub, bPub], aPub, callId, 'call-answer', 112, { media: 'audio', sdp: ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111'].join('\\r\\n') + '\\r\\n' });
  const callEnd = PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, callId, 'call-hangup', 113);
  const restartOffer = PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, callId, 'call-restart-offer', 114, { media: 'video', sdp: videoSdp, restartId: 1 });
  const restartAnswer = PropertyTypingSignals.createCallSignal(nostr, b, [aPub, bPub], aPub, callId, 'call-restart-answer', 115, { media: 'video', sdp: videoSdp, restartId: 1 });
  const capableCallOffer = PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, callId, 'call-offer', 116, { media: 'video', sdp: videoSdp, restartIce: true });
  const transferId = 'ef'.repeat(16);
  const fileManifest = [{ transferId: '12'.repeat(16), name: 'sample.txt', mime: 'text/plain', sizeBytes: 3,
    chunkBytes: PropertyDirectFileChunks.CHUNK_BYTES, totalChunks: 1, sha256: '34'.repeat(32) }];
  const dataSdp = ['v=0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=sctp-port:5000'].join('\\r\\n') + '\\r\\n';
  const fileOffer = PropertyTypingSignals.createFileSignal(nostr, a, [aPub, bPub], bPub, transferId, 'file-offer', 117,
    { files: fileManifest, caption: 'transfer context', sdp: dataSdp });
  const fileAnswer = PropertyTypingSignals.createFileSignal(nostr, b, [aPub, bPub], aPub, transferId, 'file-answer', 118, { sdp: dataSdp });
  const fileReject = PropertyTypingSignals.createFileSignal(nostr, b, [aPub, bPub], aPub, transferId, 'file-reject', 119);
  const startEvent = start[0].event;
  const recordingEvent = recording[0].event;
  const stopEvent = stop[0].event;
  const openedStart = PropertyTypingSignals.unwrap(nostr, startEvent, b);
  const openedRecording = PropertyTypingSignals.unwrap(nostr, recordingEvent, b);
  const openedStop = PropertyTypingSignals.unwrap(nostr, stopEvent, b);
  const openedThinking = PropertyTypingSignals.unwrap(nostr, thinking[0].event, b);
  const staleThinking = PropertyTypingSignals.unwrap(nostr, thinking[0].event, b, Math.floor(Date.now() / 1000) + 63);
  const staleRecording = PropertyTypingSignals.unwrap(nostr, recordingEvent, b, Math.floor(Date.now() / 1000) + PropertyTypingSignals.MAX_SIGNAL_AGE_SECONDS + 3);
  const group = PropertyTypingSignals.create(nostr, a, [aPub, bPub, cPub], 'typing', 105);
  const groupRecording = PropertyTypingSignals.create(nostr, a, [aPub, bPub, cPub], 'recording', 106);
  const openedGroup = group.map(item => PropertyTypingSignals.unwrap(nostr, item.event,
    item.recipient === bPub ? b : c));
  const openedGroupRecording = groupRecording.map(item => PropertyTypingSignals.unwrap(nostr, item.event,
    item.recipient === bPub ? b : c));
  const openedReceipt = PropertyTypingSignals.unwrap(nostr, groupReceipt[0].event, b);
  const openedPresence = PropertyTypingSignals.unwrap(nostr, activePresence[0].event, b);
  const openedInactivePresence = PropertyTypingSignals.unwrap(nostr, inactivePresence[0].event, b);
  const openedCallOffer = PropertyTypingSignals.unwrap(nostr, callOffer[0].event, b);
  const openedCallAnswer = PropertyTypingSignals.unwrap(nostr, callAnswer[0].event, a);
  const openedCallEnd = PropertyTypingSignals.unwrap(nostr, callEnd[0].event, b);
  const openedRestartOffer = PropertyTypingSignals.unwrap(nostr, restartOffer[0].event, b);
  const openedRestartAnswer = PropertyTypingSignals.unwrap(nostr, restartAnswer[0].event, a);
  const openedCapableCallOffer = PropertyTypingSignals.unwrap(nostr, capableCallOffer[0].event, b);
  const openedFileOffer = PropertyTypingSignals.unwrap(nostr, fileOffer[0].event, b);
  const openedFileAnswer = PropertyTypingSignals.unwrap(nostr, fileAnswer[0].event, a);
  const openedFileReject = PropertyTypingSignals.unwrap(nostr, fileReject[0].event, a);
  const wrongFileRecipient = PropertyTypingSignals.unwrap(nostr, fileOffer[0].event, c);
  const staleFileOffer = PropertyTypingSignals.unwrap(nostr, fileOffer[0].event, b, Math.floor(Date.now() / 1000) + PropertyTypingSignals.MAX_FILE_SIGNAL_AGE_SECONDS + 3);
  const wrongCallRecipient = PropertyTypingSignals.unwrap(nostr, callOffer[0].event, c);
  const staleCallSignal = PropertyTypingSignals.unwrap(nostr, callOffer[0].event, b,
    Math.floor(Date.now() / 1000) + PropertyTypingSignals.MAX_CALL_SIGNAL_AGE_SECONDS + 3);
  const wrongPresenceRecipient = PropertyTypingSignals.unwrap(nostr, activePresence[0].event, c);
  const stalePresence = PropertyTypingSignals.unwrap(nostr, activePresence[0].event, b,
    Math.floor(Date.now() / 1000) + PropertyTypingSignals.MAX_PRESENCE_AGE_SECONDS + 3);
  const wrongReceiptRecipient = PropertyTypingSignals.unwrap(nostr, groupReceipt[0].event, c);
  const staleReceipt = PropertyTypingSignals.unwrap(nostr, groupReceipt[0].event, b,
    Math.floor(Date.now() / 1000) + PropertyTypingSignals.MAX_READ_AGE_SECONDS + 3);
  const wrongRecipient = PropertyTypingSignals.unwrap(nostr, startEvent, c);
  const tampered = JSON.parse(JSON.stringify(startEvent));
  tampered.content = tampered.content.slice(0, -1) + (tampered.content.endsWith('A') ? 'B' : 'A');
  const tamperedResult = PropertyTypingSignals.unwrap(nostr, tampered, b);
  const tooOld = PropertyTypingSignals.unwrap(nostr, startEvent, b, Math.floor(Date.now() / 1000) + 11);
  let invalidActionRejected = false;
  try { PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'read', 105); } catch { invalidActionRejected = true; }
  let invalidReceiptMessageRejected = false;
  try { PropertyTypingSignals.createReadReceipt(nostr, a, [aPub, bPub], bPub, 'not-an-event-id', 106); } catch { invalidReceiptMessageRejected = true; }
  let groupPresenceRejected = false;
  try { PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub, cPub], true, 109); } catch { groupPresenceRejected = true; }
  let invalidPresenceRejected = false;
  try { PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub], 'online', 110); } catch { invalidPresenceRejected = true; }
  let groupCallRejected = false;
  try { PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub, cPub], bPub, callId, 'call-offer', 114, { media: 'video', sdp: videoSdp }); } catch { groupCallRejected = true; }
  let invalidCallSdpRejected = false;
  try { PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, callId, 'call-offer', 115, { media: 'video', sdp: 'v=0\\r\\n' }); } catch { invalidCallSdpRejected = true; }
  let invalidCallIdRejected = false;
  try { PropertyTypingSignals.createCallSignal(nostr, a, [aPub, bPub], bPub, 'not-a-call-id', 'call-hangup', 116); } catch { invalidCallIdRejected = true; }
  let oversizedFileManifestRejected = false;
  const tooLargeDirectFile = { ...fileManifest[0], sizeBytes: PropertyDirectFileChunks.MAX_FILE_BYTES + 1,
    totalChunks: PropertyDirectFileChunks.expectedChunkCount(PropertyDirectFileChunks.MAX_FILE_BYTES + 1) };
  try { PropertyTypingSignals.createFileSignal(nostr, a, [aPub, bPub], bPub, transferId, 'file-offer', 120, { files: [tooLargeDirectFile], sdp: dataSdp }); } catch { oversizedFileManifestRejected = true; }
  let groupFileTransferRejected = false;
  try { PropertyTypingSignals.createFileSignal(nostr, a, [aPub, bPub, cPub], bPub, transferId, 'file-offer', 121, { files: fileManifest, sdp: dataSdp }); } catch { groupFileTransferRejected = true; }
  return {
    wrapperKind: startEvent.kind,
    signatureValid: nostr.verifyEvent(startEvent) && nostr.verifyEvent(stopEvent),
    recipientTagOnly: JSON.stringify(startEvent.tags) === JSON.stringify([['p', bPub]]),
    contentHasNoPlainStatus: !startEvent.content.includes('"action":"typing"'),
    startAction: openedStart?.action,
    recordingAction: openedRecording?.action,
    recordingPayloadEncrypted: !recordingEvent.content.includes('"action":"recording"'),
    recordingMaxAge: openedRecording?.maxAgeSeconds,
    maxSignalAge: PropertyTypingSignals.MAX_SIGNAL_AGE_SECONDS,
    staleRecordingRejected: staleRecording === null,
    stopAction: openedStop?.action,
    thinkingAction: openedThinking?.action,
    thinkingExpiresAfter60Seconds: staleThinking === null,
    thinkingStatusIsEncrypted: !thinking[0].event.content.includes('"action":"thinking"'),
    sequenceIncreases: openedStart?.sequence < openedStop?.sequence,
    senderMatches: openedStart?.sender === aPub,
    groupWrapCount: group.length,
    groupParticipants: openedGroup.every(item => item?.participants.length === 3),
    groupRecordingWrapCount: groupRecording.length,
    groupRecordingActions: openedGroupRecording.every(item => item?.action === 'recording'),
    uniformRecordingSummary: PropertyTypingSignals.summarizeActivity(['recording', 'recording']),
    mixedActivitySummary: PropertyTypingSignals.summarizeActivity(['recording', 'typing']),
    invalidActivitySummary: PropertyTypingSignals.summarizeActivity(['read']),
    emptyActivitySummary: PropertyTypingSignals.summarizeActivity([]),
    groupReceiptWrapCount: groupReceipt.length,
    receiptRecipientOnly: groupReceipt[0].recipient === bPub && JSON.stringify(groupReceipt[0].event.tags) === JSON.stringify([['p', bPub]]),
    receiptPayloadEncrypted: !groupReceipt[0].event.content.includes(messageId),
    receiptMessageId: openedReceipt?.messageId,
    presenceWrapperKind: activePresence[0].event.kind,
    presenceRecipientOnly: activePresence[0].recipient === bPub && JSON.stringify(activePresence[0].event.tags) === JSON.stringify([['p', bPub]]),
    presenceEncrypted: !activePresence[0].event.content.includes('"active":true'),
    presenceActive: openedPresence?.active,
    presenceInactive: openedInactivePresence?.active,
    presenceMaxAge: openedPresence?.maxAgeSeconds,
    wrongPresenceRecipientRejected: wrongPresenceRecipient === null,
    stalePresenceRejected: stalePresence === null,
    groupPresenceRejected,
    invalidPresenceRejected,
    callWrapperKind: callOffer[0].event.kind,
    callRecipientOnly: callOffer[0].recipient === bPub && JSON.stringify(callOffer[0].event.tags) === JSON.stringify([['p', bPub]]),
    callPayloadEncrypted: !callOffer[0].event.content.includes('m=video'),
    callOfferAction: openedCallOffer?.action,
    callOfferId: openedCallOffer?.callId,
    callOfferMedia: openedCallOffer?.media,
    callOfferSdp: openedCallOffer?.sdp,
    callOfferRestartCapability: openedCallOffer?.restartIce,
    callCapableOfferRestartCapability: openedCapableCallOffer?.restartIce,
    callAnswerAction: openedCallAnswer?.action,
    callAnswerMedia: openedCallAnswer?.media,
    callAnswerRestartCapability: openedCallAnswer?.restartIce,
    callEndAction: openedCallEnd?.action,
    callRestartOfferAction: openedRestartOffer?.action,
    callRestartOfferId: openedRestartOffer?.restartId,
    callRestartAnswerAction: openedRestartAnswer?.action,
    callRestartAnswerId: openedRestartAnswer?.restartId,
    callWrongRecipientRejected: wrongCallRecipient === null,
    callStaleSignalRejected: staleCallSignal === null,
    groupCallRejected,
    invalidCallSdpRejected,
    invalidCallIdRejected,
    fileOfferAction: openedFileOffer?.action,
    fileOfferManifest: openedFileOffer?.files?.[0],
    fileOfferCaption: openedFileOffer?.caption,
    fileOfferSdp: openedFileOffer?.sdp,
    fileAnswerAction: openedFileAnswer?.action,
    fileRejectAction: openedFileReject?.action,
    fileRecipientOnly: fileOffer[0].recipient === bPub && JSON.stringify(fileOffer[0].event.tags) === JSON.stringify([['p', bPub]]),
    filePayloadEncrypted: !fileOffer[0].event.content.includes('sample.txt') && !fileOffer[0].event.content.includes('m=application'),
    wrongFileRecipientRejected: wrongFileRecipient === null,
    staleFileOfferRejected: staleFileOffer === null,
    oversizedFileManifestRejected,
    groupFileTransferRejected,
    receiptGroupFlag: openedReceipt?.group,
    receiptParticipants: openedReceipt?.participants.length,
    wrongReceiptRecipientRejected: wrongReceiptRecipient === null,
    staleReceiptRejected: staleReceipt === null,
    invalidReceiptMessageRejected,
    wrongRecipientRejected: wrongRecipient === null,
    tamperingRejected: tamperedResult === null,
    staleSignalRejected: tooOld === null,
    invalidActionRejected
  };
})()`, context, { timeout: 15000 });

assert.equal(result.wrapperKind, 21059, 'typing uses the ephemeral NIP-59 gift-wrap kind');
assert.equal(result.signatureValid, true, 'both wrappers have valid signatures');
assert.equal(result.recipientTagOnly, true, 'the outer wrapper routes only to its intended recipient');
assert.equal(result.contentHasNoPlainStatus, true, 'the outer event does not reveal the typing status');
assert.equal(result.startAction, 'typing');
assert.equal(result.recordingAction, 'recording');
assert.equal(result.recordingPayloadEncrypted, true, 'the outer event does not expose the recording state');
assert.equal(result.recordingMaxAge, result.maxSignalAge, 'recording presence expires after the same short activity window');
assert.equal(result.staleRecordingRejected, true, 'old recording states are rejected without sleeping');
assert.equal(result.stopAction, 'stop');
assert.equal(result.thinkingAction, 'thinking');
assert.equal(result.thinkingExpiresAfter60Seconds, true, 'a lost agent stop cannot leave the status visible indefinitely');
assert.equal(result.thinkingStatusIsEncrypted, true, 'the wrapper does not expose the activity state');
assert.equal(result.sequenceIncreases, true, 'the receiver can reject reordered older signals');
assert.equal(result.senderMatches, true);
assert.equal(result.groupWrapCount, 2, 'a three-person room gets one wrapper per other participant');
assert.equal(result.groupParticipants, true, 'each group recipient decrypts the same participant set');
assert.equal(result.groupRecordingWrapCount, 2, 'group recording status is wrapped separately to each other participant');
assert.equal(result.groupRecordingActions, true);
assert.equal(result.uniformRecordingSummary, 'recording');
assert.equal(result.mixedActivitySummary, 'typing', 'mixed activity summaries avoid claiming that everyone is doing the same thing');
assert.equal(result.invalidActivitySummary, null);
assert.equal(result.emptyActivitySummary, null);
assert.equal(result.groupReceiptWrapCount, 1, 'a group receipt is wrapped only for the author of the viewed message');
assert.equal(result.receiptRecipientOnly, true, 'the outer wrapper routes the receipt only to that author');
assert.equal(result.receiptPayloadEncrypted, true, 'the outer event does not reveal which message was viewed');
assert.equal(result.receiptMessageId, 'ab'.repeat(32));
assert.equal(result.receiptGroupFlag, true);
assert.equal(result.receiptParticipants, 3, 'the encrypted receipt retains the conversation membership for validation');
assert.equal(result.wrongReceiptRecipientRejected, true);
assert.equal(result.staleReceiptRejected, true);
assert.equal(result.invalidReceiptMessageRejected, true);
assert.equal(result.presenceWrapperKind, 21059, 'active status uses an ephemeral NIP-59 gift wrap');
assert.equal(result.presenceRecipientOnly, true, 'active status is routed only to the other direct-chat participant');
assert.equal(result.presenceEncrypted, true, 'the outer event does not reveal the active state');
assert.equal(result.presenceActive, true);
assert.equal(result.presenceInactive, false, 'the sender can clear active status explicitly');
assert.equal(result.presenceMaxAge, 75, 'active status is bounded to 75 logical seconds');
assert.equal(result.wrongPresenceRecipientRejected, true);
assert.equal(result.stalePresenceRejected, true, 'stale active status is rejected without sleeping');
assert.equal(result.groupPresenceRejected, true, 'active status cannot be sent to a group');
assert.equal(result.invalidPresenceRejected, true);
assert.equal(result.callWrapperKind, 21059, 'call setup uses the Property ephemeral gift-wrap transport');
assert.equal(result.callRecipientOnly, true, 'call signaling is routed only to the other direct participant');
assert.equal(result.callPayloadEncrypted, true, 'SDP and media details are encrypted from the relay');
assert.equal(result.callOfferAction, 'call-offer');
assert.equal(result.callOfferId, 'cd'.repeat(16));
assert.equal(result.callOfferMedia, 'video');
assert.match(result.callOfferSdp, /m=video/);
assert.equal(result.callOfferRestartCapability, false, 'older offer fixtures do not claim ICE restart support');
assert.equal(result.callCapableOfferRestartCapability, true, 'the restart capability is carried inside the encrypted setup signal');
assert.equal(result.callAnswerAction, 'call-answer');
assert.equal(result.callAnswerMedia, 'audio', 'a video offer may be answered without enabling the recipient camera');
assert.equal(result.callAnswerRestartCapability, false, 'omitting the capability remains backward compatible');
assert.equal(result.callEndAction, 'call-hangup');
assert.equal(result.callRestartOfferAction, 'call-restart-offer');
assert.equal(result.callRestartOfferId, 1);
assert.equal(result.callRestartAnswerAction, 'call-restart-answer');
assert.equal(result.callRestartAnswerId, 1);
assert.equal(result.callWrongRecipientRejected, true);
assert.equal(result.callStaleSignalRejected, true, 'expired setup signals are rejected by logical timestamp');
assert.equal(result.groupCallRejected, true, 'calls cannot be opened for group conversations');
assert.equal(result.invalidCallSdpRejected, true);
assert.equal(result.invalidCallIdRejected, true);
assert.equal(result.fileOfferAction, 'file-offer');
assert.equal(result.fileOfferManifest.name, 'sample.txt');
assert.equal(result.fileOfferCaption, 'transfer context');
assert.match(result.fileOfferSdp, /m=application/);
assert.equal(result.fileAnswerAction, 'file-answer');
assert.equal(result.fileRejectAction, 'file-reject');
assert.equal(result.fileRecipientOnly, true, 'the relay sees only the intended recipient tag');
assert.equal(result.filePayloadEncrypted, true, 'file names and data-channel SDP remain encrypted in the relay signal');
assert.equal(result.wrongFileRecipientRejected, true);
assert.equal(result.staleFileOfferRejected, true);
assert.equal(result.oversizedFileManifestRejected, true);
assert.equal(result.groupFileTransferRejected, true, 'direct file transfer is rejected for groups');
assert.equal(result.wrongRecipientRejected, true);
assert.equal(result.tamperingRejected, true);
assert.equal(result.staleSignalRejected, true);
assert.equal(result.invalidActionRejected, true);
console.log('PASS: encrypted NIP-59 activity and call signals enforce expiry, direct recipients, validated SDP and bounded ICE restart metadata');
