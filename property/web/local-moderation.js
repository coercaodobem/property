'use strict';
(() => {
  const PUBKEY = /^[0-9a-f]{64}$/i;
  const BLOCK_PREFIX = 'property-local-block:';
  const REPORT_PREFIX = 'property-local-report:';
  const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'impersonation', 'scam', 'other']);

  function identityKey(value) {
    if (typeof value !== 'string' || !PUBKEY.test(value)) throw new TypeError('Invalid Property identity.');
    return value.toLowerCase();
  }

  function peerKey(value) {
    if (typeof value !== 'string' || !PUBKEY.test(value)) throw new TypeError('Invalid Nostr public key.');
    return value.toLowerCase();
  }

  function blockId(identity, peer) {
    const owner = identityKey(identity), target = peerKey(peer);
    if (owner === target) throw new TypeError('You cannot block your active identity.');
    return `${BLOCK_PREFIX}${owner}:${target}`;
  }

  function reportPrefix(identity) {
    return `${REPORT_PREFIX}${identityKey(identity)}:`;
  }

  function createBlockRecord(identity, peer, blockedAt = 0) {
    if (!Number.isSafeInteger(blockedAt) || blockedAt < 0) throw new RangeError('Invalid local block timestamp.');
    return { id: blockId(identity, peer), type: 'property-local-block/v1', identity: identityKey(identity), peer: peerKey(peer), blocked_at: blockedAt };
  }

  function blockedPeers(records, identity) {
    const owner = identityKey(identity);
    if (!Array.isArray(records)) return [];
    const valid = [];
    for (const record of records) {
      if (record?.type !== 'property-local-block/v1' || record.identity !== owner ||
        typeof record.peer !== 'string' || !PUBKEY.test(record.peer) || !Number.isSafeInteger(record.blocked_at) || record.blocked_at < 0) continue;
      if (record.peer.toLowerCase() === owner) continue;
      const expectedId = `${BLOCK_PREFIX}${owner}:${record.peer.toLowerCase()}`;
      if (record.id === expectedId) valid.push(record.peer.toLowerCase());
    }
    return [...new Set(valid)].sort();
  }

  function isBlocked(records, identity, peer) {
    const target = peerKey(peer);
    return blockedPeers(records, identity).includes(target);
  }

  function messageFromBlocked(message, blocked) {
    const sender = message?.senderPubkey || message?.authorPubkey || message?.pubkey;
    return typeof sender === 'string' && blocked && typeof blocked.has === 'function' && blocked.has(sender.toLowerCase());
  }

  function visibleMessages(messages, blocked) {
    if (!Array.isArray(messages)) return [];
    return messages.filter(message => !messageFromBlocked(message, blocked));
  }

  function createReportRecord(identity, peer, reason, createdAt, reportId) {
    const owner = identityKey(identity), target = peerKey(peer);
    if (owner === target) throw new TypeError('You cannot report your active identity.');
    if (!REPORT_REASONS.includes(reason)) throw new RangeError('Invalid local report reason.');
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new RangeError('Invalid local report timestamp.');
    if (typeof reportId !== 'string' || !/^[a-f0-9-]{16,64}$/i.test(reportId)) throw new TypeError('Invalid local report ID.');
    return { id: `${reportPrefix(owner)}${reportId}`, type: 'property-local-report/v1', identity: owner, peer: target, reason, created_at: createdAt };
  }

  function localReports(records, identity) {
    const prefix = reportPrefix(identity);
    if (!Array.isArray(records)) return [];
    return records.filter(record => typeof record?.id === 'string' && record.id.startsWith(prefix) &&
      record.type === 'property-local-report/v1' && record.identity === identityKey(identity) &&
      PUBKEY.test(record.peer || '') && REPORT_REASONS.includes(record.reason) && Number.isSafeInteger(record.created_at) && record.created_at >= 0);
  }

  window.PropertyLocalModeration = Object.freeze({ REPORT_REASONS, blockId, reportPrefix, createBlockRecord,
    blockedPeers, isBlocked, messageFromBlocked, visibleMessages, createReportRecord, localReports });
})();
