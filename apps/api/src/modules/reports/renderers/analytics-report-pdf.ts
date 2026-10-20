import { ANALYTICS_GLOSSARY, PRODUCT_NAME, PRODUCT_SUBTITLE, formatCalendarDuration } from '@aidn/shared';
import { escapeHtml, logoDataUri, renderHtmlToPdf } from '../../../shared/pdf/html-pdf.js';
import type { AnalyticsMetric } from '../../analytics/analytics.types.js';
import type { ReportKey, ReportSnapshot } from '../reports.types.js';
import { renderPhaseDurationSvg, renderTrendSvg } from './analytics-report-svg.js';

/** Analytics report identity: the shared product branding (BRAND-AIDN-OMA-1). */
export const REPORT_BRAND = PRODUCT_NAME;
export const REPORT_INSTITUTION = PRODUCT_SUBTITLE;

const REPORT_NOTES: Record<ReportKey, string> = {
  full_report: 'Vue globale des indicateurs du processus OMA sur la période sélectionnée.',
  processing_delay: 'Analyse centrée sur les durées de traitement et la progression par phase.',
  sla: 'Contrôle du respect des délais cibles et identification des phases hors SLA.',
  bottlenecks: 'Lecture des points de blocage qui ralentissent le traitement opérationnel.',
  inspections: 'Suivi ciblé de la phase Démonstration / Inspection et des comptes-rendus attendus.',
  s5: 'Suivi des paiements, preuves et validations bloquantes côté Finance.',
};

/** Charts per report: summaries only, the tables keep the exact values. */
const REPORT_CHARTS: Record<ReportKey, { trend: boolean; phases: boolean }> = {
  full_report: { trend: true, phases: true },
  processing_delay: { trend: true, phases: true },
  sla: { trend: false, phases: true },
  bottlenecks: { trend: false, phases: false },
  inspections: { trend: false, phases: false },
  s5: { trend: false, phases: false },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Libreville',
  }).format(date);
  return `${formatDate(value)} à ${time}`;
}

/** Display of a metric: a duration metric is formatted from its raw days;
 *  any other metric keeps the API text. */
export function metricDisplayValue(metric: AnalyticsMetric): string {
  return metric.unit === 'calendar_days'
    ? formatCalendarDuration(metric.rawValue ?? null)
    : metric.value;
}

function metricsByKey(snapshot: ReportSnapshot, keys: string[]): AnalyticsMetric[] {
  const allowed = new Set(keys);
  return snapshot.overview.metrics.filter((metric) => allowed.has(metric.key));
}

function metricCards(metrics: AnalyticsMetric[]): string {
  return metrics
    .map(
      (metric) => `
        <article class="card">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metricDisplayValue(metric))}</strong>
          <span>${escapeHtml(metric.helper)}</span>
        </article>`
    )
    .join('');
}

function metricsTable(metrics: AnalyticsMetric[]): string {
  return metrics
    .map(
      (metric) => `
        <tr>
          <td>${escapeHtml(metric.label)}</td>
          <td class="value">${escapeHtml(metricDisplayValue(metric))}</td>
          <td>${escapeHtml(metric.helper)}</td>
          <td>${escapeHtml(metric.sampleLabel ?? '-')}</td>
        </tr>`
    )
    .join('');
}

function renderMetricsSection(title: string, metrics: AnalyticsMetric[]): string {
  if (!metrics.length) return '';
  return `
    <section class="keep">
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr><th>Indicateur (KPI)</th><th>Valeur</th><th>Lecture</th><th>Échantillon</th></tr></thead>
      <tbody>${metricsTable(metrics)}</tbody>
    </table>
    </section>`;
}

function renderGlossary(): string {
  const items = ANALYTICS_GLOSSARY.map(
    (entry) => `
        <div class="term">
          <strong>${escapeHtml(entry.term)}</strong>${entry.meaning ? ` - ${escapeHtml(entry.meaning)}` : ''}
          <span>${escapeHtml(entry.definition)}</span>
        </div>`
  ).join('');
  return `
    <section class="glossary keep">
      <h2>Repères de lecture</h2>
      <div class="terms">${items}</div>
      <p class="hint">Les durées sont exprimées en jours calendaires (1 j = 24 h) ; « 4 j 19 h » se lit 4 jours et 19 heures.</p>
    </section>`;
}

