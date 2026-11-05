# Ghostly UX integration in the Property PWA

Ghostly is a reference for useful conversation interactions and interface details. Its source reference is preserved under [`archive/ghostly-source/`](../../archive/ghostly-source/) with the upstream licenses. The product remains one Property app, served at `https://coercaodobem.github.io/property/`.

## Product boundary

- Keep the existing Property identity, local message store, Nostr events, and relays selected by the user.
- Put compatible UX and features in `property/web/`; do not ship a second app, identity, transport, or conversation store.
- Adapt protocol-dependent behavior to Nostr. Do not import Ghostly's independent P2P transport as a second networking layer.
- Features that cannot be carried safely over the current Nostr flows remain out until a Nostr-compatible design and test gate exist.

## Integrated in this change

- Private-message replies use the NIP-17 `kind:14` `e` reference to the parent message. Property creates one rumor and wraps that same event for both participants, so its reply ID is consistent on both devices. Received replies keep the rumor event ID. The reply preview and jump action use local history only.
- Re-rendering an open conversation keeps the visible message anchored when the person is reading older messages. If they were already at the bottom, the conversation stays at the bottom.
- The reply action, contextual composer, and quoted-message preview use the same Property PWA, local identity, black-and-yellow brand, and existing English/Português (Brasil) language choice.
- GitHub Pages builds and publishes only `property/web`; the PWA shell does not precache another app.

The reply tag follows the current NIP-17 message definition: <https://github.com/nostr-protocol/nips/blob/master/17.md>. It remains encrypted inside the NIP-17 rumor and gift wrap. Relays do not receive the plaintext body or local quote preview.

## Not claimed as integrated

This change does not add group chat, calls, file transfer, or a separate P2P transport. Each requires a compatible Nostr design, dependency/security review, and its own fixed-count validation. The Property PWA is not an always-on mobile node.

The web app remains the only user-facing browser product. The Ghostly project is an upstream UX reference, not a separately published Property client.
