import ExcelJS from 'exceljs';
import type { AnalyticsMetric } from '../../analytics/analytics.types.js';
import type { ReportKey, ReportSnapshot } from '../reports.types.js';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  row.alignment = { vertical: 'middle' };
}

function autoFit(sheet: ExcelJS.Worksheet): void {
  const widths = new Map<number, number>();
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const current = widths.get(columnNumber) ?? 12;
      widths.set(columnNumber, Math.max(current, String(cell.value ?? '').length + 2));
    });
  });

  widths.forEach((width, columnNumber) => {
    sheet.getColumn(columnNumber).width = Math.min(width, 42);
  });
}

function addTitle(sheet: ExcelJS.Worksheet, snapshot: ReportSnapshot): void {
  sheet.addRow(['AIDN - Direction de la Navigabilité']);
  sheet.addRow([snapshot.reportTitle]);
  sheet.addRow([
    'Période',
    `${formatDate(snapshot.filters.periodStart)} - ${formatDate(snapshot.filters.periodEnd)}`,
    'Généré le',
    formatDate(snapshot.generatedAt),
  ]);
  sheet.addRow([]);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF64748B' } };
  sheet.getRow(2).font = { bold: true, size: 16, color: { argb: 'FF0B1F59' } };
}

function metricsByKey(snapshot: ReportSnapshot, keys: string[]): AnalyticsMetric[] {
  const allowed = new Set(keys);
  return snapshot.overview.metrics.filter((metric) => allowed.has(metric.key));
}

function addMetricsSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot, name: string, metrics: AnalyticsMetric[]): void {
  const sheet = workbook.addWorksheet(name);
  addTitle(sheet, snapshot);
  sheet.addRow(['KPI', 'Valeur', 'Lecture DN', 'Base']);
  styleHeader(sheet.lastRow!);
  metrics.forEach((metric) => {
    sheet.addRow([metric.label, metric.value, metric.helper, metric.sampleSize ?? '-']);
  });
  autoFit(sheet);
}

function addPhasesSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot, name = 'Phases', phaseCodes?: string[]): void {
  const allowed = phaseCodes ? new Set(phaseCodes) : null;
  const sheet = workbook.addWorksheet(name);
  addTitle(sheet, snapshot);
  sheet.addRow(['Phase', 'Ouvertes', 'Clôturées', 'Moyenne clôture (j)', 'Âge moyen actif (j)', 'SLA (j)', 'Hors SLA']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.phaseStats
    .filter((phase) => !allowed || allowed.has(phase.phaseCode))
    .forEach((phase) => {
      sheet.addRow([
        phase.label,
        phase.activeCount,
        phase.closedCount,
        phase.averageClosedDurationDays ?? '-',
        phase.averageActiveAgeDays ?? '-',
        phase.slaTargetDays,
        phase.slaBreachCount,
      ]);
    });
  autoFit(sheet);
}

function addBlockersSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot, name = 'Blocages', keys?: string[]): void {
  const allowed = keys ? new Set(keys) : null;
  const sheet = workbook.addWorksheet(name);
  addTitle(sheet, snapshot);
  sheet.addRow(['Blocage', 'Valeur', 'Description', 'Sévérité']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.blockingPoints
    .filter((point) => !allowed || allowed.has(point.key))
    .forEach((point) => {
      sheet.addRow([point.label, point.value, point.helper, point.tone]);
    });
  autoFit(sheet);
}

function addDelayedSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot, name = 'Dossiers en retard', phaseCodes?: string[]): void {
  const allowed = phaseCodes ? new Set(phaseCodes) : null;
  const sheet = workbook.addWorksheet(name);
  addTitle(sheet, snapshot);
  sheet.addRow(['Référence', 'Organisation', 'Type', 'Phase', 'Retard (j)', 'Âge courant (j)', 'SLA (j)', 'Dernière action']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.delayedDossiers
    .filter((dossier) => !allowed || allowed.has(dossier.phaseCode))
    .forEach((dossier) => {
      sheet.addRow([
        dossier.reference,
        dossier.organisationName,
        dossier.requestType,
        dossier.phaseLabel,
        dossier.delayDays,
        dossier.currentAgeDays,
        dossier.slaTargetDays,
        formatDate(dossier.lastActionAt),
      ]);
    });
  autoFit(sheet);
}

function addTrendSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot): void {
  const sheet = workbook.addWorksheet('Tendance délais');
  addTitle(sheet, snapshot);
  sheet.addRow(['Date', 'Délai moyen (j)', 'Médiane (j)']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.durationTrend.forEach((point) => {
    sheet.addRow([point.date, point.averageDurationDays ?? '-', point.medianDurationDays ?? '-']);
  });
  autoFit(sheet);
}

function addDistributionsSheet(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot): void {
  const sheet = workbook.addWorksheet('Répartitions');
  addTitle(sheet, snapshot);
  sheet.addRow(['Ancienneté', 'Dossiers actifs']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.agingDistribution.forEach((item) => sheet.addRow([item.label, item.value]));
  sheet.addRow([]);
  sheet.addRow(['Respect SLA', 'Phases clôturées']);
  styleHeader(sheet.lastRow!);
  snapshot.overview.slaDistribution.forEach((item) => sheet.addRow([item.label, item.value]));
  autoFit(sheet);
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

function populateWorkbook(workbook: ExcelJS.Workbook, snapshot: ReportSnapshot): void {
  switch (snapshot.reportKey) {
    case 'processing_delay':
      addMetricsSheet(workbook, snapshot, 'Synthèse délais', reportMetrics(snapshot));
      addTrendSheet(workbook, snapshot);
      addPhasesSheet(workbook, snapshot, 'Durées par phase');
      addDelayedSheet(workbook, snapshot, 'Dossiers impactants');
      break;
    case 'sla':
      addMetricsSheet(workbook, snapshot, 'Synthèse SLA', reportMetrics(snapshot));
      addPhasesSheet(workbook, snapshot, 'SLA par phase');
      addDelayedSheet(workbook, snapshot, 'Hors SLA');
      addDistributionsSheet(workbook, snapshot);
      break;
    case 'bottlenecks':
      addMetricsSheet(workbook, snapshot, 'Synthèse blocages', reportMetrics(snapshot));
      addBlockersSheet(workbook, snapshot, 'Blocages détectés');
      addDelayedSheet(workbook, snapshot, 'Dossiers en retard');
      break;
    case 'inspections':
      addMetricsSheet(workbook, snapshot, 'Synthèse inspections', reportMetrics(snapshot));
      addPhasesSheet(workbook, snapshot, 'Phase inspection', ['M6']);
      addBlockersSheet(workbook, snapshot, 'CR inspections', ['missing_reports']);
      addDelayedSheet(workbook, snapshot, 'Inspections en retard', ['M6']);
      break;
    case 's5':
      addMetricsSheet(workbook, snapshot, 'Synthèse S5', reportMetrics(snapshot));
      addBlockersSheet(workbook, snapshot, 'Paiements bloquants', ['payment_blockers']);
      addPhasesSheet(workbook, snapshot, 'Phases impactées', ['M5', 'M6', 'M7']);
      break;
    case 'full_report':
    default:
      addMetricsSheet(workbook, snapshot, 'Synthèse', reportMetrics(snapshot));
      addTrendSheet(workbook, snapshot);
      addPhasesSheet(workbook, snapshot);
      addBlockersSheet(workbook, snapshot);
      addDelayedSheet(workbook, snapshot);
      addDistributionsSheet(workbook, snapshot);
      break;
  }
}

export async function renderAnalyticsReportExcel(snapshot: ReportSnapshot): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AIDN';
  workbook.created = new Date(snapshot.generatedAt);
  workbook.modified = new Date(snapshot.generatedAt);

  populateWorkbook(workbook, snapshot);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