function renderCharts(snapshot: ReportSnapshot): string {
  const charts = REPORT_CHARTS[snapshot.reportKey];
  const blocks: string[] = [];
  if (charts.trend) {
    const svg = renderTrendSvg(snapshot.overview.durationTrend);
    blocks.push(`
    <section class="chart keep">
      <h2>Évolution du délai de traitement</h2>
      <p class="hint">Délai moyen et médiane des dossiers clôturés, en jours calendaires.</p>
      ${svg ?? '<p class="empty">Aucun dossier clôturé sur la période : pas d’évolution à tracer.</p>'}
    </section>`);
  }
  if (charts.phases) {
    const svg = renderPhaseDurationSvg(snapshot.overview.phaseStats);
    blocks.push(`
    <section class="chart keep">
      <h2>Durée moyenne par phase et cible SLA</h2>
      <p class="hint">Barre pleine : durée moyenne des phases clôturées. Barre hachurée : délai cible (SLA).</p>
      ${svg ?? '<p class="empty">Aucune phase à afficher.</p>'}
    </section>`);
  }
  return blocks.join('');
}

function phaseRows(snapshot: ReportSnapshot, phaseCodes?: string[]): string {
  const allowed = phaseCodes ? new Set(phaseCodes) : null;
  return snapshot.overview.phaseStats
    .filter((phase) => !allowed || allowed.has(phase.phaseCode))
    .map(
      (phase) => `
        <tr>
          <td>${escapeHtml(phase.label)}</td>
          <td>${escapeHtml(phase.activeCount)}</td>
          <td>${escapeHtml(phase.closedCount)}</td>
          <td>${escapeHtml(formatCalendarDuration(phase.averageClosedDurationDays))}</td>
          <td>${escapeHtml(formatCalendarDuration(phase.averageActiveAgeDays))}</td>
          <td>${escapeHtml(`${phase.slaTargetDays} jours`)}</td>
          <td>${escapeHtml(phase.slaBreachCount)}</td>
        </tr>`
    )
    .join('');
}

function renderPhaseSection(
  snapshot: ReportSnapshot,
  title = 'Lecture par phase',
  phaseCodes?: string[]
): string {
  return `
    <section class="keep">
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Phase</th><th>Ouvertes</th><th>Clôturées</th><th>Durée moyenne clôturée</th>
          <th>Âge moyen des phases ouvertes</th><th>Cible SLA (calendaires)</th><th>Hors SLA</th>
        </tr>
      </thead>
      <tbody>${phaseRows(snapshot, phaseCodes)}</tbody>
    </table>
    </section>`;
}

function blockerCards(snapshot: ReportSnapshot, keys?: string[]): string {
  const allowed = keys ? new Set(keys) : null;
  return snapshot.overview.blockingPoints
    .filter((point) => !allowed || allowed.has(point.key))
    .map(
      (point) => `
        <article class="blocker ${escapeHtml(point.tone)}">
          <p>${escapeHtml(point.label)}</p>
          <strong>${escapeHtml(point.value)}</strong>
          <span>${escapeHtml(point.helper)}</span>
        </article>`
    )
    .join('');
}

function renderBlockersSection(
  snapshot: ReportSnapshot,
  title = 'Points de blocage',
  keys?: string[]
): string {
  const cards = blockerCards(snapshot, keys);
  if (!cards) return '';
  return `<h2>${escapeHtml(title)}</h2><div class="blockers keep">${cards}</div>`;
}

function delayedRows(snapshot: ReportSnapshot, phaseCodes?: string[]): string {
  const allowed = phaseCodes ? new Set(phaseCodes) : null;
  const dossiers = snapshot.overview.delayedDossiers.filter(
    (dossier) => !allowed || allowed.has(dossier.phaseCode)
  );

  if (dossiers.length === 0) {
    return '<tr><td colspan="6" class="empty">Aucun dossier hors délai dans cette vue.</td></tr>';
  }

  return dossiers
    .map(
      (dossier) => `
        <tr>
          <td>${escapeHtml(dossier.reference)}</td>
          <td>${escapeHtml(dossier.organisationName)}</td>
          <td>${escapeHtml(dossier.requestType)}</td>
          <td>${escapeHtml(dossier.phaseLabel)}</td>
          <td class="danger">${escapeHtml(formatCalendarDuration(dossier.delayDays))}</td>
          <td>${formatDate(dossier.lastActionAt)}</td>
        </tr>`
    )
    .join('');
}

