# AgentVault

AgentVault is a central store for **Claude agents and skills** — a single place to
save, edit, review, and share reusable subagent definitions and
[Agent Skills](https://docs.claude.com/en/docs/claude-code/skills). Everything here
is kept in canonical Claude Code formats so any item can be copied or installed
into another project unchanged.

There is nothing to build or run. The repository *is* its contents.

## Layout

| Path | What lives there |
| ---- | ---------------- |
| [`agents/`](./agents/) | Subagent definitions — one `<name>.md` per agent. |
| [`skills/`](./skills/) | Agent Skills — one directory per skill, each with a `SKILL.md`. |
| [`CLAUDE.md`](./CLAUDE.md) | The format contract and guidance for working in this repo. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to add or edit an agent or skill. |

Each directory's `README.md` catalogs what it contains.

## Quick start

- **Browse** — open [`agents/`](./agents/) or [`skills/`](./skills/) and read the catalog table.
- **Add an agent** — copy [`agents/example-agent.md`](./agents/example-agent.md) to `agents/<name>.md`, edit it, and list it in the agents catalog.
- **Add a skill** — copy [`skills/example-skill/`](./skills/example-skill/) to `skills/<name>/`, edit `SKILL.md`, and list it in the skills catalog.
- **Use one elsewhere** — drop an agent file into a project's `.claude/agents/`, or a skill directory into `.claude/skills/`.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the details and the format contract.

## License

Released under the [MIT License](./LICENSE).
