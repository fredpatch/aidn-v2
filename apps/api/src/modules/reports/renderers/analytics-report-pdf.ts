import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import type { AnalyticsMetric } from '../../analytics/analytics.types.js';
import type { ReportKey, ReportSnapshot } from '../reports.types.js';

const REPORT_NOTES: Record<ReportKey, string> = {
  full_report: 'Vue complète des indicateurs DN sur la période sélectionnée.',
  processing_delay: 'Analyse centrée sur les durées de traitement et la progression par phase.',
  sla: 'Contrôle du respect des délais cibles et identification des phases hors SLA.',
  bottlenecks: 'Lecture des points de blocage qui ralentissent le traitement opérationnel.',
  inspections: 'Suivi ciblé de la phase Démonstration / Inspection et des comptes-rendus attendus.',
  s5: 'Suivi des paiements, preuves et validations bloquantes côté S5.',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

async function logoDataUri(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'logo.png'),
    path.resolve(process.cwd(), 'apps/api/assets', 'logo.png'),
  ];

  for (const filePath of candidates) {
    try {
      const buffer = await fs.readFile(filePath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      // Try the next known runtime layout.
    }
  }

  return null;
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
          <strong>${escapeHtml(metric.value)}</strong>
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
          <td class="value">${escapeHtml(metric.value)}</td>
          <td>${escapeHtml(metric.helper)}</td>
          <td>${metric.sampleSize ?? '-'}</td>
        </tr>`
    )
    .join('');
}

function renderMetricsSection(title: string, metrics: AnalyticsMetric[]): string {
  if (!metrics.length) return '';
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr><th>KPI</th><th>Valeur</th><th>Lecture DN</th><th>Base</th></tr></thead>
      <tbody>${metricsTable(metrics)}</tbody>
    </table>`;
}

function phaseRows(snapshot: ReportSnapshot, phaseCodes?: string[]): string {
  const allowed = phaseCodes ? new Set(phaseCodes) : null;
  return snapshot.overview.phaseStats
    .filter((phase) => !allowed || allowed.has(phase.phaseCode))
    .map(
      (phase) => `
        <tr>
          <td>${escapeHtml(phase.label)}</td>
          <td>${phase.activeCount}</td>
          <td>${phase.closedCount}</td>
          <td>${phase.averageClosedDurationDays ?? '-'}</td>
          <td>${phase.averageActiveAgeDays ?? '-'}</td>
          <td>${phase.slaTargetDays} j</td>
          <td>${phase.slaBreachCount}</td>
        </tr>`
    )
    .join('');
}

function renderPhaseSection(snapshot: ReportSnapshot, title = 'Lecture par phase', phaseCodes?: string[]): string {
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Phase</th><th>Ouvertes</th><th>Clôturées</th><th>Moyenne clôture</th>
          <th>Âge actif moyen</th><th>SLA</th><th>Hors SLA</th>
        </tr>
      </thead>
      <tbody>${phaseRows(snapshot, phaseCodes)}</tbody>
    </table>`;
}

function blockerCards(snapshot: ReportSnapshot, keys?: string[]): string {
  const allowed = keys ? new Set(keys) : null;
  return snapshot.overview.blockingPoints
    .filter((point) => !allowed || allowed.has(point.key))
    .map(
      (point) => `
        <article class="blocker ${point.tone}">
          <p>${escapeHtml(point.label)}</p>
          <strong>${escapeHtml(point.value)}</strong>
          <span>${escapeHtml(point.helper)}</span>
        </article>`
    )
    .join('');
}

function renderBlockersSection(snapshot: ReportSnapshot, title = 'Points de blocage', keys?: string[]): string {
  const cards = blockerCards(snapshot, keys);
  if (!cards) return '';
  return `<h2>${escapeHtml(title)}</h2><div class="blockers">${cards}</div>`;
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
          <td class="danger">${dossier.delayDays} j</td>
          <td>${formatDate(dossier.lastActionAt)}</td>
        </tr>`
    )
    .join('');
}

