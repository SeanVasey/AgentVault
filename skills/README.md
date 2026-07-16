# Skills

Agent Skills. One directory per skill, named after the skill, each containing a
`SKILL.md` with YAML frontmatter (`name`, `description`) plus instructions.
Supporting scripts, references, and resources live alongside `SKILL.md` in the same
directory. See [`../CLAUDE.md`](../CLAUDE.md) for the full format contract.

## Adding a skill

1. Copy [`example-skill/`](./example-skill/) to `skills/<name>/`.
2. Rename the directory and set the `name` field in `SKILL.md` to match.
3. Edit `SKILL.md`; add any supporting files in the same directory.
4. Add a row to the catalog below.

## Catalog

| Skill | Description |
| ----- | ----------- |
| [`example-skill`](./example-skill/) | Canonical reference template — copy it to start a new skill. |
