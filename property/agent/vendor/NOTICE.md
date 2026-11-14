# Vendored cryptography

The Property Agent includes the published JavaScript distributions of:

- `@noble/curves` 2.4.0, MIT, Paul Miller. Upstream: <https://github.com/paulmillr/noble-curves>.
- `@noble/hashes` 2.4.0, MIT, Paul Miller. Upstream: <https://github.com/paulmillr/noble-hashes>.

The upstream package files and their `LICENSE` files are preserved under `node_modules/@noble/`. These are local vendored source files; installation and runtime do not download packages or contact a registry. Property's Nano-compatible threshold ciphersuite is experimental and customizes the FROST challenge hash; the upstream Ed25519 FROST ciphersuite itself is not Nano-compatible.

Trailing spaces at the ends of upstream JavaScript lines were removed for repository whitespace checks; executable tokens and behavior were not intentionally changed.
