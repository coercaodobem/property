# Property Direct for the web

Property Direct is an experimental peer-to-peer client served as a static web app. It is separate from Property's Nostr PWA and does not share Nostr identities, relays, or conversations.

The app is published at <https://coercaodobem.github.io/property/direct/>. English is the default; choose **Português (Brasil)** in Settings → Language to switch this device. User-written names and message bodies are never translated.

Build it from this directory with Node.js 22 or newer:

```bash
npm ci
npm run build:web
```

The build emits the static bundle into `property/web/direct/` for GitHub Pages. Dependencies are pinned in `package-lock.json`; the shipped web client disables executable mini-app bundles and loads its own application files from this repository's published files.

The peer-to-peer transport is adapted from the upstream Ghostly implementation. It is not Nostr and is not part of Property's relay network. Preserve the upstream MIT license and notices in this directory.
