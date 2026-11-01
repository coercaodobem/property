# Property offline test run

Run: property-full-netns-20261031-12
Profile: full
Candidate: 7aff8e448898e674f8448a2dd847a64faceda8cd
Observed HEAD matches candidate: true
Working-tree state SHA-256: f4340846c92e8ee361fadd29b0741aa425b92a2d1b8862f6e1445d29df686efc
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
- PASS: 10
- FAIL: 3
- NOT_RUN: 61

## Case results
- G00-01 — PASS: Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.
- G00-02 — PASS: Routes, firewall, proxy policy and loopback were checked without public probes.
- G00-03 — PASS: Two and seven real Geode relays completed with isolated loopback endpoints.
- G00-04 — PASS: Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.
- G01-01 — PASS: The local smoke runner completed.
- G01-02 — PASS: Bridge and native launcher integration both completed.
- G01-03 — PASS: Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.
- G02-01 — PASS: Pinned origins, local licenses, package hashes and asset locality passed; the missing cached Gradle distribution was recorded and no rebuild/download was attempted.
- G02-02 — PASS: Fresh root and /property/ pages loaded from the local bundle with no external HTTP, WebSocket or deny-proxy attempts.
- G02-03 — PASS: Remembered identity and the cached PWA shell reopened after the local server stopped; relay status remained offline.
- G02-04 — FAIL: locator.fill: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('#new-password')[22m
[2m    - locator resolved to <input minlength="12" type="password" id="new-password" autocomplete="new-password"/>[22m
[2m    - fill("Property-offline-test-2026!")[22m
[2m  - attempting fill action[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not visible[22m
[2m    - retrying fill action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not visible[22m
[2m    - retrying fill action[22m
[2m      - waiting 100ms[22m
[2m    60 × waiting for element to be visible, enabled and editable[22m
[2m       - element is not visible[22m
[2m     - retrying fill action[22m
[2m       - waiting 500ms[22m

- G02-05 — FAIL: Case has not started.
- G02-06 — FAIL: Case has not started.
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
