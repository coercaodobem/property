# G3 gate result — human PWA identity and local recovery

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Frozen source candidate: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

The gate passed 30 seeded identity create/unlock/lock cycles, with wrong-password and tampered-vault rejection in all 30; 20 encrypted backup/restore cycles; 20 signed handle-collision fixtures; and 25 Chromium journeys across fresh install, returning session, lock/unlock, restore, corrupt vault, no-relay/offline send, and denied storage. All 25 browser journeys passed visible-state, accessible-control, and no-false-delivery assertions. English/Portuguese labels matched for 24 controls; keyboard journeys passed. The proxy recorded 444 denied relay requests and zero completed external requests; browser storage contained no password/private key.

The result is automated Linux-browser evidence, not a physical mobile or other-OS test. No public relay or external identity service was used. Reports and SHA-256 evidence hashes are in [`fixed-run-02/`](fixed-run-02/).
