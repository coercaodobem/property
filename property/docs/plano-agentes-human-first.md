# Current Plan — Agent Messaging with Human-First UX

**English** · [Português (Brasil)](plano-agentes-human-first.pt-BR.md)

**Updated:** 2026-11-13.

**Target branch:** `modelo-mvp`.

**Scope:** direct agent communication via Nostr/MCP, with a human PWA that remains simple, readable, and safe.

The current flow lets an agent message any valid public Nostr identity without invitation, pairing, contact authorization, or per-message approval. Older invitation and scope-grant evidence belongs to the previous design and does not count toward these criteria. Execution results and pending items are recorded in dated reports under [`evidence/agent-messaging/`](evidence/agent-messaging/).

## 1. Goal and experience

Property should let local agents talk to each other through NIP-17 private messages and let a person talk directly to an agent through the PWA. The person does not need an app store, MCP knowledge, or broad account access to start a conversation.

### Human flow

1. The person selects “New conversation” and enters an `npub`, `nprofile`, hex public key, or Property contact link; they can also scan or receive a QR/link from Profile → Share contact. Opening a shared contact only pre-fills the recipient. The person explicitly opens the conversation before any message is sent.
2. For an agent conversation, the person selects “Use the agent messaging protocol.” This applies only to that conversation and only chooses the envelope format.
3. Property creates the conversation without invitation, approval, or extra permission. Agents can also start with a valid message; the PWA labels and lists it separately.
4. The person can block the agent locally. This prevents new sending/receiving on that device and preserves history. Unblocking restores direct use.

Selecting the protocol does not give the agent the human key, other conversations, tools, files, settings, or funds. Received text is never executed. Property does not require conversation- or message-level confirmation; an MCP host may apply its own policies outside Property's control.

### Agent flow

The MCP host uses an independent Nostr identity, configures inbox relays, and calls twenty local tools: five messaging/activity, six direct-XNO, and nine custodial-escrow tools. Direct XNO payments remain irreversible. The optional escrow flow uses a dedicated custodian wallet and a separately selected Nostr arbiter; it is custodial and does not make Nano transfers reversible or trustless. The local daemon uses a Unix socket; MCP uses stdio.

## 2. Architecture and limits

- **Transport:** NIP-17 with NIP-44 v2 and NIP-59, using kind 14 events and kind 1059 gift wraps.
- **Inbox discovery:** signed kind 10050 list; at most three relays per identity. If the recipient's list is missing, sending uses the local inbox relays as an available route and reports only the observed ACK.
- **Envelope:** `property-agent-message/v1` with strict fields for version, conversation, message, correlation, and text body. Body up to 8 KiB; envelope up to 16 KiB.
- **Quota:** at most 30 sends per agent per fixed logical 60-second window. Trials advance logical time and counts; they do not wait in real time.
- **Blocking:** local to the device/daemon. It is not approval or required registration; it blocks future local reads/sends and is reversible. It cannot remove prior copies from relays or hosts.
- **MCP:** twenty fixed tools: `property_status`, `property_list_conversations`, `property_read_messages`, `property_send_message`, `property_set_activity`, six direct-XNO tools (`property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt`, `property_xno_dispute`), and nine escrow tools (`property_xno_escrow_offer`, `property_xno_escrow_open`, `property_xno_escrow_accept`, `property_xno_escrow_fund`, `property_xno_escrow_approve`, `property_xno_escrow_dispute`, `property_xno_escrow_sync`, `property_xno_escrow_resolve`, `property_xno_escrow_status`). Activity accepts only `thinking` or `stop`; it has no free-text status. No approval, permission expansion, shell, filesystem, browser, or arbitrary Nostr-signing tool. Wallet tools require one-time local setup and arming.
- **Privacy:** the human key never reaches the bridge. Relays can observe protocol metadata. An AI host may retain text it has read.
- **Platforms:** Ubuntu/Linux results do not prove Windows, macOS, Android, or iOS. Untested systems remain `PENDING`.

## 3. Gate rules

Run gates in order with complete evidence, fixed counts, and negative cases. Do not begin a dependent gate before its predecessor passes, except that the maintainer explicitly authorized technical execution on 2026-11-03 while human-evaluation items remain `PENDING`. This exception does not invent participants, change pending items to `PASS`, or certify a release.

- Success criteria are counts and variables defined before a run. Do not use a soak, session duration, or latency threshold as proof of approval.
- Watchdogs only stop hung cases; they never count as success.
- Relay trials use synthetic processes/identities, local Geode, and loopback. No external models, public relays, public test messages, or personal data.
- Do not export keys or passwords. Use no real funds. Evidence stores required hashes, counts, and states, but no secrets or real private-message bodies.
- Fix code failures and repeat the entire affected case; do not mark a gate passed from a partial run.
- Human review and user studies count only when actually conducted. Systems without an available device remain `PENDING`.

