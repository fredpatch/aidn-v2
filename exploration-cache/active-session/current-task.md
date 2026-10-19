# Current Task

**Session date**: 2026-10-08

> **2026-10-19 ROLE-ANALYTICS-1C (implemented, validated; single commit):** courrier and dn_circuit role analytics providers (history by circuit timestamp + audit actor, service durations, current queue state, recent activity); finance / inspection still 501 (1D / 1E). See decisions #24. No migration, no UI.
>
> **2026-10-16 ROLE-ANALYTICS-1B (implemented, validated; single commit):** DB sessions pinned to UTC, Libreville analytics periods, audit-event catalogue, `/analytics/overview` SLA targets from parameters + B1, role analytics contract and `/api/analytics/roles/:domain` (no provider yet). Next: 1C providers (courrier, DN circuit). Check `SHOW TimeZone` on staging (gotchas #27).
>
> **2026-10-16 SESSION1-ACCOUNT-1 (implemented, validated; single feature commit):** admin edits an approved applicant's name, email, phone and contact order (`PATCH /api/account-requests/applicants/:id`), email unique among applicants, update + audit atomic, sessions not revoked (see decisions #22). No migration. Deferred: login input normalisation, optimistic concurrency on the edit form.
>
> **2026-10-16 BUG-PORTAL-INTAKE-1 (implemented, validated; single commit):** `authenticateEither` picks the session by calling app (Origin, else Referer) - portal -> applicant only, admin -> staff only, unknown app with two valid sessions -> 401 `AMBIGUOUS_SESSION`. Closes the 2026-10-15 open hardening item below (see decisions #21).
>
> **2026-10-16 SESSION1-COCKPIT-1 (implemented, validated; single feature commit after the whole-branch review):** role work queues as home cockpits - Réception / Assistant DG, Assistante DN, Finance and Cellule Inspection land on their queue (`homeFor`), shared operational contract with `{ items, counts }`, role dashboards and their three API summaries deleted, B1-B6 fixed (see changelog, decisions #20). No migration. Deferred: Finance server-side history window, portal DG wording.
>
> **2026-10-16 SESSION1-UX-1 (implemented, validated; committed a4e353d):** applicant actions and operational next actions - server-ordered `ApplicantAction[]` (`GET /api/applicant/actions`), portal « Actions requises » replacing the two meeting banners, passive phase wording, admin `OperationalCallout` with typed owners and `canAct`, Demandes cockpit D9 next actions (see changelog, decisions #19). No migration. Deferred: SESSION1-COCKPIT-1 scope, app-wide UTC parser for `timestamp` columns, parked minors in the plan ledger.
>
> **2026-10-15 SESSION1-MEET-2 (committed 658435f):** signed CR return - the applicant returns the signed copy of the M3/M4 meeting compte rendu (`POST /meetings/:id/signed-report`, `meeting_report_signed` chain, DN CR frozen once signed; see changelog, decisions #18). Deploy: `npm run db:migrate` (0010). Deferred: notifications, CR rectification mechanism.
>
> **2026-10-14 SESSION1-MEET-1 (committed):** applicant confirmation / counter-proposal of M3/M4 meetings - all 9 slices done and validated (see changelog, decisions #17). Deploy: `npm run db:migrate` only (migration 0009, no backfill). Deferred: notifications/e-mail.
>
> **2026-10-15 local env fix:** portal submission refused as « saisie manuelle » because the local `apps/api/.env` lacked `PORTAL_ORIGIN` / `ADMIN_ORIGIN` (gotchas #26). Open: `authenticateEither` still falls back to the staff session when the applicant token is expired - hardening proposed, awaiting approval.

> **2026-10-14 SESSION1-M1-1 (committed 6b3fc84):** Directeur DN annotation circuit added between the DG return and M3 (`dn_director_annotation`, migration 0008 + post-migration script `db:backfill:dn-annotation`, `/api/dn-annotation-tasks`, admin « Circuit Directeur DN »). DG return no longer unlocks M3. See `project/decisions.md` #16. Deferred: DN alert rule, notifications, SESSION1-MEET-1.
>
> **2026-10-14 SESSION1-ROLE-1 (committed 489ef4d):** `assistant_dn` role added (no permissions yet, M1-1 owns them); `r3_agent`/`s5_agent` now display as Agent CI / Agent Finance via `@aidn/shared` role labels; visible R3/S5 wording replaced by métier terms. See `project/decisions.md` #15.
**Status**: K4 atomic payment decisions implemented; preparing commit and push.

## Current Repo Truth

- Current branch: `main`, tracking `origin/main`.
- Latest committed work before this batch: `f49d1c0 feat(admin): k3 - confirmation step before definitive dossier rejection`.
- Current working tree contains K4 API/shared/admin changes plus docs/cache updates.
- Repo tree plus Git history remain the technical source of truth; Notion can lag and should be reconciled only after code/cache are updated.

## K4 Scope

K4 follows K3's definitive dossier-rejection confirmation. It keeps the same routes and admin flow, but hardens the server-side payment decision path.

- M5, M6, and M7 `rejectPayment` now share `modules/payments/payment-decisions.ts`.
- Rejections lock the payment row, verify that the phase belongs to the calling module, and write payment/request/audit changes inside one transaction.
- `validatePayment` now updates only if the payment is still `pending_validation`; losing races return `PAYMENT_NOT_PENDING`.
- M7 validation no longer creates a certificate after a competing rejection has already won.
- The dossier-cancellation reason prefix is shared through `@aidn/shared` via `dossierRejectionReason()`, used by API storage and the admin K3 preview.
- PostgreSQL-backed tests cover rejection, rollback, module isolation, non-pending payments, deterministic validate/reject races, and simultaneous decisions.

## Validation To Run Before Push

- `npm run typecheck --workspaces --if-present`
- `npm run test --workspace=apps/api`
- `npm run test --workspace=apps/admin`
- `npm run build`

If `DATABASE_URL` is not set, the K4 PostgreSQL race tests skip themselves by design.

## Known Follow-Up

- K5: add the same module check to `validatePayment` that K4 added to rejection.
- K5: make M7 validation and certificate creation fully atomic.
- Payment API hardening: reject blank rejection reasons and unknown `rejectionAction` values before they reach PostgreSQL enum errors.
