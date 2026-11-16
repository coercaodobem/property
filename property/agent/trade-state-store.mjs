import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createEncryptedPayload, openEncryptedPayload } from './vault.mjs';
import { readJson, writePrivateJson } from './store.mjs';
import { emptyTradeJournal } from './trade-state.mjs';

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const CONTEXT = 'trade-state-journal';

export function createTradeEvidenceSigner(seedHex) {
  if (typeof seedHex !== 'string' || !/^[0-9a-f]{64}$/.test(seedHex)) throw new Error('trade-evidence-seed-invalid');
  const seed = Buffer.from(seedHex, 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  seed.fill(0);
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const pubkey = createHash('sha256').update(publicDer).digest('hex');
  return Object.freeze({ pubkey, sign: async message => sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64'),
    verify: async (expectedPubkey, message, signature) => {
      if (expectedPubkey !== pubkey || typeof signature !== 'string') return false;
      try { return verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signature, 'base64')); }
      catch { return false; }
    } });
}

export function createEncryptedTradeJournalStore({ file, pubkey, password }) {
  if (typeof file !== 'string' || !file || !/^[0-9a-f]{64}$/.test(pubkey || '') || typeof password !== 'string') throw new Error('trade-journal-store-invalid');
  return Object.freeze({
    async load() {
      try {
        const envelope = await readJson(file, { maxBytes: 4 * 1024 * 1024 });
        const journal = openEncryptedPayload(envelope, pubkey, password, CONTEXT);
        if (!journal || journal.schema !== 'property-trade-journal/v1' || journal.version !== 1 || !journal.trades || typeof journal.trades !== 'object' || Array.isArray(journal.trades)) {
          throw new Error('trade-journal-invalid');
        }
        return journal;
      } catch (error) { if (error.code === 'ENOENT') return emptyTradeJournal(); throw error; }
    },
    async save(journal) {
      if (!journal || journal.schema !== 'property-trade-journal/v1' || journal.version !== 1 || !journal.trades || typeof journal.trades !== 'object' || Array.isArray(journal.trades)) {
        throw new Error('trade-journal-invalid');
      }
      await writePrivateJson(file, createEncryptedPayload(journal, pubkey, password, CONTEXT));
    }
  });
}
