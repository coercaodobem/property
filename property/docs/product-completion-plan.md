# Property Product Completion Plan

**English** · [Português (Brasil)](product-completion-plan.pt-BR.md)

**Status:** Proposed execution plan; no gate is approved by this document.
**Execution profile:** Ubuntu Linux x86_64 only. All functional acceptance checks run offline in an isolated local lab and use fixed inputs, counts, or state transitions. No human review, participant study, device approval, other operating system, or elapsed-time success criterion is part of this plan.

## 1. Outcome

Complete Property as one decentralized, agent-friendly communication and voluntary-trade product. A person should be able to use the PWA in a browser, communicate with people and agents, browse public Hangout and marketplace content, and start a voluntary trade. An agent should be able to connect through a documented MCP interface and use its own Nostr identity. Independent relays should carry and retain public events and encrypted messages without a mandatory Property messaging server. Relay operators should have a transparent, opt-in path to accept sponsored content and support their node.

The product is censorship-resistant by distribution and user choice; it cannot promise absolute uncensorability. Relays, hosts, ISPs, wallet providers, and national networks may block traffic. Private Nostr messages encrypt content, but relay operators and network observers may still see connection metadata. A PWA may be suspended by its browser or operating system; it is not a continuously running phone relay.

## 2. Baseline recorded in the repository

Treat this as a starting inventory, not a current pass report. G0 must refresh every item against the selected commit.

| Area | Recorded state | Work still needed |
|---|---|---|
| Reused code and distribution | Property adapts Amethyst and has a browser product, local relay code, an Ubuntu/Linux x64 agent package, GitHub contribution material, and a Pages workflow. | Prove which exact source, dependencies, artifacts, and hashes make each deliverable self-contained and reproducible. |
| Browser identity and messaging | The PWA uses Nostr identities and NIP-17 messaging; its current documentation describes local password-protected key storage and relay selection. | Finish recovery, conflict/retry semantics, metadata disclosures, and end-to-end automated journeys; do not conflate local storage with a recoverable account service. |
| Agent connection | A local MCP stdio package exists, with a separate agent identity and direct messaging. Ubuntu/Linux x64 is the recorded tested scope. | Stabilize the public tool contract, installer/package, capability boundaries, end-to-end agent-to-agent and human-to-agent scenarios, and evidence. |
| Hangout and offers | Public social content, offer prices, and signed campaign formats exist in some form. | Verify each complete PWA journey and make listing lifecycle, conflict handling, and payment states consistent. |
| Payments and escrow | Payment URIs, an experimental agent XNO direct-payment path, a separate custodial option, and a dev-only experimental Nano threshold path are documented. BTC/XMR/XNO adapters exist in local relay code. | Connect marketplace flows to verified local chain/wallet state. Do not claim a campaign or event proves settlement. Nano consensus does not enforce Property's threshold release/refund policy; keep that path dev-only and label its trust assumptions. |
| Relay resilience and funding | Local relay/campaign components and earlier partition/restart evidence exist. | Re-run the applicable fixed-count scenarios on the final candidate; exercise partitions, recovery, retention, sponsorship decisions, and accounting as complete user/operator flows. |
| Automated release | Repository contribution, CI, and Pages materials exist. | Pin and inventory all shipped inputs, verify artifacts, and automatically validate a public release from Ubuntu after all implementation gates pass. |

The historical [central test plan](plano-de-testes-central.md) remains the authority for detailed lab isolation and protocol test mechanics. This plan adds implementation deliverables and exit criteria; it does not turn historical evidence into a current pass.

## 3. Execution rules

