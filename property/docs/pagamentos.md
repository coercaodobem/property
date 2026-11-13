# BTC, XMR, and XNO in Property

**English** · [Português (Brasil)](pagamentos.pt-BR.md)

Updated 2026-11-13. This document incorporates the requirement from commit `55e379c9dbdf8637b32422d32e982460aa5862e5` and the current local campaign-engine state.

## Implemented and planned

The PWA publishes offer prices in BTC, XMR, or XNO and reads signed campaigns. It verifies format and signature but contains no marketplace checkout or campaign payment confirmation. Separately, the local relay library has a campaign engine and adapters for Bitcoin Core, Monero Wallet RPC, and Nano RPC. Gates G07–G08 exercise that campaign engine and those adapters with real nodes/wallets on private local networks, without real funds. Property Agent offers an experimental direct XNO payment flow and an optional custodial escrow workflow for agent-to-agent trades; neither is used by human Marketplace checkout. The escrow holds funds in a custodian's wallet and depends on a separate arbiter's signed ruling; it is not trustless and is not production-ready. Independent security and operations review remain pending. The PWA must never treat a declared payment in an event as its own confirmation.

## Experimental agent-to-agent XNO payments

The local MCP daemon can send a capped Nano payment for an authenticated, unexpired NIP-17 offer addressed to the agent identity. The owner configures a single-account Nano wallet, per-payment cap, and lifetime budget once; each individual trade then follows the signed offer and local limits without a Property confirmation screen. The encrypted journal reserves an outgoing amount before RPC and retries with the same Nano RPC ID. A receiver verifies the signed receipt against its own offer and the exact confirmed Nano send, then receives that block once. A lost receive response is recovered by matching the send hash, source, and amount in the receiving account history.

Direct transfers are **not trustless commerce**: a Nano send is irreversible and Nano cannot enforce delivery, refunds, arbitration, or conditional release. Property's optional escrow tool holds the deposit under a custodian's control and follows a separate arbiter's signed release/refund ruling, but the custodian can bypass the app or move the funds. The sender/seller Nano accounts are not cryptographically linked to their Nostr keys. Local caps are not enforced by Nano; an administrator, malware, or journal rollback can bypass them. Nano's built-in wallet RPC is for development/testing; this integration is experimental and has no independent production security review. See the [agent XNO implementation and threat boundaries](agent-xno-trades.md) before use. Do not use real funds.

## External wallet handoff in payment cards

The person-to-person payment card can construct a payment URI locally without connecting to a wallet or payment service. Bitcoin uses the `bitcoin:` URI defined by [BIP 321](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki), with the BTC amount in decimal form; testnet SegWit uses the `tb` parameter. Signet and testnet legacy Base58 addresses do not get a wallet URI because the format cannot safely retain that network choice. Monero uses `monero:` with `tx_amount` and `tx_description`, and Nano uses `nano:` with `amount` in integer raw units and `message`; the [Nano URI guide](https://docs.nano.org/integration-guides/the-basics/) defines the amount as raw. Nano Beta is not handed off because the URI does not identify that network.

The `Open in wallet` control asks the device to open a compatible external wallet; `Copy payment request` and the local QR expose the same URI. If the card has no amount, the request carries only the address. Unsupported or ambiguous network combinations fall back to an address-only QR. These local checks inspect shape and network markers, not checksum or address ownership. The wallet must validate the address and show the final recipient, network, amount, and fees for the person to confirm. Property does not sign, send, verify, or track a payment.

| Currency | Smallest unit | Units per coin | Integer field limit |
|---|---|---:|---|
| BTC (Bitcoin) | satoshi | 10⁸ | 21 million BTC in satoshis |
| XNO (Nano) | raw | 10³⁰ | uint128 |
| XMR (Monero) | piconero | 10¹² | uint64 |

Conversions use BigInt and decimal strings. There is no exchange between currencies. Limits describe representation, not a balance or available monetary supply. References: [Nano units](https://docs.nano.org/protocol-design/distribution-and-units/), [Monero units](https://www.getmonero.org/resources/moneropedia/atomic-units.html), and [Monero Wallet RPC](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html).

## NIP-15 offers

The draft requires a numeric `price` field; it is only for compatibility and may lose precision. Property's exact price is `price_atomic`, an integer string, together with `currency: "BTC"`, `"XNO"`, or `"XMR"`. For XNO, also publish `price_raw` for older clients. Never interpret `price_raw` as piconero. Each currency has its own storefront; changing an offer's currency selects the corresponding storefront. Future checkout must use only the validated integer, never calculate money with `Number`.

## Campaigns

Campaign events use kind 30078 and exactly one `t` tag and one `d` tag:

```json
{
  "tags": [["t", "property-sponsored-v2"], ["d", "property-sponsored-v2:123e4567-e89b-42d3-a456-426614174000"]],
  "content": "Signed JSON payload described below"
}
```

The payload keeps `title`, `body`, `link`, `expires_at`, `offer_event_id`, `acceptance_event_id`, and an inline PNG/JPEG image with a size limit. It adds `currency`, `amount_atomic`, and `payment_tx_id` (a 64-character hexadecimal identifier). V2 rejects `amount_raw` and `payment_block_hash`. The parser requires a positive amount, bounded expiry, and a known currency. If present, `node_pubkey` must match the signer.

The reader also accepts `liberdade-sponsored-v1`, strictly as XNO, with `amount_raw` and `payment_block_hash`. It never reinterprets an older campaign as Monero or alters signed events. Local opt-in, blocking, and repeat limits still apply. The app sends no click/view events.

## Production operation and activation: pending

1. Integrate the engine with a node-operator tool; document create, review/accept, reject, monitor, stop, and recovery without requiring the Nostr identity secret.
2. Independently review local RPC authentication, wallet isolation, limits, sanitized logs, address generation, and credential handling.
3. Fix and publish per-currency policies for confirmations, unlocks, minimum values, fees, and reorg handling. Lab parameters do not automatically become production settings.
4. Review refund rules and idempotency per currency. Bitcoin and Monero require an authenticated refund address agreed in the deal; never assume the source is usable.
5. Do not promise zero cost or viable Monero micropayments. Do not enable real funds before security, policy, and operations review.

## Bitcoin

BTC was added at the maintainer's later request. Values use integer satoshis (8 decimal places), up to 21 million BTC. Offers and v2 campaigns accept the currency; this does not enable transfers. Reference: [Bitcoin vocabulary](https://bitcoin.org/en/vocabulary).

A future Bitcoin adapter must use a unique address per offer, confirm through a local node/wallet, verify amount and output, and handle mempool, confirmations, replacement/conflicts, and reorgs. A declared txid does not prove receipt. Refunds require an authenticated address agreed with the payer and an explicit fee/net-amount policy; do not assume a source address is a refund address. Test on regtest/signet without real funds. Lightning is a separate, unimplemented flow; do not confuse on-chain satoshis with millisatoshis.
