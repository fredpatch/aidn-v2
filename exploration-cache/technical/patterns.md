# 🧩 AIDN v2 — Code Patterns

## Service / Controller / Route

Every module (`apps/api/src/modules/<name>/`) follows the same three-file split:

- **`<name>.service.ts`** — all DB access (Drizzle queries), business logic, throws
  plain `Error("SCREAMING_SNAKE_CASE")` on failure. Never touches `req`/`res`.
- **`<name>.controller.ts`** — reads `req`, calls the service, maps thrown errors to
  HTTP responses via `shared/utils/error.ts`'s `handle*Error` factories. Never
  contains business logic itself.
- **`<name>.route.ts`** — wires controller functions to Express routes, applies
  `authenticate`/`authenticateApplicant`/`authenticateEither`/`requireRole`
  middleware. No logic here beyond route wiring.

Example: `modules/requests/` — `requests.service.ts` has `submitRequest()`,
`markSigned()`, etc.; `requests.controller.ts` extracts `req.body`/`req.params` and
calls them; `requests.route.ts` maps `POST /:id/mark-signed` to the controller.

## Error handling

Services throw a bare error code as the `Error` message
(`throw new Error("REQUEST_ALREADY_ACTIVE")`). Controllers never write their own
`try/catch` mapping — they call a `handle*Error(res, error)` factory from
`shared/utils/error.ts`, which has one lookup table per module mapping codes to
`{ status, message }`. Adding a new error code means adding one line to that table,
not touching every controller.

## Cross-cutting DB patterns, reused across modules

These aren't code patterns so much as *table* patterns reused by multiple business
modules — see `project/database-schema.md` and `technical/cross-cutting-patterns.md`
for the full business-rule-level description:

- **Circuit DG** (`dg_circuit_documents`) — reused by M1 intake and M4's formal letter
- **Réunion/Visite** (`meetings`) — reused by M3, M4, M6
- **Facture/Preuve** (`payments`) — reused by M5, M6, M7
- **Document version/trash** (`document_versions`) — generic, keyed by
  `ownerType + ownerId`, reused by every upload point

When adding a new phase module, check whether it needs a *new* table or can just add
a new `ownerType`/`entityType` value to an existing shared one.

## Frontend auth gate pattern

Both `apps/admin/src/App.tsx` and `apps/portal/src/App.tsx` follow the same shape:
a `Gate` component reads the relevant auth context (`useAuth`/`useApplicantAuth`),
and renders one of: loading state → (admin only) bootstrap screen → login screen →
the real app (`AppShell` + nested routes, for admin; a simple header + routes for
portal). Adding a new protected page means adding a `<Route>` inside the "real app"
branch — the gate logic itself never needs touching.

## Shared UI primitives (`components/ui/`)

`Button` (cva variants: default/secondary/ghost/destructive), `Input`, `Label` —
hand-written, not shadcn CLI-generated (matches SICOT's approach: Tailwind setups
here don't play well with the shadcn CLI). Auth-specific building blocks live in
`pages/auth/components/` (`FormField`, `EyeToggle`, `PasswordStrength`, `ServerError`,
`GridPattern`, `StepTab`, `ModeTab`) and are shared between admin and portal by
duplication (small enough not to warrant a shared package yet).
