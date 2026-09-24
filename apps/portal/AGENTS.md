# Portal Frontend Guidance

This file extends the root `AGENTS.md` for `apps/portal`.

## Product context

The portal is the applicant-facing application. It exposes account requests, authentication, dossiers, meetings, notifications, documents, payment proof, and correction workflows. Clarity, accessibility, responsive behavior, and safe workflow guidance are primary concerns.

## Boundaries

- Do not reuse an admin component merely because it looks similar.
- Portal components must use applicant-facing French wording and avoid internal administrative terminology unless already required by the workflow.
- Keep API/query logic outside generic visual components.
- Keep dossier phase rules, upload eligibility, document visibility, and action gating inside feature-level logic.
- Do not expose internal statuses, identifiers, permissions, or implementation details through shared UI abstractions.

## Refactoring priorities

Prioritize:

1. broken or ambiguous user journeys;
2. inconsistent loading, empty, error, and upload states;
3. accessibility and mobile behavior;
4. duplicated feature-level composition;
5. reusable presentation patterns;
6. cosmetic cleanup.

## Shared-component decisions

Before moving a component into a shared location, verify that:

- at least two portal screens use the same interaction contract;
- the component does not know a feature API response shape;
- the abstraction improves comprehension rather than hiding workflow rules;
- mobile and accessibility behavior are explicit.

## Required validation

For a portal-only batch, run when available:

```bash
npm run typecheck --workspace=apps/portal
npm run build --workspace=apps/portal
```

Also run targeted tests if introduced or affected. Inspect every changed component call site manually.
