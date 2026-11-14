# Property Central Test Plan

**English** · [Português (Brasil)](plano-de-testes-central.pt-BR.md)

**Updated:** 2026-11-13. **Executor:** the maintainer chooses the active model; record the actual executor in each report. Model labels in old prompts are provenance only and never block a gate. Every acceptance criterion uses predefined inputs and counts. No test requires elapsed time, a soak window, a time-based heartbeat, or a minimum period of uptime. Case/build watchdogs have a 30-minute upper bound; native workflow provisioning has a 45-minute operational watchdog. A watchdog never counts as PASS. Old duration-based trials are historical evidence only. An intermediate Ubuntu profile may leave G12-02–G12-05 as `PENDING`; these are neither PASS nor native approval. `PROPERTY_SCOPE_OFFLINE_PASS` requires the complete G12 matrix to pass on the same candidate.

## 1. Purpose and authority

Demonstrate through reproducible usage and integration trials that all functionality in the consolidated Property scope works without internet access, including multiple layers/relays, users, controlled failures, and payments on private local networks. The overall result is `PROPERTY_SCOPE_OFFLINE_PASS`, defined in section 4. Passing unit tests alone is insufficient.

Requirements: [project identity](identidade-do-projeto.md), [central execution plan](plano-central.md), [payments](pagamentos.md), and [migration](migracao-property.md). This revision replaces the earlier execution order and gates. Earlier scenarios/results remain in the [2026-10-31 test history](historico-testes-2026-10-31.md); they do not approve these gates.

Here, **offline** means internet access is blocked while the isolated lab's local network is allowed. HTTP(S), WebSockets, wallet RPC, and blockchain synchronization occur only between authorized local processes, VMs, or devices. There are two distinct trials: communication on the isolated local network, and opening an already cached shell with all data connections cut off. The latter must not claim message delivery when no relay is reachable.

**Layers** are the layers exercised in the lab: browser/identity, discovery, multiple relays/bridges, storage, and financial adapters. Relay-to-relay paths use actual Property behavior. This does not assume generic private routing, onion routing, a new P2P protocol, or a suspended PWA that runs continuously.

## 2. Required scope

| Requirement | Required behavior | Gates |
|---|---|---|
| Provenance and autonomy | Document Amethyst/Geode reuse, licenses, hashes, local dependencies, and no runtime code fetch | G00, G02 |
| Identity | Random local key, password-protected vault, session, lock, backup, and recovery of the same identity | G01, G03, G10 |
| Private communication | NIP-17 direct and group chats (up to 10 people), kind 10050, offline recipient, retries, failures, confidentiality, direct relay connections | G04, G05, G09, G10 |
| Decentralization | Relay choice/switching, voluntary bridges, multiple paths, and continuity without the app host | G05, G09 |
| Usable PWA | First use, clear errors, cache, update, migration, accessibility, and full UI journeys | G02, G03, G10, G12 |
| Hangout | Publish/read public notes, verify authorship, deduplicate, and start a conversation from the author | G06, G10 |
| Initial marketplace | Publish, discover, edit, and withdraw offers; exact BTC/XMR/XNO amounts; contact the seller | G06, G08, G10 |
| Node sustainability | Offer, accept/reject, paid publication, expiry, refund, opt-in sponsorship, and no central tracking | G07, G08, G10 |
| Computer relays | Bundled runtime, persistent data, restart, limits, retention, and recovery across fixed partition/restart cycles | G00, G09, G11, G12 |
| Platforms | PWA on desktop/Android/iOS and relay packages for Linux x86_64, Windows x64, and macOS Apple Silicon | G12 |

The planned campaign financial engine remains in scope even though it is absent from the current MVP. Missing functionality fails the corresponding gate; it does not justify deleting a gate, substituting a mock, or treating a declared transaction ID as payment. Private NIP-17 groups with up to 10 participants are in scope; they have no administrator, membership approval, or reliable leave/removal controls. Groups above 10, marketplace checkout/custody/escrow, Lightning, and a continuously active mobile relay are not part of the consolidated MVP. Explicitly verify that the app does not simulate unsupported capabilities. Mac Intel and other relay architectures remain future extensions; do not claim they passed. Add cases and gates before accepting any scope expansion.

### Separate XNO threshold-signature extension (not part of MVP acceptance)

The maintainer requested a Nano-compatible 2-of-3 threshold-signature prototype on 2026-11-13. This is a separate extension and does not change G00–G12 or any `PROPERTY_*_PASS` result. The current custodial escrow remains custodial until its settlement path is replaced and all extension cases pass.

| Case | Fixed acceptance criteria | Current state |
|---|---|---|
| XNO-T1 | One offline DKG with exactly three fixed synthetic participants; one signature assembled from participants 1 and 3; one isolated share cannot aggregate; one-shot nonce reuse is rejected; one modified message and one modified signature are rejected; one known Nano account round-trips and one bad checksum is rejected; wire data round-trips. The DKG and signing nonces use the runtime CSPRNG. | [PASS evidence](evidence/agent-messaging/G13-xno-threshold-core-offline-20261113.md) |
| XNO-T2 | Submit a threshold-signed state block to a disposable private Nano node; verify node acceptance, account key/address, balance delta, and rejection of a tampered block. No public relay or real funds. | PENDING: no Nano-node acceptance evidence yet. |
| XNO-T3 | Integrate authenticated Nostr identity binding, encrypted DKG share delivery/storage/recovery, exact settlement-policy validation, and signed-block publication into the existing escrow; run predefined two-of-three, one-of-three, conflict, replay, restart, and key-loss cases. | PENDING: cryptographic core is not connected to escrow. |
| XNO-T4 | Independent cryptographic/security review plus human review of the signer UX and the disclosed 2-of-3 collusion and availability risks. | PENDING. |

XNO-T1 uses Noble's local FROST verification path and proves only the implemented offline assertions. It is not evidence that an independent Nano node accepts these signatures. Do not use real funds or describe the escrow as multisig while XNO-T2–T4 are pending.

## 3. Execution rules

1. Read this plan, source summaries, and the nearest `AGENTS.md` first. Work in `coercaodobem/property`, branch `modelo-mvp`, preserving existing changes. Do not use Amethyst upstream or Gymoo as a destination.
2. Inventory what exists and is missing. Distinguish existing tests, tests to implement, absent features, and unavailable lab tools. This plan does not claim that new scripts in section 7 already exist.
3. Run gates strictly in order. For every case, connect the requirement to the real code exercised, steps, expected result, and evidence. A dependent gate starts only after every predecessor case passes. Otherwise record dependent cases `NOT_RUN`, fix/retest, and resume in order. Isolated retests diagnose but do not approve or advance the full sequence.
4. Build missing test infrastructure. Fix product defects within authorized scope, record them, and repeat the affected case and regression. Do not alter expected results to accommodate defects. Protocol, cryptography, key, and financial-design changes follow approved scope and repository instructions.
5. Code inspection, an isolated log line, a startup screen, a success mock, or historical result cannot establish PASS. Each approval requires executing behavior and independent assertions about its effects.
6. Use only synthetic identities, messages, wallets, and amounts. Keep secrets in private temporary directories; never put them in reports, commits, HAR files, screenshots, or console output. Do not replace real accounts or user data directories.
7. Do not request authorization again for the same previously authorized local tests. Do not change the user's global firewall, turn off the user's network, reboot the host, use mainnet, or publish test data. Simulate network/power faults only in lab processes, volumes, and interfaces.
8. Persist progress after each case/gate. On resume, read the manifest and latest result, check whether the commit changed, and invalidate affected approvals. An interrupted trial is not PASS.
9. Do not delegate, switch models, open a PR, or publish a release automatically under this plan. The maintainer chooses the active model. Record the actual executor as provenance; do not ask for a model change or block on old labels.

