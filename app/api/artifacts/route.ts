import { asc, desc, eq } from "drizzle-orm";
import { ensureDatabaseSchema, getD1Binding, getDb } from "../../../db";
import { artifacts } from "../../../db/schema";
import { seedArtifacts } from "../../../lib/seed-artifacts";
import { normalizeArchivePath } from "../../../lib/skill-import";
import type { Artifact, ArtifactInput, ArtifactKind } from "../../../lib/types";
import { slugify } from "../../../lib/types";

export const runtime = "edge";

type ArtifactRow = typeof artifacts.$inferSelect;

const validKinds: ArtifactKind[] = ["agent", "skill", "instruction"];
const validStatuses: Artifact["status"][] = ["draft", "ready", "archived"];
const validSources: Artifact["source"][] = ["built-in", "created", "imported"];

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function decode(row: ArtifactRow): Artifact {
  return {
    ...row,
    kind: validKinds.includes(row.kind as ArtifactKind) ? row.kind as ArtifactKind : "skill",
    status: validStatuses.includes(row.status as Artifact["status"]) ? row.status as Artifact["status"] : "draft",
    source: validSources.includes(row.source as Artifact["source"]) ? row.source as Artifact["source"] : "imported",
    tags: parseStringArray(row.tags || "[]"),
    targets: parseStringArray(row.targets || "[]"),
  };
}

function validateInput(payload: Partial<ArtifactInput | Artifact>) {
  if (typeof payload.title !== "string" || !payload.title.trim()) return "A title is required.";
  if (!slugify(typeof payload.slug === "string" ? payload.slug : payload.title)) return "Title must contain at least one letter or number.";
  if (typeof payload.content !== "string" || !payload.content.trim()) return "Markdown content is required.";
  if (!validKinds.includes(payload.kind as ArtifactKind)) return "Artifact type is invalid.";
  if (!validStatuses.includes(payload.status as Artifact["status"])) return "Artifact status is invalid.";
  if (!validSources.includes(payload.source as Artifact["source"])) return "Artifact source is invalid.";
  if (typeof payload.category !== "string" || typeof payload.description !== "string") return "Category and description must be text.";
  if (typeof payload.version !== "string" || !/^\d+\.\d+\.\d+$/.test(payload.version)) return "Version must use semantic version format.";
  if (typeof payload.favorite !== "boolean" || typeof payload.featured !== "boolean") return "Favorite and featured states must be boolean.";
  if (!Array.isArray(payload.tags) || payload.tags.some((item) => typeof item !== "string")) return "Tags must be a string array.";
  if (!Array.isArray(payload.targets) || payload.targets.some((item) => typeof item !== "string")) return "Targets must be a string array.";
  if (payload.tags.length > 50 || payload.targets.length > 20) return "Too many tags or compatibility targets.";
  const path = payload.exportPath ?? "";
  if (typeof path !== "string" || path.length > 300 || (path.trim() !== "" && normalizeArchivePath(path.trim()) === null)) {
    return "Export path must be a safe relative path.";
  }
  if (payload.content.length > 1_000_000) return "Markdown files are limited to 1 MB.";
  return null;
}

function encode(artifact: Artifact | ArtifactInput) {
  return {
    title: artifact.title.trim(),
    slug: slugify(artifact.slug || artifact.title),
    exportPath: artifact.exportPath?.trim() || "",
    kind: artifact.kind,
    category: artifact.category.trim() || "General",
    description: artifact.description.trim(),
    content: artifact.content,
    tags: JSON.stringify(artifact.tags ?? []),
    targets: JSON.stringify(artifact.targets ?? []),
    status: artifact.status,
    version: artifact.version,
    favorite: artifact.favorite,
    featured: artifact.featured,
    source: artifact.source,
  };
}

async function ensureSeeded() {
  await ensureDatabaseSchema();
  const db = await getDb();
  const existing = await db.select({ id: artifacts.id }).from(artifacts).limit(1);
  if (existing.length) return;

  const rows = seedArtifacts.map((artifact) => ({
    id: artifact.id,
    ...encode(artifact),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  }));
  for (let index = 0; index < rows.length; index += 4) {
    await db.insert(artifacts).values(rows.slice(index, index + 4));
  }
}

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const detail = `${message}\n${cause}`;
  if (detail.includes("no such table") || detail.includes("no such column")) {
    return "The library database is still being prepared. Please retry in a moment.";
  }
  if (detail.includes("UNIQUE constraint failed")) {
    return "An artifact with that slug already exists.";
  }
  return message;
}

function nextPatch(version: string) {
  const [major = "1", minor = "0", patch = "0"] = version.split(".");
  const next = Number.parseInt(patch, 10) + 1;
  return `${major}.${minor}.${Number.isFinite(next) ? next : 1}`;
}

