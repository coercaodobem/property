# G10 gate result — release, Ubuntu package, and contributor onboarding

**Result: PASS.** Offline G10 checks and public release verification passed for candidate 111926e34fd9e654cf4d0fe550c8ba5c267542ba.

## Offline checks passed

- The Ubuntu Linux x86_64 bundle was built twice offline with byte-identical archives. Archive: 68,543,468 bytes, SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`. The sidecar and embedded SPDX SBOM match; the signed manifest and checksums passed package verification.
- The package smoke installed the PWA, Geode relay CLI, and Property MCP tools without network access, rejected missing/altered signatures and metadata, and preserved local data during uninstall.
- Ten clean-profile upgrade/downgrade/rollback cycles passed; all ten rejected corrupted bundles before installation and preserved agent/relay data.
- The exact bundle passed 25 browser journeys with external egress blocked: all 127 PWA files matched the signed manifest, 0 external hosts were accessed, 35 background requests were denied by the local proxy, 58 statically declared scripts per navigation, 1,450 local script requests in total, 0 undeclared/dynamic executable assets, and 0 page errors. See [`browser-egress-report.json`](fixed-run-01/browser-egress-report.json).
- G10-05 passed eight viewport/zoom cases; G10-06 passed 50 direct messages, 100 public notes across four local relays and three bridges; G10-07 passed its synthetic three-member encrypted-group checks; G10-08 passed 24 fixed install-state cycles. Reports and screenshots are in [`fixed-run-01/`](fixed-run-01/).
- The bilingual X, Reddit, and community launch kit passed mechanical checks for all ten texts. Every post fits the project-defined character budget, and each call to action resolves to the repository or contribution guide: [`launch-kit-validation.json`](fixed-run-01/launch-kit-validation.json).
- The active English and Brazilian Portuguese documentation check passed: 63 files and 475 internal links checked, with no broken links: [`documentation-link-validation.json`](fixed-run-01/documentation-link-validation.json). Offline install/upgrade commands and release metadata were also exercised by the package verification and rollback checks above.
- The public PWA is available at [coercaodobem.github.io/property](https://coercaodobem.github.io/property/); the deployed Pages source tree matches the candidate PWA.
- The candidate branch CI run [43922994219](https://github.com/coercaodobem/property/actions/runs/43922994219) passed smoke and Ubuntu relay jobs. The other-OS matrix was skipped, as required by this execution scope.

## Public release and tag verification

- The public release is [Property v0.1.0](https://github.com/coercaodobem/property/releases/tag/property-v0.1.0), with all seven prepared assets.
- Tag property-v0.1.0 points to [111926e34fd9e654cf4d0fe550c8ba5c267542ba](https://github.com/coercaodobem/property/commit/111926e34fd9e654cf4d0fe550c8ba5c267542ba), the source commit recorded in the signed release manifest.
- Exact-tag CI [run 43949909425](https://github.com/coercaodobem/property/actions/runs/43949909425) completed successfully: smoke and Ubuntu relay passed; the other-OS matrix was skipped per scope.
- All seven public assets were downloaded and their sizes and SHA-256 digests matched the prepared files. The archive and SPDX SBOM digests also match the signed manifest; see [public-digest-report.json](fixed-run-01/public-digest-report.json).
- Windows, macOS, Android, and iOS validation remain PENDING and were not run.

## Candidate and evidence

- [`build-verification.json`](fixed-run-01/build-verification.json)
- [`package-offline-report.json`](fixed-run-01/package-offline-report.json)
- [`rollback-cycles.json`](fixed-run-01/rollback-cycles.json)
- [`GitHub CI and publication state`](fixed-run-01/github-ci-status.json)
- [`publication-status.json`](fixed-run-01/publication-status.json)
- [English launch kit](../../../launch-kit.md) · [Português (Brasil)](../../../launch-kit.pt-BR.md)

G10 is complete for the Ubuntu/Linux x86_64 release scope. Other operating-system validation remains pending as explicitly scoped.

## Signing-key transition

The verified public release `property-v0.1.0` remains signed by its historical key and its published asset digests match the signed manifest. The new trusted fingerprint `000dd5016afb1f8eced1ba3de80d93a187f6079ae71398063229626a33bcbe36` is authorized and published in the source branch; G2 records its reproducible two-build evidence. This does not replace or alter v0.1.0. Because the old private signing key is unavailable, the installer documentation requires users to verify the exact trusted source ref and new fingerprint before accepting a subsequent release. No v0.1.1 publication or signature is claimed here.
