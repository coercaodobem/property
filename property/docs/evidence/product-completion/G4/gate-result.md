# G4 gate result — direct communication, relay recovery, and PWA

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Frozen source candidate: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

All 35 fixed case families passed: five message-delivery cases, six isolated-relay cases, and 24 browser/PWA cases. Six synthetic identities used five isolated relays in three relay groups. The matrix delivered 1,500 private messages and 100 public events; exercised 40 partition transitions, 20 conflicting profile/offer updates, two restarts per relay, 20 retries, and 10 fixtures per failure category. It verified deterministic reconnect conflict resolution, retention/deduplication, signature preservation, authorized decryption, and no fabricated receipt.

The cached PWA opened 10 times after its application host was removed with all relays offline, then 10 times with only a loopback relay available. The browser made zero external requests, and WebSocket targets were loopback only. All evidence checksums in `SHA256SUMS` verified. The responsive captures are Linux browser viewports, not tests on phones or other operating systems.

Reports, source digests, and screenshots are in [`fixed-run-10/`](fixed-run-10/). Tests used synthetic identities and local relays only; no public relay or funds were used.
