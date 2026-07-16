# Agents

Subagent definitions. One Markdown file per agent, named `<agent-name>.md`, with
YAML frontmatter (`name`, `description`, optional `tools` and `model`) followed by
the system prompt. See [`../CLAUDE.md`](../CLAUDE.md) for the full format contract.

## Adding an agent

1. Copy [`example-agent.md`](./example-agent.md) to `agents/<name>.md`.
2. Edit the frontmatter (`name` must match the filename stem) and the system prompt.
3. Add a row to the catalog below.

## Catalog

| Agent | Description |
| ----- | ----------- |
| [`example-agent`](./example-agent.md) | Canonical reference template — copy it to start a new agent. |
