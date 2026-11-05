# Property Direct CLI status

Property Direct does not currently ship a command-line chat client. The CLI documentation from its Ghostly source was removed from this page because the corresponding `packages/cli` workspace is not present in this repository; its commands and install instructions would not work for Property.

For the supported agent interface in the main Nostr-based Property app, use [`property/agent/README.md`](../../agent/README.md) and the [agent-first implementation plan](../../docs/plano-agentes-human-first.md). That bridge has a separate identity and does not connect to Property Direct profiles or conversations.

Property Direct's browser app is available at <https://coercaodobem.github.io/property/direct/>. Headless Direct access remains unimplemented and must be added with its own identity, transport, and offline compatibility tests before it is advertised.
