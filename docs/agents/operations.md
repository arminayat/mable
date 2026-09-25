# Operations

## Implemented today — configuration

Source: `.env.example`, `package.json`, `src/lib/auth.ts`, `db.ts`, `crypto.ts`, Docker/Compose and CI files. The following are configuration names, never values from a real account:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | pg connection and migration target. Drizzle config has a local fallback; explicitly select the intended database. |
| `BETTER_AUTH_URL` | Public auth origin and POST origin validation; localhost for development. |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption; preserve across deployments. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth web client. |
| `CREDENTIAL_ENCRYPTION_KEY` | Base64 encoding of exactly 32 bytes for stored AI provider keys; preserve with database backups. |

`NODE_ENV` controls development pool reuse. No shared TypeSafe or Gateway environment key is used: `createGateway` receives the selected user’s decrypted key explicitly. The worker, migrate and integration scripts use `--env-file-if-exists=.env`; Next loads its environment through the framework. `db:generate` invokes drizzle-kit directly without that Node env-file wrapper.

## Implemented today — local/deployment commands

Local: configure `.env` from `.env.example` and a dedicated DB, install with `pnpm install`, run `pnpm db:migrate`, then run `pnpm dev` and `pnpm worker` in separate terminals. Google callback is `<BETTER_AUTH_URL>/api/auth/callback/google`; Google provisioning is external. Key/active questions are configured through the UI.

`pnpm dev` defaults to port 3014. Set `BETTER_AUTH_URL=http://localhost:3014` in local `.env`, or run `BETTER_AUTH_URL=http://localhost:3014 pnpm dev`. This sets the auth origin for that process without editing `.env`; The existing Mable Google OAuth client has the localhost:3014 callback saved alongside its production callback. Local `.env` uses the existing credentials retrieved from Mable’s Coolify environment; keep them out of Git. Starting the web server does not start the worker or establish database/provider readiness.

`pnpm stop` gracefully signals running Next.js servers whose working directory matches this project, regardless of port. It uses `ps` and `lsof` (macOS/Linux), leaves separate workers and other projects alone, and succeeds with a message if no server is running.

`docker compose up --build` starts PostgreSQL 17, a one-shot migrate service, web, and worker. It overrides the DB host to `db:5432`, exposes web on 3000, and exposes DB only at `127.0.0.1:5433`. Host processes must use port 5433 for that database (the env example instead shows 5432).

Docker uses Node 22 bookworm-slim and pnpm, installs the frozen lockfile and builds Next with placeholder auth build variables. The default image command is `pnpm start`; worker overrides to `pnpm worker`. Production credentials are runtime configuration, not the build placeholders.

`compose.coolify.yaml` uses the same image build for web/worker, PostgreSQL volume persistence, and restart policies. Web runs migrations before start; worker waits for the web health check. The health check fetches `/`, not a dedicated DB/worker readiness endpoint. Only DB health uses `pg_isready`.

Coolify configuration refers to `SERVICE_PASSWORD_MABLE_DB`, `SERVICE_HEX_64_MABLE_AUTH`, and `SERVICE_REALBASE64_32_MABLE_CREDENTIALS`, plus required Google client variables, with auth URL `https://mable.arminayat.dev`. Those placeholders describe intended host-provided values, not verified provisioned secrets. README gives service/domain setup steps. Run one worker replica as documented.

AI Gateway support requires applying `pnpm db:migrate` (migration `0001_panoramic_fantastic_four.sql`) before running the updated web and worker. No new environment variables or dependencies are required. Existing keys stay on TypeSafe; users can paste a `vck_` Vercel AI Gateway key as a replacement in Settings. Restart the worker after updating code.

The Last 50 emails run option adds the `latest` scope across UI/API/worker and needs no additional migration or environment variable. Restart the worker with the updated code before using it; automatic cleanup remains new-mail only.

