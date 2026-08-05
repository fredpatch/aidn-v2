# Admin Frontend Guidance

This file extends the root `AGENTS.md` for `apps/admin`.

## Product context

The admin application supports internal ANAC workflows with role-based access, dossier phases, official correspondence, meetings, account requests, reporting, and S5 payment handling. Existing business rules and French labels are contractual behavior, not incidental UI copy.

## Boundaries

- Keep API access and TanStack Query logic out of generic visual components.
- Keep permission checks close to routes, page composition, or feature-level actions.
- Do not embed role names or dossier workflow statuses in globally shared UI components.
- Page-specific components may remain local when reuse is not proven.
- Reusable admin components should serve multiple admin features without knowing their API shapes.

## Refactoring priorities

When auditing or refactoring, classify findings into:

1. correctness or regression risk;
2. duplicated interaction pattern;
3. component-boundary problem;
4. typing and data-shaping problem;
5. UX consistency issue;
6. optional cleanup.

Do not prioritize visual uniformity over workflow correctness.

## Tables and split views

The admin contains different table/list patterns. Inventory them before abstraction. Distinguish:

- operational work queues with filters and actions;
- read-only reporting tables;
- compact embedded summaries;
- split-view master/detail screens;
- selectable or bulk-action lists;
- responsive alternatives.

A reusable `DataTable` must not own feature queries, permissions, navigation, status mapping, or domain-specific actions. Feature components should compose those concerns around the reusable table primitives.

## Required validation

For an admin-only batch, run when available:

```bash
npm run typecheck --workspace=apps/admin
npm run build --workspace=apps/admin
```

Also run targeted tests if introduced or affected. Inspect every changed component call site manually.
