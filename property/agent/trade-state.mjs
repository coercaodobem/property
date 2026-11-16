import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from './protocol-contract.mjs';

export const TRADE_STATE_PROTOCOL = 'property-trade-state/v1';
export const TRADE_STATES = Object.freeze([
  'offer', 'accepted', 'payment-requested', 'payment-observed', 'settled',
  'expired', 'disputed', 'cancelled', 'payment-reorged'
]);

const CURRENCIES = Object.freeze({
  BTC: { network: 'regtest', max: 2_100_000_000_000_000n },
  XMR: { network: 'fakechain', max: (1n << 64n) - 1n },
  XNO: { network: 'dev', max: (1n << 128n) - 1n }
});
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/i;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_EVENTS_PER_TRADE = 512;
const MAX_TRADES = 10_000;
const TRADE_KEYS = ['trade_id', 'currency', 'network', 'amount_atomic', 'seller_pubkey', 'buyer_pubkey', 'destination',
  'terms_sha256', 'created_at', 'expires_at', 'state', 'payment', 'events'];

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function exactObject(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function atomicAmount(currency, value) {
  const limit = CURRENCIES[currency]?.max;
  if (!limit || typeof value !== 'string' || !/^[1-9]\d{0,38}$/.test(value)) throw new Error('trade-amount-invalid');
  const amount = BigInt(value);
  if (amount < 1n || amount > limit) throw new Error('trade-amount-invalid');
  return amount.toString();
}
function validPubkey(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function snapshot(trade) {
  return Object.fromEntries(TRADE_KEYS.filter(key => key !== 'events').map(key => [key, structuredClone(trade[key])]));
}
function networkPolicy(currency, network) {
  if (!CURRENCIES[currency] || network !== CURRENCIES[currency].network) throw new Error('trade-network-disabled');
}
function validPaymentShape(payment) {
  const keys = ['currency', 'address', 'amount_atomic', 'txid', 'confirmations', 'proof'];
  return (exactObject(payment, keys) || exactObject(payment, [...keys, 'network'])) &&
    typeof payment.currency === 'string' && (payment.network === undefined || typeof payment.network === 'string') && typeof payment.address === 'string' &&
    typeof payment.amount_atomic === 'string' && HEX_64.test(payment.txid || '') && Number.isSafeInteger(payment.confirmations) &&
    payment.confirmations >= 0 && typeof payment.proof === 'boolean';
}

export function emptyTradeJournal() {
  return { schema: 'property-trade-journal/v1', version: 1, trades: {} };
}

/**
 * A trade journal deliberately accepts authentication, signing and encrypted storage as dependencies.
 * `authorize` must validate the participant's authenticated protocol message; the local evidence
 * signature only identifies this journal's observer and is not a Nostr-to-wallet ownership proof.
 */
export function createTradeStateMachine({ adapters, localIdentityPubkey, signer, verifyEvidence, authorize, loadJournal, saveJournal,
  now = () => Math.floor(Date.now() / 1000), randomId = () => randomBytes(16).toString('hex') }) {
  if (!adapters || typeof adapters !== 'object' || !validPubkey(localIdentityPubkey) || !validPubkey(signer?.pubkey) || typeof signer.sign !== 'function' ||
      typeof verifyEvidence !== 'function' || typeof authorize !== 'function' || typeof loadJournal !== 'function' || typeof saveJournal !== 'function') {
    throw new Error('trade-machine-dependencies-invalid');
  }
  let queue = Promise.resolve();
  async function serialized(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }
  function adapterFor(currency) {
    const configured = adapters[currency];
    if (!configured || typeof configured.network !== 'string' || !configured.ledger ||
        typeof configured.ledger.createAddress !== 'function' || typeof configured.ledger.lookupPayment !== 'function' ||
        typeof configured.ledger.assertNetwork !== 'function' || !Number.isSafeInteger(configured.minConfirmations) || configured.minConfirmations < 1) {
      throw new Error('trade-adapter-not-configured');
    }
    networkPolicy(currency, configured.network);
    return configured;
  }
  async function readJournal() {
    const value = await loadJournal();
    if (!exactObject(value, ['schema', 'version', 'trades']) || value.schema !== 'property-trade-journal/v1' || value.version !== 1 ||
        !value.trades || typeof value.trades !== 'object' || Array.isArray(value.trades) || Object.keys(value.trades).length > MAX_TRADES) {
      throw new Error('trade-journal-invalid');
    }
    for (const [id, trade] of Object.entries(value.trades)) await validateTrade(id, trade);
    return structuredClone(value);
  }
  async function validateTrade(id, trade) {
    if (!HEX_32.test(id) || !exactObject(trade, TRADE_KEYS) || trade.trade_id !== id || !CURRENCIES[trade.currency] ||
        trade.network !== CURRENCIES[trade.currency].network || atomicAmount(trade.currency, trade.amount_atomic) !== trade.amount_atomic ||
        !validPubkey(trade.seller_pubkey) || !validPubkey(trade.buyer_pubkey) || trade.seller_pubkey === trade.buyer_pubkey ||
        typeof trade.destination !== 'string' || trade.destination.length < 8 || trade.destination.length > 256 ||
        !HEX_64.test(trade.terms_sha256 || '') || !Number.isSafeInteger(trade.created_at) || !Number.isSafeInteger(trade.expires_at) ||
        trade.expires_at <= trade.created_at || trade.expires_at - trade.created_at > MAX_TTL_SECONDS ||
        !TRADE_STATES.includes(trade.state) || !(trade.payment === null ||
          (exactObject(trade.payment, ['currency', 'network', 'address', 'amount_atomic', 'txid', 'confirmations', 'proof']) &&
            trade.payment.currency === trade.currency && trade.payment.network === trade.network && trade.payment.address === trade.destination &&
            atomicAmount(trade.currency, trade.payment.amount_atomic) === trade.payment.amount_atomic && HEX_64.test(trade.payment.txid || '') &&
            Number.isSafeInteger(trade.payment.confirmations) && trade.payment.confirmations >= 0 && trade.payment.proof === true)) ||
        (['payment-observed', 'settled'].includes(trade.state) && trade.payment === null) || !Array.isArray(trade.events) ||
        trade.events.length < 1 || trade.events.length > MAX_EVENTS_PER_TRADE) {
      throw new Error('trade-journal-invalid');
    }
    let previous = '0'.repeat(64);
    for (let index = 0; index < trade.events.length; index++) {
      const event = trade.events[index];
      const keys = ['protocol', 'trade_id', 'sequence', 'previous_hash', 'timestamp', 'action', 'state', 'actor_pubkey',
        'signer_pubkey', 'snapshot', 'evidence', 'signature', 'hash'];
      if (!exactObject(event, keys) || event.protocol !== TRADE_STATE_PROTOCOL || event.trade_id !== id || event.sequence !== index + 1 ||
          event.previous_hash !== previous || !Number.isSafeInteger(event.timestamp) || typeof event.action !== 'string' ||
          !TRADE_STATES.includes(event.state) || !validPubkey(event.actor_pubkey) || event.signer_pubkey !== signer.pubkey ||
          !exactObject(event.snapshot, TRADE_KEYS.filter(key => key !== 'events')) || typeof event.signature !== 'string' ||
          !HEX_64.test(event.hash || '')) throw new Error('trade-journal-invalid');
      const unsigned = Object.fromEntries(Object.entries(event).filter(([key]) => !['signature', 'hash'].includes(key)));
      const serializedEvent = canonicalJson(unsigned, 32 * 1024);
      if (!await verifyEvidence(event.signer_pubkey, serializedEvent, event.signature)) throw new Error('trade-journal-signature-invalid');
      const eventHash = digest(canonicalJson({ ...unsigned, signature: event.signature }, 32 * 1024));
      if (eventHash !== event.hash) throw new Error('trade-journal-hash-invalid');
      previous = event.hash;
      if (index === trade.events.length - 1 && canonicalJson(event.snapshot, 16 * 1024) !== canonicalJson(snapshot(trade), 16 * 1024)) {
        throw new Error('trade-journal-snapshot-invalid');
      }
    }
  }
  async function append(journal, trade, action, actorPubkey, evidence = {}) {
    if (trade.events.length >= MAX_EVENTS_PER_TRADE) throw new Error('trade-event-limit');
    const last = trade.events.at(-1);
    const unsigned = { protocol: TRADE_STATE_PROTOCOL, trade_id: trade.trade_id, sequence: trade.events.length + 1,
      previous_hash: last?.hash || '0'.repeat(64), timestamp: now(), action, state: trade.state,
      actor_pubkey: actorPubkey, signer_pubkey: signer.pubkey, snapshot: snapshot(trade), evidence: structuredClone(evidence) };
    const serializedEvent = canonicalJson(unsigned, 32 * 1024);
    const signature = await signer.sign(serializedEvent);
    if (typeof signature !== 'string' || !signature) throw new Error('trade-evidence-signature-invalid');
    const hash = digest(canonicalJson({ ...unsigned, signature }, 32 * 1024));
    trade.events.push({ ...unsigned, signature, hash });
    journal.trades[trade.trade_id] = trade;
  }
  async function save(journal) { await saveJournal(structuredClone(journal)); }
  async function authorizeActor(action, trade, actorPubkey, authorization, expectedRole) {
    const role = actorPubkey === trade.seller_pubkey ? 'seller' : actorPubkey === trade.buyer_pubkey ? 'buyer' : '';
    if (!role || (expectedRole && role !== expectedRole) || !await authorize({ action, trade: snapshot(trade), actor_pubkey: actorPubkey, role, authorization })) {
      throw new Error('trade-participant-authentication-failed');
    }
    return role;
  }
  function requireTrade(journal, tradeId) {
    if (!HEX_32.test(tradeId || '') || !journal.trades[tradeId]) throw new Error('trade-not-found');
    return journal.trades[tradeId];
  }

  return Object.freeze({
    policy() {
      return { protocol: TRADE_STATE_PROTOCOL, configured: Object.keys(adapters).filter(currency => CURRENCIES[currency]),
        enabled_test_networks: { BTC: 'regtest', XMR: 'fakechain', XNO: 'dev' }, mainnet_enabled: false,
        wallet_identity_binding: 'unverified-claim', confirmation_semantics: 'adapter-specific' };
    },
    async createOffer(input) {
      return serialized(async () => {
        const keys = ['trade_id', 'currency', 'amount_atomic', 'seller_pubkey', 'buyer_pubkey', 'terms', 'expires_at'];
        if (!exactObject(input, keys) || !HEX_32.test(input.trade_id || '') || !CURRENCIES[input.currency] ||
            !validPubkey(input.seller_pubkey) || input.seller_pubkey !== localIdentityPubkey || !validPubkey(input.buyer_pubkey) ||
            input.buyer_pubkey === input.seller_pubkey || typeof input.terms !== 'string' || Buffer.byteLength(input.terms, 'utf8') < 1 ||
            Buffer.byteLength(input.terms, 'utf8') > 4096 || !Number.isSafeInteger(input.expires_at)) throw new Error('trade-offer-invalid');
        const amount = atomicAmount(input.currency, input.amount_atomic);
        const currentTime = now();
        if (input.expires_at <= currentTime || input.expires_at - currentTime > MAX_TTL_SECONDS) throw new Error('trade-expiry-invalid');
        const adapter = adapterFor(input.currency);
        await adapter.ledger.assertNetwork();
        const journal = await readJournal();
        const termsHash = digest(input.terms);
        const existing = journal.trades[input.trade_id];
        if (existing) {
          if (existing.currency !== input.currency || existing.amount_atomic !== amount || existing.seller_pubkey !== input.seller_pubkey ||
              existing.buyer_pubkey !== input.buyer_pubkey || existing.terms_sha256 !== termsHash || existing.expires_at !== input.expires_at) {
            throw new Error('trade-idempotency-conflict');
          }
          return { ...structuredClone(existing), duplicated: true };
        }
        const destination = await adapter.ledger.createAddress({ campaignId: `property-trade-${input.trade_id}` });
        if (typeof destination !== 'string' || destination.length < 8 || destination.length > 256) throw new Error('trade-adapter-address-invalid');
        if (Object.values(journal.trades).some(item => item.currency === input.currency && item.network === adapter.network && item.destination === destination)) {
          throw new Error('trade-adapter-address-reused');
        }
        const trade = { trade_id: input.trade_id, currency: input.currency, network: adapter.network, amount_atomic: amount,
          seller_pubkey: input.seller_pubkey, buyer_pubkey: input.buyer_pubkey, destination, terms_sha256: termsHash,
          created_at: currentTime, expires_at: input.expires_at, state: 'offer', payment: null, events: [] };
        await append(journal, trade, 'offer', localIdentityPubkey, { terms_sha256: termsHash, wallet_identity_binding: 'unverified-claim' });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async receiveOffer(input) {
      return serialized(async () => {
        const keys = ['trade_id', 'currency', 'network', 'amount_atomic', 'seller_pubkey', 'buyer_pubkey', 'destination',
          'terms_sha256', 'created_at', 'expires_at', 'actor_pubkey', 'authorization'];
        if (!exactObject(input, keys) || !HEX_32.test(input.trade_id || '') || !CURRENCIES[input.currency] ||
            input.network !== CURRENCIES[input.currency].network || !validPubkey(input.seller_pubkey) ||
            !validPubkey(input.buyer_pubkey) || input.seller_pubkey === input.buyer_pubkey ||
            input.buyer_pubkey !== localIdentityPubkey || input.actor_pubkey !== input.seller_pubkey ||
            typeof input.destination !== 'string' || input.destination.length < 8 || input.destination.length > 256 ||
            !HEX_64.test(input.terms_sha256 || '') || !Number.isSafeInteger(input.created_at) ||
            !Number.isSafeInteger(input.expires_at) || input.expires_at <= input.created_at ||
            input.expires_at - input.created_at > MAX_TTL_SECONDS || input.created_at > now() + 60) {
          throw new Error('trade-offer-invalid');
        }
        const trade = { trade_id: input.trade_id, currency: input.currency, network: input.network,
          amount_atomic: atomicAmount(input.currency, input.amount_atomic), seller_pubkey: input.seller_pubkey,
          buyer_pubkey: input.buyer_pubkey, destination: input.destination, terms_sha256: input.terms_sha256,
          created_at: input.created_at, expires_at: input.expires_at, state: 'offer', payment: null, events: [] };
        await authorizeActor('offer-received', trade, input.actor_pubkey, input.authorization, 'seller');
        const journal = await readJournal();
        const existing = journal.trades[input.trade_id];
        if (existing) {
          if (existing.currency !== trade.currency || existing.network !== trade.network || existing.amount_atomic !== trade.amount_atomic ||
              existing.seller_pubkey !== input.seller_pubkey || existing.buyer_pubkey !== input.buyer_pubkey ||
              existing.destination !== input.destination || existing.terms_sha256 !== input.terms_sha256 || existing.expires_at !== input.expires_at) {
            throw new Error('trade-idempotency-conflict');
          }
          return { ...structuredClone(existing), duplicated: true };
        }
        if (input.expires_at <= now()) throw new Error('trade-expiry-invalid');
        await append(journal, trade, 'offer-received', input.actor_pubkey,
          { terms_sha256: input.terms_sha256, wallet_identity_binding: 'unverified-claim', transport_authenticated: true });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async accept({ trade_id, actor_pubkey, authorization }) {
      return serialized(async () => {
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        await authorizeActor('accepted', trade, actor_pubkey, authorization, 'buyer');
        if (trade.state === 'accepted') return { ...structuredClone(trade), duplicated: true };
        if (trade.state !== 'offer' || now() >= trade.expires_at) throw new Error('trade-transition-invalid');
        trade.state = 'accepted';
        await append(journal, trade, 'accepted', actor_pubkey);
        await save(journal);
        return structuredClone(trade);
      });
    },
    async requestPayment({ trade_id, actor_pubkey, authorization }) {
      return serialized(async () => {
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        await authorizeActor('payment-requested', trade, actor_pubkey, authorization, 'seller');
        if (trade.state === 'payment-requested') return { ...structuredClone(trade), duplicated: true };
        if (trade.state !== 'accepted' || now() >= trade.expires_at) throw new Error('trade-transition-invalid');
        trade.state = 'payment-requested';
        await append(journal, trade, 'payment-requested', actor_pubkey, { address: trade.destination, amount_atomic: trade.amount_atomic });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async receivePaymentRequest(input) {
      return serialized(async () => {
        if (!exactObject(input, ['trade_id', 'actor_pubkey', 'network', 'amount_atomic', 'destination', 'authorization']) ||
            !HEX_32.test(input.trade_id || '') || !validPubkey(input.actor_pubkey) || typeof input.network !== 'string' ||
            typeof input.destination !== 'string' || typeof input.amount_atomic !== 'string') throw new Error('trade-payment-request-invalid');
        const journal = await readJournal(), trade = requireTrade(journal, input.trade_id);
        await authorizeActor('payment-requested', trade, input.actor_pubkey, input.authorization, 'seller');
        if (input.network !== trade.network || input.amount_atomic !== trade.amount_atomic || input.destination !== trade.destination) {
          throw new Error('trade-payment-request-mismatch');
        }
        if (trade.state === 'payment-requested') return { ...structuredClone(trade), duplicated: true };
        if (trade.state !== 'accepted' || now() >= trade.expires_at) throw new Error('trade-transition-invalid');
        trade.state = 'payment-requested';
        await append(journal, trade, 'payment-requested', input.actor_pubkey,
          { destination_sha256: digest(trade.destination), amount_atomic: trade.amount_atomic, network: trade.network, transport_authenticated: true });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async reconcile({ trade_id }) {
      return serialized(async () => {
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        if (!['payment-requested', 'payment-observed', 'settled', 'payment-reorged', 'expired'].includes(trade.state)) {
          throw new Error('trade-transition-invalid');
        }
        const adapter = adapterFor(trade.currency);
        let payment;
        try {
          await adapter.ledger.assertNetwork();
          payment = await adapter.ledger.lookupPayment({ address: trade.destination, currency: trade.currency });
        } catch {
          return { ...structuredClone(trade), rpc_uncertain: true, retry_safe: true };
        }
        if (payment === null) {
          if (['payment-observed', 'settled'].includes(trade.state)) {
            const priorTxid = trade.payment?.txid || null;
            trade.state = 'payment-reorged'; trade.payment = null;
            await append(journal, trade, 'payment-reorged', signer.pubkey, { prior_txid: priorTxid });
            await save(journal);
          } else if (trade.state === 'payment-reorged') {
            return { ...structuredClone(trade), retry_safe: true };
          }
          return { ...structuredClone(trade), retry_safe: true };
        }
        if (payment && payment.confirmations < 0 && payment.currency === trade.currency && payment.address === trade.destination && HEX_64.test(payment.txid || '')) {
          const priorTxid = trade.payment?.txid || payment.txid.toLowerCase();
          trade.state = 'payment-reorged'; trade.payment = null;
          await append(journal, trade, 'payment-reorged', signer.pubkey, { prior_txid: priorTxid, confirmations: payment.confirmations });
          await save(journal);
          return { ...structuredClone(trade), retry_safe: true };
        }
        if (!validPaymentShape(payment)) {
          trade.state = 'disputed'; trade.payment = null;
          await append(journal, trade, 'payment-invalid', signer.pubkey, { reason: 'malformed-adapter-proof' });
          await save(journal);
          return structuredClone(trade);
        }
        const observedNetwork = payment.network ?? adapter.network;
        const expiredBeforeObservation = trade.state === 'expired';
        const mismatch = payment.currency !== trade.currency || observedNetwork !== trade.network || payment.address !== trade.destination ||
          payment.amount_atomic !== trade.amount_atomic || payment.proof !== true;
        if (mismatch || expiredBeforeObservation) {
          trade.state = 'disputed'; trade.payment = null;
          await append(journal, trade, 'payment-disputed', signer.pubkey, { reason: expiredBeforeObservation ? 'payment-after-expiry' : 'payment-proof-mismatch',
            observed: { currency: payment.currency, network: observedNetwork, address_sha256: digest(payment.address), amount_atomic: payment.amount_atomic,
              txid: payment.txid, proof: payment.proof } });
          await save(journal);
          return structuredClone(trade);
        }
        const alreadyUsed = Object.values(journal.trades).some(item => item.trade_id !== trade.trade_id && item.payment?.txid === payment.txid.toLowerCase() &&
          item.payment?.address === payment.address && item.payment?.amount_atomic === payment.amount_atomic && item.state === 'settled');
        if (alreadyUsed) {
          trade.state = 'disputed'; trade.payment = null;
          await append(journal, trade, 'payment-duplicate-conflict', signer.pubkey, { txid: payment.txid });
          await save(journal);
          return structuredClone(trade);
        }
        if (trade.payment?.txid === payment.txid.toLowerCase() && trade.payment.amount_atomic === payment.amount_atomic &&
            trade.payment.confirmations === payment.confirmations && ['payment-observed', 'settled'].includes(trade.state)) {
          return { ...structuredClone(trade), duplicated: true };
        }
        trade.payment = { currency: payment.currency, network: observedNetwork, address: payment.address, amount_atomic: payment.amount_atomic,
          txid: payment.txid.toLowerCase(), confirmations: payment.confirmations, proof: true };
        trade.state = payment.confirmations >= adapter.minConfirmations ? 'settled' : 'payment-observed';
        await append(journal, trade, trade.state, signer.pubkey, { txid: trade.payment.txid, amount_atomic: payment.amount_atomic,
          destination_sha256: digest(payment.address), network: observedNetwork, confirmations: payment.confirmations,
          required_confirmations: adapter.minConfirmations, direct_payment_only: true });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async expire({ trade_id, actor_pubkey, authorization }) {
      return serialized(async () => {
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        await authorizeActor('expired', trade, actor_pubkey, authorization);
        if (trade.state === 'expired') return { ...structuredClone(trade), duplicated: true };
        if (!['offer', 'accepted'].includes(trade.state) || now() < trade.expires_at) throw new Error('trade-transition-invalid');
        trade.state = 'expired';
        await append(journal, trade, 'expired', actor_pubkey);
        await save(journal);
        return structuredClone(trade);
      });
    },
    async cancel({ trade_id, actor_pubkey, authorization }) {
      return serialized(async () => {
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        await authorizeActor('cancelled', trade, actor_pubkey, authorization);
        if (trade.state === 'cancelled') return { ...structuredClone(trade), duplicated: true };
        if (!['offer', 'accepted'].includes(trade.state)) throw new Error('trade-transition-invalid');
        trade.state = 'cancelled';
        await append(journal, trade, 'cancelled', actor_pubkey);
        await save(journal);
        return structuredClone(trade);
      });
    },
    async dispute({ trade_id, actor_pubkey, authorization, summary }) {
      return serialized(async () => {
        if (typeof summary !== 'string' || Buffer.byteLength(summary, 'utf8') < 1 || Buffer.byteLength(summary, 'utf8') > 2048) throw new Error('trade-dispute-invalid');
        const journal = await readJournal(), trade = requireTrade(journal, trade_id);
        await authorizeActor('disputed', trade, actor_pubkey, authorization);
        if (['disputed', 'cancelled'].includes(trade.state)) return { ...structuredClone(trade), duplicated: true };
        trade.state = 'disputed';
        await append(journal, trade, 'disputed', actor_pubkey, { summary_sha256: digest(summary) });
        await save(journal);
        return structuredClone(trade);
      });
    },
    async status({ trade_id }) {
      const journal = await readJournal();
      return structuredClone(requireTrade(journal, trade_id));
    },
    async verifyJournal() {
      const journal = await readJournal();
      return { valid: true, trades: Object.keys(journal.trades).length,
        events: Object.values(journal.trades).reduce((sum, trade) => sum + trade.events.length, 0), signer_pubkey: signer.pubkey };
    }
  });
}

/** Atomic mode-0600 JSON store. Callers handling private trade data should encrypt this store. */
export function createJsonTradeJournalStore(file) {
  const target = path.resolve(file);
  return Object.freeze({
    async load() {
      try { return JSON.parse(await readFile(target, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return emptyTradeJournal(); throw error; }
    },
    async save(value) {
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        await rename(temporary, target);
      } catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
    }
  });
}
