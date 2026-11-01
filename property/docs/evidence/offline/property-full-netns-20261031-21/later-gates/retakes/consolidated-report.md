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

- G12-02: BLOCKED — Diagnóstico executado; certificação dependente permanece bloqueada por gate anterior (G12). Não há execução Windows x64 real nem VM Windows neste host Linux.
- G12-03: BLOCKED — Diagnóstico executado; certificação dependente permanece bloqueada por gate anterior (G12). Não há macOS Apple Silicon nem VM compatível neste host Linux x86_64.
- G12-04: BLOCKED — Diagnóstico executado; certificação dependente permanece bloqueada por gate anterior (G12). ADB/emulador Android não está instalado ou conectado neste host.
- G12-05: BLOCKED — Diagnóstico executado; certificação dependente permanece bloqueada por gate anterior (G12). Simulador iOS exige Xcode/macOS; xcrun não existe neste host Linux.
- EXECUTOR_IDENTITY: BLOCKED — Requested Luna Max; actual Codex GPT-6.
