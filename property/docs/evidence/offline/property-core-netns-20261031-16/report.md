# Property offline test run

Run: property-core-netns-20261031-16
Profile: core
Candidate: 7aff8e448898e674f8448a2dd847a64faceda8cd
Observed HEAD matches candidate: true
Working-tree state SHA-256: 4bf211e6b1146415556b6f5cfa66104c05eec918d887d82cdbecff0bf6a20b41
Requested executor: Luna Max
Actual executor: Codex GPT-6
Actual executor source: Active Codex task runtime
Executor matches request: false
Isolation: PASS
Result: BLOCKED

## Gates
- G00: PASS
- G01: PASS
- G02: PASS
- G03: PASS
- G04: PASS
- G05: PASS
- G06: PASS
- G07: PASS
- G08: NOT_RUN
- G09: NOT_RUN
- G10: NOT_RUN
- G11: NOT_RUN
- G12: NOT_RUN

## Case totals
- PASS: 44
- NOT_RUN: 30

## Case results
- G00-01 — PASS: Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.
- G00-02 — PASS: Routes, firewall, proxy policy and loopback were checked without public probes.
- G00-03 — PASS: Two and seven real Geode relays completed with isolated loopback endpoints.
- G00-04 — PASS: Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.
- G01-01 — PASS: The local smoke runner completed.
- G01-02 — PASS: Bridge and native launcher integration both completed.
- G01-03 — PASS: Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.
- G02-01 — PASS: Pinned origins, local licenses, package hashes and asset locality passed; the missing cached Gradle distribution was recorded and no rebuild/download was attempted.
- G02-02 — PASS: Fresh root and /property/ pages loaded from the local bundle with no external HTTP, WebSocket or deny-proxy attempts.
- G02-03 — PASS: Remembered identity and the cached PWA shell reopened after the local server stopped; relay status remained offline.
- G02-04 — PASS: Complete update activated; interrupted and mixed packages were rejected while the previous shell, identity and unrelated cache remained available.
- G02-05 — PASS: Legacy backup and database restored the same identity/data; wrong-password/tampered imports and unavailable storage failed visibly without creating another account.
- G02-06 — PASS: CSP blocked remote script execution; malicious text stayed inert; the pinned local TLS/WSS endpoint worked and an untrusted certificate was rejected.
- G03-01 — PASS: A and B were created through the UI in separate persistent browser profiles with the same password; public keys differ and both vaults store encrypted key material without password/nsec fields.
- G03-02 — PASS: Persistent browser restart restored A only when requested; B required the correct password, rejected the wrong one without vault mutation, and manual lock cleared the session.
- G03-03 — PASS: The UI exported an encrypted backup and a clean context imported the same public identity; it could reopen the contact using the other person’s public npub.
- G03-04 — PASS: The public key shown in B profile opened A’s conversation; a valid nprofile preserved its local relay hint and did not connect automatically.
- G03-05 — PASS: Empty, truncated, name-only, nsec and self contacts were rejected in Portuguese without closing the dialog, creating the wrong contact or changing identity.
- G03-06 — PASS: Across creation, lock, backup and contact flows, only localhost assets were requested; passwords/private keys were absent from Web Storage and no central login/recovery request was observed.
- G04-01 — PASS: A, B and C published signed kind-10050 inbox lists through the UI; independent relay queries verified signatures and B’s two authorized inboxes.
- G04-02 — PASS: A and B exchanged real NIP-17 messages through Geode; both UI contexts decrypted the intended text, C received none, and relay storage contained only valid encrypted gift wraps.
- G04-03 — PASS: B closed, A sent through the real relay, and B recovered the queued NIP-17 message after two browser restarts with one UI copy.
- G04-04 — PASS: The live inbox carried messages when the second relay was down; all-inbox outage stayed pending; relay restart restored delivery; an intentional false ACK was caught by an independent query.
- G04-05 — PASS: The UI refused to send without the sender’s kind-10050 inbox list, emitted no fallback, and a real relay rejected a post-signature envelope mutation without storing it.
- G04-06 — PASS: The delivered corpus reconciled one-for-one in both browser databases and real relay storage; no plaintext, duplicate UI copy, third-party recipient or read receipt was observed.
- G05-01 — PASS: A signed public event traversed three actual PWA bridge contexts and four independent Geode relays in the R1→R2→R3→R4 chain; each hop and the final inbox were independently reconciled.
- G05-02 — PASS: Stopping P23 stopped new delivery at R2; restarting its PWA bridge replayed the eligible event through R3/R4. An accepted event older than the bridge age policy remained at its source.
- G05-03 — PASS: Diamond, cycle and star topologies delivered through independent real browser bridges; relay ID queries showed one stored copy, and stopping one diamond path preserved delivery over the other.
- G05-04 — PASS: Relay groups remained partitioned, then rejoined through a restarted P23. Two events published out of order reconciled once at R4; the expired fixture stayed excluded.
- G05-05 — PASS: Three non-recipient bridge identities did not forward B’s envelope. B’s real PWA bridge forwarded only B’s recipient wrap to B’s inbox; A’s sender copy followed A’s inbox when A was the bridge identity.
- G05-06 — PASS: UI toggle stopped and resumed the real PWA bridge. Module tests verified source exclusion, ID deduplication, signature/age boundaries, 60-event/minute cap and UTF-8 byte-based containment above 2 MB.
- G05-07 — PASS: Closing the mobile-sized browser context stopped its bridge while both independent Geode relays remained available; a reopened context resumed forwarding. This is desktop viewport emulation only and does not certify physical mobile suspension/background behavior.
- G06-01 — PASS: A signed public kind-1 post traversed the actual PWA bridge from R1 to R2. Buyer B saw the author, and the contact action selected that author in private-message navigation while the post remained public.
- G06-02 — PASS: The browser published, discovered, and edited one satoshi, one piconero, and one raw through two actual Geode relays and a real PWA bridge. Exact atomic strings, event authorship, stable d tags, signatures, and rendered prices survived each round-trip; currency maxima and overflow were checked.
- G06-03 — PASS: Seller withdrawal hid the offer even after the older signed event was replayed to R2. Geode rejected reinsertion under its deletion tombstone. Another author could not remove an offer; the client reducer ignored an older deletion timestamp without sending that fixture to the relay.
- G06-04 — PASS: Expired and future-timestamp, unknown-currency, malformed, and ambiguous-address listings were filtered. The browser blocked excess precision, overflow, and unsupported-currency submissions; unsafe image URLs were not linked or fetched, and injected markup remained literal text.
- G06-05 — PASS: Contact from the marketplace opened the correct seller conversation target without changing the displayed offer, publishing any payment/checkout/private-message event, or exposing a checkout control. The UI identifies NIP-15 as draft and states that payments/custody are not handled.
- G07-01 — PASS: The same signed offer was fetched from two independent Geode relays. Node A accepted under its XNO policy; node B independently rejected under its BTC-only policy. Both signed decisions persisted separately, and neither created a campaign before payment.
- G07-02 — PASS: The signed acceptance binds the offer ID, terms hash, currency, integer amount, exclusive address, deadline, refund terms, and node identity. Rejection contains no payment address. Edited decision signatures fail; a new altered offer using the same campaign ID is rejected without replacing the original accepted state.
- G07-03 — PASS: The persisted production engine traversed awaiting payment → unconfirmed → confirmed → published → expired using a deterministic ledger adapter. It also preserved node B’s rejection and reloaded the same accepted state after restart; expiry removed the campaign copy with a signed NIP-09 tombstone.
- G07-04 — PASS: Duplicate reconciliation after restart preserved one campaign event. Wrong amount, currency, or destination stayed in refund_due and never activated an ad. A signed advertiser refund request returned the exact observed amount; retry after engine restart used the ledger idempotency key and produced one debit.
- G07-05 — PASS: PWA campaigns were off on both devices until opt-in, rendered with a sponsored label in their own section, and stayed separate from Hangout posts. The 24-hour exposure cap, local node block, and distinct device preferences were verified through the PWA’s IndexedDB state.
- G07-06 — PASS: Campaign discovery and rendering generated no external HTTP requests, pixel, remote script, or proxy attempt. The HTTPS link opened only after an explicit click and was intercepted by an in-memory offline destination; relay sockets stayed on localhost.
- G07-07 — PASS: Node A and node B kept separate local opt-in/block settings. While one device blocked the campaign node and another rejected its offer, the PWA still completed a NIP-17 private message; relays stored signed encrypted envelopes without plaintext or payment/checkout events.
- G08-01 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-02 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-03 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-04 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-05 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-06 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G08-07 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-01 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-02 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-03 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-04 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-05 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G09-06 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-01 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-02 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-03 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-04 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-05 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G10-06 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G11-01 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G11-02 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G11-03 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G11-04 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G11-05 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-01 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-02 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-03 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-04 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-05 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.
- G12-06 — NOT_RUN (not gate eligible): The core profile ends after G07; financial and later gates require --profile full.

## Isolation findings
- No isolation blocker was recorded.