**Completion:** deliver a final report with results for all gates and artifacts needed for another run. If a resource or implementation is missing, report the true state without claiming the whole scope passed. Do not hand off tests that can be run in the available lab.

## 4. Gates and approval rules

| Gate | Verifiable deliverable | Depends on |
|---|---|---|
| G00 | Lab prepared, inventoried, isolated from the internet | — |
| G01 | Existing technical regression passes within isolation | G00 |
| G02 | Provenance, package, offline shell, update, migration | G01 |
| G03 | Identity, recovery, and contacts through the UI | G02 |
| G04 | Real end-to-end messages through relays | G03 |
| G05 | Multi-relay/layer network, paths, and limits | G04 |
| G06 | Hangout and marketplace through UI and relay | G05 |
| G07 | Real campaign state machine and privacy | G06 |
| G08 | BTC/XMR/XNO on private local networks using real adapters | G07 |
| G09 | Failures, abuse, recovery, and persistence | G08 |
| G10 | Complete browser journeys and usability criteria | G09 |
| G11 | Repeatability, fixed-variable multi-relay cycles, reconciliation | G10 |
| G12 | Offline target-system and browser matrix | G11 |

Case states: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, or `PENDING`. Missing functionality is `FAIL`; missing infrastructure required by the requested profile is `BLOCKED`; `PENDING` is explicitly deferred outside the current execution profile. PENDING is not approval but does not block the Ubuntu profile. `NOT_RUN` means a case required by the profile did not start or finish. A negative test passes only when the expected rejection occurs and the prohibited effect is independently absent. A skip, TODO, warning, or swallowed error never counts as approval.

All cases in the selected profile are mandatory. A gate passes only when 100% of its cases pass with complete assertions and valid evidence from the tested code. PENDING cases stay visible and are not counted as PASS. Any `FAIL`, `BLOCKED`, `NOT_RUN`, or interruption stops the sequence before a dependent gate begins. Diagnostic retests do not advance or certify later gates.

- **`OFFLINE_FUNCTIONAL_PASS`:** G00–G11 pass.
- **`OFFLINE_PLATFORM_PASS`:** G12 passes for the declared matrix, without visual emulation as proof of a native system.
- **`PROPERTY_UBUNTU_OFFLINE_PASS`:** G00–G11 and Ubuntu cases G12-01/G12-06 pass with valid isolation/evidence; G12-02–G12-05 may be PENDING outside this Ubuntu run. This certifies the Ubuntu profile only, not Windows, macOS, Android, iOS/iPadOS, or full scope.
- **`PROPERTY_SCOPE_OFFLINE_PASS`:** both results above pass on the same code and compatible artifacts. No open FAIL, BLOCKED, NOT_RUN, or functional defect in scope.
- GitHub Pages publication, public networks, independent security review, and additional physical install/background checks have separate records. They are neither simulated nor certified by an offline result.

The orchestrator returns 0 for a complete Ubuntu profile (`PROPERTY_UBUNTU_OFFLINE_PASS`), 1 for failure, and 2 for a block/interruption/incomplete infrastructure within the requested profile. It uses `PROPERTY_SCOPE_OFFLINE_PASS` only after the full matrix passes. Partial profiles never use that name.

While Windows, macOS, Android, and iOS/iPadOS are deferred, pushes and PRs run Ubuntu smoke/relay checks only. Native matrix jobs normally start through `workflow_dispatch` with explicit `run_deferred_platforms=true` (default `false`). For a full run requested during automated work without workflow dispatch, an authorized push to `modelo-mvp` may include `[run-g12-now]`. This marker only enables that workflow on the development branch; it does not change criteria or convert PENDING to PASS.

## 5. Lab setup and topology

### 5.1 Isolated environment

- Pin the commit/diff, protocol versions, Node.js 22+, local Python if needed, browsers, automation tools, runtimes, currency binaries, and licenses. Record hashes of every executable.
- Tool preparation is separate from offline execution. Missing tools produce `BLOCKED` with required path/version/hash. Do not download packages, browsers, Docker images, Maven, npm packages, or updates during trials. Existing caches count only if inventoried and verifiable. A missing build cache blocks offline build testing, not the runtime-package definition.
- Use an available network namespace, VM, or container network without an external route; use equivalent VM/lab isolation for Windows/macOS. Allow only loopback and declared local addresses/ports. Any residual external route, including IPv6, proxy, WebRTC, or child process, fails isolation.
- Before flows start, inspect effective firewall/namespace rules, IPv4/IPv6 routes, DNS/proxy configuration, and policy applied to lab processes. Record configuration and available counters before/after. Never send TCP probes, DNS lookups, or any traffic to public addresses, including documentation addresses. If isolation cannot be inspected/applied, mark BLOCKED. A DNS error, environment variable, or browser interception alone does not prove isolation.
- Capture connections per process and browser requests. Disable account sync and extensions in disposable profiles; block public-relay egress. Fresh installs now save two random bundled relay suggestions locally, so inject the isolated lab relay list before boot and verify that no bundled public relay is contacted. If no safe setup path exists, build the harness/configuration and record the product gap.
- Prove network blocking before the flows and verify it afterward. Browser mock/interception is extra defense, never the sole boundary.
- Serve the same bundle at localhost and under `/property/`. For HTTPS/WSS, use a local test CA/certificate trusted only inside the lab. Never approve by globally ignoring TLS errors. Also capture an invalid-certificate WSS attempt and prove rejection.
- Each relay has a separate process, port, config, and database; each identity has a separate browser context/profile. Keep lab data in an exclusive temporary directory. Never start/stop a production relay.

**Resources:** start with two relays and measure RSS/disk at count checkpoints; expand to the full topology without reducing scenarios. Initial lab floor: 4 vCPU, 8 GiB physical RAM, and 6 GiB free on the runner's scratch volume. Measure free space separately at the start of each run. Limit child processes to 70% of then-available RAM; divide that cap across seven concurrent Geode relays with explicit heap, metaspace, code-cache, direct-memory, and thread limits. Record values in inventory and measure RSS at fixed checkpoints. Reserve 2 GiB disk and stop cleanly at the limit. These are lab parameters, not measured consumption or final product requirements. Hardware below the physical floor, scratch below the limit, or a cap that cannot provide at least 128 MiB heap and 64 MiB metaspace per JVM is BLOCKED. Scratch must be on the runner's declared volume, not inferred from a tmpfs `/tmp`.

### 5.2 Actors and seven real relays

| Actor | Isolated role |
|---|---|
| A and B | Sender and recipient, with independent identities/vaults |
| C | Unauthorized third party, hostile relay, and tampered input source |
| P12, P23, P34 | Public bridges using real Property modules, one instance per connection |
| D | Synthetic advertiser, not trusted by users |
| N1 and N2 | Independent node/campaign operators with distinct policies/wallets |
| H | Local static server; serves files only, with no messaging backend |

| Relay | Role |
|---|---|
| R0 | Local discovery of profiles and kind 10050 lists |
| R1–R4 | Public-event distribution network |
| R5, R6 | Private inboxes for A and B, respectively |

Use A's inbox list with R5 and R3, and B's with R6 and R4, to test inbox redundancy. A relay may store both public events and private envelopes; this does not authorize a public bridge to forward those envelopes.

Initial topology, with test ACLs that prevent shortcuts:

```text
A -> R1 -> P12 -> R2 -> P23 -> R3 -> P34 -> R4 -> B
A/B -> R0                              signed discovery
A -> B inboxes: R6 and R4              direct NIP-17
B -> A inboxes: R5 and R3              direct NIP-17
H -> PWA files                         no message forwarding
```

For the public chain, A publishes only to R1, B reads only from R4, and each bridge accesses only its two declared endpoints. Then test diamond, cycle, star, and partition topologies; record each additional link. Stopping P23 must break the simple chain. If the event still arrives, a shortcut or isolation defect fails the case.

