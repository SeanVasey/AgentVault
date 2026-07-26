"use client";

import {
  ArrowDownToLine,
  Blocks,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  Command,
  Copy,
  Download,
  FileCode2,
  FileDown,
  FilePlus2,
  Files,
  FolderArchive,
  Grid2X2,
  Home,
  Import,
  Layers3,
  LayoutList,
  LibraryBig,
  Menu,
  Moon,
  PackageOpen,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  UploadCloud,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Artifact, ArtifactKind } from "../lib/types";
import {
  IMPORT_LIMITS,
  markdownMetadata,
  scanSkillArchive,
  titleFallbackFromPath,
} from "../lib/skill-import";
import { artifactPath, kindLabel, slugify } from "../lib/types";

type View = "dashboard" | "library" | "favorites" | "collections";
type EditorMode = "write" | "preview";
type SortMode = "featured" | "recent" | "name";

type AgentVaultProps = {
  initialArtifacts: Artifact[];
};

type ImportReport = {
  detected: number;
  imported: number;
  skipped: number;
  failed: number;
  renamed: number;
  archives: number;
  issues: string[];
};

type ImportCandidate = {
  fileName: string;
  sourceLabel: string;
  content: string;
  forceSkill: boolean;
  warning?: string;
};

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  agent: Braces,
  skill: WandSparkles,
  instruction: FileCode2,
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Overview", icon: Home },
  { id: "library", label: "Library", icon: LibraryBig },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "collections", label: "Collections", icon: Layers3 },
];

const templates: Record<ArtifactKind, Omit<Artifact, "id" | "createdAt" | "updatedAt">> = {
  agent: {
    title: "Untitled Agent",
    slug: "untitled-agent",
    exportPath: "",
    kind: "agent",
    category: "Agent Systems",
    description: "Describe when this specialist should be invoked and the result it owns.",
    content: `---
name: untitled-agent
description: Describe when this specialist should be invoked and the result it owns.
tools: Read, Glob, Grep
model: inherit
---

# Untitled Agent

## Mission

State the outcome this agent owns.

## Operating Method

1. Inspect relevant context before acting.
2. Separate facts, assumptions, and open questions.
3. Complete the smallest coherent unit of work.
4. Verify the result against explicit acceptance criteria.

## Boundaries

- Do not invent access, evidence, or completion.
- Ask before destructive or consequential actions.

## Output Contract

Define the exact structure and evidence expected in the final response.`,
    tags: ["agent", "custom"],
    targets: ["Claude Code"],
    status: "draft",
    version: "0.1.0",
    favorite: false,
    featured: false,
    source: "created",
  },
  skill: {
    title: "Untitled Skill",
    slug: "untitled-skill",
    exportPath: "",
    kind: "skill",
    category: "Agent Systems",
    description: "Explain the trigger conditions and capability this skill adds.",
    content: `---
name: untitled-skill
description: Explain the trigger conditions and capability this skill adds.
allowed-tools: Read, Glob, Grep
---

# Untitled Skill

## When to Use

Describe the requests and conditions that should activate this skill.

## Inputs

- Required context
- Optional context
- Constraints

## Procedure

1. Inspect the source of truth.
2. Perform the bounded workflow.
3. Verify the output.

## Quality Gate

List the checks that must pass before completion.

## Stop Conditions

State when the agent should ask, abstain, or escalate.`,
    tags: ["skill", "custom"],
    targets: ["Claude Code", "Agent Skills"],
    status: "draft",
    version: "0.1.0",
    favorite: false,
    featured: false,
    source: "created",
  },
  instruction: {
    title: "Repository Instructions",
    slug: "repository-instructions",
    exportPath: "",
    kind: "instruction",
    category: "Repository",
    description: "Shared operating instructions for agents working in this repository.",
    content: `# Repository Instructions

## Mission

Describe what this repository exists to accomplish.

## Architecture

Document the major directories, boundaries, and data flow.

## Commands

- Install:
- Develop:
- Test:
- Build:

## Working Rules

- Preserve unrelated user changes.
- Follow established patterns and naming.
- Never expose secrets or bypass safety checks.

## Definition of Done

Define the checks and user journey that prove a change is complete.`,
    tags: ["instructions", "repository"],
    targets: ["Claude Code", "Codex", "Universal"],
    status: "draft",
    version: "0.1.0",
    favorite: false,
    featured: false,
    source: "created",
  },
};

