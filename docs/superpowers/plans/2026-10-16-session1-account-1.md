# SESSION1-ACCOUNT-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** DN staff can edit an approved applicant's name, email, phone and contact order from the admin, atomically audited.

**Architecture:** One new M13 service function in a transaction + PATCH route behind the existing M13 guard; a shared email helper reused by M13 and bootstrap; an edit form component in the approved-account panel.

**Tech Stack:** Express + Drizzle + PostgreSQL (node:test via tsx), React + vitest (admin).

**Spec:** `docs/superpowers/specs/2026-10-16-session1-account-1-design.md` (§2 matrix, §3 contract, §4 service, §5 sessions, §6 UI).

## Global Constraints

- No migration, no schema change, no `updatedAt`.
- Never query `users` for applicant-email uniqueness.
- Editable fields only: `fullName`, `email`, `phone`, `contactOrder`. `organisationId`, password, `active` untouched by this route.
- Route guard: `dn_agent`, `dn_supervisor`, `SU` only (the existing `router.use(authenticate, requireRole(...))`).
- Audit `APPLICANT_ACCOUNT_UPDATED`, module `M13`, `entityId` applicant id, `userId` actor, `details: { changedFields, changes: { field: { from, to } } }`, inside the same transaction; no audit on a no-op; no password data ever.
- Error codes: `APPLICANT_NOT_FOUND` 404, `APPLICANT_EMAIL_EXISTS` 409 (existing), `INVALID_APPLICANT_EMAIL` 400, `APPLICANT_NAME_REQUIRED` 400, `APPLICANT_NAME_TOO_LONG` 400, `INVALID_APPLICANT_PHONE` 400, `INVALID_CONTACT_ORDER` 400.
- French UI copy, exact: « Informations du compte », « Nom complet », « Email », « Téléphone », « Rôle de contact », « Ordre de contact », « Organisation », « Modifier », « Annuler », « Enregistrer les modifications », « L'organisme associé ne peut pas être modifié depuis cette fiche. », success toast « Compte postulant mis à jour. ». Contact-order labels: primary « Responsable principal », secondary « Utilisateur secondaire », tertiary « Utilisateur tertiaire ».
- DB tests use only `DATABASE_URL=postgresql://postgres:admin@localhost:5432/aidn_v2_meet2_test` (never `apps/api/.env`), skip when `DATABASE_URL` is unset, and clean up their own rows.
- Do not commit; the controller makes one feature commit at the end. Do not push.

## Review Focus

- Legacy mixed-case stored email equal (case-insensitively) to the new email of another applicant → 409, not a 500 from the unique index.
- Same applicant re-submitting its own email in another case/whitespace → success (no false 409).
- JSON `phone: null` vs absent: null clears, absent keeps.
- Non-string JSON values (`email: 42`, `fullName: null`) → 400, not 500.
- UI save failure keeps the typed values.

---

### Task 1: API - shared email helper, update service, route, DB + HTTP tests

**Files:**

- Create: `apps/api/src/shared/utils/email-address.ts` - `normalizeEmail(value: string): string` (`trim().toLowerCase()`), `isValidEmail(value: string): boolean` (the bootstrap regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), `EMAIL_MAX_LENGTH = 255`.
- Modify: `apps/api/src/modules/bootstrap/bootstrap.controller.ts` - use `isValidEmail` instead of its inline regex (no behaviour change).
- Modify: `apps/api/src/modules/account-requests/account-requests.service.ts` - `cleanEmail` delegates to `normalizeEmail`; add `updateApplicantAccount`; extract a `getApplicantAccountView(id, executor)` used by both the new function and `setApplicantAccountActive` (replacing its list-then-find).
- Modify: `account-requests.types.ts` - `UpdateApplicantAccountInput { fullName?: unknown; email?: unknown; phone?: unknown; contactOrder?: unknown }` (raw values; the service validates types).
- Modify: `account-requests.controller.ts` - `updateApplicant`: pick only the four keys from `req.body` (presence via `Object.prototype.hasOwnProperty`), call the service with `req.user!.userId`.
- Modify: `account-requests.route.ts` - `router.patch('/applicants/:id', accountRequestsController.updateApplicant);` (after the guard).
- Modify: `apps/api/src/shared/utils/error.ts` - add the new codes to `handleAccountRequestsError` with French messages: `INVALID_APPLICANT_EMAIL` « Adresse email invalide. », `APPLICANT_NAME_REQUIRED` « Le nom complet est requis. », `APPLICANT_NAME_TOO_LONG` « Le nom complet ne doit pas dépasser 200 caractères. », `INVALID_APPLICANT_PHONE` « Le téléphone ne doit pas dépasser 50 caractères. », `INVALID_CONTACT_ORDER` « Ordre de contact invalide. ».
- Test: `apps/api/src/modules/account-requests/applicant-account-update.db.test.ts`, `apps/api/src/modules/account-requests/applicant-account-update.http.test.ts`.

