# Public Explore Feed as the Property Home

## Goal

Make a public, read-only Explore feed the first screen of the Property PWA. Visitors can understand and browse public activity before creating an identity or knowing another person. Private conversations remain private and accessible through the existing navigation.

## Scope

- Reuse the existing Property PWA and its public Hangout posts. Reuse marketplace offers only where the current UI already supports them; do not add payment or marketplace capabilities.
- Reading public posts must not require an identity, contact, or message conversation.
- Publishing, replying, and reacting require an unlocked identity and must use the existing Property/Nostr flows.
- Update the About page’s primary action to open Explore and explain that browsing is available before sign-in.
- Keep English as the default and Portuguese (Brazil) available. Preserve responsive layout and accessible labels.
- Add no separate app, backend, or runtime-loaded dependency.

## Delivery gates

1. **Explore entry:** a fresh visit opens the public feed, including for a visitor without an identity. Conversations remain reachable from navigation.
2. **Honest feed states:** render public posts; clearly explain loading, empty, offline, and error states. Do not fabricate users or activity. Any demonstration content must be explicitly marked and separated from live posts.
3. **Privacy and participation:** never render private-message content in the public feed. Before an identity is unlocked, write actions show the identity step and produce no signed or transmitted event.
4. **About and localization:** About points to Explore and accurately describes guest browsing; English and Brazilian Portuguese strings are present.

## Minimum verification

Use deterministic offline fixtures and a browser smoke at desktop and phone-width viewports:

1. Open a clean session without an identity and confirm Explore appears without a contact or sign-in gate.
2. Render public-post fixtures and confirm private-message fixtures are excluded.
3. Exercise empty and offline states; confirm no fake activity is shown.
4. Attempt a write while signed out; confirm no event is signed or sent, then confirm existing conversation navigation still works.
5. Check the changed About links and inspect the visible flow in the browser.

These checks establish UI and access behavior only. Live relay delivery, real-device behavior, and other operating systems remain separate and unverified by this plan. Do not publish test messages to public relays.
