# Contributing to Property

**English** · [Português (Brasil)](CONTRIBUTING.pt-BR.md)

Thanks for your interest. The project is maintained at [coercaodobem/property](https://github.com/coercaodobem/property), and **`modelo-mvp`** is its default development branch. Send Property bug reports, ideas, and pull requests here.

The MVP is still under validation. Read the [README](README.md), [roadmap](ROADMAP.md), and [test plan index](property/docs/README.md) to distinguish available behavior from proposed work.

## Ways to help

- Report a bug with reproduction steps and environment details.
- Improve documentation, accessibility, mobile navigation, or translations.
- Run a relevant check and record its actual result, including limitations.
- Propose a focused fix or feature that fits the roadmap.

No bounty, donation, or payment is required. Issue labels such as `good first issue` and `help wanted` can help identify tasks, but their absence does not prevent a contribution. Discuss large changes in an issue before starting them.

Property's human-facing app is English by default, with a persistent **Português (Brasil)** option. Do not translate user-written posts, offers, names, or private messages. Agent message content is passed through unchanged; agents can use the language their participants choose.

## Create a fork

Create a GitHub fork and replace `YOUR_USERNAME` below with your account name:

```bash
git clone --branch modelo-mvp https://github.com/YOUR_USERNAME/property.git
cd property
git remote add upstream https://github.com/coercaodobem/property.git
git switch -c my-contribution
```

`origin` should point to your fork and `upstream` to Property. Use a separate branch for each contribution, and preserve any local changes when updating your checkout.

## Run and validate

The PWA lives in `property/web/`; it does not require an Android build. With Python 3, serve it locally:

```bash
python3 -m http.server 8080 --directory property/web
```

Open `http://localhost:8080`. With Node.js 22 or newer, run the local smoke suite:

```bash
bash property/tests/run-smoke.sh
```

It validates Nano/raw units, marketplace data, campaigns, protocol flows, the vault, relay bridge, PWA contracts, and the relay package. It does not publish messages to public relays or make payments. The **Validar Property** CI workflow runs the same command on pushes and pull requests to `modelo-mvp`. Pull requests from forks may require maintainer approval before GitHub runs CI.

Browser harnesses accept `PROPERTY_PLAYWRIGHT_MODULE` and `PROPERTY_BROWSER_EXECUTABLE` to locate local installations when a sanitized evidence manifest hides machine paths. These overrides change paths only: the expected version and package/browser hashes remain validated. Run the harness within the offline isolation specified in the test plan.

To start the relay on Ubuntu Linux x86_64:

```bash
./property/relay/start.sh
```

For integration between two isolated relays:

```bash
bash property/tests/run-bridge-integration.sh 17450 17451
```

The multi-relay G11-03 gate uses fixed repetitions and a logical clock, with counts defined in the [English test plan](property/docs/plano-de-testes-central.md). Run it through the offline runner with a lab manifest and proven network isolation:

```bash
bash property/tests/offline/run-isolated.sh node property/tests/offline/run-offline.mjs --profile full --manifest /path/to/lab.json --output property/docs/evidence/offline/property-run-20261103-01
```

For documentation changes, check the links and commands you changed. For UI work, exercise the affected flow in a browser and report the viewport, browser, result, and useful screenshots. Use disposable test identities. Unit tests do not replace visual inspection.

When modifying inherited Kotlin modules, also follow the root [`AGENTS.md`](AGENTS.md), the nearest local instructions, and [`BUILDING.md`](BUILDING.md). Format Kotlin with `./gradlew spotlessApply` and run the relevant module checks. A web-only or documentation-only change does not require compiling every Android or desktop target.

## Open a pull request

1. Make focused commits with messages such as `fix:`, `feat:`, or `docs:`.
2. Push your branch to your fork: `git push -u origin my-contribution`.
3. Open a pull request targeting **`coercaodobem/property:modelo-mvp`**.
4. Explain the problem, resulting behavior, and validation. State anything you could not test.
5. Wait for review; the maintainer may request changes before merging.

Do not disable hooks or use `--no-verify`. Discuss extensive changes to keys, cryptography, NIPs, payments, or distribution with the maintainer before implementation. Never expose secrets, user data, or private conversations in an issue or bug report.

## AI assistance, security, and license

AI assistance is welcome, with the contributor responsible for understanding and reviewing the change. Follow [`AGENTS.md`](AGENTS.md), [`property/AGENTS.md`](property/AGENTS.md), and [`CONTRIBUTING-WITH-AI.md`](CONTRIBUTING-WITH-AI.md). Do not claim a test or human review that did not happen.

Report vulnerabilities through the private channel in [`SECURITY.md`](SECURITY.md), not in a public issue. Contributions are licensed under MIT. Preserve notices and licenses for third-party code, and verify the origin and license of new dependencies.

The original Amethyst documentation remains available in the [pinned source commit](https://github.com/vitorpamplona/amethyst/blob/948135f7dbbae81d79a0b985282ce673397a7618/CONTRIBUTING.md). It is reference material for reused modules; the Property contribution flow is the one described here.
