# G8 gate result — relay campaigns and operator accounting

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Candidate: [`3ca0f84a7afda1514e8f061ddb9e7ecc9fceeb5a`](https://github.com/coercaodobem/property/commit/3ca0f84a7afda1514e8f061ddb9e7ecc9fceeb5a). Checksummed reports are in [`fixed-run-02/`](fixed-run-02/).

## Evidence

- [`campaign-fixed-count.json`](fixed-run-02/campaign-fixed-count.json): 20 campaign lifecycle fixtures per currency (BTC, XMR, XNO); all policy, replay, replacement, expiry, invalid-signature, unsupported-return, and retention cases passed. The operator exposes nine JSON-RPC tools over stdio without a TCP listener.
- [`private-ledger-summary.json`](fixed-run-02/private-ledger-summary.json): all seven G08 ledger cases passed. Each currency completed 10 exact-payment campaign publications to 10 unique destinations on Bitcoin regtest, Monero fakechain, or Nano dev. BTC reorganization, XMR confirmation/unlock and chain-pop, and Nano one-raw confirmation checks passed. One signed, confirmed, idempotent underpayment refund was verified per currency.
- The fixed-count accounting export reconciled **69 of 69** rows, with per-currency IDs, amounts, signers, and states. Pending or mismatched payments did not publish success; refund amount mismatches were rejected before broadcast.
- Campaign rendering issued zero client requests and the campaign schema contains no click/view fields. No third-party analytics or external endpoints were used.
- The disposable in-memory relay used for the fixed batch disabled its rate limits so event throttling would not depend on wall-clock speed. Product defaults were unchanged; G9 separately exercises rate-limit boundaries.
- No public relays, mainnet, real funds, or real participants were used. RPC credentials, payment addresses, and transaction references are omitted from the committed summary. G7 was not repeated.

## Reproduction

```sh
bash property/tests/offline/run-isolated.sh node property/tests/offline/campaign-g8-fixed-count.mjs property/docs/evidence/product-completion/G8/fixed-run-02/campaign-fixed-count.json
bash property/tests/offline/run-isolated.sh node property/tests/offline/g08-ledger-smoke.mjs --scope g8-only \
  --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" \
  --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" \
  --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" \
  --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" \
  --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
(cd property/docs/evidence/product-completion/G8/fixed-run-02 && sha256sum -c SHA256SUMS)
```

The operator is an embeddable local JSON-RPC stdio API; the plain Geode launcher does not start it. A host supplies the local signer, ledger adapters, and event publisher. This automated result is not a human security audit or a trustless escrow guarantee. Other operating systems and human review remain outside this execution.
