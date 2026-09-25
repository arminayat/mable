# Architecture and stack

## Implemented today

Browser → Next.js server page/Better Auth → client account UI → `/api/mable` → shared PostgreSQL. A separate Node worker polls the same DB and calls Gmail and TypeSafe directly or through Vercel AI Gateway. There is no Redis, broker, external scheduler, Server Action, WebSocket, or separate backend project.

| Area | Source-backed version/configuration |
| --- | --- |
| Runtime/package manager | Node 22 in Docker/CI; `pnpm@11.0.5` in `package.json`; one lockfile importer. No `engines` field. |
| UI/framework | Next 16.3.6, React/React DOM 19.2.8; App Router in `src/app`; default `next.config.ts`. |
| Styling | HeroUI React/styles 3.2.6, Lucide 1.47.0, Tailwind/PostCSS 4.3.3 locked; custom global CSS. |
| Auth/storage | Better Auth and Drizzle adapter 1.7.5; Drizzle ORM 0.45.3; `pg` 8.23.0; PostgreSQL 17 images in Compose/CI. |
| Evaluation | `ai` 7.0.112, `@ai-sdk/typesafe-ai` 3.0.5, Zod 4.6.5; experimental evaluation API, `jev-latest`. |
| Tooling | TypeScript 5.9.3 and ESLint 9.39.5 locked; Vitest 5.0.1, tsx 4.23.15, drizzle-kit 0.31.11. |

Versions above describe the manifest/lockfile, not an independently verified deployed runtime.

`src/lib/db.ts` creates a pg pool and Drizzle handle; development reuses the pool through `globalThis`. `schema.ts` owns auth records, settings, rules, mailbox checkpoint, runs, run messages, and seen-message IDs. The initial migration, `0001` provider-column migration, and `0002` message-position/phase/probabilities migration match these tables; details in `data-model.md`.

Server modules hold credentials and DB/provider access. Client components own local form/dialog/view state, fetch JSON, and subscribe to run-progress SSE; `types.ts` uses type-only imports from the schema. No global state library or browser persistence is present.

Run review reads durable per-message phases, probabilities and actions through `run-progress.ts`. The SSE route polls PostgreSQL every second, sends changed snapshots containing all ordered result rows and aggregate counts, heartbeats unchanged snapshots, and reconnects after 50 seconds to reauthorize. There is no in-memory event broker. The client keeps one continuous list and fetches Gmail metadata previews as rows approach the scroll viewport, with no-store responses; previews remain transient client state and are not persisted.

Run snapshots isolate in-flight decisions from subsequent rule/threshold edits. Rule creation/reordering and run creation/retry use PostgreSQL transaction advisory locks keyed by user ID. The worker claims with `FOR UPDATE SKIP LOCKED`, uses a ten-minute lease and minute heartbeat, and retains decisions across retries. The supported deployment described in README uses one worker; there is no lease-owner fencing token.

Six application environment variables cover DB, auth URL/secret, Google client ID/secret, and credential encryption. AI provider keys are per-user encrypted database records paired with `keyProvider`, not environment variables. See `operations.md` and `security-access.md` for exact boundaries.

GitHub Actions runs type/lint/unit/integration/build checks with PostgreSQL and mocked external integrations. Docker builds one image reused for web and worker. Compose has local and Coolify variants; no deploy workflow or infrastructure provisioning code is present.

## Planned/aspirational

Multi-worker operational guarantees, monitoring/backups, and public-hosted acceptance are not implemented/established by the existing configuration. Proposed changes belong in the improvement backlog.
