# Folder structure

## Implemented today

| Path | Ownership / put changes here |
| --- | --- |
| `AGENTS.md` | Agent entry point, KB index, operating protocol, project and Next rules. |
| `CLAUDE.md` | Imports `AGENTS.md`; keep one canonical instruction index. |
| `docs/agents/` | This knowledge base; current state plus curated issue/idea logs. |
| `src/app/` | Route pages, root layout, global CSS, icon; new route segments belong here. |
| `src/app/api/mable/route.ts` | Authenticated command/view contract; adjust validation and caller behavior together. |
| `src/app/api/mable/runs/[id]/` | Owned-run SSE events and message-preview read routes; no mutation or evaluation in these handlers. |
| `src/app/api/auth/[...all]/route.ts` | Better Auth delegation only. |
| `src/components/` | Account UI, question editor, settings and sign-in; live run dialog/review and stream hook, shared UI view types in `types.ts`. Private row/icon helpers stay in `app.tsx`. |
| `src/lib/` | Schema/DB, auth, credential crypto, run lifecycle, worker execution, Gmail and evaluation services; `run-progress.ts` owns bounded progress queries and `run-progress-types.ts` shares type-only response contracts. Shared processing logic belongs here, not in the process loop or browser. |
| `src/worker/` | Standalone Node entry point and shutdown/cycle behavior; not a child package. |
| `drizzle/` | Committed SQL migrations and generated `meta/` snapshot/journal; source schema is `src/lib/schema.ts`. |
| `tests/` | Focused `*.test.ts` unit tests selected by `pnpm test`. |
| `tests/integration/` | Real disposable-DB worker and credential API tests selected separately. |
| `public/` | Starter SVG static assets; app icon lives in `src/app/icon.svg`. |
| `.github/workflows/ci.yml` | Automated checks with disposable PostgreSQL. |
| Root configs | Manifest/lock, Next/TypeScript/ESLint/PostCSS/Drizzle/Vitest configs, Dockerfile, both Compose files, `.env.example`. |

`node_modules/`, `.next/`, `.env`, and TypeScript build-info files are local/generated/ignored material, not architecture or editable source. The pnpm workspace file contains build permissions, not a project list.

## Planned/aspirational — absent folders and placement policy

`apps/`, `packages/`, `src/pages/`, `src/hooks/`, `src/components/ui/`, `scripts/`, a standalone backend, and infrastructure/SDK packages are not present. Add a new top-level folder only for a concrete responsibility that existing boundaries cannot reasonably own; explain it here and update the index if needed. Do not scaffold speculative workspace layers.
