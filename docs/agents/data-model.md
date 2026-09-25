# Data model

## Implemented today — source of truth

`src/lib/schema.ts` defines ten PostgreSQL tables; `drizzle/0000_naive_morph.sql` defines the initial schema and `0001_panoramic_fantastic_four.sql` adds `settings.key_provider`; `0002_sharp_firestar.sql` adds message positions, phases and probabilities, with dense legacy positions and phases backfilled from state. Generated snapshots/journal are in `drizzle/meta/`. `drizzle.config.ts` points generation at the schema and migration output at `drizzle/`.

| Entity/table | Fields and relationships that matter |
| --- | --- |
| `user` | Text ID, unique email, name, verified flag, image, timestamps; ownership root. |
| `session` | Unique token, expiry, IP/user agent, timestamps; user FK cascades. |
| `account` | Provider/account IDs with composite unique index; user FK, credential/token/expiry/scope fields; Better Auth manages OAuth encryption. |
| `verification` | ID, identifier, value, expiry/timestamps; no user FK and therefore not part of user-delete cascade. |
| `settings` | User PK/FK, one encrypted AI key, `keyProvider` (`typesafe` or `vercel`, default `typesafe`), threshold default 90, schedule default off, next due time, pause reason. |
| `rules` | ID, user FK, integer position, question, JSONB actions, enabled default true. Position has no DB uniqueness constraint. |
| `mailbox` | User PK/FK, connection time, nullable Gmail history ID. API initializes connection time from user creation time. |
| `runs` | ID/user FK, scope/status, immutable rule snapshot and threshold, discovered flag, counters, error, lease and timestamps. |
| `run_messages` | ID/run FK, Gmail ID, stable discovery position, processing state/phase, nullable probability array in snapshotted rule order, nullable saved actions, attempts/next retry; unique `(run_id, message_id)`. |
| `new_mail_seen` | Composite PK `(user_id, message_id)`; user FK, terminal new-mail deduplication. |

User-linked tables cascade on user deletion; run-message rows cascade through runs. No message body, subject, attachment, vector, or provider-response table is present. IDs/actions/configuration, per-question probabilities, and user-auth metadata are persisted. Legacy messages have null probabilities; review does not invent old scores. `verification` is not user-linked; do not claim deleting a user deletes every possible auth artifact.

## Implemented today — invariants and lifecycle

`RuleActions` is `{ label?: string; star?: true; read?: true; archive?: true }`. API validation requires an action, validates selected Gmail label IDs, and checks question length/threshold/schedule. Database text/JSON columns do not independently enforce all application enums or validation.

Runs use scopes `new | latest | recent | all` and statuses `queued | running | complete | failed | cancelled | paused`. Creation snapshots enabled questions ordered by position and the current threshold. It blocks queued/running and unresolved failed/paused runs for that user under an advisory lock. This is application enforcement, not a partial unique DB constraint.

Run messages move from `pending` to `decided` (actions saved), then `done`; unmatched/non-inbox/missing messages become `skipped`; repeated errors become `failed`. Retry resets failed messages to pending with zero attempts, retaining any saved actions. A saved decision bypasses reevaluation, including when a previous archive removed INBOX.

Per-message phases distinguish waiting, loading, evaluating, applying, done, no_match, not_in_inbox, unavailable, retrying, failed and blocked. Scores and chosen actions are saved together before Gmail modification; no-match scores also persist. Retry retains saved scores/actions. These are structured evaluation results, not model reasoning or streamed tokens.

Discovery preserves previously inserted positions after an interruption, skips duplicate IDs, and appends new candidates densely. Discovery inserts candidates before committing the new-mail history checkpoint and `discovered` flag. Seen IDs are written for terminal new-mail processing, not failed attempts. Cancelling new scope clears history for future reconciliation. Latest/recent/all scopes do not consult or populate the new-mail seen set. Latest captures at most 50 inbox messages in one insertion batch; interrupted discovery reuses those rows without adding new arrivals. Scope is a text column, so the added value needs no migration.

Counters count terminal rows: processed = done + skipped + failed; changed = done. They represent completed mutation requests, not a diff proving Gmail labels actually changed. Stored run counters refresh at batch/end boundaries. Live review derives counts directly from message rows each second, so it reflects individual completions without waiting for a batch. Total is provisional until `discovered` is true.

Existing encrypted keys are backfilled to `typesafe` by the additive migration. Provider and key are saved atomically. Each worker claim reads the pair once, so a replacement affects later claims/retries; provider credentials are not snapshotted in a run. Already-persisted message actions are reused without reevaluation.

## Planned/aspirational

Retention/cleanup jobs, extra queue indexes, DB enum/check constraints, and migration rollback tooling are not present. Any schema change requires a committed generated migration and a review of retry/deletion behavior.
