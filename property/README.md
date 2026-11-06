# Property

**English** · [Português (Brasil)](README.pt-BR.md)

<p align="center">
  <img src="web/assets/property-brand.png" alt="Property logo" width="320">
</p>

A Nostr client with a PWA interface, locally created and protected identity, NIP-17 private messaging, and direct connections to relays. This directory contains the web app, relay launchers for Linux, Windows, and macOS Apple Silicon, and documentation about the Amethyst adaptation.

## `modelo-mvp` branch

The upstream code snapshot is recorded at Amethyst commit `948135f7dbbae81d79a0b985282ce673397a7618`. The `geode` module is reused as a standalone relay. The web interface uses the locally bundled and version-pinned `nostr-tools` 2.25.2 package (Unlicense), because upstream Quartz KMP does not publish a JavaScript/WASM target. No executable scripts are loaded from a CDN at runtime.

## Open the PWA

Serve `property/web` over HTTP(S), for example with `python3 -m http.server 8080 --directory property/web`, and open `http://localhost:8080`. PWA installation requires HTTPS (localhost is an exception). The app shell works offline after its first load; messaging requires reachable Nostr relays.

Property is one PWA with one identity and Nostr transport. Ghostly is a UX reference; compatible conversation improvements live in this app and use its existing identity and relays. The composer includes an offline emoji picker with search, recent choices, and skin tones; message reactions can use the same bundled catalog while leaving the draft untouched. Link previews are optional: the sender explicitly approves a direct HTTPS metadata request, the site may see the sender's IP, and the text-only preview is sent inside the encrypted NIP-17 message. The recipient never fetches the link while opening the message. Messages with a `geo:` URI or supported map link show a local location card without loading map tiles; opening the map is an explicit action that shares coordinates and the device IP with OpenStreetMap. You can share a contact as a Property link, NIP-19 profile code, or QR and open it in the same app. On a fresh install, Property randomly selects two relays from its bundled list, displays and saves them locally on the first screen, and connects after identity activation; relay setup is optional. You can change the pair at any time.

Chat drafts are kept locally per conversation and identity until you send or clear them. See the [Ghostly UX adaptation notes](docs/ghostly-integration.md) for the Nostr-specific choices and features that do not fit this app.

The **Relay bridge** option forwards signed public events between relays selected by the user. NIP-17 gift wraps are forwarded only to the local identity's inbox relays; the client does not decrypt the content to forward it. Local limits are 60 events and 2 MB of outbound traffic per minute, counting each relay destination. The bridge stops when the browser is suspended and may use mobile data.

## GitHub Pages deployment

The app is published at [coercaodobem.github.io/property](https://coercaodobem.github.io/property/) from the public `coercaodobem/property` repository. The `.github/workflows/property-pages.yml` workflow publishes only `property/web` when those files or the workflow change on `modelo-mvp`; it also supports manual runs. Pages uses the **GitHub Actions** source, and the `github-pages` environment allows the `modelo-mvp` branch. Workflow actions are pinned to commit SHAs; the workflow does not change repository settings.

The earlier publication under the previous name was validated by workflow [41130981007](https://github.com/coercaodobem/property/actions/runs/41130981007), by opening the start screen in a browser, and by comparing SHA-256 hashes of the 16 public files with commit `e525f3028391cea6133fe7982b4e342ee576f449`. See the [validation record](docs/evidence/pages-2026-10-30.json). This does not complete the other test-plan gates.

## Start a relay on Ubuntu

From the checkout root, run:

```bash
./property/relay/start.sh
```

The script stores persistent data in `~/.local/share/property-relay` and listens on `127.0.0.1:7447` by default. The branch includes the relay and its Java runtime in verified segments; on first launch, the script rebuilds the archive, checks its hash, and extracts it to the user's directory. This is suitable for local testing. To make a relay public, configure its address, TLS, networking, and storage deliberately.

With Node.js 22, `bash property/tests/run-smoke.sh` runs the local smoke suite without opening ports. `bash property/tests/run-bridge-integration.sh [source-port] [destination-port]` starts two isolated relays on `127.0.0.1`, checks replication/NIP-17/NIP-15, and removes temporary directories at the end. The full offline profile uses a manifest, network isolation, and the fixed G11-03 counts in the [test plan](docs/plano-de-testes-central.md); duration-based runs are not acceptance criteria.

## Known limits

- A PWA does not remain active in the background on a phone: iOS and Android may suspend or terminate the browser.
- The static host serves the interface code; the client opens data connections directly to two bundled public relays selected at random on first use. You can replace them. Public relays can see your IP address and public event metadata.
- Keeping a session on this device is convenient, but reduces protection if someone gains access to an already unlocked browser.
- Hangout and the marketplace are early-stage. Payments, custody, escrow, and automatic node monetization are not enabled in this version.
- The optional campaign reader validates the signature and event fields, uses HTTPS links, and keeps images inline. It does not verify a node-declared BTC/XMR/XNO payment; campaign acceptance, payment, and refund engines are not available in this version.

See the [documentation index](docs/README.md) for English defaults and [Português (Brasil)](docs/README.pt-BR.md). Portuguese editions of the core project records use the `.pt-BR.md` suffix.

For a local MCP agent on Ubuntu/Linux, see the [Property Agent guide](agent/README.md). Agents can message valid public keys directly without invitation, pairing, or Property approval; a person can block an identity locally. The bridge has not been validated with commercial hosts and does not claim A2A compatibility.

## Data migration and payments

See the [Property migration guide](docs/migracao-property.md) for existing data and installations, and [BTC/XMR/XNO payment details](docs/pagamentos.md) for units, event formats, and limitations.
