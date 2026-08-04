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

## Pattern-specific rules

Use these rules when auditing or refactoring recurring frontend patterns. Do not focus only on one pattern unless the task explicitly narrows the scope.

### Shared component candidates

Before creating or promoting a shared component:

- prove the pattern appears in at least two real places or isolates meaningful complexity;
- identify whether the component is a primitive wrapper, application-level component, or feature component;
- document the public API, ownership, supported use cases, unsupported use cases, and migration candidates;
- keep feature-specific statuses, permissions, labels, workflow rules, and API object shapes out of shared components;
- avoid adding configuration props before a real consumer needs them;
- prefer slots, render props, children composition, or small focused components over large flag-driven APIs.

Do not move a component to a shared folder only because the JSX looks similar. Similar layout does not always mean the same interaction contract.

### Tables and list views

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

### Forms and validation

When auditing or refactoring forms:

- inventory form flows by business action, not only by visual fields;
- preserve current validation rules, required fields, submission side effects, notifications, and navigation behavior;
- keep schemas close to the owning feature unless they are truly shared contracts;
- avoid one generic form component that hides business behavior behind many flags;
- prefer reusable field wrappers only for repeated label, hint, error, disabled, and accessibility behavior;
- standardize loading, disabled, success, and server-error presentation across forms;
- do not change payload shape, API endpoints, or mutation invalidation without explicit approval.

Reusable form pieces should make field composition clearer. They must not obscure the workflow being performed.

### Page composition and layouts

When auditing or refactoring pages:

- distinguish route/page orchestration from reusable visual sections;
- keep data loading, permission guards, and workflow decisions visible at the page or feature boundary;
- extract repeated page headers, section cards, filter areas, split views, detail panels, and action bars only when their interaction contract is recurring;
- avoid extracting tiny JSX fragments that make the page harder to read;
- preserve French business wording and role-specific action visibility;
- verify responsive behavior after layout changes.

A page refactor should make the workflow easier to understand, not just reduce line count.

### Loading, empty, error, and feedback states

When auditing or refactoring UI states:

- inventory how loading, empty, error, disabled, success, and destructive states are currently represented;
- standardize recurring state patterns with small reusable components where justified;
- keep feature-specific recovery actions and messages inside the owning feature;
- ensure loading states do not hide authorization or workflow errors;
- ensure empty states explain the next useful action when appropriate;
- ensure error states expose safe, actionable recovery without leaking technical internals to end users;
- preserve toast, inline error, and mutation feedback behavior unless explicitly changed.

Do not introduce skeletons, spinners, or empty-state components inconsistently across only one screen unless the migration plan accounts for similar screens.

### Data fetching and server state

When auditing or refactoring data access:

- identify API clients, query hooks, mutation hooks, query keys, and invalidation patterns;
- avoid duplicate fetch logic across components;
- keep server state in TanStack Query where appropriate and avoid copying it into local state without a reason;
- do not modify backend contracts to make frontend refactoring easier;
- use adapters or view models when reusable UI should not depend on raw API objects;
- preserve cache invalidation, optimistic behavior, loading behavior, and error handling;
- avoid broad query invalidation when a narrow invalidation is available and safe.

Changes to API contracts, permissions, status transitions, or backend responses require explicit approval.

### Accessibility and responsive behavior

When auditing or refactoring UI components:

- preserve or improve semantic HTML, keyboard navigation, focus management, labels, and screen-reader context;
- ensure dialogs, dropdowns, tabs, tables, forms, and action menus remain usable by keyboard;
- verify mobile and narrow viewport behavior for admin and portal screens separately;
- do not replace semantic structures with generic `div` layouts without a clear accessibility plan;
- ensure icons used as actions or status indicators have accessible labels or text alternatives;
- preserve visible focus states and meaningful disabled states.

Accessibility fixes are valid refactoring outcomes, but they must still preserve business behavior.

### Feature boundaries and cross-app reuse

Before moving code between `apps/admin`, `apps/portal`, or `packages/shared`:

- confirm both apps actually need the same behavior, not only a similar visual style;
- keep admin-only workflow logic out of portal code;
- keep applicant-facing copy and portal-specific constraints out of admin code;
- place truly shared contracts and pure utilities in `packages/shared` only when they are stable across apps;
- avoid cross-app imports that make one frontend depend on the other frontend's feature structure.

Shared code should reduce long-term coupling, not create hidden dependencies between applications.

## Approval boundaries

Agents may inspect files, write scoped local changes, and run non-destructive checks when implementation is explicitly requested.

Stop before:

- changing backend contracts to simplify frontend code;
- altering permissions or workflow gates;
- mass-migrating screens before a representative implementation is validated;
- deleting apparently obsolete code without checking all references;
- expanding a frontend task into backend refactoring.