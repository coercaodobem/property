# G4 gate result — direct communication, relay recovery, and PWA

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Candidate: [`4ec3ae5100e2aa39832a3312a5fca1a145080f1d`](https://github.com/coercaodobem/property/commit/4ec3ae5100e2aa39832a3312a5fca1a145080f1d).

All 35 fixed cases passed: five message-delivery helper cases, six isolated-relay matrix cases, and 24 browser/PWA cases. The browser suite includes direct and group history search, 10 PWA opens with all relays offline, and 10 opens with one loopback relay. The six-identity, five-relay matrix passed 1,500 private messages with zero unauthorized decryptions, 100 public events, 40 partition transitions, 20 conflicting updates, 10 relay restarts, 20 retries, and 10 fixtures in each failure category. Tests used synthetic identities, local relays, and no funds or public relay traffic.

The failure in the previous run was caused by message rendering removing the selected historical-search highlight during an asynchronous rerender. The candidate preserves the selected result across rerenders of that conversation; G04-14 passed for both direct and group history.

See [`fixed-run-09/`](fixed-run-09/) for reports, screenshots, source digests, and `SHA256SUMS`. Network and payment limitations remain as stated in the plan; this gate is not a human security review or proof of delivery/read receipts.
