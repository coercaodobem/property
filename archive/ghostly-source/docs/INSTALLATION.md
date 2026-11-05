# Install Property Direct

Property Direct is the browser-based peer-to-peer app in this repository. Its public web build is served from GitHub Pages:

**[Open Property Direct](https://coercaodobem.github.io/property/direct/)**

The first page load needs an internet connection to fetch the static app. After it loads, the browser can install the PWA and reopen its cached interface offline. Offline launch does not deliver messages while no peer or transport path is reachable. Mobile operating systems may suspend background pages; Property Direct is not an always-on mobile relay.

## Install on a phone or computer

- **iPhone or iPad:** open the link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in a supported browser and choose **Install app** or **Add to Home screen** from the browser menu.
- **Desktop:** open it in a modern browser. If the browser offers an install icon or **Install Property Direct**, use it to create an app window.

The app defaults to English. Select **Português (Brasil)** in Settings → Language to use the Brazilian Portuguese interface. Browser and operating-system support for installation, notifications, and background execution varies; only the browser behavior documented and tested for this repository is guaranteed.

## Data and connectivity

Property Direct stores its profile and app data in the browser profile on that device. Export and verify a backup before clearing site data, changing browser profiles, or moving to another device. The app uses its own peer-to-peer transport; it is a separate client from Property's Nostr PWA and does not share identities or message history with it.

## Other platforms

The source tree contains upstream-derived desktop, extension, and mobile work, but this repository does not currently publish Property-branded installers or a browser-store listing for those targets. Do not download Ghostly releases as Property builds. Those packaging and platform checks remain pending until a Property build is published and tested.

## Build the web app from source

From the repository root:

```bash
cd property/direct
npm ci
npm run build:web
```

The static app is written to `property/web/direct/`, which is included in the repository's GitHub Pages deployment. The app's architecture, browser limits, and self-hosting notes are in [WEB.md](WEB.md); test commands and their scope are in [TESTING.md](TESTING.md).

## Source and support

- [Property repository](https://github.com/coercaodobem/property)
- [Property Direct overview](../README.md) · [Português (Brasil)](../README.pt-BR.md)
- [Contributing](../../../CONTRIBUTING.md)
