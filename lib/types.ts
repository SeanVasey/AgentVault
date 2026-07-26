export type ArtifactKind = "agent" | "skill" | "instruction";

export type Artifact = {
  id: string;
  title: string;
  slug: string;
  exportPath: string;
  kind: ArtifactKind;
  category: string;
  description: string;
  content: string;
  tags: string[];
  targets: string[];
  status: "draft" | "ready" | "archived";
  version: string;
  favorite: boolean;
  featured: boolean;
  source: "built-in" | "created" | "imported";
  createdAt: string;
  updatedAt: string;
};

export type ArtifactInput = Omit<
  Artifact,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
};

export const artifactKinds: ArtifactKind[] = ["agent", "skill", "instruction"];

export const kindLabel: Record<ArtifactKind, string> = {
  agent: "Agent",
  skill: "Skill",
  instruction: "Instruction",
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function artifactPath(artifact: Artifact) {
  if (artifact.exportPath.trim()) return artifact.exportPath.trim();
  if (artifact.kind === "agent") {
    return `.claude/agents/${artifact.slug}.md`;
  }
  if (artifact.kind === "skill") {
    return `.claude/skills/${artifact.slug}/SKILL.md`;
  }
  if (artifact.slug.includes("claude")) return "CLAUDE.md";
  if (artifact.slug.includes("agents") || artifact.slug.includes("universal")) {
    return "AGENTS.md";
  }
  return `.claude/rules/${artifact.slug}.md`;
}
