# Archived source reference: validation boundary

This directory is retained only as a read-only source reference for adapting compatible interaction patterns into the single Property PWA. Its archived tests, package manifests, and build recipes do not define Property behavior and must not be used to publish a second app.

The Property product lives in `property/web/`. Its repository-owned checks are documented in `property/docs/plano-de-testes-central.md` and can be run from the repository root with `bash property/tests/run-smoke.sh`. The GitHub Pages workflow publishes only `property/web/`.

Do not report the archived Ghostly tests as Property passes. Adapt each selected feature to Property's existing identity, local storage, Nostr events, and user-selected relays, then validate that implementation through the Property test plan.
