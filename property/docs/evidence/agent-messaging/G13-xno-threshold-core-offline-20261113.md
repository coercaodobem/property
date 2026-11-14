# XNO-T1 — Nano threshold-signature core, offline

**Result:** PASS for the exact local assertions below. This is not acceptance by a Nano node, production approval, or an escrow approval.

| Field | Value |
|---|---|
| Date | 2026-11-13 |
| Tested base revision | `d7731502a2046110d5acb25236465e3ceb4b1ebb` (worktree changes listed below were under test) |
| Runtime | Node.js `v22.22.1` |
| Commands | `node property/tests/agent-xno-threshold-smoke.mjs`; `bash property/tests/run-smoke.sh` |
| Result output | `PASS: Nano 2-of-3 threshold DKG, distinct participant shares, one-shot nonce tickets, signature aggregation, altered-message rejection, threshold rejection, address encoding, and wire serialization. Offline simulation only; no Nano node or funds used.` |
| Threshold source SHA-256 | `ae0d744ee360e3482c79eb329dc2827aa8414be34448342ba87070339402672e` |
| Smoke source SHA-256 | `0a682a70a060998d8fcafd9004f4476892848f5c7d2dbac1661e175c7efb4b66` |
| Vendored `@noble/curves` package.json SHA-256 | `63d976a6ee72f2dcdc81e6c8bf907edff54eb20e8423218578fbfaf29cff96e6` |
| Vendored `@noble/hashes` package.json SHA-256 | `3e361734f5269de162fa362483d7f45dee7efb533ec217157945338f7591baaf` |

## Fixed case

- Three fixed synthetic 64-character participant keys (`a…a`, `b…b`, `c…c`) derive three distinct FROST IDs.
- Threshold is fixed at exactly 2 of 3. One DKG completes for the three participants using Node's cryptographic random generator for key shares and nonces.
- Participants 1 and 3 create fresh signing commitments and aggregate one signature over the fixed 32-byte message `m[i] = (7*i + 3) mod 256`.
- The signing API hides each secret nonce behind an in-memory one-shot ticket, consumes it on the first signing attempt, and rejects reuse.
- The aggregate is 64 bytes and verifies against the group key using the experimental Nano challenge implementation.
- One changed message, one changed signature, and one-participant-only aggregation are rejected.
- One participant's partial-signature attempt below threshold is rejected. The public wrapper omits trusted-dealer generation, signature-share combination, raw-key signing, and RNG injection.
- One published-format Nano account round-trips through public-key encoding; a changed checksum is rejected. Encoded bytes and scalar IDs round-trip through the module's wire serializer.

No public relay, live network, wallet, private identity, production key, or XNO funds were used. `nano_node` is not available in the tested environment's `PATH`, so independent Nano-node acceptance remains **PENDING** under XNO-T2. The FROST and Nano challenge code is not independently audited; this result does not activate multisig escrow. The implemented escrow settlement still uses single-operator custody.

The complete `property/tests/run-smoke.sh` suite also exited successfully. Its local ledger-RPC fixture needs to bind `127.0.0.1`; the sandbox denied that bind, then the same suite passed when run in the approved test environment. The suite's existing escrow fixture continues to label its result custodial and uses no live Nano RPC or funds.
