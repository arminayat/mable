# Improvement ideas

## Planned/aspirational — curated backlog

These are proposals from source inspection, not committed product scope. No items were implemented as part of KB creation. Keep one entry per idea; resolve or remove it when shipped.

| Idea | Why / impact | Rough effort | Affected source | Status |
| --- | --- | --- | --- | --- |
| Explicitly exclude attachment MIME parts and select the preferred body alternative | Align privacy wording with behavior; avoid text-attachment inclusion and duplicated plain/HTML content. See issue K1. | Small–medium | `src/lib/gmail.ts`, `tests/gmail.test.ts`, privacy page | open |
| Use accessible dialog focus/keyboard handling and label the key input | Current custom overlays lack focus trap/restore and Escape handling; key field only has a placeholder. | Small–medium | `src/components/app.tsx`, `settings-panel.tsx`, `rule-editor.tsx` | open |
| Add API contract/authorization tests | Existing tests cover helper/worker behavior but do not exercise session/origin checks, command validation, cross-user mutations, or response shapes. | Medium | `src/app/api/mable/route.ts`, `tests/` | open |
| Expose safe scheduler/provider failure diagnostics | `scheduleDue()` catches all creation errors and advances the due time; worker-cycle logs are generic; GET label failures can be hidden. Preserve credential/content secrecy. | Medium | `src/lib/worker.ts`, `src/worker/index.ts`, API view | open |
| Bound discovery memory and add queue fairness before scaling | `inboxIds()` accumulates the full inbox and oldest queued run is repeatedly preferred; 20-message processing batches do not bound discovery or guarantee fairness. | Medium | `src/lib/gmail.ts`, `src/lib/worker.ts` | open |
| Establish an operator deployment/retention runbook | Backup automation, retention jobs, readiness checks, and verified public-launch evidence are not in the repository. Keep run/seen-ID cleanup consistent with replay guarantees. | Medium | Compose files, `src/lib/schema.ts`, `operations.md`, privacy page | open |
