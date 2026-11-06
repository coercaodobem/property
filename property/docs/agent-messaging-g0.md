# G0 — Current decision: direct agent messaging

**English** · [Português (Brasil)](agent-messaging-g0.pt-BR.md)

**ADR:** `ADR-AGENT-002`, revised 2026-11-03.

**Decision:** connect directly using a Nostr public key, without invitations, pairing, access grants, or conversation/message approval.

**Scope:** product decisions and threat model; each test's state is recorded in its evidence report.

**Pinned protocols:** [local snapshots and hashes](protocol-snapshots/README.md).

## 1. Approved flow

- Each agent has its own Nostr identity, created and protected locally. It is not the human's identity and never receives the human's private key.
- An agent can address any valid Nostr public key. MCP uses the 64-character hex value; in the PWA, a person can enter an `npub` or hex public key.
- In the PWA, a person can start a direct conversation and select the agent messaging protocol for that conversation. This only selects message format; it grants no access to other conversations, data, tools, or the human's key.
- A valid agent message may start a conversation too. The PWA creates it, displays an “Agent protocol” label, and keeps it separate from human conversations.
- A person may locally block or unblock an agent identity. Blocking affects only this device, prevents future reads/sends in that conversation, and preserves local history. It is not required to start a conversation.
- There is no allowlist, invitation, approval queue, permission request, or Property confirmation before messaging. An AI host may require its own confirmations; that policy is outside Property's control.

## 2. Identity, custody, and bridge limits

- The local daemon creates the agent identity and stores it in a separate vault encrypted with AES-GCM-256, a random 16-byte salt, and PBKDF2-HMAC-SHA-256 with 600,000 iterations. The process keeps the key in memory while unlocked and clears its working copy when locked.
- On Ubuntu, `property-agent init` creates the vault under `$XDG_DATA_HOME/property/agents/` (fallback `~/.local/share/property/agents/`). The daemon uses a Unix socket restricted to the local user; MCP uses stdio and opens no TCP listener.
- The bridge accesses only the agent identity and its inbox. It does not retrieve or send the human key, read the human's other conversations, or expose a shell, filesystem, browser, remote tool, or arbitrary signing.
- The inbox relay list is published as a NIP-17 kind 10050 event. Sending looks up that list on relays chosen by the agent and falls back to its local inbox relays. A relay ACK proves only that the relay accepted the event.
- Windows, macOS, Android, and iOS are supported only after platform-specific implementation and evidence. The operating system may suspend the PWA.

## 3. Transport and format

| Component | Decision |
|---|---|
| Private message | NIP-17 with NIP-44 v2 and NIP-59; no custom encryption or mandatory relay. |
| Agent envelope | `property-agent-message/v1`, only inside NIP-17 content. It is not a Nostr standard or a claim of external interoperability. |
| Envelope fields | `protocol`, `version`, `conversation_id`, `message_id`, `in_reply_to`, and `body`; no attachments, commands, or extra fields. |
| Limits | UTF-8 body up to 8 KiB, envelope up to 16 KiB, up to 3 inbox relays, 30 sends per agent per fixed logical 60-second window, and 30 thinking/refresh events per agent per fixed logical 60-second window. |
| MCP | Version `2026-07-28`, local stdio, five fixed tools: `property_status`, `property_list_conversations`, `property_read_messages`, `property_send_message`, `property_set_activity`. No approval tool. |
| A2A / NIP-89 / NIP-90 | Do not claim A2A conformance or use those protocols for identity/pairing. Evaluate interoperability separately before extending the contract. |

Received content is untrusted text. Property does not execute instructions, Markdown, links, or message content. Events, signatures, envelope, and conversation identifier are checked before display; unknown versions get a clear warning or are rejected. Encryption protects message content, not all metadata: relays may still observe outer addressing, IP, size, and traffic patterns.

## 4. Threat model

| Threat | Current control and planned evidence |
|---|---|
| Theft of human identity | Agent key is separate; bridge does not hold the human key. Validate schemas, logs, package, and vault in G2/G4/G5. |
| Malicious message or prompt injection | Treat body as text; no implicit execution. G5 uses a synthetic hostile corpus and checks side effects. |
| Spam or unwanted agent | Reversible local block, inbox, and local limits. G3/G4 validate agent-initiated conversations; G6 checks human-facing labels/blocking. |
| Impersonation | Identity is the key that signed events; a declared name/profile does not prove identity. Verify signature and envelope before persisting. |
| Replay, duplicate, or reordering | Deduplicate by event/message ID and use explicit correlation. G3/G5 use fixed counts. |
| Unavailable or malicious relay | Explicit failure, user-selected connections, and send state limited to the observed ACK. |
| Oversized payload/resource abuse | Byte/count limits and logical clock; no acceptance criterion based on real waiting time. |
| Compromised MCP host | Bridge has no access to human identity or generic tools; the host may copy content it has read. |

This model does not protect against malware or an administrator controlling the same device while it is unlocked, nor can it erase copies already received by relays or hosts.

## 5. MCP interface

- `property_status`: reports the independent public identity and local counts, without secrets.
- `property_list_conversations`: lists conversations observed in this agent's inbox, excluding locally blocked identities.
- `property_read_messages`: reads up to 100 messages from a public key, limited to this agent's inbox.
- `property_send_message`: sends private text to any valid public key without prior registration; an ACK does not prove delivery or reading.
- `property_set_activity`: sends or clears a text-free encrypted `thinking` indicator as an ephemeral NIP-59 event; the PWA expires it after at most 60 seconds, the agent is limited to 30 thinking/refresh events per fixed logical 60-second window across all contacts, and sending a message clears an active state when possible. `stop` is accepted only for a locally tracked active state.

The five tools have strict arguments. There are no tools to request approval, expand scope, sign arbitrary events, access files, or operate the system. The host sees the send argument it created and may require confirmation under its own policy.

## 6. Status and history

This ADR replaces the previous invitation, pairing, per-contact scopes, and approval model. Pairing code was removed from the shipped shell. Older reports, screenshots, and harnesses remain historical records of the previous behavior; they neither approve nor describe the current flow. Use the latest direct reports in [`evidence/agent-messaging/`](evidence/agent-messaging/) and the [current plan](plano-agentes-human-first.md). G1 still requires sessions with real people before approving human UX; automation does not replace participants.
