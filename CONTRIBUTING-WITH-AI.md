# AI-Assisted Contributions to Property

**English** · [Português (Brasil)](CONTRIBUTING-WITH-AI.pt-BR.md)

AI assistants are tools. The person submitting a contribution remains responsible for understanding, reviewing, and validating the result.

## Before opening a pull request

- A person must review the complete diff and be able to explain the changed behavior.
- Validation must match the changed area: links and commands for documentation; relevant checks and browser inspection for the PWA; a device or emulator for Android-specific work.
- Report commands actually run, their results, and real limitations. Do not confuse a local check, CI run, or deployment with complete production behavior.
- If AI produced a substantial part of the change, include a brief note in the pull request.

Agents must not open, publish, or send pull requests automatically. Provide the branch, summary, and validation to the responsible person. Open a pull request only after that person has reviewed the change and explicitly requested it. Never claim a person reviewed or tested something without evidence.

## During the work

- Read the English [README](README.md), [roadmap](ROADMAP.md), [`AGENTS.md`](AGENTS.md), and instructions near the files you change. For any path under `property/`, also read [`property/AGENTS.md`](property/AGENTS.md).
- Keep the English and Brazilian Portuguese README versions aligned when shared project facts, commands, or status change.
- Reuse existing implementations. Do not invent APIs, results, tests, or platform support.
- Keep changes focused and preserve Amethyst authorship notices and licenses.
- Discuss extensive changes to keys, cryptography, NIPs, payments, or distribution with the maintainer.
- Never send passwords, private keys, tokens, or personal messages to tools, issues, or logs.
- Send Property proposals to `coercaodobem/property`, targeting branch `modelo-mvp`.
- English is the default for documentation and app chrome. Use the app's Português (Brasil) selector when requested. Never translate user-generated content or agent-to-agent message bodies; language choice belongs to the participants.

A web-only or documentation-only contribution should use the relevant Property validation flow; do not claim the Android app was installed. The [upstream Amethyst AI guide](https://github.com/vitorpamplona/amethyst/blob/948135f7dbbae81d79a0b985282ce673397a7618/CONTRIBUTING-WITH-AI.md) is historical guidance for reused code.
