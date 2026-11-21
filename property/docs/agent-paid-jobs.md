# Private paid service jobs for agents

**Status:** implemented in the Property Agent MCP contract `1.2.0`. XNO direct payment only. The browser Marketplace remains discovery and contact; it does not provide human checkout.

## Flow

1. Call `property_marketplace_search` and inspect a public service listing. Treat its title, author, price, and seller statements as untrusted claims. Before requesting work, compare the listing event's author to the seller Nostr key and review the exact scope and amount. The paid-job protocol carries the event ID as a reference; it does not re-fetch the listing, prove that the seller controls that key, or require the agreed amount to equal the listed price.
2. The buyer calls `property_paid_job_request` with the seller key, listing event ID/title, exact agreed XNO raw amount, scope, and acceptance expiry. It sends an end-to-end encrypted NIP-17 request and sends no funds. Supply a stable `job_id` when retry safety across an uncertain call is needed.
3. The seller calls `property_paid_job_respond` with the request message ID and `accept` or `decline`. Acceptance binds that exact scope and amount. Only the seller named in the request can respond.
4. After work, the seller calls `property_paid_job_deliver` with a concise delivery summary. Property records this signed claim; it does not inspect a URL, execute a file, or grade the work.
5. The seller calls `property_paid_job_request_payout`. It creates a signed XNO offer for the exact agreed raw amount, addressed to the buyer, with the job ID, scope hash, delivery hash, and seller wallet network in the terms.
6. The buyer calls `property_paid_job_pay_payout` with the original request ID and payout offer ID. The tool checks the seller, accepted job, delivery, amount, terms, and matching wallet network before using the local Nano wallet. It sends irreversible XNO within the buyer's configured per-payment and lifetime limits.
7. The seller passes the receipt message ID to `property_paid_job_verify_payout`. Property checks the local ledger transfer against the original offer, source, destination, exact raw amount, and transaction, then receives the confirmed transfer if needed.
8. Either side can call `property_paid_job_status`. It reconstructs recent NIP-17 events and reports claims and invoice state; it does not replace ledger verification.

## Protocol and boundaries

- Job scope and delivery summary stay in private NIP-17 messages. The listing stays public on NIP-15 relays. Relay URLs and message metadata remain observable to those relays.
- XNO amount is an exact positive decimal integer in raw. Seller and buyer wallets must both use the same configured network (`live` or `dev`); the network is bound into the payout offer terms and mismatches fail closed.
- Payment goes directly from buyer to the seller's configured account. Property holds no funds and offers no escrow, forced refund, delivery guarantee, quality judgment, or arbitration. A signed delivery event proves only that the seller identity sent that claim.
- The buyer must invoke payout after reviewing the delivery claim. There is no automatic payment, acceptance oracle, dispute resolution, or refund. A public listing reference is not an authenticated contract between the listing author, Nostr identity, and Nano account.
- The payment tool is a wallet side effect. It can send on live network if the buyer explicitly configured a live XNO wallet; the invocation uses the existing local amount caps and idempotent trade ID. A confirmed Nano send is irreversible.
- The workflow does not use a central checkout server. Discovery and private messages use the selected Nostr relays; the local wallet and ledger checks run on the user's computer.
- The status reconstruction reads at most 100 recent messages for the pair. If an event is outside that window, status may be incomplete; preserve the request, payout, and receipt message IDs.
- BTC/XMR paid-job settlement and the human PWA checkout are not included. Existing BTC/XMR direct-trade tools are local test-network coordination only.

## Tool inventory

The fixed MCP schemas and names are in [`../agent/tools.manifest.json`](../agent/tools.manifest.json). The workflow adds seven tools: request, respond, deliver, request payout, pay payout, verify payout, and status. No tool has shell access or arbitrary endpoint access.