**Private boundary:** generic bridges do not carry A's messages to B through third parties. NIP-17 uses each recipient's signed inbox list. B's bridge may replicate B's own encrypted envelope only to B's inboxes; A's bridge behaves likewise. Do not forward third-party envelopes to pass a multilayer test. If every recipient inbox is inaccessible, the UI reports unavailable; the lab does not invent a private router.

### 5.3 Fixed variables, logical clock, and counts

Use an explicit seed for scenario generation and failure order. Test randomness may be deterministic only in fixtures/harnesses; product keys, nonces, and cryptography retain secure randomness. Never add a fixed runtime key or reused nonce for repeatability.

All tests use predefined inputs and counts. An injected logical clock checks product time rules at discrete boundaries without waiting in real time. Shared values: `NOW_EPOCH_SECONDS=1800000000`; bridge timestamps `NOW`, `NOW-300`, `NOW-301`, `NOW+60`, `NOW+61` (maximum age 300 seconds, future allowance 60 seconds); offers `NOW`, `NOW+300`, `NOW+301` (future allowance 300 seconds); expiry `expiredAt=NOW-1`; campaigns `expiresAt=NOW+1`, `maximumDurationSeconds=2592000`, and next limit `2592001`, plus transition `expiresAt=NOW+180`, evaluated at `NOW` and `NOW+181`. Late payment uses `latePaymentExpirySeconds=1`, reconciled at `expiresAt+1` without real delay. Local exposure is queried twice at the same logical instant and again with age `EXPOSURE_WINDOW_SECONDS+1=86401`. Bridge quota: submit 61 events in one logical window; exactly 60 are accepted, then advance one logical step of 60,000 ms to begin the next window. Retention uses three synthetic records at `NOW-retention-1`, `NOW-retention`, and `NOW-retention+1`, without waiting. Ledger restart/reorg counts: BTC, 1 confirmation, invalidate 1 block and mine 1 after reconsideration; XMR, 10 confirmations, mine 11 blocks to unlock and test a 1-block pop; Nano, observe one sent block through confirmation. Host clock never decides PASS.

Minimum corpus: 100 distinct public notes, 50 messages per direction, 10 offers per currency, and 10 campaigns per currency. Record exact counts, synthetic identities, and seed in the manifest. Send in fixed batches below limits; separately run limit and over-limit batches. Reconcile IDs, authors, recipients, atomic amounts, valid ACKs, queryable events, and UI appearances for each corpus. Start/end times may be audit metadata but cannot enter assertions or change the result.

`waitFor`, socket, subprocess, and watchdog deadlines only protect against a hung harness. They do not measure functionality, set performance targets, or produce PASS; a watchdog expiry is FAIL/BLOCKED according to cause.

## 6. Mandatory cases by gate

### G00 — Preparation, isolation, and evidence

| Case | Procedure and acceptance |
|---|---|
| G00-01 | Record requirements, commit, diff, tool inventory, hashes, system, limits, ports, and topology. Missing dependencies are explicit and prevent the affected profile from starting. |
| G00-02 | Apply lab isolation; inspect effective rules and prove no route/TCP egress, DNS, IPv4, IPv6, or proxy access, allowing only declared loopback/local addresses. Do not send public traffic to test blocking. Check browser, relay, bridge, RPC, and child-process policies too. |
| G00-03 | Start two real Geode relays, then all seven isolated relays; verify readiness, distinct databases, private permissions, and safe shutdown. A busy port/readiness failure never enables public fallback. |
| G00-04 | Intentionally interrupt a test. The report remains BLOCKED, exit is nonzero, child processes stop, sanitized evidence is retained, and real data remains untouched. |

### G01 — Existing regression

| Case | Procedure and acceptance |
|---|---|
| G01-01 | Run every suite declared in `run-smoke.sh` and `agent-package-smoke.sh` inside isolation. Check each result, exit code, actual suite count, and negative case; record the count from the scripts rather than relying on a fixed historical number. |
| G01-02 | Run integration between two real relays and native launcher integration. Verify positive ACK, queries by ID, and exact persistence after restart, not only total counts. Expand existing tests if they only compare counts. |
| G01-03 | Prove test sensitivity by tampering only isolated fixtures for signature, bundle/hash, atomic price, and backup; each must fail for the expected reason. Restore fixtures without changing expected output or disabling checks. |

### G02 — Self-contained package, PWA, and migration

| Case | Procedure and acceptance |
|---|---|
| G02-01 | Inventory reused Amethyst/Geode code, local libraries/licenses; check commits, hashes, and absence of dynamic runtime dependencies. Rebuild offline when the complete local toolchain is available. Record web incompatibility without claiming Compose was rebuilt. |
| G02-02 | Open a clean bundle at localhost and `/property/` with egress blocked. Scripts, styles, fonts, workers, and manifest are local; no CDN, analytics, or remote execution. A fresh install saves a unique random pair from the bundled relay list locally. Before boot, replace that list with isolated lab relays; after identity activation, prove connections target only the saved lab relays and never the bundled public endpoints. Repeat with an empty cache. |
| G02-03 | Install the service worker, store synthetic identity/data, stop H, and cut relays. The shell reopens, identity remains, disconnected state is clear, and delivery is not claimed. Restore only relays: the cached app communicates directly without H. |
| G02-04 | Simulate full update, interrupted update, and mixed artifact. Preserve key, conversations, and preferences; shell version stays consistent or returns a recoverable error. Other app caches remain untouched. |
| G02-05 | Import legacy backups, open legacy database, and test old/new paths on the same local origin; preserve the same identity. Wrong password, modified backup, and unavailable storage do not silently create another account. |
| G02-06 | Test valid/invalid TLS/WSS, CSP, and malicious content. Do not disable TLS validation, accept remote scripts, or weaken production policy to fit the harness. |
| G02-07 | With network egress disabled, open the message composer and use the emoji picker in English and Portuguese. Search one English term and three fixed Portuguese terms; select at the start, middle, and end of a draft; verify caret position, draft persistence, the 4,000-character guard, one recent-item update per selection, and distinct recent lists for two local identities. Reopen with a fresh cache and prove the local dataset is available offline. Before Send, reconcile zero relay events; after Send, confirm the existing NIP-17 flow and secret guard are unchanged. |

### G03 — Identity, password, recovery, and contacts

| Case | Procedure and acceptance |
|---|---|
| G03-01 | Through the UI, create A/B using the same test name/password in separate contexts. Keys differ; vault is encrypted; network/storage/logs expose no password or private key. |
| G03-02 | Wrong password does not alter the account; correct password unlocks the same identity. Test remember-session on/off, browser reopen, and manual lock in three cycles. Deterministic inactivity lock belongs in G11 and uses an injected logical clock, not a real wait. |
| G03-03 | Export encrypted backup via UI and restore in a clean context; check same public key and conversation access. Loss of password/recovery offers no central reset and does not silently replace identity. |
| G03-04 | A obtains B's contact from profile/share and Hangout author action; test valid `npub`, `nprofile` with local hints, and hex. Confirm recipient/local name before sending without entering a private key. No GitHub registration or central server. |
| G03-05 | Reproduce `coercaodobem` input in new conversation. Test empty/truncated key, `nsec`, own contact, and duplicate display names. Error is understandable in the selected app language, with no raw stack/Bech32; it tells the person to obtain the correct contact and does not send to the wrong identity. A plain name is not silently converted into a key or treated as globally unique. If name lookup is unavailable, UI explains accepted formats and the available share/select-contact path. |
| G03-06 | Capture requests and storage profiles before/after each action; reconcile to prove no secrets, central login/recovery endpoint, or data loss during update. The browser's local deny proxy must reject every relay socket attempt; any attempted host must belong to the bundled relay list, and no external HTTP request may complete. Retained captures must be sanitized. |
| G03-07 | In six fixed cases, share a contact as a Property URL, NIP-19 `nprofile`, and QR from unlocked and locked-start contexts. Independently decode the QR and compare its exact URL payload; verify public key plus at most three unique `wss://` relay hints, no credentials/query/fragment, and no private key or message content. Open the URL in Property: remove the contact fragment before app boot, preserve unrelated route state, then prefill the new-conversation form after identity activation. Received relay hints stay in the form and never replace the user's saved relay selection or start a connection by themselves. Do not create a conversation or publish an event before the person explicitly opens it. Run eight malformed/secret-input cases and ten relay-hint inputs, including duplicates and unsafe URLs; all invalid or unsafe data is rejected or omitted without raw stack/Bech32 leakage. Property URL, `nostr:` URI, `npub`, and `nprofile` paste paths all remain local and use the same app. |

