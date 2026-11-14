import { createEncryptedPayload, openEncryptedPayload } from './vault.mjs';
import { readJson, writePrivateJson } from './store.mjs';

const CONTEXT = 'xno-threshold';
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const SESSION_ID = /^[0-9a-f]{32}$/;
const PUBKEY = /^[0-9a-f]{64}$/;

export function emptyXnoThresholdState() {
  return { schema: 'property-agent-xno-threshold-state/v1', version: 1, sessions: {} };
}

export function validateXnoThresholdState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'schema|sessions|version' ||
      value.schema !== 'property-agent-xno-threshold-state/v1' || value.version !== 1 || !value.sessions || typeof value.sessions !== 'object' || Array.isArray(value.sessions)) {
    throw new Error('xno-threshold-state-invalid');
  }
  const sessionIds = Object.keys(value.sessions);
  if (sessionIds.length > 100 || sessionIds.some(id => !SESSION_ID.test(id))) throw new Error('xno-threshold-state-invalid');
  for (const id of sessionIds) {
    const session = value.sessions[id];
    if (!session || typeof session !== 'object' || Array.isArray(session) || session.session_id !== id || !PUBKEY.test(session.creator || '') ||
        !Number.isSafeInteger(session.created_at) || session.created_at < 0 || !['invited', 'dkg', 'ready', 'aborted'].includes(session.status)) {
      throw new Error('xno-threshold-session-invalid');
    }
    if (Buffer.byteLength(JSON.stringify(session), 'utf8') > 256 * 1024) throw new Error('xno-threshold-session-too-large');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 3 * 1024 * 1024) throw new Error('xno-threshold-state-too-large');
  return value;
}

export function createEncryptedXnoThresholdStore({ file, pubkey, password, read = filePath => readJson(filePath, { maxBytes: MAX_FILE_BYTES }), write = writePrivateJson }) {
  if (typeof file !== 'string' || !file || !PUBKEY.test(pubkey || '') || typeof password !== 'string' || !password ||
      typeof read !== 'function' || typeof write !== 'function') throw new Error('xno-threshold-store-invalid');
  return Object.freeze({
    async load() {
      let envelope;
      try { envelope = await read(file); }
      catch (error) { if (error.code === 'ENOENT') return emptyXnoThresholdState(); throw error; }
      return validateXnoThresholdState(openEncryptedPayload(envelope, pubkey, password, CONTEXT));
    },
    async save(value) {
      const state = validateXnoThresholdState(value);
      await write(file, createEncryptedPayload(state, pubkey, password, CONTEXT));
    },
  });
}
