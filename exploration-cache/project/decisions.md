# 🎯 AIDN v2 — Key Decisions & Rationale

Non-obvious decisions that would otherwise get re-litigated or silently reversed by
a future session. Business-rule decisions (the 13 modules) live in
`project/modules-feasibility.md` — this file is technical/architectural decisions
made *during implementation*, not during the feasibility study.

## 1. PostgreSQL over MongoDB

Locked before Sprint 0 scaffolding. The 13 modules' business rules are relational
integrity problems (one active demande, 11/11 document checklist, certificate
created at payment validation) — better enforced by SQL constraints than app code.
Logged in Notion (Idées & Pistes, Architecture, 2026-07-07).

## 2. Code in English, UI in French

Deliberate divergence from SICOT (which mixes French/English in server code).
AIDN's code — variables, functions, components, comments, endpoints, error codes —
is entirely English. Only what the user sees is French. Documented explicitly in
`technical/conventions.md`'s "Écarts assumés" section.

## 3. Demande reference format: `DEM-YYYY-MM-DD-ORGCODE-NN`

No global incrementing counter — deliberately avoided to sidestep any reset-policy
complexity. `ORGCODE` is the first 4 alphanumeric characters of the organisation's
normalized name, uppercased. `NN` disambiguates the rare case of the same
organisation submitting more than once on the same calendar day (e.g. a rejection
releases the "one active request" rule same-day). Certificates keep the simpler
`CERT-YYYY-XXXX` format (lower volume, no same-day-collision concern).

## 4. "One active demande" enforced at the database level

A partial unique index (`requests_one_active_per_organisation_idx`), not just an
application check. This closes the exact loophole Fred caught during the M1
feasibility study — cancelling by creating a second demande — permanently, since a
bug in application code can no longer bypass it.

## 5. Dual auth systems, one API server

Staff (`users`) and applicants (`applicants`) are structurally different accounts
with different login flows (OTP vs plain password) and different JWT payload
shapes. A `kind: "staff" | "applicant"` field on every token prevents either being
misused as the other. This was a real gap found mid-Sprint-1: the first version of
the requests module was "tested" using a staff SU token standing in for an
applicant, because applicant auth simply didn't exist yet.

## 6. SMTP env var names match SICOT's exactly

`SMTP_HOST/PORT/USER/PASS/FROM` — chosen specifically so Fred's existing SICOT SMTP
credentials can be copied into AIDN's `.env` with zero renaming.

## 7. `db:migrate` calls a custom script, not the `drizzle-kit` CLI directly

See `technical/gotchas.md` #3 for the full story — `drizzle-kit@0.31.10`'s CLI
silently swallows real Postgres errors on migration failure. `apps/api/src/scripts/
migrate.ts` calls `drizzle-orm`'s `migrate()` function programmatically instead,
which surfaces the real error. This is how two genuine Postgres errors (enum
transaction issue, missing `public` schema) got diagnosed instead of staying
invisible.

## 8. UI/UX must structurally match SICOT, not just share color tokens

Early in the AIDN rebuild, "match SICOT's style" was interpreted as reusing its
ANAC color tokens (`--color-anac-navy` etc.) plus generic clean Tailwind forms.
That was an incomplete read of the actual instruction. SICOT's real Bootstrap/
Login/Layout pages use `react-hook-form` + `zod`, `framer-motion` animations,
shadcn-style hand-written primitives (`Button`/`Input`/`Label`), a password-strength
meter, and a collapsible sidebar nav. AIDN's admin and portal apps were rebuilt to
match this structurally, not just palette-wise, once the gap was flagged.

## 9. Users management page added, not originally scoped

Once the Layout/sidebar was being rebuilt to match SICOT, the nav needed a second
real entry beyond "Demandes." The multi-role system (Sprint 1's `user_roles` join
table + full CRUD API) had no UI at all — there was no way to create a
`dn_agent`/`reception` account except via curl. A minimal SU-only Users page
(list, create with multi-role selection, activate/deactivate, reset OTP) was added
to close that gap, since the backend already existed and was tested.

## 10. Axios client hardened with a proper refresh queue (admin + portal)

The original `lib/api.ts` (both admin and portal) used a single shared `refreshing`
promise to de-dupe concurrent 401-triggered refresh calls — functionally OK for one
in-flight request, but any request that arrived *while* a refresh was already running
would still race it instead of being queued behind it cleanly. `lib/axios.ts` (now in
both `apps/admin/src/lib/` and `apps/portal/src/lib/`) replaces this with an explicit
`isRefreshing` flag + a `failedQueue` array: every request that 401s while a refresh
is already in flight is queued and replayed only after that single refresh resolves,
rather than each one kicking off its own check. It also skips the refresh dance
entirely for `/auth/*` (admin) or `/applicant-auth/*` (portal) requests (avoids
refreshing in response to a failed login itself) and redirects to `/login` with a
`session_expired` flag on final failure.
**Finished 2026-07-08**: `apps/portal/src/lib/axios.ts` was created mirroring the
admin version, pointed at `/applicant-auth/refresh`; `useApplicantAuth.tsx` switched
over to it; both now-orphaned `lib/api.ts` files deleted. See `technical/gotchas.md`
#11 and #14, `active-session/blockers.md` resolved-blockers table.

## 11. `document_templates` generalized beyond M3's immediate need, on request

M3 only strictly needs one blank template (the déclaration de pré-évaluation), but
M4's DN-AIR-R2-3-F-E-010/011/012 forms have the identical shape (DN uploads/replaces
a blank form by key, either auth type downloads it, history via the M8 version/trash
pattern). Confirmed with Fred to build the table and module generically now —
`document_templates` keyed by `documentTemplateKeyEnum` — with all 4 keys seeded,
rather than building a one-off M3 feature and repeating the same pattern for M4 next
sprint. Only the M3 key (`preliminary_evaluation_declaration`) has real UI/endpoint
usage yet; the M4 keys are schema-ready for Sprint 3.

## 12. Meeting tickets are server-rendered HTML, not generated PDFs

A real PDF generator is a cross-cutting need — M3, M4, and M6 all want a
downloadable/printable ticket or document. Confirmed with Fred that building it once
properly (later, once the shape of that need is clearer across all three modules)
beats building three throwaway one-off PDF generators now. Sprint 2's meeting ticket
is served as plain HTML at `GET /api/meetings/:id/ticket` — not a stored file, not
a PDF — good enough to view/print from a browser, revisit once M4 or M6 need
something the HTML approach can't do.

## 13. `authenticateEither` prefers the cookie matching request `Origin`

See `technical/gotchas.md` #19 for the full incident. Because admin and portal share
a top-level domain, a browser could legitimately carry both a staff and an applicant
session cookie at once; `authenticateEither` used to always try the staff cookie
first, which could let a stale staff session silently win over a genuine applicant
request. Now it reads `Origin` and checks the matching cookie (staff vs. applicant)
first, falling back to the other only if that one's absent or invalid — with the
old staff-first behavior preserved as a fallback for requests with no recognizable
`Origin` (curl, server-to-server, Postman).
