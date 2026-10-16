# ROLE-ANALYTICS-1B — Durcissement temps, SLA et fondation analytics rôle

Status: implemented. Base: `e2250fc`. Source audit: ROLE-ANALYTICS-1A (conversation report, 2026-10-16).

Scope: backend foundation only. No `/pilotage` UI, no KPI providers, no migration.

## 1. Frozen decisions (from the brief)

- Storage basis UTC; business/reporting time zone `Africa/Libreville`; periods are half-open UTC ranges `[start, end)` built from Libreville calendar days; custom dates inclusive for the user.
- Durations default to `calendar_days`; existing exceptions stay: DG overdue alert in `working_days`, phase SLA in `calendar_days`. Every duration carries its unit.
- No `heldAt` in 1B (belongs to 1E if approved).
- RBAC matrix (§6). `dn_supervisor` keeps only `/analytique` + `GET /api/analytics/overview`.
- New role-analytics API returns semantic keys only; French labels belong to the future `/pilotage` UI.

## 2. PostgreSQL UTC session

Finding (1A): columns filled by `defaultNow()` take the DB session time zone; app-written columns are UTC. On the local server (`Europe/Paris`) the two differ by 120 min inside one transaction.

Design: `shared/db/connection.ts` exports `pgConnectionConfig(connectionString)` which adds the libpq startup option `-c TimeZone=UTC` (appended to any `PGOPTIONS`, so the last `-c` wins). The app pool (`shared/db/index.ts`) and every script opening its own pool/client (`migrate`, `db-reset-dev`, `db-status`, `backfill-dn-annotation`, `check-certificate-duplicates`, `check-site-inspection-integrity`) use it. The option is applied at connection start-up: no per-connection query, no race with the first statement, independent of the host or Docker time zone.

