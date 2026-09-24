# mable

Mable asks simple questions about Gmail messages and applies the actions attached to the first confident match. It uses [Jev through the AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai). You supply your own TypeSafe API key. Mable is free and open source under the MIT license.

The app has four actions: apply a Gmail label, star, mark read, and archive. A manual run can process newly received mail, the last 30 days of inbox mail, or the entire inbox. Automatic runs check newly received inbox mail every 15 minutes, hourly, or every 24 hours. Schedules are off by default.

## Requirements

- Node.js 22 and pnpm 11, or Docker with Compose
- PostgreSQL 17 or later
- A Google Cloud OAuth web client with Gmail API enabled
- A TypeSafe API key for each user

## Local setup

1. Copy `.env.example` to `.env`. Set `DATABASE_URL` to a dedicated PostgreSQL database. Generate `BETTER_AUTH_SECRET` with `openssl rand -hex 32` and `CREDENTIAL_ENCRYPTION_KEY` with `openssl rand -base64 32`. Keep both stable after deployment.
2. In Google Cloud, enable the Gmail API and configure the OAuth consent screen. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Set the client ID and secret in `.env`. For development, add your Google account as an OAuth test user.
3. Run `pnpm install`, then `pnpm db:migrate`.
4. Start `pnpm dev` and `pnpm worker` in separate terminals. Open `http://localhost:3000`, sign in with Google, and enter your TypeSafe key in Settings.

The worker uses `.env` if present. The web app loads it through Next.js. To run PostgreSQL through Compose, use `docker compose up --build`; the database is exposed locally on port 5433, and the containers share the `db` hostname. Compose runs migrations before starting web and worker services. Run only one worker replica in this version.

## Production setup

Deploy the Docker image as one web service and one worker service, with the same environment variables and shared PostgreSQL database. Apply `pnpm db:migrate` before starting a new release. Set `BETTER_AUTH_URL` to the public HTTPS origin and register `https://YOUR_DOMAIN/api/auth/callback/google` with Google. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `CREDENTIAL_ENCRYPTION_KEY` in the host's secret store. The TypeSafe key is supplied in each user's Settings; there is no shared model key. Preserve the auth and encryption secrets across deployments.

Google's `gmail.modify` scope is restricted. A public hosted app that reads Gmail on its server needs Google's OAuth verification and an applicable security assessment before broad signup. Keep the consent screen in testing mode and use approved test accounts until then. [Google's Gmail scope list](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) describe the current requirements.

## Processing model

- Rules are evaluated together, then Mable uses the first one in list order whose estimated probability of “yes” meets the global threshold. The default is 90%.
- Manual historical runs deliberately reevaluate messages using the rule snapshot captured at run creation. Automatic and manual “new mail” runs use Gmail history plus saved message IDs to avoid reevaluating already processed arrivals.
- Actions are applied to individual Gmail messages in one modification request. A retry reuses the saved decision; adding a label, starring, marking read, and archiving are safe to repeat.
- Mable saves users, encrypted credentials, rules, settings, Gmail history checkpoints, message IDs, and run progress. It does not save email content or attachments. The message content sent to TypeSafe is limited to headers and up to 20,000 characters of body text. Attachments are not sent.
- An interrupted worker resumes pending work. A cancelled new-mail run resets discovery to reconcile unprocessed inbox mail later. Failed or paused runs must be retried or discarded before starting another run.

## Checks

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. For PostgreSQL integration tests, point `DATABASE_URL` at a **disposable database**, set `CREDENTIAL_ENCRYPTION_KEY`, run `pnpm db:migrate`, then `pnpm test:integration`. Integration tests delete users in that database. CI runs these checks with its own PostgreSQL service.

Live Google OAuth, Gmail mutation, TypeSafe evaluation, and Docker startup require real credentials or a working Docker daemon. Unit and database integration tests mock Google and TypeSafe calls. Do not point a manual all-inbox run at an account containing irreplaceable messages until it has been accepted with sample mail.
