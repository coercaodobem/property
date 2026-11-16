# Linux relay runtime provenance

**English** · [Português (Brasil)](PROVENANCE.pt-BR.md)

This directory contains Geode 1.20.0 and OpenJDK 21.0.13 for Linux x86_64. The image was rebuilt offline from the Amethyst source baseline `948135f7dbbae81d79a0b985282ce673397a7618` plus the four recorded Property retention source changes in `property/relay/runtime-dependencies.json`. The build used Gradle 9.8.2 and Temurin JDK 21.0.13+9 with `--offline`; no dependencies were downloaded. The generated image hash is pinned, but bit-for-bit reproducibility is not asserted.

## Recorded checks

- Build command: `gradle :geode:geodeImage --offline --no-daemon --console=plain`.
- `geode --version` returned `geode 1.20.0`; bundled Java reported `21.0.13` (Temurin build `21.0.13+9`).
- Reconstructed archive SHA-256: `b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a` (67,366,437 bytes).
- `SHA256SUMS` records all 129 512-KiB segments; `manifest.txt` and `relay-package-smoke.mjs` verify each part, total size, and archive digest.
- The archive contains 171 entries: 142 regular files and 29 directories, all under `geode/`; no symbolic links or unsafe absolute/parent paths were found.
- The archive was extracted and recursively compared with `geode/build/geode-image/geode`; no differences were found.
- Windows and macOS packages retain the earlier Geode source image digest and were not rebuilt with this Linux retention change. Their platform gates remain pending.

These local checks document the relationship between this repository's source, build output, and segmented runtime. They are not an upstream attestation, vulnerability scan, or claim of reproducible compilation.