const collectionSpecs: Array<{
  name: string;
  note: string;
  icon: LucideIcon;
  tone: string;
  slugs: string[];
}> = [
  {
    name: "Claude Code Core",
    note: "Repository orientation, planning, debugging, tests, and release validation.",
    icon: Code2,
    tone: "slate",
    slugs: ["repository-orientation", "implementation-planning", "debugging-investigator", "test-matrix", "release-readiness", "agent-orchestrator", "claude-code-bridge"],
  },
  {
    name: "Secure Full-Stack Ship",
    note: "Architecture, threat modeling, quality review, and production readiness.",
    icon: ShieldCheck,
    tone: "ember",
    slugs: ["full-stack-architect", "security-quality-auditor", "threat-model", "test-matrix", "release-readiness", "responsive-interface-review"],
  },
  {
    name: "Music & Multimedia",
    note: "Creative direction, production briefs, research, and campaign planning.",
    icon: Zap,
    tone: "violet",
    slugs: ["audio-creative-director", "audio-brief-to-production-spec", "research-synthesist", "source-grounded-research"],
  },
  {
    name: "Research & Strategy",
    note: "Source-grounded research, synthesis, evaluation, and decision support.",
    icon: BookOpen,
    tone: "aqua",
    slugs: ["research-synthesist", "source-grounded-research", "prompt-evaluation", "agent-orchestrator", "implementation-planning"],
  },
];

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function makeId(prefix: string) {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function editorFingerprint(artifact: Artifact) {
  return JSON.stringify({
    id: artifact.id,
    title: artifact.title,
    slug: artifact.slug,
    exportPath: artifact.exportPath,
    kind: artifact.kind,
    category: artifact.category,
    description: artifact.description,
    content: artifact.content,
    tags: artifact.tags,
    targets: artifact.targets,
    status: artifact.status,
    version: artifact.version,
    favorite: artifact.favorite,
    featured: artifact.featured,
    source: artifact.source,
  });
}

function inferKind(fileName: string, content: string): ArtifactKind {
  const path = fileName.toLowerCase();
  if (path.endsWith("skill.md") || /allowed-tools:|when_to_use:/.test(content)) return "skill";
  if (path.includes("agents.md") || path.includes("claude.md")) return "instruction";
  if (path.includes("agent") || /^tools:/m.test(content)) return "agent";
  return "skill";
}

function allocateSlug(base: string, reserved: Set<string>) {
  if (!reserved.has(base)) {
    reserved.add(base);
    return base;
  }
  let suffix = 2;
  while (reserved.has(`${base}-${suffix}`)) suffix += 1;
  const allocated = `${base}-${suffix}`;
  reserved.add(allocated);
  return allocated;
}

function inferExportPath(fileName: string, kind: ArtifactKind, slug: string) {
  const normalized = fileName.replaceAll("\\", "/").replace(/^\.\//, "");
  const safePath = normalized
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  const lower = safePath.toLowerCase();
  const claudeIndex = lower.indexOf(".claude/");
  if (claudeIndex >= 0) return safePath.slice(claudeIndex);
  const baseName = lower.split("/").pop();
  if (baseName === "agents.md") return "AGENTS.md";
  if (baseName === "claude.md") return "CLAUDE.md";
  if (kind === "agent") return `.claude/agents/${slug}.md`;
  if (kind === "skill") return `.claude/skills/${slug}/SKILL.md`;
  return `.claude/rules/${slug}.md`;
}

function validateArtifact(artifact: Artifact) {
  const findings: { tone: "pass" | "warn"; text: string }[] = [];
  const hasFrontmatter = artifact.content.trimStart().startsWith("---");
  findings.push({
    tone: hasFrontmatter || artifact.kind === "instruction" ? "pass" : "warn",
    text: hasFrontmatter || artifact.kind === "instruction" ? "Document structure detected" : "Add YAML frontmatter",
  });
  findings.push({
    tone: artifact.description.length >= 40 ? "pass" : "warn",
    text: artifact.description.length >= 40 ? "Activation description is specific" : "Strengthen the activation description",
  });
  const frontmatterName = artifact.content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  findings.push({
    tone: !frontmatterName || frontmatterName === artifact.slug ? "pass" : "warn",
    text: !frontmatterName || frontmatterName === artifact.slug ? "Name and path are aligned" : "Frontmatter name differs from slug",
  });
  const lineCount = artifact.content.split("\n").length;
  findings.push({
    tone: lineCount < 500 ? "pass" : "warn",
    text: lineCount < 500 ? `${lineCount} lines · context efficient` : `${lineCount} lines · consider progressive disclosure`,
  });
  const mayContainSecret = /(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[a-z0-9_-]{16,}/i.test(artifact.content)
    || /\bsk-[a-z0-9_-]{16,}/i.test(artifact.content);
  if (mayContainSecret) {
    findings.push({ tone: "warn", text: "Review a possible embedded secret" });
  }
  return findings;
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let inCode = false;
  let code: string[] = [];
  let paragraph: string[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let frontmatterClosed = !inFrontmatter;
  const frontmatter: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={`p-${nodes.length}`}>{paragraph.join(" ")}</p>);
    paragraph = [];
  };

  lines.forEach((line) => {
    if (inFrontmatter && !frontmatterClosed) {
      if (line.trim() === "---" && frontmatter.length) {
        frontmatterClosed = true;
        inFrontmatter = false;
        nodes.push(
          <div className="frontmatter-preview" key="frontmatter">
            <span>YAML</span>
            <pre>{frontmatter.join("\n")}</pre>
          </div>,
        );
      } else if (line.trim() !== "---") {
        frontmatter.push(line);
      }
      return;
    }
    if (line.trim().startsWith("```")) {
      flushParagraph();
      if (inCode) {
        nodes.push(<pre className="code-block" key={`code-${nodes.length}`}>{code.join("\n")}</pre>);
        code = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      if (level === 1) nodes.push(<h1 key={`h-${nodes.length}`}>{heading[2]}</h1>);
      if (level === 2) nodes.push(<h2 key={`h-${nodes.length}`}>{heading[2]}</h2>);
      if (level === 3) nodes.push(<h3 key={`h-${nodes.length}`}>{heading[2]}</h3>);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      nodes.push(<div className="preview-list-item" key={`li-${nodes.length}`}><span>•</span>{line.replace(/^[-*]\s+/, "")}</div>);
      return;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const number = line.match(/^(\d+)\./)?.[1];
      nodes.push(<div className="preview-list-item" key={`li-${nodes.length}`}><span>{number}.</span>{line.replace(/^\d+\.\s+/, "")}</div>);
      return;
    }
    paragraph.push(line.trim());
  });
  flushParagraph();
  if (code.length) nodes.push(<pre className="code-block" key="code-last">{code.join("\n")}</pre>);
  return <div className="markdown-preview">{nodes}</div>;
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function createZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const write16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const write32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write32(localView, 14, crc);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    chunks.push(local);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    write32(directoryView, 0, 0x02014b50);
    write16(directoryView, 4, 20);
    write16(directoryView, 6, 20);
    write16(directoryView, 8, 0x0800);
    write16(directoryView, 10, 0);
    write32(directoryView, 16, crc);
    write32(directoryView, 20, data.length);
    write32(directoryView, 24, data.length);
    write16(directoryView, 28, name.length);
    write32(directoryView, 42, offset);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function ArtifactCard({
  artifact,
  onOpen,
  onFavorite,
  layout,
}: {
  artifact: Artifact;
  onOpen: () => void;
  onFavorite: () => void;
  layout: "grid" | "list";
}) {
  const Icon = kindIcons[artifact.kind];
  return (
    <article className={classNames("artifact-card glass-card", `kind-${artifact.kind}`, layout === "list" && "artifact-card-list")}>
      <button className="artifact-open" onClick={onOpen} aria-label={`Open ${artifact.title}`}>
        <span className="artifact-icon"><Icon size={20} strokeWidth={1.8} /></span>
        <span className="artifact-copy">
          <span className="artifact-type">{kindLabel[artifact.kind]} · {artifact.category}</span>
          <strong>{artifact.title}</strong>
          <span className="artifact-description">{artifact.description}</span>
        </span>
      </button>
      <div className="artifact-footer">
        <span className="path-pill">{artifactPath(artifact)}</span>
        <button className={classNames("icon-button small", artifact.favorite && "is-favorite")} onClick={onFavorite} aria-label={artifact.favorite ? "Remove favorite" : "Add favorite"}>
          <Star size={16} fill={artifact.favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}

export default function AgentVault({ initialArtifacts }: AgentVaultProps) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [view, setView] = useState<View>("dashboard");
  const [kindFilter, setKindFilter] = useState<"all" | ArtifactKind>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("featured");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [editor, setEditor] = useState<Artifact | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
  const [showImport, setShowImport] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "offline">("loading");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const lineRailRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("agent-vault-theme");
    if (stored === "light") {
      window.requestAnimationFrame(() => setTheme("light"));
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("agent-vault-theme", theme);
  }, [theme]);

  useEffect(() => {
    fetch("/api/artifacts")
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`sync unavailable (${response.status}): ${detail}`);
        }
        return response.json() as Promise<{ artifacts: Artifact[] }>;
      })
      .then((data) => {
        setArtifacts(data.artifacts);
        setSyncStatus("synced");
      })
      .catch(() => {
        setSyncStatus("offline");
      });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommand((current) => !current);
      }
      if (event.key === "Escape") {
        setShowCommand(false);
        if (!importing) setShowImport(false);
        setShowMobileNav(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importing]);

  useEffect(() => {
    if (!editor && !showImport && !showCommand) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editor, showCommand, showImport]);

  const counts = useMemo(() => ({
    all: artifacts.length,
    agent: artifacts.filter((artifact) => artifact.kind === "agent").length,
    skill: artifacts.filter((artifact) => artifact.kind === "skill").length,
    instruction: artifacts.filter((artifact) => artifact.kind === "instruction").length,
  }), [artifacts]);

  const categories = useMemo(() => Array.from(new Set(artifacts.map((artifact) => artifact.category))).sort(), [artifacts]);

  const visibleArtifacts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let result = artifacts.filter((artifact) => {
      if (view === "favorites" && !artifact.favorite) return false;
      if (kindFilter !== "all" && artifact.kind !== kindFilter) return false;
      if (!needle) return true;
      return [artifact.title, artifact.description, artifact.category, ...artifact.tags, ...artifact.targets]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    result = [...result].sort((a, b) => {
      if (sortMode === "name") return a.title.localeCompare(b.title);
      if (sortMode === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return Number(b.featured) - Number(a.featured) || Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title);
    });
    return result;
  }, [artifacts, kindFilter, search, sortMode, view]);

  const openNew = (kind: ArtifactKind) => {
    const now = new Date().toISOString();
    setEditor({ ...templates[kind], id: makeId("draft"), createdAt: now, updatedAt: now });
    setIsNew(true);
    setEditorBaseline(null);
    setEditorMode("write");
    setShowCommand(false);
  };

  const openImport = () => {
    setImportReport(null);
    setShowCommand(false);
    setShowImport(true);
  };

  const openEditor = (artifact: Artifact) => {
    const editable = { ...artifact, tags: [...artifact.tags], targets: [...artifact.targets] };
    setEditor(editable);
    setIsNew(false);
    setEditorBaseline(editorFingerprint(editable));
    setEditorMode("write");
  };

  const saveArtifact = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const response = await fetch("/api/artifacts", {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editor),
      });
      const data = await response.json() as { artifact?: Artifact; error?: string };
      if (!response.ok || !data.artifact) throw new Error(data.error || "Save failed");
      setArtifacts((current) => isNew
        ? [...current, data.artifact as Artifact]
        : current.map((artifact) => artifact.id === data.artifact?.id ? data.artifact : artifact));
      setEditor(data.artifact);
      setEditorBaseline(editorFingerprint(data.artifact));
      setIsNew(false);
      setSyncStatus("synced");
      notify("Saved to your library");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async (artifact: Artifact) => {
    const updated = { ...artifact, favorite: !artifact.favorite };
    setArtifacts((current) => current.map((item) => item.id === artifact.id ? updated : item));
    try {
      const response = await fetch("/api/artifacts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: updated.id, favorite: updated.favorite }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setArtifacts((current) => current.map((item) => item.id === artifact.id ? artifact : item));
      notify("Favorite could not be updated");
    }
  };

  const deleteArtifact = async () => {
    if (!editor || !window.confirm(`Remove “${editor.title}” from the library?`)) return;
    try {
      const response = await fetch("/api/artifacts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editor.id }),
      });
      if (!response.ok) throw new Error("Delete failed");
      setArtifacts((current) => current.filter((artifact) => artifact.id !== editor.id));
      setEditor(null);
      setEditorBaseline(null);
      notify("Artifact removed");
    } catch {
      notify("Artifact could not be removed");
    }
  };

  const duplicateArtifact = () => {
    if (!editor) return;
    const now = new Date().toISOString();
    setEditor({
      ...editor,
      id: makeId("draft"),
      title: `${editor.title} Copy`,
      slug: `${editor.slug}-copy`,
      exportPath: "",
      source: "created",
      favorite: false,
      createdAt: now,
      updatedAt: now,
    });
    setIsNew(true);
    setEditorBaseline(null);
    notify("Copy ready to edit");
  };

  const exportArtifact = (artifact: Artifact) => {
    const fileName = artifact.kind === "skill" ? "SKILL.md" : artifact.kind === "instruction" ? artifactPath(artifact).split("/").pop() || "AGENTS.md" : `${artifact.slug}.md`;
    downloadBlob(new Blob([artifact.content], { type: "text/markdown;charset=utf-8" }), fileName);
    notify("Markdown exported");
  };

  const exportPack = (subset?: Artifact[]) => {
    const included = (subset ?? artifacts).filter(
      (artifact) => artifact.status !== "archived"
        && artifact.targets.some((target) => target === "Claude Code" || target === "Universal"),
    );
    if (!included.length) {
      notify("No Claude-compatible artifacts are selected");
      return;
    }
    const usedPaths = new Set<string>();
    const warnings: string[] = [];
    const exportEntries = included.map((artifact) => {
      const requestedPath = artifactPath(artifact)
        .replaceAll("\\", "/")
        .split("/")
        .filter((part) => part && part !== "." && part !== ".." && !/^[A-Za-z]:$/.test(part))
        .join("/") || `${artifact.slug}.md`;
      let path = requestedPath;
      if (usedPaths.has(path.toLowerCase())) {
        const fileName = path.split("/").pop() || `${artifact.slug}.md`;
        path = `.agent-vault/conflicts/${artifact.slug}/${fileName}`;
        warnings.push(`${requestedPath} was duplicated; ${artifact.title} was preserved at ${path}.`);
      }
      usedPaths.add(path.toLowerCase());
      return { artifact, path };
    });
    const manifest = {
      name: "Agent Vault · Claude Code Pack",
      generatedAt: new Date().toISOString(),
      format: "agent-vault/1",
      target: "Claude Code",
      warnings,
      artifacts: exportEntries.map(({ artifact, path }) => ({
        id: artifact.id,
        version: artifact.version,
        kind: artifact.kind,
        path,
      })),
    };
    const files = [
      ...exportEntries.map(({ artifact, path }) => ({ name: path, content: artifact.content })),
      { name: "agent-vault-manifest.json", content: JSON.stringify(manifest, null, 2) },
      { name: "README.md", content: "# Agent Vault Export\n\nCopy the included AGENTS.md, CLAUDE.md, and .claude directory into your project root. Review permissions and imported content before use.\n" },
    ];
    downloadBlob(createZip(files), "agent-vault-claude-code.zip");
    notify(`${included.length} artifacts packaged for Claude Code`);
  };

  const importFiles = async (files: FileList | File[]) => {
    if (importing) return;
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;

    setImporting(true);
    setImportReport(null);
    const candidates: ImportCandidate[] = [];
    const issues: string[] = [];
    const reportIssue = (message: string) => {
      if (issues.length < 8 && !issues.includes(message)) issues.push(message);
    };
    let skipped = 0;
    let failed = 0;
    let archives = 0;

    try {
      for (const file of selectedFiles) {
        const lowerName = file.name.toLowerCase();
        const sourcePath = file.webkitRelativePath || file.name;
        if (lowerName.endsWith(".zip")) {
          archives += 1;
          try {
            const archive = await scanSkillArchive(new Uint8Array(await file.arrayBuffer()));
            skipped += archive.skipped;
            archive.issues.forEach((issue) => reportIssue(`${file.name}: ${issue}`));
            if (!archive.definitions.length) {
              skipped += 1;
              reportIssue(`${file.name}: no skill definitions were found.`);
              continue;
            }
            archive.definitions.forEach((definition) => {
              candidates.push({
                fileName: definition.archivePath,
                sourceLabel: `${file.name} / ${definition.archivePath}`,
                content: definition.content,
                forceSkill: true,
                warning: definition.warning,
              });
            });
          } catch (error) {
            failed += 1;
            reportIssue(`${file.name}: ${error instanceof Error ? error.message : "archive could not be read"}`);
          }
          continue;
        }

        if (!lowerName.endsWith(".md") && !lowerName.endsWith(".markdown")) {
          skipped += 1;
          continue;
        }
        if (file.size <= 0 || file.size > IMPORT_LIMITS.markdownBytes) {
          skipped += 1;
          reportIssue(`${sourcePath}: empty or larger than the 1 MB Markdown limit.`);
          continue;
        }
        try {
          const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
          if (!content.trim()) {
            skipped += 1;
            reportIssue(`${sourcePath}: empty Markdown was skipped.`);
            continue;
          }
          const metadata = markdownMetadata(content);
          const isFolderSelection = Boolean(file.webkitRelativePath);
          const isCanonicalSkill = lowerName === "skill.md";
          const declaresSkill = metadata.frontmatter.valid && Boolean(metadata.name && metadata.description);
          if (isFolderSelection && !isCanonicalSkill && !declaresSkill) {
            skipped += 1;
            continue;
          }
          const forceSkill = isCanonicalSkill || (isFolderSelection && declaresSkill);
          const warning = forceSkill && (!metadata.frontmatter.valid || !metadata.name || !metadata.description)
            ? "Frontmatter needs both name and description; imported as a review draft."
            : undefined;
          candidates.push({ fileName: sourcePath, sourceLabel: sourcePath, content, forceSkill, warning });
        } catch {
          skipped += 1;
          reportIssue(`${sourcePath}: not valid UTF-8 Markdown.`);
        }
      }

      const reservedSlugs = new Set(artifacts.map((artifact) => artifact.slug.toLowerCase()));
      const importedArtifacts: Artifact[] = [];
      let renamed = 0;
      for (const candidate of candidates) {
        const metadata = markdownMetadata(candidate.content);
        const title = (metadata.name || metadata.heading || titleFallbackFromPath(candidate.fileName)).slice(0, 160);
        const kind = candidate.forceSkill ? "skill" : inferKind(candidate.fileName, candidate.content);
        const safeBaseSlug = slugify(title) || (kind === "skill" ? "imported-skill" : "imported-document");
        const importedSlug = allocateSlug(safeBaseSlug, reservedSlugs);
        if (importedSlug !== safeBaseSlug) renamed += 1;
        const needsReview = Boolean(candidate.warning || (kind === "skill" && (!metadata.name || !metadata.description)));
        if (candidate.warning) reportIssue(`${candidate.sourceLabel}: ${candidate.warning}`);
        const now = new Date().toISOString();
        const draft: Artifact = {
          ...templates[kind],
          id: makeId("import"),
          title,
          slug: importedSlug,
          exportPath: kind === "skill"
            ? `.claude/skills/${importedSlug}/SKILL.md`
            : inferExportPath(candidate.fileName, kind, importedSlug),
          category: kind === "skill" ? "Imported Skills" : templates[kind].category,
          description: (metadata.description || `Imported ${kind} Markdown awaiting metadata review.`).slice(0, 500),
          content: candidate.content,
          source: "imported",
          status: "draft",
          tags: ["imported", kind, ...(needsReview ? ["needs-review"] : [])],
          targets: kind === "skill" ? ["Claude Code", "Agent Skills"] : templates[kind].targets,
          createdAt: now,
          updatedAt: now,
        };
        try {
          const response = await fetch("/api/artifacts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(draft),
          });
          const data = await response.json() as { artifact?: Artifact; error?: string };
          if (!response.ok || !data.artifact) throw new Error(data.error || "save failed");
          importedArtifacts.push(data.artifact);
        } catch (error) {
          failed += 1;
          reportIssue(`${candidate.sourceLabel}: ${error instanceof Error ? error.message : "save failed"}`);
        }
      }

      if (importedArtifacts.length) {
        setArtifacts((current) => [...current, ...importedArtifacts]);
        setSyncStatus("synced");
      }
      const report: ImportReport = {
        detected: candidates.length,
        imported: importedArtifacts.length,
        skipped,
        failed,
        renamed,
        archives,
        issues,
      };
      setImportReport(report);
      notify(importedArtifacts.length
        ? `${importedArtifacts.length} item${importedArtifacts.length === 1 ? "" : "s"} loaded into the vault`
        : "No skills were imported");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      setImporting(false);
    }
  };

  const recent = [...artifacts]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);
  const featured = artifacts.filter((artifact) => artifact.featured).slice(0, 3);
  const editorFindings = editor ? validateArtifact(editor) : [];
  const isEditorDirty = Boolean(
    editor && (editorBaseline === null || editorFingerprint(editor) !== editorBaseline),
  );
  const overlayOpen = Boolean(editor || showImport || showCommand);

  const requestCloseEditor = () => {
    if (isEditorDirty && !window.confirm("Discard the unsaved changes to this artifact?")) return;
    setEditor(null);
    setEditorBaseline(null);
  };

  return (
    <div className="vault-shell">
      <div className="ambient ambient-slate" />
      <div className="ambient ambient-ember" />
      <div className="ambient ambient-violet" />

      <aside className={classNames("sidebar glass-nav", showMobileNav && "mobile-open")} inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen || undefined}>
        <div className="brand-row">
          <button className="brand" onClick={() => { setView("dashboard"); setShowMobileNav(false); }} aria-label="Agent Vault overview">
            <span className="brand-mark"><span>&lt;</span><i /><span>/&gt;</span></span>
            <span className="brand-name"><strong>Agent</strong><em>Vault</em></span>
          </button>
          <button className="icon-button sidebar-close" onClick={() => setShowMobileNav(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <button className="new-button" onClick={() => openNew("agent")}>
          <span><Plus size={18} /></span>
          New artifact
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={classNames(view === item.id && "active")} onClick={() => { setView(item.id); setShowMobileNav(false); }}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === "library" && <small>{counts.all}</small>}
                {item.id === "favorites" && <small>{artifacts.filter((artifact) => artifact.favorite).length}</small>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <p className="nav-label">Artifact types</p>
          {(["agent", "skill", "instruction"] as ArtifactKind[]).map((kind) => {
            const Icon = kindIcons[kind];
            return (
              <button key={kind} onClick={() => { setKindFilter(kind); setView("library"); setShowMobileNav(false); }} className={classNames("type-link", view === "library" && kindFilter === kind && "active")}>
                <span className={`type-dot kind-${kind}`}><Icon size={15} /></span>
                {kindLabel[kind]}s
                <small>{counts[kind]}</small>
              </button>
            );
          })}
        </div>

        <div className="sidebar-section categories-section">
          <p className="nav-label">Domains</p>
          {categories.slice(0, 5).map((category) => (
            <button key={category} className="category-link" onClick={() => { setSearch(category); setView("library"); setShowMobileNav(false); }}>
              <span />{category}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="sync-state">
            <span className={syncStatus} />
            <div><strong>{syncStatus === "synced" ? "Library synced" : syncStatus === "loading" ? "Connecting" : "Local seed view"}</strong><small>{counts.all} artifacts indexed</small></div>
          </div>
          <button className="sidebar-settings" onClick={() => notify("Workspace preferences are available from the theme control above")}><Settings2 size={17} /> Preferences</button>
        </div>
      </aside>

      <main className="main-workspace" inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen || undefined}>
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <button className="global-search glass-control" onClick={() => setShowCommand(true)}>
            <Search size={18} />
            <span>Search agents, skills, tags…</span>
            <kbd><Command size={12} />K</kbd>
          </button>
          <div className="topbar-actions">
            <button className="icon-button glass-control" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="secondary-button glass-control desktop-action" onClick={openImport}><Import size={17} /> Import</button>
            <button className="primary-button" onClick={() => openNew("agent")}><Plus size={17} /> Create</button>
          </div>
        </header>

        <div className="workspace-scroll">
          {view === "dashboard" && (
            <>
              <section className="hero-grid">
                <div className="hero-copy">
                  <p className="eyebrow"><Sparkles size={15} /> Agentic intelligence, organized</p>
                  <h1>Build better<br /><span>agents.</span></h1>
                  <p className="hero-lede">Create, refine, validate, and package the Markdown that makes your AI workflows genuinely capable.</p>
                  <div className="hero-actions">
                    <button className="primary-button large" onClick={() => openNew("skill")}><WandSparkles size={18} /> Create a skill</button>
                    <button className="secondary-button glass-control large" onClick={() => { setView("library"); setKindFilter("all"); }}><LibraryBig size={18} /> Explore library</button>
                  </div>
                </div>

                <div className="hero-visual glass-card">
                  <div className="hero-visual-head">
                    <span><span className="live-dot" /> CLAUDE CODE PACK</span>
                    <span className="mini-pill"><Check size={12} /> Ready</span>
                  </div>
                  <div className="agent-map">
                    <div className="map-orbit orbit-one" />
                    <div className="map-orbit orbit-two" />
                    <div className="map-node map-main"><Braces size={26} /><span>ORCHESTRATOR</span></div>
                    <div className="map-node map-skill one"><WandSparkles size={16} /><span>RESEARCH</span></div>
                    <div className="map-node map-skill two"><ShieldCheck size={16} /><span>VERIFY</span></div>
                    <div className="map-node map-skill three"><Code2 size={16} /><span>BUILD</span></div>
                  </div>
                  <div className="pack-path"><FolderArchive size={15} /><span>.claude / agents / skills</span><strong>{counts.all} files</strong></div>
                </div>
              </section>

              <section className="stats-strip glass-card">
                <div><span className="stat-icon agent"><Braces size={19} /></span><p><strong>{counts.agent}</strong><span>Agents</span></p></div>
                <div><span className="stat-icon skill"><WandSparkles size={19} /></span><p><strong>{counts.skill}</strong><span>Skills</span></p></div>
                <div><span className="stat-icon instruction"><FileCode2 size={19} /></span><p><strong>{counts.instruction}</strong><span>Instructions</span></p></div>
                <div className="health-stat"><span className="stat-icon healthy"><ShieldCheck size={19} /></span><p><strong>96%</strong><span>Validation health</span></p><div className="health-bar"><i /></div></div>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><p className="eyebrow">Curated starters</p><h2>Featured artifacts</h2></div>
                  <button className="text-button" onClick={() => setView("library")}>View all <span>↗</span></button>
                </div>
                <div className="artifact-grid featured-grid">
                  {featured.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onOpen={() => openEditor(artifact)} onFavorite={() => toggleFavorite(artifact)} layout="grid" />)}
                </div>
              </section>

              <section className="dashboard-lower">
                <div className="quick-start glass-card">
                  <div className="section-heading compact"><div><p className="eyebrow">Start from structure</p><h2>Quick create</h2></div></div>
                  <div className="quick-grid">
                    {(["agent", "skill", "instruction"] as ArtifactKind[]).map((kind) => {
                      const Icon = kindIcons[kind];
                      return <button key={kind} onClick={() => openNew(kind)}><span className={`quick-icon kind-${kind}`}><Icon size={21} /></span><span><strong>New {kindLabel[kind]}</strong><small>{kind === "agent" ? "Specialist subagent" : kind === "skill" ? "Reusable capability" : "Repository guidance"}</small></span><Plus size={17} /></button>;
                    })}
                  </div>
                </div>
                <div className="recent-panel glass-card">
                  <div className="section-heading compact"><div><p className="eyebrow">Latest activity</p><h2>Recently touched</h2></div><Clock3 size={18} /></div>
                  <div className="recent-list">
                    {recent.map((artifact) => {
                      const Icon = kindIcons[artifact.kind];
                      return <button key={artifact.id} onClick={() => openEditor(artifact)}><span className={`recent-icon kind-${artifact.kind}`}><Icon size={16} /></span><span><strong>{artifact.title}</strong><small>{artifactPath(artifact)}</small></span><time>{formatDate(artifact.updatedAt)}</time></button>;
                    })}
                  </div>
                </div>
              </section>
            </>
          )}

          {(view === "library" || view === "favorites") && (
            <section className="library-view">
              <div className="library-heading">
                <div><p className="eyebrow">{view === "favorites" ? "Pinned essentials" : "Your agentic repository"}</p><h1>{view === "favorites" ? "Favorites" : "Library"}</h1><p>{view === "favorites" ? "The documents you reach for first." : `${counts.all} deeply structured artifacts, ready to adapt.`}</p></div>
                <div className="library-heading-actions">
                  <button className="secondary-button glass-control" onClick={openImport}><UploadCloud size={17} /> Import skills or ZIP</button>
                  <button className="primary-button" onClick={() => exportPack()}><PackageOpen size={17} /> Export Claude pack</button>
                </div>
              </div>

              <div className="library-toolbar glass-card">
                <div className="kind-tabs">
                  <button className={kindFilter === "all" ? "active" : ""} onClick={() => setKindFilter("all")}>All <small>{counts.all}</small></button>
                  {(["agent", "skill", "instruction"] as ArtifactKind[]).map((kind) => <button key={kind} className={kindFilter === kind ? "active" : ""} onClick={() => setKindFilter(kind)}>{kindLabel[kind]}s <small>{counts[kind]}</small></button>)}
                </div>
                <div className="toolbar-right">
                  <label className="inline-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter library" aria-label="Filter library" />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button>}</label>
                  <label className="sort-select"><span className="sr-only">Sort artifacts</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="featured">Featured</option><option value="recent">Recently updated</option><option value="name">A–Z</option></select><ChevronDown size={14} /></label>
                  <div className="view-toggle"><button className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-label="Grid layout"><Grid2X2 size={16} /></button><button className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-label="List layout"><LayoutList size={17} /></button></div>
                </div>
              </div>

              {visibleArtifacts.length ? (
                <div className={classNames("artifact-grid", layout === "list" && "artifact-list-layout")}>
                  {visibleArtifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onOpen={() => openEditor(artifact)} onFavorite={() => toggleFavorite(artifact)} layout={layout} />)}
                </div>
              ) : (
                <div className="empty-state glass-card"><Search size={28} /><h2>No matching artifacts</h2><p>Try another keyword or clear the current filters.</p><button className="secondary-button" onClick={() => { setSearch(""); setKindFilter("all"); }}>Clear filters</button></div>
              )}
            </section>
          )}

          {view === "collections" && (
            <section className="collections-view">
              <div className="library-heading">
                <div><p className="eyebrow">Deployable combinations</p><h1>Collections</h1><p>Curated groups for common agentic workflows and export targets.</p></div>
                <button className="primary-button" onClick={() => exportPack()}><PackageOpen size={17} /> Export complete pack</button>
              </div>
              <div className="collection-grid">
                {collectionSpecs.map((collection) => {
                  const Icon = collection.icon;
                  const members = artifacts.filter((artifact) => collection.slugs.includes(artifact.slug));
                  return <article className={`collection-card glass-card ${collection.tone}`} key={collection.name}><div className="collection-icon"><Icon size={24} /></div><p className="eyebrow">{members.length} artifacts</p><h2>{collection.name}</h2><p>{collection.note}</p><div><span>{collection.name === "Claude Code Core" ? ".claude/" : "portable pack"}</span><button onClick={() => exportPack(members)}><ArrowDownToLine size={16} /> Export</button></div></article>;
                })}
              </div>
              <div className="collection-banner glass-card"><div className="collection-graph"><span><Braces size={20} /></span><i /><span><WandSparkles size={20} /></span><i /><span><ShieldCheck size={20} /></span></div><div><p className="eyebrow">Relationship aware</p><h2>Packages keep the right file structure</h2><p>Agent Vault maps each artifact to Claude Code&apos;s project conventions and includes a readable manifest with every export.</p></div><button className="secondary-button" onClick={() => setView("library")}>Inspect artifacts</button></div>
            </section>
          )}
        </div>
      </main>

      {editor && (
        <div className="editor-backdrop" role="dialog" aria-modal="true" aria-label="Artifact editor">
          <div className="editor-shell glass-modal" aria-busy={saving} onKeyDown={(event) => { trapDialogFocus(event); if (event.key === "Escape") requestCloseEditor(); }}>
            <header className="editor-header">
              <div className="editor-title-block">
                <span className={`artifact-icon kind-${editor.kind}`}>{(() => { const Icon = kindIcons[editor.kind]; return <Icon size={19} />; })()}</span>
                <div><p>{isNew ? "New" : "Editing"} {kindLabel[editor.kind]}</p><strong>{editor.title}</strong></div>
              </div>
              <div className="editor-actions">
                <span className="save-state"><span className={saving ? "saving" : "saved"} /> {saving ? "Saving…" : isEditorDirty ? "Unsaved changes" : "Saved"}</span>
                <button className="icon-button" onClick={duplicateArtifact} aria-label="Duplicate artifact"><Copy size={17} /></button>
                <button className="secondary-button compact-button" onClick={() => exportArtifact(editor)}><Download size={16} /> Export</button>
                <button className="primary-button compact-button" onClick={saveArtifact} disabled={saving}><Save size={16} /> {saving ? "Saving" : "Save version"}</button>
                <button className="icon-button close-editor" onClick={requestCloseEditor} aria-label="Close editor"><X size={20} /></button>
              </div>
            </header>

            <fieldset className="editor-body" disabled={saving}>
              <section className="editor-main">
                <div className="editor-meta-row">
                  <label><span>Title</span><input autoFocus value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value, slug: isNew ? slugify(event.target.value) : editor.slug })} /></label>
                  <label><span>Type</span><select value={editor.kind} onChange={(event) => setEditor({ ...editor, kind: event.target.value as ArtifactKind })}><option value="agent">Agent</option><option value="skill">Skill</option><option value="instruction">Instruction</option></select></label>
                  <label><span>Category</span><input value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })} /></label>
                </div>
                <label className="description-field"><span>Description</span><input value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>

                <div className="document-tabs">
                  <div><button className={editorMode === "write" ? "active" : ""} onClick={() => setEditorMode("write")}><Code2 size={15} /> Markdown</button><button className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")}><BookOpen size={15} /> Preview</button></div>
                  <span>{editor.content.split("\n").length} lines · {editor.content.trim().split(/\s+/).length} words</span>
                </div>
                {editorMode === "write" ? (
                  <div className="code-editor-wrap"><div className="line-rail" ref={lineRailRef} aria-hidden="true">{editor.content.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} onScroll={(event) => { if (lineRailRef.current) lineRailRef.current.scrollTop = event.currentTarget.scrollTop; }} spellCheck={false} aria-label="Markdown content" /></div>
                ) : <div className="preview-scroll"><MarkdownPreview content={editor.content} /></div>}
              </section>

              <aside className="editor-inspector">
                <div className="inspector-section">
                  <p className="inspector-title"><ShieldCheck size={16} /> Validation</p>
                  <div className="validation-score"><strong>{editorFindings.filter((finding) => finding.tone === "pass").length}/{editorFindings.length}</strong><span>Claude-ready checks</span><div><i style={{ width: `${(editorFindings.filter((finding) => finding.tone === "pass").length / editorFindings.length) * 100}%` }} /></div></div>
                  <div className="finding-list">{editorFindings.map((finding) => <div className={finding.tone} key={finding.text}>{finding.tone === "pass" ? <Check size={14} /> : <CircleHelp size={14} />}<span>{finding.text}</span></div>)}</div>
                </div>
                <div className="inspector-section">
                  <p className="inspector-title"><FolderArchive size={16} /> Export path</p>
                  <input
                    className="export-path export-path-input"
                    value={editor.exportPath || artifactPath(editor)}
                    onChange={(event) => setEditor({ ...editor, exportPath: event.target.value })}
                    aria-label="Export path"
                    disabled={saving}
                  />
                </div>
                <div className="inspector-section">
                  <p className="inspector-title"><Tag size={16} /> Tags</p>
                  <div className="tag-editor">{editor.tags.map((tag) => <span key={tag}>{tag}<button onClick={() => setEditor({ ...editor, tags: editor.tags.filter((item) => item !== tag) })} aria-label={`Remove ${tag}`}><X size={11} /></button></span>)}<button onClick={() => { const tag = window.prompt("Add a tag"); if (tag?.trim()) setEditor({ ...editor, tags: [...new Set([...editor.tags, tag.trim().toLowerCase()])] }); }}><Plus size={12} /> Add</button></div>
                </div>
                <div className="inspector-section">
                  <p className="inspector-title"><Blocks size={16} /> Compatibility</p>
                  <div className="target-list">{["Claude Code", "Codex", "Universal", "Agent Skills"].map((target) => <label key={target}><input type="checkbox" checked={editor.targets.includes(target)} onChange={() => setEditor({ ...editor, targets: editor.targets.includes(target) ? editor.targets.filter((item) => item !== target) : [...editor.targets, target] })} /><span><Check size={12} /></span>{target}</label>)}</div>
                </div>
                {!isNew && <button className="delete-button" onClick={deleteArtifact}><Trash2 size={15} /> Remove from library</button>}
              </aside>
            </fieldset>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import skills">
          <div className="import-modal glass-modal" aria-busy={importing} onKeyDown={trapDialogFocus}>
            <button className="icon-button modal-close" disabled={importing} onClick={() => setShowImport(false)} aria-label="Close import"><X size={19} /></button>
            <span className="modal-icon"><UploadCloud size={25} /></span>
            <p className="eyebrow">Expand your library</p>
            <h2>Import skills</h2>
            <p>Load one skill file or a ZIP containing many definitions. Ordinary agent and instruction Markdown still works, too.</p>
            <button className="drop-zone" disabled={importing} autoFocus onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!importing) void importFiles(event.dataTransfer.files); }}>
              <FilePlus2 size={28} />
              <strong>{importing ? "Inspecting your skill pack…" : "Drop SKILL.md or a skill ZIP"}</strong>
              <span>{importing ? "Validating paths, sizes, and definitions" : "or choose files from your device"}</span>
              <small>.md · .markdown · .zip · up to 100 skills</small>
            </button>
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.zip,text/markdown,application/zip,application/x-zip-compressed" multiple hidden onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            <button className="folder-import-button" disabled={importing} onClick={() => folderInputRef.current?.click()}><FolderArchive size={15} /> Choose a folder of skill definitions</button>
            <input
              ref={folderInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              hidden
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(event) => event.target.files && void importFiles(event.target.files)}
            />
            {importReport && (
              <div className="import-report" role="status" aria-live="polite">
                <div className="report-heading"><span><Check size={16} /></span><div><strong>Import complete</strong><small>{importReport.detected} definition{importReport.detected === 1 ? "" : "s"} detected{importReport.archives ? ` across ${importReport.archives} archive${importReport.archives === 1 ? "" : "s"}` : ""}</small></div></div>
                <div className="report-stats">
                  <span><strong>{importReport.imported}</strong> imported</span>
                  <span><strong>{importReport.skipped}</strong> skipped</span>
                  <span><strong>{importReport.failed}</strong> failed</span>
                  <span><strong>{importReport.renamed}</strong> renamed</span>
                </div>
                {importReport.issues.length > 0 && <ul className="report-issues">{importReport.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                <div className="report-actions">
                  <button className="secondary-button glass-control" onClick={() => setImportReport(null)}>Import another</button>
                  <button className="primary-button" disabled={!importReport.imported} onClick={() => { setShowImport(false); setView("library"); setKindFilter("all"); setSearch("imported"); setSortMode("recent"); }}>View imported items</button>
                </div>
              </div>
            )}
            <div className="import-notes"><span><ShieldCheck size={15} /> Stored content stays inert in the vault</span><span><Files size={15} /> Duplicates get a safe numbered variant</span></div>
          </div>
        </div>
      )}

      {showCommand && (
        <div className="command-backdrop" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCommand(false); }}>
          <div className="command-palette glass-modal" onKeyDown={trapDialogFocus}>
            <label><Search size={20} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the vault or choose an action…" /><kbd>ESC</kbd></label>
            <div className="command-section"><p>Quick actions</p><button onClick={() => openNew("agent")}><span className="command-icon ember"><Plus size={17} /></span><span><strong>Create new agent</strong><small>Claude Code subagent template</small></span><kbd>↵</kbd></button><button onClick={() => openNew("skill")}><span className="command-icon slate"><WandSparkles size={17} /></span><span><strong>Create new skill</strong><small>Reusable capability template</small></span></button><button onClick={openImport}><span className="command-icon violet"><Import size={17} /></span><span><strong>Import skills or ZIP</strong><small>Add one definition or a complete skill pack</small></span></button><button onClick={() => { exportPack(); setShowCommand(false); }}><span className="command-icon aqua"><FileDown size={17} /></span><span><strong>Export Claude Code pack</strong><small>Package the current library</small></span></button></div>
            {search && <div className="command-section"><p>Matching artifacts</p>{visibleArtifacts.slice(0, 5).map((artifact) => { const Icon = kindIcons[artifact.kind]; return <button key={artifact.id} onClick={() => { openEditor(artifact); setShowCommand(false); }}><span className={`command-icon kind-${artifact.kind}`}><Icon size={17} /></span><span><strong>{artifact.title}</strong><small>{artifactPath(artifact)}</small></span></button>; })}</div>}
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
