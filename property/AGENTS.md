# Property-scoped instructions for coding agents

These instructions apply to files under `property/`. The repository also preserves upstream Amethyst modules; their presence does not make them part of the shipped Property product.

## Read first

- [`README.md`](../README.md) is the primary English project entry point; [`README.pt-BR.md`](../README.pt-BR.md) is the optional Brazilian Portuguese version. Keep both aligned when shared project facts change.
- [`ROADMAP.md`](../ROADMAP.md) describes planned work, not proof that a feature is complete.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) explains the maintainer's contribution workflow.
- [`CONTRIBUTING-WITH-AI.md`](../CONTRIBUTING-WITH-AI.md) defines AI-assisted contribution and review expectations.
- [`docs/README.md`](docs/README.md) indexes English project documentation and its Brazilian Portuguese counterparts.
- [`docs/identidade-do-projeto.md`](docs/identidade-do-projeto.md) and [`docs/plano-de-testes-central.md`](docs/plano-de-testes-central.md) are the English defaults; their Portuguese editions end in `.pt-BR.md`.

Inspect current source before making claims about behavior. Evidence and status files are snapshots; do not present planned or historical results as current passes.

## Product boundaries

- Property product code lives in `web/`, `relay/`, `tests/`, and `docs/`. Do not change inherited `amethyst/`, `commons/`, `commonsUI/`, `desktopApp/`, or `cli/` modules unless the requested outcome requires it; when doing so, follow the root `AGENTS.md` and the nearest instructions.
- The browser connects directly to relays chosen by the user. Do not introduce a mandatory messaging backend or runtime-loaded executable code from a CDN.
- A PWA may be suspended by mobile operating systems. Do not promise a continuously running mobile relay or background bridge.
- BTC, XMR, or XNO amounts and campaign claims do not prove payment settlement. Preserve this distinction in code, documentation, and UI.
- Protect private keys, recovery phrases, passwords, tokens, and personal conversations. Never put real secrets in fixtures, logs, issues, or agent prompts.
- Preserve upstream authorship notices and licenses when modifying reused code or dependencies.
- English is the default for the app interface, GitHub entry points, and agent-facing documentation. Português (Brasil) remains an explicit user-selected option. Never translate user-generated names, posts, offers, or messages, including agent-to-agent message bodies.
- Ghostly is a UX reference only. Adapt compatible interaction patterns inside the one Property PWA in `web/`, using Property identities, Nostr events, and user-selected relays. Do not add a second browser app, transport, identity, or conversation store. Features that require a different transport must be redesigned for Nostr or left out.

## Validation and reporting

- For JavaScript web or relay implementation changes, the Property smoke suite is `bash property/tests/run-smoke.sh` (Node.js 22 or newer). Run it when requested or when an applicable repository gate requires it; report the exact command and result.
- For visible web UI changes, inspect the changed flow in a browser at the relevant viewport. Source review or a unit test is not device validation.
- Relay integration is separate from the smoke suite. Follow the central test plan: acceptance criteria use fixed repetition counts and predefined variables, with no wall-clock soak or latency threshold. Harness watchdogs only prevent hangs and never count as a passing criterion. G11-03 uses its declared probe, partition, restart, resource-sample, and logical-clock counts.
- For documentation-only changes, check changed relative links and commands. Do not claim tests, device checks, deployment, or live behavior without evidence.
- Keep changes focused. Report changed paths, validation actually performed, and remaining platform or deployment limits.
