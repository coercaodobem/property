# Property Central Execution Plan

**English** · [Português (Brasil)](plano-central.pt-BR.md)

**Status:** the adapted Amethyst snapshot, Property PWA, and Geode runtime are published on `coercaodobem/property`, branch `modelo-mvp`. Ubuntu offline results and outstanding items are recorded in the [central test plan](plano-de-testes-central.md). The complete offline scope, payment campaign engine, independent audits, and deferred platform cases are not all complete.
**Updated:** 2026-11-04.

## Goal

Deliver Property as a Nostr client that works as a PWA in mobile and desktop browsers, supports private communication, keeps identity under local control, and connects to relays chosen by each person. Reuse as much Amethyst code and testing as practical while keeping the complete runtime package inside the public Property repository.

This document organizes implementation. See [project identity](identidade-do-projeto.md) for the product definition and the [central test plan](plano-de-testes-central.md) for verifiable acceptance criteria.

**Offline validation policy:** the maintainer chooses the active executor. The test plan requires G00–G12, internet egress blocked, real app journeys, seven local relays and bridges, controlled failures, and private payment networks. Full certification is `PROPERTY_SCOPE_OFFLINE_PASS`. The current intermediate profile may complete all applicable Ubuntu cases while native Windows, macOS, Android, and iOS/iPadOS cases remain `PENDING`; those cases neither count as `PASS` nor block the Ubuntu profile. Historical results do not approve a new candidate. Public publication, physical-device validation, and platform certification have separate evidence.

## Consolidated decisions

| Topic | Decision |
|---|---|
| Existing code | Audit and fork the public Amethyst repository, preserve attribution and provenance, and reuse compatible modules and tests before writing equivalents. |
| Primary target | A PWA for phone and computer browsers. A project marketing site belongs to the release phase, after the app is ready. |
| Amethyst compatibility | Amethyst provides Android/desktop apps and shared Nostr modules; do not assume its current UI is a PWA. Prove the web target and reuse portable protocol code. |
| Identity | Generate a random Nostr key locally. A password protects/unlocks the key; it is not itself converted into the private key. Keep the account locally and allow an explicitly persistent session, with manual/inactivity locking. Never store the password in plaintext or create a central login server. |
| Private messaging | Use an interoperable Nostr protocol. NIP-17 is the initial choice, subject to review of the current specification and upstream implementation. |
| Transport | The client connects directly over secure WebSockets to multiple relays. GitHub Pages serves static app files only. |
| Nodes | A PC can run a relay continuously. A phone may relay best-effort while the PWA is active; background operation is not promised. |
| Dependencies | Do not load executable code externally at runtime. Pin versions, keep runtime code and dependencies in the repository/bundle, preserve licenses, and avoid mutable snapshots or refs. |
| Hosting | When ready, publish the static PWA through GitHub Pages from the public Property repository. Hosting is not a communications backend. |
| Marketplace and Hangout | The initial Hangout is a public Nostr kind 1 feed. The marketplace publishes/discovers NIP-15 offers; NIP-15 is a draft marked not recommended. Checkout and custody are out of scope. |
| Node sustainability | The PWA supports optional, signed campaigns, separate from messages and without click/view telemetry. The local relay library has offer/acceptance/reconciliation/refund logic and BTC/XMR/XNO adapters; G07–G08 use private local networks. Node-operator activation is not yet integrated as a production product flow. |

## Amethyst fork and product adaptation

The pinned source is Amethyst snapshot `948135f7dbbae81d79a0b985282ce673397a7618`; preserve modules and upstream attribution notices. The public Property repository contains the adapted snapshot, not the entire upstream history. Full upstream history remains in Amethyst. Do not merge old local backups into the published branch; they may contain unsanitized fixtures.

1. Clone `https://github.com/coercaodobem/property.git`, branch `modelo-mvp`, when contributing. Keep `vitorpamplona/amethyst` as an upstream reference; never push Property changes there.
2. Keep product components under `property/web`, `property/relay`, `property/tests`, and `property/docs`. Verify the maintainer remote URL; forks may use a different name.
3. Preserve reusable Geode/Quartz and Amethyst modules. The current web UI vendors `nostr-tools` because the selected Quartz target does not provide JavaScript/WASM; this PWA is not the Compose UI rebuilt for the web.
4. Use Property in product copy, manifests, icons, and artifacts. Preserve upstream namespaces, marks, licenses, and legacy identifiers needed to read existing data.
5. Record version, hash, source, and license for bundles. Review dependency updates; never load executable code from a CDN at runtime.
6. Publish `property/web` through `.github/workflows/property-pages.yml`; verify workflow, URL, and hashes of the served artifact.

```bash
git clone --branch modelo-mvp https://github.com/coercaodobem/property.git
cd property
./property/relay/start.sh
```

For a separate upstream audit, clone `vitorpamplona/amethyst`, select exactly `948135f7dbbae81d79a0b985282ce673397a7618`, and compare the preserved modules. Do not replace the Property branch with that checkout without reapplying and reviewing the Property adaptations.

## Execution phases

