# Product completion evidence

The active profile is Ubuntu Linux x86_64 with offline, fixed-count automated checks. The evidence directory preserves each run's source identifier and limitations. **The implementation plan is not complete until G10's public release, exact-tag CI, and public asset digest checks pass.** [Português (Brasil)](README.pt-BR.md)

| Gate | Current record | Candidate / note |
|---|---|---|
| G0 | `PASS` in [execution report](G0/execution-report.json) | Initial clean snapshot; source SHA is recorded in the report. |
| G1 | `PASS` in [fixed run 02](G1/fixed-run-02/execution-report.json) | Source SHA `2e19327fc724d7ea300a7876bbbb6d26bbd4647a`. |
| G2 | `PASS` in [fixed run 02](G2/fixed-run-02/offline-package-report.json) | Source SHA `5a4bc8b42a80be9d4b4d1ef62398822b4353a17f`. |
| G3 | `PASS` in [fixed run 01](G3/fixed-run-01/manifest.json) | Source SHA `bbaf64735c4e233bdcf3759dcebb229e6e4d224f`. |
| G4 | `PASS` in [gate result](G4/gate-result.md) | Gate-specific run records candidate SHA `4ec3ae5100e2aa39832a3312a5fca1a145080f1d`. |
| G5 | `PASS_AUTOMATED_OFFLINE` in [gate result](G5/gate-result.md) | Gate-specific evidence is preserved in the same folder. |
| G6 | `PASS_AUTOMATED_OFFLINE` in [gate result](G6/gate-result.md) | Gate-specific evidence is preserved in the same folder. |
| G7 | `PASS` in [gate result](G7/gate-result.md) | Private test ledgers; no mainnet funds. |
| G8 | `PASS` in [gate result](G8/gate-result.md) | Private test ledgers; no public campaign relay. |
| G9 | `PASS` in [current gate result](G9/gate-result.md) | Candidate SHA `111926e34fd9e654cf4d0fe550c8ba5c267542ba`; scan coverage limits are explicit. |
| G10 | `PENDING` in [current gate result](G10/gate-result.md) | Offline package and browser checks passed; public versioned release, tag CI, and uploaded digest verification remain. |

G0–G8 are historical approvals with their original candidate identifiers; they were not repeated in the current G9/G10 work. The integrated smoke suite and branch CI passed on the G9/G10 candidate, but that does not rewrite the earlier gate records as same-commit runs. No Windows, macOS, Android, or iOS tests were run in this execution.

## Current release candidate

- Source commit: `111926e34fd9e654cf4d0fe550c8ba5c267542ba`.
- Ubuntu bundle: 68,543,468 bytes; SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`.
- Signed manifest SHA-256: `247a22cbd4cde66329194f2bd471bb7c623be877c3ce45975a96c637cac777b5`.
- PWA: [https://coercaodobem.github.io/property/](https://coercaodobem.github.io/property/).
- Versioned release: not published. The browser is signed out, and the GitHub connector has no release-write operation.

Evidence for the current candidate is in [`G9/fixed-run-03/`](G9/fixed-run-03/) and [`G10/fixed-run-01/`](G10/fixed-run-01/). The complete plan stays pending until the G10 public steps above are verified.
