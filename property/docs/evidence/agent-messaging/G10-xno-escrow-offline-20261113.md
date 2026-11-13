# G10 — Offline custodial XNO escrow

**Run date:** 2026-11-13
**Source commit:** [`6c49a743e21ff44f27043be7fc45ab20bddfd8ff`](https://github.com/coercaodobem/property/commit/6c49a743e21ff44f27043be7fc45ab20bddfd8ff) (`feat: add custodial XNO escrow workflow`)
**Branch:** `modelo-mvp`
**Runtime:** Node.js `v22.22.1`, Linux x86_64

## Results

| Check | Result | Fixed evidence |
|---|---|---|
| `node property/tests/agent-xno-escrow-smoke.mjs` | **20/20 PASS** | Seed `property-xno-escrow-fixed-v1`; logical clock `1900000000`; four synthetic identities; two trades; deposits and payouts of 40 raw each; one buyer-approved release and one arbiter-directed refund. A 60-raw open liability makes a concurrent 50-raw request fail against the 100-raw cap. |
| `node property/tests/offline/agent-bridge-g4.mjs` | **PASS** | 34 fixed cases; two agent processes; MCP inventory of 20 tools; one local Geode relay pinned to SHA-256 `9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`. All nine escrow MCP tools fail closed when the required local wallet is not configured. |
| `node property/tests/agent-xno-trades-smoke.mjs` | **28/28 PASS** | Seed `property-xno-trade-fixed-v1`; synthetic ledger records one send and one receive block. Direct-payment test only. |
| `node property/tests/agent-nano-wallet-smoke.mjs` | **15/15 PASS** | Seed `property-xno-wallet-fixed-v1`; 78 synthetic RPC requests and two distinct synthetic sends. Same-ID retry returns the original block after the balance falls; a new over-balance send is rejected by the synthetic Nano node. |
| `bash property/tests/run-smoke.sh` | **PASS, exit 0** | Full local smoke suite ended with `PASS: suíte smoke local concluída.` It includes G8, G9, G10, package checks, and the offline G5 security corpus. G5's independent review remains pending. |
| `git diff --check` | **PASS** | No whitespace errors in the implementation commit. |

No funds were used, no public relay or Nano network was contacted, and no real participant or arbiter was simulated. The escrow fixture uses an in-memory transport adapter that supplies synthetic sender metadata; it does **not** validate NIP-17 cryptographic envelopes. G4 separately validates agent messaging through the local Geode relay, but it does not run an escrow payment over that relay.

## What the workflow now does

- Binds buyer, seller, custodian, arbiter, Nano accounts, exact raw amount, terms hash, and expiry in a fixed signed-message protocol.
- Requires seller acceptance using the seller's locally configured Nano account.
- Verifies the exact confirmed buyer deposit at both custodian and buyer sides before the buyer can approve release.
- Holds funds in a dedicated custodian wallet, pauses an open trade on dispute, and accepts one signed release/refund ruling from the separate arbiter.
- Retries lost receive/payout responses idempotently and retries missing status notices without resending notices already accepted by a relay.
- Enforces per-payment, lifetime-budget, and concurrent-liability limits in local software.

## Limits and pending work

- **This is custodial, not trustless escrow.** Nano does not enforce the contract or the arbiter's ruling. The custodian controls the pooled account and can bypass Property or move the funds. A refund is an application workflow and cannot be forced against a dishonest custodian.
- The local liability cap and encrypted journal do not prevent a compromised host, malicious wallet operator, or rollback to an older authenticated journal. Nano accounts are not cryptographically bound to Nostr identities.
- No live Nano RPC, mainnet funds, production custody, external relay, real-person usability study, independent security review, or arbitration-fairness review was tested. Those remain `PENDING`.
- The flow is agent-to-agent XNO only. It does not add human Marketplace checkout or BTC/XMR agent escrow.
- The arbiter's message transports a decision; the workflow does not independently validate evidence or determine who is right.
