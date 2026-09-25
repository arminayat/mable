# API contracts

## Implemented today — shared boundary

Source: `src/app/api/mable/route.ts`. Both methods require a Better Auth session (`401 { error: "Unauthorized" }` otherwise). POST additionally requires the exact `Origin` matching `BETTER_AUTH_URL`'s origin (fallback: request URL); absent/mismatched Origin returns 403. JSON is validated by a Zod discriminated union on `type`; malformed JSON becomes a 400 validation error.

All user ownership comes from the session, never a supplied user ID. Routes are unversioned. There is no OpenAPI spec or externally supported SDK contract.

## Implemented today — GET `/api/mable`

Response: `{ rules, settings: { threshold, schedule, hasKey, keyProvider, pauseReason }, run, labels, gmailConnected }`.

- `rules`: full own DB rows ordered by position. `run`: newest full run row or null; dates serialize as strings. The narrower UI shapes are in `src/components/types.ts`.
- `settings`: defaults to 90/off/false/typesafe/null without a stored row; never returns `keyCipher` or plaintext credentials.
- `labels`: Gmail user labels `{ id, name }`; no system-label options.
- Successful Gmail access can create mailbox state and clear a `Reconnect Google` pause reason. Gmail 401/403 marks disconnected; other label errors are hidden (known issue K3).
- Session/DB failures outside the Gmail catch have no custom JSON error wrapper.

## Implemented today — POST `/api/mable`

Every payload includes `type`. Actions use `{ label?: string, star?: true, read?: true, archive?: true }`, require at least one action, and verify a supplied label against Gmail.

| Type | Additional fields | Effect / successful JSON |
| --- | --- | --- |
| `rule.create` | `question` trimmed 3–500 chars, `actions`, `enabled` boolean | Append under user advisory lock; returns an array containing the inserted rule. |
| `rule.update` | Same + `id` string | Update own rule; returns one rule; missing/not-owned rule gives `Rule not found`. |
| `rule.delete` | `id` | Delete matching own rule; `{ ok: true }` even if no match. |
| `rule.reorder` | `ids: string[]` | Must contain every own rule exactly once; transaction writes positions; `{ ok: true }`. |
| `settings.update` | `threshold` integer 50–100; `schedule: off/15m/1h/24h` | Upsert and compute next due time (null for off); `{ ok: true }`. |
| `key.set` | `key` trimmed 10–500 chars; provider inferred server-side (`vck_` → `vercel`, otherwise `typesafe`); legacy `provider` fields are ignored | Atomically encrypt/upsert key and provider, replacing the previous credential, and clear pause; `{ ok: true }`. No provider-key validation request. |
| `key.remove` | None | Clear saved key, turn schedule off, clear next due; `{ ok: true }`. Does not cancel an already running run. |
| `label.create` | `name` trimmed 1–225 chars | Return existing case-insensitive name match or create Gmail user label; `{ id, name }`. |
| `run.create` | `scope: new/latest/recent/all` | Require saved key, enabled rule, no active/unresolved run; persist snapshot and return run row. `latest` snapshots up to 50 inbox messages in Gmail listing order. Gmail availability is checked during execution. |
| `run.cancel` | `id` | Cancel own queued/running/paused/failed run, clear new-mail checkpoint if applicable; return run row. |
| `run.retry` | `id` | Requeue own failed/paused run if no active run; reset failed message attempts, keep saved decisions; return run row. |
| `account.delete` | None | Best-effort Google revocation, delete user/cascading rows; `{ ok: true }`. The two-step Delete/Confirm delete button is a UI gate, not an API field. |

Caught `GmailError` uses its status and safe message (certain Gmail quota 403s are normalized to 429). `PublicError` uses its message with 400; other caught errors become `400 { error: "Request failed" }`. All successful commands return 200. Identity/origin setup failures outside the command try block are not covered by that error envelope.

## Implemented today — run review reads

`GET /api/mable/runs` requires a session (401 otherwise) and lists only the signed-in user's runs. Optional `page` is a nonnegative zero-based integer (400 for invalid values); the response is `{ runs, page, hasMore }`, with at most 20 runs per page, newest first by creation time and ID. Each run contains only `id`, `scope`, `status`, `processed`, `changed`, `skipped`, `failed`, `createdAt`, and `updatedAt`. It uses `private, no-store`; snapshots, credentials, and email content are excluded. The history dialog uses this list and passes a chosen ID to the existing review endpoint.

`GET /api/mable/runs/[id]/events` requires a session and an owned run (401/404 otherwise). `event: progress` carries `{ id, status, discovered, error, total, processed, changed, skipped, failed, threshold, rules, items }`; `items` contains every ordered result with ID, Gmail ID, position, state, phase, nullable probabilities and nullable actions. Counts come from those rows; no credentials or email content is streamed. Snapshotted questions/threshold explain the original decision even after rule edits. This endpoint has no result-page parameter; the separate `/api/mable/runs` history list remains paginated.

The Node route samples DB state every second, emits changes plus heartbeat comments, and closes at a terminal state or after 50 seconds. The client closes on terminal progress and otherwise reconnects for a fresh authorized snapshot. Missing runs emit `unavailable`; recoverable stream failures emit `interrupted`. Responses use `text/event-stream`, `private, no-store, no-transform`, and `X-Accel-Buffering: no`. Disconnects abort the polling delay. Intermediate phases faster than the sampling interval may not appear, but saved scores/actions remain reviewable.

`GET /api/mable/runs/[id]/messages/[messageId]` requires a session and verifies the message belongs to the owned run before calling Gmail. It returns `{ subject, from, excerpt }` from Gmail metadata, with excerpt capped at 600 characters and `private, no-store`. No email content is written to PostgreSQL. Missing membership returns 404; Gmail 404 uses safe unavailable copy, other provider failures use safe load-error copy and provider status (or 502). A disconnected client aborts the Gmail preview request. These previews reflect Gmail at review time, not a stored historical copy.

## Implemented today — auth delegation

`src/app/api/auth/[...all]/route.ts` exports Better Auth's GET/POST handler. Google callback is `/api/auth/callback/google`; app sign-in uses social provider `google` and callback `/`. Auth sessions/token renewal are library-managed; do not invent custom password-login or auth endpoint behavior beyond this configuration.
