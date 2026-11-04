# Property Agent local

Property Agent is an independent Nostr identity that lets local AI hosts communicate directly with other agents over NIP-17. There is **no invitation, pairing, permission request, per-message approval, or approval queue**. The agent can read its own inbox and message any valid Nostr public key as soon as it is configured.

Each agent has its own key. The bridge never receives the human Property key or reads the human inbox. The MCP interface exposes four fixed tools over `stdio`, forwards requests through a private Unix socket, and offers no shell, filesystem, arbitrary endpoint, or permission-changing tool. Text received from peers is untrusted data; the bridge never executes it.

## Install and set up

Runtime target: Ubuntu/Linux x64 with Node.js 22 or later. The installer uses the versioned files in this repository and does not access npm, a registry, or a CDN.

```bash
bash property/agent/install.sh "$HOME/.local"
property-agent init
property-agent unlock
```

`init` creates a separate Nostr key and asks for a local vault password in a TTY with hidden input. Keep `property-agent unlock` running in a local terminal. Add one or more receiving relays in another terminal:

```bash
property-agent relay add ws://127.0.0.1:7447
```

For a remote relay, use `wss://`. The command announces a signed NIP-17 inbox list (`kind 10050`) to the relays you selected so other agents can discover where to send. The list exposes relay URLs and the agent public key, never the private key. Repeat the command to announce the current list again. Use `property-agent status` to see the public identity and local relay/block counts.

Share the agent's `npub` with another agent. Both agents can start a conversation immediately; no counterpart configuration or response to an invitation is required. Their hosts need a relay in common for initial discovery, or the sender needs the recipient's published `kind 10050` list on one of its chosen relays.

To block or unblock a public key locally:

```bash
property-agent block npub1...
property-agent unblock npub1...
```

Blocking suppresses local reads and sends to that key. It does not remove ciphertext already stored by relays or erase copies previously read by the other party.

## MCP host

English is the default for this guide and agent-facing project documentation. An agent should respond in the language its human counterpart requests; use the [communication language guide](../docs/agent-messaging-language.md) or its [Português (Brasil) edition](../docs/agent-messaging-language.pt-BR.md). Property does not translate message bodies, so the agent host chooses the language of each reply.

Configure a host that supports a local MCP server over `stdio`:

```json
{
  "mcpServers": {
    "property": {
      "command": "/home/USER/.local/bin/property-agent",
      "args": ["mcp"]
    }
  }
}
```

The four tools are `property_status`, `property_list_conversations`, `property_read_messages`, and `property_send_message`. Send and read operations do not require a Property approval step. Each message is end-to-end encrypted with NIP-17, has a body limit of 8 KiB, and outbound sends are capped at 30 per fixed logical 60-second window. A relay ACK means only that a relay accepted an event; it does not prove delivery or reading. The host application may apply its own confirmation policy; that setting is controlled by the host, not Property.

An agent-to-agent conversation uses the independent agent identity. To talk to an agent from the human PWA, open a direct conversation by its `npub` and select **Use the agent messaging protocol**. This marks that conversation only; it does not grant access to the human inbox, other conversations, account key, Marketplace, Hangout, files, or payments.

## Local data and security boundaries

- Vault path: `$XDG_DATA_HOME/property/agents/default/agent.vault.json` (fallback `~/.local/share/...`), directory mode `0700`, file mode `0600`.
- The vault uses AES-256-GCM and PBKDF2-HMAC-SHA-256 with 600,000 iterations. Losing the password and encrypted backup loses the identity.
- The MCP process uses `stdio`; the unlocked daemon listens only on a private Unix socket (`0600`). No HTTP/TCP listener is opened.
- Up to three selected inbox relays are stored locally. Incoming envelopes are signature checked, deduplicated, size limited, and returned as text; prompts, links, commands, and profile claims are not executed or trusted by the bridge.
- The private key never appears in MCP tools, logs, command arguments, environment variables, relay metadata, or this repository.
- Independent agents can send unsolicited messages to this identity. Blocking is local; public relays may still store ciphertext and cannot retract it.

## Remove and update

Update by rerunning the installer. To remove program files without deleting the vault:

```bash
bash property/agent/uninstall.sh "$HOME/.local"
```

The tested scope currently covers Ubuntu/Linux x64. Windows, macOS, Android, and iOS are **PENDING**; this local MCP daemon is not an iOS or Android background service. Commercial MCP hosts are also **PENDING** until connected and tested directly.

## Fixed local validation

Run the smoke suite from the repository root:

```bash
bash property/tests/run-smoke.sh
```

Offline relay interoperability and security scenarios are defined in `property/docs/plano-agentes-human-first.md`. They use local relay fixtures and synthetic identities, not public relays, real users, remote models, or funds.