function renderDelayedSection(
  snapshot: ReportSnapshot,
  title = 'Dossiers les plus en retard',
  phaseCodes?: string[]
): string {
  return `
    <section class="keep">
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr><th>Dossier</th><th>Organisation</th><th>Type</th><th>Phase</th><th>Dépassement de la cible SLA</th><th>Dernière action</th></tr></thead>
      <tbody>${delayedRows(snapshot, phaseCodes)}</tbody>
    </table>
    </section>`;
}

function trendRows(snapshot: ReportSnapshot): string {
  if (!snapshot.overview.durationTrend.length) {
    return '<tr><td colspan="3" class="empty">Aucune donnée sur la période.</td></tr>';
  }
  return snapshot.overview.durationTrend
    .map(
      (point) => `
        <tr>
          <td>${formatDate(point.date)}</td>
          <td>${escapeHtml(formatCalendarDuration(point.averageDurationDays))}</td>
          <td>${escapeHtml(formatCalendarDuration(point.medianDurationDays))}</td>
        </tr>`
    )
    .join('');
}

function renderTrendTable(snapshot: ReportSnapshot): string {
  return `
    <section class="keep">
    <h2>Évolution du délai de traitement - détail</h2>
    <table>
      <thead><tr><th>Période débutant le</th><th>Délai moyen</th><th>Médiane</th></tr></thead>
      <tbody>${trendRows(snapshot)}</tbody>
    </table>
    </section>`;
}

function reportMetrics(snapshot: ReportSnapshot): AnalyticsMetric[] {
  switch (snapshot.reportKey) {
    case 'processing_delay':
      return metricsByKey(snapshot, [
        'average_processing_duration',
        'median_processing_duration',
        'inactivity',
      ]);
    case 'sla':
      return metricsByKey(snapshot, ['sla_compliance', 'outside_sla']);
    case 'bottlenecks':
      return metricsByKey(snapshot, ['outside_sla', 'dg_wait', 'inactivity']);
    case 'inspections':
      return metricsByKey(snapshot, ['inactivity']);
    case 's5':
      return metricsByKey(snapshot, ['inactivity']);
    case 'full_report':
    default:
      return snapshot.overview.metrics;
  }
}

function reportSections(snapshot: ReportSnapshot): string {
  switch (snapshot.reportKey) {
    case 'processing_delay':
      return [
        renderMetricsSection('Indicateurs de délai', reportMetrics(snapshot)),
        renderTrendTable(snapshot),
        renderPhaseSection(snapshot, 'Durée moyenne par phase'),
        renderDelayedSection(snapshot, 'Dossiers impactant les délais'),
      ].join('');
    case 'sla':
      return [
        renderMetricsSection('Indicateurs SLA', reportMetrics(snapshot)),
        renderPhaseSection(snapshot, 'Respect SLA par phase'),
        renderDelayedSection(snapshot, 'Dossiers hors SLA'),
      ].join('');
    case 'bottlenecks':
      return [
        renderMetricsSection('Synthèse des blocages', reportMetrics(snapshot)),
        renderBlockersSection(snapshot, 'Blocages détectés'),
        renderDelayedSection(snapshot, 'Dossiers en retard'),
      ].join('');
    case 'inspections':
      return [
        renderMetricsSection('Indicateurs inspection', reportMetrics(snapshot)),
        renderPhaseSection(snapshot, 'Phase Démonstration / Inspection', ['M6']),
        // K6 - a site visit has no compte-rendu: its follow-up is the R3 opinion.
        renderBlockersSection(snapshot, 'Blocages inspection', ['missing_r3_opinions']),
        renderDelayedSection(snapshot, 'Inspections en retard', ['M6']),
      ].join('');
    case 's5':
      return [
        renderMetricsSection('Indicateurs de paiement', reportMetrics(snapshot)),
        renderBlockersSection(snapshot, 'Blocages Finance', ['payment_blockers']),
        renderPhaseSection(snapshot, 'Phases dépendant des validations Finance', ['M5', 'M6', 'M7']),
      ].join('');
    case 'full_report':
    default:
      return [
        renderMetricsSection('Indicateurs clés', reportMetrics(snapshot)),
        renderTrendTable(snapshot),
        renderPhaseSection(snapshot),
        renderBlockersSection(snapshot),
        renderDelayedSection(snapshot),
      ].join('');
  }
}

