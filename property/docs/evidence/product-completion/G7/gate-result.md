# G7 automated offline gate — trade state and payment verification

**Result:** `PASS_AUTOMATED_OFFLINE` on Ubuntu Linux x86_64. Candidate source: `907577fa378b0f09c25ef13fd4f02eed975eab6d`; product runtime inventory SHA-256: `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`.

The fixed-count trade state, conversation, encrypted configuration, and private-ledger runs all passed. BTC used regtest with P2P disabled; Monero used offline fakechain; Nano used the dev network with zero peers. The G7-only mode ran no G8 campaign cases. No mainnet, public relay, external endpoint, real participant, or real funds were used.

| Acceptance | Result | Evidence |
| --- | --- | --- |
| Trade state | 50 state fixtures per currency (150 total); 30 unverified wallet-identity binding cases; 60 tamper cases rejected; no invalid fixture settled. | [`trade-state.json`](fixed-run-02/trade-state.json) |
| Trade conversation | 10 offer/accept/payment-request/local-verification journeys per currency; no settlement from peer claims; disputes, cancellation, and repeat sync covered. | [`trade-conversation.json`](fixed-run-02/trade-conversation.json) |
| Configuration and journal | BTC/XMR/XNO local-test adapters accepted; unsafe networks/endpoints, wrong password/identity, and corrupted authentication tag rejected; journal mode `0600`. | [`trade-config-store.json`](fixed-run-02/trade-config-store.json) |
| Private-ledger integration | Per currency: 10 invoices, 10 valid receipts, 10 lost-observer-response cases, 10 restarts, and 10 idempotent duplicate reconciliations; no duplicate credit/spend. BTC reorg reopened state before reconfirmation. XMR unlock and Nano account/source/raw/block hash checks passed. | [`private-ledger-integration.json`](fixed-run-02/private-ledger-integration.json), [`private-node-binary-hashes.json`](fixed-run-02/private-node-binary-hashes.json) |
| Gate-order isolation | Runner scope `G7_PRIVATE_LEDGER_ONLY`; G8 campaign cases explicitly not run. | [`private-ledger-run.json`](fixed-run-02/private-ledger-run.json) |

Source/binary hashes and fixed-run output digests are in [`fixed-run-02`](fixed-run-02/). Verify with `sha256sum -c SHA256SUMS` from that directory.

This proves only the listed local fixtures. Mainnet settlement remains disabled; wallet ownership is not proven by Nostr identity, and this does not provide trustless escrow or guarantee delivery. Human review and other operating systems were not included.
