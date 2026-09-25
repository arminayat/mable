# Known issues and recovery knowledge

## Implemented today — current gaps observed in source

These are source observations, not claims of reproduced production incidents. Unimplemented fixes are labeled separately.

### K1 — attachment exclusion is weaker than the privacy wording (open)

- **Symptom:** README/privacy say attachments are not sent; a text MIME part containing inline data can be included in evaluation context.
- **Root cause:** `bodyOf()` in `src/lib/gmail.ts` recurses through every part and accepts `text/plain`/`text/html` without examining filename or Content-Disposition. Multipart alternatives may both be concatenated. Attachment blobs referenced only by attachment ID are not fetched; non-text data is excluded.
- **Fix/workaround:** no explicit text-attachment filter is present. Existing test coverage proves PDF exclusion only; it does not establish a blanket guarantee.
- **Planned/aspirational prevention:** add filename/disposition handling and MIME fixtures; reconcile disclosure against the actual parser (backlog).

### K2 — Settings lacks focus and keyboard lifecycle (open; Run dialog improved in source)

- **Symptom:** Settings declares `aria-modal` without focus trapping/restoration or Escape close handling.
- **Root cause:** the custom `settings-panel.tsx` overlay has no accessible dialog primitive.
- **Fix/workaround:** Settings has visible close and backdrop handling. The new `RunDialog` focuses the panel, cycles Tab/Shift+Tab, closes on Escape, and restores the opener; its browser accessibility acceptance remains unverified.
- **Planned/aspirational prevention:** use an accessible dialog primitive for Settings and verify portal/keyboard/focus behavior with user-authorized browser testing.

### K3 — transient Gmail errors can leave an apparently connected view (open)

- **Symptom:** GET may return empty labels with `gmailConnected: true` after a transient label-fetch failure.
- **Root cause:** `/api/mable` initializes connection state from an existing mailbox and only marks disconnected for Gmail 401/403; other errors are swallowed.
- **Fix/workaround:** a later successful poll reloads labels; no explicit transient provider-error state exists.
- **Planned/aspirational prevention:** represent temporary unavailability separately and test it; do not treat the Settings connection text as proof that Gmail is currently healthy.

### K4 — unavailable GitHub icon export blocked development updates (resolved)

- **Symptom:** local `/` returned HTTP 500 and development logs reported `Export Github doesn’t exist in target module`; updates could not compile.
- **Cause:** the footer imported `Github` from installed `lucide-react` 1.47.0, which does not export it. ESLint alone did not detect the invalid export.
- **Fix:** render the decorative GitHub mark as an inline SVG instead. The running Turbopack process continued serving the old error after the source fix; restarting the dev server recovered HTTP 200 with the updated copy and footer. Typecheck passed. Browser hot-reload delivery was not verified.
- **Prevention:** typecheck new imports and verify server compilation; lint alone does not establish compilation success.

### K5 — local Google login used placeholder credentials (configuration fixed; login acceptance pending)

- **Symptom:** Google rejects local login with `invalid_client`; the authorization URL contains a placeholder client ID.
- **Cause:** local Google client ID and secret remained placeholders after production credentials were configured in Coolify.
- **Fix/workaround:** copied the existing Mable credentials from Coolify into ignored local `.env`, saved `http://localhost:3014/api/auth/callback/google` on the existing Google client, and restarted the dev server. Local auth origin is port 3014. The sign-in endpoint returns 200 with the real client and correct callback; user completion of login remains pending. A subsequent user screenshot still showed `redirect_uri_mismatch` for that exact callback and client. Google displayed a successful save notification; propagation delay is possible but not confirmed. Its client editor warns changes may take five minutes to a few hours. Reopen sign-in from the app for a fresh request; refreshing an existing Google error URL does not retry authorization.
- **Prevention:** provision OAuth credentials before testing sign-in; a successful welcome-page response does not establish authentication readiness.

### K6 — selected action icons lost internal detail (resolved in source)

- **Symptom:** user screenshot showed Archive becoming a solid silhouette when selected.
- **Cause:** selected SVGs used the same color for their fill and stroke, hiding internal lines.
- **Fix:** selected icons retain action-colored fills and outer strokes. Only internal details use pale strokes/fills (archive handle/lid, mail fold, tag hole). Applying pale strokes to the entire SVG made the silhouette look smaller, as reported in a later user screenshot; the outer stroke is now preserved.
- **Prevention:** differentiate internal details without removing the outer silhouette of selected icons. Source checked; browser verification was not performed.

### K7 — reported hot reload interruption (cause unconfirmed)

- **Symptom:** user reported changes not hot-reloading on localhost:3014.
- **Evidence:** on 2026-09-25, the app terminal showed two manual dev-server restarts and successful prior recompiles. The current server was the correct checkout, returned HTTP 200, and the open page console reported `[HMR] connected` without errors after the latest restart.
- **Cause/status:** no failing connection or compiler error was observed at inspection time; the earlier interruption is not explained by this snapshot.
- **Recovery/prevention:** a dev-server restart and page refresh can reconnect the client, but do not treat that as a proven root-cause fix. Capture browser console and dev-server errors while the interruption is happening before changing bundler configuration.

