---
name: example-agent
description: Canonical reference template for AgentVault subagents. Copy this file to agents/<your-agent>.md and replace the frontmatter and body. Not intended to be invoked directly.
tools: Read, Grep, Glob
model: sonnet
---

You are a template subagent. Replace this system prompt with the real definition
of your agent.

A good agent definition states:

- **Role** — what this agent is responsible for and the kind of task it handles.
- **Approach** — the steps or method it follows, and any constraints (for example,
  read-only investigation vs. making edits).
- **Output** — what it returns to the caller, and in what form.

Keep the `description` in the frontmatter sharp: the main agent reads only that
line to decide when to delegate here, so make the trigger conditions unambiguous.
List `tools` to restrict this agent's access, or delete the field to inherit the
full toolset. Set `model` to `sonnet`, `opus`, `haiku`, or `inherit`.
