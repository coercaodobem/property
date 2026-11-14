# Experimental Nano 2-of-3 threshold escrow

**English** · [Português (Brasil)](agent-xno-threshold.pt-BR.md)

Property Agent now has an experimental 2-of-3 threshold flow separate from the existing custodial `xno.escrow.*` tools. Three Nostr identities are assigned buyer, seller, and arbiter roles. Their devices run distributed key generation (DKG) and retain separate signing shares; there is no trusted dealer and no complete private key in the protocol. The public key becomes an ordinary Nano account.

## Implemented flow

- `xno.threshold.create`, `accept`, and `sync` coordinate the fixed 2-of-3 DKG through the existing pairwise NIP-17 transport. Round-two shares are sent only to their named participant. The coordinator cannot read another participant's NIP-17 message.
- DKG material and each participant's final share are stored in `xno-threshold.json`, encrypted with the local Property Agent vault password using AES-256-GCM/PBKDF2. Temporary signing nonces stay in process memory; a restarted signing round gets fresh nonces.
- The signed contract binds three Nostr identities, buyer and seller Nano accounts, one raw amount, a terms hash, network, trade ID, and expiry. The session derives the group Nano account only after DKG.
- The dev-only settlement path creates one exact state-send block. Release is fixed to the seller account and requires buyer plus seller approval. Refund is fixed to the buyer account, available after contract expiry, and requires buyer plus arbiter approval. Each signer sees the same account, destination, amount, previous frontier, outcome, and block hash. The local Nano node's confirmed frontier and balance are rechecked before approval and signing.
- Two approved signers create FROST shares for that exact block hash. The coordinator verifies and aggregates them, verifies the final Nano-format signature, and can submit that block to the configured local development Nano node.
- `xno.threshold.status` shows DKG, settlement, approvals, and node-submission state without exposing shares.

## Boundaries that remain

This is a **threshold signature**, not a script-level multisig or a conditional-spend feature built into Nano. The current `xno.escrow.*` tools remain custodial and are not replaced by this path. Nano sees a normal account and a normal signature. The settlement rules are enforced by honest Property Agent signers only: any two share-holders can collude or use different software to sign an arbitrary valid block. The application cannot force refund, delivery, arbitration, or a particular recipient at the protocol level.

The contract binds Nostr identities to declared Nano accounts but does not yet prove that the Nostr key-holder controls the corresponding Nano private key. Users must independently verify those accounts. Loss of two shares makes the account unspendable; loss of one share leaves no recovery path in the current implementation.

Transaction proposal, work generation, signing, and publication are **hard-disabled outside the Nano dev network**. The offline test uses a synthetic transport and a mocked node adapter; it does not exercise actual NIP-17 encryption between daemons or acceptance by a Nano node. Real private-node acceptance, real relay delivery, restart recovery across installed daemons, independent cryptographic/security review, and human review of the signer UX remain pending. A `process` response is only submission; confirmation is not yet monitored by this flow. Do not use real funds.

## Offline checks

Run from the repository root:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
node property/tests/agent-xno-threshold-store-smoke.mjs
node property/tests/agent-xno-threshold-protocol-smoke.mjs
bash property/tests/run-smoke.sh
```

The state-block hashing test matches the published Nano RPC reference vector. This checks local serialization and crypto behavior, not independent node acceptance or production safety. See [G13-02 offline evidence](evidence/agent-messaging/G13-xno-threshold-integration-offline-20261113.md) and the [remaining XNO gates](plano-de-testes-central.md#separate-xno-threshold-signature-extension-not-part-of-mvp-acceptance).

References: [Nano state blocks](https://docs.nano.org/protocol-design/blocks/), [Nano RPC protocol](https://docs.nano.org/commands/rpc-protocol/), [Nano work generation](https://docs.nano.org/integration-guides/work-generation/), and [RFC 9591 FROST](https://www.rfc-editor.org/rfc/rfc9591.html).
