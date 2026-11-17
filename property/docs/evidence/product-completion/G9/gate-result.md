# G9 gate result — automated security and abuse resistance

**Result: PASS — automated/offline on Ubuntu Linux x86_64, with reported coverage limits.** Candidate: `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. No public relays, mainnet test funds, or secret material were used.

## Fixed-count acceptance

- 200 hostile event inputs, 50 local moderation cases across five synthetic identities and five relay fixtures, 20 configured rate/storage limits at their boundaries, and 100 signed relay-discovery cases passed. The integrated Property smoke suite passed all 85 test files; the candidate CI run passed the smoke and Ubuntu relay jobs.
- The exact Ubuntu release bundle and SPDX 2.3 SBOM were verified. The archive is 68,543,468 bytes, SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`; its manifest SHA-256 is `247a22cbd4cde66329194f2bd471bb7c623be877c3ce45975a96c637cac777b5`. The public signing key fingerprint is `60025655e12c534e41003d8d87c3080c33b3e72f86bb19dbcda14182684f670c`; private signing material is not included.
- OSV-Scanner checked 48 Maven and 6 npm packages against offline databases; no known vulnerabilities were reported. Twelve SBOM components were not recognized by those ecosystem scanners. Trivy detected 40 Java packages and reported no known vulnerabilities. The npm audit covered 1,170 dependencies but its local cache freshness is unknown.
- Semgrep OSS ran 43 local rules on 290 tracked files, parsed 100% of input, and reported no scan errors. All 19 matches were triaged: 18 local-loopback/documentation WebSocket matches and one CLI-text false positive. No untriaged finding remains.
- The limited secret scan checked 263 text files against four patterns and found no match; 303 binary or invalid-UTF-8 files were skipped.

## Limits and residual risks

The bundled Temurin JRE is 21.0.13+9, but these scans do not provide direct binary CVE coverage for the JRE. The offline Geode Gradle tests remain `PENDING_SUPPLEMENTAL` because two dependencies are absent from the local cache; that suite is not one of G9's explicit fixed-count acceptance criteria, and no pass is claimed. Geode's plaintext WebSocket listener is loopback-only by default; operators must use a TLS-terminating reverse proxy for public access. Manually exposing its plaintext port remains a configuration risk. Automated checks are not a human security audit.

Full machine-readable coverage and triage: [`security-coverage.json`](fixed-run-03/security-coverage.json), [`security-triage.json`](fixed-run-03/security-triage.json), [`OSV report`](fixed-run-03/osv-candidate-all.json), [`Trivy report`](fixed-run-03/trivy-geode-rootfs.json), [`Semgrep report`](fixed-run-03/semgrep-candidate.json), [`secret-pattern report`](fixed-run-03/secret-pattern-scan-candidate.json), and [`SBOM`](fixed-run-03/SBOM.spdx.json). The CI run is [43922994219](https://github.com/coercaodobem/property/actions/runs/43922994219).

This result records the G9 checks on candidate `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. G0–G8 reports retain their original candidate identifiers; previously passed gates were not rerun.

## Current-branch reconciliation

The current public branch head is [`58d49f85a464a3846f130b435714f124107bb2ba`](https://github.com/coercaodobem/property/commit/58d49f85a464a3846f130b435714f124107bb2ba). The shipped runtime roots `property/web`, `property/agent`, and `property/relay` are unchanged between this head and every recorded gate candidate (G0–G10). The exact-head limited secret scan checked 263 text files against four credential/key patterns and found zero matches; 303 binary or invalid-UTF-8 files were skipped. The machine-readable comparison and scan output are in [`fixed-run-04/`](fixed-run-04/).

G9's dependency and static-analysis results therefore still cover the same shipped runtime. The authorized signing-key rotation is separately covered by G2: the current trusted key fingerprint is `000dd5016afb1f8eced1ba3de80d93a187f6079ae71398063229626a33bcbe36`, matching the two-build G2 evidence. The public v0.1.0 release remains verifiable with its historical key fingerprint `60025655e12c534e41003d8d87c3080c33b3e72f86bb19dbcda14182684f670c`; no cross-signature or re-signing claim is made.
