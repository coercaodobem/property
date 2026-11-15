# Property Protocol Contract v1

Status: normative for the Property parsers and writers covered by this contract. It describes current wire formats and bounded behavior; it does not turn relay acknowledgements or wallet observations into consensus.

## Serialization and parsing

Nostr event IDs follow NIP-01: SHA-256 over the UTF-8 encoding of `[0, pubkey, created_at, kind, tags, content]`. Signature verification checks that ID and the Schnorr signature. Property JSON payload writers sort object keys by JavaScript code-unit order, preserve array order, and emit compact UTF-8 JSON. They accept only plain objects, arrays, strings, booleans, null, finite JSON numbers, and safe integers where a number is integral. Currency amounts used for decisions are canonical decimal strings; display-only NIP-15 decimals must agree exactly with the atomic value. Text is not Unicode-normalized because normalization would change signed bytes.

Readers accept bounded legacy JSON with a different object-key order. Duplicate keys, malformed JSON, excessive depth/size, noncanonical or ambiguous amounts, and unsupported critical versions are rejected before state changes. Re-serialization always uses the canonical form. Event family limits and supported kinds are recorded in [protocol-versions.json](protocol-versions.json) and implemented by `property/agent/protocol-contract.mjs`; the browser uses the same canonical JSON rules from `property/web/protocol-contract.js`.

`property-crit` is a Property extension tag whose values name tags the reader must understand. A missing or unknown critical tag rejects the event. An unmarked unknown Nostr tag stays part of the original signed event and is ignored by readers that do not understand it. Nostr has no global version-negotiation handshake: Property's local negotiation intersects advertised protocol identifiers with the supported registry. A custom payload's `protocol` or `schema` value is critical and must match a registered identifier exactly.

## Wire families

| Family | Existing Nostr wire format | Property contract IDs | Limit |
| --- | --- | --- | --- |
| Identity claim | NIP-39, kind 10011 | `nostr-nip39-kind-10011/v1` | 16 KiB content, 64 tags |
| Private message | NIP-17/NIP-59 gift wrap, kind 1059 | `nostr-nip17-nip59/v1` | 32 KiB content, 8 tags |
| Public note | NIP-01, kind 1 | `nostr-nip01-kind-1/v1` | 16 KiB content, 128 tags |
| Marketplace | NIP-15 stall/product, kinds 30017/30018 | `nostr-nip15-kind-30018/v1` | 16 KiB content, 32 tags |
| Trade state | NIP-17 envelope, kind 1059 | XNO trade v1, XNO escrow v1, threshold v2 | 24 KiB content, 16 tags |
| Campaign sponsorship | Property replaceable events, kinds 30078/30079/30080/30082 | campaign offer/decision/refund v1; sponsored v2 | 200,000-byte event content, 16 tags; offer/refund payload parsers impose 16 KiB |
| Relay discovery | NIP-02 kind 3, NIP-65 kind 10002, NIP-17 inbox kind 10050 | corresponding Nostr family IDs | 8 KiB content, 512 tags |

These limits are Property acceptance limits, not claims about what every Nostr relay accepts. Event bounds are checked before signature verification or state mutation. Unknown noncritical tags remain interoperable with ordinary Nostr clients. Property-specific protocols stay inside signed Nostr events or encrypted NIP-17 payloads; they do not replace standard note, profile, or gift-wrap event kinds.

## Version and conflict rules

- Standard Nostr families use the pinned protocol snapshots in `property/docs/protocol-snapshots/nostr/`; a standards update is a reviewed source change, not a runtime download.
- Custom payloads identify their schema in `protocol` or `schema`. Unknown critical versions fail closed; no silent downgrade occurs.
- `property-xno-threshold/v1` cannot authorize v2 signing. It is rejected and requires a new v2 session.
- New campaign publication uses `property-sponsored-v2`. A legacy sponsored-v1 record can be displayed only by a reader that explicitly supports it; it cannot authorize a new payment or transition.
- NIP-15 decimal display values are accepted only if they convert exactly to the declared BTC, XMR, or XNO atomic string. Conflicts fail closed.
- Identical event IDs deduplicate. A same-ID/different-content input is equivocation and is rejected. For replaceable events, latest `created_at` wins; equal timestamps choose the lexicographically lower event ID as NIP-01 specifies. Deletion events remain author-scoped and follow NIP-09 rules.
- Idempotency keys bind a financial action to its trade/campaign identity and exact terms. Replaying an event may return the saved result but must not initiate a second transfer/refund/publication.

Atomic amounts are positive base-10 integer strings without leading zeros: BTC uses satoshis (maximum `2100000000000000`), XMR uses piconero (maximum `18446744073709551615`), and XNO uses raw (maximum `340282366920938463463374607431768211455`). Ticker aliases, decimal amounts without a currency, cross-currency conversions, negative values, and floating-point values are rejected.

## Security and privacy claims

- A valid signature proves that the corresponding private key signed the event bytes and that those bytes were not changed. It does not prove a human identity, ownership of an external account, truth, or authority over a payment address.
- NIP-17/NIP-59 encryption protects message content for intended keys. Relays and network observers can still learn routing metadata, IP addresses, timing, sizes, and traffic patterns. An ACK means a relay accepted an event; it does not prove global propagation, recipient delivery, display, or reading.
- Public notes, profile events, marketplace offers, and relay lists are public signed events. Signatures do not make their contents private or true.
- A BTC/XMR/XNO trade intent, receipt message, or claimed transaction ID is not payment proof. A configured local wallet/node observation proves only the evidence returned and checked by that adapter.
- Nano consensus does not enforce escrow, delivery, refunds, arbitration, or a binding between a Nostr identity and a Nano account. Property's XNO threshold protocol is experimental and dev-only; it is not trustless Nano escrow.

## Test contract

`property/tests/protocol-contract-g1.mjs` uses fixed seeds and local code only. It exercises 100 vectors per event family; 100 malformed payloads per family parser; critical/unknown version behavior; amount boundaries; and 50 duplicate plus 50 reordered copies for each replaceable-event fixture. Existing campaign and XNO service tests separately assert that repeated status/refund/receipt operations do not repeat payment actions. No public relay or wallet RPC is contacted.

See [the Portuguese contract](protocol-contract-v1.pt-BR.md) for the equivalent explanation.