### G04 — Real end-to-end messages

| Case | Procedure and acceptance |
|---|---|
| G04-01 | Through UI, publish A/B kind 10050 lists on R0; verify signature and select the latest valid version. A forged, stale, ambiguous, or relay-invalid list never authorizes a wrong destination. |
| G04-02 | A sends to B; B replies. Check UI and recipient text, expected sender copies, and encrypted persistence on the correct inboxes. C with another key cannot decrypt; H receives no body, password, or key. |
| G04-03 | Close B's context, send A→B, reopen B and sync. Message appears once; repeat queries/reconnections on three relays without duplication. Fix relay retention in manifest and test three events at the 5.3 timestamp boundaries without waiting for real aging. |
| G04-04 | Disable one B inbox, then all; test negative ACK, false ACK without persistence, and reconnection. UI distinguishes relay acceptance, failure/partial state, and read state; ACK alone never claims read. Independent query detects a lying relay. |
| G04-05 | Remove kind 10050, tamper recipient/signature/envelope, alter timestamp, and replay IDs. Do not send via public fallback; reject invalid inputs; no third party receives plaintext. |
| G04-06 | Run corpus in both directions and reconcile every ID/envelope/conversation in browser and relay. Normal flow has zero loss and one UI appearance per message. Capture visible metadata limits without claiming total anonymity. |
| G04-07 | In the isolated lab, create one four-member NIP-17 room through the Property UI. Give every member a distinct kind-10050 inbox relay, send one fixed group message, and reconcile exactly four gift wraps: one sender copy and one per other member. All four members decrypt the same rumor/ID; a fifth identity cannot decrypt; no relay or host sees plaintext. The sorted member set and `subject` produce the same room identity/title at each recipient. |
| G04-08 | In the same four-member room, exercise one reply, one reaction, and one forwarded message to a second pre-created group. Reconcile their participant tags, parent event ID, exact per-member envelope count, inbox destinations, deduplication, and visible sender attribution. Missing inbox data, missing/duplicate/extra envelopes, duplicate participants, or more than 10 members fail closed; do not add a public or third-party fallback. |
| G04-09 | In one browser profile, pin one direct chat and one private group in the same folder, keep one chat unpinned, then unpin the group. Verify pinned-first/recent-first ordering, repeat after one reload, import the same identity into a clean second profile and verify no pin state was synced, and confirm exactly zero relay events were published by the pin actions. |
| G04-10 | Offline, select three supported catalog emoji outside the quick-reaction row in fixed direct-message cases and repeat in a four-member private group. Verify the picker leaves the composer draft unchanged, cancel/Escape publishes zero events, and explicit selection creates a NIP-25 kind-7 reaction wrapped as NIP-17. Reconcile exact recipient envelopes, decrypted emoji, outsider rejection, local recent-history isolation by identity, focus restoration, English and Portuguese labels, and zero external asset requests. Unsupported reaction content must fail closed with zero publication. |
| G04-11 | Offline, in the existing Property chat, right-swipe an eligible message by a fixed 96 px with at most 12 px vertical movement and verify the reply target; fixed negative cases cover left/short/vertical gestures, mouse input, interactive content, and missing event references. With an empty composer, `ArrowUp` edits the latest eligible own message; a nonempty draft, IME, modifiers, open overlay, or active edit must not trigger it. Cancel restores the draft. Compare relay event IDs before and after both shortcuts and require zero new events. |
| G04-12 | Offline, send a fixed NIP-17 message containing a valid `npub`, an `nprofile` with a loopback relay hint, a duplicate identity code, an invalid checksum, an `nsec` lookalike, and profile-looking text inside a URL/code span. Only valid, nonduplicate profile references outside URLs/code render as cards, capped at three per message; previews and search preserve the original source codes. Tap a card and verify New conversation is prefilled with its public code/hints, but no conversation is created and relay event IDs do not change before the person explicitly continues. Repeat visible labels in English and Portuguese and assert zero external requests. |
| G04-13 | Offline, open Property in a fresh browser profile without any saved relays. Before identity creation, verify that the app chooses two distinct relays from its bundled list, displays and persists the pair locally, leaves create/import identity available without opening settings, and makes no relay connection. Open settings to confirm the person can review/change the pair, close it, and verify the no-setup path remains available. |
| G04-14 | Offline, search the conversation list for a fixed marker in an older saved message after a newer nonmatching message has become the preview. The result must identify the correct chat, show the matching message, and open that exact message. Cover direct and group peer keys, case/accent folding, and unordered query terms. Compare relay event IDs before and after the UI search and require zero new events. |
| G04-15 | Offline, keep a fake Notification API at permission `default`; identity activation and opening settings must prompt zero times, and one explicit opt-in tap must request permission exactly once and save the setting per identity. With two isolated loopback relays, deliver one inbound message while the conversation is visible and one while the page is hidden: only the hidden message may create one generic notice with no body text, contact name, public key, or event payload. Mute that chat for a fixed 15-minute choice and deliver one more message; it must create no additional notice while the local unread count still increases. Compare relay event IDs before/after preference changes and require zero new events. Do not wait for expiry; fixed logical-time unit cases check the exact mute boundary. |
| G04-16 | Offline, install fake `navigator.setAppBadge` and `clearAppBadge` APIs and keep two synthetic unread messages in a direct conversation. The app must make no badge API call before explicit opt-in. One tap saves the preference for the current identity and shows the aggregate local unread count; opening the conversation updates or clears the count from the local unread stores. A second tap disables and clears the badge. Badge settings must not request Notification permission or add relay events. Save a screenshot of the Property profile control; when the Badging API is missing or rejects, the app remains usable and the setting reports that the badge is unavailable. |

