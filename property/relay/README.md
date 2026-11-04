# Property relay on your computer

**English** · [Português (Brasil)](README.pt-BR.md)

The relay is Geode from Amethyst, reused under the MIT license. It runs without root and listens on loopback only by default, so an unencrypted service is not exposed to the internet.

```bash
./property/relay/start.sh
```

- Default address: `127.0.0.1:7447`.
- Persistent database: `~/.local/share/property-relay/events.db`.
- Configuration: `~/.config/property-relay/geode.toml`.
- Stop with `Ctrl+C`.

Optional environment variables:

```bash
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT=7447 ./property/relay/start.sh
```

For a public bind, changing the address is not enough. Put TLS and network protections in front of it, set a canonical URL in the configuration, and define traffic limits and a storage policy. The default command needs no password, root access, or firewall changes.

The Java 21.0.12.1 runtime and Geode 1.20.0 for Linux x86_64 are included under `dist-parts/` as 130 binary segments. `SHA256SUMS` pins every segment's hash; `manifest.txt` pins the reconstructed archive size and SHA-256 (`9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`). The audited archive contains only the generated `geode/` tree from `:geode:geodeImage`; it was compared file by file with `geode/build/geode-image/geode` and no differences were found. Verification steps and provenance limits are in [`dist-parts/PROVENANCE.md`](dist-parts/PROVENANCE.md). The launcher reconstructs the archive in a private user directory, verifies its full SHA-256, and only then extracts and runs it. It downloads no code at runtime. On x86_64, it needs neither a preinstalled Java runtime nor root; if segments are missing, the fallback build requires JDK 21 and Gradle.

Windows x64 and macOS Apple Silicon packages are included too, with their own test matrix. Intel Mac, other Linux architectures, Android relay, and iOS relay remain pending; on those systems, the PWA is the interface.

## Windows x64

From the checkout root, open PowerShell and run:

```powershell
powershell -NoProfile -File .\property\relay\start.ps1
```

Data lives in `%LOCALAPPDATA%\Property\relay`; configuration is in `%LOCALAPPDATA%\Property\config`. Set `PROPERTY_RELAY_DATA_DIR`, `PROPERTY_RELAY_CONFIG_DIR`, `PROPERTY_RELAY_HOST`, `PROPERTY_RELAY_PORT`, or `PROPERTY_RELAY_CONFIG` to customize it. The runtime is bundled; Java, Python, compilation, root, and an app store are not required. Follow your computer's script execution policy; the launcher does not change it. Press `Ctrl+C` to stop the relay.

## macOS Apple Silicon (arm64)

```bash
./property/relay/start.sh
```

The launcher selects `start-macos.sh` and uses the arm64 package with its Java runtime included. Data is stored in `~/.local/share/property-relay`, and configuration in `~/.config/property-relay`; equivalent `PROPERTY_RELAY_*` variables are supported. The launcher does not modify Gatekeeper or remove quarantine automatically. Intel Mac still needs a compatible package and SQLite driver; do not run the arm64 package as x64.

## Package provenance

Each directory under `portable/` contains segments and a `manifest.json` with hashes, Temurin 21.0.13+9 source information, and individual hashes for every Geode JAR. The JARs match the original Linux package; native runtimes came from official Adoptium releases and were verified with SHA-256. Runtime license files are preserved. See [provenance details](portable/PROVENANCE.md). The launcher does not download or auto-update. These runtimes are not part of the lightweight Pages artifact or browser cache.

`node property/tests/native-relay-integration.mjs` starts an isolated relay, checks messages and BTC/XMR/XNO offers, and verifies persistence after restart. CI runs this flow on Linux, Windows, and macOS arm64. The G11-03 gate exercises three relays and two bridges with 300 probes, three restarts, nine partition events, and fixed resource checkpoints, as specified in the central test plan.