## 4. Gates and acceptance criteria

### G0 — Decision and threats

**Acceptance:** ADR defines an independent agent identity, direct messaging without per-contact permission, transport, quota, local blocking, data boundaries, and honest limits. Protocol specification hashes are pinned.

**Evidence:** [current ADR](agent-messaging-g0.md) and [pinned snapshots](protocol-snapshots/README.md).

### G1 — Human UX before pilot

**Participants:** five people, including at least three without development experience. Do not use synthetic agents as substitutes. Each person performs the same tasks: open a human conversation, recognize an agent conversation and its `npub`, respond to an agent's first message, block/unblock, find the privacy boundary, and continue using human conversations. Anyone shown XNO must explain direct-payment irreversibility and, for custodial escrow, the pooled operator wallet, separate arbiter, and the fact that a custodian can bypass Property and move funds. Do not use real funds.

**Acceptance:** at least four of five complete the direct-messaging and blocking flow without help; nobody interprets protocol selection as account access; critical identity/privacy warnings are understood. Anyone shown XNO setup must understand that `ARMAR` enables bounded automation and that escrow is custodial, with no protocol-level guarantee against a dishonest operator. Record failures and fix/repeat affected tasks. Real screen-reader testing and independent review are recorded separately.

**Status:** sessions with real people remain `PENDING` until they happen. Never simulate answers or claim UX approval from automation.

### G2 — Identity, inbox, and blocking

**Cases:** agent identity differs from the human identity; local vault and file permissions; migration from older schemas to a configuration without an allowlist; 10 lock/unlock cycles with the same key pair; 10 read/send attempts while blocked; invalid key, self-key, and invalid-relay checks.

**Acceptance:** no invitation/pairing step; a valid public key can be addressed without a saved contact; blocking is local and reversible; migration preserves applicable blocks, relays, and quota without restoring old permissions. No secrets appear in output or reports.

### G3 — Direct NIP-17 messages

**Offline setup:** two agent processes, three isolated Geode relays, and one Firefox/Ubuntu PWA. Use two synthetic identities and a fixed seed.

**Counts:** 50 messages in each direction; 20 correlated replies; three restarts per agent; nine partition/reconnection events; ten cases for duplicates, tampering, reordering, and unknown version; 20 third-party decryption attempts.

**Human path:** an agent sends the first message with no earlier conversation or human request; PWA creates and labels the conversation; the person replies; agent reads and sends a correlated reply. Existing human conversations remain intact.

**Acceptance:** recipients can read, third parties cannot; relays store only encrypted gift wraps; duplicates do not reappear; no event without a valid envelope is treated as a command. The newest report must list the cases actually run.

### G4 — Local MCP

**Offline setup:** two agent processes, two MCP fixture clients, and one loopback Geode relay. The tool inventory is fixed at twenty; separately inventory five status/messaging/activity tools, six direct-XNO tools, and nine escrow tools.

**Counts:** per agent, 25 reads and 25 sends; 12 thinking/stop activity events (five start/stop pairs plus one thinking state cleared by daemon lock); 10 reads without prior registration; at least one send to a valid, unsaved identity; two simultaneous calls; 10 calls to nonexistent tools; 10 stdio restart cycles; 10 relay-unavailable errors; block/unblock followed by read/send checks.

**Acceptance:** independent public identity, no secrets; inbox reads only messages received by that identity; sending requires no Property approval; activity signals contain only the fixed state, are encrypted and ephemeral, are limited to 30 thinking/refresh events per agent per fixed logical 60-second window, stop on message/lock when possible, and are not retained by the relay; no approval queue/tool or allowlist; no TCP listener. An ACK is reported only as relay acceptance. Do not simulate commercial hosts.

### G5 — Adversarial security

**Counts:** 100 hostile texts across fixed categories (prompt injection, links, redirects, impersonated profile, deep/duplicate JSON, oversized payload, embedded commands, and secret requests); 100 replay copies; 50 above-quota attempts; 20 local block/unblock cycles; 30 valid sends up to the limit.

**Acceptance:** received text triggers no tool, shell, network, policy change, or secret read; invalid parsing/signatures fail closed; byte and quota limits are enforced; blocking affects only the local pair. Independent security review is still required and cannot be replaced by this trial.

### G6 — Automated browser UX

**Ubuntu matrix:** pinned Firefox, five cycles at `1280×900`, and five at mobile viewport `390×844`. Each cycle starts from a disposable profile. Block all external requests.

**Verify:** create conversation by `npub`, select protocol without granting access, no approval screens/tools, clear labels and accessible names, keyboard operation, human conversation preservation, block/unblock, composer disabled while blocked, and restore after unblocking.

