# Integrations

## Implemented today

| Integration | Source/auth | Behavior and failure boundary |
| --- | --- | --- |
| Google OAuth / Better Auth | `src/lib/auth.ts`, `auth-client.ts`, auth route; Google client env vars and Better Auth secret | Requests `gmail.modify`, offline access, account selection/consent; OAuth-token encryption enabled. `googleToken()` resolves a linked Google account and delegates access-token retrieval/refresh to Better Auth. |
| Gmail REST | `src/lib/gmail.ts`; bearer token; base `https://gmail.googleapis.com/gmail/v1/users/me` | Profile, user labels, label creation, message/history pagination, full message retrieval, metadata previews and modification. Requests use no-store and a default 30-second timeout. |
| Google revocation | `src/app/api/mable/route.ts`; token from `googleToken()` | POST to OAuth revoke URL with five-second timeout before local user deletion. Errors are ignored and HTTP success is not checked; remote revocation is best-effort. |
| TypeSafe AI / Jev | `src/lib/decide.ts`; per-user decrypted key | `experimental_evaluate`, `evaluationModel("jev-latest")`, boolean `rule_0...` questions, 30-second abort signal. Validates every probability then returns the first index meeting threshold (or -1) plus the complete validated probability array. |
| Vercel AI Gateway / Jev | `src/lib/decide.ts`; `createGateway({ apiKey })` using the selected user’s decrypted key | `evaluationModel("typesafe-ai/jev")` through the installed AI SDK Gateway integration; same boolean evaluation, 30-second abort and validation as direct TypeSafe. No shared environment credential or cross-provider fallback. |
| PostgreSQL | `src/lib/db.ts`, `schema.ts`; `DATABASE_URL` | Durable identity/configuration/queue/checkpoint state, transactions/advisory locks; no external queue service. |

Gateway evaluation model/API shape was checked against the installed AI SDK 7 types and [Vercel’s evaluation documentation](https://vercel.com/docs/ai-gateway/getting-started/evaluation). Authenticated model discovery and live evaluation were not verified without a user-supplied Gateway key.

Gmail inbox/history requests paginate in pages of up to 500. The manual last-50 scope requests at most 50 inbox IDs, follows short pages only until 50 unique IDs or exhaustion, and stops before fetching older pages once full. Inbox discovery is completed before mutations; it gathers all IDs in memory. History considers `messageAdded` events; processing checks current INBOX membership unless reusing saved actions. User-label creation first searches for a case-insensitive existing name.

Review previews use [Gmail messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) with `format=metadata` and Subject/From headers; the response’s snippet supplies the short excerpt. The preview endpoint does not fetch MIME bodies or attachments and does not store the result.

One modify request adds the chosen label and/or STARRED, removes UNREAD and/or INBOX. It does not delete a message or operate on an entire thread. No remote images or separately referenced attachment blobs are fetched by the context parser.

Model context contains from/to/subject/date headers, account email (`owner`), and normalized body capped at 20,000 characters. MIME recursion accepts plain and HTML text (HTML tags removed by regex); it does not implement robust attachment exclusion or MIME alternative selection. See K1.

Gmail 403 quota/rate-limit reasons become 429; other 401/403 failures lead to reconnect handling. Message 404 becomes skipped; history 404 falls back to inbox reconciliation. Non-auth message errors retry up to three attempts (4s then 8s stored delays; the outer worker loop can delay longer). Discovery errors fail the run without the per-message retry loop. Evaluation provider errors exposing statusCode 401/403 pause for key replacement; malformed answers never select an action.

Unit tests mock fetch/auth/DB or the evaluation SDK; worker integration tests mock Gmail and evaluations while exercising PostgreSQL. These tests do not verify actual OAuth refresh, quota handling under live load, model accuracy, or provider availability.

Implemented today: `detectKeyProvider` is shared by Settings and the API. After trimming, a case-sensitive `vck_` prefix selects Vercel AI Gateway; every other key selects TypeSafe, per the explicit product decision. This detects routing, not credential validity. Existing stored credentials retain their provider until replaced. No probing or fallback requests are made.

## Planned/aspirational

The README's public Google rollout prerequisites and DNS/host statements are operational intent/unverified external state. Refresh provider requirements and deployed evidence when working on public launch; this KB does not certify them. No other mailbox or evaluation route is implemented; Gateway supports Jev here, not arbitrary chat-model selection.
