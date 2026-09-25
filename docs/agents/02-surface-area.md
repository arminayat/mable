# Surface area

## Implemented today — routes and screens

| Surface | Source | Inputs/actions and effects |
| --- | --- | --- |
| `/` signed out | `src/app/page.tsx`, `src/components/sign-in.tsx` | Server session check; Google OAuth button with callback `/`; no demo rules. |
| `/` signed in | `src/components/app.tsx` | Fetches `/api/mable`, shows ordered questions and latest run; creates, edits, deletes, toggles, reorders rules through POST commands. Polls every 3 seconds when queued/running, otherwise 30 seconds. |
| Question dialog | `src/components/rule-editor.tsx` | Question, enabled flag, label/star/read/archive; saves rules in PostgreSQL. Label creation calls Gmail immediately, even if the question is later abandoned. |
| Settings dialog | `src/components/settings-panel.tsx` | Saves/removes encrypted key; threshold 50–100; off/15m/1h/24h schedule; Google reconnect; sign-out; account deletion gated by typing `DELETE` in the UI. |
| Run dialog/status | `src/components/app.tsx` | Selects new/recent/all, creates a persisted run; displays processed/changed/skipped/failed counters and error. Cancel/discard and retry mutate the run. Gmail actions are performed later by the worker. |
| `/privacy` | `src/app/privacy/page.tsx` | Static disclosure and TypeSafe policy link; no mutations. Attachment claim has a parser gap (known issues). |
| `/icon.svg`, static assets | `src/app/icon.svg`, `public/` | Icon and starter SVG files, no application state. |
| `GET /api/mable` | `src/app/api/mable/route.ts` | Authenticated account view plus Gmail user-label fetch; may create mailbox state and clear Google pause reason. This GET has persistence side effects. |
| `POST /api/mable` | `src/app/api/mable/route.ts` | Authenticated, same-origin command endpoint; detailed payloads/effects in `api-contracts.md`. |
| `GET/POST /api/auth/[...all]` | `src/app/api/auth/[...all]/route.ts` | Better Auth delegates session, Google login/callback, and sign-out behavior; auth configuration in `src/lib/auth.ts`. |

Run now opens the existing run modal from a Play icon beside the header user menu. It is hidden when there are no saved questions; otherwise it is disabled without a saved key, Gmail connection, or enabled question. Existing/unfinished-run conflicts are enforced server-side. Only the newest run is returned/displayed. No separate settings/rules/run pages, webhook, public versioned API, or health endpoint is present.

## Implemented today — jobs and internal entry points

| Entry | Source | Behavior and writes |
| --- | --- | --- |
| `workerTick()` | `src/lib/worker.ts` | Schedules due accounts, claims one run, discovers candidate IDs, handles up to 20 ready messages, updates counters/checkpoints/retries. Calls Gmail and TypeSafe. |
| Worker process | `src/worker/index.ts` | Repeats ticks with a 10-second sleep; SIGINT/SIGTERM stops the next cycle. Uses PostgreSQL as its durable queue. |
| `createRun`, `cancelRun`, `retryRun` | `src/lib/runs.ts` | User-scoped transactions; capture rules, reset cancelled new-mail checkpoint, or reset failed message attempts. |
| `decide`, `firstMatch` | `src/lib/decide.ts` | Model evaluation and ordered threshold decision; no direct DB/Gmail writes. |
| Gmail helpers | `src/lib/gmail.ts` | Token retrieval, label/list/history/message/profile requests, context extraction, one combined modify request per selected message. |

## Implemented today — package commands

`package.json` is the command contract: `pnpm dev` / `build` / `start` run Next.js; `pnpm worker` starts the separate processor; `pnpm db:generate` generates migrations and `pnpm db:migrate` applies them; `pnpm typecheck`, `lint`, `test`, and `test:integration` perform checks. See `operations.md` for prerequisites and the destructive integration-test boundary. There is no published CLI or SDK.
