# G1 gate result — protocol contracts and threat boundaries

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Frozen source candidate: [`a2ac830e2c06715bb0f50e377b8dd12b4f889ca4`](https://github.com/coercaodobem/property/commit/a2ac830e2c06715bb0f50e377b8dd12b4f889ca4). Its runtime tree SHA-256 is `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`, matching G0.

All seven acceptance cases passed: 800 valid/invalid protocol vectors and 800 malformed-input cases across eight event families; 50 duplicate and 50 reordered copies per family; BTC/XMR/XNO unit and ambiguity checks; 50 repeated XNO payment/receipt commands; 50 repeated campaign offer, payment, and refund operations; and all 87 sections of `bash property/tests/run-smoke.sh`.

The gate ran through `property/tests/offline/run-isolated.sh`; the user/network namespace changed, loopback remained available for local fixtures, and proxy variables were removed. No public relay, mainnet, funds, or non-Ubuntu system was used. The isolation evidence, fixed-count reports, source hashes and detached checksums are in [`fixed-run-03/`](fixed-run-03/).

The protocol contract records what signatures, encrypted envelopes, relay acceptance and wallet observations prove. It makes no claim of trustless Nano escrow or guaranteed delivery.
