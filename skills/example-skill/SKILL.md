---
name: example-skill
description: Canonical reference template for AgentVault skills. Copy this directory to skills/<your-skill>/, rename it, and match the name field to the new directory. Use when you need a starting point for a new skill; not meant to be run as-is.
---

# Example Skill

Replace this body with the instructions the model should follow once the skill is
loaded. The frontmatter above is the contract; this Markdown is the payload.

## When to use

Restate, in the body, the conditions under which this skill applies. The
`description` frontmatter is what the model sees before loading — it must carry the
trigger. This section is for the fuller explanation once the skill is open.

## Instructions

1. Describe the first step.
2. Describe the second step.
3. Keep `SKILL.md` focused. If the skill needs long references, scripts, or
   templates, add them as sibling files in this directory and link to them here so
   they load only when needed. For example, a `scripts/` helper or a
   `reference.md` you point to from a step above.

## Notes

- The directory name, the `name` field, and how the skill is referenced must all
  match.
- Keep the `name` lowercase-hyphenated and ≤64 characters.