### 0. Freeze scope and evidence

- Keep product identity, architecture, and test documents aligned.
- Distinguish confirmed requirements, technical hypotheses, and work not yet done.
- Before a public release, identify the reviewed commit and protocol version.

**Deliverable:** the MVP scope and acceptance criteria are internally approved.

### 1. Audit Amethyst and prove the web path

- Select and record an exact Amethyst commit; do not build against an unpinned mobile branch.
- Inventory modules, APIs, transitive dependencies, licenses, and tests.
- Identify what can be reused: Quartz and Nostr logic, events, relays, cryptography, identity, NIP-17, NIP-15, and existing tests.
- Evaluate Commons/Compose and Kotlin Multiplatform browser targets. Build a small proof that connects to a relay from a browser without fetching external runtime code.
- If the UI cannot be reused reliably in a browser, preserve the portable protocol core and implement a thin PWA UI rather than recreating protocol logic.
- Confirm MIT and dependency obligations before copying, compiling, or distributing code.

**Gate:** document which modules were reused, ported, or unsuitable. Do not claim compatibility without a build and test.

### 2. Create a self-contained Property base

- Preserve fork history and attribution; record upstream, commit, imported files, and licenses.
- Put chosen runtime code in the Property repository or final bundle; do not load CDN scripts, remote snapshots, or runtime dependencies during use.
- Pin dependencies and build toolchains, inventory components, and make builds repeatable where the stack supports it.
- Define boundaries between PWA, reused protocol core, local storage, relays, and node processes.

**Gate:** open the app with external executable-code access blocked and prove every executable asset comes from the Property package. Data connections to user-selected relays remain allowed.

### 3. Local identity and private messages

- Create identities from cryptographically secure random keys generated in the browser.
- Protect the key in password-encrypted local storage. Never send the password or private key to Pages, relays, or telemetry.
- Implement local recovery and device migration tests; explain that losing both password and recovery secret has no central reset.
- Reuse and validate Amethyst or upstream-library NIP-17 cryptography/events; do not invent cryptography.
- Implement relay selection, direct communication, synchronization, deduplication, and disconnected/partial-connection states.

**Gate:** sender and recipient can read the conversation; relays and third parties cannot read its content; a new session restores only with authorized recovery.

### 4. PWA and controlled distribution

- Build a responsive, installable interface with an offline shell and updates that do not erase identity.
- Test Chrome on Android, Safari on iOS, desktop browsers, and other target browsers; record install/background differences.
- Use localhost/staging during development. Do not launch the project website before the app is ready.
- At release, publish a reviewed static artifact from the public Property repository through GitHub Pages; protect the publication source and identify releases.
- Verify that the interface does not send events, messages, or credentials to the host.

**Gate:** a reviewed static bundle works in mobile and desktop browsers; traffic capture shows direct relay connections and no remote runtime-code dependency.

### 5. Nodes and continuity

- Prioritize a PC relay with continuous operation, failure recovery, storage limits, and relay selection.
- Allow phone collaboration only as a voluntary best-effort action while the PWA is active. Forward signed public events between selected relays. Forward NIP-17 gift wraps only when they target the local identity and only to its inbox relays. Exclude the source relay, deduplicate IDs, check signatures/age/type, and cap forwarding at 60 events and 2 MB of outbound traffic per minute, counting each destination. Do not present a mobile PWA as an always-on inbound relay.
- Do not advertise an always-on phone relay or require a lit screen, root access, or paid service.

**Gate:** run G11-03 using the fixed counts in the Central Test Plan: 300 probes, three restarts, nine reconciled partition events, zero loss, and count-based checkpoints. Document mobile behavior as best effort.

### 6. Hangout, marketplace, and sustainability

- After messaging is established, develop Hangout and the marketplace using compatible events and reusable Amethyst components.
- Build a node-campaign flow: signed content/proposal; local review; accept/reject; if accepted, BTC, XMR, or XNO, an amount in atomic units, a dedicated address, and publication only after confirmation verified by the currency adapter.
- Do not charge if rejected before payment. Handle unexpected, late, or incompatible payments under an explicit refund policy using a new transfer. For XMR, authenticate the refund address; do not assume a transaction reveals its sender. Obtain consent for fees/net amount. Do not put the user's wallet in the PWA.
- Keep Monero/Nano wallets under operator control and separate from Nostr identity. Run each wallet RPC on the operator's host with authentication/loopback; leave `enable_control` disabled unless operationally necessary. If enabled, RPC must bind only to loopback or have equivalent protection outside the node; never expose it to the internet.
- Clearly label sponsorship, allow a local preference, and do not report clicks/reads to advertisers.

**Gate:** approve campaign policy, financial states, and privacy through G07–G08, using the real engine and private local Bitcoin/Monero/Nano networks with no internet or real funds. A public testnet or mock success cannot replace this validation.

### 7. Beta and release

