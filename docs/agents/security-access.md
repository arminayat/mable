# Security and access

## Implemented today

Sources: `src/lib/auth.ts`, `crypto.ts`, `schema.ts`, `gmail.ts`, API route, worker and `.gitignore`/`.dockerignore`.

- Google is the only configured social provider. Better Auth stores database sessions; there is no team/org, role/admin, password-login UI, application allowlist, or separate worker credential endpoint.
- API identity comes from the session. Reads and mutations select the current user's records; run retries/cancellation also verify ownership. POST requires matching Origin. This does not replace session authorization.
- Better Auth has `encryptOAuthTokens: true`. TypeSafe keys use application AES-256-GCM with a random 12-byte IV and authentication tag, keyed by a 32-byte decoded environment key. API responses expose only `hasKey`.
- Client code only imports schema types; Gmail calls, decrypting keys, and model evaluation execute on the server/worker. No `server-only` import guard is installed in these modules, so preserve the boundary deliberately.
- Normal model context leaves the application for TypeSafe with sender/recipient/subject/date, account email, and up to 20,000 body characters. PostgreSQL has no email-content columns. MIME attachment exclusion is incomplete; see K1.
- Removing the model key disables future scheduling but does not cancel a currently executing run that has already loaded the key. Account deletion removes the user and user/run-linked rows; verification records lack a user FK. Google revocation is best-effort.
- `.env` is ignored and excluded from Docker context; `.env.example` is tracked. Do not write real keys, OAuth tokens, email content, or credential-bearing logs into source, KB, tests, or tool output. Keep secrets stable alongside persistent DB state.
- Cancellation/deletion checks cannot retract an already-issued external mutation. Saved decisions permit retrying the same label changes; they do not give transactional rollback across PostgreSQL and Gmail.

## Planned/aspirational

Application-level rate limiting, audited operator access, rotation/migration tooling for stored credentials, content-retention automation, and deployment secret/backup validation are not present. Public OAuth verification and operator readiness are external tasks, not facts proved by the README or privacy text.