**Acceptance:** ten complete cycles, no page errors, and no external requests. This is automated screen validation, not a study with people, screen-reader validation, or physical-device testing.

### G7 — Interoperability and other platforms

Validate with at least two independent agent/client implementations before claiming interoperability. Run native Windows, macOS, Android, and iOS matrices only when those environments are available; record browser, version, device, PWA installation, relays, and repeated cases.

**Status:** missing results remain `PENDING`; they do not stop applicable Ubuntu gates, but they prevent claims of measured cross-platform support or interoperability.

### G8 — Agent XNO offer and trade state machine

**Offline setup:** fixed synthetic Nostr identities, in-memory NIP-17 transport fixture, synthetic Nano wallet methods, fixed seed and logical clock. No real funds, live Nano network, or public relay.

**Counts:** run all 28 cases in `node property/tests/agent-xno-trades-smoke.mjs`, including malformed/forged/expired offers and receipts, fixed amount caps, exhausted/tampered budget journal, lost send response and idempotent retry, confirmation gating, lost receive response and retry, duplicate receipt, disputes without fund freezing, encrypted-at-rest journal and fail-closed tamper checks.

**Acceptance:** every declared case passes; at most one synthetic send and one synthetic receive are recorded; an unconfirmed payment is never received; no secret is present in the report; this direct-payment gate makes no escrow claim. It proves only the modeled implementation path, not Nano network operation or fair delivery.

### G9 — Nano RPC wallet adapter

**Offline setup:** authenticated synthetic RPC server bound only to `127.0.0.1`; fixed development-network/account fixtures. No external network, real wallet, seed, or funds.

**Counts:** run all 14 cases in `node property/tests/agent-nano-wallet-smoke.mjs`: wallet/network/account checks, raw amount cap, same-ID send idempotency, wrong recipient/value, pending confirmation, exact receive validation, receive response loss recovered through account history without a second `receive` call, wrong network, multi-account refusal, remote/localhost RPC refusal, and unauthenticated gateway refusal.

**Acceptance:** all 14 cases pass; the fixture records no more than one synthetic send and one `receive` action; the receive recovery finds the exact confirmed receive block; no external traffic or real funds. Built-in Nano wallet RPC is not approved for production use by this gate.

### G10 — Custodial XNO escrow and separate arbiter

**Offline setup:** one synthetic buyer, seller, custodian, and independent arbiter; deterministic in-memory transport fixture; synthetic Nano wallets; fixed trade IDs and logical clock. The fixture models authenticated sender metadata but does not validate NIP-17 cryptography, which is exercised separately in G4. No external relay, live Nano RPC, or funds.

**Fixed runs:** execute `node property/tests/agent-xno-escrow-smoke.mjs`: two contracts; two seller acceptances; two exact deposits; one buyer-approved seller release; one seller dispute and independent-arbiter refund; one lost receive response, one lost payout response, and one failed status notice with repeat-safe recovery; duplicate open/accept; invalid participant, contract, and settlement cases; concurrent liability-cap rejection; and legacy-journal migration.

**Acceptance:** both final payouts match the signed buyer/seller accounts; the buyer independently verifies the exact deposit as confirmed before release approval; disputed funds do not settle before the arbiter ruling; deposits and payouts are not duplicated after injected lost responses; a missing signed status notice is retried without resending notices already accepted by a relay; buyer deposits consume the same local lifetime budget as direct payments; aggregate custodian liability stays within its cap; all negative cases fail closed. This verifies the application workflow only: the custodian retains control of pooled funds and can bypass the software, so the test cannot establish trustless escrow or live-funds safety.

## 5. Deliverables and records

Each completed run adds a dated report with source commit, command, seed, runtime versions/hashes, variables and counts, PASS/FAIL by case, observed external traffic, limits, and pending items. Screenshots use disposable identities only. Older invitation-flow reports remain as historical records, clearly separate from current direct-message evidence.

- MCP implementation and installation: [`../agent/README.md`](../agent/README.md).
- Deterministic tests and harnesses: [`../tests/`](../tests/).
- Current G3/G4/G5/G6/G8/G9 reports: [`evidence/agent-messaging/`](evidence/agent-messaging/).
- Direct-payment baseline: [G8–G9, 2026-11-13](evidence/agent-messaging/G8-G9-xno-offline-20261113.md), recorded before G10 escrow was implemented.
- Custodial escrow workflow: [G10, 2026-11-13](evidence/agent-messaging/G10-xno-escrow-offline-20261113.md).
- Windows/macOS/Android/iOS, real-person studies, screen reader, commercial MCP hosts, production wallet integration, and independent review remain `PENDING` until actually completed.
