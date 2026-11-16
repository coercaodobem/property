# Property relay on your computer

**English** · [Português (Brasil)](README.pt-BR.md)

The relay is Geode from Amethyst, reused under the MIT license. It runs without root and listens on loopback only by default, so an unencrypted service is not exposed to the internet.

```bash
./property/relay/start.sh
```

- Default address: `127.0.0.1:7447`.
- Persistent database: `~/.local/share/property-relay/events.db`.
- Configuration: `~/.config/property-relay/geode.toml`.
- On Linux, new configurations limit each client to 120 EVENTs/minute (burst 60) and 600 REQs/minute (burst 120). Existing files keep their settings; if they have no `[rate_limits]` section, the Linux launcher adds these defaults once.
- The Linux launcher caps each relay process file at 1 GiB by default. Set `PROPERTY_RELAY_MAX_FILE_BYTES` to another value in bytes, a multiple of 1024 from 1024 bytes through 1 TiB. Linux enforces this per file, not as an aggregate directory quota. If a database file reaches the cap, the OS rejects further writes and may terminate the relay process; check its status, free or migrate storage deliberately, and then restart it.
- On Linux, the Property launcher sweeps local retention on startup and every hour: NIP-40-expired events are removed, and events older than 365 days are pruned by default. In `[database]`, change `max_event_age_seconds` to another non-negative age, or set it to `0` to keep non-expiring events indefinitely; set `retention_sweep_interval_seconds = 0` to disable scheduled cleanup. Local pruning does not publish NIP-09 deletions and cannot erase copies on other relays.
- The file-size cap bounds each database/WAL file, not aggregate directory usage. Keep backups and monitor free disk space; NIP-09 deletions and this relay's retention policy cannot erase copies on other relays.
- Stop with `Ctrl+C`.

## Optional campaign operator API

`campaign-engine.mjs` and `campaign-operator.mjs` provide a local operator interface for an embedding process that supplies the node signer, a wallet/ledger adapter, and a relay publisher. The operator exposes nine JSON-RPC methods over standard input/output: inspect, accept, reject, list, reconcile, refund, set publication scope, export accounting, and prune terminal campaign data. The stdio adapter opens no TCP listener.

This API is not currently started by the plain Geode launcher. A host must wire it to its own local signer, exact-payment ledger adapters, and relay publisher. Acceptance creates a dedicated payment destination; a signed campaign is published only after the local ledger verifies the exact amount and confirmation policy. Rejection creates no payment destination, so an automatic return is unsupported and is never advertised. Campaigns remain opt-in for each node. Publication scope, local accounting, and retention controls are per-node.

Optional environment variables:

```bash
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT=7447 ./property/relay/start.sh
```

For a public bind, changing the address is not enough. Put TLS and network protections in front of it, set a canonical URL in the configuration, review per-client rate limits for your capacity, and plan backups and disk monitoring. Rate limits and the per-file cap reduce resource abuse but do not prevent Sybil clients or guarantee availability. The default command needs no password, root access, or firewall changes.

The Java 21.0.13 runtime and Geode 1.20.0 for Linux x86_64 are included under `dist-parts/` as 129 binary segments. `SHA256SUMS` pins every segment's hash; `manifest.txt` pins the reconstructed archive size and SHA-256 (`b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a`). This image was rebuilt offline from the recorded Geode sources, including Property's local retention sweep; the build output is pinned, but bit-for-bit reproducibility is not asserted. The archive contains only the generated `geode/` tree from `:geode:geodeImage`; it was compared file by file with `geode/build/geode-image/geode` and no differences were found. Verification steps and provenance limits are in [`dist-parts/PROVENANCE.md`](dist-parts/PROVENANCE.md). The launcher reconstructs the archive in a private user directory, verifies its full SHA-256, and only then extracts and runs it. It downloads no code at runtime. On x86_64, it needs neither a preinstalled Java runtime nor root; if segments are missing, the fallback build requires JDK 21 and Gradle.

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