1. Work on the authorized Property branch and record its base commit, local diff, remote head, tool versions, dependency inventory, and output hashes in an evidence manifest before editing.
2. Execute G0 through G10 in order. A gate is `PASS` only when every listed acceptance check passes on the same candidate commit. A failed check is `FAIL`; a missing tool, unavailable artifact, or incomplete evidence is `BLOCKED`; later gates remain `NOT RUN` until the blocking gate is repaired and rerun in full.
3. Use synthetic identities and private local relay/wallet networks. Do not send test messages to public relays, expose secret keys, use mainnet funds, or publish campaign/test transactions to public networks.
4. Define test data, seeds, counts, protocol limits, and expected state before each run. Repetition counts and deterministic state transitions decide acceptance. Wall-clock duration, soak periods, uptime, response-time thresholds, and scheduled waiting do not decide a result. Harness watchdogs may terminate hangs but never create a pass.
5. Run tests and browser automation on Ubuntu Linux x86_64. A responsive viewport simulation in a Linux browser is a layout check only; it is not evidence for another operating system or physical device.
6. All UX gates use automated checks: browser journeys, DOM assertions, keyboard paths, accessibility-tree rules, localization key parity, and screenshot-diff bounds. No gate depends on a person inspecting a screen, approving a design, or participating in a study. This makes usability coverage measurable but does not claim that automation can replace all human judgment.
7. Never describe a local signature, accepted event, declared amount, invoice, or transaction identifier as paid until the configured local wallet/node reports the required verified state.
8. Store sanitized commands, exit codes, manifests, fixture hashes, per-case outcomes, and artifact checksums under `property/docs/evidence/`. Keep credentials and private material out of reports.

## 4. Gates and implementation work

### G0 — Candidate inventory and executable scope

**Build:** A machine-readable requirements ledger mapping each product promise to source paths, protocols, current implementation, missing behavior, and one or more gate cases. Record the exact Amethyst/Geode files reused, their licenses, local vendored components, pinned versions, and all runtime/network dependencies. Establish the supported release profile as Ubuntu Linux x86_64 relay/agent plus browser PWA.

**Automated acceptance:**

- Inventory every declared product entry point and every runtime network request in one clean checkout; unknown executable sources fail the gate.
- Parse every requirements-ledger row and verify it has an owner path, implementation action, automated case ID, and explicit `IN_SCOPE`, `PENDING`, or `OUT_OF_SCOPE` status.
- Produce a dependency and license manifest with hashes for all shipped files; no untracked file is silently used to satisfy a requirement.
- Verify no execution item asks for human review or a non-Ubuntu run.

**Deliverables:** `property/docs/evidence/product-completion/G0/manifest.json`, requirements ledger, dependency/license manifest, and updated source map. G0 does not claim the product is complete.

### G1 — Protocol contracts, threat boundaries, and versioning

**Build:** One versioned protocol contract for identity claims, private-message delivery, public notes, marketplace offers, trade state, campaign/sponsorship events, and relay discovery. Specify canonical serialization, signatures, event identifiers, bounds, expiry, idempotency keys, duplicate behavior, conflict precedence, and forward/backward compatibility. Keep standard Nostr events interoperable where possible; isolate Property-specific event kinds/tags behind documented versions. State clearly what encryption, signatures, relays, and wallet confirmations do and do not prove.

**Automated acceptance:**

- Run 100 deterministic valid/invalid vectors per event family against parser, serializer, signature verification, size bounds, and version negotiation.
- Run 100 seeded malformed-input cases per public parser; every case returns a typed rejection without crash, unbounded allocation, secret leakage, or partial state mutation.
- Replay 50 duplicate and 50 reordered copies of each state-changing fixture; final state is byte-for-byte deterministic and no payment action repeats.
- Reject unknown critical versions/tags and ambiguous currency/atomic-unit combinations; preserve unknown noncritical fields only where the contract explicitly permits them.

**Deliverables:** Protocol spec, version matrix, vectors, fuzz seeds, migration rules, and truthful security/privacy claims in both languages.

### G2 — Self-contained build and release provenance

**Build:** Make the shipped web, agent, and Ubuntu relay artifacts resolve dependencies from the repository or a content-addressed release bundle. Remove runtime CDN and remotely loaded executable dependencies. Pin toolchains and package inputs; preserve upstream licenses; document how to reproduce the browser bundle and relay/agent packages offline. Generate an SBOM, artifact checksums, and a signed release manifest. If a complete local toolchain or upstream binary cannot be rebuilt, mark that artifact as bundled with its provenance and do not call the build reproducible.

**Automated acceptance:**

