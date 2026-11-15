# Property marketplace offer adapter

**Adapter ID:** `property-marketplace-offer/v1`
**Nostr event family:** NIP-15 draft `kind:30017` stall and `kind:30018` product
**Implementation:** `property/web/marketplace.js` and `property/web/app.js`

NIP-15 is a draft marked as not recommended. Property keeps its event kinds and addressable `d` identifier, but publishes new product events using the versioned content schema below. A Nostr signature binds the listing to its event public key; it does not establish a real-world identity or prove control of a payment account.

## Version 1 content

New `kind:30018` content includes:

| Field | Rule |
| --- | --- |
| `schema` | Exact string `property-marketplace-offer/v1`; unknown values are rejected. |
| `id`, `stall_id` | Non-empty strings; `id` must match the sole `d` tag. |
| `offer_type` | `item` or `service`. |
| `name`, `terms`, `description` | Human-readable listing fields. `terms` and `description` must match. |
| `seller_pubkey` | Must equal the signed event's `pubkey`; this is a Nostr key claim, not a legal identity check. |
| `currency`, `price_atomic` | Currency is exactly `BTC`, `XMR`, or `XNO`; amount is a canonical non-negative integer string in satoshi, piconero, or raw. Zero means a free offer and cannot authorize a payment. |
| `price` | NIP-15 numeric compatibility projection of `price_atomic`; clients must never calculate or settle from it. |
| `price_raw` | Published for XNO only and must equal `price_atomic`. It is not a Monero unit. |
| `payment_rail` | Seller declaration: `bitcoin-onchain`, `monero-onchain`, or `nano-direct`, matching the currency. It does not prove wallet ownership or payment. |
| `expires_at` | Unix seconds, or `null`. A non-null value must match exactly one Nostr `expiration` tag; `null` requires no such tag. |
| `relay_hints` | Up to five `wss://` URLs. Only secure-websocket hints are published; test/local `ws://` relays are omitted. |
| `contact_event` | `null` in v1. Opening a private conversation publishes no public contact event; Property will not invent one or link private activity into the offer. |
| `images` | Zero or one safe HTTPS image URL. |

The exact amount is rendered and validated from `price_atomic`. A binary floating-point value is kept only because the NIP-15 draft requires a numeric `price`; values that cannot fit the compatibility storefront range are rejected instead of rounded into a payment amount. `quantity`, `specs`, and `shipping` remain NIP-15 compatibility fields and do not establish stock, delivery, or settlement.

## Reading older events

Versionless NIP-15 listings are a display-only compatibility path. Property requires a supported currency and an exact amount extension (`price_atomic`, or XNO `price_raw` under the legacy rule); it does not infer a currency, reinterpret an arbitrary draft field, or convert the floating-point `price` into atomics. If both XNO amount fields exist, they must match. An unknown `schema`, amount mismatch, unsupported currency, duplicate address/expiry tag, invalid signature, or unsafe amount is ignored without changing offer state.

Editing keeps the same `d` address. Withdrawal is a signed NIP-09 deletion request; relays or other clients may keep old copies. Across equal timestamps, clients select the offer with the lexicographically lowest event ID. A newer same-author event wins, and a same-author deletion applies only to the referenced address/event and only when its timestamp is not older. Unrelated listings remain visible.

## Scope boundary

The marketplace supports public discovery, contact, publication, edits, expiry, and withdrawal requests. It does not implement checkout, payment custody, escrow, or proof of delivery. A declared rail or signed offer is not proof that the seller controls a wallet or will deliver. A contact button opens the seller's private conversation but does not send a message or expose that action in a public event.

The fixed-count contract tests are in `property/tests/offline/marketplace-g6-fixed-count.mjs`; browser and five-relay evidence is recorded in `property/docs/evidence/product-completion/G6/gate-result.md` after the gate run.
