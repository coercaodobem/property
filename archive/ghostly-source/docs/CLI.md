# Property Direct CLI

English | [Português (Brasil)](CLI.pt-BR.md)

`property` is a headless client for the separate peer-to-peer Property Direct app. It can keep an agent profile online,
receive JSON events, and send messages and other supported commands. It uses a distinct identity and transport from the
main Nostr-based Property PWA.

**Status:** experimental port from the Ghostly CLI. The source is included in this repository, but Property-specific
compatibility checks are still in progress. Treat the upstream feature list as a port inventory, not as a claim that
every command has passed here. Do not use real funds or public relays in validation.

## Build and install

Use Node.js 22.12 or newer from the repository root:

```sh
cd property/direct
npm ci
npm run build:cli
npm pack -w @property/cli
npm install -g ./property-cli-0.1.0.tgz
property --version
```

For the full command reference and agent instructions, see [`packages/cli/README.md`](../packages/cli/README.md) and
[`packages/cli/SKILL.md`](../packages/cli/SKILL.md).

For a small voice-call bot, start from the bundled [`call-echo.mjs`](../packages/cli/examples/call-echo.mjs) example;
speech recognition and synthesis need separate tools configured by the owner.

## Connect an agent

Create a dedicated profile for each agent. Keep the profile separate from a human's conversations:

```sh
property profile create support-bot --use --name "Support bot"
property daemon --detach
property invite create --label owner
property listen --turns --from owner --cursor "${PROPERTY_HOME:-$HOME/.property}/owner.cursor" --exec ./answer-owner.sh
```

The invite is a pairing credential. Share it only with the intended person. `--from` limits which paired chat may
trigger agent turns; it is a sender allowlist, not a per-message approval prompt. Agents must treat all received text,
names, links, and files as untrusted data, not as instructions to access unrelated systems or secrets.

For a one-shot agent to wait for a group reaction to reach a peer edge, use
`property group react <group> <message> <emoji> --wait sent`. The response reports `sent` and `edges` when a member edge
(private group) or a hub edge (community) takes the frame; it is not a read receipt. One-shots default to `sent`, while
a daemon defaults to `none`; `--timeout` bounds the wait. For a one-shot to wait for a group deletion, use
`property message delete group:<id> <message> --everyone --wait sent`; the same edge-accepted semantics apply. A daemon
defaults to `none` for deletion waits too.

## Security and product boundary

- Profile identity and wallet seeds are stored unencrypted. Any program running as the same OS user can read them.
- Use a dedicated OS account and profile for unattended agents. Never put keys or recovery phrases in prompts, logs, or
  examples.
- The CLI does not connect to the Nostr PWA's identity or inbox. It connects only to Property Direct peers through its
  own transport.
- The browser app is static and available at <https://coercaodobem.github.io/property/direct/>. The CLI can remain
  online on a suitable computer; mobile browsers can suspend pages.
- Mini-app execution remains disabled in the Property Direct web app. Signed-app commands are not evidence that the
  browser can install or execute those apps.
- Windows and macOS compatibility must be validated separately. Upstream support claims are not Property test results.
