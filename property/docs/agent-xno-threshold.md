# Experimental Nano 2-of-3 threshold escrow

**English** · [Português (Brasil)](agent-xno-threshold.pt-BR.md)

Property Agent now has an experimental 2-of-3 threshold flow separate from the existing custodial `xno.escrow.*` tools. Three Nostr identities are assigned buyer, seller, and arbiter roles. Their devices run distributed key generation (DKG) and retain separate signing shares; there is no trusted dealer and no complete private key in the protocol. The public key becomes an ordinary Nano account.

## Implemented flow

- `xno.threshold.create`, `accept`, and `sync` coordinate the fixed 2-of-3 DKG through the existing pairwise NIP-17 transport. Round-two shares are sent only to their named participant. The coordinator cannot read another participant's NIP-17 message.
- DKG material and each participant's final share are stored in `xno-threshold.json`, encrypted with the local Property Agent vault password using AES-256-GCM/PBKDF2. Temporary signing nonces stay in process memory; a restarted signing round gets fresh nonces.
- The signed contract binds three Nostr identities, buyer and seller Nano accounts, one raw amount, a terms hash, network, trade ID, and expiry. The session derives the group Nano account only after DKG.
- The dev-only settlement path creates one exact state-send block. Release is fixed to the seller account and requires buyer plus seller approval. Refund is fixed to the buyer account, available after contract expiry, and requires buyer plus arbiter approval. Each signer sees the same account, destination, amount, previous frontier, outcome, and block hash. The local Nano node's confirmed frontier and balance are rechecked before approval and signing.
- Protocol v2 makes all three participants exchange the exact settlement-intent fingerprint before anyone approves or signs. A mismatch freezes the session and appears in status; time-window failures are rejected and reported to the local participant. v1 and v2 sessions do not interoperate.
- Once a conflict is reported, participants can locally block the arbiter with `agent.block`; local blocklists are not shared. A new negotiation may choose a different arbiter, but this is not a global reputation or proof system.
- Two approved signers create FROST shares for that exact block hash. The coordinator verifies and aggregates them, verifies the final Nano-format signature, and can submit that block to the configured local development Nano node.
- `xno.threshold.status` shows DKG, settlement, approvals, and node-submission state without exposing shares.

## Boundaries that remain

This is a **threshold signature**, not a script-level multisig or a conditional-spend feature built into Nano. The current `xno.escrow.*` tools remain custodial and are not replaced by this path. Nano sees a normal account and a normal signature. The settlement rules are enforced by honest Property Agent signers only: any two share-holders can collude or use different software to sign an arbitrary valid block. The application cannot force refund, delivery, arbitration, or a particular recipient at the protocol level.

The contract binds Nostr identities to declared Nano accounts but does not yet prove that the Nostr key-holder controls the corresponding Nano private key. Users must independently verify those accounts. One session has exactly one arbiter; selecting among candidates means creating separate sessions. A participant-authenticated conflict report does not cryptographically prove to other parties that the coordinator sent both proposals; a malicious participant may send a false report and cause denial of service. It does not create a global, Sybil-resistant reputation record or guarantee every future counterparty will block an arbiter. Loss of two shares makes the account unspendable; loss of one share leaves no recovery path in the current implementation.

The Property Agent's transaction proposal, work generation, signing, and publication remain hard-disabled outside Nano dev. A separate faucet-funded 1-raw mainnet smoke confirmed a 2-of-3 receive/send/receive round-trip through two distinct public RPC endpoints on 2026-11-14. It used a temporary harness, not the Property Agent production flow, and does not satisfy XNO-T2. See the [mainnet evidence](evidence/agent-messaging/G13-xno-threshold-mainnet-20261114.md); it also records an earlier harness failure that left one raw pending at an unopened ephemeral group account.

The offline test uses a synthetic transport and mocked node adapter; it does not exercise actual NIP-17 encryption between daemons. Acceptance by a disposable private Nano dev node through the Property flow, real relay delivery, restart recovery across installed daemons, independent cryptographic/security review, and human review of the signer UX remain pending. A `process` response is only submission; confirmation is not yet monitored by this flow. Do not use personal or production funds. Any mainnet test must use a dedicated faucet-funded wallet and be explicitly authorized.

## Offline checks

Run from the repository root:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
node property/tests/agent-xno-threshold-store-smoke.mjs
node property/tests/agent-xno-threshold-protocol-smoke.mjs
bash property/tests/run-smoke.sh
```

The state-block hashing test matches the published Nano RPC reference vector. This checks local serialization and crypto behavior, not independent node acceptance or production safety. The 2026-11-14 adversarial fixture passed 22 fixed offline cases for the early-refund gap, intent mismatch freeze, local blocking, and alternate-arbiter selection; its transport is synthetic. See [adversarial offline evidence](evidence/agent-messaging/G13-xno-threshold-adversarial-offline-20261114.md), [G13-02 baseline evidence](evidence/agent-messaging/G13-xno-threshold-integration-offline-20261113.md), and the [remaining XNO gates](plano-de-testes-central.md#separate-xno-threshold-signature-extension-not-part-of-mvp-acceptance).

References: [Nano state blocks](https://docs.nano.org/protocol-design/blocks/), [Nano RPC protocol](https://docs.nano.org/commands/rpc-protocol/), [Nano work generation](https://docs.nano.org/integration-guides/work-generation/), and [RFC 9591 FROST](https://www.rfc-editor.org/rfc/rfc9591.html).
