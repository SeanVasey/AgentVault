# AgentVault Mega Library

AgentVault supports installing the normalized Mega Collection through its existing `/api/artifacts` API.

## Install

Keep the generated `agent-vault-library.json` outside Git history or download it from the collection archive, then run:

```bash
node scripts/normalize-agentvault-english.mjs --file ./agent-vault-library.json --out ./agent-vault-library.english.json
node scripts/install-agentvault-mega-library.mjs --file ./agent-vault-library.english.json --base-url http://localhost:3000 --dry-run
node scripts/install-agentvault-mega-library.mjs --file ./agent-vault-library.english.json --base-url http://localhost:3000 --conflict update
```

The installer preserves AgentVault's `agent`, `skill`, and `instruction` kinds, category, tags, targets, status, version, provenance content, and export path.

## English / ASCII maintenance

The normalization pass converts metadata fields to ASCII and contains explicit English translations for the Japanese and Korean C# community-index descriptions found in the 2026-08-11 collection. It reports any remaining CJK, Kana, or Hangul in Markdown bodies instead of applying destructive blind transliteration.

The two translated entries are:

- `github-copilot-csharp-ja`: `C# application development guidelines by @tsubakimoto`
- `github-copilot-csharp-ko`: `Code-writing rules for C# application development by @jgkim999`

Technical Unicode such as mathematical symbols, box drawing, and emoji in upstream Markdown is not automatically stripped because it may carry functional meaning. AgentVault display metadata is normalized separately.

## Why the 9 MB collection is not committed directly

The source collection is generated data containing thousands of third-party-derived records. Keeping it outside the application bundle prevents repository and deployment bloat while allowing the database-backed library to be installed or refreshed deterministically through the app's API.
