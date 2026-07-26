# Agent Vault — Coding Agent Handoff

This repository contains the complete editable source for Agent Vault. Generated dependencies, local database state, and build output are intentionally excluded so the project can be moved cleanly between coding environments.

## What This Project Is

Agent Vault is a full-stack React 19 application for creating, editing, organizing, importing, validating, and exporting Markdown agent documents, skill definitions, and repository instructions. It is optimized for Claude Code conventions while retaining compatibility labels for Codex and general-purpose LLM agents.

The application uses:

- Vinext and Vite for the Next.js-compatible application runtime
- React 19 and TypeScript
- Cloudflare Workers and D1 for persistent library storage
- Drizzle ORM for typed database access
- `fflate` for client-side ZIP inspection
- Lucide React for interface icons
- Plain CSS design tokens and responsive layouts in `app/globals.css`

## Recommended Environment

- Node.js `22.13.0` or newer
- npm, using the included `package-lock.json`
- Linux or WSL is the most compatible environment
- `curl`, `flock`, `sha256sum`, and GNU `timeout` are required by the repository's bounded Sites helper scripts

No API keys are required for local development.

## Quick Start

```bash
git clone https://github.com/SeanVasey/AgentVault.git
cd AgentVault
node --version
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

The local Cloudflare Vite runtime supplies a project-local D1 database. On the first request to `/api/artifacts`, the app creates its tables and loads the curated records from `lib/seed-artifacts.ts` if the database is empty.

Inter and Manrope are loaded from Google Fonts by `app/globals.css`; an offline environment uses the declared system-font fallbacks.

## Validation

Run these after making changes:

```bash
npm run lint
npm test
```

`npm test` performs a production build, validates the generated Worker artifact, checks rendered preview metadata, and runs the skill-import security tests.

The convenience commands `npm run install:ci` and `npm run build` use Linux-specific safety wrappers. In a non-Linux environment, use WSL or a Linux container for parity with deployment. A plain `npm ci` is sufficient for a normal local dependency install.

## Architecture Map

- `app/AgentVault.tsx` — primary client interface, navigation, editor, search, themes, import workflow, export workflow, and API synchronization
- `app/globals.css` — complete visual system, light/dark design tokens, typography, responsive layout, glass surfaces, animation, and component styling
- `app/api/artifacts/route.ts` — CRUD API, validation, automatic seeding, and artifact version snapshots
- `lib/seed-artifacts.ts` — the pre-stocked agent, skill, and instruction library
- `lib/skill-import.ts` — safe Markdown and ZIP discovery, frontmatter parsing, path checks, file limits, and import normalization
- `lib/types.ts` — shared artifact models, path helpers, and slug generation
- `db/schema.ts` — Drizzle models for artifacts and saved versions
- `db/index.ts` — D1 binding lookup and idempotent schema initialization
- `worker/index.ts` — Cloudflare Worker entry point and Vinext request handling
- `vite.config.ts` — Vinext and Cloudflare local-runtime configuration
- `.openai/hosting.json` — current Sites hosting metadata and the D1 binding name
- `tests/skill-import.test.ts` — importer correctness and archive-safety tests
- `tests/rendered-html.test.mjs` — rendered development-preview metadata test

## Data and Persistence

The browser receives the 20-document bundled seed library immediately, then synchronizes with `/api/artifacts`. Successful create, edit, favorite, delete, and import operations persist to the D1 database through that API. Editing `lib/seed-artifacts.ts` changes newly initialized databases but does not overwrite an existing populated D1 database.

The theme preference is the only value stored in browser `localStorage`. Library content is not stored in `localStorage`.

The API expects a D1 binding named `DB`. Keep that binding name unless you also update `db/index.ts`, `worker/index.ts`, `vite.config.ts`, and `.openai/hosting.json` together.

The `project_id` inside `.openai/hosting.json` is a placeholder; only the `d1` binding name is consumed by the code. A hosting project supplies its own metadata through its own Sites or deployment workflow. Never add credentials to the repository or commit `.env` files.

The API does not partition records by user. Everyone permitted by the hosting access policy shares the same library, so preserve or strengthen the private hosting policy unless application-level authorization is added.

This repository contains all bundled documents but does not contain records created only in the live production D1 database. Export that database separately if production-only content must be migrated.

## Importer Behavior to Preserve

Agent Vault accepts individual Markdown files, folders of Markdown definitions, and ZIP archives. Canonical `SKILL.md` files and Markdown documents with appropriate leading frontmatter are discovered. Imports are stored as inert text and are never executed.

The parser intentionally rejects traversal paths, absolute paths, drive-prefixed paths, control characters, corrupt archives, oversized archives, excessive file counts, and oversized definitions. Duplicate slugs receive safe numbered variants. Definitions with incomplete skill frontmatter are imported as review drafts.

Treat the safeguards in `lib/skill-import.ts` and their corresponding tests as security-sensitive code.

## Visual System

The current design is derived from an editorial software-product reference:

- Dark mode: deep evergreen surfaces with chartreuse, mint, and icy-blue accents
- Light mode: warm ivory surfaces with forest-green typography and restrained lime highlights
- Display typography: Manrope
- Body and UI typography: Inter
- Semantic red is reserved for destructive actions and errors

Most visual changes should begin with the custom properties at the top of `app/globals.css`. The light theme overrides live under `html[data-theme="light"]`.

## Useful Editing Targets

- Change colors, type scale, glass opacity, or shadows in `app/globals.css`.
- Change interface structure and interactions in `app/AgentVault.tsx`.
- Add or revise the bundled library in `lib/seed-artifacts.ts`.
- Extend supported skill metadata in `lib/skill-import.ts`, then add tests.
- Change persistence behavior in `app/api/artifacts/route.ts` and `db/`.

Avoid replacing the project stack or removing the lockfile unless a migration is explicitly requested. Keep desktop and mobile layouts, both themes, keyboard access, focus styling, reduced-motion behavior, the Markdown editor, and ZIP-import safety intact.

## Suggested Prompt for Another Coding Agent

```text
Open AGENT_HANDOFF.md first, then inspect package.json, app/AgentVault.tsx,
app/globals.css, lib/skill-import.ts, and the existing tests. Preserve the
Vinext/Cloudflare D1 architecture, both themes, responsive behavior, and the
importer's security constraints. Make the requested adjustment with focused
edits, then run npm run lint and npm test. Explain any schema, binding, or
dependency change before making it.
```

## Production Notes

The production build is generated with:

```bash
npm run build
```

The deployer must provide a Cloudflare D1 binding named `DB`. For ChatGPT Sites, use the Sites lifecycle so the destination project supplies its own hosting metadata and binding values. For another Cloudflare deployment workflow, configure the equivalent Worker assets, image binding, and D1 database expected by `worker/index.ts`.
