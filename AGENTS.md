# AIDN v2 — Repository Guidance for Coding Agents

## Scope and architecture

This repository is a TypeScript npm-workspaces monorepo:

- `apps/admin`: internal React/Vite administration application.
- `apps/portal`: external applicant React/Vite portal.
- `apps/api`: backend API.
- `packages/shared`: shared contracts and utilities.

Treat each application as an independent boundary. Do not move frontend business rules into `packages/shared` merely because two files look similar.

## Mandatory working method

1. Inspect the relevant code and all call sites before proposing changes.
2. Separate findings, design decisions, implementation, and review.
3. For audit or planning requests, do not edit code.
4. For implementation requests, change only the approved batch.
5. Preserve workflows, permissions, routes, API contracts, status transitions, and French business wording unless the task explicitly changes them.
6. Run the narrowest relevant validation, then broader checks when practical.
7. Report changed files, validation results, preserved behavior, remaining risks, and one next recommended batch.

## Architecture rules

- Prefer composition over configurable components with many boolean props.
- Confirm at least two real recurring use cases before introducing a shared abstraction.
- Keep Shadcn/Radix components as low-level UI primitives.
- Create application-level components only for recurring interaction patterns.
- Keep feature-specific business logic, permissions, statuses, API calls, and workflow decisions inside the owning feature.
- Shared UI components must not consume raw feature API response objects.
- Use explicit adapters or view models when reusable UI needs normalized data.
- Do not recreate an existing Shadcn/Radix primitive under another name.
- Do not reorganize folders solely to match a preferred architecture template.
- Do not perform unrelated cleanup in the same batch.

## Frontend quality gates

For frontend changes, check as applicable:

- TypeScript correctness and removal of unsafe `any` or assertions.
- Loading, empty, error, disabled, and success states.
- Keyboard access, semantic HTML, labels, focus behavior, and screen-reader context.
- Responsive behavior and overflow handling.
- Query invalidation and server-state consistency.
- Form validation, submission state, and error presentation.
- Stable keys, hook dependencies, and unnecessary derived state.

Preferred validation commands:

```bash
npm run typecheck --workspace=apps/admin
npm run build --workspace=apps/admin
npm run typecheck --workspace=apps/portal
npm run build --workspace=apps/portal
npm run lint
```

If a command cannot run, state the exact reason. Never claim validation that was not executed.

## Table-specific rules

Do not replace every HTML or Shadcn table with one universal component.

First classify each use case, for example:

- small read-only table;
- key/value summary;
- sortable/filterable/paginated data table;
- selectable action table;
- responsive list/table hybrid;
- workflow-specific table.

A proposed abstraction must document its responsibility, supported and unsupported use cases, public API, generic typing, loading/empty/error behavior, actions, responsiveness, accessibility, and migration candidates.

Avoid APIs dominated by flags such as `sortable`, `filterable`, `selectable`, `readonly`, `compact`, `searchable`, and `responsive`. Prefer focused components and composition.

## Approval boundaries

Agents may inspect files, write scoped local changes, and run non-destructive checks when implementation is explicitly requested.

Stop before:

- changing backend contracts to simplify frontend code;
- altering permissions or workflow gates;
- mass-migrating screens before a representative implementation is validated;
- deleting apparently obsolete code without checking all references;
- expanding a frontend task into backend refactoring.