- Build the production PWA, agent package, relay CLI, and installer twice from clean worktrees with network access disabled; compare all reproducible artifact hashes.
- Serve the PWA locally with egress blocked. A network recorder sees zero requests to undeclared hosts and zero dynamic executable loads.
- Remove one required bundle file and alter one checksum in separate fixtures; the verifier rejects both before installation.
- Verify SBOM/license inventory covers 100% of files in each release archive; unknown license or source provenance fails closed.
- Scan release archives for private-key fixtures, credentials, and unapproved generated artifacts; all findings must be resolved or the release is blocked.

**Deliverables:** Reproducible build scripts, lockfiles, SBOM, license/provenance manifest, signed/checksummed release bundle, and an offline install procedure.

### G3 — Human PWA identity, local recovery, and first-use path

**Build:** Complete first-use, unlock, lock, export/backup, restore, key rotation, and recovery flows in the existing Property PWA. Use a random Nostr key protected at rest by a strong password-derived encryption key; the password is not itself a Nostr private key. Keep a human-readable handle as a signed profile/display claim, not as a globally unique cryptographic identifier: without a central registry, handle collisions must be represented and resolved locally. Clearly distinguish an `npub`/public key from a local handle. Keep secrets local and make backup loss consequences explicit.

**Automated acceptance:**

- Run 30 seeded create/unlock/lock cycles and confirm the same public identity is recovered each time; wrong passwords and modified vaults fail closed in 30/30 cases.
- Run 20 backup/restore cycles into clean profiles; restored public key, relay preferences, and opted-in local records match expected hashes, while secrets never appear in logs or export metadata.
- Run 20 concurrent signed handle-claim collision fixtures; no client presents a colliding local claim as cryptographically unique or overwrites another identity.
- Run 25 browser journeys covering fresh install, returning session, lock, restore, corrupt vault, no relays, and browser storage denial. Each journey asserts visible state, accessible labels, and that no delivery is claimed while disconnected.
- Check English/Portuguese UI-key parity and keyboard access for every identity/recovery control.

**Deliverables:** PWA identity journeys, versioned local vault format, safe recovery/migration, handle collision behavior, and automated browser evidence.

### G4 — Direct communication, relay selection, and partition recovery

**Build:** Complete direct and group encrypted messaging and public Hangout delivery on selected Nostr relays. Model `queued`, `published/relay-accepted`, `observed`, `decrypted`, and `failed` states distinctly; relay acceptance is not proof that a recipient received or read a message. Add stable event IDs, retry without duplicate UI items, query/dedupe, recipient relay hints, and user-controlled relay changes. Relay bridges forward only while running and never imply that a suspended browser is a background node.

**Automated acceptance:**

- Use 6 synthetic identities, 5 isolated relays, and 3 relay groups. Send 50 private messages per direction and 100 public events; verify only intended identities decrypt private bodies and signatures/IDs survive storage and forwarding.
- Partition the relay groups for 40 scripted event transitions, make 20 conflicting profile/offer updates, then reconnect. Verify the documented deterministic conflict rule, event retention, deduplication, and absence of fabricated delivery/read receipts.
- Restart each relay twice and repeat 20 retry fixtures. Exactly one logical message appears per event ID, and acknowledgements reflect only observed relay responses.
- Remove the application host after caching. Run 10 shell-open cases with relays offline and 10 with only local relays available; the shell communicates directly with relays and reports offline state correctly.
- Exercise blocked recipient, malformed envelope, unavailable relay, oversized event, duplicate relay response, and key-rotation cases in 10 fixtures each.

**Deliverables:** Messaging/relay state machine, partition/recovery implementation, privacy disclosure, and complete fixed-count evidence.

### G5 — Agent/MCP as a first-class client

**Build:** Publish a stable, versioned MCP tool manifest and a supported Ubuntu/Linux x86_64 installer/package. Provide tools for status, profile discovery, relay management, direct encrypted send/receive, public Hangout read/post, marketplace search/publish/withdraw, offer discussion, and payment status. Treat all remote content as untrusted data; never execute messages, URLs, or shell commands from peers. Give agents a distinct local Nostr identity by default, with an explicit local linking/delegation format if a human chooses to associate profiles; never share the human private key. Preserve direct unsolicited agent messaging without per-message human approval. Payment budgets and signing policy remain explicit local configuration, not a prompt injection path.

