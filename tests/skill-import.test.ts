import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  IMPORT_LIMITS,
  markdownMetadata,
  normalizeArchivePath,
  scanSkillArchive,
} from "../lib/skill-import.ts";

const primarySkill = `---
name: visual-audit
description: Review an interface for visual quality and usability.
allowed-tools: Read
---

# Visual Audit
`;

test("discovers canonical and frontmatter-declared skills in a ZIP", async () => {
  const archive = zipSync({
    "bundle/.claude/skills/visual-audit/SKILL.md": strToU8(primarySkill),
    "bundle/research-helper.md": strToU8(`---\nname: research-helper\ndescription: Gather trustworthy evidence for a decision.\n---\n# Research Helper\n`),
    "bundle/README.md": strToU8("# Bundle notes"),
    "bundle/logo.png": new Uint8Array([0, 1, 2, 3]),
  });

  const result = await scanSkillArchive(archive);
  assert.equal(result.definitions.length, 2);
  assert.deepEqual(
    result.definitions.map((definition) => definition.archivePath).sort(),
    ["bundle/.claude/skills/visual-audit/SKILL.md", "bundle/research-helper.md"],
  );
  assert.equal(result.definitions[0].content.includes("Visual Audit"), true);
  assert.equal(result.skipped, 2);
});

test("keeps canonical SKILL.md as a review draft when frontmatter is incomplete", async () => {
  const archive = zipSync({ "skills/draft/SKILL.md": strToU8("# Draft Skill\n\nProcedure pending.") });
  const result = await scanSkillArchive(archive);
  assert.equal(result.definitions.length, 1);
  assert.match(result.definitions[0].warning || "", /review draft/i);
});

test("only reads metadata from leading frontmatter", () => {
  const metadata = markdownMetadata("# Example\n\n```yaml\nname: body-only\ndescription: not metadata\n```");
  assert.equal(metadata.name, "");
  assert.equal(metadata.description, "");
  assert.equal(metadata.heading, "Example");
});

test("rejects traversal, absolute, drive, control, and excessive paths", () => {
  assert.equal(normalizeArchivePath("../../evil/SKILL.md"), null);
  assert.equal(normalizeArchivePath("/absolute/SKILL.md"), null);
  assert.equal(normalizeArchivePath("C:\\skills\\evil\\SKILL.md"), null);
  assert.equal(normalizeArchivePath("skills/evil\0/SKILL.md"), null);
  assert.equal(normalizeArchivePath(`${"a/".repeat(13)}SKILL.md`), null);
  assert.equal(normalizeArchivePath("./skills/safe/SKILL.md"), "skills/safe/SKILL.md");
});

test("fails closed for corrupt and oversized archives", async () => {
  await assert.rejects(scanSkillArchive(new Uint8Array([1, 2, 3, 4])), /could not be read/i);
  await assert.rejects(
    scanSkillArchive(new Uint8Array(IMPORT_LIMITS.archiveBytes + 1)),
    /10 MB import limit/i,
  );
});
