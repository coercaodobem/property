# G7 gate result — trade state and payment verification

**Result: PASS — technical/offline on Ubuntu Linux x86_64.** This result applies to the candidate represented by the evidence files in [`fixed-run-01/`](fixed-run-01/).

## Fixed-count evidence

- [`trade-state.json`](fixed-run-01/trade-state.json): 50 state fixtures for each of BTC, XMR, and XNO (150 total); 30 identity-binding fixtures; 60 tamper cases rejected; zero invalid fixtures reached `settled`; BTC reorg rollback passed; mainnet disabled and no external endpoints.
- [`private-ledger-integration.json`](fixed-run-01/private-ledger-integration.json): 10 invoices, valid receipts, lost observer responses, restarts, and duplicate reconciliations for each currency using private Bitcoin regtest, Monero fakechain, and Nano dev. Exact atomic amounts and signed local journals verified. One BTC confirmation was invalidated and the trade returned to `payment-observed` before reconfirmation. XMR confirmation/unlock and Nano account/source/raw/block-hash checks passed.
- [`private-node-binary-hashes.json`](fixed-run-01/private-node-binary-hashes.json): SHA-256 fingerprints of the pinned local node/client binaries used by the private-ledger runner.
- [`trade-conversation.json`](fixed-run-01/trade-conversation.json): 10 offer/accept/payment-request/seller-reconcile/recipient-local-verification journeys per currency; zero buyer settlements from seller claims; repeated sync safe; dispute and cancellation covered.
- [`trade-config-store.json`](fixed-run-01/trade-config-store.json): all three local test adapters accepted; four unsafe configurations rejected; encrypted config/journal, wrong-password/identity rejection, signature checks, and mode `0600` verified.
- G4/G5 dependency gates were rerun as part of this candidate. G4 passed 34 offline cases with 48 MCP tools and no external traffic. G5 package and contract evidence is in [`../G5/`](../G5/).
- `bash property/tests/run-smoke.sh` completed with `PASS: suíte smoke local concluída`; `git diff --check` passed.
- The existing [G6 browser report](../G6/final/browser-g06-report.json), case `G06-05`, records the marketplace notice that payments/custody are not handled and that a seller's payment rail does not prove wallet ownership.

## Commands

```sh
node property/tests/agent-trade-state-smoke.mjs property/docs/evidence/product-completion/G7/fixed-run-01/trade-state.json
node property/tests/agent-trade-conversation-smoke.mjs
node property/tests/agent-trade-config-store-smoke.mjs
node property/tests/offline/agent-bridge-g4.mjs
node property/tests/offline/g08-ledger-smoke.mjs --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
```

The private-node runner was executed with pinned local binaries and produced the sanitized G7 report above. The raw node logs and RPC credentials were not copied into repository evidence. The fixed-count smoke suite and G4/G5 package checks are part of the local run; see the final execution record for exact candidate SHA.

## Security boundary

The flow is direct payment, not escrow. Mainnet is disabled. A seller's signed settlement notice is unverified on the recipient until that recipient checks its own local node. Nostr signatures do not prove ownership of a wallet/account; the UI labels payment rails as seller declarations. No delivery guarantee, forced refund, arbitration, or custody is claimed.

This gate does not claim validation on another OS, human review, or a production security audit.

Evidence file digests are listed in [`fixed-run-01/SHA256SUMS`](fixed-run-01/SHA256SUMS).
