# Agent-to-agent XNO payments and escrow

**English** · [Português (Brasil)](agent-xno-trades.pt-BR.md)

**Status:** experimental local feature. Fixed-count tests use synthetic wallets and NIP-17 fixtures only. No public relay or real funds were used. This is not production security approval.

## Implemented tools

Property Agent exposes 20 fixed MCP tools: five for messaging and activity, six for direct XNO payments, and nine for custodial escrow. Neither messaging nor these payment calls require a per-call Property approval. A profile owner arms each local wallet policy once from an interactive terminal. See the [MCP setup guide](../agent/README.md).

Direct payments use `property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt`, and `property_xno_dispute`.

Escrow uses `property_xno_escrow_offer`, `property_xno_escrow_open`, `property_xno_escrow_accept`, `property_xno_escrow_fund`, `property_xno_escrow_approve`, `property_xno_escrow_dispute`, `property_xno_escrow_sync`, `property_xno_escrow_resolve`, and `property_xno_escrow_status`.

## Custodial escrow flow

1. The buyer chooses four distinct Nostr identities: buyer, seller, a custodian, and an independent arbiter. The signed request binds the Nano accounts, exact raw amount, terms hash, parties, and expiry.
2. The custodian opens the request and sends its signed contract to buyer, seller, and arbiter. The seller accepts only if the contract names the seller's configured Nano account.
3. After the custodian announces seller acceptance, the buyer funds the exact contract amount. The custodian verifies the Nano send hash, source, destination, amount, and confirmation before receiving it into its dedicated wallet.
4. The buyer independently checks the exact deposit hash, source, destination, amount, and confirmation through its configured Nano node before signing a release approval. On its next `sync`, the custodian pays the agreed seller account. If either party disputes, the custodian pauses settlement and notifies the independent arbiter. The arbiter verifies the custodian's signed disputed status and sends one signed ruling: release to the seller or refund to the buyer. The custodian executes that ruling on its next `sync`; missing status notices are retried without duplicating notices already accepted by a relay.
5. Nano sends and payouts remain irreversible. Relay acknowledgements are not proof of delivery. The operator must be running and the custodian must reconcile each trade.

Configure the custodian with `property-agent xno escrow configure`. It uses a separate, dedicated, one-account Nano wallet. `max_raw_per_payment` caps each escrow, and `lifetime_budget_raw` caps the total liability reserved by open escrows. All escrows share that configured account; the encrypted local journal maps each confirmed deposit hash to its contract. Configure buyer/seller direct wallets with `property-agent xno configure`.

## Trust and safety boundaries

- This is **custodial escrow**, not trustless escrow. Nano does not enforce the contract, the arbiter's ruling, a refund, or a conditional release. The custodian holds the signing keys and can ignore the application or move the funds outside Property. Buyers and sellers therefore trust both the selected custodian and the selected arbiter. [Nano block lifecycle](https://docs.nano.org/protocol-design/blocks/)
- The independent arbiter separates dispute decisions from custody, but cannot force a dishonest custodian to execute. No buyer or seller agent can redirect settlement to a new account after the signed contract is opened.
- Nostr keys and Nano accounts are not cryptographically linked by this workflow. Seller acceptance checks the seller's local wallet account; the buyer's chosen wallet account is bound in its signed request. This is still not a protocol-level proof of account ownership.
- The operator's dedicated account pools open escrow funds. The liability cap and encrypted journal are local checks; the Nano ledger does not enforce them. A malicious operator, compromised host, or rollback of the authenticated local journal can defeat the software policy. Do not use real funds.
- Nano's built-in wallet RPC is documented for development/testing. Keep it behind an authenticated loopback gateway and do not expose its port. Independent production security review, recovery policy, and operational review remain pending. [Nano RPC](https://docs.nano.org/commands/rpc-protocol/), [key management](https://docs.nano.org/integration-guides/key-management/)
- Direct XNO trades remain irreversible payments to a counterparty; they do not gain escrow by using the separate escrow tools. The human Marketplace PWA still has no payment checkout. BTC and XMR agent transfers are not implemented.

## Offline checks

Run from the repository root:

```bash
node property/tests/agent-xno-trades-smoke.mjs
node property/tests/agent-xno-escrow-smoke.mjs
node property/tests/agent-nano-wallet-smoke.mjs
```

The escrow fixture uses one buyer, seller, custodian, and arbiter; two synthetic trades; one seller release and one arbiter-directed refund; and fixed lost-response and partial-notice retry cases. It validates the modeled workflow only, not live Nano operation, custody honesty, arbitration fairness, or production readiness.

## Open work

Production use remains pending independent security and human-operator review, an anti-rollback policy, wallet recovery design, and real custody operations. Windows, macOS, Android, and iOS native support remain separately `PENDING`.
