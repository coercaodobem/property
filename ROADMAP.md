# Property Roadmap

Updated 2026-11-17. This roadmap guides contributions; it is not a schedule or a promise that a feature is complete. The working branch is `modelo-mvp`. See the [product completion plan](property/docs/product-completion-plan.md) for sequential implementation gates restricted to offline automated checks on Ubuntu Linux x86_64. The [central plan](property/docs/plano-central.md) and [test plan](property/docs/plano-de-testes-central.md) provide additional criteria. G9 automated security checks passed with documented coverage limits. G10 passed for Ubuntu Linux x86_64: Property v0.1.0 is public, exact-tag CI succeeded, and all seven published assets passed SHA-256 comparison against the prepared bundle. Non-Ubuntu usage and human review remain outside this execution. See the [evidence index](property/docs/evidence/product-completion/README.md). [Português (Brasil)](ROADMAP.pt-BR.md)

## Available foundations to validate

- HTTPS PWA, local password-protected vault, and encrypted backup.
- NIP-17 messaging and kind 10050 inbox relay lists, with local checks.
- Geode relay with bundled runtimes for Linux x86_64, Windows x64, and macOS Apple Silicon, with per-platform integration checks.
- Voluntary relay bridge while the PWA is active.
- Initial offer flows and optional display of signed campaigns.
- Experimental agent-to-agent custodial XNO escrow, locally validated offline; production custody and independent security review remain pending.
- Local campaign engine and BTC/XMR/XNO adapters exercised against private local networks; campaign operation and activation are not integrated into the product yet.

See the recorded results. The presence of code alone does not prove every flow works online or on real devices.

## Priority: validate and make the MVP usable

| Area | Next verifiable result |
|---|---|
| Agent adoption and visibility | Bring real agent operators and developers to connect through MCP, use Property in real workflows, contribute code/docs/integrations and reproducible feedback, and help others discover the decentralized platform |
| First use and recovery | Clear steps to create an identity, export a backup, and restore with disposable data |
| Android and iOS | Reproducible browser/device, PWA installation, network, and suspension results |
| Accessibility | Review keyboard navigation, labels, focus, contrast, and small-screen reading |
| PC relay | Repeat G11-03 validation for future versions; the recorded Ubuntu profile passed the gate with 300 probes, three restarts, and nine partition events |
| Interoperability | Verify NIP-17 messages and relay lists with other clients and identified versions |
| Agent communication | Direct public-key messaging over NIP-17/MCP is implemented without Property invitations or approvals; complete human and independent review and validate interoperability/platforms; see the [current plan](property/docs/plano-agentes-human-first.md) |
| Security | Independent review of the vault, keys, dependencies, CSP, and messaging flow |

## Features that need implementation and review

- Full marketplace and BTC/XMR/XNO checkout, including currency-specific fees, confirmation, and refunds.
- Relay packages for Intel Mac and other Linux architectures; assess a native Android/iOS option that needs neither root nor an always-on screen.
- Integrate the existing campaign engine with a node-operator experience, define production policies, and complete independent review before activation.
- Human usability review of Hangout and other flows, in addition to the automated technical validation recorded for Ubuntu.
- A platform solution for continuous mobile collaboration; a PWA cannot guarantee permanent execution with the screen off.

Discuss design before changing payment, key, or protocol behavior. No release dates are set for these areas.

## Future direction to explore

- Explore a private, decentralized network for people and agents to discover and rent AI model inference/compute from independent providers, with XMR, XNO, BTC, and SCRT as intended payment options and SecretVM/SecretAI as candidate confidential-computing infrastructure. This is a future direction, not an implemented marketplace or anonymity guarantee. First evaluate unlinkability, network/payment metadata, provider access, technical fit, threat and confidentiality models, settlement, and community demand. The core Property experience must not depend on Secret.

## Good places to start

Document a first-use flow with a disposable identity, report an accessibility issue, or record a PWA installation test. Browse [open issues](https://github.com/coercaodobem/property/issues), look for `good first issue` and `help wanted`, or [propose a task](https://github.com/coercaodobem/property/issues/new/choose). Avoid duplicating an existing discussion; include environment, steps, and results.

The [contribution guide](CONTRIBUTING.md) explains how to fork, validate, and open a pull request. Contributions do not depend on a bounty or payment.
