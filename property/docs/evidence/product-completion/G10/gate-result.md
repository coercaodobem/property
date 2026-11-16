# G10 gate result — release, Ubuntu package, and contributor onboarding

**Result: PENDING external publication.** The offline checks below passed against release candidate `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. The public versioned release, exact-tag CI, and post-upload digest verification are still missing.

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

## Remaining G10 items

1. Create the public versioned release and upload the prepared archive, signed manifest, checksums, SBOM, and public signing key.
2. Run and pass CI on the exact release tag. The current tag trigger has not run; the successful branch CI above is not a substitute.
3. Download the published assets and verify their public digests against the signed manifest.

The GitHub connector available to this task can read release data but cannot create a release. The release page redirects to GitHub sign-in, so no tag or public assets have been created. The branch/session must be authenticated before these publication steps can be completed. Windows, macOS, Android, and iOS validation remain `PENDING` and were not run.

## Candidate and evidence

- [`build-verification.json`](fixed-run-01/build-verification.json)
- [`package-offline-report.json`](fixed-run-01/package-offline-report.json)
- [`rollback-cycles.json`](fixed-run-01/rollback-cycles.json)
- [`GitHub CI and publication state`](fixed-run-01/github-ci-status.json)
- [`publication-status.json`](fixed-run-01/publication-status.json)
- [English launch kit](../../../launch-kit.md) · [Português (Brasil)](../../../launch-kit.pt-BR.md)

This gate is not complete while tag CI, release upload, or public digest verification is pending.
