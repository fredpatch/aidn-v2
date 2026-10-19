/** BRAND-AIDN-OMA-1 - the application-generated emails and analytics
 *  workbook name the product « AIDN - OMA » with the institutional line;
 *  no old « AIDN - Direction ... » identity is left. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '@aidn/shared';
import type { AnalyticsOverview } from '../../modules/analytics/analytics.types.js';
import { renderAnalyticsReportExcel } from '../../modules/reports/renderers/analytics-report-excel.js';
import {
  accountActivatedEmailTemplate,
  certificateReadyEmailTemplate,
  dgCircuitAlertEmailTemplate,
  documentNeedsCorrectionEmailTemplate,
  dossierRejectedEmailTemplate,
  emailTitle,
  otpEmailTemplate,
} from './email.templates.js';

describe('product branding', () => {
  it('shared constants', () => {
    assert.equal(PRODUCT_NAME, 'AIDN - OMA');
    assert.equal(PRODUCT_SUBTITLE, 'Service OMA · Direction de la Navigabilité · ANAC Gabon');
  });

  it('emails: « AIDN - OMA : <sujet> » headings and the institutional footer', () => {
    assert.equal(emailTitle('Dossier rejeté'), 'AIDN - OMA : Dossier rejeté');
    const bodies = [
      otpEmailTemplate({ fullName: 'A', employeeCode: 'E1', otp: '123456' }),
      accountActivatedEmailTemplate({ fullName: 'A', employeeCode: 'E1', dateTime: '19/10/2026' }),
      dgCircuitAlertEmailTemplate({ reference: 'DEM-1', daysStuck: 3 }),
      certificateReadyEmailTemplate({ reference: 'CERT-1' }),
      dossierRejectedEmailTemplate({ reference: 'DEM-1', reason: 'x' }),
      documentNeedsCorrectionEmailTemplate({ reference: 'DEM-1', deadline: '30/10/2026' }),
    ];
    for (const body of bodies) {
      assert.match(body, /<h2[^>]*>AIDN - OMA : /);
      assert.match(body, /AIDN - OMA<br \/>Service OMA · Direction de la Navigabilité · ANAC Gabon/);
      assert.doesNotMatch(body, /Direction de la Navigabilite - OMA Service|AIDN - Activation|AIDN - Dossier/);
    }
    assert.match(bodies[2], /AIDN - OMA : Demande DEM-1 en attente d’annotation du DG/);
  });

  it('analytics workbook: product and institutional lines on top, creator « AIDN - OMA »', async () => {
    const overview = {
      filters: { periodStart: '2026-10-01', periodEnd: '2026-10-31', phaseCode: null, requestType: null, status: null },
      generatedAt: '2026-10-19T08:00:00.000Z',
      warnings: [],
      metrics: [],
      durationTrend: [],
      phaseStats: [],
      agingDistribution: [],
      slaDistribution: [],
      blockingPoints: [],
      delayedDossiers: [],
      meetingFollowUps: { missingReports: [], missingR3Opinions: [] },
      reports: [],
    } as unknown as AnalyticsOverview;
    const buffer = await renderAnalyticsReportExcel({
      reportKey: 'full_report',
      reportTitle: 'Rapport test',
      generatedAt: overview.generatedAt,
      filters: overview.filters,
      overview,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    assert.equal(workbook.creator, 'AIDN - OMA');
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.getRow(1).getCell(1).value, 'AIDN - OMA');
    assert.equal(sheet.getRow(2).getCell(1).value, 'Service OMA · Direction de la Navigabilité · ANAC Gabon');
    assert.equal(sheet.getRow(3).getCell(1).value, 'Rapport test');
  });
});
