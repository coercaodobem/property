# Archived Ghostly source reference

This directory preserves upstream Ghostly source for research and feature comparison. It is not a Property app, is not built or published by the Property Pages workflow, and must not be exposed as a second client.

Property has one user-facing app: the existing PWA at <https://coercaodobem.github.io/property/>. Its interface, identity, conversations, Nostr events, and user-selected relays belong to the implementation in `property/web/`. Recreate compatible Ghostly interactions inside that PWA; do not ship Ghostly's independent transport, identity, or message store as part of Property.

This archived source is not a runtime dependency. Preserve its upstream MIT license and notices when referring to or adapting source material.