/** The report page (pure: no browser, no file), A4 portrait. */
export function renderAnalyticsReportHtml(snapshot: ReportSnapshot, logo: string | null): string {
  const period = `${formatDate(snapshot.filters.periodStart)} - ${formatDate(snapshot.filters.periodEnd)}`;
  const metrics = reportMetrics(snapshot);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.reportTitle)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; font-size: 11px; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 54px; width: auto; object-fit: contain; }
    .eyebrow { color: #0b1f59; font-size: 12px; font-weight: 700; letter-spacing: .04em; }
    .institution { color: #64748b; font-size: 10px; margin-top: 2px; }
    h1 { margin: 6px 0 0; color: #0b1f59; font-size: 22px; }
    h2 { margin: 22px 0 8px; color: #0b1f59; font-size: 14px; }
    .note { margin-top: 6px; color: #475569; }
    .meta { text-align: right; color: #475569; line-height: 1.7; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
    .card, .blocker { border: 1px solid #d8e1ef; border-radius: 8px; padding: 10px; background: #f8fafc; page-break-inside: avoid; break-inside: avoid; }
    .card span, .blocker span { color: #64748b; display: block; margin-top: 4px; }
    .card strong, .blocker strong { display: block; margin-top: 6px; color: #0b1f59; font-size: 20px; }
    .keep { page-break-inside: avoid; break-inside: avoid; }
    .glossary .terms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; }
    .glossary .term span { display: block; color: #475569; margin-top: 2px; }
    .hint { color: #64748b; margin: 0 0 6px; }
    .chart svg { display: block; width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; page-break-inside: avoid; }
    th { background: #eff6ff; color: #1e3a8a; text-align: left; }
    th, td { border: 1px solid #d8e1ef; padding: 7px 8px; vertical-align: top; }
    td.value { color: #0b1f59; font-weight: 700; }
    .blockers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
    .blocker.warning { background: #fff7ed; border-color: #fed7aa; }
    .blocker.danger { background: #fef2f2; border-color: #fecaca; }
    .blocker.info { background: #eff6ff; border-color: #bfdbfe; }
    .danger { color: #dc2626; font-weight: 700; }
    .empty { color: #64748b; text-align: center; }
    footer { border-top: 1px solid #d8e1ef; color: #64748b; margin-top: 22px; padding-top: 8px; line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="ANAC Gabon" />` : ''}
      <div>
        <div class="eyebrow">${escapeHtml(REPORT_BRAND)}</div>
        <div class="institution">${escapeHtml(REPORT_INSTITUTION)}</div>
        <h1>${escapeHtml(snapshot.reportTitle)}</h1>
        <div class="note">${escapeHtml(REPORT_NOTES[snapshot.reportKey])}</div>
      </div>
    </div>
    <div class="meta">
      <div>Période : <strong>${escapeHtml(period)}</strong></div>
      <div>Généré le : ${escapeHtml(formatDateTime(snapshot.generatedAt))}</div>
      <div>Format : PDF</div>
    </div>
  </header>

  <section class="summary">${metricCards(metrics.slice(0, 6))}</section>

  ${renderGlossary()}

  ${renderCharts(snapshot)}

  ${reportSections(snapshot)}

  <footer>
    Rapport généré par ${escapeHtml(REPORT_BRAND)}.<br />
    Les données reflètent les filtres appliqués au moment de la génération.
  </footer>
</body>
</html>`;
}

export async function renderAnalyticsReportPdf(snapshot: ReportSnapshot): Promise<Buffer> {
  return renderHtmlToPdf(renderAnalyticsReportHtml(snapshot, await logoDataUri()));
}
