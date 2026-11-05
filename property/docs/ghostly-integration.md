# Ghostly UX adapted inside Property

[Ghostly](https://github.com/MiguelMedeiros/ghostly) is an upstream reference for conversation interactions and interface details. Property has one user-facing app: its existing PWA at `https://coercaodobem.github.io/property/`. This integration adapts selected interaction patterns inside `property/web/`; it does not add a second app, identity, message store, or transport.

## Product boundary

- Keep Property's existing Nostr identity, local message store, Nostr events, and user-selected relays.
- Adapt compatible interactions inside the Property PWA and use its existing relay connections.
- Do not bundle or publish a second Ghostly-derived client. Ghostly is a design reference, not a runtime dependency.
- Adapt protocol-dependent behavior to Nostr. Features that cannot be carried safely by the current Nostr flows stay out until they have a compatible design and validation gate.

## Integrated in Property

- Private-message replies use the NIP-17 `kind:14` `e` reference to the parent message. Property creates one rumor and wraps that same event for both participants, so its reply ID is consistent on both devices. Received replies keep the rumor event ID. The reply preview and jump action use local history only.
- Private reactions use NIP-17 gift wraps containing NIP-25 `kind:7` reactions. They remain in the same chat and use the participants' configured inbox relays.
- Private group conversations are created from the existing New conversation flow and stored in Property's existing conversation and message stores. A room is keyed by its sorted participant public keys. Messages use a NIP-17 `kind:14` rumor with the other members in `p` tags and an optional `subject`; Property creates a separate gift wrap for every participant, including the sender, and routes each envelope to that participant's published kind-10050 inbox relays. The client caps rooms at 10 participants, including the sender, and supports replies, reactions, saved messages, and forwarding in the same conversation UI.
- NIP-17 rooms do not provide membership approval, an administrator, or reliable leave/removal controls. Each member must already have published an inbox list that the sender can discover through their configured relays. Create a room with people who have agreed to participate. Groups larger than 10 need a more suitable protocol.
- Messages can be bookmarked in the existing local message store. Bookmarks stay on this device and are not published to relays.
- Forwarding creates a new encrypted NIP-17 message from the same Property identity for each selected existing conversation. The result reports local copies separately from relay-confirmed envelopes; it does not claim delivery solely because a copy was saved locally.
- In-chat search filters the current conversation's locally rendered messages. It ignores letter case and accents, highlights matches, and lets the person move between results. It does not search relays, publish a query, or place it in the URL.
- Re-rendering an open conversation keeps the visible message anchored when the person is reading older messages. If they were already at the bottom, the conversation stays at the bottom.
- These interactions use the existing black-and-yellow Property brand and English/Português (Brasil) language choice.
- GitHub Pages builds and publishes only the Property PWA from `property/web`.

Reply tags and Chat Rooms follow the current [NIP-17 definition](https://github.com/nostr-protocol/nips/blob/master/17.md), including its guidance to use a more suitable protocol for rooms larger than 10 people. Message bodies and local quote previews remain encrypted or local; relays do not receive their plaintext.

## Not claimed as integrated

Calls, file transfer, voice messages, wallets, and mini-apps are not claimed as integrated. Each needs a Nostr-compatible design, security review, and fixed-count validation. Ghostly's independent P2P transport is not part of Property. A mobile PWA may be suspended by the operating system and is not an always-on relay.
