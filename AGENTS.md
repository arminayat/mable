`docs/agents/` is this layer's persistent agent memory and is authoritative for how this code behaves; code remains the source of truth when they disagree.

## Knowledge base index

- [01-overview.md](docs/agents/01-overview.md) — purpose, implemented flow, scope, and intent gaps.
- [02-surface-area.md](docs/agents/02-surface-area.md) — screens, actions, routes, jobs, and command entry points.
- [03-architecture-and-stack.md](docs/agents/03-architecture-and-stack.md) — runtime, dependencies, state, and process boundaries.
- [04-conventions-and-patterns.md](docs/agents/04-conventions-and-patterns.md) — source conventions, framework rules, and testing patterns.
- [05-folder-structure.md](docs/agents/05-folder-structure.md) — ownership map and placement of new code.
- [06-improvement-ideas.md](docs/agents/06-improvement-ideas.md) — curated, unimplemented improvements with impact and effort.
- [07-known-issues.md](docs/agents/07-known-issues.md) — current limitations and source/test-backed recovery patterns.
- [design-system.md](docs/agents/design-system.md) — implemented visual tokens, layout, and interaction/accessibility limits.
- [components.md](docs/agents/components.md) — component inventory and state/composition boundaries.
- [data-model.md](docs/agents/data-model.md) — tables, relationships, constraints, and durable processing state.
- [api-contracts.md](docs/agents/api-contracts.md) — session/origin requirements, command payloads, responses, and errors.
- [integrations.md](docs/agents/integrations.md) — Google, Gmail, TypeSafe, and their failure boundaries.
- [operations.md](docs/agents/operations.md) — setup, environment, worker lifecycle, deployment, and checks.
- [security-access.md](docs/agents/security-access.md) — identity, credentials, deletion, and sensitive-data boundaries.

## Operating protocol — required on every task

- **BEFORE thinking about or making ANY change, read the relevant `docs/agents/` files first and always skim [07-known-issues.md](docs/agents/07-known-issues.md).** Start with the overview if unfamiliar with the project.
- **AFTER any change or new learning, update the relevant knowledge files in the SAME turn, before finishing.**
  - Fixed or encountered non-obvious bug/gotcha → `07-known-issues.md`, with symptom, cause, actual fix/workaround, prevention, and status. Distinguish source observations from reproduced incidents.
  - Improvement noticed but not implemented → `06-improvement-ideas.md`, with impact, effort, affected area, and status.
  - Changed behavior, architecture, structure, or conventions → rewrite the matching state file and applicable specialist files; do not append a changelog.
- Code is the source of truth. If the KB and code disagree, fix the KB. Treat README/spec statements as intent until verified in code.
- Label non-trivial claims **implemented today** or **planned/aspirational** (a labeled section may cover its contents). Explicitly say when something is not present. Source implementation does not establish deployment or live acceptance.
- Curate the logs: resolve completed entries, remove obsolete ones, and reconcile existing files rather than adding duplicates. Keep this index current. Do not create `docs/agents/README.md`.

## Update triggers

Update memory for changed product behavior, architectural boundaries, folder conventions, tooling, UI direction, new/removed cross-project links, debugged issues, or noticed improvements. If this becomes a workspace, add project routing, build child KBs first, and update the workspace layer only for shared conventions, boundaries, maps, or cross-project relationships.

## Layer and project rules

**Implemented today:** this is a SINGLE PROJECT, a full-stack Next.js UI/API with a background Gmail worker. One root `package.json`/lockfile owns all processes; `pnpm-workspace.yaml` only configures dependency builds and declares no child packages. There is no workspace routing layer.

- Do not test changes in a browser unless explicitly instructed.
- After a large change or feature, give a short report covering system changes, end-user effects, and any run/test/deployment requirements (including environment variables or migrations).
- Apply YAGNI. Keep files focused; consider splitting files above 500 lines.
- Preserve the framework-managed instructions below.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