- Execute the [Central Test Plan](plano-de-testes-central.md) in order; build missing harnesses, fix defects within authorized scope, and keep sanitized evidence per requirement/case/gate. Complete `PROPERTY_UBUNTU_OFFLINE_PASS` first. Native cases on other systems may remain pending for a later phase. A missing feature or a required case not run in the current profile prevents that profile from passing.
- Obtain independent review of cryptography, identity, dependency chain, copied code, and node permissions.
- Only then prepare the project site and public GitHub Pages distribution, with versioned release, visible source/commit, and recovery/update procedure.

**Release gate:** `PROPERTY_SCOPE_OFFLINE_PASS` on the release candidate, independent review, and the planned device/install validations pass; no critical open defects; published version and artifact match the reviewed commit. An offline lab result does not certify public networks or hardware that was not tested.

## Current implementation snapshot

- **PWA:** responsive shell, manifest/icon, offline cache, IndexedDB, PBKDF2-SHA-256 + AES-GCM vault, optional persistent session using a non-exportable `CryptoKey`, 30-minute lock, encrypted backup, 1:1 NIP-17, relay settings, public kind 1 feed with relay origin, NIP-15 listing/publishing/editing/withdrawal, and a voluntary best-effort bridge between selected relays. The bridge forwards NIP-17 gift wraps only to the local identity's inbox relays and does not promise background execution. Pages was previously enabled and validated under the former name; Property URL validation is recorded in the test plan.
- **NIP-17:** kind 10050 is published by an explicit action. Discovery verifies signatures and forwards each gift wrap only to the corresponding recipient's inbox list. Without a discovered kind 10050 list, the client does not attempt to send.
- **Relay:** Geode 1.20.0 built with JDK 21 and packaged with a JRE for Linux x86_64. Its portable tarball is stored in 130 binary segments; `property/relay/start.sh` reassembles and verifies SHA-256, writes to the user's directory, and binds to `127.0.0.1:7447` by default.
- **Node campaigns/payments:** `property/relay/campaign-engine.mjs` persists offers, signed decisions, reconciliation, publication, and refund requests. `ledger-rpc.mjs` provides adapters for Bitcoin Core, Monero Wallet RPC, and Nano RPC. G07–G08 exercise the library and real nodes/wallets in private local networks. This proves local trials, not production campaign activation: operator workflow, production policy, and independent review remain before real-fund use.
- **Atomic amounts:** NIP-15 publishes the numeric price required by the draft plus an exact `price_atomic` decimal integer and explicit `currency`. `price_raw` remains for XNO compatibility. Monero uses 10¹² piconero/XMR; Nano uses 10³⁰ raw/XNO. Local cases check 1 raw, 1 XNO, decimal commas, and rejection of exponents/excess precision. Marketplace checkout and purchases remain out of MVP scope.
- **Not delivered in the MVP:** operator activation for the campaign engine; background mobile bridging; public inbound relay on a phone; NIP-29 group administration; marketplace checkout, orders, purchases, custody, and payment.

## Source and dependency policy

- GitHub is the public source and may host static files. Served content must match a reviewed Property release.
- Amethyst is an upstream source for audit and integration, not a runtime dependency. After integration, the client does not query Amethyst to run.
- Bundles must not import JavaScript, CSS, fonts, WebAssembly, or executable configuration from CDNs. Relays provide protocol data, not app code.
- Record Amethyst commit and licenses and retain MIT notices. Inventory transitive dependencies.
- Pin build dependencies and hashes; avoid branches, SNAPSHOT versions, and mutable production artifacts. Distinguish build artifacts from code fetched when a person runs the product.
- Sign tags/releases and publish artifact hashes. Plan reproducible builds and mirrors so trust does not depend on one download button.
- Never store seeds, private keys, passwords, or signing secrets in the repository.

## Open items and external dependencies

- Finish the security and dependency audit of the pinned Amethyst source.
- Preserve snapshot provenance and legal notices; do not replace published history with local backups.
- Retain all 130 Geode runtime segments with their published hashes.
- Verify the Property Pages workflow, URL, manifest, and served hashes after distribution changes.
- Validate the PWA on Android and Safari/iOS, including installation, mobile sync, and complete user journeys.
- Finalize password derivation, local encryption, and recovery compatibility parameters after the prototype.
- Define node, Hangout-community, marketplace, and campaign retention/abuse policies.
- Define the final domain, visual identity, and project website operation for release.

## Platform and currency extensions

The target includes Windows, macOS, Linux/Ubuntu, Android, and iOS. Relay packages include Linux x86_64, Windows x64, and macOS Apple Silicon; the PWA is the shared interface. Mac Intel and other architectures remain pending. BTC is accepted for offers and v2 campaigns (1 BTC = 10⁸ satoshis) alongside XMR and XNO. Marketplace checkout remains pending. Atomic values are integer strings; currencies are not converted and no exchange rate is fetched. New campaigns use `property-sponsored-v2`; legacy XNO events remain readable. See [payment details](pagamentos.md) and [data migration](migracao-property.md).

The native computer matrix result recorded on 2026-10-31 is historical and does not satisfy the current fixed-count G11-03 gate or prove physical Android/iOS operation. Current platform status is defined by the latest [test-plan record](plano-de-testes-central.md), not by this historical result.
