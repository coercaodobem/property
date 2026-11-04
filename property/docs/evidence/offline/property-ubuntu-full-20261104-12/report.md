# Property offline test run

Run: property-ubuntu-full-20261104-12
Profile: full
Candidate: f13bf27ed9cf21de4a74ba514154d1611548107f
Observed HEAD matches candidate: true
Working-tree state SHA-256: 2708d3a92010c059d8404ba9701c57478ab61a572c2280dcc2a0bec65cd662b0
Requested executor: Luna Max
Actual executor: Codex GPT-6
Actual executor source: Active Codex task runtime; identity is provenance, not a gate.
Executor matches request: false
Isolation: PASS
Result: BLOCKED

## Gates
- G00: PASS
- G01: PASS
- G02: BLOCKED
- G03: NOT_RUN
- G04: NOT_RUN
- G05: NOT_RUN
- G06: NOT_RUN
- G07: NOT_RUN
- G08: NOT_RUN
- G09: NOT_RUN
- G10: NOT_RUN
- G11: NOT_RUN
- G12: NOT_RUN

## Case totals
- PASS: 8
- BLOCKED: 5
- NOT_RUN: 62

## Case results
- G00-01 — PASS: Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.
- G00-02 — PASS: Routes, firewall, proxy policy and loopback were checked without public probes.
- G00-03 — PASS: Two and seven real Geode relays completed with isolated loopback endpoints.
- G00-04 — PASS: Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.
- G01-01 — PASS: The local smoke runner completed.
- G01-02 — PASS: Bridge and native launcher integration both completed.
- G01-03 — PASS: Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.
- G02-01 — PASS: Pinned origins, local licenses, package hashes and asset locality passed; the missing cached Gradle distribution was recorded and no rebuild/download was attempted.
- G02-02 — BLOCKED: Playwright package tree hash does not match the lab manifest.
- G02-03 — BLOCKED: A prerequisite browser case did not pass.
- G02-04 — BLOCKED (not gate eligible): G02-02/03 browser prerequisites did not pass.
- G02-05 — BLOCKED (not gate eligible): G02-02/03 browser prerequisites did not pass.
- G02-06 — BLOCKED (not gate eligible): G02-02/03 browser prerequisites did not pass.
- G03-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G03-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G03-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G03-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G03-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G03-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G04-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G05-07 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G06-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G06-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G06-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G06-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G06-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G07-07 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G08-07 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-01 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G09-02 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G09-03 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G09-04 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G09-05 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G09-06 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-01 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-02 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-03 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-04 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-05 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G10-06 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-01 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-02 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-03 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-04 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-05 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G11-06 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-01 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-02 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-03 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-04 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-05 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.
- G12-06 — NOT_RUN (not gate eligible): G00–G08 não passaram por completo; os gates dependentes não foram iniciados.

## Isolation findings
- No isolation blocker was recorded.
