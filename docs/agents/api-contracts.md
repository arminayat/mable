# API contracts

## Implemented today — shared boundary

Source: `src/app/api/mable/route.ts`. Both methods require a Better Auth session (`401 { error: "Unauthorized" }` otherwise). POST additionally requires the exact `Origin` matching `BETTER_AUTH_URL`'s origin (fallback: request URL); absent/mismatched Origin returns 403. JSON is validated by a Zod discriminated union on `type`; malformed JSON becomes a 400 validation error.

All user ownership comes from the session, never a supplied user ID. Routes are unversioned. There is no OpenAPI spec or externally supported SDK contract.

## Implemented today — GET `/api/mable`

Response: `{ rules, settings: { threshold, schedule, hasKey, pauseReason }, run, labels, gmailConnected }`.

- `rules`: full own DB rows ordered by position. `run`: newest full run row or null; dates serialize as strings. The narrower UI shapes are in `src/components/types.ts`.
- `settings`: defaults to 90/off/false/null without a stored row; never returns `keyCipher` or plaintext credentials.
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
| `key.set` | `key` trimmed 10–500 chars | Encrypt/upsert and clear pause; `{ ok: true }`. No provider-key validation request. |
| `key.remove` | None | Clear saved key, turn schedule off, clear next due; `{ ok: true }`. Does not cancel an already running run. |
| `label.create` | `name` trimmed 1–225 chars | Return existing case-insensitive name match or create Gmail user label; `{ id, name }`. |
| `run.create` | `scope: new/recent/all` | Require saved key, enabled rule, no active/unresolved run; persist snapshot and return run row. Gmail availability is checked during execution. |
| `run.cancel` | `id` | Cancel own queued/running/paused/failed run, clear new-mail checkpoint if applicable; return run row. |
| `run.retry` | `id` | Requeue own failed/paused run if no active run; reset failed message attempts, keep saved decisions; return run row. |
| `account.delete` | None | Best-effort Google revocation, delete user/cascading rows; `{ ok: true }`. `DELETE` confirmation text is a UI gate, not an API field. |

Caught `GmailError` uses its status and safe message (certain Gmail quota 403s are normalized to 429). `PublicError` uses its message with 400; other caught errors become `400 { error: "Request failed" }`. All successful commands return 200. Identity/origin setup failures outside the command try block are not covered by that error envelope.

## Implemented today — auth delegation

`src/app/api/auth/[...all]/route.ts` exports Better Auth's GET/POST handler. Google callback is `/api/auth/callback/google`; app sign-in uses social provider `google` and callback `/`. Auth sessions/token renewal are library-managed; do not invent custom password-login or auth endpoint behavior beyond this configuration.
