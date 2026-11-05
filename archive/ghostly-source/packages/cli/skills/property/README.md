# Property Direct skill: an AI agent talks to its owner

A skill for AI coding agents: the owner messages the agent from the Property Direct app, and the agent answers, asks with
buttons, reacts and shows what it is doing. It takes instructions from the owner's chat only.

- [SKILL.md](SKILL.md): what the agent reads (setup, the loop, the security rules).
- [scripts/](scripts): `listen`, `say`, `status` and `react`, in POSIX `sh`. They need the `property` CLI
  (built from this repository with Node 22.12 or newer), `jq`, and `PROPERTY_OWNER_CHAT` set to the owner's chat id.

## Install in Claude Code

Copy this folder to `~/.claude/skills/property` (or `.claude/skills/property` in a project):

```bash
git clone --branch modelo-mvp --depth 1 https://github.com/coercaodobem/property /tmp/property-src
mkdir -p ~/.claude/skills && cp -R /tmp/property-src/property/direct/packages/cli/skills/property ~/.claude/skills/property
rm -rf /tmp/property-src
```

Or put it in a plugin's `skills/` folder to share it with a team. It is named `property`, as is the CLI's own skill
([../../SKILL.md](../../SKILL.md)), so install one of them under that name: this one for an agent that talks to its
owner, the CLI's for a bot that answers other people.

Then ask Claude Code to set it up: "Use the property skill and pair with me". Build and install the CLI from the same
checkout, start the daemon, and wait for the invite link you make in the Property Direct app.

## Other agents

The scripts depend on nothing from Claude Code. Any agent with a shell (Codex, Cursor, a custom one) can run them by
path or from `PATH`, and read [SKILL.md](SKILL.md) as its instructions:

```bash
export PROPERTY_OWNER_CHAT=<chat id>
scripts/listen --once                                  # the owner's next message, as JSON
scripts/react <messageId>                              # 👀
scripts/status "Running the tests"                     # "thinking" with a status
scripts/say --reply <messageId> "All green."           # the answer
```

The tests are in [../../test/ownerSkill.test.ts](../../test/ownerSkill.test.ts): every script against a fake
`property` on `PATH`.
