# Test Property Direct

These commands describe the tests that are present in the Property Direct source copy. Run them from `property/direct` after `npm ci`.

## Available local checks

```bash
npm run build:web
npm test
npm run typecheck
npm run lint
```

- `build:web` type-checks the web workspace and builds the static PWA into `property/web/direct/`.
- `npm test` runs the core, browser-engine, SDK, extension, mini-chess, and UI Vitest suites that are included in this checkout.
- `typecheck` checks the included TypeScript workspaces; it does not certify native operating-system builds.
- `lint` checks the included UI, packages, extension, web, and mini-app source.

The browser-engine load suite uses a fixed event count, defaulting to 256:

```bash
npm run test:group-load
```

Use `GROUP_LOAD=<count>` to choose a different fixed count. No elapsed-time threshold is a pass criterion.

## Scope and pending coverage

This checkout does not include Ghostly's CLI workspace, desktop shell, full end-to-end matrix, or the associated test orchestration scripts. Commands from the upstream Ghostly `TESTING.md` that depend on those paths are not part of Property Direct. Desktop, extension-store, Android, iOS/iPadOS, Windows, and macOS packaging checks remain **PENDING** until Property-owned packages and test environments are present.

The main Property Nostr app has separate checks at the repository root. `bash property/tests/run-smoke.sh` validates the main PWA, relay, and agent bridge; it does not replace the Property Direct package suites above.

## CI and publishing

The GitHub Pages workflow installs the pinned dependencies, applies the checked-in package patches, runs `npm run build:web`, and publishes the static `property/web/` tree. A successful deployment confirms the static build was published; it does not prove peer connectivity between real users, background operation on mobile, or the pending platform builds.
