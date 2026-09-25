# Overview

## Implemented today

Mable is a private application package (`package.json`), distributed under MIT (`LICENSE`), that sorts Gmail messages using ordered natural-language questions. It is a single full-stack project with a separately started worker, not a monorepo. Sources: `src/app/page.tsx`, `src/lib/decide.ts`, `src/lib/runs.ts`, `src/lib/worker.ts`.

The end-to-end flow is:

1. Google sign-in establishes a Better Auth session and requests Gmail access. `/` serves either the welcome screen or the account UI.
2. The user pastes an API key; `vck_` selects Vercel AI Gateway and all other keys select TypeSafe, creates/enables/reorders questions, and chooses label/star/mark-read/archive actions. PostgreSQL stores configuration and encrypted credentials.
3. A manual `new`, `latest` (last 50 inbox emails), `recent` (30 days), or `all` inbox run captures enabled rules and threshold. Scheduled runs only use `new`; schedules default to off.
4. The worker discovers candidate IDs, persists work, sends message context to TypeSafe’s `jev-latest` directly or `typesafe-ai/jev` through Vercel AI Gateway, and chooses the first rule in order meeting the threshold (default 90%). It persists selected actions before modifying Gmail.
5. Starting a run expands the dialog into a live two-column review: Gmail subject/sender/snippet on the left, Jev probabilities and selected/applied actions on the right. An authenticated SSE connection sends DB-backed progress snapshots about once per second, with processed/total counts in the header. Results remain reviewable in 20-email pages after completion; the latest run can be reopened. Users can stop active runs or retry/discard failed and paused runs.

New-mail discovery uses Gmail history and per-user seen IDs. Historical runs intentionally reevaluate inbox messages with a fresh run snapshot. Actions affect individual messages, not entire threads. A saved decision can be retried without another model evaluation.

## Implemented today — scope and limits

- The UI/API/worker are real implementations; there is no demo dataset or placeholder backend. Unit and integration suites substitute Google/evaluation calls with mocks.
- Local storage is PostgreSQL; browser state is transient React state. Email body/subject fields are not stored in the application schema.
- There are no reply/send/delete-email actions, dry-run preview, undo, IMAP/Outlook provider, billing, team/org model, or an archive listing past runs. The latest run does have a per-email review UI.
- No live OAuth, Gmail, TypeSafe/AI Gateway, deployment, DNS, or backup state is established by this KB. Deployment files describe how to run the software.
- The privacy page says attachments are not sent; MIME parsing lacks explicit filename/disposition exclusion. See `07-known-issues.md` before relying on that guarantee.

## Planned/aspirational

`README.md` and `src/app/privacy/page.tsx` describe self-hosting/test deployments and a public hosted rollout after operator/OAuth preparations. No approval status or public-launch readiness can be inferred from code. There is no separate committed product roadmap; `06-improvement-ideas.md` contains proposed work, not promises.
