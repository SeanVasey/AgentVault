# Agent Vault

Agent Vault is a central repository for saving, editing, and organizing agents and skills. It is a full-stack React 19 application for creating, editing, organizing, importing, validating, and exporting Markdown agent documents, skill definitions, and repository instructions — optimized for Claude Code conventions while retaining compatibility labels for Codex and general-purpose LLM agents.

The application uses:

- [vinext](https://github.com/cloudflare/vinext) and Vite for the Next.js-compatible application runtime
- React 19 and TypeScript
- Cloudflare Workers and D1 for persistent library storage
- Drizzle ORM for typed database access
- `fflate` for client-side ZIP inspection
- Lucide React for interface icons
- Plain CSS design tokens and responsive layouts in `app/globals.css`

See [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md) for the full architecture map, data and persistence model, importer safeguards, and editing guidance.

## Prerequisites

- Node.js `>=22.13.0`
- npm, using the included `package-lock.json`
- Linux (or WSL) with `flock`, `curl`, `sha256sum`, and GNU `timeout` for the bounded Sites helper scripts

No API keys are required for local development.

## Quick Start

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

The local Cloudflare Vite runtime supplies a project-local D1 database. On the first request to `/api/artifacts`, the app creates its tables and loads the curated records from `lib/seed-artifacts.ts` if the database is empty.

## Validation

```bash
npm run lint
npm test
```

`npm test` performs a production build, validates the generated Worker artifact, checks rendered preview metadata, and runs the skill-import security tests.

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This project does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Project Shape

- `app/AgentVault.tsx` — primary client interface: navigation, editor, search, themes, import and export workflows, and API synchronization
- `app/globals.css` — complete visual system with light/dark design tokens
- `app/api/artifacts/route.ts` — CRUD API, validation, automatic seeding, and artifact version snapshots
- `app/chatgpt-auth.ts` — optional dispatch-owned ChatGPT sign-in helpers
- `lib/seed-artifacts.ts` — the pre-stocked agent, skill, and instruction library
- `lib/skill-import.ts` — safe Markdown and ZIP discovery, frontmatter parsing, path checks, file limits, and import normalization (security-sensitive)
- `db/schema.ts` — Drizzle models for artifacts and saved versions
- `db/index.ts` — D1 binding lookup and idempotent schema initialization
- `worker/index.ts` — Cloudflare Worker entry point and Vinext request handling
- `.openai/hosting.json` — Sites hosting metadata and the D1 binding name (`DB`)
- `examples/d1/` — an optional D1 example surface
- `drizzle.config.ts` — local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata and importer safeguards
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## License

MIT — see [`LICENSE`](LICENSE).

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
