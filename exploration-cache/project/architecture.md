# 🏗️ AIDN v2 — Architecture

## Monorepo layout

```
aidn-v2/
├── apps/
│   ├── api/       Express + TypeScript + Drizzle ORM
│   ├── admin/     React 18 + Vite + Tailwind — internal ANAC (reception, DN, R3, S5, SU)
│   └── portal/    React 18 + Vite + Tailwind — postulant (applicant)
├── packages/
│   └── shared/    Module codes + status enums, consumed by all three apps
├── exploration-cache/
├── docs/TASKS.md  Master sprint backlog (NOT exploration-cache/tasks/ — see note below)
```

**Deliberate difference from SICOT**: task tracking lives at `docs/TASKS.md` (repo root),
not `exploration-cache/tasks/`. This was decided in Sprint 0 before the exploration-cache
convention was fully mirrored, and there's no value in migrating it now — one master
backlog file, referenced from `index.md` below, is simpler than two competing sources.

## Stack

| Layer | Technology |
|---|---|
| Frontend (admin + portal) | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express 5, TypeScript |
| ORM | Drizzle ORM (`drizzle-kit@0.31.10` — see `technical/gotchas.md`) |
| Database | PostgreSQL |
| Auth (staff) | Matricule + OTP first-login, bcrypt, JWT access(15m)/refresh(7d) in httpOnly cookies |
| Auth (applicant) | Email + password, separate JWT shape with a `kind` discriminator |
| Scheduled jobs | node-cron |
| Email | Nodemailer — env var names match SICOT's (`SMTP_HOST/PORT/USER/PASS/FROM`) |
| UI design system | react-hook-form + zod, framer-motion, lucide-react, shadcn-style hand-written primitives |

**Code is entirely in English** (variables, functions, components); only UI text is
French. See `technical/conventions.md`.

## Auth flow (two separate systems, one API)

AIDN has **two distinct identity types** sharing one Express server:

- **Staff** (`users` table): matricule-based login. First login requires an OTP emailed
  by an admin-created account; sets a password on first use. Multi-role via a
  `user_roles` join table (not a single column, unlike SICOT) — a user can hold
  `reception` + `dn_agent` simultaneously, for example.
- **Applicant** (`applicants` table): email + password only, no OTP. Real applicant
  *account creation* (self-registration, anti-bot, organisation dedup) is M13/Sprint 12
  — not built yet. Applicants must already exist in the DB.

Both token types carry a `kind: "staff" | "applicant"` field specifically so a staff
token can never be replayed where an applicant token is expected, or vice versa —
added after a real gap was found (see `technical/gotchas.md` #6).

**Endpoints that accept either** (e.g. `POST /api/requests`, the demande submission
endpoint) use `authenticateEither` middleware, since M1 requires the same entry point
whether the postulant self-submits via the portal or reception enters a physical
drop-off manually. Since admin and portal share a top-level domain in this setup,
`authenticateEither` uses the request's `Origin` header (compared against
`PORTAL_ORIGIN`) to check the *matching* cookie first, so a stale staff cookie can't
silently win over a genuine applicant request — see `technical/gotchas.md` #19.

## Data flow example — M1 demande submission

1. Applicant (or staff, manually) uploads a file → `POST /api/uploads` (multer, local
   disk, served back via `/uploads/*` static route)
2. `POST /api/requests` with the returned `fileUrl` → creates a `requests` row +
   a `dg_circuit_documents` row (status `submitted`) + a `document_versions` row
3. Reference generated as `DEM-YYYY-MM-DD-ORGCODE-NN` (see `project/decisions.md`)
4. Staff calls `mark-signed` → `mark-pending-review` to advance the DG circuit
5. A daily cron (`jobs/dg-circuit-alert.job.ts`) flags any `dg_circuit_documents` stuck
   in `signed` past a configurable threshold, writing to `notifications` (email
   sending itself is Sprint 10)

## Env vars (`apps/api/.env`)

```
PORT, CORS_ORIGIN, DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
GEMINI_API_KEY
PORTAL_ORIGIN   added Sprint 2 — used by authenticateEither to pick which cookie to
                trust first (technical/gotchas.md #19); NOT yet in .env.example, only
                in the local .env — add it there before this is handed to anyone else
```
