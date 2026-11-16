# Linux relay runtime provenance

**English** · [Português (Brasil)](PROVENANCE.pt-BR.md)

This directory contains Geode 1.20.0 and OpenJDK 21.0.13 for Linux x86_64. The image was rebuilt offline from Property commit `305f4fb9234a5abbb2020739a5316e24af0e6a68`, which adapts the Amethyst source baseline `948135f7dbbae81d79a0b985282ce673397a7618`. The four Geode source-file hashes are recorded in `property/relay/runtime-dependencies.json`. The build used Gradle 9.8.2 and Temurin JDK 21.0.13+9 with `--offline`; no dependencies were downloaded. The generated image hash is pinned, but bit-for-bit reproducibility is not asserted.

## Recorded checks

- Build command: `gradle :geode:geodeImage --offline --no-daemon --console=plain`.
- `geode --version` returned `geode 1.20.0`; bundled Java reported `21.0.13` (Temurin build `21.0.13+9`).
- Normalized archive SHA-256: `f4df2638e6893291e2ef31ee69e2f0fd9791a7d3c5d13688a27f6a61b96843cd` (67,366,883 bytes).
- `SHA256SUMS` records all 129 512-KiB segments; `manifest.txt` and `relay-package-smoke.mjs` verify each part, total size, and archive digest.
- The archive contains 171 entries: 142 regular files and 29 directories, all under `geode/`; no symbolic links or unsafe absolute/parent paths were found.
- The archive uses sorted paths, fixed timestamps, and normalized ownership. The archive was extracted and recursively compared with `geode/build/geode-image/geode`; no differences were found.
- Windows and macOS packages retain the earlier Geode source image digest and were not rebuilt with this Linux retention change. Their platform gates remain pending.

These local checks document the relationship between this repository's source, build output, and segmented runtime. They are not an upstream attestation, vulnerability scan, or claim of reproducible compilation.
