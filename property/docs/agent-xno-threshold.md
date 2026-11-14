# Experimental Nano threshold-signature core

**English** · [Português (Brasil)](agent-xno-threshold.pt-BR.md)

Property now vendors a local experimental FROST core that can create a 2-of-3 distributed key and produce a 64-byte Nano-style Ed25519+BLAKE2b signature. The DKG and signing APIs are in `property/agent/xno-threshold.mjs`; their vendored cryptographic source is version-pinned and included in the repository, so installation does not fetch runtime code.

## What the primitive does

- Three participants can run a distributed key-generation ceremony. No trusted dealer creates or sees the complete group private key.
- Each participant retains a signing share. Two valid shares can be combined into the one 64-byte signature format Nano state blocks carry.
- The group public key can be encoded as an ordinary `nano_` account. Nano nodes still see a normal account and a normal signature; no Nano protocol or consensus change is required.
- The final EdDSA challenge hashes `R || A || message` with BLAKE2b-512. FROST's separate, domain-separated transcript hashes use SHA-512.
- Participant IDs can be derived from Nostr public keys. The DKG round-two packages are private shares and must be delivered through authenticated, end-to-end encrypted messages.
- The Property wrapper only exposes the fixed 2-of-3 DKG and threshold-signing operations. It omits trusted-dealer setup and private-key reconstruction helpers. Participant nonces and key shares use the runtime cryptographic random generator.
- Each signing commitment is represented by a one-shot in-memory ticket. The secret nonce is hidden from the caller, consumed on the first signing attempt, and wiped from its byte buffers afterward. A crash or restart abandons that signing attempt; encrypted persistence and recovery are not implemented.

This is a **threshold signature**, not a script-level multisig account. If two of the three share-holders collude, they can spend; a 2-of-3 threshold cannot stop its own quorum. Losing or stranding enough shares can make funds unspendable. The arbiter is one key-holder, so a trade's parties must choose this trust arrangement consciously.

## Scope and safety boundary

The cryptographic core is not connected to the current Property Agent escrow settlement path. That flow remains custodial: its configured Nano wallet signs and sends payouts. Authenticated Nostr DKG/signing message orchestration, encrypted share persistence and recovery, transaction construction, display/approval of exact settlement fields, threshold block signing, and publishing the signed block to a Nano node remain unimplemented.

The offline smoke test checks one fixed 2-of-3 DKG/signing scenario with synthetic participants, message tampering rejection, and Nano account encoding. It does not prove that a Nano node accepts the signature or that a trade escrow is non-custodial. The custom Nano ciphersuite has not received an independent cryptographic audit. Do not use real funds or describe the current escrow as multisig until those integration and review gates pass.

Run the focused local check from the repository root:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
```

References: [Nano's Ed25519+BLAKE2b signature format](https://docs.nano.org/integration-guides/the-basics/), [Nano signing and hashing](https://docs.nano.org/protocol-design/signing-hashing-and-key-derivation/), and [RFC 9591 FROST](https://www.rfc-editor.org/rfc/rfc9591.html).
