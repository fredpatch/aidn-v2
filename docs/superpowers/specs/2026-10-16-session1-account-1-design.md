# SESSION1-ACCOUNT-1 — Modifier les informations d'un compte postulant

Status: implemented. Base: `2277c6f` (after BUG-PORTAL-INTAKE-1).

## 1. Audit findings (verified against the repository)

- `applicants`: `id, organisationId, fullName varchar(200), email varchar(255) UNIQUE (case-sensitive), phone varchar(50) null, passwordHash, contactOrder enum(primary|secondary|tertiary), active, createdAt`. No `updatedAt`; none is added.
- M13 routes (`account-requests.route.ts`) sit behind `authenticate, requireRole('dn_agent','dn_supervisor','SU')`: list applicants, approve, reject, `PATCH /applicants/:id/activation`. No edit endpoint.
- Email normalisation already exists: `cleanEmail = trim().toLowerCase()` in `account-requests.service.ts` (submission and stored `contactEmail`). The only email syntax rule is an inline regex in `bootstrap.controller.ts` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
- Applicant-email uniqueness is checked only against `applicants` (submission, approval). `users` is never consulted; staff and applicant are separate identity domains.
- `logAudit(params, executor = db)` accepts a transaction.
- Email claim audit: no code reads `req.applicant.email` or `ApplicantTokenPayload.email` for any decision. Ownership uses `applicantId` / `organisationId`. `GET /applicant-auth/me` and `POST /applicant-auth/refresh` reload the applicant by `applicantId` and sign from the current row. Login looks up `applicants.email = <input>` **without normalising the input** (pre-existing; out of scope, see §8).
- M13 has no automated tests today.
- Admin `AccountRequestsPage.tsx` (1136 lines) keeps local view types, calls `api` directly; `ApprovedAccountPanel` shows the account with a disabled « Modifier » placeholder and the suspend/reactivate button. `CONTACT_ORDER_LABELS` hold the frozen wording.

## 2. Field and rule matrix

| Field | Editable | Normalisation | Validation (backend authoritative) | Error |
|---|---|---|---|---|
| fullName | yes | `trim()` | non-empty, ≤ 200 | `APPLICANT_NAME_REQUIRED` 400 / `APPLICANT_NAME_TOO_LONG` 400 |
| email | yes | `trim().toLowerCase()` (shared `normalizeEmail`) | non-empty, shared `isValidEmail` regex, ≤ 255; unique among **other** applicants compared on `lower(email)`; `users` never queried | `INVALID_APPLICANT_EMAIL` 400 / `APPLICANT_EMAIL_EXISTS` 409 |
| phone | yes | `trim() \|\| null`; `null` or `''` clears | string or null, ≤ 50 | `INVALID_APPLICANT_PHONE` 400 « Téléphone invalide. » (wrong JSON type) / `APPLICANT_PHONE_TOO_LONG` 400 « Le téléphone ne doit pas dépasser 50 caractères. » |
| contactOrder | yes | none | exactly `primary` / `secondary` / `tertiary` | `INVALID_CONTACT_ORDER` 400 |
| organisationId, password/passwordHash, active, organisation fields | no | — | ignored if sent (whitelist) | — |
| applicant | — | — | must exist (`:id` not a positive integer within int4, i.e. ≤ 2147483647 → not found) | `APPLICANT_NOT_FOUND` 404 |

PATCH semantics: each of the four fields is optional; absent means unchanged. A body with none of them, or with values equal to the stored ones after normalisation, is a no-op.

Contact order is descriptive only; nothing reads it for permissions.

## 3. API contract

`PATCH /api/account-requests/applicants/:id` — same guard as the other M13 management routes (`dn_agent`, `dn_supervisor`, `SU`; 401 unauthenticated, 403 other roles).

Body: `{ fullName?: string; email?: string; phone?: string | null; contactOrder?: 'primary'|'secondary'|'tertiary' }`. A present field of the wrong JSON type is a validation error of that field.

Response 200: the updated `ApplicantAccountView` (same shape as the list rows). Errors per §2, through `handleAccountRequestsError`.

## 4. Service and atomicity

`updateApplicantAccount(id, input, actorUserId)` in one `db.transaction`:
1. `SELECT … FOR UPDATE` the applicant (missing → `APPLICANT_NOT_FOUND`);
2. normalise and validate the present fields;
3. compute actually changed fields (compare normalised values with the row);
4. no change → return the current view, **no audit row** (harmless idempotent success);
5. email changed → `lower(email) = $new AND id <> $id` in `applicants` → `APPLICANT_EMAIL_EXISTS`; a unique violation at UPDATE (race) maps to the same error;
6. `UPDATE applicants SET <changed fields only>`;
7. `logAudit({ userId: actor, action: 'APPLICANT_ACCOUNT_UPDATED', module: 'M13', entityId: id, details: { changedFields, changes: { field: { from, to } } } }, tx)` — never password data.

Any failure rolls back both the update and the audit.

## 5. Sessions

No forced logout. After an email change: the current access token keeps the old `email` claim until it expires (unused for decisions); `/me` returns the new email; refresh signs a token with the new email; the next login needs the new email with the unchanged password; the old email no longer logs in. A staff account with the same email changes none of this.

## 6. UI (Comptes postulants → Comptes approuvés)

The detail panel gets an « Informations du compte » section (Nom complet, Email, Téléphone, Rôle de contact, Organisation) with « Modifier » enabled. « Modifier » switches the section to a prefilled form (Nom complet, Email, Téléphone, Ordre de contact as a select with the three frozen labels); the organisation stays read-only with « L'organisme associé ne peut pas être modifié depuis cette fiche. »; actions « Annuler » / « Enregistrer les modifications ». Success: refetch the list, keep the same account selected, success toast, leave edit mode. Failure: keep the typed values, show the API message inside the form. Suspend/reactivate stays outside the form and is hidden while editing. Edit form lives in its own component file; no API module extraction.

## 7. Tests

Service/DB (test DB): the 19 cases of the brief. HTTP: DN agent, DN supervisor, SU → 200; other role 403; no cookie 401; duplicate 409; validation 400. Session regression over HTTP with the real applicant-auth and account-requests routers. Admin vitest for the panel/page behaviours listed in the brief.

## 8. Out of scope / residual

Organisation reassignment; password reset; token revocation; login input normalisation (`applicant-auth.service.login` compares the raw input, so a mixed-case login fails — pre-existing, all stored emails are lower-case); no migration.
