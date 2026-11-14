# G13-02 — Experimental Nano threshold settlement integration, offline

**Result:** PASS for the local synthetic assertions below. This is not Nano-node acceptance, production approval, a security audit, or proof of escrow enforcement.

| Field | Value |
|---|---|
| Date | 2026-11-13 |
| Tested base revision | `38ef2de74abd495e7fa63cb5a36fb4ddc83e189c` (the worktree changes listed below were under test) |
| Runtime | Node.js `v22.22.1` |
| Full suite | `bash property/tests/run-smoke.sh` — exit 0, `PASS: suíte smoke local concluída.` |
| Focused commands | `node property/tests/agent-xno-threshold-smoke.mjs`; `node property/tests/agent-xno-threshold-store-smoke.mjs`; `node property/tests/agent-xno-threshold-protocol-smoke.mjs`; `node property/tests/agent-nano-wallet-smoke.mjs` |
| Fixed case counts | Threshold protocol: 15; encrypted share store: 6; local Nano wallet adapter: 19 (87 synthetic RPC requests) |
| Outside network | Not used; the wallet adapter fixture binds only to loopback `127.0.0.1` |
| Funds and public relays | None |

## Assertions exercised

- Three synthetic participants produce the same DKG group key. Recipient-bound private-share routing, deletion of temporary polynomial material, and persistence of the local share are checked.
- The AES-GCM share store is checked for encrypted-at-rest content, restart recovery, wrong-password rejection, tamper detection, and invalid session-state rejection.
- The protocol refuses to create or accept a DKG session declared for `live`; both the MCP schema and service require `dev`.
- The settlement contract binds the exact buyer/seller destinations and raw amount. Release requires buyer plus seller; refund requires buyer plus arbiter after expiry. Missing approvals, stale account state, and one-use nonce misuse are rejected.
- Two approved shares aggregate a valid signature for the exact Nano state-block hash. The fixture checks the resulting state-send block, account/public-key binding, work request, and dev-node RPC payload.
- The adapter rejects a `live` node while configured for `dev`, rejects threshold signing/publication when configured for `live`, verifies the exact block before `process`, and labels mock publication `submitted_unconfirmed`.
- The full smoke suite also passed package installation/manifest checks and existing application, relay, agent messaging, payment, and custodial escrow regressions.

## Reproducibility hashes

| File | SHA-256 |
|---|---|
| `property/agent/xno-threshold.mjs` | `a35f4ffa83230decddc0e727161a1490215256b2eb6b29d95e41ad1f5190ff3f` |
| `property/agent/xno-threshold-store.mjs` | `43dd00069b00da510167e5a0d475e67a06ed61a76ffb4bb0b238ddcc49e06ce2` |
| `property/agent/xno-threshold-protocol.mjs` | `a8cc1fe2bb2bc0447b76ba2a5ca1868ca4485272debc54cf017a38dced81a707` |
| `property/agent/nano-wallet.mjs` | `6399877241e8acaacabf2e38f37865840b74c121e7e487b05e4252e12a8d4280` |
| `property/tests/agent-xno-threshold-smoke.mjs` | `a120c83aaf6f5ec1c1d00d21f9ebcb09ebaf8ea6cc4004ec4bd89218173754d6` |
| `property/tests/agent-xno-threshold-store-smoke.mjs` | `ef87757321500b724bc27b6d4288fcab3cd4ef758adae87d65e351d1760c34f4` |
| `property/tests/agent-xno-threshold-protocol-smoke.mjs` | `d6786e162f50c5e2bf60698be075237e11e4bd4b83bc1531e0693aaf978d330c` |
| `property/tests/agent-nano-wallet-smoke.mjs` | `83fd87b6608c75f286aef500d8fcdd29e83505d8d21c30212ec83b8abd092570` |
| `property/tests/run-smoke.sh` | `fc4e997a6fe51e50ef21187748ff46f25f2bf7b2b49c341cddba0d65ab6449ea` |

## Boundaries and pending gates

The protocol smoke uses an in-memory transport contract; its report explicitly says real NIP-17 encryption was not invoked. The wallet fixture is a synthetic HTTP node, not `nano_node`; it cannot establish private-node acceptance or confirmation. Therefore XNO-T2 and XNO-T3b remain **PENDING**. Independent cryptographic/security review and human review of the signer's exact approval screen remain **PENDING** under XNO-T4.

This is a 2-of-3 threshold signature. Nano sees an ordinary account and valid block signature; it does not enforce the app's release/refund policy. Any two share-holders can collude or use other software to sign a different valid spend. Nostr-to-Nano account ownership is declared, not cryptographically proven. Do not use real funds or describe this as trustless escrow.
