# G1 gate result — protocol contracts and threat boundaries

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Frozen source candidate: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8). Its runtime tree SHA-256 is `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`, matching G0.

All seven acceptance cases passed: 800 valid/invalid protocol vectors and 800 malformed-input cases across eight event families; 50 duplicate and 50 reordered copies per family; BTC/XMR/XNO unit and ambiguity checks; 50 repeated XNO payment/receipt commands; 50 repeated campaign offer, payment, and refund operations; and all 87 sections of `bash property/tests/run-smoke.sh`.

The gate ran through `property/tests/offline/run-isolated.sh`; the user/network namespace changed, loopback remained available for local fixtures, and proxy variables were removed. No public relay, mainnet, funds, or non-Ubuntu system was used. Machine-readable reports, source hashes, and detached checksums are in [`fixed-run-04/`](fixed-run-04/).

The protocol contract records what signatures, encrypted envelopes, relay acceptance, and wallet observations prove. It makes no claim of trustless Nano escrow or guaranteed delivery.
