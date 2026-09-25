# Integrations

## Implemented today

| Integration | Source/auth | Behavior and failure boundary |
| --- | --- | --- |
| Google OAuth / Better Auth | `src/lib/auth.ts`, `auth-client.ts`, auth route; Google client env vars and Better Auth secret | Requests `gmail.modify`, offline access, account selection/consent; OAuth-token encryption enabled. `googleToken()` resolves a linked Google account and delegates access-token retrieval/refresh to Better Auth. |
| Gmail REST | `src/lib/gmail.ts`; bearer token; base `https://gmail.googleapis.com/gmail/v1/users/me` | Profile, user labels, label creation, message/history pagination, full message retrieval and modification. Requests use no-store and a default 30-second timeout. |
| Google revocation | `src/app/api/mable/route.ts`; token from `googleToken()` | POST to OAuth revoke URL with five-second timeout before local user deletion. Errors are ignored and HTTP success is not checked; remote revocation is best-effort. |
| TypeSafe AI / Jev | `src/lib/decide.ts`; per-user decrypted key | `experimental_evaluate`, `evaluationModel("jev-latest")`, boolean `rule_0...` questions, 30-second abort signal. Validates every probability then returns first index meeting threshold, or -1. |
| PostgreSQL | `src/lib/db.ts`, `schema.ts`; `DATABASE_URL` | Durable identity/configuration/queue/checkpoint state, transactions/advisory locks; no external queue service. |

Gmail inbox/history requests paginate in pages of up to 500. Inbox discovery is completed before mutations; it gathers all IDs in memory. History considers `messageAdded` events; processing checks current INBOX membership unless reusing saved actions. User-label creation first searches for a case-insensitive existing name.

One modify request adds the chosen label and/or STARRED, removes UNREAD and/or INBOX. It does not delete a message or operate on an entire thread. No remote images or separately referenced attachment blobs are fetched by the context parser.

Model context contains from/to/subject/date headers, account email (`owner`), and normalized body capped at 20,000 characters. MIME recursion accepts plain and HTML text (HTML tags removed by regex); it does not implement robust attachment exclusion or MIME alternative selection. See K1.

Gmail 403 quota/rate-limit reasons become 429; other 401/403 failures lead to reconnect handling. Message 404 becomes skipped; history 404 falls back to inbox reconciliation. Non-auth message errors retry up to three attempts (4s then 8s stored delays; the outer worker loop can delay longer). Discovery errors fail the run without the per-message retry loop. TypeSafe errors exposing statusCode 401/403 pause for key replacement; malformed answers never select an action.

Unit tests mock fetch/auth/DB or the evaluation SDK; worker integration tests mock Gmail and TypeSafe while exercising PostgreSQL. These tests do not verify actual OAuth refresh, quota handling under live load, model accuracy, or provider availability.

## Planned/aspirational

The README's public Google rollout prerequisites and DNS/host statements are operational intent/unverified external state. Refresh provider requirements and deployed evidence when working on public launch; this KB does not certify them. No other mailbox or model provider is implemented.
