import { createHash, randomBytes } from 'node:crypto';
import { parseStrictJson } from './ipc.mjs';
import { exactObject, PUBKEY } from './core.mjs';
import {
  attachNanoThresholdSignature, buildNanoThresholdSendBlock, calculateNanoThresholdBlockHash, decodeThresholdBytes,
  encodeThresholdBytes, nanoAccountFromPublicKey, nanoPublicKeyFromAccount, nanoThresholdFrost as frost, nanoThresholdIdentifier,
} from './xno-threshold.mjs';

export const XNO_THRESHOLD_PROTOCOL = 'property-xno-threshold/v1';
const SESSION_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_MESSAGE_BYTES = 24 * 1024;
const MAX_RAW = (1n << 128n) - 1n;
const MAX_TTL = 7 * 24 * 60 * 60;
const ACCOUNT = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const TXID = /^[0-9a-f]{64}$/i;

function expectedSigners(contract, outcome) {
  if (outcome === 'release') return [contract.buyer_pubkey, contract.seller_pubkey].sort();
  if (outcome === 'refund') return [contract.buyer_pubkey, contract.arbiter_pubkey].sort();
  throw new Error('xno-threshold-outcome-invalid');
}
function hashBytes(hash) { if (!TXID.test(hash || '')) throw new Error('xno-threshold-hash-invalid'); return Uint8Array.from(Buffer.from(hash, 'hex')); }
function validateUnsignedIntent(value, session, sender) {
  const fields = ['intent_id', 'session_id', 'manifest_sha256', 'coordinator', 'network', 'outcome', 'account', 'destination', 'amount_raw',
    'balance_raw', 'previous', 'representative', 'signers', 'block', 'block_hash', 'created_at'];
  if (!exactObject(value, fields) || !SESSION_ID.test(value.intent_id || '') || value.session_id !== session.session_id ||
      value.manifest_sha256 !== session.manifest_sha256 || value.coordinator !== sender || sender !== session.creator || value.network !== 'dev' ||
      !['release', 'refund'].includes(value.outcome) || !ACCOUNT.test(value.account || '') || value.account !== session.group_account ||
      !ACCOUNT.test(value.destination || '') || value.destination !== (value.outcome === 'release' ? session.contract.seller_account : session.contract.buyer_account) ||
      value.amount_raw !== session.contract.amount_raw || value.balance_raw !== session.contract.amount_raw || !TXID.test(value.previous || '') ||
      !ACCOUNT.test(value.representative || '') || !Array.isArray(value.signers) || value.signers.length !== 2 ||
      expectedSigners(session.contract, value.outcome).some((key, index) => key !== value.signers[index]) ||
      !Number.isSafeInteger(value.created_at) || value.created_at < 0 || !value.block || typeof value.block !== 'object' || Array.isArray(value.block)) throw new Error('xno-threshold-intent-invalid');
  const block = value.block;
  if (!exactObject(block, ['type', 'account', 'previous', 'representative', 'balance', 'link', 'signature', 'work']) || block.type !== 'state' ||
      block.account !== value.account || block.previous !== value.previous || block.representative !== value.representative || block.balance !== '0' ||
      block.link !== nanoPublicKeyFromAccount(value.destination).reduce((out, byte) => out + byte.toString(16).padStart(2, '0'), '').toUpperCase() ||
      block.signature !== '0'.repeat(128) || !/^[0-9a-f]{16}$/i.test(block.work || '') || calculateNanoThresholdBlockHash(block) !== value.block_hash) {
    throw new Error('xno-threshold-intent-invalid');
  }
  const groupPublicKey = Uint8Array.from(Buffer.from(session.group_public_key, 'hex'));
  if (groupPublicKey.length !== 32 || nanoAccountFromPublicKey(groupPublicKey) !== value.account) throw new Error('xno-threshold-account-key-mismatch');
  return value;
}

