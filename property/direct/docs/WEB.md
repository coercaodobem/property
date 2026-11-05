# Property Direct in a browser

Property Direct is published as a static progressive web app (PWA) at <https://coercaodobem.github.io/property/direct/>. The page runs the peer in the browser; this repository does not provide a central Property Direct messaging backend. This app is a separate peer-to-peer client from the main Nostr-based Property PWA.

## Install it

- **iPhone or iPad:** open the site in Safari, choose **Share**, then **Add to Home Screen**.
- **Android:** open it in a supported browser and choose **Install app** or **Add to Home screen**.
- **Desktop:** use the browser's **Install** action when available, or keep using the app in a tab.

The interface opens in English. **Settings → Language → Português (Brasil)** switches the app on this device. Install prompts, push notifications, calls, and background behavior depend on the browser and operating system; a mobile PWA cannot be treated as an always-on relay.

## Offline behavior and storage

The service worker caches the static app shell so a previously opened app can start without a network connection. Profile and conversation data are kept in that browser's storage. Offline startup does not mean a message was delivered: communication resumes only when a peer and a supported transport path are reachable.

Browser storage may be cleared by the user, browser settings, or device storage pressure. Export and verify a profile backup before clearing site data or moving to another browser profile. The main Property Nostr app and Property Direct have separate profiles and histories; neither app can restore the other's identity.

## Runtime and privacy boundary

The published app is static and includes its runtime code in the repository build. It does not load executable code from a CDN or install mini-app bundles at runtime; mini-app execution is disabled in this Property web build. A browser app still trusts the origin that serves its JavaScript, so verify the repository and deployment before entering profile credentials or importing a backup.

The application peer lives only while the browser context is running. Browsers may suspend background tabs, especially on mobile. This browser app does not promise an always-awake phone or a continuously available node.

## Build or self-host

From the repository root:

```bash
cd property/direct
npm ci
npm run dev -w @ghostly/web
npm run build:web
```

The development server is for local work. The static production output is written to `property/web/direct/` and built with the `/property/direct/` base path used by GitHub Pages. To self-host, serve the output over HTTPS at that path or configure the build base and verify every route and service-worker scope for the chosen origin.

Relevant implementation: `apps/web/`, `packages/browser/`, and `apps/ui/`. The browser architecture and supported transport limits are described in [TRANSPORTS.md](TRANSPORTS.md) and [DHT-DELIVERY.md](DHT-DELIVERY.md). Installation steps are in [INSTALLATION.md](INSTALLATION.md).