| G04-17 | Offline, replace one synthetic direct-chat history with exactly three messages whose local timestamps are the predefined dates 2026-11-03, 2026-11-04, and 2026-11-05. With the logical clock set to 2026-11-05 at noon, render one sticky date heading per day: the newest two are Today/Yesterday in English and Hoje/Ontem in Portuguese; the older heading includes its weekday and full date. Unit cases verify year inclusion and invalid timestamps. Capture both languages and require zero relay-event changes or edits to message timestamps/body. |
| G04-18 | Offline, seed exactly 20 older local history messages, scroll A away from the bottom, then deliver exactly three new NIP-17 messages from B to A and send one message from A. The first two inbound messages leave A's visible anchor in place and show a count of two; the count remains two after a language switch and a rerender. Verify the accessible button label in English and Portuguese, scroll to the latest messages and require the count to clear, then deliver the third inbound while at the bottom and require the view to remain there. After scrolling up again, A's own send must return the view to the bottom without counting it as new. A fixed unit fixture also checks that older history catch-up and duplicate IDs do not increment the pill. Use only the isolated loopback relays, and capture the two-language counted state. |
| G04-19 | Offline, create one identity against a loopback relay and leave its conversation list empty. Verify that the home screen offers New conversation, Join with a contact link or code, and Share my contact. Capture English desktop, English 390×844 mobile, and Portuguese desktop views. Open Share my contact and require the existing Property URL, public nprofile, and locally generated QR; close it. Open Join and require focus in the public-key field; enter a second test identity's npub and open the conversation. Compare the local relay's authored-event IDs before and after; opening the conversation and preparing a contact share must publish no event. Use only the isolated relay and disposable identities. |
| G04-20 | Offline, publish one GitHub identity claim through the profile UI and verify exactly one signed kind 10011 event appears on the loopback relay. Confirm Copy verification text produces the canonical npub proof. As a contact, load the signed claim from that relay and require zero GitHub requests before pressing Verify. Mock the fixed GitHub Gist API response; after one explicit Verify tap, require exactly one credential-free request, the verified result, zero external network requests, and zero new relay events. Use disposable identities and a fixed public-shaped Gist fixture; never contact GitHub. |
| G04-21 | Offline, type an HTTPS link in a direct NIP-17 conversation and require zero requests before consent. Cancel the consent dialog and require zero requests; confirm once and require exactly one mocked metadata request with credentials/referrer omitted, redirects rejected, HTML size capped, and no remote images loaded. Send the message and verify that the preview tag is inside the encrypted rumor, the recipient renders it without fetching the destination, and the loopback relay event contains no preview URL/title/tag in plaintext. Verify the action, warning, and card in English and Portuguese. Use only a fixed local HTML response and disposable identities. |
| G04-22 | Offline, in a NIP-17 group with names already known locally, type `@` and select a participant by keyboard. Verify that suggestions use only group members and do not cover the draft at 390×844. Send a fixed message and verify that the other browser decrypts a NIP-27 `nostr:npub` reference and resolves it to the intended participant. Query the loopback relays and require encrypted gift wraps only, with no readable message or mentioned name. Use disposable identities and no public relays. |
| G04-23 | Offline, send one fixed NIP-17 message containing `geo:0,0?q=38.6916,-9.2160(Torre%20de%20Bel%C3%A9m)` between two disposable identities. Both browsers must render a local card with the same place name and coordinates; the relay must store only encrypted wraps. Check the map link uses the parsed coordinates, opens only after a deliberate link activation, and explains that the map provider receives the coordinates and device IP. Render English and Portuguese labels, verify no map image/tile appears, and require zero external requests before any activation. A fixed unit corpus rejects malformed and out-of-range coordinates, lookalike hosts, and locations inside code or hidden spoilers. |
| G04-24 | Offline, forward one fixed private message from identity A to C through the existing NIP-17 flow. Preserve the body unchanged, render the localized badge in English and Portuguese (Brazil) for sender and recipient, capture 390×844 screenshots, store a bounded hop marker inside the encrypted rumor, and verify the local relay sees neither plaintext nor an outer hop tag or original-author reference. |
| G04-25 | Offline, keep A and B in an active NIP-17 direct conversation on isolated loopback Geode. Run exactly two predefined typing repetitions: one English draft and one Portuguese (Brazil) draft. Verify A sees the localized live status, capture a 390×844 screenshot, then blur B’s composer and verify the decrypted signed start/stop signals clear it in sequence. In Profile, disable typing for B, verify the per-identity setting is stored and one fixed opt-out draft emits zero signals or remote status, then re-enable it. Require the outer event route to contain only A, no event to contain either draft, no new message row, and no retained kind-21059 event on either relay. |
| G04-26 | Offline, publish a Bluesky NIP-39 claim through the profile UI and confirm exactly one signed kind 10011 event is stored on the loopback relay without deleting an existing GitHub claim. As a contact, loading the signed claim must make zero Bluesky requests. After exactly one explicit Verify action, intercept exactly two GETs to `public.api.bsky.app`: resolve the claimed handle and fetch its `getPostThread` record. Require omitted credentials and referrer, redirect rejection, bounded JSON bodies, exact handle/DID/post URI/author/type matching, and the Nostr npub in the public post text. Mismatched or oversized fixtures must fail closed; verification must publish zero new relay events. No live Bluesky request is allowed. |
| G04-27 | Offline, exercise one three-chunk direct file between disposable peers and interrupt after exactly two accepted chunks. Retry once in the same page with the same manifest; require offset two only after both peers confirm the authenticated prefix, then cancel before sending. Simulate one page reload, reselect the exact same file, and start a new transfer ID; require the same two-block prefix to be found, rebound under the new ID, and confirmed before exactly one remaining chunk crosses the channel and the whole-file hash passes. Repeat invalid-prefix checks for exactly one corrupted first block, one missing prefix block, one changed manifest, and one different peer; each must fall back to zero and no later block may bridge a gap. Simulate a peer with no resume capability and require the existing full-send path. Keep relay/HTTP egress disabled and capture no plaintext, keys, or external traffic. |

### G05 — Multiple relays/layers and bridges

| Case | Procedure and acceptance |
|---|---|
| G05-01 | On chain R1→R2→R3→R4, send public corpus through three real module bridges. B receives only at R4; signatures, IDs, and content remain identical. Counters/ACLs prove each hop and absence of shortcut. |
| G05-02 | Stop P23: a new event must not reach R4. Restore it and use the fixed query/replay sequence to sync eligible event. Repeat three destination absence queries while P23 is stopped; then verify one copy at R3/R4. Check age separately in G05-06 with 5.3 timestamps. |
| G05-03 | Add redundant diamond path, then cycle and star. Deduplication yields one UI appearance without unbounded amplification. Stopping one path preserves delivery via the other only when topology still connects source/destination. |
| G05-04 | Partition and reunite relay groups; restart a bridge, receive two events out of order, and query each ID again. Reconcile each event once at every destination; check age/retention only with fixed timestamp fixtures from 5.3. |
| G05-05 | Inject B's NIP-17 envelope at R1: P12/P23/P34 and identity C must refuse forwarding. Then use B's bridge, with B as local identity, between B's inboxes; only it forwards B's encrypted envelope to allowed destinations. A's copy follows A's list. |
| G05-06 | Test bridge off/on, source exclusion, dedup, invalid/old/future events, and batch limits using a fixed logical clock: one fixture at each boundary and three negative fixtures per class; 61 attempts in one window (60 accepted) and one event after one logical step; reject UTF-8 bytes over 2,000,000 aggregated per destination. Excess is observably contained; do not wait for a real window. |
| G05-07 | Suspend/close simulated mobile context and stop its bridge. PC relays remain available; reopening resumes possible sync. Do not approve continuous mobile service from emulated desktop context. |
| G05-08 | Conflict healing: split R1/R2 from R3/R4 with no bridge path. Two isolated clients holding the same synthetic signing identity publish different valid versions of one addressable marketplace item (same `pubkey`, `kind=30018`, and `d` tag) with `created_at=NOW`; each side also publishes one regular event. Confirm three destination-absence queries before reconnecting. Restore only the configured bridge, reconcile the item, and feed the same two signed versions to Property's real marketplace selector in both array orders; require the same effective item on all four relays and exactly one UI card. For equal timestamps, Property resolves the tie by the lowest event ID as specified by [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md). Stop the inter-group bridge to create a second partition, publish one valid newer version at `NOW+1` on one side, confirm three absence queries on the other side, then reconnect and require the newer version to become effective everywhere independent of arrival order. Both regular events remain queryable and appear once. A tampered signature never wins. Relays do not automatically federate, and the test must not require them to retain discarded historical versions. All event values, input orders, IDs, and logical-clock steps are fixtures; no wall-clock criterion. |

G05-08 was added on 2026-11-04 from a maintainer-reported partition-conflict scenario. Historical G05 evidence covers G05-01–07 only and does not pass this additional case; the expanded G05 gate remains pending until G05-08 is executed with evidence.

### G06 — Hangout and initial marketplace