export async function GET() {
  try {
    await ensureSeeded();
    const db = await getDb();
    const rows = await db
      .select()
      .from(artifacts)
      .orderBy(desc(artifacts.favorite), desc(artifacts.featured), asc(artifacts.title));
    return Response.json({ artifacts: rows.map(decode) });
  } catch (error) {
    return Response.json({ error: messageFor(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema();
    const payload = (await request.json()) as ArtifactInput;
    const title = payload.title?.trim();
    const content = payload.content ?? "";
    if (!title || !content.trim()) {
      return Response.json(
        { error: "A title and Markdown content are required." },
        { status: 400 },
      );
    }
    if (content.length > 1_000_000) {
      return Response.json({ error: "Markdown files are limited to 1 MB." }, { status: 413 });
    }

    const now = new Date().toISOString();
    const artifact: Artifact = {
      ...payload,
      id: payload.id || crypto.randomUUID(),
      title,
      slug: slugify(payload.slug || title),
      exportPath: payload.exportPath || "",
      kind: payload.kind || "skill",
      category: payload.category || "General",
      description: payload.description || "",
      tags: payload.tags || [],
      targets: payload.targets || ["Claude Code"],
      status: payload.status || "draft",
      version: payload.version || "1.0.0",
      favorite: Boolean(payload.favorite),
      featured: Boolean(payload.featured),
      source: payload.source || "created",
      createdAt: now,
      updatedAt: now,
    };
    const validationError = validateInput(artifact);
    if (validationError) {
      return Response.json({ error: validationError }, { status: validationError.includes("1 MB") ? 413 : 400 });
    }

    const db = await getDb();
    const [row] = await db
      .insert(artifacts)
      .values({ id: artifact.id, ...encode(artifact), createdAt: now, updatedAt: now })
      .returning();
    return Response.json({ artifact: decode(row) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: messageFor(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDatabaseSchema();
    const payload = (await request.json()) as Artifact;
    if (!payload.id || !payload.title?.trim()) {
      return Response.json({ error: "Artifact id and title are required." }, { status: 400 });
    }
    const validationError = validateInput(payload);
    if (validationError) {
      return Response.json({ error: validationError }, { status: validationError.includes("1 MB") ? 413 : 400 });
    }

    const db = await getDb();
    const [previous] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, payload.id))
      .limit(1);
    if (!previous) {
      return Response.json({ error: "Artifact not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const nextVersion = nextPatch(previous.version);
    const next = encode({ ...payload, version: nextVersion });
    const d1 = await getD1Binding();
    await d1.batch([
      d1.prepare(`INSERT INTO artifact_versions
        (id, artifact_id, version, content, change_note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), payload.id, previous.version, previous.content, "Revision saved from Agent Vault", now),
      d1.prepare(`UPDATE artifacts SET
        title = ?, slug = ?, export_path = ?, kind = ?, category = ?, description = ?,
        content = ?, tags = ?, targets = ?, status = ?, version = ?, favorite = ?,
        featured = ?, source = ?, updated_at = ? WHERE id = ?`)
        .bind(
          next.title,
          next.slug,
          next.exportPath,
          next.kind,
          next.category,
          next.description,
          next.content,
          next.tags,
          next.targets,
          next.status,
          next.version,
          next.favorite ? 1 : 0,
          next.featured ? 1 : 0,
          next.source,
          now,
          payload.id,
        ),
    ]);
    const [row] = await db.select().from(artifacts).where(eq(artifacts.id, payload.id)).limit(1);
    if (!row) return Response.json({ error: "Artifact not found after update." }, { status: 404 });
    return Response.json({ artifact: decode(row) });
  } catch (error) {
    return Response.json({ error: messageFor(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDatabaseSchema();
    const payload = (await request.json()) as { id?: string; favorite?: boolean };
    if (!payload.id || typeof payload.favorite !== "boolean") {
      return Response.json({ error: "Artifact id and favorite state are required." }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .update(artifacts)
      .set({ favorite: payload.favorite })
      .where(eq(artifacts.id, payload.id))
      .returning();
    if (!row) return Response.json({ error: "Artifact not found." }, { status: 404 });
    return Response.json({ artifact: decode(row) });
  } catch (error) {
    return Response.json({ error: messageFor(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDatabaseSchema();
    const { id } = (await request.json()) as { id?: string };
    if (!id) return Response.json({ error: "Artifact id is required." }, { status: 400 });
    const d1 = await getD1Binding();
    await d1.batch([
      d1.prepare("DELETE FROM artifact_versions WHERE artifact_id = ?").bind(id),
      d1.prepare("DELETE FROM artifacts WHERE id = ?").bind(id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: messageFor(error) }, { status: 500 });
  }
}