function renderDelayedSection(snapshot: ReportSnapshot, title = 'Dossiers les plus en retard', phaseCodes?: string[]): string {
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr><th>Dossier</th><th>Organisation</th><th>Type</th><th>Phase</th><th>Retard</th><th>Dernière action</th></tr></thead>
      <tbody>${delayedRows(snapshot, phaseCodes)}</tbody>
    </table>`;
}

function trendRows(snapshot: ReportSnapshot): string {
  return snapshot.overview.durationTrend
    .map(
      (point) => `
        <tr>
          <td>${formatDate(point.date)}</td>
          <td>${point.averageDurationDays ?? '-'}</td>
          <td>${point.medianDurationDays ?? '-'}</td>
        </tr>`
    )
    .join('');
}

function renderTrendSection(snapshot: ReportSnapshot): string {
  return `
    <h2>Évolution du délai de traitement</h2>
    <table>
      <thead><tr><th>Date</th><th>Délai moyen (j)</th><th>Médiane (j)</th></tr></thead>
      <tbody>${trendRows(snapshot)}</tbody>
    </table>`;
}

function reportMetrics(snapshot: ReportSnapshot): AnalyticsMetric[] {
  switch (snapshot.reportKey) {
    case 'processing_delay':
      return metricsByKey(snapshot, ['average_processing_duration', 'median_processing_duration', 'inactivity']);
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
        renderTrendSection(snapshot),
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
        renderBlockersSection(snapshot, 'Blocages inspection', ['missing_reports']),
        renderDelayedSection(snapshot, 'Inspections en retard', ['M6']),
      ].join('');
    case 's5':
      return [
        renderMetricsSection('Indicateurs de paiement', reportMetrics(snapshot)),
        renderBlockersSection(snapshot, 'Blocages S5', ['payment_blockers']),
        renderPhaseSection(snapshot, 'Phases dépendant des validations S5', ['M5', 'M6', 'M7']),
      ].join('');
    case 'full_report':
    default:
      return [
        renderMetricsSection('Indicateurs clés', reportMetrics(snapshot)),
        renderTrendSection(snapshot),
        renderPhaseSection(snapshot),
        renderBlockersSection(snapshot),
        renderDelayedSection(snapshot),
      ].join('');
  }
}

function renderHtml(snapshot: ReportSnapshot, logo: string | null): string {
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
    .eyebrow { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 4px 0 0; color: #0b1f59; font-size: 22px; }
    h2 { margin: 22px 0 8px; color: #0b1f59; font-size: 14px; }
    .note { margin-top: 8px; color: #475569; }
    .meta { text-align: right; color: #475569; line-height: 1.7; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
    .card, .blocker { border: 1px solid #d8e1ef; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .card span, .blocker span { color: #64748b; display: block; margin-top: 4px; }
    .card strong, .blocker strong { display: block; margin-top: 6px; color: #0b1f59; font-size: 20px; }
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
    footer { border-top: 1px solid #d8e1ef; color: #64748b; margin-top: 22px; padding-top: 8px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="ANAC Gabon" />` : ''}
      <div>
        <div class="eyebrow">AIDN - Direction de la Navigabilité</div>
        <h1>${escapeHtml(snapshot.reportTitle)}</h1>
        <div class="note">${escapeHtml(REPORT_NOTES[snapshot.reportKey])}</div>
      </div>
    </div>
    <div class="meta">
      <div>Période : <strong>${period}</strong></div>
      <div>Généré le : ${formatDate(snapshot.generatedAt)}</div>
      <div>Format : PDF</div>
    </div>
  </header>

  <section class="summary">${metricCards(metrics.slice(0, 6))}</section>

  ${reportSections(snapshot)}

  <footer>
    Rapport généré automatiquement par AIDN. Les valeurs reflètent les filtres appliqués au moment de la génération.
  </footer>
</body>
</html>`;
}

export async function renderAnalyticsReportPdf(snapshot: ReportSnapshot): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(snapshot, await logoDataUri()), { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
