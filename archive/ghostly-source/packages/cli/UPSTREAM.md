# Upstream source and license

This package is adapted from the MIT-licensed `packages/cli` in
[MiguelMedeiros/ghostly](https://github.com/MiguelMedeiros/ghostly), at commit
[`c188787cc2ee27d92e65dac3ef9e82471cdafdde`](https://github.com/MiguelMedeiros/ghostly/commit/c188787cc2ee27d92e65dac3ef9e82471cdafdde).
Selected compatible CLI fixes through upstream commit
[`784935c02a09e82adf168d57849661c0db153109`](https://github.com/MiguelMedeiros/ghostly/commit/784935c02a09e82adf168d57849661c0db153109)
are also ported, including concurrent one-shot profile handling, group reaction propagation waits, and one-shot group-delete waits.
Copyright and license notices are preserved in [`LICENSE`](LICENSE) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Property-specific changes include the `property` command and package name, profile home and environment variable names,
Property repository and app URLs, English-first/Português (Brasil) documentation, and explicit notes about features that
are not enabled in the Property Direct browser app. Internal `@ghostly/*` modules and wire-format strings such as
`ghostly1`, `ghostly-app.json`, and `app.ghostlyapp` remain unchanged where compatibility requires them.

The source port is experimental. Upstream tests or platform claims are not Property verification. Follow the current
Property Direct gate evidence and product documentation before relying on a command or platform.
