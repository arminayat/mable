# Conventions and patterns

## Implemented today — conventions observed in source

- TypeScript with strict checking, two-space indentation, double quotes, semicolons, named exports, and lower-case/kebab-case file names. `@/*` resolves to `src/*`; sibling modules commonly use relative imports.
- `src/app` owns Next pages/layouts/handlers. `src/components` owns interactive UI. `src/lib` holds shared server behavior and schema; `src/worker/index.ts` is only the process loop.
- Server pages call Better Auth directly; `/` uses `dynamic = "force-dynamic"` and `await headers()`. Interactive modules explicitly declare `"use client"`. Client schema imports are type-only.
- Mutations use one Zod discriminated command union in the API, then user-scoped DB queries or service calls. Client `Command` is a generic payload callback, not a generated/fully typed command client.
- UI mutations refresh the server view after completion. Polling replaces the view; there are no optimistic DB updates. Local pending/error state lives in dialogs, while main-page actions use `act()`.
- `PublicError` contains intended user-facing messages; Gmail errors contain status-based messages. Most POST implementation errors become `Request failed`. Provider response bodies and message text are not intentionally logged.
- DB schema types model JSON snapshots/actions. Transactions and unique keys protect run creation and candidate insertion; side effects are persisted before Gmail modification. Do not replace these with only in-memory state.
- Global CSS classes style native controls and HeroUI compound components (`Tooltip.Trigger`/`Content`, `Button` with `onPress`). There is no generic local UI-kit folder.
- Tests use Vitest, explicit mocks, and small fixtures. Unit tests mock provider/auth/DB boundaries; worker integration tests use real PostgreSQL with mocked external calls. Integration cleanup deletes every user in its selected database.

## Implemented today — framework reference and verification rules

Before code changes, read relevant installed Next guides under `node_modules/next/dist/docs/`. The guides inspected for this KB are `01-app/01-getting-started/15-route-handlers.md`, `01-app/01-getting-started/05-server-and-client-components.md`, and `01-app/03-api-reference/04-functions/headers.md`: route handlers use Web Request/Response, pages/layouts default to server components, and `headers()` is async. Do not assume APIs from another Next release.

Project instructions require YAGNI, focused files (consider splitting beyond 500 lines), and no browser testing without explicit direction. `CONTRIBUTING.md` asks for focused processing/credential tests, committed migrations for schema changes, and typecheck/lint/test/build before submission. Never use the integration suite against real account data.

## Planned/aspirational — not established conventions

There is no shared modal abstraction, API-route test harness, formatter config, generated API contract, or enforced server-only import marker. Do not document these as existing patterns or introduce broad new layers for a narrow task.
