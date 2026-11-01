# Property offline test run

Run: property-g00-netns-20261031-03
Profile: core
Candidate: 7aff8e448898e674f8448a2dd847a64faceda8cd
Observed HEAD matches candidate: true
Working-tree state SHA-256: 50e7af064523ab37208bd16d9bca618937ed3854b09808eae966ba9fdca5dd90
Requested executor: Luna Max
Actual executor: Codex GPT-6
Actual executor source: Active Codex task runtime
Executor matches request: false
Isolation: PASS
Result: FAIL

## Gates
- G00: PASS
- G01: PASS
- G02: FAIL
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
- PASS: 7
- FAIL: 1
- BLOCKED: 5
- NOT_RUN: 61

## Case results
- G00-01 — PASS: Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.
- G00-02 — PASS: Routes, firewall, proxy policy and loopback were checked without public probes.
- G00-03 — PASS: Two and seven real Geode relays completed with isolated loopback endpoints.
- G00-04 — PASS: Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.
- G01-01 — PASS: The local smoke runner completed.
- G01-02 — PASS: Bridge and native launcher integration both completed.
- G01-03 — PASS: Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.
- G02-01 — FAIL: Origin or license verification failed, was interrupted, or lacked a local prerequisite.
- G02-02 — BLOCKED (not gate eligible): G02-01 origin and license prerequisites did not pass.
- G02-03 — BLOCKED (not gate eligible): G02-01 origin and license prerequisites did not pass.
- G02-04 — BLOCKED (not gate eligible): No executor is registered for this required case.
- G02-05 — BLOCKED (not gate eligible): No executor is registered for this required case.
- G02-06 — BLOCKED (not gate eligible): No executor is registered for this required case.
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
- G09-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G09-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G10-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G11-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G11-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G11-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G11-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G11-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-01 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-02 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-03 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-04 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-05 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.
- G12-06 — NOT_RUN (not gate eligible): G02 did not pass; dependent gate was not started.

## Isolation findings
- No isolation blocker was recorded.
