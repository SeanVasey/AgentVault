#!/usr/bin/env node

/**
 * Install the AgentVault Mega Collection through AgentVault's public artifact API.
 *
 * Usage:
 *   node scripts/install-agentvault-mega-library.mjs --file ./agent-vault-library.json
 *   node scripts/install-agentvault-mega-library.mjs --file ./agent-vault-library.json --base-url http://localhost:3000 --dry-run
 */

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const value = (name, fallback = "") => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const file = value("--file");
const baseUrl = value("--base-url", "http://localhost:3000").replace(/\/$/, "");
const token = value("--token", process.env.AGENTVAULT_TOKEN || "");
const conflict = value("--conflict", "update");
const dryRun = has("--dry-run");

if (!file) {
  console.error("Missing --file <agent-vault-library.json>.");
  process.exit(2);
}
if (!["update", "skip"].includes(conflict)) {
  console.error("--conflict must be update or skip.");
  process.exit(2);
}

const raw = JSON.parse(await readFile(file, "utf8"));
const incoming = Array.isArray(raw) ? raw : raw.artifacts;
if (!Array.isArray(incoming)) throw new Error("Input must be an artifact array or { artifacts: [...] }.");

const headers = { "content-type": "application/json" };
if (token) headers.authorization = `Bearer ${token}`;

const request = async (method, body) => {
  const response = await fetch(`${baseUrl}/api/artifacts`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${response.status}: ${payload.error || response.statusText}`);
  return payload;
};

const current = await request("GET");
const bySlug = new Map((current.artifacts || []).map((artifact) => [artifact.slug, artifact]));
const summary = { create: 0, update: 0, skip: 0, errors: [] };

for (const artifact of incoming) {
  const existing = bySlug.get(artifact.slug);
  try {
    if (!existing) {
      summary.create += 1;
      if (!dryRun) {
        const created = await request("POST", artifact);
        bySlug.set(created.artifact.slug, created.artifact);
      }
      continue;
    }
    if (conflict === "skip") {
      summary.skip += 1;
      continue;
    }
    summary.update += 1;
    if (!dryRun) {
      const updated = await request("PUT", { ...artifact, id: existing.id, createdAt: existing.createdAt });
      bySlug.set(updated.artifact.slug, updated.artifact);
    }
  } catch (error) {
    summary.errors.push({ slug: artifact.slug, error: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify({ dryRun, total: incoming.length, ...summary }, null, 2));
if (summary.errors.length) process.exitCode = 1;
