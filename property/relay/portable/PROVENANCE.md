# Property relay packages for Windows and macOS

**English** · [Português (Brasil)](PROVENANCE.pt-BR.md)

## Sources

The 49 JARs come from the bundled Geode 1.20.0 package, pinned by SHA-256 `9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`. These JARs were not rebuilt or replaced. Each manifest records the individual library hashes; both packages should have the same inventory.

The runtimes are Eclipse Temurin 21.0.13+9 from the [official Adoptium release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9):

| Target | Original file | Original SHA-256 |
|---|---|---|
| Windows x64 | OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip | `2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628` |
| macOS arm64 | OpenJDK21U-jre_aarch64_mac_hotspot_21.0.13_9.tar.gz | `225bab0a09491ef06835488cd942f5d2befa9a0410a2484f0c8bbcf7506ec09a` |

The hashes were compared with the digest published in the official source's GitHub assets and with the downloaded bytes. This confirms they match the selected source; it is not a security audit of Java or Geode. The packages include runtime license files and `legal` directories; Temurin uses GPLv2 with the Classpath Exception. Geode libraries retain their own licenses and metadata.

## Packaging and launch

`tools/package-property-relay.py` takes JSON describing sources that have already been downloaded and verified (`platform`, `url`, `sha256`, `local_path` fields), reads the original Linux segments, checks their hash, builds deterministic ZIPs, and splits them into 1 MiB chunks. It does not download anything. Each ZIP pins timestamps, ordering, and permissions. Byte-for-byte comparisons also require pinning the Python/zlib versions used for packaging.

Windows preserves the files from the JRE ZIP; macOS uses files from `Contents/Home`, including license files and executable permissions. The launchers pin each ZIP's SHA-256 and verify the reconstructed archive before extraction and launch. They do not resolve versions or download code at runtime.

## Validation and limits

`portable-packages-smoke.mjs` checks every segment, total size, package hash, launcher pin, and JAR identity across platforms. The CI matrix runs the native relay on Windows x64, macOS arm64, and Linux x86_64 with SQLite, NIP-17, BTC/XMR/XNO offers, and persistent restart. Only a completed run demonstrates the result for its respective operating system; see the links in the test plan.

Intel Macs are not included: the snapshot's SQLite driver lacks the required JNI library. Android and iOS use the PWA; desktop packages do not mean a mobile relay runs continuously. Installation on physical devices and signed/notarized distribution are additional gates; G11-03 uses fixed counts described in the central test plan.
