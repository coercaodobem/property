import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, console, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/typing-signals.js']) {
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
  const stop = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'stop', 102);
  const thinking = PropertyTypingSignals.create(nostr, a, [aPub, bPub], 'thinking', 103);
  const messageId = 'ab'.repeat(32);
  const groupReceipt = PropertyTypingSignals.createReadReceipt(nostr, a, [aPub, bPub, cPub], bPub, messageId, 105, true);
  const activePresence = PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub], true, 107);
  const inactivePresence = PropertyTypingSignals.createPresence(nostr, a, [aPub, bPub], false, 108);
  const startEvent = start[0].event;
  const stopEvent = stop[0].event;
  const openedStart = PropertyTypingSignals.unwrap(nostr, startEvent, b);
  const openedStop = PropertyTypingSignals.unwrap(nostr, stopEvent, b);
  const openedThinking = PropertyTypingSignals.unwrap(nostr, thinking[0].event, b);
  const staleThinking = PropertyTypingSignals.unwrap(nostr, thinking[0].event, b, Math.floor(Date.now() / 1000) + 63);
  const group = PropertyTypingSignals.create(nostr, a, [aPub, bPub, cPub], 'typing', 104);
  const openedGroup = group.map(item => PropertyTypingSignals.unwrap(nostr, item.event,
    item.recipient === bPub ? b : c));
  const openedReceipt = PropertyTypingSignals.unwrap(nostr, groupReceipt[0].event, b);
  const openedPresence = PropertyTypingSignals.unwrap(nostr, activePresence[0].event, b);
  const openedInactivePresence = PropertyTypingSignals.unwrap(nostr, inactivePresence[0].event, b);
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
  return {
    wrapperKind: startEvent.kind,
    signatureValid: nostr.verifyEvent(startEvent) && nostr.verifyEvent(stopEvent),
    recipientTagOnly: JSON.stringify(startEvent.tags) === JSON.stringify([['p', bPub]]),
    contentHasNoPlainStatus: !startEvent.content.includes('"action":"typing"'),
    startAction: openedStart?.action,
    stopAction: openedStop?.action,
    thinkingAction: openedThinking?.action,
    thinkingExpiresAfter60Seconds: staleThinking === null,
    thinkingStatusIsEncrypted: !thinking[0].event.content.includes('"action":"thinking"'),
    sequenceIncreases: openedStart?.sequence < openedStop?.sequence,
    senderMatches: openedStart?.sender === aPub,
    groupWrapCount: group.length,
    groupParticipants: openedGroup.every(item => item?.participants.length === 3),
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
assert.equal(result.stopAction, 'stop');
assert.equal(result.thinkingAction, 'thinking');
assert.equal(result.thinkingExpiresAfter60Seconds, true, 'a lost agent stop cannot leave the status visible indefinitely');
assert.equal(result.thinkingStatusIsEncrypted, true, 'the wrapper does not expose the activity state');
assert.equal(result.sequenceIncreases, true, 'the receiver can reject reordered older signals');
assert.equal(result.senderMatches, true);
assert.equal(result.groupWrapCount, 2, 'a three-person room gets one wrapper per other participant');
assert.equal(result.groupParticipants, true, 'each group recipient decrypts the same participant set');
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
assert.equal(result.wrongRecipientRejected, true);
assert.equal(result.tamperingRejected, true);
assert.equal(result.staleSignalRejected, true);
assert.equal(result.invalidActionRejected, true);
console.log('PASS: private typing, read-receipt and active-status signals use encrypted NIP-59 envelopes with expiry, replay guards and recipient isolation');