| Case | Procedure and acceptance |
|---|---|
| G06-01 | A publishes kind 1 note; B discovers it on another relay through public chain, identifies origin/authorship, and starts a conversation through UI. Public feed stays clearly public; UI does not offer a nonexistent private room. |
| G06-02 | Publish, discover, and edit BTC/XMR/XNO offers through UI; real Geode round-trip preserves author, `d`, currency, and integer `price_atomic`. Test 1 satoshi, 1 piconero, 1 raw, and documented boundaries without `Number`/rounding for the exact amount. |
| G06-03 | Withdraw an offer and receive an old copy via another relay: it does not reappear. A withdrawal request from another author or invalid timestamp does not remove a valid offer. |
| G06-04 | Test unknown currency, excess precision, overflow, malformed listing, expiration (`expiration=NOW-1`), future event (`createdAt=NOW+301`), and unsafe URL/images. Before each addressable-event edit, advance logical time exactly two steps of 1,000 ms to get a later timestamp without waiting. Nothing executes code, loads trackers, or silently converts currency/unit. |
| G06-05 | Contact seller without checkout: correct recipient and preserved price/terms, with no fictitious charge/purchase. Record NIP-15 draft limitation; do not claim interoperability beyond tested format. |

### G07 — Real campaign state machine and privacy

| Case | Procedure and acceptance |
|---|---|
| G07-01 | D sends signed proposal to N1/N2 at fixed logical `NOW`. Node engine validates content, amount, currency, term, and policy; N1 accepts while N2 independently rejects. Decisions persist without central authority. Missing engine is FAIL. |
| G07-02 | Rejection does not request payment or publish an ad. Signed acceptance binds campaign, currency, amount, dedicated address, expiry, and refund terms; later changes invalidate the agreement. |
| G07-03 | Use deterministic ledger simulator only to test the real state machine: offer `expiresAt=NOW+180`; evaluate pending/confirmed payment and expire by advancing 181 logical seconds after `NOW`. Reconcile every transition exactly once; test rejection, invalid payment, and refund. Do not mock the engine itself. Passing this does not replace G08. |
| G07-04 | Publish three identical notifications and reconcile three times; test payment observed at `expiresAt+1` after offer `NOW+1`; alter currency/amount/address and restart at each state. Publication/refund are idempotent; no activation from declared txid, duplicate credit, or lost reconciliation. |
| G07-05 | Opt-in is off by default; sponsorship is identified and node can be blocked. Query twice at the same logical instant to check local exposure cap; then record synthetic exposure at `NOW-(EXPOSURE_WINDOW_SECONDS+1)` and query at `NOW` to prove a new display without waiting. Creative remains separate from feed/messages; encrypted envelope is unchanged. |
| G07-06 | Inspect traffic during query/display/click. No pixel, remote script, or read/click/profile telemetry. Link opens only by explicit action to a local test destination; do not omit normal navigation traffic from report. |
| G07-07 | Switch N1 to N2 and compare exposure/retention policies. Respect local preferences; absence of advertiser/revenue does not stop basic communication or create hidden charges. |

### G08 — BTC/XMR/XNO settlement, entirely local

Prepare pinned binaries and disposable wallets. Use Bitcoin regtest, a private/local Monero network supported by the version, and a private local Nano network with test genesis. Disable seeds, discovery, and external peers. Do not use public signet/stagenet/testnet to pass.

| Case | Procedure and acceptance |
|---|---|
| G08-01 | For each currency, the real engine/adapter receives payment at a dedicated address/subaddress. The local node/wallet proves amount/state; publish only then. Reconcile the same tx again after confirmation for idempotency, using fixed confirmations/blocks in 5.3. Check offer, address, atomic integer, transaction, and one publication. |
| G08-02 | BTC: wrong output/address, wrong amount, mempool-pending, conflict/replacement, and confirmation. Reorg by invalidating exactly one block, then mine exactly one after reconsideration. Confirmation gate is explicit; no confirmed transfer means no activation. |
| G08-03 | XMR: subaddress, wallet before/after `refresh` (two reads), 10 confirmations/unlock, pop one block, fees, and duplicate receipt. Do not infer sender address; hash alone does not pass. |
| G08-04 | XNO: one raw and boundaries, pending payment, processed receive and confirmation; repeated/out-of-order notification cannot credit twice. Nostr and Nano wallets are independent. |
| G08-05 | For all currencies, test refund with authenticated agreement, fees/net/minimum, RPC failure before/after broadcast, and crash resume. Check ledger/state before retry; at most one valid financial debit. Nano may return to a validated account; BTC/XMR do not infer a refund address. |
| G08-06 | Insufficient balance, wrong currency, pending settlement, and reorg remain reconcilable without fake success. Read the same transaction three times without mining; only manifest confirmation count permits transition. Wallet conservation: opening balance + credits - debits - fees = closing balance, distinguishing pending/locked/available. |
| G08-07 | RPC is authenticated and local to the lab; credentials do not appear in PWA/events/logs. Enforce balance/action limits and absence of mainnet. No seed leaves operator host. Disabling real ledger must prevent confirmation and prove the adapter does not return constant success. |

Fix confirmations, fees, minimums, and retention in the manifest before cases. Only testability parameters may be lower in the lab; report differences from production. A balance mock or fictional transaction ID cannot replace G08.

### G09 — Failures, abuse, persistence, and node migration

| Case | Procedure and acceptance |
|---|---|
| G09-01 | Abruptly stop only test processes during write/send/edit/campaign. Restart with the same database; committed data remains, and financial/publication operations are not incorrectly repeated. |
| G09-02 | A local proxy injects disconnects, queue-release reordering, invalid frames, false/negative ACKs, and unavailable relay. Client reports true state, recovers connections, and respects fixed retry/resource counts. Do not add timed delays. |
| G09-03 | Limit temporary-volume disk and test locked database/invalid config. Node reports failure, preserves data per policy, never touches user volume or claims persistence without a write. |
| G09-04 | Receive duplicate, oversized, invalid, and over-quota flood events. Event/byte rate limits and memory remain bounded without freezing UI; normal corpus works afterward. |
| G09-05 | Test `PROPERTY_RELAY_*` and legacy aliases, precedence, and old directories with synthetic data. Tampered runtime/missing segment prevents startup; never download a substitute. |
| G09-06 | Remove H, one relay, one bridge, and one campaign node separately. Only dependent routes/features fail; remaining network works and private content never escapes through fallback. |

### G10 — Complete journeys and UX criteria

Each journey uses the real browser app through visible controls; direct internal calls may support assertions but cannot replace clicks/forms/navigation. Do not mock backend/relay in end-to-end cases. Capture console, sanitized traffic, and acceptance screenshots.

| Case | Procedure and acceptance |
|---|---|
| G10-01 | Fresh contexts: create A/B, configure local relays, publish inbox lists, share/select contact, converse, and reply. No terminal for app users, no private-key request in ordinary flow, and clear recipient identification. |
| G10-02 | B offline; A sends; one inbox and H fail; B reopens cached shell and recovers. Each message appears once, network state is accurate, and no hidden central dependency. |
| G10-03 | UI journeys: Hangout → author → conversation; marketplace → publish → edit → contact → withdraw; campaign → opt in → display → block node. Validate relay/engine effects, not just buttons. |
| G10-04 | Backup/recovery in clean profile, session, block, and data migration. Restore correct identity without erasing source or exposing secrets in captures. |
| G10-05 | Viewports 360×800, 390×844, 768×1024, and 1440×900; keyboard, 200% zoom, visible focus, accessible names, and notices in the selected app language. On a fresh profile, verify English is the default; switch to Português (Brasil), reload, and confirm the selection persists. Verify that user-written names/posts/offers/messages and agent message bodies are never translated. No essential hidden/inaccessible control or unintended horizontal scroll. Emulated mobile viewport is not physical iOS/Android installation. |
| G10-06 | With four relays and three real bridges, send exactly 50 private messages and 100 public notes. Reconcile content, authorship, IDs, ACKs, destination delivery, and unique storage; capture bundle bytes, RSS, and disk after message batch and each 50-note batch. Check visual deduplication in the five G11 samples. PASS depends on counts/invariants, not latency/load/recovery time. Do not extrapolate to internet/4G. |
| G10-07 | Through the same PWA, create and reopen a private group; verify title, participant count, sender labels, reply/reaction/forward controls, errors for invalid membership, and NIP-17 inbox explanation in English and Portuguese. Repeat at 390×844 and 1440×900; no separate app, identity, transport, or private-key step appears. Clearly disclose that the protocol has no admin or reliable leave/removal controls. |
| G10-08 | Inspect Install Property before and after identity activation. Run exactly three harness cycles for each state: native prompt accepted, prompt dismissed, no native prompt, and already installed. No prompt appears before a person clicks; dismissal gives optional instructions, unsupported browsers are told to keep using the site if no install option exists, and installed mode hides the control. Run exactly three opens for each New conversation, Hangout, and Marketplace shortcut, proving only allowlisted Property screens open after identity activation; an unknown query action does nothing. Repeat the visible copy in English and Portuguese. |

