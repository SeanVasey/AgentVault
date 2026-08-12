#!/usr/bin/env node

/**
 * Normalizes AgentVault library metadata to English-friendly ASCII and flags
 * CJK/Hangul/Kana remaining in Markdown bodies for explicit translation.
 *
 * This intentionally does NOT blindly transliterate arbitrary Markdown bodies.
 * Blind transliteration destroys technical meaning. Known translated phrases can
 * be added to phraseTranslations below; unresolved language is reported.
 */

import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const at = (name, fallback = "") => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const input = at("--file");
const output = at("--out", input);
if (!input) {
  console.error("Missing --file <library.json>.");
  process.exit(2);
}

const phraseTranslations = new Map([
  ["C# アプリケーション構築指針 by @tsubakimoto", "C# application development guidelines by @tsubakimoto"],
  ["C# 애플리케이션 개발을 위한 코드 작성 규칙 by @jgkim999", "Code-writing rules for C# application development by @jgkim999"],
]);
const asianScript = /[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;
const metadataFields = ["title", "slug", "category", "description", "exportPath"];
const ascii = (text) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "");
const translateKnown = (text) => {
  let next = text;
  for (const [source, english] of phraseTranslations) next = next.replaceAll(source, english);
  return next;
};

const document = JSON.parse(await readFile(input, "utf8"));
const artifacts = Array.isArray(document) ? document : document.artifacts;
if (!Array.isArray(artifacts)) throw new Error("Input must be an artifact array or { artifacts: [...] }.");

const unresolved = [];
for (const artifact of artifacts) {
  for (const field of metadataFields) {
    if (typeof artifact[field] === "string") artifact[field] = ascii(translateKnown(artifact[field]));
  }
  if (typeof artifact.content === "string") artifact.content = translateKnown(artifact.content);
  if (asianScript.test(artifact.content || "")) unresolved.push(artifact.slug);
}

await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ artifacts: artifacts.length, unresolvedAsianLanguageBodies: unresolved }, null, 2));
if (unresolved.length) process.exitCode = 1;
