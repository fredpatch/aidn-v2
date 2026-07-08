# 🗄️ AIDN v2 — Database Schema

20 tables, all in `apps/api/src/shared/db/schema.ts`. Generated/applied via
`npm run db:generate` + `npm run db:migrate` (see `technical/gotchas.md` for why
`db:migrate` calls a custom script instead of the `drizzle-kit` CLI directly).

## Enums

`internal_role`, `request_type`, `dg_circuit_status`, `dg_circuit_entity_type`,
`request_status` (includes `cancelled`, added mid-Sprint-1 — see decisions.md),
`phase_code`, `phase_status`, `meeting_type`, `meeting_status`,
`document_template_key` (added Sprint 2),
`formal_document_slot`, `document_submission_status`, `document_verdict`,
`inspection_verdict`, `payment_proof_status`, `payment_rejection_action`,
`certificate_type`, `certificate_status`, `document_owner_type`,
`account_request_status`, `applicant_contact_order`,
`notification_recipient_type`, `notification_channel`, `report_format`,
`report_trigger`, `ai_analysis_status`, `parameter_type`

## Tables (M13 - auth/users)

- **`users`** — staff accounts. `employeeCode` (matricule), `passwordHash` (nullable
  until first login), `otpHash`/`otpExpiresAt`, `firstLogin`, `failedAttempts`,
  `lockedUntil`
- **`user_roles`** — join table, multi-role per user (unique on `userId + role`)
- **`system_parameters`** — admin-configurable values (OTP expiry, lockout policy,
  DG-circuit alert threshold) instead of hardcoded constants

## Tables (M13 - organisations/applicants)

- **`organisations`** — `normalizedName` has a unique index for dedup (prevents the
  same real-world org being registered under name variants)
- **`applicants`** — portal accounts, `contactOrder` (primary/secondary/tertiary) is
  a *label only*, never an access-control tier — all contacts of one organisation
  have strictly equal permissions
- **`account_requests`** — public registration flow (not yet wired to any endpoint —
  M13/Sprint 12). Partial unique index: one *pending* request per `contactEmail`

## Tables (M1 - intake & circuit)

- **`requests`** — the demande itself. **Partial unique index**
  `requests_one_active_per_organisation_idx` on `organisationId`
  `WHERE status NOT IN ('rejected','completed','cancelled')` — this is the actual
  DB-level enforcement of "one active demande per postulant," not just an
  application-layer check
- **`dg_circuit_documents`** — reusable across M1 (intake) and M4 (formal letter);
  `entityType` distinguishes which. Unique on `(dnAgentId, scheduledAt)` doesn't apply
  here (that's `meetings`) — this table's uniqueness is `(entityType, requestId)`

## Tables (M3-M7 - phases)

`phases`, `meetings` (unique on `(dnAgentId, scheduledAt)` — the M10 hard-conflict
rule; `status` includes `scheduled` as the real initial value, not just `held`/
`no_show`/`rescheduled`/`file_cancelled`), `preliminary_evaluation_forms`
(`templateId` FK added Sprint 2, points at `document_templates`),
`formal_request_documents`, `document_evaluations`, `site_inspections`, `payments`,
`certificates` — **M3 (Phase Préliminaire) is built** (phases open/close, meetings
scheduled/statused, declaration made-available/submitted); M4-M7 still model-only.

## Table: `document_templates` (added Sprint 2, ahead of M4)

Blank template forms DN makes available for applicants to download and fill —
distinct from `formal_request_documents`, which holds the applicant's *filled-in*
submissions. One row per `key` (unique), `active` flag, history versioned via the
M8 `document_versions` pattern like every other upload point. `documentTemplateKeyEnum`
seeded with 4 keys: `preliminary_evaluation_declaration` (M3, in use) plus
`dn_air_r2_3_f_e_010/011/012` (M4, table ready but no UI/endpoint use yet — see
`project/decisions.md` for why this was generalized beyond M3's immediate need).

## Tables (M8, M11, M12, M13 - cross-cutting)

`document_versions` (generic version/trash pattern, keyed by
`ownerType + ownerId`), `notifications`, `reports`, `audit_logs`

## Real fix applied mid-session

`request_status` originally had no `cancelled` value. Adding it via
`ALTER TYPE ... ADD VALUE` in the same migration transaction that also created the
partial unique index referencing it triggers a genuine Postgres error:
`unsafe use of new value "cancelled" of enum type request_status` — Postgres
forbids using a brand-new enum value in the same transaction that added it. Since
this was pre-production (no real data), the fix was to collapse everything into one
fresh migration (drop DB, regenerate) rather than special-case a multi-step enum
migration. If this schema already has production data when a similar situation
arises, a two-step migration (add value, commit, then use it) will be needed instead.
