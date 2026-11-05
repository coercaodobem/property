# Property Direct agent instructions

This directory contains an experimental browser app adapted from Ghostly. Read [the English overview](README.md), [the Brazilian Portuguese overview](README.pt-BR.md), and [`../AGENTS.md`](../AGENTS.md) before changing this app.

- English is the app and documentation default. Preserve the explicit **Português (Brasil)** language choice and its saved setting. Never translate user-generated names, offers, or conversation bodies.
- Keep Property Direct separate from the Nostr PWA: no Nostr relay, identity, or message-history assumptions apply here.
- Preserve upstream MIT and third-party notices. Keep upstream internal identifiers and wire-format strings when renaming them would break data or protocol compatibility.
- The published web build is static. Keep application code and executable dependencies inside the repository build; do not add CDN scripts, fetched mini-apps, or runtime code installation. Mini-app execution is disabled for this web product.
- Do not advertise an always-on mobile relay. Mobile browsers can suspend the page.
- Build from this directory with `npm ci` and `npm run build:web`; the output goes to `../web/direct/`. Do not run the remote built-in-app fetcher.
- For visible UI changes, inspect the built app in a browser. Report exactly which checks ran and any device or deployment checks that remain pending.
