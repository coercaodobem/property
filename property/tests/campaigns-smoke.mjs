import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/protocol-contract.js', '../web/money.js', '../web/campaigns.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}
const N = context.NostrTools;
const C = context.PropertyCampaigns;
const secret = N.generateSecretKey();
const node = N.getPublicKey(secret);
const now = 1_800_000_000;
const raw = '1000000000000000000000000000000';
const ids = { offer_event_id: 'a'.repeat(64), acceptance_event_id: 'b'.repeat(64), payment_tx_id: 'c'.repeat(64) };

function campaign(overrides = {}, tags = [['t', C.TAG], ['d', 'property-sponsored-v2:123e4567-e89b-42d3-a456-426614174000']]) {
  const payload = {
    schema: C.TAG, title: 'Node da comunidade', body: 'Suporte local e relays estáveis.', link: 'https://example.org/campanha',
    image_data: '', currency: 'XNO', amount_atomic: raw, expires_at: now + 30 * 24 * 60 * 60, ...ids, ...overrides
  };
  context.campaignTemplateJson = JSON.stringify({ kind: C.KIND, created_at: now, pubkey: node, tags, content: JSON.stringify(payload) });
  context.campaignSecretHex = Buffer.from(secret).toString('hex');
  return vm.runInContext('NostrTools.finalizeEvent(JSON.parse(campaignTemplateJson), Uint8Array.from(campaignSecretHex.match(/.{2}/g), value => parseInt(value, 16)))', context, { timeout: 5000 });
}

const valid = campaign();
const parsed = C.parseSponsoredCampaign(valid, N.verifyEvent, now);
assert.equal(parsed.nodePubkey, node);
assert.equal(parsed.amountAtomic, raw, 'raw XNO is preserved as an exact integer string');
assert.equal(parsed.link, 'https://example.org/campanha');
assert.equal(C.parseSponsoredCampaign(campaign({ schema: 'property-sponsored-v3' }), N.verifyEvent, now), null, 'unknown sponsorship schemas are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ schema: undefined }), N.verifyEvent, now), null, 'v2 sponsorship events require an explicit schema');
const inlineImage = C.parseSponsoredCampaign(campaign({ image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }), N.verifyEvent, now);
assert.equal(inlineImage.imageData, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', 'bounded inline PNG data is accepted');
const tampered = JSON.parse(JSON.stringify(valid));
tampered.content = tampered.content.replace('Node da comunidade', 'alterado');
assert.equal(C.parseSponsoredCampaign(tampered, N.verifyEvent, now), null, 'signature tampering is rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ link: 'http://example.org/' }), N.verifyEvent, now), null, 'non-HTTPS campaign links are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ link: 'https://user:secret@example.org/' }), N.verifyEvent, now), null, 'embedded URL credentials are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ link: 'https://127.0.0.1/' }), N.verifyEvent, now), null, 'literal IPv4 destinations are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ link: 'https://2130706433/' }), N.verifyEvent, now), null, 'integer-form IPv4 destinations are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ amount_atomic: '0' }), N.verifyEvent, now), null, 'zero amount campaigns are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ amount_atomic: (1n << 128n).toString() }), N.verifyEvent, now), null, 'amounts outside Nano uint128 are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ expires_at: now }), N.verifyEvent, now), null, 'expired campaigns are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ expires_at: now + 31 * 24 * 60 * 60 }), N.verifyEvent, now), null, 'campaigns over 30 days are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ image_data: 'data:image/svg+xml;base64,PHN2Zz4=' }), N.verifyEvent, now), null, 'active SVG images are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({ image_data: `data:image/png;base64,${'iVBORw0KGgo'.padEnd(180_100, 'A')}` }), N.verifyEvent, now), null, 'oversized payloads are rejected');
assert.equal(C.parseSponsoredCampaign(campaign({}, [['t', C.TAG], ['t', C.TAG]]), N.verifyEvent, now), null, 'ambiguous marker tags are rejected');

const second = campaign({ title: 'Outra campanha' }, [['t', C.TAG], ['d', 'property-sponsored-v2:123e4567-e89b-42d3-a456-426614174001']]);
assert.equal(C.selectSponsoredCampaigns([valid, second], N.verifyEvent, { nowSeconds: now, maxCount: 5 }).length, 2);
assert.equal(C.selectSponsoredCampaigns([valid], N.verifyEvent, { nowSeconds: now, blockedNodes: [node] }).length, 0, 'blocked node is hidden locally');
const exposures = C.recordExposure({}, 'property-sponsored-v2:123e4567-e89b-42d3-a456-426614174000', now);
assert.equal(C.selectSponsoredCampaigns([valid], N.verifyEvent, { nowSeconds: now + 60, exposures }).length, 0, 'campaign is capped for 24 hours on this device');
assert.equal(C.selectSponsoredCampaigns([valid], N.verifyEvent, { nowSeconds: now + C.EXPOSURE_WINDOW_SECONDS + 1, exposures }).length, 1, 'campaign can reappear after the local cap');

const bitcoin = C.parseSponsoredCampaign(campaign({ currency: 'BTC', amount_atomic: '1' }), N.verifyEvent, now);
assert.equal(bitcoin.currency, 'BTC');
assert.equal(bitcoin.amountAtomic, '1');
assert.equal(C.parseSponsoredCampaign(campaign({ currency: 'BTC', amount_atomic: '2100000000000001' }), N.verifyEvent, now), null);
const monero = C.parseSponsoredCampaign(campaign({ currency: 'XMR', amount_atomic: '1' }), N.verifyEvent, now);
assert.equal(monero.amountAtomic, '1');
assert.equal(monero.currency, 'XMR');
assert.equal(C.parseSponsoredCampaign(campaign({ currency: 'XMR', amount_atomic: (1n << 64n).toString() }), N.verifyEvent, now), null);
assert.equal(C.parseSponsoredCampaign(campaign({ currency: 'USD' }), N.verifyEvent, now), null);
assert.equal(C.parseSponsoredCampaign(campaign({ amount_raw: raw }), N.verifyEvent, now), null, 'v2 rejects mixed units');
const legacy = campaign({ schema: 'liberdade-sponsored-v1', currency: undefined, amount_atomic: undefined, amount_raw: raw, payment_tx_id: undefined, payment_block_hash: 'c'.repeat(64) }, [['t', 'liberdade-sponsored-v1'], ['d', 'liberdade-sponsored-v1:123e4567-e89b-42d3-a456-426614174000']]);
assert.equal(C.parseSponsoredCampaign(legacy, N.verifyEvent, now).currency, 'XNO');
const ambiguousLegacy = campaign({ currency: 'XMR', amount_raw: raw, payment_block_hash: 'c'.repeat(64) }, legacy.tags);
assert.equal(C.parseSponsoredCampaign(ambiguousLegacy, N.verifyEvent, now), null);
console.log('PASS: campanhas assinadas, raw exato, URLs/imagens limitadas, expiração, bloqueio local e limite de exposição');
