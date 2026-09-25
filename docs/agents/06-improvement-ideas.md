# Improvement ideas

## Planned/aspirational — curated backlog

These are proposals from source inspection, not committed product scope. No items were implemented as part of KB creation. Keep one entry per idea; resolve or remove it when shipped.

| Idea | Why / impact | Rough effort | Affected source | Status |
| --- | --- | --- | --- | --- |
| Explicitly exclude attachment MIME parts and select the preferred body alternative | Align privacy wording with behavior; avoid text-attachment inclusion and duplicated plain/HTML content. See issue K1. | Small–medium | `src/lib/gmail.ts`, `tests/gmail.test.ts`, privacy page | open |
| Complete Settings dialog focus/keyboard handling | Settings still lacks focus trap/restore and Escape handling. RunDialog now implements a local keyboard/focus lifecycle; the key input is labeled. Browser accessibility acceptance remains pending. | Small–medium | `src/components/settings-panel.tsx`, `run-dialog.tsx` | partly addressed |
| Add API contract/authorization tests | Credential commands and live-review session/ownership/response boundaries have integration coverage. Broader command validation, Origin rejection and cross-user mutation coverage remain incomplete. | Medium | `src/app/api/mable/route.ts`, `tests/` | partly addressed |
| Expose safe scheduler/provider failure diagnostics | `scheduleDue()` catches all creation errors and advances the due time; worker-cycle logs are generic; GET label failures can be hidden. Preserve credential/content secrecy. | Medium | `src/lib/worker.ts`, `src/worker/index.ts`, API view | open |
| Bound discovery memory and add queue fairness before scaling | `inboxIds()` accumulates the full inbox and oldest queued run is repeatedly preferred; 20-message processing batches do not bound discovery or guarantee fairness. | Medium | `src/lib/gmail.ts`, `src/lib/worker.ts` | open |
| Establish an operator deployment/retention runbook | Backup automation, retention jobs, readiness checks, and verified public-launch evidence are not in the repository. Keep run/seen-ID cleanup consistent with replay guarantees. | Medium | Compose files, `src/lib/schema.ts`, `operations.md`, privacy page | open |
