# Property Roadmap

Updated 2026-11-13. This roadmap guides contributions; it is not a schedule or a promise that a feature is complete. The working branch is `modelo-mvp`. Detailed criteria are in the [central plan](property/docs/plano-central.md) and [test plan](property/docs/plano-de-testes-central.md). [Português (Brasil)](ROADMAP.pt-BR.md)

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

## Good places to start

Document a first-use flow with a disposable identity, report an accessibility issue, or record a PWA installation test. Browse [open issues](https://github.com/coercaodobem/property/issues), look for `good first issue` and `help wanted`, or [propose a task](https://github.com/coercaodobem/property/issues/new/choose). Avoid duplicating an existing discussion; include environment, steps, and results.

The [contribution guide](CONTRIBUTING.md) explains how to fork, validate, and open a pull request. Contributions do not depend on a bounty or payment.
