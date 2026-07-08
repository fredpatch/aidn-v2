# ⚡ AIDN v2 — Cheat Sheet

## Start dev

```bash
npm install                 # postinstall auto-builds packages/shared
cp apps/api/.env.example apps/api/.env   # then fill in real values
npm run db:generate
npm run db:migrate          # calls scripts/migrate.ts, NOT drizzle-kit CLI directly
npm run seed:params --workspace apps/api   # wraps seed-system-parameters.ts (added this session)
npm run dev                 # API :4000, admin :5173, portal :5174
```

## Where is…

| Thing | Path |
|---|---|
| ANAC color tokens | `apps/admin/src/index.css` and `apps/portal/src/index.css` → `:root {}` (also duplicated in each app's `tailwind.config.js`) |
| Axios instance | `apps/admin/src/lib/axios.ts` and `apps/portal/src/lib/axios.ts` (both queued-refresh versions, current) — both apps' `lib/api.ts` deleted, migration complete |
| Staff auth context | `apps/admin/src/hooks/useAuth.tsx` |
| Applicant auth context | `apps/portal/src/hooks/useApplicantAuth.tsx` |
| DB schema | `apps/api/src/shared/db/schema.ts` |
| DB client | `apps/api/src/shared/db/index.ts` |
| Server entry | `apps/api/src/server.ts` |
| JWT signing/verifying | `apps/api/src/shared/utils/jwt.ts` (staff and applicant tokens both here) |
| Auth middleware | `apps/api/src/shared/guards/auth.middleware.ts` (`authenticate`, `authenticateApplicant`, `authenticateEither`) |
| Migration runner | `apps/api/src/scripts/migrate.ts` |

## Key API endpoints (Sprint 0-1)

```
GET  /api/bootstrap/status
POST /api/bootstrap/init

POST /api/auth/login              matricule + (otp | password)
POST /api/auth/set-password       first-login only
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me

POST /api/applicant-auth/login    email + password
POST /api/applicant-auth/refresh
POST /api/applicant-auth/logout
GET  /api/applicant-auth/me

GET  /api/users                   SU only
POST /api/users                   SU only, sends OTP
PATCH /api/users/:id
PATCH /api/users/:id/activation
POST /api/users/:id/reset-otp

POST /api/uploads                 multipart, field 'file', either auth type

POST /api/requests                 either auth type; applicant submits for self,
                                    staff must pass applicantId
GET  /api/requests                 staff only, all requests
GET  /api/requests/mine            applicant only, own history
GET  /api/requests/:id
POST /api/requests/:id/mark-signed
POST /api/requests/:id/mark-pending-review
POST /api/requests/:id/cancel      either auth type; applicant ownership enforced
POST /api/requests/:id/replace-document
```

## Key API endpoints (Sprint 2 — Phase Préliminaire, M3)

```
POST /api/phases/requests/:requestId/start-preliminary-phase   dn_agent/dn_supervisor/SU
GET  /api/phases/requests/:requestId/phase                     dn_agent/dn_supervisor/SU
GET  /api/phases/:id                                           dn_agent/dn_supervisor/SU
POST /api/phases/:id/close                                     dn_agent/dn_supervisor/SU

POST  /api/meetings                    dn_agent/dn_supervisor/SU — hard-conflict (same
                                        agent+exact slot) blocked by DB constraint
PATCH /api/meetings/:id/status         dn_agent/dn_supervisor/SU — held/no_show/
                                        rescheduled/file_cancelled
POST  /api/meetings/:id/reschedule     dn_agent/dn_supervisor/SU
GET   /api/meetings/:id                either auth type
GET   /api/meetings/:id/ticket         either auth type — HTML ticket, not a stored PDF

GET  /api/document-templates           dn_agent/dn_supervisor/SU — management list
POST /api/document-templates           dn_agent/dn_supervisor/SU — upsert by key
GET  /api/document-templates/:key      either auth type — download

GET  /api/preliminary-evaluation/by-request/:requestId   either auth type — portal's
                                                          one-call bundle (phase+meeting+form)
GET  /api/preliminary-evaluation/:phaseId                either auth type
POST /api/preliminary-evaluation/:phaseId/make-available  dn_agent/dn_supervisor/SU
POST /api/preliminary-evaluation/:phaseId/submit          either auth type
```

**Note**: `preliminary-evaluation` is deliberately mounted at its own top-level
prefix, not nested under `/api/phases/*` — `phases.route.ts` applies a blanket
`router.use(authenticate, requireRole(...))` with no path restriction, which would
silently block applicant access if anything else were mounted underneath it. See
`technical/gotchas.md` #16.

## Rules

| ❌ Never | ✅ Instead |
|---|---|
| Trust `applicantId` from an applicant's request body | Always take it from `req.applicant.applicantId` |
| Add `ignoreDeprecations` to fix a `baseUrl` warning | Remove `baseUrl`, use `"@/*": ["./*"]` in `paths` |
| Run `npm run db:migrate` and trust a silent success | It calls `scripts/migrate.ts`, which surfaces real Postgres errors — the raw `drizzle-kit` CLI does not (see gotchas.md) |
| Copy SICOT's `tsconfig.base.json` verbatim | Strip `ignoreDeprecations` — invalid on TS versions that actually resolve here |
| Assume `error.code` on a Drizzle-thrown error | Check `error.cause.code` — Drizzle wraps the real pg error |
| Destructure `req.body` directly in a controller | Destructure `req.body ?? {}` — no `Content-Type`/body means `req.body` is `undefined`, not `{}` (`technical/gotchas.md` #15) |
| Give a router a blanket `router.use(authenticate, ...)` if another router might get nested under its mount path | Scope auth middleware per-route, or keep mount prefixes strictly non-overlapping (`technical/gotchas.md` #16) |

## Sprint status

```
✅ Sprint 0  — Feasibility study, patterns, conventions, stack, schema, scaffold
✅ Sprint 1  — Intake & Circuit DG (M1+M2), full API + admin/portal UI
✅ Prereq    — Auth (staff+applicant), Bootstrap, Users management, system_parameters
✅ Sprint 2  — Phase Préliminaire (M3), full API + admin/portal UI, plus
               document_templates module built ahead of M4
⏳ Sprint 3-12 — not started
```
