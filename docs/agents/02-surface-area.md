# Surface area

## Implemented today — routes and screens

| Surface | Source | Inputs/actions and effects |
| --- | --- | --- |
| `/` signed out | `src/app/page.tsx`, `src/components/sign-in.tsx` | Server session check; Google OAuth button with callback `/`; no demo rules. |
| `/` signed in | `src/components/app.tsx` | Fetches `/api/mable` and shows ordered questions without a last-run strip; creates, edits, deletes, toggles, reorders rules through POST commands. Header History opens previous runs. Polls every 3 seconds when queued/running, otherwise 30 seconds. |
| Expanded question card | `src/components/rule-editor.tsx` | Question, enabled flag, label/star/read/archive; saves rules in PostgreSQL. Label creation calls Gmail immediately, even if the question is later abandoned. |
| Settings dialog | `src/components/settings-panel.tsx` | Detects Vercel AI Gateway from `vck_`, otherwise TypeSafe, and saves/replaces one encrypted key; removes saved key; numeric threshold 50–100%; off/15m/1h/24h schedule; Google reconnect; sign-out; account deletion uses a Delete account button that morphs into Confirm delete; only the second activation submits. |
| Run dialog/status | `src/components/run-dialog.tsx`, `run-progress-view.tsx`, `use-run-stream.ts` | Selects new/latest (last 50 inbox emails)/recent/all, creates a persisted run, expands into live processed/total progress and one continuous two-column email/evaluation list. Uses SSE plus Gmail previews loaded near the visible rows; there are no result pages. Closing does not stop the worker. Stop/discard and retry are explicit commands. The latest run can be reopened. |
| Run history dialog | `src/components/run-history-dialog.tsx` | Header History button opens an authenticated, newest-first list of all previous runs, 20 per page; shows scope, date, status and counts. Selecting a row reopens the existing run review. Empty/loading/error states and keyboard close/focus behavior are present. |
| `/privacy` | `src/app/privacy/page.tsx` | Static disclosure and TypeSafe/Vercel policy links; no mutations. Attachment claim has a parser gap (known issues). |
| `/icon.svg`, static assets | `src/app/icon.svg`, `public/` | Icon and starter SVG files, no application state. |
| `GET /api/mable` | `src/app/api/mable/route.ts` | Authenticated account view plus Gmail user-label fetch; may create mailbox state and clear Google pause reason. This GET has persistence side effects. |
| `GET /api/mable/runs` | `src/app/api/mable/runs/route.ts` | Authenticated own-run history metadata, newest first, with zero-based `page` and `hasMore`; no email content or credentials. |
| `POST /api/mable` | `src/app/api/mable/route.ts` | Authenticated, same-origin command endpoint; detailed payloads/effects in `api-contracts.md`. |
| `GET /api/mable/runs/[id]/events` | `src/app/api/mable/runs/[id]/events/route.ts` | Authenticated, owned-run SSE snapshots containing every ordered run result; about 1s polling, 50s connections, no-store. Terminal snapshots close the stream. |
| `GET /api/mable/runs/[id]/messages/[messageId]` | Adjacent nested `messages/[messageId]/route.ts` | Authenticated run/message ownership check before loading Gmail subject/from/snippet without storing content. |
| `GET/POST /api/auth/[...all]` | `src/app/api/auth/[...all]/route.ts` | Better Auth delegates session, Google login/callback, and sign-out behavior; auth configuration in `src/lib/auth.ts`. |

Run now opens setup for a new run, or reopens an active/unfinished run from a Play icon beside the header user menu. It is hidden when there are no saved questions; otherwise it is disabled without a saved key, Gmail connection, or enabled question. Existing/unfinished-run conflicts are enforced server-side. The main API still returns the newest run for polling and resumption, but the questions page does not show its status. The separate History button lists previous runs for review. No separate settings/rules/run pages, webhook, public versioned API, or health endpoint is present.

## Implemented today — jobs and internal entry points

| Entry | Source | Behavior and writes |
| --- | --- | --- |
| `workerTick()` | `src/lib/worker.ts` | Schedules due accounts, claims one run, discovers candidate IDs, handles up to 20 ready messages, updates counters/checkpoints/retries. Calls Gmail and the selected evaluation provider. |
| Worker process | `src/worker/index.ts` | Repeats ticks with a 10-second sleep; SIGINT/SIGTERM stops the next cycle. Uses PostgreSQL as its durable queue. |
| `createRun`, `cancelRun`, `retryRun` | `src/lib/runs.ts` | User-scoped transactions; capture rules, reset cancelled new-mail checkpoint, or reset failed message attempts. |
| `decide`, `firstMatch` | `src/lib/decide.ts` | Model evaluation and ordered threshold decision; no direct DB/Gmail writes. |
| Gmail helpers | `src/lib/gmail.ts` | Token retrieval, label/list/history/message/profile requests, context extraction, one combined modify request per selected message. |

## Implemented today — package commands

`package.json` is the command contract: `pnpm dev` / `build` / `start` run Next.js; `pnpm worker` starts the separate processor; `pnpm db:generate` generates migrations and `pnpm db:migrate` applies them; `pnpm typecheck`, `lint`, `test`, and `test:integration` perform checks. See `operations.md` for prerequisites and the destructive integration-test boundary. There is no published CLI or SDK.

Successful question-edit saves animate back into the saved card using the returned rule: text and retained actions move back, editor-only controls fade out, and the drag handle returns. Failed saves stay expanded. Reduced motion skips the animation. Implemented in source; browser acceptance is not established.
