# Product completion evidence

## Close-out status

The previously approved G0–G9 reports remain recorded in their gate folders; this G10 close-out did not rerun those gates. G10 passed for the Ubuntu Linux x86_64 release source commit `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. The public release, exact-tag CI, and all seven public asset digest checks are complete. Each gate report retains its own candidate SHA and evidence.

| Gate | Recorded status | Evidence |
|---|---|---|
| G0–G9 | `PASS` in existing gate reports | See each gate folder; prior runs were not repeated for G10 close-out. |
| G10 | `PASS` | [G10 result](G10/gate-result.md), [public digest report](G10/fixed-run-01/public-digest-report.json), [release v0.1.0](https://github.com/coercaodobem/property/releases/tag/property-v0.1.0), [exact-tag CI](https://github.com/coercaodobem/property/actions/runs/43949909425) |

Validation on Windows, macOS, Android, and iOS/iPadOS remains pending and was not part of this Ubuntu-only execution. Public relays and mainnet funds were not used. [Português (Brasil)](README.pt-BR.md)
