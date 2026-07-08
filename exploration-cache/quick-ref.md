# ⚡ AIDN v2 - Quick Reference

> One-page overview. For deeper detail see `technical/cheat-sheet.md`.

## 🚀 Start Dev

```bash
npm install                                            # postinstall builds packages/shared
cp apps/api/.env.example apps/api/.env                 # fill in real values
npm run db:generate
npm run db:migrate                                      # scripts/migrate.ts, not the drizzle-kit CLI
npm run seed:params --workspace apps/api               # new script, wraps the tsx call
npm run dev                                             # API :4000, admin :5173, portal :5174
```

## 📁 Where Is…

| Thing | Path |
|---|---|
| ANAC color tokens | `apps/admin/src/index.css` and `apps/portal/src/index.css` |
| DB schema | `apps/api/src/shared/db/schema.ts` |
| Server entry | `apps/api/src/server.ts` |
| Staff auth context | `apps/admin/src/hooks/useAuth.tsx` |
| Applicant auth context | `apps/portal/src/hooks/useApplicantAuth.tsx` |
| Env vars | `apps/api/.env` (copy from `.env.example`) |

## 🎨 Key CSS Classes

```
bg-anac-navy    (primary brand #1B2A5E)
bg-anac-gray    (page background)
text-anac-muted (secondary text)
border-anac-border
bg-anac-danger  (errors #DC2626)
bg-anac-success (success #16A34A)
.card           (white panel, border, shadow, p-6)
.btn-primary    (navy button, legacy utility class - components/ui/button.tsx preferred now)
```

## 🔒 Auth Model

Two separate systems, one API:
```
Staff (users table):      matricule + OTP first-login, multi-role via user_roles
Applicant (applicants):   email + password, no OTP, no roles
```
Both JWTs carry `kind: "staff" | "applicant"` — never interchangeable.

## 📡 Key API Endpoints

```
GET  /api/bootstrap/status
POST /api/bootstrap/init
POST /api/auth/login              matricule + (otp | password)
POST /api/auth/set-password
GET  /api/auth/me
POST /api/applicant-auth/login    email + password
GET  /api/applicant-auth/me
GET  /api/users                   SU only
POST /api/users                   SU only
POST /api/uploads                 multipart, either auth type
POST /api/requests                either auth type
GET  /api/requests/mine           applicant only
POST /api/requests/:id/mark-signed
POST /api/requests/:id/mark-pending-review
POST /api/requests/:id/cancel     either auth type, ownership enforced
```

## 🚫 Rules

| ❌ Never | ✅ Instead |
|---|---|
| Run `drizzle-kit migrate` directly | Use `npm run db:migrate` (→ `scripts/migrate.ts`) |
| Trust `applicantId` from an applicant's request body | Take it from `req.applicant.applicantId` |
| Check `error.code` on a Drizzle-thrown error | Check `error.cause.code` |
| Add `ignoreDeprecations` for a `baseUrl` warning | Remove `baseUrl`, use `"@/*": ["./*"]` |
| Run the shadcn CLI | Hand-write components in `components/ui/` (Tailwind setup incompatible) |

## 📊 Sprint Status

```
✅ Sprint 0  — Feasibility, patterns, conventions, stack, schema, scaffold
✅ Sprint 1  — Intake & Circuit DG (M1+M2), full API + UI (admin + portal)
✅ Prereq    — Auth (staff + applicant), Bootstrap, Users management
⏳ Sprint 2  — Phase Préliminaire (M3) — next up
⏳ Sprint 3-12 — not started
```

## 🔴 Active Notes

- M13 applicant self-registration not built — portal login needs a manually-seeded
  applicant for now
- No browser/visual verification possible from Claude's sandbox — Fred confirms
  UI visually after each diff
- Legacy repo rename (`aidn-v2` → `aidn-v2-legacy`) still pending, non-blocking
