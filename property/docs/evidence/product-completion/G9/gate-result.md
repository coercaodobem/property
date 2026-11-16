# G9 gate evidence — Ubuntu Linux x86_64

**Result:** `BLOCKED` — the implemented checks below passed, but G9 is incomplete. G10 remains `NOT RUN`, as required by the gate order.

**Candidate:** `67507a33dc7c1ede266d204a3d85aeb0749064af` on `modelo-mvp`. All relay fixtures used loopback; no public relay, mainnet funds, or secrets were used.

## Completed checks

| Check | Result and evidence |
|---|---|
| Geode source build and Linux image | `PASS`: Geode 1.20.0 compiled and packaged offline with Temurin JDK 21.0.13+9 and Gradle 9.8.2. Archive: 67,366,437 bytes, SHA-256 `b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a`, 129 segments. Bit-for-bit reproducibility is not claimed. [`offline-geode-rebuild-report.json`](offline-geode-rebuild-report.json) |
| Automatic local retention | `PASS`: rebuilt binary removed the old synthetic event at startup and retained the newer event (2 records before, 1 after). [`retention-binary-report.json`](fixed-run-02/retention-binary-report.json) |
| Campaign crash and recovery | `PASS`: 2 fixed abrupt-crash cases; recovered relay state contained exactly 1 campaign copy. [`campaign-crash report`](fixed-run-02/campaign-crash/g09-campaign-crash-report.json) |
| Local mute/block/report | `PASS`: 50 cases across 5 synthetic identities and 5 relay fixtures; relay histories stayed unchanged. [`local-moderation-report.txt`](fixed-run-02/local-moderation-report.txt) |
| Rate and storage boundaries | `PASS`: 20 configured limits across 5 EVENT bursts, 5 REQ bursts, and 10 file caps; 60 below/at/above checks, plus 6 invalid file caps rejected. [`rate report`](fixed-run-02/rate-boundary/g09-rate-boundary-report.json), [`storage caps`](fixed-run-02/resource-limits-report.json) |
| Hostile events | `PASS`: 200 inputs (40 each malformed, oversized, duplicate/replayed, stale, and invalid-signature); rejected input caused no state mutation. [`g09-hostile-report.json`](fixed-run-02/hostile-events/g09-hostile-report.json) |
| Signed relay discovery | `PASS`: 100 validation/discovery cases covering expiry, revocation, wrong keys, and unsafe URLs. [`relay-defaults-report.txt`](fixed-run-02/relay-defaults-report.txt) |
| Storage failure and package integrity | `PASS`: lock/config/disk-limit cases failed closed; tampered manifest and missing segment were rejected before execution. [`storage`](fixed-run-02/storage/g09-storage-report.json), [`package`](fixed-run-02/package-hardening/g09-package-report.json) |
| Integrated local suite | `PASS`: 85 test files completed and emitted the final success marker. [`full-suite-summary.json`](full-suite-summary.json) |
| Offline npm advisory check | No known advisories in the local npm cache for the JavaScript lockfile (1,170 dependencies reported). The cache may be stale and this does not cover relay JARs/JRE. [`npm-audit-report.json`](fixed-run-02/npm-audit-report.json) |
| Limited secret-pattern scan | `PASS`: 263 text files scanned, zero matches for four recorded patterns in `property/web`, `property/agent`, and `property/relay`. This is not a complete secret scan. [`secret-pattern-scan-report.json`](fixed-run-02/secret-pattern-scan-report.json) |
| Candidate SPDX SBOM | `PASS`: SPDX 2.3 covers all 414 payload files with 414 records; 413 non-self records have SHA-256 checks, and all 414 have license/provenance metadata. The temporary bundle signature verified with a disposable local key; it was not published. [`sbom-coverage-report.json`](fixed-run-02/sbom-coverage-report.json), [`SBOM.spdx.json`](fixed-run-02/SBOM.spdx.json) |
| License/provenance policy fixtures | `PASS`: 7 checks accept known metadata and reject unknown license, missing source, or missing component metadata. [`license-metadata-policy-report.json`](fixed-run-02/license-metadata-policy-report.json) |

## Items preventing approval

- **Geode JVM tests (`BLOCKED`):** `:geode:test --offline` cannot resolve uncached `junit:junit:4.13.2` and `kotlinx-serialization-core:1.11.0`. The `RelayRetentionTest` is present but the Gradle test suite did not execute; no pass is claimed. [`jvm-test-report.json`](jvm-test-report.json)
- **Automated security scans (`BLOCKED`):** no static security scanner is installed, and no offline vulnerability scanner/database is available for the exact Geode JARs and bundled JRE. `gitleaks`, `osv-scanner`, `trivy`, `syft`, `grype`, `semgrep`, and OWASP Dependency-Check are absent. Compilation, syntax checks, and functional regressions passed, but no JAR/JRE vulnerability coverage is claimed. Offline npm audit covers only the JS lockfile and local advisory cache. [`security-coverage.json`](security-coverage.json)
- **Published release and G10 onboarding (`PENDING`):** only a temporary local bundle was created to verify the G9 SBOM. No public release, installation, update, downgrade, or Pages deployment was performed; G10 has not started.

Windows, macOS, Android, iOS, and iPadOS remain `PENDING`; no build or test on those systems was started. Human review was not an acceptance criterion.

Pages publication is reserved for G10. The `[property-release]` marker was not used.
