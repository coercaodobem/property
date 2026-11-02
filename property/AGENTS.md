# Property-scoped instructions for coding agents

These instructions apply to files under `property/`. The repository also contains upstream Amethyst modules; their presence does not make them part of the shipped Property product.

## Read first

- [`README.md`](../README.md) is the primary Brazilian Portuguese project entry point; [`README.en.md`](../README.en.md) is the optional English version. Keep them aligned when changing shared project facts.
- [`ROADMAP.md`](../ROADMAP.md) describes planned work, not proof that a feature is complete.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) explains the maintainer's contribution workflow.
- [`CONTRIBUTING-WITH-AI.md`](../CONTRIBUTING-WITH-AI.md) defines AI-assisted contribution and review expectations.
- [`docs/identidade-do-projeto.md`](docs/identidade-do-projeto.md) and [`docs/plano-de-testes-central.md`](docs/plano-de-testes-central.md) record product principles, test gates, and dated evidence.

Inspect current source before making claims about behavior. Evidence and status files are snapshots; do not present a planned or historical result as a current pass.

## Product boundaries

- Property product code lives in `property/web/`, `property/relay/`, `property/tests/`, and `property/docs/`. Do not change inherited `amethyst/`, `commons/`, `commonsUI/`, `desktopApp/`, or `cli/` modules unless the requested outcome requires it; when doing so, follow the root `AGENTS.md` and the nearest instructions.
- The browser connects directly to the relays chosen by the user. Do not introduce a mandatory messaging backend or runtime-loaded executable code from a CDN.
- A PWA may be suspended by mobile operating systems. Do not promise a continuously running mobile relay or background bridge.
- BTC, XMR, or XNO amounts and campaign claims do not prove payment settlement. Preserve this distinction in code, documentation, and UI.
- Protect private keys, recovery phrases, passwords, tokens, and personal conversations. Never place real secrets in fixtures, logs, issues, or agent prompts.
- Preserve upstream authorship notices and licenses when modifying reused code or dependencies.

## Validation and reporting

- For JavaScript web or relay implementation changes, the Property smoke suite is `bash property/tests/run-smoke.sh` (Node.js 22 or newer). Run it when requested or when the applicable task/repository gate requires it; report the exact command and result.
- For visible web UI changes, inspect the changed flow in a browser at the relevant viewport. A source check or unit test is not device validation.
- Relay integration and soak runs are separate from the smoke suite. Run a long soak only when the task scope or explicit authorization includes it. Both the standalone single-relay diagnostic and the central G11-03 multi-relay soak are capped at five hours real time; G11-03 also reserves up to 30 seconds of that total for finalization.
- For documentation-only changes, check the changed relative links and commands. Do not claim tests, device checks, deployment, or live behavior without evidence.
- Keep changes focused. Report changed paths, the validation actually performed, and any remaining platform or deployment limits.
