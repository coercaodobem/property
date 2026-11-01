# Consolidated Property retest status

- Candidate: `305ae9ab2d0c89755a8323aed787b2e3b65b087f`
- Result: **BLOCKED**
- Cases: PASS=70, BLOCKED=4
- Requested executor: Luna Max; actual executor: Codex GPT-6; identity match: false

## Gate status

- G00: PASS
- G01: PASS
- G02: PASS
- G03: PASS
- G04: PASS
- G05: PASS
- G06: PASS
- G07: PASS
- G08: PASS
- G09: PASS
- G10: PASS
- G11: PASS
- G12: BLOCKED

## Retests and preserved soak

- G10-05: PASS — [retake report](later-gates/retakes/G12-06-harness-retest/later-gates-report.json)
- G11-02: PASS — [retake report](later-gates/retakes/G11-02/later-gates-report.json)
- G12-01: PASS — [retake report](later-gates/retakes/G12-01/later-gates-report.json)
- G12-06: PASS — [retake report](later-gates/retakes/G12-06-harness-retest/later-gates-report.json)
- G11-03: PASS, 17998.554 real seconds, 299 probes, 0 losses, 3 reconciled restarts. The approved five-hour evidence is reused; no soak was rerun.

## Remaining blockers

- G12-02: BLOCKED — No Windows x64 host or VM, PowerShell, or compatible local emulator is available. GitHub Windows CI is connected and supplemental only.
- G12-03: BLOCKED — No macOS Apple Silicon host or compatible VM is available. GitHub macOS CI is connected and supplemental only.
- G12-04: BLOCKED — No Android SDK/emulator, ADB, USB device tree, or connected Android lab device is available.
- G12-05: BLOCKED — No macOS/Xcode, xcrun, iOS simulator, or attached iOS lab device is available.
- EXECUTOR_IDENTITY: BLOCKED — Requested Luna Max; actual Codex GPT-6.
