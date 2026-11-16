# G8 gate result — relay campaigns and operator accounting

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Tested source candidate: [`5a8c6f2bce3a09f71098005f8eea240245a3bf38`](https://github.com/coercaodobem/property/commit/5a8c6f2bce3a09f71098005f8eea240245a3bf38). The fixed-count reports and checksums are in [`fixed-run-01/`](fixed-run-01/).

## Evidence

- [`campaign-fixed-count.json`](fixed-run-01/campaign-fixed-count.json): 20 campaign lifecycle fixtures per currency (BTC, XMR, XNO), exactly one durable decision for each valid signed offer, five invalid signatures rejected per currency, and 10 disabled/rejected offers per currency with no payment destination and `UNSUPPORTED_RETURN`. The operator API returned all nine methods over stdio, without opening TCP.
- [`private-ledger-summary.json`](fixed-run-01/private-ledger-summary.json): 10 distinct exact-payment transactions, 10 unique destinations, and 10 signed relay publications per currency on private Bitcoin regtest, Monero fakechain, and Nano dev. All seven ledger cases passed, including one confirmed/idempotent underpayment refund on each private test ledger.
- Accounting exports reconcile every recorded row for each currency. Retention removes campaign content/address data while preserving signed decisions as replay tombstones.
- Campaign display uses the English default label `SPONSORED · PAYMENT NOT VERIFIED BY THE CLIENT` and its Brazilian Portuguese translation. Rendering makes no request; the fixture scan found no click/view counters or third-party analytics.
- Public-relay/mainnet traffic, real funds, and external endpoints: none. RPC credentials, payment addresses, and raw transaction references are omitted from the committed summary.
- The `run-smoke.sh` suite includes the fixed-count G8 operator test. The operator is an embeddable local JSON-RPC stdio API; the plain Geode launcher does not start it. A host must provide the local signer, ledger adapters, and event publisher. This integration boundary is documented in the relay READMEs.

## Reproduction

```sh
node property/tests/offline/campaign-g8-fixed-count.mjs property/docs/evidence/product-completion/G8/fixed-run-01/campaign-fixed-count.json
node property/tests/offline/g08-ledger-smoke.mjs --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
bash property/tests/run-smoke.sh
```

The runtime binary SHA-256 values are preserved in `private-ledger-summary.json`. The private-ledger runner binds RPCs to loopback, disables peers, and uses no mainnet. `SHA256SUMS` covers the committed fixed-run reports and manifest.

This is automated integration evidence, not a human security audit. Other operating systems and human review remain outside this execution.
