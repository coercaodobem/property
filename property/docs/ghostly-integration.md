# Ghostly UX adapted inside Property

Ghostly is a reference for useful conversation interactions and interface details. Its source reference is preserved under [`archive/ghostly-source/`](../../archive/ghostly-source/) with the upstream licenses. Property remains one app: the existing PWA, its Nostr identity, local store, and user-selected relays, served at `https://coercaodobem.github.io/property/`.

## Product boundary

- Keep the existing Property identity, local message store, Nostr events, and relays selected by the user.
- Adapt compatible UX and features inside `property/web/`; there is no separate Property client or second chat application.
- Adapt protocol-dependent behavior to Nostr. Do not import Ghostly's independent P2P transport as a second networking layer.
- Features that cannot be carried safely over the current Nostr flows remain out until a Nostr-compatible design and test gate exist.

## Integrated in this change

- Private-message replies use the NIP-17 `kind:14` `e` reference to the parent message. Property creates one rumor and wraps that same event for both participants, so its reply ID is consistent on both devices. Received replies keep the rumor event ID. The reply preview and jump action use local history only.
- Private reactions use NIP-17 gift wraps containing NIP-25 `kind:7` reactions. The picker is part of the same chat; reaction envelopes are routed only to the participants' configured inbox relays. Property displays each participant's latest reaction per message.
- Re-rendering an open conversation keeps the visible message anchored when the person is reading older messages. If they were already at the bottom, the conversation stays at the bottom.
- The reply action, contextual composer, and quoted-message preview use the same Property PWA, local identity, black-and-yellow brand, and existing English/Português (Brasil) language choice.
- GitHub Pages builds and publishes the single app from `property/web`.

The reply tag follows the current NIP-17 message definition: <https://github.com/nostr-protocol/nips/blob/master/17.md>. It remains encrypted inside the NIP-17 rumor and gift wrap. Relays do not receive the plaintext body or local quote preview.

## Not claimed as integrated

Group chat, calls, file transfer, voice messages, wallets, and mini-apps are not claimed as integrated. Each needs a Nostr-compatible design, security review, and fixed-count validation before implementation. Ghostly's independent P2P transport is not part of Property. The Property PWA is not an always-on mobile node.

Every user-facing Property feature stays in this same app and uses the Property identity and selected Nostr relays. Ghostly is an upstream UX reference, not a separate Property product.
