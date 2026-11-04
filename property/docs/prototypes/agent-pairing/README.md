# Archived agent-pairing prototype

**English** · [Português (Brasil)](README.pt-BR.md)

This static prototype shows the former invitation, identity inspection, permission choice, cancellation, approval, and local revocation flow. It is archived and does not describe the current Property agent-messaging design; see the [current G0 decision](../../agent-messaging-g0.md). The prototype uses inline HTML, CSS, and JavaScript and loads no third-party scripts, fonts, images, or executable code.

## Open locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory property/docs/prototypes/agent-pairing
```

Open `http://127.0.0.1:8765/` in a browser. Alternatively, open `index.html` directly. Keep the server bound to loopback during local research.

The deterministic prototype checks can be run with `node property/tests/agent-pairing-prototype-smoke.mjs` from the repository root. They use a simulated DOM and do not replace browser inspection, human research, or device accessibility review.

## Demonstration limits

- The invitation, identities, people, and messages are fictional fixtures.
- The displayed identifier is not a valid Nostr public key; no signatures are checked.
- No key, permission, or message is persisted; nothing is sent to a relay or AI host.
- Revocation state is local and volatile. It does not represent network delivery or confirmation.
- This screen preserves human conversations without requiring agent pairing.

## Human review required

Code inspection or automation does not replace the five human sessions defined in the [plan](../../plano-agentes-human-first.md). Gate G1 remains `PENDING` until five real participants complete the fixed tasks, at least three of them without software-development experience, and any critical failures are fixed and repeated. Use the script and blank worksheet in the [G1 report](../../evidence/agent-messaging/G1-20261103.md); do not record names, keys, personal conversations, or other identifiers.