**Automated acceptance:**

- Run MCP stdio contract tests against 3 local synthetic MCP clients; validate `server/discover`, capabilities, every tool schema, structured errors, and per-request negotiation of version `2026-07-28`. This version is stateless and does not use the legacy `initialize` handshake.
- Run 50 end-to-end agent-to-agent exchanges across 3 isolated relays and 25 human-PWA-to-agent exchanges using synthetic identities; assert NIP-17 ciphertext and identity boundaries.
- Run 100 prompt-injection/content corpus cases. No input triggers process execution, key access, wallet action, relay reconfiguration, or out-of-scope tool invocation.
- Run 30 installer/uninstaller/upgrade/restart cycles in isolated Ubuntu homes. Preserve vault permissions, identity, rollback behavior, and socket restrictions; no TCP listener is opened.
- Verify each documented tool has a schema test, permission boundary, and failure case. Unknown tool requests fail closed.

**Deliverables:** Versioned MCP manifest, Ubuntu package/installer, tool reference, example client configuration, threat model, and synthetic integration evidence. Other MCP hosts remain unsupported until their automated protocol compatibility is represented in CI; no human host setup is a gate. The executed offline result is recorded in the [G5 gate evidence](evidence/product-completion/G5/gate-result.md).

### G6 — Hangout and decentralized marketplace discovery

**Build:** Complete browse, search, open, publish, edit, and withdraw flows for public Hangout notes and offers. Define a versioned offer schema for service/item, terms, seller identity, currency, amount in integer atomic units, payment rail, expiry, relay hints, and contact event. Keep the exact value in strings/integers; floating-point display values never drive payment. Resolve NIP-15 compatibility through a documented adapter/version; do not silently reinterpret fields from draft or legacy clients. Show sponsored items distinctly and disclose that public events are public.

**Automated acceptance:**

- Publish 20 synthetic offers in each of BTC/XMR/XNO, edit 10, withdraw 10, expire 10 using a logical clock, and query through 5 relays; every client converges to the documented state without deleting unrelated events.
- Round-trip 100 boundary amount vectors per currency, including zero, maximum supported representation, over-limit, fractional, and malformed values; reject all unsafe values and never round silently.
- Run 50 Hangout journeys covering author verification, dedupe, relay changes, direct-message entry, empty results, and malformed posts.
- Run 25 browser journeys per language through browse-to-contact and publish-to-withdraw flows; assert accessible names, clear public/private labeling, and absence of a false paid indicator.
- Replay 20 same-author offer conflicts and 20 cross-relay out-of-order updates; apply the G1 rule deterministically.

**Deliverables:** Offer/event schema, the [NIP-15 adapter decision](nip15-property-adapter.md), complete human PWA marketplace and Hangout journeys, and both-language automated evidence. `marketplace-g6-fixed-count.mjs` owns the exact amount/lifecycle/conflict counts; the browser gate checks five local Geode relays and the fixed-language UI journeys. The executed result is recorded in the [G6 gate evidence](evidence/product-completion/G6/gate-result.md).

### G7 — Trade state, payment verification, and honest settlement limits

**Build:** Connect an offer conversation to a versioned trade state machine and per-currency local wallet/node adapters. Make `offer`, `accepted`, `payment-requested`, `payment-observed`, `settled`, `expired`, `disputed`, and `cancelled` explicit; only the configured local node/wallet may advance a chain-confirmed state. Add idempotency, atomic-unit accounting, expiry, reorg/rollback handling where applicable, and signed local evidence. BTC/XMR/XNO are separate adapters with separate policies; never claim that a single generic escrow abstraction has the same guarantees on all three.

BTC and XMR settlement/escrow must use only mechanisms their actual protocol and chosen wallet can verify in local private test networks. For Nano, implement direct voluntary transfer verification and keep any cooperative threshold/custodial settlement clearly experimental: Nano does not enforce Property release/refund rules, and threshold participants may use other software. No user-interface wording may call this trustless escrow or guarantee delivery of goods. Mainnet settlement remains disabled unless an implementation change and its protocol-specific gates explicitly authorize it.

