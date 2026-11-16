# G2 gate result — self-contained build and release provenance

**Result: PASS — automated/offline on Ubuntu Linux x86_64.** Frozen source candidate: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

All nine G2 acceptance criteria passed. Two clean worktrees built byte-identical release outputs. The browser gate completed 25 local PWA journeys, recorded zero external host requests, zero dynamic executable loads, zero page errors, and blocked browser background egress attempts. Missing-bundle and altered-checksum fixtures were rejected before installation; the offline package/install/update/CLI/uninstall checks, SBOM/license coverage, fail-closed metadata policy, and secret/generated-file scan passed.

This gate used the newly authorized Ed25519 trust anchor. The Ubuntu archive digest is `2d51240a76ed902101b3284454f76c0a6a8aad6070916f29f446005283923c70`; the signed release-manifest digest is `f5626dc23063a97011b2c5f4d25e6c0d63578644bb4a9843b174bd0139762b01`. The public key fingerprint remains subject to manual verification against the exact trusted source commit documented in the installer guide. This records a deterministic build; it does not by itself publish the release.

Machine-readable evidence is in [`fixed-run-03/`](fixed-run-03/). No public relay, mainnet, funds, or other operating system was used.