**Interfaces produced:** `updateApplicantAccount(id: number, input: UpdateApplicantAccountInput, actorUserId: number): Promise<ApplicantAccountView>`; route `PATCH /api/account-requests/applicants/:id`.

- [ ] Step 1: write the DB test (fixtures: one organisation, two applicants with known password hash, one staff `users` row whose email equals applicant A's new email; unique emails per run, e.g. suffix with `Date.now()`; delete rows and their `audit_logs` (`module='M13' AND entity_id IN (...)`) in `after`). Cases, each asserting the stored row and the audit rows for that applicant:
      1 name only; 2 normalised email (`'  New.Mail@Example.COM '` stored `new.mail@example.com`); 3 phone; 4 `phone: null` and `phone: '   '` clear to null; 5 contactOrder; 6 several fields together → one audit row with exactly those `changedFields` and `from/to`; 7 email of applicant B (also with B stored in mixed case via direct insert) → `APPLICANT_EMAIL_EXISTS`; 8 A sends its own email in upper case → success, no audit; 9 covered by 2; 10 `'not-an-email'`, `''`, `42`, a 256-char address → `INVALID_APPLICANT_EMAIL`; 11 `'   '`, `null` name → `APPLICANT_NAME_REQUIRED`, 201 chars → `APPLICANT_NAME_TOO_LONG`; 12 `'owner'` → `INVALID_CONTACT_ORDER`; 13 unknown id → `APPLICANT_NOT_FOUND`; 14/15 call through the controller-level whitelist is in the HTTP test - here assert the service input type cannot carry them and the row's `organisationId`/`passwordHash`/`active` are unchanged after every case; 16 email equal to the staff user's email → success; 17 successful update → exactly one `APPLICANT_ACCOUNT_UPDATED` row, `user_id` = actor, details without any `password` key; 18 a failing update (duplicate) → row unchanged and no new audit row; plus a forced rollback: run inside a test that makes the audit insert fail (e.g. actor user id that violates the `audit_logs.user_id` FK, if that FK exists - otherwise pass an executor-level failure) and assert the applicant row is unchanged; 19 no-op (same values, or empty body) → returns view, no audit row.
- [ ] Step 2: run it, see it fail. `cd apps/api && DATABASE_URL=postgresql://postgres:admin@localhost:5432/aidn_v2_meet2_test npx tsx --test src/modules/account-requests/applicant-account-update.db.test.ts`
- [ ] Step 3: implement helper, service (spec §4: `db.transaction`, `.for('update')` select, duplicate check with ``sql`lower(${applicants.email}) = ${email}` `` and `ne(applicants.id, id)`, catch `isUniqueViolation` → `APPLICANT_EMAIL_EXISTS`, `logAudit(..., tx)`), controller, route, error codes. Non-positive-integer `:id` → `APPLICANT_NOT_FOUND`.
- [ ] Step 4: HTTP test (pattern: `apps/api/src/modules/applicant-actions/applicant-actions.http.test.ts` - express + cookie-parser + the router, staff cookie from `signAccessToken`; send `Origin` is not needed since the route uses `authenticate`): no cookie 401; role `reception` 403; `dn_agent`, `dn_supervisor`, `SU` 200 (DB-gated); body with `organisationId`, `password`, `passwordHash`, `active: false` plus a name change → 200, only the name changed; duplicate → 409 with `APPLICANT_EMAIL_EXISTS` message; invalid email / blank name / bad contact order → 400. Use real staff `users` rows only if the audit FK requires it.
- [ ] Step 5: run both files, then `npx tsc --noEmit` and `npx eslint` on the touched files.

### Task 2: Session regression for an email change

**Files:**

- Test: `apps/api/src/modules/account-requests/applicant-email-change-session.http.test.ts`

**Interfaces consumed:** Task 1 route; `applicant-auth.route.ts` (`/login`, `/refresh`, `/me`), cookies `aidn_applicant_access` / `aidn_applicant_refresh`.

- [ ] Step 1: mount `/api/applicant-auth` and `/api/account-requests` routers on one express app (cookie-parser, json). Fixture: organisation, applicant with `bcrypt.hash('Passw0rd!', 10)` and email `old-<run>@test.local`, a staff `users` row with role `dn_agent` whose email equals the applicant's NEW email (identity-domain check). DB-gated; clean up rows and audits.
- [ ] Step 2: login with old email → capture both cookies; decode the access token (`jsonwebtoken.decode`) email = old.
- [ ] Step 3: PATCH email to `New-<run>@Test.local` with a `dn_agent` staff cookie → 200, stored lower-case.
- [ ] Step 4: with the ORIGINAL applicant access cookie: `GET /me` → 200, `id` unchanged, `email` = new (normalised).
- [ ] Step 5: `POST /refresh` with the original refresh cookie → 200; the new access cookie's decoded `email` = new and `applicantId` unchanged.
- [ ] Step 6: login with the old email → 401/expected `handleAuthError` status for `ACCOUNT_NOT_FOUND`; login with the new (normalised) email and the unchanged password → 200.
- [ ] Step 7: run it; it must pass without code changes (if it needs one, report rather than change auth).

### Task 3: Admin UI - edit form in the approved-account panel

**Files:**

- Create: `apps/admin/src/pages/account-requests/ApplicantAccountEditForm.tsx` - props `{ account: ApplicantAccountView; busy: boolean; error: string | null; onCancel(): void; onSubmit(values: { fullName: string; email: string; phone: string | null; contactOrder: string }): void }`; local state initialised from `account`; organisation read-only with the helper sentence; contact order `<select>` with the three frozen labels; labels associated with inputs (`htmlFor`/`id`); `error` shown with `role="alert"`; light client checks (required name/email) are allowed but the API message is always shown.
- Modify: `AccountRequestsPage.tsx` - export `ApplicantAccountView` type for the form (or move it to a tiny `types.ts` in the folder); `ApprovedAccountPanel` gets « Informations du compte » (Nom complet, Email, Téléphone (« Non renseigné » when null), Rôle de contact, Organisation) and an enabled « Modifier »; edit mode swaps that section for the form and hides the suspend/reactivate button; leaving edit mode on account change (reset when `account.id` changes). Page `handleUpdateAccount(id, values)`: `api.patch('/account-requests/applicants/:id', values)`, then `loadAccounts()` keeping `selectedAccountId`, `notify.success('Compte postulant mis à jour.')`, exit edit mode; on error keep edit mode and values, pass `apiErrorMessage(err, 'Modification du compte impossible.')` to the form. Keep the disabled « Reinitialiser » placeholder as is; remove the old disabled « Modifier » placeholder.
- Test: `apps/admin/src/pages/account-requests/AccountRequestsPage.test.tsx` (mock `../../lib/axios` like `pages/courrier-tasks/CourrierTasksPage.test.tsx`; mock `../../lib/notify`).

- [ ] Step 1: tests - switch to « Comptes approuvés » tab; « Modifier » visible; click → inputs prefilled; organisation shown read-only with the helper sentence and no organisation input; cancel → view mode, no `api.patch`; save → `api.patch` called with the four fields, list refetched, the same account still selected and displaying the new values, success notify; 409 → message « Un compte postulant existe déjà pour cet email. » shown and the typed email still in the input; suspend button still calls `/activation` independently.
- [ ] Step 2: implement; run `cd apps/admin && npx vitest run src/pages/account-requests` and `npx tsc --noEmit`, `npx eslint src/pages/account-requests`.
