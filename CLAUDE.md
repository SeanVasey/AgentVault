# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

AgentVault is a **central store for Claude agents and skills** — a place to save,
edit, review, and share reusable subagent definitions and Agent Skills. It is not
an application: there is no build step, no server, and nothing to deploy. The
"product" is the collection of well-formed agent and skill definitions under
`agents/` and `skills/`, kept in the canonical formats described below so they can
be copied or installed into any Claude Code project.

## Repository layout

```
agents/                 # Subagent definitions — one Markdown file per agent
  <agent-name>.md
skills/                 # Agent Skills — one directory per skill
  <skill-name>/
    SKILL.md            # required entry point (YAML frontmatter + instructions)
    ...                 # optional scripts, references, and resources
```

Each top-level directory has its own `README.md` cataloguing what lives there and
restating the format contract. `agents/example-agent.md` and
`skills/example-skill/` are the canonical reference templates — copy them when
adding something new.

## The format contract (the baseline)

Every contribution must satisfy the format for its kind. This is the single most
important thing to get right; malformed frontmatter means Claude Code silently
ignores the agent or skill.

### Agents (`agents/<name>.md`)

YAML frontmatter followed by the system prompt that defines the agent:

```markdown
---
name: agent-name              # required; lowercase-hyphenated, matches the filename
description: When this subagent should be invoked, in one or two sentences.
tools: Read, Grep, Glob       # optional; omit to inherit all tools from the caller
model: sonnet                 # optional; sonnet | opus | haiku | inherit
---

System prompt body: the agent's role, what it does, how it approaches the task,
and what it returns.
```

- `name` is lowercase letters, numbers, and hyphens, and matches the filename stem.
- `description` is what the main agent reads to decide when to delegate — write it
  so the trigger conditions are obvious.
- Omit `tools` to grant the full inherited toolset; list tools to restrict it.

### Skills (`skills/<name>/SKILL.md`)

A directory whose name matches the skill, containing a `SKILL.md`:

```markdown
---
name: skill-name              # required; must equal the directory name
description: What the skill does and when to use it. Third person, ≤1024 chars,
  and it must state the trigger conditions so the model knows when to load it.
---

# Skill Name

Instructions the model follows once the skill is loaded.
```

- `name`: lowercase letters, numbers, and hyphens; ≤64 chars; equals the directory name.
- `description`: the only part always in context — front-load *what it does* and
  *when to use it* (concrete triggers), third person.
- Keep `SKILL.md` focused; move long reference material, scripts, or templates into
  sibling files and link to them so they load only when needed.

## Working in this repository

- **Adding an agent:** copy `agents/example-agent.md` to `agents/<name>.md`, edit the
  frontmatter and body, then add a row to `agents/README.md`.
- **Adding a skill:** copy `skills/example-skill/` to `skills/<name>/`, rename the
  directory and the `name` field to match, edit `SKILL.md`, then add a row to
  `skills/README.md`.
- **Editing an existing one:** keep the frontmatter contract intact — changing
  `name` or the directory name breaks discovery.

### Validation

There is no compiler; correctness is structural. Before committing, confirm:

- every skill directory contains a `SKILL.md` whose `name` equals the directory name;
- every agent file's `name` equals its filename stem;
- all frontmatter is valid YAML and `name` + `description` are present.

The check below flags skill directories missing a `SKILL.md`:

```bash
find skills -mindepth 1 -maxdepth 1 -type d '!' -exec test -e '{}/SKILL.md' ';' -print
```