If a tool cannot provide a required count/evidence, instrument the harness or mark BLOCKED; do not estimate. Memory/disk limits are resource checks at fixed checkpoints, not speed targets. Justify changes before retest, never silently tune to a result.

### G11 — Repeatability, multi-relay cycles, and closure

| Case | Procedure and acceptance |
|---|---|
| G11-01 | Repeat short functional set twice with the same seed in clean labs and a third time with a different seed. Invariants/counts match; cryptographic key/ID differences are not compared as identities between runs. |
| G11-02 | Repeat runtime hash/reassembly and offline PWA packaging. Reused-code build uses inventoried local tools/dependencies; record hashes and explain nondeterministic variation. If toolchain cache prevents rebuild, PASS may inherit two approved offline builds only if every Geode/Gradle input is unchanged on this candidate and installed tree matches both recorded outputs by content. Record current blocked attempt and inherited hashes/commits; do not claim a fresh build. Otherwise BLOCKED. |
| G11-03 | Run exactly 300 sequential probes on three real relays and two bridges with fixed logical timestamps. Restart intermediate relay after probes 60, 150, and 240. At each restart, publish exactly three source events, prove they are absent at destination while layer is down, then reconcile all three through intermediate and destination after recovery. Advance logical clock by one fixed step after each batch of 50 probes to check the 60-event/window quota without waiting. Verify all 300 accepted IDs at destination, nine partition probes, zero loss, visual deduplication in five samples, and RSS/disk at every 25-probe checkpoint; aggregate RSS ≤70% of starting available memory and scratch ≤2 GiB. Finally advance logical clock by 31 fixed steps of 60,000 ms; verify inactivity lock, session key removal, enabled public bridge continuity, and stop command for a locked bridge. Result depends only on counts/invariants, never elapsed real time. |
| G11-04 | Reconcile corpus, financial states, caches, and volumes; audit egress end-to-end. No inconsistency, loss of accepted/retained event, duplicate financial operation, or secret in artifacts. |
| G11-05 | Before G12, audit G00–G11 exact case IDs, states, evidence references, and checkpoints. After G12, create separate audit for G00–G12. Interrupted/missing trials prevent corresponding result. |
| G11-06 | Run exactly 96 probes across seven real Geode processes and six PWA bridges with distinct IDs. Each signed event uses fixed synthetic epoch plus predetermined sequence; contents/counters produce distinct IDs. Each event is accepted/queryable exactly once on all seven relays. All six bridges advance logical time by one second per event in synchronized counted steps to preserve feed order without waiting. Restart central relay after probes 24, 48, 72, and 96. In each cycle publish exactly three events during partition, query destination once to prove absence, then reconcile each ID exactly once on all seven relays after recovery. Verify UI deduplication at probes 1, 24, 48, and 96 on each bridge. Measure RSS/disk initially, every six probes, and after each restart; aggregate RSS ≤70% of starting available memory and scratch ≤2 GiB. Require 17 resource checkpoints for probe sequence (initial + 16 counts), four post-restart, four UI samples, 12 reconciled events, zero loss/duplication, and zero external egress. Readiness watchdogs only prevent hangs. Manifest candidate must match executed HEAD. No elapsed-time condition. |

### G12 — Offline systems and browser matrix

| Case | Environment and acceptance |
|---|---|
| G12-01 | Linux x86_64: bundled-runtime launcher, paths with spaces, permissions, SQLite, corpus, restart, and PWA in local Chromium/Firefox. Repeat without Java on process PATH. |
| G12-02 | Real Windows x64 or Windows VM: PowerShell, bundled runtime, paths with spaces, persistence/cleanup, and PWA in Edge/Chrome. Wine, parsing `.ps1`, or Linux runner does not prove native execution. |
| G12-03 | Real macOS Apple Silicon or compatible VM: launcher, runtime, persistence, and PWA in Safari/Chrome. Linux WebKit does not certify macOS Safari; x64 runner does not certify arm64. |
| G12-04 | Android browser in lab emulator; disable guest Wi-Fi/mobile data and prove host has no public/default route before/after. Identity, message, recovery, and reconnection across three suspend/resume cycles. Record routes, browser/version, install support. No guest root required; suspended duration is not a criterion. |
| G12-05 | iOS/iPadOS Safari in available Mac simulator or local device, offline; repeat same flows over three suspend/resume cycles. Record if home-screen install requires a physical device and was not proven; suspended duration is not a criterion. |
| G12-06 | When PWA install is unsupported, verify site remains usable and gives no false instructions. Record physical installation/background as unproven if only simulator was used; absence of install API in declared environment must not wrongly block functional website approval. |

Prepare the package and same fixtures on each system before blocking egress; action/toolchain/image downloads are preparation only. During native journeys remove public/default routes or prove outbound firewall blocks public egress; local/private, link-local, and loopback routes may remain. Record IPv4/IPv6 tables without public/default routes, no proxy, and working loopback before/after. Android proof combines guest Wi-Fi/data disabled with host public-route blocking; guest gateway routes may remain if host cannot forward to public internet. Browser deny-all proxy is additional evidence, not a substitute for host and guest isolation. Do not send external traffic to verify the block. GitHub Actions may produce native reports if preparation happens before isolation and tests remain offline; restore connectivity only after closing the harness and recording evidence, for artifact publication. An intermediate Ubuntu profile may leave G12-02–05 `PENDING` and complete `PROPERTY_UBUNTU_OFFLINE_PASS`; these cases are not approval and prevent `PROPERTY_SCOPE_OFFLINE_PASS`. Emulator functionality does not certify physical installation or permanent background operation.

## 7. Existing commands and infrastructure status

Run commands only inside the prepared isolation:

```bash
bash property/tests/run-smoke.sh
bash property/tests/run-bridge-integration.sh 17450 17451
node property/tests/native-relay-integration.mjs
```

Ports shown are examples. Check availability/reserve per run. The launcher must use temporary `DATA_DIR`/`CONFIG_DIR`, separate from user data directories.