Not done: rewriting historical rows. Dev/test simply use the corrected behaviour going forward. Staging/production must be checked (§9 of the changelog/gotcha): `SHOW TimeZone;`, `SELECT now(), now() AT TIME ZONE 'UTC';`, and a comparison of an app-written column with the audit row of the same action (query in gotchas #27). Limitation: a `DATABASE_URL` that itself carries `?options=` overrides the config option (pg parses the URL last).

## 3. Libreville periods

`modules/analytics/period.ts`: `resolveAnalyticsPeriod({ period, from, to }, now)` → `RoleAnalyticsPeriod`.

Libreville = fixed UTC+1 (no DST), the convention already used by `@aidn/shared` `workingDays.ts`; all arithmetic is `Date.UTC` on shifted instants — never server-local `new Date(y, m, d)`.

| Preset | Range (Libreville midnight boundaries) |
|---|---|
| `today` | [D, D+1) |
| `last_7_days` | [D−6, D+1) |
| `last_30_days` | [D−29, D+1) |
| `this_month` | [1st of month, 1st of next month) |
| `previous_month` | [1st of previous month, 1st of month) |
| `custom` | [from, to+1) — `from`/`to` = `YYYY-MM-DD`, inclusive |

`displayFrom` / `displayTo` are the inclusive Libreville dates (`this_month` shows the whole month). Rejected with `400 INVALID_ANALYTICS_PERIOD`: missing/unknown preset, custom without both dates, not a real `YYYY-MM-DD`, `from > to`, more than 366 calendar days.

## 4. Business-event catalogue

`modules/analytics/audit-events.ts`: semantic event → current and legacy audit actions, verified against emitters (not names). `actionsFor(event)` returns both lists. Each action belongs to at most one event; each is in `AUDIT_ENTITY_BY_ACTION` (dossier link resolvable).

| Event | Current | Legacy | Actor |
|---|---|---|---|
| `courrier.sent_to_dg` | `COURRIER_SENT_TO_SIGNATURE` (courrier cockpit), `DG_CIRCUIT_SENT_TO_SIGNATURE` (requests route) | — | staff |
| `courrier.dg_return_recorded` | `DG_ANNOTATION_RETURNED` (intake), `COURRIER_SIGNED_RETURNED` (M3 declaration, M4 letter), `FORMAL_LETTER_SIGNED` (M4 two-step) | `DG_CIRCUIT_SIGNED`, `DG_CIRCUIT_SIGNED_RETURNED` | staff |
| `dn_circuit.sent_to_director` | `DN_ANNOTATION_SENT_TO_DIRECTOR` | — | staff |
| `dn_circuit.return_recorded` | `DN_ANNOTATION_RETURNED` | — | staff |
| `finance.invoice_uploaded` | `INVOICE_UPLOADED` | — | staff |
| `finance.proof_uploaded` | `PAYMENT_PROOF_UPLOADED` | — | applicant (not recorded) |
| `finance.payment_validated` | `PAYMENT_VALIDATED` | — | staff |
| `finance.payment_rejected` | `PAYMENT_REJECTED` | — | staff |
| `inspection.visit_held` | `SITE_VISIT_HELD` | — | staff |
| `inspection.verdict_submitted` | `INSPECTION_VERDICT_SUBMITTED` | — | staff |

Deliberately not catalogued: `FORMAL_LETTER_TRANSMITTED` / `DG_CIRCUIT_PENDING_REVIEW` (hand-over to DN exists only on the two-step paths — a count would be partial); `MEETING_SCHEDULED` / `MEETING_HELD` / `MEETING_NO_SHOW` (shared by all meeting types; needs the meeting row to know it is a site visit).

## 5. Analytics helpers, SLA parameters, B1

- `modules/analytics/metrics.ts`: `inPeriod`, `daysBetween`, `average`, `median`, `percent`, `buildTrend` moved unchanged from `analytics.service.ts`.
- SLA targets: `THRESHOLD_KEYS` gains `phaseM3Days`…`phaseM7Days` (`dashboard_sla_phase_m*_days`, defaults `DASHBOARD_SLA_DEFAULTS`); `getAnalyticsOverview` reads them with the existing `loadThresholds` (one query). `PHASE_TARGETS` is removed.
- Legacy assumptions left unchanged and documented: 45-day processing warning, 15-day inactivity, aging buckets.
- B1 (current blockers only): open phases (`activeCount`, `averageActiveAgeDays`, `slaBreachCount`, `outside_sla`, `delayed_phases`, `delayedDossiers`), DG waiting and payment blockers now consider only dossiers that are not closed (`isDossierClosed`, the K7 list). Historical metrics (closed phases in the period, processing durations, SLA compliance of closed phases) keep closed dossiers. Meeting/inspection follow-ups already used `isActiveDossier`. Response shape unchanged, so reports keep working; numbers drop where closed dossiers were counted.

## 6. Role analytics contract and route

Shared (`packages/shared/src/role-analytics.ts`): domains, scopes, presets, units, reliability, `RoleAnalyticsPeriod`, `…Metric`, `…Warning` (deep link `href`, no label), `…Activity` (`eventKey`), `…TrendPoint`, `…Trend`, `…Overview`, event-key union, and the access matrix:

| Domain | mine | service |
|---|---|---|
| courrier | reception, assistant_dg, SU | reception, assistant_dg, SU |
| dn_circuit | assistant_dn, SU | assistant_dn, SU |
| finance | s5_agent, SU | s5_agent, SU |
| inspection | r3_agent, SU | SU |

(SU `mine` = SU's own actions.)

Route: `GET /api/analytics/roles/:domain?scope=&period=&from=&to=`, `authenticate` only at router level; `/overview` keeps `requireRole('dn_supervisor','SU')` on its own route. Order: unknown domain → `400 INVALID_ANALYTICS_DOMAIN`; bad scope → `400 INVALID_ANALYTICS_SCOPE`; not granted → `403`; period → `400 INVALID_ANALYTICS_PERIOD`; no registered provider → `501 ROLE_ANALYTICS_NOT_IMPLEMENTED` (no fabricated values). Provider interface `RoleAnalyticsProvider.getOverview(context)`; the registry is empty in 1B.

## 7. Out of scope / follow-ups

Providers (1C–1E), `/pilotage` (1F), `heldAt` (1E), global `/overview` default period still server-local (unchanged by request), `PATCH /meetings/:id/status` accepts a site visit (UI never offers it; backend hardening follow-up).
