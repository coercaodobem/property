# Property Security

**English** · [Português (Brasil)](SECURITY.pt-BR.md)

Property handles local Nostr keys, signed events, private messages, and a PC relay. The development branch is `modelo-mvp`. There is no stable, independently audited release or guaranteed response time.

## Report a vulnerability privately

Use **[Report a vulnerability in Property](https://github.com/coercaodobem/property/security/advisories/new)**. Reports are private and reach this repository's maintainers; this is not the Amethyst repository.

Do not post exploitable details in issues or pull requests. If the private channel is temporarily unavailable, open an issue only to request a safe contact channel—do not include exploit proof, secrets, or user data.

## Include

- Commit, version, browser/operating system, and affected component.
- Likely impact: exposure of keys, confidentiality, integrity, or availability.
- Reproduction steps using synthetic data and, if possible, a minimal test case.
- Conditions required for exploitation and possible mitigations.

Never include passwords, private Nostr/Nano keys, tokens, personal backups, or real conversations. Disposable identities and test data are enough to reproduce an issue.

## Scope and validation status

The scope includes the PWA, local vault, event signing and routing, relay bridge, bundled dependencies, and the relay launcher/package distributed by this repository. Issues in preserved inherited modules may also be reported; the upstream relationship will be assessed without premature disclosure.

Fixes are prepared on the development branch. We do not promise support for old versions, backports, or a triage SLA. The [test plan](property/docs/plano-de-testes-central.md) records pending gates, including independent security review. Automatic XNO payments and campaign acceptance/refund flows are not implemented.

Research only accounts, relays, and data you own or are explicitly authorized to test. Coordinate disclosure with maintainers and avoid accessing other people's data. Vulnerabilities in other projects or relays should be reported to their respective maintainers.