| Planned deliverable | Minimum contract |
|---|---|
| Offline orchestrator | Full profile traverses G00–G12. `run-offline.mjs` validates manifest/inventory and executor provenance, fails closed unless isolation is proven, and starts relays only after eligible G00. Executor/model selection is metadata, not approval criteria. Child JVMs use isolated run `TMPDIR` via `java.io.tmpdir`. `--resume` checks commit, diff, plan, manifest, profile, report, and hashes; archives the attempt and restarts at G00 without carrying PASS. Never start dependent gate if prior case failed/blocked/pending/incomplete. Isolated retests do not certify a full run. |
| Lab manifest | Validates seed, commit, executor provenance, budget, ports, browser/engine/versions, hashes; records diff, files, sources, tools, and external currency tools by absolute path/SHA-256. Generate RPC credentials only in test process; do not persist them in manifest. |
| Multi-relay harness | Two/seven Geode scripts and browser harnesses G05/G09/G11 exercise real relays, PWA bridges, topologies, failures, limits, restarts, reconciliation. G09 includes crash, bounded storage, hostile events, tampered runtime, isolated failures. G11-03: 300 probes, three restarts, nine partition events. G11-06: 96 probes, four restarts, 12 reconciled events, fixed UI/resource checkpoints on seven relays/six bridges. |
| Browser automation | Playwright/browser pinned by version/hash, localhost server, blocking proxy, capture requests/WebSockets/errors. G10 inherits full journeys from full run and adds desktop/mobile viewports, approximately 200% zoom, focus, accessible names, and fallback without install support. |
| Engine/adapters | G07 tests persistent/signed engine with deterministic ledger for state machine only. G08 uses hash-pinned real Bitcoin Core/Monero/Nano binaries, private networks/wallets, local authenticated RPC, reconciliation, and financial cases. G07 does not replace G08 settlement. |
| Automated report | Full profile records 76 cases, checkpoints, events, manifest, inventory, topology, isolation, report, and hashes. Intermediate Ubuntu profile may leave G12-02–05 PENDING; run G12-01/G12-06 on Linux. G11-06 requires 96 probes, four restarts, 12 reconciled events, and fixed samples. Full pass requires G00–G12 plus four native reports from same candidate. Executor identity is provenance only. |

Partially implemented runner commands:

```bash
node property/tests/offline/run-offline.mjs --profile core --manifest /path/lab.json
node property/tests/offline/run-offline.mjs --profile platforms --manifest /path/lab.json
node property/tests/offline/run-offline.mjs --profile full --manifest /path/lab.json
node property/tests/offline/run-offline.mjs --profile core --manifest /path/lab.json --output /path/run-id --resume
```

Full profile runs G00–G12, with G08 conditional on hash-pinned ledger tools in manifest. Ubuntu full profile leaves G12-02–05 PENDING until separate native trials. Full objective requires those four cases on corresponding Windows/macOS/Android/iOS/iPadOS systems, reconciled against the same candidate; never simulate approval. Resume requires the same manifest/directory. Commit, diff/files, plan, config, profile, or dependent report change invalidates resume before artifacts move. Archive every attempt, verify hashes when available, and restart at G00 without inherited PASS. Missing tools required by current profile are BLOCKED; missing functionality is FAIL.

## 8. Evidence and resume

Suggested work directory: `/tmp/property-offline/<run-id>` with private permissions. Persist sanitized version under `property/docs/evidence/offline/<run-id>/`, review size/content before committing. Raw dumps, profiles, wallets, passwords, and unsanitized traffic do not belong in the repository.

Minimum artifacts: `manifest.json` (schema, run ID, planned/actual executor and source, tool/model version if available, timestamp, commit/diff, product/harness hashes, seed, platform, browser, budget); `isolation.json` (inspected rules/allowlist, egress counters, lab config, explicit statement no public probe was sent; no proxy values/credentials/personal data); `topology.json` (processes, relays, databases, allowed links, corpus, injected failures, transition times); `cases.jsonl` (final record per case with gate, requirement, command, timestamps, expected/observed/status/exit/reason/evidence references); incremental `case-events.jsonl`, `cases.latest.jsonl`, `gate-checkpoints.jsonl`; `resume-state.json` and `resume-review.json` (attempt fingerprint/compatibility, pending summary, archived path; resume always restarts at G00); `reconciliation.json` (public IDs/envelopes/counts per relay/UI; synthetic atomic balances/fees/states, no private content/keys); `summary.json`, `report.md` (gate state, PASS/FAIL/BLOCKED/NOT_RUN totals, measured limits, defects, derived result); `SHA256SUMS` for sanitized artifacts/screenshots.

Preserve failure/correction history; do not overwrite an initial failure. An observation field does not replace an assertion. Compare commit/diff/config on resume: code changes invalidate at least affected case and dependents; final certification requires compatible complete regression, including G11-03 on final candidate. Old duration trials do not replace the new counts.

## 9. Traceability to the previous plan

All old cases remain available in the historical plan. For each case, the run report must point to its successor and evidence.

| Earlier IDs | Successor gates |
|---|---|
| SRC-01–SRC-07 | G00, G02, G11 |
| PWA-01–PWA-09 | G02, G04, G09, G10, G12; public publication is separate |
| IDN-01–IDN-08 | G03, G10 |
| MSG-01–MSG-08 | G04, G05, G09, G10, G12 |
| NOD-01–NOD-06 | G05, G07, G09, G11 |
| AD-01–AD-14 | G07, G08, G10 |
| XNO-01–XNO-09 | G07, G08 |
| XMR-01–XMR-05 | G07, G08 |
| BTC-01–BTC-03 | G06, G07, G08 |
| MONEY-01–MONEY-04 | G01, G06, G08 |
| HNG-01–HNG-04 | G05, G06, G10 |
| MKT-01–MKT-05 | G06, G10 |
| PROP-01–PROP-05 | G02, G03, G09, G12; deployment is separate |
| OS-01–OS-04 | G12 |
| Security, privacy, usability, exit criteria without IDs | G00, G02, G03, G04, G07, G08, G09, G10, G11 |

## 10. Current state and expected delivery

Historical records include 12 local suites, two-relay integration, earlier publication, and native Linux/Windows/macOS matrix. They help reproduce a baseline; they do not automatically approve isolation, seven relays, complete journeys, financial engine, private networks, new repetition cycles, or the current offline matrix.

Known gaps at the start of this revision included the full orchestrator, seven-relay/failure harness, browser journeys, campaign/payment engine, local ledger tools, recovery repetition cycles, and platform matrix. Some executors for these gates have since been integrated. Ubuntu profile approval requires the Ubuntu full run to finish. Native tests on other operating systems remain PENDING and do not stop Ubuntu progress; cross-platform certification requires the respective native trials.

Historical execution notes and per-run evidence remain in [the Brazilian Portuguese source/history](plano-de-testes-central.pt-BR.md) and [`evidence/offline/`](evidence/offline/). They are preserved in their authored language and are not a substitute for current status. The latest report, not an older checkpoint, governs each case's state.

### Targeted G04 verification — 2026-11-06

The preceding browser run passed the 21 G04 cases registered at that point with Firefox 153, Playwright 1.62.1, two disposable Geode relays bound to loopback, and no observed external requests. Its results are historical for that earlier case set; they do not include G04-25. The forwarding captures and report remain in [`evidence/offline/property-forwarding-marker-g04-20261106-05/`](evidence/offline/property-forwarding-marker-g04-20261106-05/).

The follow-up G04-25 browser run passed on Firefox 153 and Playwright 1.62.1 with two disposable Geode relays on loopback and zero observed external requests. It completed the two fixed locale repetitions, decrypted the recipient’s signed start/stop signals, verified the per-identity opt-out and re-enable, and found no draft in relay data or retained kind-21059 events. The sanitized report and 390×844 captures are in [`evidence/offline/property-typing-indicators-g04-20261106-08/`](evidence/offline/property-typing-indicators-g04-20261106-08/). This targeted case does not approve the full G00–G12 profile.

The subsequent integrated browser run passed all 22 registered G04 cases on Chromium 153 with Playwright 1.62.1 and two disposable Geode relays bound to loopback. It recorded zero external HTTP requests and zero page runtime errors. G04-25 passed within the full journey, including its two locale repetitions, per-identity opt-out, decrypted start/stop, and no draft/message/relay retention. The sanitized report and 20 screenshots are in [`evidence/offline/property-g04-complete-20261106-13/`](evidence/offline/property-g04-complete-20261106-13/). This expands G04 evidence only; it does not approve the full G00–G12 profile.