## Implemented today — existing defenses and operational footguns

| Symptom | Cause | Existing fix/workaround | Prevention / evidence / status |
| --- | --- | --- | --- |
| Gmail history request returns 404 | Expired/invalid history checkpoint | Re-list inbox since connection time and remove already-seen IDs; persist new checkpoint | Preserve `new_mail_seen`; worker integration fixture covers recovery. Handled in code. |
| Gmail response is lost after a mutation | Remote mutation and DB completion are not atomic | Persist actions first and reapply the same label modifications on retry, without reevaluating | Keep actions idempotent; integration test covers uncertain modification. Handled in code, not exactly-once execution. |
| Invalid model output would cause a decision | Missing/non-boolean/non-finite/out-of-range probability | `decide()` throws; worker retries then fails without applying an undecided action | Preserve validation and fail-closed tests. Handled in code. |
| New-mail cancellation would strand discovered IDs | History advances during discovery | `cancelRun()` clears history for new scope; later reconciliation uses seen IDs | Do not discard seen IDs during retry/cancel. Integration test covers checkpoint reset. Handled in code. |
| Run pauses or new run is rejected | Google/model 401/403, or unresolved failed/paused run | Reconnect Google or replace key; then Retry, or Discard; active/unfinished runs block creation | GET clears Google pause on successful access; key set clears pause; retry alone does not clear `settings.pauseReason`. Handled workflow. |
| API queries fail after adding Gateway support | Updated schema selects `settings.key_provider` before the DB has migration `0001` | Apply `pnpm db:migrate` before starting updated web/worker; old keys backfill to TypeSafe without rewriting ciphertext | Additive upgrade checked on disposable PostgreSQL; local and production migrations verified on 2026-09-25. |
| Updated live-review queries fail against an old schema | Missing migration `0002` columns | Apply `pnpm db:migrate` before running the updated web/worker; restart the worker | Disposable-DB migration and streamed worker integration tests cover the schema; production migration/startup verified on 2026-09-25. Legacy scores remain unavailable. |
| Review positions could overlap after interrupted discovery | Restarted discovery can return reordered/duplicate IDs; resetting the position counter would reuse slots | Preserve persisted IDs/positions and append unseen candidates densely | Covered by a restarted-discovery integration fixture; source fix, no production incident claimed. |
| A last-50 run could grow after an interrupted discovery | Relisting on retry could append new arrivals to an already persisted 50-message selection | The latest scope reuses its existing single-batch snapshot whenever rows exist | Bounded discovery and interrupted-discovery integration fixtures cover the cap; no production incident claimed. |
| Integration suite removes account data | Setup/teardown calls unfiltered `db.delete(user)` and FKs cascade | Run only against a disposable, migrated DB with explicit test credentials | `test:integration` loads `.env` if present; presence checks do not prove DB safety. Active test footgun. |
| Host app cannot reach Compose DB using example URL | `.env.example` uses 5432, local Compose publishes 5433 | Use host port 5433 from host processes; containers use `db:5432` override | Distinguish host/container connection strings. Configuration footgun. |
| Lease expiry permits overlapping execution | Lease/heartbeat has no owner fencing token | Deployment guidance supports one worker replica | Do not infer safe horizontal scaling from `SKIP LOCKED` alone. Limitation present; no multi-worker acceptance established. |

Cancellation checks cannot undo a Gmail request already in flight. Account deletion also cannot retroactively undo Gmail actions. Treat this as the implemented boundary, not an immediate remote rollback guarantee.

### K8 — expanded editor icon scaling and endpoint jumps (source fix; visual acceptance pending)

- **Symptom:** user reported stepped phases and then persistent icon scaling glitches and a jump into the final position after the first timing revision.
- **Cause (source inspection):** action badge clones retained the span’s start alignment while the final HeroUI buttons center their SVGs. Animating root/SVG width alone did not interpolate their internal alignment; replacing the clone with the real button exposed the offset. Separate CSS transitions and independently started animations could also conflict with the intended movement.
- **Fix:** preserve overlapping ordered timing but animate the real destination controls and SVGs from measured source bounds. Independently compensate the nested SVG transform for button position/scale throughout the animation, share one timeline start, and finish at identity without an icon swap. Disable button CSS transitions only during expansion. The question retains its separate text layer.
- **Prevention/status:** five geometry regression cases cover expansion and collapse at desktop/mobile sizes, including asymmetric SVG placement, at 61 points and verify exact final identity. Typecheck and focused lint pass. Browser visual acceptance has not been performed; source/mathematical checks do not establish rendered smoothness.

### K9 — Settings select alignment and missing provider label (source fix)

- **Symptom:** select text sat above the vertical center; the provider showed “Select an item” after the provider field was introduced.
- **Cause (source inspection):** the taller Settings trigger retained library top-aligned content, and an already-open view could initialize the new provider draft without a value during hot reload.
- **Fix/prevention:** explicitly center trigger/value content, default missing provider drafts to TypeSafe, and render the controlled option’s label in `SelectField`. Typecheck/lint verify component integration; browser rendering has not been tested.
