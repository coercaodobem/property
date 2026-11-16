# G6 automated offline gate

**Result:** `PASS_AUTOMATED_OFFLINE` on the current implementation candidate `456f1603e55d45d7b55d487b9eeb6099b74a4244`. Product runtime inventory SHA-256: `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`.

The browser ran on Ubuntu Linux x86_64 in an unshared network namespace. Five synthetic Geode relays were loopback-only; zero external HTTP requests and zero page errors were recorded. No public relay, wallet, payment, or real participant was used.

| Scenario | Fixed result |
| --- | --- |
| Hangout and contact | 50 journeys, split 25 English / 25 pt-BR; signed-author verification and relay deduplication passed. |
| Marketplace browser | 50 complete journeys, split 25 English / 25 pt-BR, across BTC/XMR/XNO; publish, discover, contact, labels, and signed withdrawal passed. |
| Local filters | 50 journeys, split by language; text, type, currency, empty results, and same-currency price ordering passed; zero relay queries during filtering. |
| Offer lifecycle and relay convergence | Per currency: 20 offers, 10 edits, 10 withdrawals, 10 expiries; five relays converged and unrelated offers remained. |
| Atomic amount boundaries | 100 values per currency: 50 exact round-trips and 50 invalid values rejected. |
| Conflict ordering | 20 same-author timestamp conflicts and 20 cross-relay out-of-order updates resolved deterministically. |
| Browser cases | All nine fixed G06 cases passed. |

Machine-readable reports, tool hashes, and source hashes are in [`fixed-run-03`](fixed-run-03/). Check all report and manifest digests with `sha256sum -c SHA256SUMS` from that directory.

No human review, non-Ubuntu OS, physical device, public relay, real wallet, or payment was used.
