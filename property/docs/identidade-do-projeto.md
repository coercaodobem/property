# Property Project Identity

**English** · [Português (Brasil)](identidade-do-projeto.pt-BR.md)

**Status:** product vision and record of the first local implementation on `modelo-mvp`; the app has an initial deployment, and Property branding/URL publication has separate validation records in the test plan.

**Updated:** 2026-10-31.

## Purpose

Property is a Nostr-based client for communication and digital community. People use an installable web interface on a phone or computer and control their own identity. On first use, the client randomly selects two relays from a bundled list, saves them locally, and connects after identity activation; people can replace them at any time. The interface must not own accounts or become a mandatory message intermediary.

The project aims to reuse as much working Amethyst code as possible instead of rebuilding proven components from scratch. Execution remains autonomous: code used by Property belongs in its repository and published package, with no executable code fetched from outside services at runtime.

## Principles

1. **Identity stays under the person's control.** There is no central account server. The client creates a random Nostr key using a cryptographically secure source, protects it locally with a password, and supports recovery with a recovery secret. The browser retains identity between sessions and can stay signed in on that device by choice, with manual lock and a local idle policy. A username is a profile identifier, not the key.
2. **A password is not a private key.** The password unlocks a random key encrypted in local storage. A password-resistant key derivation function, with implementation and parameters pinned in the project, protects the key. The password is not sent to relays or the app host. Losing both the password and recovery secret means losing access; there is no central reset.
3. **Private messages use end-to-end encryption.** Individual conversations use a mature, compatible Nostr protocol, initially NIP-17 after reviewing its specification and reused implementation. Sender and recipient can read the content; relays and the host see ciphertext and protocol-observable metadata.
4. **Connect directly to relays.** JavaScript in the browser opens secure connections directly to the relays stored on the device. A fresh install randomly selects two from a bundled list; people can replace them in settings. GitHub Pages serves static app files; it does not receive or forward message content. Public relays can see the user's IP address and public event metadata.
5. **Relay forwarding is voluntary.** When enabled, the PWA can forward signed public events between selected relays. NIP-17 gift wraps are forwarded only when addressed to the local identity, and only to that identity's inbox relays; the app does not decrypt them. The bridge does not read or alter other people's envelopes. It is limited to 60 events and 2 MB of outgoing traffic per minute, counting each destination, and only runs while the PWA is active.
6. **Keep the layers clear.** The interface is a client; relays transport and store events under their own policies; people can run nodes that provide services and remain online on PCs. Mobile browser forwarding is best effort, may use mobile data, and is neither a public inbound relay nor an always-on service. Do not add a custom P2P protocol before proving it is needed.
7. **Do not promise background execution.** On a phone, the person can enable node collaboration while the browser/app is active. The operating system may suspend the PWA; the project does not promise an always-on mobile relay, screen-on operation, root access, or hidden execution. PCs can run nodes continuously.
8. **Keep code auditable and the package self-contained.** Source code, dependency versions, and runtime artifacts belong in the repository/package. The client does not load executable scripts, modules, fonts, or trackers from CDNs at runtime. Builds and source versions must be identifiable and verifiable.
9. **Make decentralization practical.** A person can choose multiple relays and run a node. A relay failure or refusal must not turn the app host into a central communication point.
10. **Fund nodes voluntarily and transparently.** A node may accept or reject paid marketing campaigns in BTC, XMR, or XNO. Acceptance comes before payment. Paid campaigns are labeled as sponsored, kept separate from messages, and use no centralized click or view tracking.

## Product and experience

- **First use:** create or recover an identity, explain recovery clearly, use the two locally saved relay suggestions or replace them, and start a conversation without a terminal. The browser can retain a session; plaintext passwords are never stored.
- **Communication:** private messages, conversations, and public/group spaces use supported and validated Nostr protocols.
- **Agents:** an independent Nostr identity can message any valid public key directly over NIP-17, without a Property invitation, pairing, or approval. Agent conversations are identified and kept separate; a person can block locally, and incoming messages are never executed. Human review, independent security review, external interoperability, and platform coverage still require their own evidence.
- **Hangout:** the first version is a public Nostr kind 1 feed, fetched and published directly to selected relays. Closed communities/groups are not part of the initial implementation.
- **Node campaigns:** the PWA can optionally read signed events and display them separately from Hangout; this is off by default and local to the device. It sends no click/view telemetry and contains no wallet. The relay library's campaign engine and BTC/XMR/XNO adapters were exercised in G07–G08 with private local networks/wallets. This does not activate a production node-operator flow; security review and production policy are still required before real funds are used.
- **Marketplace:** the first version publishes and discovers offers in NIP-15 format. The current specification is a draft marked not recommended; this release is a compatibility experiment. Purchases, checkout, custody, and escrow are not implemented. Product listings and node advertising are separate capabilities.
- **Nodes:** prefer PC nodes for continuous availability; mobile browser collaboration is voluntary and limited to the time the app remains active.
- **Distribution:** the PWA works in a browser and can be added to the home screen where supported. The main path requires neither an app store nor root access.

