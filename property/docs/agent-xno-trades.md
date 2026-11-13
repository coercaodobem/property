# Agent-to-agent XNO direct trades

**English** · [Português (Brasil)](agent-xno-trades.pt-BR.md)

**Status:** experimental local feature; fixed-count offline tests pass. No real funds or public relays were used. This is not a production security approval.

## What is implemented

Property Agent exposes six fixed MCP tools for capped, direct Nano payments between independent Nostr agent identities. Messaging and payment tools do not require a Property approval for each call. The profile owner must first configure a dedicated one-account Nano wallet, per-payment raw cap, lifetime raw budget, and expected network in an interactive terminal, then explicitly type `ARMAR`. The daemon checks its local authenticated gateway, wallet, account, and network before saving the encrypted configuration. No payment is sent during setup.

The tools are `property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt`, and `property_xno_dispute`. See the [MCP setup guide](../agent/README.md) for installing and connecting the local server.

## Trade flow

1. The seller sends a signed, private NIP-17 offer to the buyer's agent identity. It contains the buyer and seller Nostr keys, self-declared Nano destination account, integer raw amount, terms and SHA-256, and expiry.
2. The buyer can pay only a signature-verified, unexpired offer addressed to its identity and within the locally configured per-payment and lifetime limits. The amount is committed in the encrypted local journal before the wallet RPC call.
3. The Nano node's send ID is derived deterministically from the buyer identity and trade ID. Retrying the same trade reuses that ID, so a lost RPC response cannot intentionally create a second send.
4. The buyer sends a signed NIP-17 payment receipt containing the send hash and the declared accounts/amount. A relay ACK is only relay acceptance.
5. The seller verifies the receipt against its own saved offer and queries the configured Nano node for the exact source, destination, raw amount, and confirmation. It receives only that exact confirmed send into its single configured account.
6. If the receive RPC accepted the block but its response was lost, a retry checks Nano's receivable list and paginated account history. It matches the exact send hash, source, amount, and confirmed receive block before reporting success. The offline adapter test simulates the lost response and verifies that only one `receive` action is issued.
7. Either agent may send a signed dispute note. It is a record only; no funds are frozen or returned automatically.

## Safety and limits

- A confirmed Nano send is irreversible. Nano has no delivery-conditioned payment, native escrow, or dispute arbitration; Property cannot make the buyer receive goods or force the seller to refund. A dispute message does not change ledger state. [Nano block lifecycle](https://docs.nano.org/protocol-design/blocks/)
- The Nano account in the signed offer is self-asserted. Property does not prove that the Nostr signer controls that Nano account or that the trade terms were fulfilled.
- Local limits are policy checks, not Nano protocol limits. A person with control of the unlocked host, malware, or a restored older authentic journal can bypass the local lifetime budget. Journal encryption detects edits and wrong identity/password but is not anti-rollback protection.
- Nano documents its built-in wallet RPC as intended for development and testing. Do not expose the RPC port; the adapter requires a local authenticated gateway on loopback. A production wallet-management design and independent security review remain pending. [Nano RPC protocol](https://docs.nano.org/commands/rpc-protocol/), [Nano integration guides](https://docs.nano.org/integration-guides/)
- The trade journal is encrypted at rest with AES-256-GCM and PBKDF2-HMAC-SHA-256 (600,000 iterations), bound to the local agent identity and a dedicated context. Wallet credentials are not copied into the journal. Losing the vault password or the journal prevents normal recovery; plaintext/tampered journals fail closed.
- Offers and receipts travel in encrypted NIP-17 messages, while relays can observe routing and traffic metadata. A relay ACK does not prove that the other agent received or read the message.
- There is no human approval prompt for each payment after setup. The owner explicitly arms the wallet policy once, and the separate local cap limits the agent's automatic spending. An AI host may impose its own confirmation policy outside Property.
- The PWA Marketplace remains a listings interface; it does not use this agent payment flow as checkout. BTC and XMR agent payments are not implemented by these tools.

## Offline evidence

Run from the repository root:

```bash
node property/tests/agent-xno-trades-smoke.mjs
node property/tests/agent-nano-wallet-smoke.mjs
```

G8 has 28 deterministic cases. G9 has 14 cases against a synthetic RPC server bound only to loopback. Both report zero funds and no external network/relay use. These fixture tests validate the implemented state transitions; they do not replace native wallet integration, independent security review, human UX evaluation, or production operations approval.

## Open work

Production use remains pending a wallet RPC architecture suitable for real funds, anti-rollback spend policy or an explicit decision to accept its limits, recovery/migration policy, independent security review, and real operator UX review. Windows, macOS, Android, and iOS native support remain separately `PENDING`.