**Automated acceptance:**

- Run 50 trade-state fixtures per currency through valid, expired, duplicate, malformed, wrong-network, underpaid, overpaid, and uncertain-RPC transitions; no invalid fixture reaches `settled`.
- Use private Bitcoin regtest, private Monero test network, and Nano dev node only. For each adapter, create 10 synthetic invoices/offers, observe 10 valid receipts, and execute 10 duplicate/lost-response/restart cases without double credit or double spend.
- BTC: invalidate one of 10 confirmed test fixtures and verify state reopens or marks reorg according to policy. XMR: verify configured confirmation/unlock states against the local wallet RPC. Nano: verify exact account, source, amount in raw, and block hash against local node state.
- Run 30 independent identity-binding fixtures. The UI must display unverified wallet/account ownership as a claim and must not infer it from a Nostr signature.
- Tamper with transaction ID, amount, destination, network, offer hash, and journal in 10 fixtures each; fail closed with no second payment attempt.

**Deliverables:** Per-currency adapter contracts, trade state machine, private-network evidence, settlement wording, and a matrix that labels each mechanism as direct, custodial, threshold/cooperative, or protocol-enforced. Any mechanism not meeting its stated security model remains disabled or explicitly experimental. The executed result is recorded in the [G7 gate evidence](evidence/product-completion/G7/gate-result.md), with reports and checksums in `evidence/product-completion/G7/fixed-run-01/`.

### G8 — Relay campaigns, voluntary sponsorship, and operator economics

**Build:** Add relay-operator tools to inspect a campaign proposal, accept or reject it, set publication scope, and receive the declared supported payment. Rejection behavior must follow the campaign’s declared currency/rail and exact atomic amount; do not promise automatic refunds unless the applicable adapter confirms them. Label sponsored content, preserve signed provenance, and avoid user-level click/view tracking. Expose local operator accounting and retention controls. Campaign acceptance is optional and local to each relay.

**Automated acceptance:**

- Run 20 campaign lifecycle fixtures per currency: submit, accept, reject, publish, replace, expire, duplicate, and invalid signature. Verify exactly one policy decision and correct sponsored labeling.
- On private local wallet networks, verify 10 accepted BTC, 10 XMR, and 10 XNO payment-observation cases; verify 10 rejection/return cases per currency only where the rail has an implemented and confirmable return path. Otherwise record `UNSUPPORTED_RETURN` and do not advertise refunds.
- Assert 100% of campaign records reconcile offer ID, acceptance ID, amount, currency, transaction reference, signer, and status; ambiguous or unconfirmed payments never unlock publication.
- Inspect every client and relay fixture for click/view counters, third-party analytics, and undisclosed user tracking; any such path fails the gate.

**Deliverables:** Local JSON-RPC stdio operator interface with nine campaign tools, campaign state machine, per-currency refund/return limits, signed receipts, local ledger export, and no-tracking evidence. The interface is embedded by a host that supplies the signer, ledger adapters, and publisher; the plain Geode launcher does not start it. The automated result is recorded in the [G8 gate evidence](evidence/product-completion/G8/gate-result.md).

### G9 — Abuse resistance, data minimization, and automated security checks

**Build:** Complete local mute/block/report behavior, relay-level rate/size/retention limits, malformed-event handling, and explainable moderation boundaries. Make clear that local blocks do not globally erase events and that public relay discovery cannot prove a global reputation or defeat Sybil identities. Add no-central-registry relay discovery with bundled signed defaults, user override, and explicit handling when defaults are stale/unreachable. Minimize metadata and document remaining IP/relay visibility.

**Automated acceptance:**

