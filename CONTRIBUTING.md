# Contributing to mable

Issues and small pull requests are welcome. Keep the product focused on questions and four Gmail actions. Please describe the end-user effect of a change and add focused tests for processing or credential handling changes.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` before submitting. Database changes need a committed Drizzle migration. Integration tests use a disposable PostgreSQL database through `DATABASE_URL`; never run them against an account holding real user data.

Do not commit `.env`, API keys, OAuth tokens, message content, or logs that contain them. Live Gmail testing must use a Google OAuth test account and disposable sample messages.