## Name and code origin

The project is called **Property**; the web product, install manifest, icon, and visible flows use that name. Upstream Amethyst source remains identifiable in the fork, with its license, history, and authorship preserved. Code Amethyst requires is adapted in this repository and distributed with it; runtime dependencies are not fetched from upstream hosts. `modelo-mvp` is the working branch and records the pinned upstream snapshot and Property adaptation commits.

## Reusing Amethyst

Amethyst is the primary technical base. Its public repository identifies an MIT license, separates the Android app, Nostr Quartz library, shared Commons modules, and desktop app, and lists NIP-15 and NIP-17 support. This provides substantial reusable protocol, model, cryptography, relay, product-flow, and test foundations.

The pinned source is commit `948135f7dbbae81d79a0b985282ce673397a7618`. `coercaodobem/property` publishes the adapted snapshot; full upstream history remains in Amethyst. The Geode relay is reused with its runtime. The PWA uses local `nostr-tools`, not a web build of the selected Compose/Quartz stack. Compatible improvements should keep evaluating upstream reuse and record source and license.

The Amethyst repository describes Android/desktop, not a ready-made PWA. Compose UI and Android-specific APIs are not assumed to work in a browser without technical proof. If no supported web target exists, keep the reused protocol core and build a thin web layer inside the Property repository. Do not rewrite validated protocol logic just to standardize technology.

Before incorporating a module, review its license and transitive dependencies, preserve MIT/copyright notices, record commit and source, remove dynamic build references such as snapshots, and bring runtime code/dependencies into the repository or bundle. Nothing needed at runtime may be loaded from Amethyst, Maven, JitPack, or a CDN when the user opens the app. The current web version bundles `nostr-tools@2.25.2` because Quartz KMP does not publish a JS/WASM target; its dependency chain needs auditing before a public beta.

Initial audit references: [Amethyst repository](https://github.com/vitorpamplona/amethyst), [README and architecture](https://github.com/vitorpamplona/amethyst/blob/main/README.md), [MIT license](https://github.com/vitorpamplona/amethyst/blob/main/LICENSE). These links are research references, not runtime dependencies.

## Hosting and trust

During development, use local or controlled staging environments; an institutional website is not required before the app is ready. For launch, GitHub Pages can publish the static app from the public Property repository. The project website may share the app's domain or use a separate domain.

Pages distributes files; it is not a backend. Messages and events go directly from the browser to relays. The HTTPS host remains a trust root for a PWA's first visit and updates; reviewed releases, signed tags, reproducible artifacts, and mirrors help verify distribution but do not make the domain irrelevant.

## Out of initial scope

- Guaranteeing that a mobile browser node runs continuously while suspended.
- Creating relays, encryption protocols, or a custom P2P system before evaluating existing options.
- Centralized accounts, server-side authentication/password recovery, or remote key storage.
- Advertising based on centralized impressions, clicks, reading, or profiles.
- Launching an institutional/marketing site before the app is functional and reviewed.

## Platforms and currencies

The target includes Windows, macOS, Linux/Ubuntu, Android, and iOS. Relay packages include Linux x86_64, Windows x64, and macOS Apple Silicon; the PWA is the common interface. Installation and operation require evidence per system; Intel Mac and other architectures remain pending. Android/iOS do not yet have a validated, continuously active Property relay.

Offers declare BTC, XMR, or XNO. Atomic values are integer strings, with no cross-currency conversion or automatic exchange rates. New campaigns use `property-sponsored-v2`; legacy XNO events remain readable. See [payment details](pagamentos.md). No client reader or declared transaction hash proves settlement.
