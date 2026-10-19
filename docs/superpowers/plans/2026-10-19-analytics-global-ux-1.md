# ANALYTICS-GLOBAL-UX-1 Implementation Plan

**Goal:** make `/analytique` and the analytics PDF readable (human durations, explicit SLA comparison, glossary,
AIDN — OMA branding, SVG charts) without touching any calculation, SLA value, workflow or dependency.

**Architecture:** one calendar-duration formatter in `@aidn/shared` (moved from `/pilotage`), used by admin and the
PDF renderer. The overview metrics gain a backwards-compatible numeric `rawValue` + `unit` (duration metrics only);
`value` strings stay as they are for existing consumers (Excel). Charts and SVGs receive raw numeric days and format
labels only.

**Tech stack:** React + Chart.js (existing), Express + HTML/Puppeteer PDF (existing), node:test, vitest.

## Audit findings

- `AnalyticsMetric.value` is a preformatted string (`formatDays` -> `"4.8 j"`); the numbers behind the four duration
  metrics are computed in `getAnalyticsOverview` and then lost.
- `phaseStats.averageClosedDurationDays`, `averageActiveAgeDays`, `delayedDossiers.delayDays` (decimal, over SLA),
  `durationTrend.*DurationDays` are raw numbers (days, one decimal).
- PDF: `renderHtml` (private) prints raw decimals; header "AIDN - Direction de la Navigabilité"; trend only as a table.
- Excel: metric `value` strings in an indicator sheet; phase / delay / trend columns are numeric cells.
- `/pilotage` already has `formatCalendarDuration` (admin, `pilotageCopy.ts`).

## Tasks

1. **Shared formatter + glossary** (`packages/shared/src/analytics-format.ts`): move `formatCalendarDuration`;
   add `ANALYTICS_GLOSSARY` (KPI, SLA, moyenne, médiane, jours calendaires, jours ouvrés). `/pilotage` imports it
   (re-export, same behaviour, its tests unchanged).
2. **API contract** (`analytics.types.ts`, `analytics.service.ts`): `AnalyticsMetric.rawValue?` / `unit?`
   (`'calendar_days'`) on `average_processing_duration`, `median_processing_duration`, `dg_wait`, `inactivity`; the
   `dg_waiting` blocker helper uses the shared formatter. No calculation change.
3. **Admin `/analytique`**: metric cards show `formatCalendarDuration(rawValue)` for `calendar_days`; phase list
   « Moyenne : … · Cible SLA : N jours calendaires »; delayed table humanized; KPI panel = glossary + targets; page
   identity « AIDN — OMA · Analytique & rapports »; charts: trend tooltip / y-axis title / « Moyenne » « Médiane »,
   phase chart with a « Cible SLA » dataset (red average above target kept), pure chart builders exported for tests.
4. **PDF** (`renderers/analytics-report-svg.ts` + `analytics-report-pdf.ts`): exported pure `renderTrendSvg`,
   `renderPhaseDurationSvg`, `renderAnalyticsReportHtml`; branding « AIDN — OMA » + institutional line; « Repères de
   lecture »; charts per report (full_report: trend + phases; processing_delay: trend + phases; sla: phases; others:
   none); clearer table headers; humanized durations; `page-break-inside: avoid`; escaped text, finite coordinates.
5. **Excel**: unchanged (numeric cells stay numeric).
6. **Validation**: admin tests / typecheck / build / lint; API renderer tests / typecheck / build / lint; full API
   suite serially.

## Review focus

Empty or all-null trend, one trend point, equal min/max, null phase average, zero SLA breaches; no `NaN` /
`Infinity` / `undefined` in markup; grayscale readability (dashes and patterns, values printed next to bars).
