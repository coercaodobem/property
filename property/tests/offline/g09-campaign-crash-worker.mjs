#!/usr/bin/env node
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createCampaignEngine } from '../../relay/campaign-engine.mjs';

const [mode, fixturePath, stateDir, relayUrl] = process.argv.slice(2);
assert.ok(['accept', 'publish', 'inspect-pending', 'inspect'].includes(mode));
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(new URL('../../web/vendor/nostr-tools-2.25.2.bundle.js', import.meta.url), 'utf8'), context, { timeout: 5000 });

function evaluate(source, value) {
  context.g09Input = JSON.stringify(value);
  return JSON.parse(vm.runInContext(source, context, { timeout: 5000 }));
}
const verifyEvent = event => evaluate('NostrTools.verifyEvent(JSON.parse(g09Input))', event);
const signEvent = (identity, draft) => evaluate(`(() => { const x=JSON.parse(g09Input); return JSON.stringify(NostrTools.finalizeEvent({kind:x.draft.kind,content:x.draft.content,tags:x.draft.tags,created_at:x.draft.created_at},Uint8Array.from(x.secret))); })()`,
  { draft, secret: identity.secret });

let publicationCalls = 0;
function publish(event) {
  publicationCalls++;
  const socket = new WebSocket(relayUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('local relay ACK timed out')); }, 8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      if (frame[0] !== 'OK' || frame[1] !== event.id) return;
      clearTimeout(timer); socket.close(); resolve({ accepted: frame[2] === true, message: String(frame[3] || '') });
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('local relay connection failed')); }, { once: true });
  });
}
const node = fixture.node;
const engine = createCampaignEngine({
  stateDir,
  nodePubkey: node.pubkey,
  verifyEvent,
  signEvent: draft => signEvent(node, draft),
  addressProvider: async ({ campaignId, currency }) => `${currency}-offline-${node.pubkey.slice(0, 10)}-${campaignId}`,
  ledger: {
    async lookupPayment({ address, currency }) {
      if (mode === 'accept' || mode === 'inspect-pending') return null;
      return { address, currency, amount_atomic: '1', txid: 'a'.repeat(64), confirmations: 1, proof: true };
    },
    async refundPayment() { return { confirmed: false }; }
  },
  publishEvent: publish,
  policy: { currencies: ['XNO'], minConfirmations: 1 }
});

if (mode === 'accept') {
  const result = await engine.decide(fixture.offer);
  assert.equal(result.record.status, 'awaiting_payment');
  process.stdout.write(`READY accepted ${result.record.status}\n`);
  setInterval(() => {}, 60_000);
} else if (mode === 'publish') {
  const result = await engine.reconcile(fixture.campaign_id);
  assert.equal(result.status, 'published');
  assert.equal(result.event?.kind, 30078);
  process.stdout.write(`READY published ${result.event.id}\n`);
  setInterval(() => {}, 60_000);
} else {
  const result = await engine.reconcile(fixture.campaign_id);
  process.stdout.write(JSON.stringify({ status: result.status, publication_calls: publicationCalls,
    event_id: result.event?.id || result.record?.campaign_event?.id || null }) + '\n');
}