- Run 200 malformed, oversized, duplicate, replayed, and invalid-signature event cases through every public parser; no crash, secret leakage, or state mutation.
- Run 50 local block/mute cases across 5 synthetic identities and 5 relays. Verify local views suppress blocked content while relay records and other clients are not falsely reported as deleted.
- Test rate and storage limits at limit−1, limit, and limit+1 for 20 configured limits; verify bounded state and deterministic errors.
- Run 100 signed relay-list cases: valid, expired, revoked, duplicate, wrong key, unknown critical version, and malicious URL; invalid entries never cause an undeclared runtime code fetch or leak a private key.
- Run static analysis, dependency vulnerability/license scan, secret scan, SBOM verification, and security-focused regression suites on the exact release candidate. Unresolved critical/high findings block release; report tool coverage and known blind spots.

**Deliverables:** Abuse controls, relay discovery format, automated security report, metadata/privacy statement, and explicit residual-risk register. Passing automation is not represented as a human security audit.

### G10 — Public release, Ubuntu operator package, and contributor onboarding

**Build:** Package one versioned release containing the static PWA, Ubuntu/Linux x86_64 relay CLI, Ubuntu agent/MCP installer, offline dependency manifests, checksums/signature, SBOM, licenses, upgrade/uninstall instructions, and machine-readable compatibility declarations. Publish from the public Property repository through its configured Pages/release workflow after offline gates pass. Make GitHub the canonical source and document independently verifiable source-to-artifact hashes. Add newcomer instructions, AI-agent contribution instructions, issue templates, a code of conduct, and a ready-to-share launch kit for X/Reddit/community forums with contribution links. Do not claim community adoption from publication or repository metrics.

**Automated acceptance:**

- Starting from a clean Ubuntu x86_64 machine image, install PWA static files locally, relay CLI, and MCP package from the release bundle with network disabled; verify all declared smoke journeys and clean uninstall.
- Build, package, install, upgrade, downgrade/rollback, and verify checksums in 10 clean-profile cycles; preserve user data and reject corrupted artifacts.
- Run CI from the exact release tag; require G0–G9 evidence manifests, license/SBOM/security checks, and all fixed-count suites. A skipped suite is not a pass.
- With egress blocked, serve the exact release PWA bundle locally and run 25 scripted browser journeys; compare its content hashes with the release manifest. Functional acceptance stays offline. Deployment metadata and artifact digests from the Pages/release workflow are recorded separately after publication and do not replace or alter gate results.
- Verify English and Brazilian Portuguese documentation links, navigation, installation commands, and release metadata; no broken in-repository link is allowed.
- Validate the launch kit mechanically: all repository/community links resolve within the local checkout, each post fits the declared platform character limit, and every call to action points to the contribution guide or public repository.

**Deliverables:** Public versioned URL, verified release bundle, final evidence index, updated README/ROADMAP/docs index, Ubuntu operator and agent quick starts, platform-ready launch kit, and explicit pending-platform declaration.

## 5. Overall completion rule

The implementation plan is complete only when G0–G10 are `PASS` on one release candidate using offline functional checks, the published artifact digests match their signed/checksummed manifest, and every financial/security limitation is visible in the relevant product and operator documentation. `PENDING`, `BLOCKED`, omitted evidence, an untested currency, or an experimental escrow presented as guaranteed means the overall result is not complete. Publication availability is reported from the release workflow; it is not a substitute for offline acceptance.

## 6. Explicitly excluded from this execution plan

- Human review, user studies, participant-operated tests, manual visual approval, or manual security sign-off.
- Running, installing, building, or claiming support verification on Windows, macOS, Android, iOS, or any OS other than Ubuntu Linux x86_64.
- A promise that a browser/PWA stays awake or relays continuously in a phone background.
- Absolute censorship immunity, global handle uniqueness without an authority/consensus mechanism, Sybil-proof global reputation, or delivery/read guarantees a relay cannot provide.
- Public-relay test traffic, mainnet test funds, or claims of trustless Nano escrow.

These exclusions do not prevent automated implementation or source-level work for portable code; they limit what this plan may execute or claim as verified.

## 7. References

- [Property central test plan](plano-de-testes-central.md)
- [Property payments and current settlement boundaries](pagamentos.md)
- [Agent messaging plan](plano-agentes-human-first.md)
- [NIP-17: private direct messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-15: marketplaces](https://github.com/nostr-protocol/nips/blob/master/15.md)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
