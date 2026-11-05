# Property Direct

**English** · [Português (Brasil)](README.pt-BR.md)

Property Direct is an experimental peer-to-peer messaging app adapted from [Ghostly](https://github.com/MiguelMedeiros/ghostly). The default app interface is English; choose **Português (Brasil)** in Settings → Language to change this device. Names, offers, and messages written by users or agents remain unchanged.

**[Open Property Direct](https://coercaodobem.github.io/property/direct/)**

Property Direct and Property's main [Nostr PWA](https://coercaodobem.github.io/property/) are separate clients. They use different identities, transports, and conversation stores; this experimental app does not connect to Nostr relays or share conversations with the Nostr PWA.

The browser build uses the peer-to-peer transport and UX adapted from Ghostly. It is served as a static app under the repository's GitHub Pages path and does not need an app-store listing. The browser can be suspended when backgrounded, so it is not an always-on mobile node.

The app's executable files and third-party dependencies are bundled into the project build. No executable mini-app store is enabled in the published web app. Network communication carries peer discovery and encrypted traffic; it does not download or execute the application from a CDN.

## Build

From this directory, use Node.js 22 or newer:

```bash
npm ci
npm run build:web
```

The build writes the static web app to `../web/direct/`, which is included in the GitHub Pages deployment. `npm ci` uses the checked-in lockfile and applies the checked-in patches. Do not run `apps/ui/scripts/built-in-apps.mjs`; Property Direct ships no built-in remote app bundles.

## Upstream source and license

This adaptation began from upstream commit `138d51872ce569f2f5b7ac68445d4ec59efe5d0d` and selectively ports compatible web-client and extension changes through [`c188787cc2ee27d92e65dac3ef9e82471cdafdde`](https://github.com/MiguelMedeiros/ghostly/commit/c188787cc2ee27d92e65dac3ef9e82471cdafdde) from `MiguelMedeiros/ghostly`. CLI-only and native-release changes are still outside this browser app. The code is under the MIT license; see [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Internal module identifiers and wire-format names remain where changing them would break compatibility. Signed identity-proof statements keep Ghostly's exact v1 wording so existing proofs remain verifiable; the app name, interface, and first-party marks use Property.

For the primary project overview, agent instructions, and Nostr app, see the repository [README](../../README.md), [contribution guide](../../CONTRIBUTING.md), and [Property instructions](../AGENTS.md).
