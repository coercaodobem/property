# Offline Ubuntu release

The release bundle contains the static Property PWA, the Ubuntu x86_64 Geode relay image, the local MCP agent package, license notices, an SPDX 2.3 SBOM, checksums, and a detached Ed25519 signature. The PWA is static and uses no runtime CDN or remotely loaded executable. The agent uses Node.js 22 or newer and has no external Node packages. The relay's Java 21.0.13 runtime and Geode 1.20.0 image are bundled; the Geode image was rebuilt offline from the recorded source inputs, with its output hash pinned. Bit-for-bit reproducibility is not asserted.

## Verify and install

Use a clean Ubuntu/Linux x86_64 checkout and keep the signing key outside the repository. The public key used for verification must be trusted independently from the release bundle.

```bash
node property/release/verify-offline-bundle.mjs \
  --bundle /path/to/release-bundle \
  --public-key /path/to/trusted-release-public.pem

bash property/release/install-offline.sh \
  --bundle /path/to/release-bundle \
  --trusted-key /path/to/trusted-release-public.pem \
  --prefix "$HOME/.local"
```

The installer verifies the signature, archive digest, file list, and SBOM before changing the prefix. It installs no service and opens no network listener automatically. It does not modify user agent or relay data directories.

## Run and remove

```bash
~/.local/bin/property-web 8080
~/.local/bin/property-relay
~/.local/bin/property-agent --version
bash property/release/uninstall-offline.sh "$HOME/.local"
```

The web launcher serves only on `127.0.0.1`; open `http://127.0.0.1:8080/` in a browser. The relay defaults to loopback and stores its database under `${XDG_DATA_HOME:-$HOME/.local/share}/property-relay`. The agent communicates through MCP stdio. Removing the package preserves local agent and relay data.

## Rebuild and signing

The PWA is a static-file package; there is no npm install or remote dependency resolution. The release builder requires Node.js 22.22.1, GNU tar 1.35, gzip 1.14, and a clean worktree. It rebuilds the package from the repository's pinned relay image. The Geode/JRE image was separately rebuilt offline using the recorded Gradle/JDK toolchain; its provenance does not claim bit-for-bit reproducibility.

```bash
node property/release/build-offline-bundle.mjs \
  --source /path/to/clean/property-checkout \
  --output /path/to/new/empty/release-bundle \
  --signing-key /secure/location/property-release-ed25519.pem
```

The command writes the signed manifest, public key, detached checksums, and release archive. Never place a private signing key in the source checkout or release archive. The public key in a bundle proves internal signature consistency only; compare its fingerprint with a public key obtained from the trusted Property source before relying on it.
