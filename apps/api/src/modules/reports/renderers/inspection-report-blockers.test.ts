/** K6 - the "Inspections" report shows the R3-opinion follow-up, not the
 *  compte-rendu one: a site visit has no compte-rendu (renders the real
 *  Excel workbook, no database needed). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { AnalyticsBlockingPoint, AnalyticsOverview } from '../../analytics/analytics.types.js';
import type { ReportSnapshot } from '../reports.types.js';
import { renderAnalyticsReportExcel } from './analytics-report-excel.js';

const point = (key: string, label: string, value: string): AnalyticsBlockingPoint => ({
  key,
  label,
  value,
  helper: `${label} - aide`,
  tone: 'info',
});

const overview = {
  filters: { periodStart: '2026-01-01', periodEnd: '2026-10-08', phaseCode: null, requestType: null, status: null },
  generatedAt: '2026-10-08T08:00:00.000Z',
  warnings: [],
  metrics: [],
  durationTrend: [],
  phaseStats: [],
  agingDistribution: [],
  slaDistribution: [],
  blockingPoints: [
    point('missing_reports', 'Reunions sans compte-rendu', '4'),
    point('missing_r3_opinions', 'Avis R3 manquant', '2'),
  ],
  delayedDossiers: [],
  meetingFollowUps: { missingReports: [], missingR3Opinions: [] },
  reports: [],
} as unknown as AnalyticsOverview;

async function sheetsText(reportKey: ReportSnapshot['reportKey']) {
  const buffer = await renderAnalyticsReportExcel({
    reportKey,
    reportTitle: 'Test',
    generatedAt: overview.generatedAt,
    filters: overview.filters,
    overview,
  });
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types its own Buffer, older than Node's.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets.map((sheet) => {
    const cells: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? ''))));
    return { name: sheet.name, text: cells.join(' | ') };
  });
}

describe('K6 inspection report blockers', () => {
  it('lists the missing R3 opinions, not the meetings without compte-rendu', async () => {
    const sheets = await sheetsText('inspections');
    const blockers = sheets.find((sheet) => sheet.name === 'Avis R3');
    assert.ok(blockers, `sheets: ${sheets.map((sheet) => sheet.name).join(', ')}`);
    assert.match(blockers.text, /Avis R3 manquant \| 2/);
    assert.doesNotMatch(blockers.text, /Reunions sans compte-rendu/);
  });

  it('the bottlenecks report keeps both indicators', async () => {
    const sheets = await sheetsText('bottlenecks');
    const all = sheets.map((sheet) => sheet.text).join(' ');
    assert.match(all, /Reunions sans compte-rendu/);
    assert.match(all, /Avis R3 manquant/);
  });
});
