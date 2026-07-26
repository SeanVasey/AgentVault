import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  exportPath: text("export_path").notNull().default(""),
  kind: text("kind").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description").notNull().default(""),
  content: text("content").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  targets: text("targets").notNull().default("[]"),
  status: text("status").notNull().default("ready"),
  version: text("version").notNull().default("1.0.0"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("created"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const artifactVersions = sqliteTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull(),
  version: text("version").notNull(),
  content: text("content").notNull(),
  changeNote: text("change_note").notNull().default("Saved revision"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
