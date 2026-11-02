# Repository instructions for GitHub Copilot

Property is an independent product in `property/` inside a repository that also preserves upstream Amethyst code. Do not assume that every inherited Android, desktop, or CLI module is shipped as Property.

- For any work under `property/`, read [`property/AGENTS.md`](../property/AGENTS.md). For inherited modules, follow the root [`AGENTS.md`](../AGENTS.md) and the nearest applicable instructions.
- The root [`README.md`](../README.md) is English; [`README.pt-BR.md`](../README.pt-BR.md) is the Portuguese version. Keep shared facts, commands, feature status, and links synchronized when editing them.
- Inspect current code before asserting support. Roadmaps and evidence records can be plans or dated snapshots.
- Do not add runtime-loaded scripts or executable dependencies from CDNs. Preserve privacy boundaries, key handling, and upstream licenses.
- Validate only the changed scope. Web UI changes need browser inspection; a test or source review alone does not prove behavior on a phone. Do not run the five-hour relay soak unless the task includes or explicitly authorizes it.
- Report only checks actually performed. Do not open or merge a pull request on behalf of the maintainer without an explicit request.
