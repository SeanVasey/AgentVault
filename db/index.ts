import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeBindings = {
  DB?: D1Database;
};

const runtimeKey = "__agentVaultRuntimeBindings";
let schemaReady: Promise<unknown> | null = null;

export function setRuntimeBindings(bindings: RuntimeBindings) {
  (globalThis as typeof globalThis & Record<string, unknown>)[runtimeKey] = bindings;
}

async function getBindings() {
  const injected = (globalThis as typeof globalThis & Record<string, unknown>)[
    runtimeKey
  ] as RuntimeBindings | undefined;
  const bindings = injected?.DB
    ? injected
    : ((await import("cloudflare:workers")).env as RuntimeBindings);
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return bindings;
}

export async function getD1Binding() {
  return (await getBindings()).DB as D1Database;
}

export async function ensureDatabaseSchema() {
  if (schemaReady) return schemaReady;
  const d1 = await getD1Binding();
  schemaReady = (async () => {
    const tableInfo = await d1.prepare("PRAGMA table_info(artifacts)").all<{ name: string }>();
    const tableExists = tableInfo.results.length > 0;
    const statements = [
      d1.prepare(`CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      export_path TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      targets TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ready',
      version TEXT NOT NULL DEFAULT '1.0.0',
      favorite INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'created',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS artifacts_slug_unique ON artifacts (slug)"),
      d1.prepare(`CREATE TABLE IF NOT EXISTS artifact_versions (
      id TEXT PRIMARY KEY NOT NULL,
      artifact_id TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      change_note TEXT NOT NULL DEFAULT 'Saved revision',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
      d1.prepare("CREATE INDEX IF NOT EXISTS artifact_versions_artifact_idx ON artifact_versions (artifact_id)"),
    ];
    if (tableExists && !tableInfo.results.some((column) => column.name === "export_path")) {
      statements.push(d1.prepare("ALTER TABLE artifacts ADD COLUMN export_path TEXT NOT NULL DEFAULT ''"));
    }
    return d1.batch(statements);
  })();
  return schemaReady;
}

export async function getDb() {
  const bindings = await getBindings();

  return drizzle(bindings.DB, { schema });
}
