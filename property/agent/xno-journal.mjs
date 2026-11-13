import { createEncryptedPayload, openEncryptedPayload } from './vault.mjs';
import { readJson, writePrivateJson } from './store.mjs';
import { emptyXnoJournal, validateXnoJournal } from './xno-trades.mjs';

const CONTEXT = 'xno-journal';
const MAX_ENCRYPTED_JOURNAL_BYTES = 512 * 1024;

export function createEncryptedXnoJournalStore({ file, pubkey, password, read = filePath => readJson(filePath, { maxBytes: MAX_ENCRYPTED_JOURNAL_BYTES }), write = writePrivateJson }) {
  if (typeof file !== 'string' || !file || !/^[0-9a-f]{64}$/.test(pubkey || '') || typeof password !== 'string' ||
      typeof read !== 'function' || typeof write !== 'function') throw new Error('xno-journal-store-invalid');

  return Object.freeze({
    async load() {
      let envelope;
      try { envelope = await read(file); }
      catch (error) { if (error.code === 'ENOENT') return emptyXnoJournal(); throw error; }
      return validateXnoJournal(openEncryptedPayload(envelope, pubkey, password, CONTEXT));
    },
    async save(value) {
      const journal = validateXnoJournal(value);
      const envelope = createEncryptedPayload(journal, pubkey, password, CONTEXT);
      await write(file, envelope);
    },
  });
}