Live run review requires migration `0002_sharp_firestar.sql` before updated web/worker processes start. It adds message position, phase and probability columns; old records get stable positions and phases, but no fabricated evaluation scores. No new environment variables or dependencies are needed. Restart the worker to enable per-message updates. Proxies must pass through event-stream responses without buffering; the route sends heartbeats and `X-Accel-Buffering: no`, and reconnects every 50 seconds. No worker means runs remain queued with an explicit waiting state.

## Implemented today — worker/recovery

- Each cycle schedules due, unpaused settings, then claims one oldest queued or expired-running run. `scheduleDue()` catches all `createRun()` failures and moves next due by the selected interval; no immediate creation retry or detailed error is saved.
- Claim lease is ten minutes, renewed every minute while executing. Each execution handles up to 20 ready messages, then requeues or completes/fails; next loop sleeps ten seconds. A restarted worker waits for a previous lease to expire before reclaiming it.
- Message retries persist attempts/actions/next due. After three failures the item fails; user Retry resets failed attempts. Authentication errors pause the run/settings; resolve Google/key access then Retry or Discard from UI.
- SIGINT/SIGTERM requests loop shutdown, not immediate abortion of an in-flight cycle. No explicit pool close is implemented in the worker entry point.
- Observability consists of persisted run counters/errors/pause reason and generic `Worker cycle failed` logging. There is no metrics/tracing/alert integration or worker health endpoint.

## Implemented today — checks and evidence boundaries

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` are repository checks. Unit coverage includes encryption, threshold/model validation, provider routing, Gmail helpers and icon morph geometry. CI also migrates disposable PostgreSQL and runs `pnpm test:integration` (worker and credential API cases: discovery, cutoff, dedupe, expired history, run serialization, saved decisions, batches, model failure/retry, cancellation, pause, user separation/deletion, provider routing, encrypted replacement, legacy defaults, secret-free views, streamed progress/replay, result pagination, preview ownership/content boundaries, stable rediscovery positions and disconnect cleanup).

**Integration tests delete all users in their selected database.** Explicitly configure a disposable database and test encryption key, migrate it, then run the integration command. Do not inherit a real deployment `.env`. No browser tests are authorized by default.

UI release verification (2026-09-25): typecheck, lint, unit tests (3 files, 10 tests), production build, and whitespace checks passed locally. Database integration is delegated to CI’s disposable PostgreSQL service; no local integration or browser tests were run. These UI changes require no new environment variables or database migrations. Release `c4393d7` passed GitHub CI `36112269704` including disposable-DB integration tests. Coolify application `mkqjvrpgpp12xc3ho1rk9mmt` deployed that revision successfully in deployment `rfhpz4cq7vvc1eg0bz9etumg` on 2026-09-25; DB and web became healthy, worker started, and the public homepage returned HTTP 200 with the updated welcome copy. Authenticated UI interactions were not browser-tested. The deployment dashboard is `https://coolify.arminayat.dev`; this release was triggered manually after pushing main.

AI-provider verification (2026-09-25): typecheck, lint, 24 unit tests, 16 credential API/worker integration tests against disposable PostgreSQL 18, and the production build passed. The `0000` → `0001` upgrade preserved an existing ciphertext and backfilled its provider to TypeSafe. The configured local database has been migrated; production has not been deployed or migrated for this feature. No browser or live Gateway evaluation was performed.

Current verification (2026-09-25): 35 unit and 25 disposable-PostgreSQL integration tests pass, including real SSE stream reads and the last-50 cap, small inboxes, bounded pagination, API acceptance and interrupted discovery with mocked external services. Typecheck, lint and production build pass. Migration `0002` was applied to the configured loopback local database. Production deployment/migration and browser/live Gmail/Jev acceptance have not been performed. No local worker process was running at this verification; start `pnpm worker` to process runs.

## Planned/aspirational

Backup/restore automation, deployment verification, public operator details, retention policies and live acceptance are not established here. Documentation changes require no migration, environment change, or deployment step; future runtime changes should report their own operational requirements.
