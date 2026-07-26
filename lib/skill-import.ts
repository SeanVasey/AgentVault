import { unzip } from "fflate";

export const IMPORT_LIMITS = {
  markdownBytes: 1_000_000,
  archiveBytes: 10_000_000,
  archiveEntries: 200,
  definitions: 100,
  expandedMarkdownBytes: 20_000_000,
} as const;

export type FrontmatterResult = {
  values: Record<string, string>;
  present: boolean;
  valid: boolean;
};

export type SkillDefinition = {
  archivePath: string;
  content: string;
  warning?: string;
};

export type ArchiveScanResult = {
  definitions: SkillDefinition[];
  scanned: number;
  skipped: number;
  issues: string[];
};

function cleanScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function readFrontmatter(content: string): FrontmatterResult {
  const normalized = content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return { values: {}, present: false, valid: false };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { values: {}, present: true, valid: false };

  const values: Record<string, string> = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    let value = match[2];
    if (value === ">" || value === "|") {
      const continuation: string[] = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        continuation.push(lines[index].trim());
      }
      value = continuation.join(value === ">" ? " " : "\n");
    }
    values[key] = cleanScalar(value);
  }
  return { values, present: true, valid: true };
}

export function markdownMetadata(content: string) {
  const frontmatter = readFrontmatter(content);
  const normalized = content.replace(/^\uFEFF/, "");
  const heading = normalized.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    frontmatter,
    name: frontmatter.values.name?.trim() || "",
    description: frontmatter.values.description?.trim() || "",
    heading: heading || "",
  };
}

export function normalizeArchivePath(input: string): string | null {
  const path = input.normalize("NFC").replaceAll("\\", "/");
  if (!path || path.length > 300 || /[\u0000-\u001F\u007F]/.test(path) || path.startsWith("/") || /^[A-Za-z]:\//.test(path)) return null;
  const parts = path.split("/");
  if (parts.length > 12 || parts.some((part) => part === ".." || part.length > 128)) return null;
  const normalized = parts.filter((part) => part && part !== ".").join("/");
  return normalized || null;
}

function isCanonicalSkill(path: string) {
  return path.split("/").pop()?.toLowerCase() === "skill.md";
}

function decodeMarkdown(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function pushIssue(issues: string[], issue: string) {
  if (issues.length < 8) issues.push(issue);
}

export async function scanSkillArchive(bytes: Uint8Array): Promise<ArchiveScanResult> {
  if (bytes.byteLength > IMPORT_LIMITS.archiveBytes) {
    throw new Error("Archive is larger than the 10 MB import limit.");
  }

  let scanned = 0;
  let skipped = 0;
  let expandedBytes = 0;
  let entryLimitReported = false;
  let expandedLimitReported = false;
  const selectedPaths = new Set<string>();
  const issues: string[] = [];

  const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, {
      filter: (entry) => {
        scanned += 1;
        if (scanned > IMPORT_LIMITS.archiveEntries) {
          skipped += 1;
          if (!entryLimitReported) {
            pushIssue(issues, `Only the first ${IMPORT_LIMITS.archiveEntries} archive entries were scanned.`);
            entryLimitReported = true;
          }
          return false;
        }

        const path = normalizeArchivePath(entry.name);
        if (!path) {
          skipped += 1;
          pushIssue(issues, `Blocked an unsafe archive path: ${entry.name.slice(0, 80)}`);
          return false;
        }
        const lower = path.toLowerCase();
        if ((!lower.endsWith(".md") && !lower.endsWith(".markdown")) || lower.startsWith("__macosx/") || lower.includes("/.ds_store")) {
          skipped += 1;
          return false;
        }
        if (entry.compression !== 0 && entry.compression !== 8) {
          skipped += 1;
          pushIssue(issues, `${path} uses an unsupported ZIP compression method.`);
          return false;
        }
        if (entry.originalSize <= 0 || entry.originalSize > IMPORT_LIMITS.markdownBytes) {
          skipped += 1;
          pushIssue(issues, `${path} is empty or larger than the 1 MB skill limit.`);
          return false;
        }
        if (entry.compression === 8 && entry.originalSize / Math.max(entry.size, 1) > 250) {
          skipped += 1;
          pushIssue(issues, `${path} exceeds the safe ZIP expansion ratio.`);
          return false;
        }
        const pathKey = lower;
        if (selectedPaths.has(pathKey)) {
          skipped += 1;
          pushIssue(issues, `Skipped a duplicate archive path: ${path}`);
          return false;
        }
        if (expandedBytes + entry.originalSize > IMPORT_LIMITS.expandedMarkdownBytes) {
          skipped += 1;
          if (!expandedLimitReported) {
            pushIssue(issues, "Archive Markdown exceeds the 20 MB expansion limit.");
            expandedLimitReported = true;
          }
          return false;
        }
        selectedPaths.add(pathKey);
        expandedBytes += entry.originalSize;
        return true;
      },
    }, (error, data) => {
      if (error) reject(new Error("The ZIP could not be read. It may be corrupt or encrypted."));
      else resolve(data);
    });
  });

  const definitions: SkillDefinition[] = [];
  for (const [rawPath, data] of Object.entries(unzipped)) {
    const archivePath = normalizeArchivePath(rawPath);
    if (!archivePath) continue;
    let content: string;
    try {
      content = decodeMarkdown(data);
    } catch {
      skipped += 1;
      pushIssue(issues, `${archivePath} is not valid UTF-8 Markdown.`);
      continue;
    }
    if (!content.trim()) {
      skipped += 1;
      pushIssue(issues, `${archivePath} is empty.`);
      continue;
    }

    const metadata = markdownMetadata(content);
    const canonical = isCanonicalSkill(archivePath);
    const declaresSkill = metadata.frontmatter.valid && Boolean(metadata.name && metadata.description);
    if (!canonical && !declaresSkill) {
      skipped += 1;
      continue;
    }
    if (definitions.length >= IMPORT_LIMITS.definitions) {
      skipped += 1;
      if (definitions.length === IMPORT_LIMITS.definitions) {
        pushIssue(issues, `Only the first ${IMPORT_LIMITS.definitions} skill definitions were loaded.`);
      }
      continue;
    }

    let warning: string | undefined;
    if (canonical && !metadata.frontmatter.valid) warning = "Frontmatter is missing or incomplete; imported as a review draft.";
    else if (canonical && (!metadata.name || !metadata.description)) warning = "Frontmatter needs both name and description; imported as a review draft.";
    definitions.push({ archivePath, content, warning });
  }

  return { definitions, scanned, skipped, issues };
}

export function titleFallbackFromPath(path: string) {
  const normalized = normalizeArchivePath(path) || path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) || "imported-skill";
  const source = fileName.toLowerCase() === "skill.md"
    ? parts.at(-2) || "imported-skill"
    : fileName.replace(/\.md$/i, "");
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