function validateContract(value, participants, createdAt) {
  const fields = ['buyer_pubkey', 'buyer_account', 'seller_pubkey', 'seller_account', 'arbiter_pubkey', 'amount_raw', 'terms_sha256', 'expires_at'];
  if (!exactObject(value, fields) || !PUBKEY.test(value.buyer_pubkey || '') || !PUBKEY.test(value.seller_pubkey || '') || !PUBKEY.test(value.arbiter_pubkey || '') ||
      new Set([value.buyer_pubkey, value.seller_pubkey, value.arbiter_pubkey]).size !== 3 ||
      [value.buyer_pubkey, value.seller_pubkey, value.arbiter_pubkey].sort().some((key, index) => key !== participants[index]) ||
      !ACCOUNT.test(value.buyer_account || '') || !ACCOUNT.test(value.seller_account || '') || value.buyer_account === value.seller_account ||
      typeof value.amount_raw !== 'string' || !/^[1-9]\d{0,38}$/.test(value.amount_raw) || BigInt(value.amount_raw) > MAX_RAW ||
      !HASH.test(value.terms_sha256 || '') || !Number.isSafeInteger(value.expires_at) || value.expires_at <= createdAt || value.expires_at - createdAt > MAX_TTL) {
    throw new Error('xno-threshold-contract-invalid');
  }
  nanoPublicKeyFromAccount(value.buyer_account);
  nanoPublicKeyFromAccount(value.seller_account);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function same(left, right) { return stable(left) === stable(right); }
function parseMessage(body) {
  let value;
  try { value = parseStrictJson(body, MAX_MESSAGE_BYTES); } catch { throw new Error('xno-threshold-message-invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('xno-threshold-message-invalid');
  return value;
}
function encodeRound1(value) { return encodeThresholdBytes(value); }
function decodeRound1(value) {
  return value?.commitment?.some(item => item instanceof Uint8Array) ? value : decodeThresholdBytes(value);
}
function publicRound1Matches(value, peer) {
  const decoded = decodeRound1(value);
  if (!decoded || typeof decoded !== 'object' || decoded.identifier !== nanoThresholdIdentifier(peer) || !Array.isArray(decoded.commitment) || decoded.commitment.length !== 2 ||
      !(decoded.proofOfKnowledge instanceof Uint8Array) || decoded.proofOfKnowledge.length !== 64 || decoded.commitment.some(item => !(item instanceof Uint8Array) || item.length !== 32)) throw new Error('xno-threshold-round1-invalid');
  return decoded;
}
function validateManifest(value, recipient) {
  const fields = ['protocol', 'session_id', 'creator', 'participants', 'trade_id', 'contract', 'network', 'created_at', 'manifest_sha256'];
  if (!exactObject(value, fields) || value.protocol !== XNO_THRESHOLD_PROTOCOL || !SESSION_ID.test(value.session_id || '') || !PUBKEY.test(value.creator || '') ||
      !Array.isArray(value.participants) || value.participants.length !== 3 || value.participants.some(key => !PUBKEY.test(key)) ||
      new Set(value.participants).size !== 3 || [...value.participants].sort().some((key, index) => key !== value.participants[index]) ||
      !value.participants.includes(value.creator) || !value.participants.includes(recipient) || !/^[0-9a-f]{32}$/.test(value.trade_id || '') ||
      value.network !== 'dev' || !Number.isSafeInteger(value.created_at) || value.created_at < 0) {
    throw new Error('xno-threshold-manifest-invalid');
  }
  validateContract(value.contract, value.participants, value.created_at);
  const { manifest_sha256: ignored, ...unsigned } = value;
  if (sha256(stable(unsigned)) !== value.manifest_sha256) throw new Error('xno-threshold-manifest-invalid');
  return value;
}

export function createXnoThresholdProtocol({ pubkey, transport, wallet = null, relays = () => [], blockedPubkeys = () => [], loadStore, saveStore,
  serializeTask, now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  if (!PUBKEY.test(pubkey || '') || !transport || typeof loadStore !== 'function' || typeof saveStore !== 'function') throw new Error('xno-threshold-service-invalid');
  let queue = Promise.resolve();
  const serialize = serializeTask || (task => { const next = queue.then(task, task); queue = next.catch(() => {}); return next; });
  const signTickets = new Map();
  const configRelays = () => {
    const value = relays();
    if (!Array.isArray(value) || !value.length) throw new Error('relay-not-configured');
    return value;
  };
  const ensurePeer = peer => {
    if (!PUBKEY.test(peer || '') || peer === pubkey || blockedPubkeys().includes(peer)) throw new Error('xno-threshold-peer-invalid');
  };
  const state = async () => loadStore();
  const save = async value => saveStore(value);
  const findSession = (store, id) => {
    if (!SESSION_ID.test(id || '')) throw new Error('xno-threshold-session-id-invalid');
    const session = store.sessions[id];
    if (!session) throw new Error('xno-threshold-session-not-found');
    return session;
  };
const sessionFromManifest = (manifest, role, round1) => ({
    session_id: manifest.session_id, creator: manifest.creator, participants: manifest.participants, trade_id: manifest.trade_id,
    contract: manifest.contract, terms_sha256: manifest.contract.terms_sha256, network: manifest.network, manifest_sha256: manifest.manifest_sha256,
    created_at: manifest.created_at, status: 'dkg', role, own_round1_secret: encodeThresholdBytes(round1.secret),
    own_round1_public: encodeRound1(round1.public), public_round1: { [pubkey]: encodeRound1(round1.public) },
    outbound_round2: {}, inbound_round2: {}, key_package: null, group_public_key: '', group_account: '', messages_seen: {},
    intent: null, approvals: {}, signing: null, signed_block: null, publication: null,
    invite_delivered: {}, join_delivered: {},
  });
  const send = async (peer, message, replyTo = null) => {
    ensurePeer(peer);
    const body = JSON.stringify(encodeThresholdBytes(message));
    if (Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES) throw new Error('xno-threshold-message-too-large');
    const result = await transport.sendMessage(peer, body, replyTo, configRelays());
    if (!/^[0-9a-f]{32}$/.test(result?.message_id || '')) throw new Error('xno-threshold-send-failed');
    return result.message_id;
  };
  const readPeer = async peer => {
    ensurePeer(peer);
    const messages = await transport.readMessages(peer, 100);
    if (!Array.isArray(messages) || messages.length > 100) throw new Error('xno-threshold-transport-invalid');
    return messages.filter(item => item?.direction === 'received' && item.conversation_pubkey === peer && typeof item.body === 'string' && /^[0-9a-f]{32}$/.test(item.message_id || ''));
  };
  function frame(type, session, recipient, payload) {
    return { protocol: XNO_THRESHOLD_PROTOCOL, type, session_id: session.session_id, manifest_sha256: session.manifest_sha256,
      sender: pubkey, recipient, payload };
  }
  function validateFrame(value, expectedType, session, peer) {
    if (!exactObject(value, ['protocol', 'type', 'session_id', 'manifest_sha256', 'sender', 'recipient', 'payload']) ||
        value.protocol !== XNO_THRESHOLD_PROTOCOL || value.type !== expectedType || value.session_id !== session.session_id ||
        value.manifest_sha256 !== session.manifest_sha256 || value.sender !== peer || value.recipient !== pubkey) throw new Error('xno-threshold-message-unauthenticated');
    return value.payload;
  }
  function insertByPeer(map, peer, value, label) {
    if (map[peer] !== undefined && !same(map[peer], value)) throw new Error(`xno-threshold-${label}-conflict`);
    map[peer] = value;
  }

  async function create(params) {
    if (!exactObject(params, ['participants', 'trade_id', 'contract', 'network']) || !Array.isArray(params.participants) || params.participants.length !== 3 ||
        params.participants.some(peer => !PUBKEY.test(peer)) || new Set(params.participants).size !== 3 || !params.participants.includes(pubkey) ||
        !/^[0-9a-f]{32}$/.test(params.trade_id || '') || params.network !== 'dev') throw new Error('invalid-arguments');
    for (const peer of params.participants) if (peer !== pubkey) ensurePeer(peer);
    const current = now();
    const sessionId = randomId();
    if (!Number.isSafeInteger(current) || current < 0 || !SESSION_ID.test(sessionId)) throw new Error('xno-threshold-clock-or-id-invalid');
    const participants = [...params.participants].sort();
    const contract = validateContract(params.contract, participants, current);
    const unsigned = { protocol: XNO_THRESHOLD_PROTOCOL, session_id: sessionId, creator: pubkey, participants,
      trade_id: params.trade_id, contract, network: params.network, created_at: current };
    const manifest = { ...unsigned, manifest_sha256: sha256(stable(unsigned)) };
    const round1 = frost.DKG.round1(pubkey, { min: 2, max: 3 });
    const session = sessionFromManifest(manifest, 'creator', round1);
    const store = await state();
    if (store.sessions[sessionId]) { frost.DKG.clean(round1.secret); throw new Error('xno-threshold-session-id-reused'); }
    store.sessions[sessionId] = session;
    await save(store);
    const results = await Promise.allSettled(participants.filter(peer => peer !== pubkey).map(async peer => {
      const messageId = await send(peer, frame('invite', session, peer, manifest));
      session.invite_delivered[peer] = messageId;
      await save(store);
    }));
    const round1Broadcast = await publishJoin(session, store);
    return { session_id: sessionId, status: session.status, invitations_sent: results.filter(item => item.status === 'fulfilled').length,
      invitations_attempted: results.length, invitation_errors: results.filter(item => item.status === 'rejected').map(item => String(item.reason?.message || 'send-failed').slice(0, 80)),
      round1_announcements_sent: round1Broadcast.sent, round1_announcements_attempted: round1Broadcast.attempted,
      manifest_sha256: session.manifest_sha256 };
  }

  async function accept(params) {
    if (!exactObject(params, ['session_id']) || !SESSION_ID.test(params.session_id || '')) throw new Error('invalid-arguments');
    const store = await state();
    const existing = store.sessions[params.session_id];
    if (existing) return publicStatus(existing);
    const found = [];
    for (const peer of blockedPubkeys()) if (!PUBKEY.test(peer)) throw new Error('xno-threshold-peer-invalid');
    // Invites are authenticated by the existing NIP-17 transport and bound to their pairwise conversation.
    const possiblePeers = await transport.listConversations(100, blockedPubkeys());
    if (!Array.isArray(possiblePeers) || possiblePeers.length > 100) throw new Error('xno-threshold-transport-invalid');
    for (const peer of new Set(possiblePeers.map(item => item?.pubkey))) {
      if (!PUBKEY.test(peer || '') || peer === pubkey || blockedPubkeys().includes(peer)) continue;
      for (const message of await readPeer(peer)) {
        let frameValue;
        try { frameValue = decodeThresholdBytes(parseMessage(message.body)); } catch { continue; }
        if (frameValue?.protocol !== XNO_THRESHOLD_PROTOCOL || frameValue.type !== 'invite' || frameValue.session_id !== params.session_id) continue;
        if (!exactObject(frameValue, ['protocol', 'type', 'session_id', 'manifest_sha256', 'sender', 'recipient', 'payload']) || frameValue.sender !== peer || frameValue.recipient !== pubkey) continue;
        const manifest = validateManifest(frameValue.payload, pubkey);
        if (manifest.session_id !== params.session_id || manifest.creator !== peer || frameValue.manifest_sha256 !== manifest.manifest_sha256) continue;
        found.push({ peer, message, manifest });
      }
    }
    if (found.length !== 1) throw new Error(found.length ? 'xno-threshold-invitation-ambiguous' : 'xno-threshold-invitation-not-found');
    const { manifest } = found[0];
    for (const peer of manifest.participants) if (peer !== pubkey) ensurePeer(peer);
    const round1 = frost.DKG.round1(pubkey, { min: 2, max: 3 });
    const session = sessionFromManifest(manifest, 'participant', round1);
    store.sessions[session.session_id] = session;
    await save(store);
    await publishJoin(session, store);
    return publicStatus(session);
  }

  async function publishJoin(session, store) {
    const targets = session.participants.filter(peer => peer !== pubkey && !session.join_delivered[peer]);
    const results = await Promise.allSettled(targets.map(async peer => {
      const id = await send(peer, frame('join', session, peer, { round1: session.own_round1_public }));
      session.join_delivered[peer] = id;
      await save(store);
    }));
    return { sent: results.filter(result => result.status === 'fulfilled').length, attempted: results.length };
  }

  async function gather(session, store) {
    for (const peer of session.participants) {
      if (peer === pubkey) continue;
      const messages = await readPeer(peer);
      for (const message of messages) {
        let value;
        try { value = decodeThresholdBytes(parseMessage(message.body)); } catch { continue; }
        if (!value || value.protocol !== XNO_THRESHOLD_PROTOCOL || value.session_id !== session.session_id || value.manifest_sha256 !== session.manifest_sha256 || value.sender !== peer || value.recipient !== pubkey) continue;
        const seenHash = sha256(stable(value));
        if (session.messages_seen[message.message_id] && session.messages_seen[message.message_id] !== seenHash) throw new Error('xno-threshold-message-id-conflict');
        session.messages_seen[message.message_id] = seenHash;
        if (value.type === 'invite' && session.role !== 'creator') {
          const manifest = validateManifest(value.payload, pubkey);
          if (manifest.manifest_sha256 !== session.manifest_sha256 || manifest.creator !== peer) throw new Error('xno-threshold-invitation-conflict');
        } else if (value.type === 'join') {
          const payload = validateFrame(value, 'join', session, peer);
          if (!exactObject(payload, ['round1'])) throw new Error('xno-threshold-round1-invalid');
          const round1 = publicRound1Matches(payload.round1, peer);
          insertByPeer(session.public_round1, peer, encodeRound1(round1), 'round1');
        } else if (value.type === 'dkg_share') {
          const payload = validateFrame(value, 'dkg_share', session, peer);
          if (!exactObject(payload, ['recipient_identifier', 'share']) || payload.recipient_identifier !== nanoThresholdIdentifier(pubkey)) throw new Error('xno-threshold-round2-invalid');
          const share = payload.share?.signingShare instanceof Uint8Array ? payload.share : decodeThresholdBytes(payload.share);
          if (!share || share.identifier !== nanoThresholdIdentifier(peer) || !(share.signingShare instanceof Uint8Array) || share.signingShare.length !== 32) throw new Error('xno-threshold-round2-invalid');
          insertByPeer(session.inbound_round2, peer, encodeThresholdBytes(share), 'round2');
        } else if (value.type === 'settlement_proposal') {
          const payload = validateFrame(value, 'settlement_proposal', session, peer);
          const intent = validateUnsignedIntent(payload, session, peer);
          if (session.intent && !same(session.intent, intent)) throw new Error('xno-threshold-intent-conflict');
          session.intent = intent;
          session.approvals ||= {};
        } else if (value.type === 'settlement_approval') {
          const payload = validateFrame(value, 'settlement_approval', session, peer);
          if (!exactObject(payload, ['intent_id', 'block_hash', 'signer']) || !session.intent || payload.intent_id !== session.intent.intent_id ||
              payload.block_hash !== session.intent.block_hash || payload.signer !== peer || !session.intent.signers.includes(peer)) continue;
          insertByPeer(session.approvals, peer, { intent_id: payload.intent_id, block_hash: payload.block_hash }, 'approval');
        } else if (value.type === 'signing_start') {
          const payload = validateFrame(value, 'signing_start', session, peer);
          if (peer !== session.creator || !exactObject(payload, ['round_id', 'intent_id', 'block_hash', 'signers']) || !SESSION_ID.test(payload.round_id || '') ||
              !session.intent || payload.intent_id !== session.intent.intent_id || payload.block_hash !== session.intent.block_hash || !same(payload.signers, session.intent.signers)) continue;
          if (!session.signing || session.signing.round_id !== payload.round_id) {
            const active = signTickets.get(session.session_id);
            if (active) { frost.discardNonce(active.ticket); signTickets.delete(session.session_id); }
            session.signing = { round_id: payload.round_id, signers: payload.signers, commitments: {}, signature_shares: {}, status: 'collecting' };
          }
        } else if (value.type === 'nonce_commit') {
          const payload = validateFrame(value, 'nonce_commit', session, peer);
          if (!exactObject(payload, ['round_id', 'intent_id', 'block_hash', 'commitment']) || !session.signing || payload.round_id !== session.signing.round_id ||
              payload.intent_id !== session.intent?.intent_id || payload.block_hash !== session.intent?.block_hash || !session.signing.signers.includes(peer)) continue;
          const commitment = payload.commitment?.hiding instanceof Uint8Array ? payload.commitment : decodeThresholdBytes(payload.commitment);
          if (!commitment || commitment.identifier !== nanoThresholdIdentifier(peer) || !(commitment.hiding instanceof Uint8Array) || commitment.hiding.length !== 32 ||
              !(commitment.binding instanceof Uint8Array) || commitment.binding.length !== 32) throw new Error('xno-threshold-nonce-commitment-invalid');
          insertByPeer(session.signing.commitments, peer, encodeThresholdBytes(commitment), 'nonce-commitment');
        } else if (value.type === 'signature_share') {
          const payload = validateFrame(value, 'signature_share', session, peer);
          if (!exactObject(payload, ['round_id', 'intent_id', 'block_hash', 'identifier', 'share']) || !session.signing || payload.round_id !== session.signing.round_id ||
              payload.intent_id !== session.intent?.intent_id || payload.block_hash !== session.intent?.block_hash || !session.signing.signers.includes(peer) ||
              payload.identifier !== nanoThresholdIdentifier(peer) || Object.keys(session.signing.commitments).length !== 2) continue;
          const share = payload.share instanceof Uint8Array ? payload.share : decodeThresholdBytes(payload.share);
          const keyPackage = decodeThresholdBytes(session.key_package);
          const commitments = session.signing.signers.map(signer => decodeThresholdBytes(session.signing.commitments[signer]));
          if (!(share instanceof Uint8Array) || share.length !== 32 || !frost.verifyShare(keyPackage.public, commitments, hashBytes(session.intent.block_hash), payload.identifier, share)) throw new Error('xno-threshold-signature-share-invalid');
          insertByPeer(session.signing.signature_shares, peer, encodeThresholdBytes(share), 'signature-share');
        } else if (value.type === 'signed_block') {
          const payload = validateFrame(value, 'signed_block', session, peer);
          if (peer !== session.creator || !exactObject(payload, ['intent_id', 'block_hash', 'block']) || payload.intent_id !== session.intent?.intent_id ||
              payload.block_hash !== session.intent?.block_hash || !same({ ...payload.block, signature: session.intent.block.signature }, session.intent.block)) continue;
          const signed = attachNanoThresholdSignature(payload.block, payload.block.signature, Uint8Array.from(Buffer.from(session.group_public_key, 'hex')));
          if (signed.block_hash !== session.intent.block_hash) throw new Error('xno-threshold-signed-block-invalid');
          session.signed_block = signed.block;
        }
      }
    }
    await save(store);
  }

  async function advanceDkg(session, store) {
    const participants = session.participants;
    if (Object.keys(session.public_round1).length !== 3) return;
    if (!session.outbound_round2 || Object.keys(session.outbound_round2).length === 0) {
      const secret = decodeThresholdBytes(session.own_round1_secret);
      const others = participants.filter(peer => peer !== pubkey).map(peer => publicRound1Matches(session.public_round1[peer], peer));
      const allShares = frost.DKG.round2(secret, others);
      session.own_round1_secret = encodeThresholdBytes(secret);
      for (const peer of participants) {
        if (peer === pubkey) continue;
        const recipientId = nanoThresholdIdentifier(peer);
        const share = allShares[recipientId];
        if (!share || share.identifier !== nanoThresholdIdentifier(pubkey)) throw new Error('xno-threshold-round2-generation-failed');
        session.outbound_round2[peer] = { payload: encodeThresholdBytes({ recipient_identifier: recipientId, share }), sent: false };
      }
      await save(store);
    }
    for (const peer of participants) {
      if (peer === pubkey || session.outbound_round2[peer]?.sent) continue;
      const record = session.outbound_round2[peer];
      await send(peer, frame('dkg_share', session, peer, record.payload));
      record.sent = true;
      await save(store);
    }
    if (Object.keys(session.inbound_round2).length !== 2) return;
    if (session.status === 'ready') return;
    const dkgSecret = decodeThresholdBytes(session.own_round1_secret);
    const otherPublic = participants.filter(peer => peer !== pubkey).map(peer => publicRound1Matches(session.public_round1[peer], peer));
    const shares = participants.filter(peer => peer !== pubkey).map(peer => decodeThresholdBytes(session.inbound_round2[peer]));
    const keyPackage = frost.DKG.round3(dkgSecret, otherPublic, shares);
    frost.validateSecret(keyPackage.secret, keyPackage.public);
    const publicKey = keyPackage.public.commitments[0];
    session.key_package = encodeThresholdBytes(keyPackage);
    session.group_public_key = Buffer.from(publicKey).toString('hex');
    session.group_account = nanoAccountFromPublicKey(publicKey);
    session.own_round1_secret = null;
    session.outbound_round2 = {};
    session.inbound_round2 = {};
    session.status = 'ready';
    await save(store);
  }

  function requireSessionReady(session) {
    if (session.status !== 'ready' || !session.key_package || !session.group_account || !session.group_public_key) throw new Error('xno-threshold-dkg-incomplete');
  }
  function requireThresholdWallet() {
    if (!wallet || typeof wallet.inspectThresholdAccount !== 'function' || typeof wallet.generateThresholdWork !== 'function' || typeof wallet.publishThresholdBlock !== 'function') {
      throw new Error('xno-threshold-dev-node-not-configured');
    }
  }
  async function assertIntentFrontier(session) {
    requireThresholdWallet();
    const groupPublicKey = Uint8Array.from(Buffer.from(session.group_public_key, 'hex'));
    const accountState = await wallet.inspectThresholdAccount({ account: session.group_account, groupPublicKey });
    if (accountState.previous !== session.intent.previous || accountState.balance_raw !== session.intent.balance_raw || accountState.representative !== session.intent.representative) {
      throw new Error('xno-threshold-account-state-changed');
    }
  }
  function approvalText(intent) {
    return `${intent.outcome.toUpperCase()} ${intent.amount_raw} RAW from ${intent.account} to ${intent.destination} block ${intent.block_hash}`;
  }

  async function proposeSettlement(params) {
    if (!exactObject(params, ['session_id', 'outcome']) || !SESSION_ID.test(params.session_id || '') || !['release', 'refund'].includes(params.outcome)) throw new Error('invalid-arguments');
    requireThresholdWallet();
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    if (session.creator !== pubkey) throw new Error('xno-threshold-proposal-requires-coordinator');
    if (session.network !== 'dev') throw new Error('xno-threshold-mainnet-disabled');
    if (session.intent) {
      if (session.intent.outcome !== params.outcome) throw new Error('xno-threshold-session-already-has-intent');
      await assertIntentFrontier(session);
      const retryResults = await Promise.allSettled(session.participants.filter(peer => peer !== pubkey).map(peer => send(peer,
        frame('settlement_proposal', session, peer, session.intent))));
      return { intent_id: session.intent.intent_id, outcome: session.intent.outcome, account: session.intent.account, destination: session.intent.destination,
        amount_raw: session.intent.amount_raw, balance_raw: session.intent.balance_raw, previous: session.intent.previous, signers: session.intent.signers,
        block_hash: session.intent.block_hash, relay_acks: retryResults.filter(item => item.status === 'fulfilled').length,
        relay_attempts: retryResults.length, duplicate: true };
    }
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('xno-threshold-clock-invalid');
    const contract = session.contract;
    if (params.outcome === 'release' && current > contract.expires_at) throw new Error('xno-threshold-contract-expired');
    if (params.outcome === 'refund' && current < contract.expires_at) throw new Error('xno-threshold-refund-not-yet-available');
    const destination = params.outcome === 'release' ? contract.seller_account : contract.buyer_account;
    const amount = contract.amount_raw;
    const groupPublicKey = Uint8Array.from(Buffer.from(session.group_public_key, 'hex'));
    const accountState = await wallet.inspectThresholdAccount({ account: session.group_account, groupPublicKey });
    if (accountState.balance_raw !== amount) throw new Error('xno-threshold-balance-does-not-match-contract');
    const template = buildNanoThresholdSendBlock({ account: session.group_account, groupPublicKey, previous: accountState.previous,
      representative: accountState.representative, balanceRaw: accountState.balance_raw, destination, amountRaw: amount });
    const work = await wallet.generateThresholdWork(template.block);
    const proposal = buildNanoThresholdSendBlock({ account: session.group_account, groupPublicKey, previous: accountState.previous,
      representative: accountState.representative, balanceRaw: accountState.balance_raw, destination, amountRaw: amount, work });
    const intentId = randomId();
    if (!SESSION_ID.test(intentId)) throw new Error('xno-threshold-intent-id-invalid');
    const signers = expectedSigners(contract, params.outcome);
    const intent = { intent_id: intentId, session_id: session.session_id, manifest_sha256: session.manifest_sha256,
      coordinator: pubkey, network: 'dev', outcome: params.outcome, account: session.group_account, destination,
      amount_raw: amount, balance_raw: accountState.balance_raw, previous: accountState.previous, representative: accountState.representative,
      signers, block: proposal.block, block_hash: proposal.block_hash, created_at: current };
    validateUnsignedIntent(intent, session, pubkey);
    session.intent = intent;
    session.approvals = {};
    session.signing = null;
    session.signed_block = null;
    session.publication = null;
    await save(store);
    const results = await Promise.allSettled(session.participants.filter(peer => peer !== pubkey).map(peer => send(peer, frame('settlement_proposal', session, peer, intent))));
    return { intent_id: intent.intent_id, outcome: intent.outcome, account: intent.account, destination: intent.destination,
      amount_raw: intent.amount_raw, balance_raw: intent.balance_raw, previous: intent.previous, signers: intent.signers,
      block_hash: intent.block_hash, relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length };
  }

  async function approveSettlement(params) {
    const fields = ['session_id', 'intent_id', 'block_hash', 'outcome', 'account', 'destination', 'amount_raw', 'previous', 'confirm_text'];
    if (!exactObject(params, fields) || !SESSION_ID.test(params.session_id || '') || !SESSION_ID.test(params.intent_id || '') || !TXID.test(params.block_hash || '') ||
        !['release', 'refund'].includes(params.outcome) || !ACCOUNT.test(params.account || '') || !ACCOUNT.test(params.destination || '') ||
        typeof params.amount_raw !== 'string' || !/^[1-9]\d{0,38}$/.test(params.amount_raw) || !TXID.test(params.previous || '') || typeof params.confirm_text !== 'string') throw new Error('invalid-arguments');
    requireThresholdWallet();
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    const intent = session.intent;
    if (!intent || intent.intent_id !== params.intent_id || intent.block_hash !== params.block_hash || intent.outcome !== params.outcome ||
        intent.account !== params.account || intent.destination !== params.destination || intent.amount_raw !== params.amount_raw || intent.previous !== params.previous ||
        params.confirm_text !== approvalText(intent)) throw new Error('xno-threshold-approval-details-mismatch');
    if (!intent.signers.includes(pubkey)) throw new Error('xno-threshold-not-an-authorized-signer');
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0 || (intent.outcome === 'release' && current > session.contract.expires_at)) throw new Error('xno-threshold-contract-expired');
    await assertIntentFrontier(session);
    session.approvals[pubkey] = { intent_id: intent.intent_id, block_hash: intent.block_hash };
    await save(store);
    const results = await Promise.allSettled(session.participants.filter(peer => peer !== pubkey).map(peer => send(peer,
      frame('settlement_approval', session, peer, { intent_id: intent.intent_id, block_hash: intent.block_hash, signer: pubkey }))));
    return { intent_id: intent.intent_id, approved: true, outcome: intent.outcome, destination: intent.destination,
      amount_raw: intent.amount_raw, block_hash: intent.block_hash, relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length };
  }

  async function beginSettlementSigning(params) {
    if (!exactObject(params, ['session_id', 'intent_id', 'block_hash']) || !SESSION_ID.test(params.session_id || '') || !SESSION_ID.test(params.intent_id || '') || !TXID.test(params.block_hash || '')) throw new Error('invalid-arguments');
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    if (pubkey !== session.creator || !session.intent || session.intent.intent_id !== params.intent_id || session.intent.block_hash !== params.block_hash) throw new Error('xno-threshold-signing-start-invalid');
    if (session.intent.signers.some(signer => session.approvals[signer]?.intent_id !== session.intent.intent_id || session.approvals[signer]?.block_hash !== session.intent.block_hash)) {
      throw new Error('xno-threshold-signature-quorum-not-approved');
    }
    await assertIntentFrontier(session);
    const active = signTickets.get(session.session_id);
    if (active) { frost.discardNonce(active.ticket); signTickets.delete(session.session_id); }
    const roundId = randomId();
    if (!SESSION_ID.test(roundId)) throw new Error('xno-threshold-signing-round-invalid');
    session.signing = { round_id: roundId, signers: session.intent.signers, commitments: {}, signature_shares: {}, status: 'collecting' };
    session.signed_block = null;
    await save(store);
    const recipients = new Set([...session.intent.signers, ...session.participants]);
    const results = await Promise.allSettled([...recipients].filter(peer => peer !== pubkey).map(peer => send(peer,
      frame('signing_start', session, peer, { round_id: roundId, intent_id: session.intent.intent_id, block_hash: session.intent.block_hash, signers: session.intent.signers }))));
    return { round_id: roundId, status: 'collecting', signers: session.intent.signers,
      relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length };
  }

  async function prepareSettlementSignature(params) {
    if (!exactObject(params, ['session_id', 'intent_id', 'block_hash']) || !SESSION_ID.test(params.session_id || '') || !SESSION_ID.test(params.intent_id || '') || !TXID.test(params.block_hash || '')) throw new Error('invalid-arguments');
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    if (!session.intent || session.intent.intent_id !== params.intent_id || session.intent.block_hash !== params.block_hash ||
        !session.intent.signers.includes(pubkey) || session.approvals[pubkey]?.intent_id !== params.intent_id || session.approvals[pubkey]?.block_hash !== params.block_hash) {
      throw new Error('xno-threshold-local-approval-required');
    }
    if (session.intent.outcome === 'release' && now() > session.contract.expires_at) throw new Error('xno-threshold-contract-expired');
    await assertIntentFrontier(session);
    if (!session.signing || !session.signing.round_id) throw new Error('xno-threshold-signing-round-not-started');
    const otherSigner = session.signing.signers.find(peer => peer !== pubkey);
    if (!otherSigner || session.approvals[otherSigner]?.intent_id !== params.intent_id || session.approvals[otherSigner]?.block_hash !== params.block_hash) throw new Error('xno-threshold-signature-quorum-not-approved');
    const active = signTickets.get(session.session_id);
    let ticket;
    if (active?.round_id === session.signing.round_id) ticket = active.ticket;
    else {
      if (active) { frost.discardNonce(active.ticket); signTickets.delete(session.session_id); }
      if (session.signing.commitments[pubkey]) throw new Error('xno-threshold-signing-ticket-lost-start-new-round');
      const keyPackage = decodeThresholdBytes(session.key_package);
      ticket = frost.commit(keyPackage.secret);
      signTickets.set(session.session_id, { round_id: session.signing.round_id, ticket });
      session.signing.commitments[pubkey] = encodeThresholdBytes(ticket.commitments);
      await save(store);
    }
    const recipients = new Set([otherSigner, session.creator]);
    const results = await Promise.allSettled([...recipients].filter(peer => peer !== pubkey).map(peer => send(peer, frame('nonce_commit', session, peer,
      { round_id: session.signing.round_id, intent_id: session.intent.intent_id, block_hash: session.intent.block_hash, commitment: ticket.commitments }))));
    return { round_id: session.signing.round_id, commitment: encodeThresholdBytes(ticket.commitments),
      relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length };
  }

  async function signSettlement(params) {
    if (!exactObject(params, ['session_id', 'intent_id', 'block_hash']) || !SESSION_ID.test(params.session_id || '') || !SESSION_ID.test(params.intent_id || '') || !TXID.test(params.block_hash || '')) throw new Error('invalid-arguments');
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    if (!session.signing || !session.intent || session.intent.intent_id !== params.intent_id || session.intent.block_hash !== params.block_hash ||
        !session.intent.signers.includes(pubkey) || session.approvals[pubkey]?.intent_id !== params.intent_id || session.approvals[pubkey]?.block_hash !== params.block_hash) throw new Error('xno-threshold-local-approval-required');
    if (session.signing.signers.some(signer => !session.signing.commitments[signer])) throw new Error('xno-threshold-nonce-commitments-incomplete');
    if (session.intent.outcome === 'release' && now() > session.contract.expires_at) throw new Error('xno-threshold-contract-expired');
    await assertIntentFrontier(session);
    const cachedShare = session.signing.signature_shares[pubkey];
    if (cachedShare) {
      const savedShare = decodeThresholdBytes(cachedShare);
      const keyPackage = decodeThresholdBytes(session.key_package);
      const recipients = new Set([session.creator]);
      const results = await Promise.allSettled([...recipients].filter(peer => peer !== pubkey).map(peer => send(peer, frame('signature_share', session, peer,
        { round_id: session.signing.round_id, intent_id: session.intent.intent_id, block_hash: session.intent.block_hash,
          identifier: keyPackage.secret.identifier, share: savedShare }))));
      await aggregateIfReady(session, store);
      return { round_id: session.signing.round_id, share_created: true, duplicate: true,
        relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length, signed: Boolean(session.signed_block) };
    }
    const active = signTickets.get(session.session_id);
    if (!active || active.round_id !== session.signing.round_id) throw new Error('xno-threshold-signing-ticket-lost-start-new-round');
    const keyPackage = decodeThresholdBytes(session.key_package);
    const commitmentList = session.signing.signers.map(signer => decodeThresholdBytes(session.signing.commitments[signer]));
    signTickets.delete(session.session_id);
    const share = frost.signShare(keyPackage.secret, keyPackage.public, active.ticket, commitmentList, hashBytes(session.intent.block_hash));
    session.signing.signature_shares[pubkey] = encodeThresholdBytes(share);
    await save(store);
    const recipients = new Set([session.creator]);
    const results = await Promise.allSettled([...recipients].filter(peer => peer !== pubkey).map(peer => send(peer, frame('signature_share', session, peer,
      { round_id: session.signing.round_id, intent_id: session.intent.intent_id, block_hash: session.intent.block_hash,
        identifier: keyPackage.secret.identifier, share }))));
    await aggregateIfReady(session, store);
    return { round_id: session.signing.round_id, share_created: true,
      relay_acks: results.filter(item => item.status === 'fulfilled').length, relay_attempts: results.length,
      signed: Boolean(session.signed_block) };
  }

  async function aggregateIfReady(session, store) {
    if (pubkey !== session.creator || !session.intent || !session.signing || session.signing.status === 'signed') return;
    if (session.signing.signers.some(signer => !session.signing.signature_shares[signer])) return;
    const keyPackage = decodeThresholdBytes(session.key_package);
    const commitments = session.signing.signers.map(signer => decodeThresholdBytes(session.signing.commitments[signer]));
    const shares = Object.fromEntries(session.signing.signers.map(signer => {
      const sharePackage = decodeThresholdBytes(session.signing.signature_shares[signer]);
      return [sharePackage.identifier || nanoThresholdIdentifier(signer), sharePackage.signingShare || sharePackage];
    }));
    const signature = frost.aggregate(keyPackage.public, commitments, hashBytes(session.intent.block_hash), shares);
    const signed = attachNanoThresholdSignature(session.intent.block, signature, Uint8Array.from(Buffer.from(session.group_public_key, 'hex')));
    if (signed.block_hash !== session.intent.block_hash) throw new Error('xno-threshold-signed-block-invalid');
    session.signed_block = signed.block;
    session.signing.status = 'signed';
    await save(store);
    const recipients = session.participants.filter(peer => peer !== pubkey);
    await Promise.allSettled(recipients.map(peer => send(peer, frame('signed_block', session, peer,
      { intent_id: session.intent.intent_id, block_hash: session.intent.block_hash, block: signed.block }))));
  }

  async function publishSettlement(params) {
    if (!exactObject(params, ['session_id', 'intent_id', 'block_hash']) || !SESSION_ID.test(params.session_id || '') || !SESSION_ID.test(params.intent_id || '') || !TXID.test(params.block_hash || '')) throw new Error('invalid-arguments');
    requireThresholdWallet();
    const store = await state();
    const session = findSession(store, params.session_id);
    requireSessionReady(session);
    if (session.network !== 'dev') throw new Error('xno-threshold-mainnet-disabled');
    if (pubkey !== session.creator || !session.intent || session.intent.intent_id !== params.intent_id || session.intent.block_hash !== params.block_hash || !session.signed_block) {
      throw new Error('xno-threshold-signed-block-not-available');
    }
    if (session.publication) return session.publication;
    const result = await wallet.publishThresholdBlock(session.signed_block, Uint8Array.from(Buffer.from(session.group_public_key, 'hex')));
    session.publication = { ...result, confirmed: false };
    await save(store);
    return session.publication;
  }

  async function sync(params) {
    if (!exactObject(params, ['session_id']) || !SESSION_ID.test(params.session_id || '')) throw new Error('invalid-arguments');
    const store = await state();
    const session = findSession(store, params.session_id);
    if (session.status === 'aborted') return publicStatus(session);
    if (session.role === 'participant') await publishJoin(session, store);
    await gather(session, store);
    if (session.status !== 'ready') await advanceDkg(session, store);
    await aggregateIfReady(session, store);
    return publicStatus(session);
  }

  function publicStatus(session) {
    const completed = session.status === 'ready';
    return { session_id: session.session_id, status: session.status, role: session.role, trade_id: session.trade_id,
      terms_sha256: session.contract.terms_sha256, network: session.network, participant_count: session.participants.length,
      round1_received: Object.keys(session.public_round1 || {}).length, round2_received: completed ? 2 : Object.keys(session.inbound_round2 || {}).length,
      ...(completed ? { threshold: '2-of-3', group_public_key: session.group_public_key, group_account: session.group_account } : {}),
      ...(session.intent ? { settlement: { intent_id: session.intent.intent_id, outcome: session.intent.outcome, block_hash: session.intent.block_hash,
        account: session.intent.account, destination: session.intent.destination, amount_raw: session.intent.amount_raw,
        balance_raw: session.intent.balance_raw, previous: session.intent.previous, signers: session.intent.signers,
        approval_text: approvalText(session.intent),
        approvals: Object.keys(session.approvals || {}), signing_status: session.signing?.status || 'not_started',
        signed: Boolean(session.signed_block), published: Boolean(session.publication), publication: session.publication } } : {}) };
  }

  async function status(params) {
    if (!exactObject(params, ['session_id']) || !SESSION_ID.test(params.session_id || '')) throw new Error('invalid-arguments');
    const store = await state();
    return publicStatus(findSession(store, params.session_id));
  }

  return Object.freeze({ create: params => serialize(() => create(params)), accept: params => serialize(() => accept(params)),
    sync: params => serialize(() => sync(params)), status: params => status(params),
    proposeSettlement: params => serialize(() => proposeSettlement(params)), approveSettlement: params => serialize(() => approveSettlement(params)),
    beginSettlementSigning: params => serialize(() => beginSettlementSigning(params)), prepareSettlementSignature: params => serialize(() => prepareSettlementSignature(params)),
    signSettlement: params => serialize(() => signSettlement(params)), publishSettlement: params => serialize(() => publishSettlement(params)) });
}
