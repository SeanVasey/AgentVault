# Contributing to AgentVault

AgentVault stores Claude agents and skills in canonical formats. A contribution is
"done" when its files are well-formed and catalogued — there is no build or test
suite, so correctness is structural. This guide covers the mechanics; the
authoritative format contract lives in [`CLAUDE.md`](./CLAUDE.md).

## Adding an agent

1. Copy [`agents/example-agent.md`](./agents/example-agent.md) to `agents/<name>.md`.
2. Set `name` in the frontmatter to match the filename stem (lowercase-hyphenated).
3. Write a `description` that makes the trigger conditions obvious — it is what the
   main agent reads to decide when to delegate.
4. List `tools` to restrict access, or remove the field to inherit the full toolset.
   Set `model` to `sonnet`, `opus`, `haiku`, or `inherit`.
5. Replace the body with the agent's system prompt.
6. Add a row to the catalog in [`agents/README.md`](./agents/README.md).

## Adding a skill

1. Copy [`skills/example-skill/`](./skills/example-skill/) to `skills/<name>/`.
2. Rename the directory, and set `name` in `SKILL.md` to the same value
   (lowercase-hyphenated, ≤64 chars).
3. Front-load the `description` with what the skill does and when to use it.
4. Keep `SKILL.md` focused; put long references, scripts, or templates in sibling
   files in the same directory and link to them.
5. Add a row to the catalog in [`skills/README.md`](./skills/README.md).

## Editing an existing item

Keep the frontmatter contract intact. Renaming an agent's `name`/filename or a
skill's `name`/directory breaks discovery — do both halves together, and update the
relevant catalog row.

## Before you commit

- Every skill directory contains a `SKILL.md` whose `name` equals the directory name.
- Every agent file's `name` equals its filename stem.
- Frontmatter is valid YAML with `name` and `description` present.
- The catalog in the relevant `README.md` reflects your change.

Sanity check for skills missing their entry point:

```bash
find skills -mindepth 1 -maxdepth 1 -type d '!' -exec test -e '{}/SKILL.md' ';' -print
```
