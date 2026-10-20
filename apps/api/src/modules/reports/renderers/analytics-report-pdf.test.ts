/** ANALYTICS-GLOBAL-UX-1 - the analytics PDF page (HTML + inline SVG, no
 *  browser): AIDN - OMA branding, reading keys, readable durations, charts
 *  per report, and markup that never carries NaN / Infinity / undefined. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCalendarDuration } from '@aidn/shared';
import type {
  AnalyticsOverview,
  AnalyticsPhaseStat,
  AnalyticsTrendPoint,
} from '../../analytics/analytics.types.js';
import type { ReportKey, ReportSnapshot } from '../reports.types.js';
import ExcelJS from 'exceljs';
import { renderAnalyticsReportHtml } from './analytics-report-pdf.js';
import { renderAnalyticsReportExcel } from './analytics-report-excel.js';
import { niceAxisMax, renderPhaseDurationSvg, renderTrendSvg } from './analytics-report-svg.js';

const phase = (
  phaseCode: AnalyticsPhaseStat['phaseCode'],
  label: string,
  average: number | null,
  sla: number
): AnalyticsPhaseStat => ({
  phaseCode,
  label,
  activeCount: 2,
  closedCount: 3,
  averageClosedDurationDays: average,
  averageActiveAgeDays: 6.8,
  slaTargetDays: sla,
  slaBreachCount: 1,
});

const TREND: AnalyticsTrendPoint[] = [
  { date: '2026-10-01', averageDurationDays: 4.8, medianDurationDays: 3.5 },
  { date: '2026-10-04', averageDurationDays: null, medianDurationDays: null },
  { date: '2026-10-07', averageDurationDays: 6.8, medianDurationDays: 6 },
];

function snapshot(
  reportKey: ReportKey,
  overrides: Partial<AnalyticsOverview> = {}
): ReportSnapshot {
  const overview = {
    filters: {
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-10-31T00:00:00.000Z',
      phaseCode: null,
      requestType: null,
      status: null,
    },
    generatedAt: '2026-10-19T08:30:00.000Z',
    warnings: [],
    metrics: [
      {
        key: 'average_processing_duration',
        label: 'Délai moyen de traitement',
        value: '4.8 j',
        helper: 'Dépôt initial -> clôture délivrance',
        tone: 'info',
        sampleSize: 6,
        sampleLabel: '6 dossiers délivrés',
        rawValue: 4.8,
        unit: 'calendar_days',
      },
      {
        key: 'sla_compliance',
        label: 'Taux de respect SLA',
        value: '75%',
        helper: 'Phases clôturées dans le délai cible',
        tone: 'success',
        sampleSize: 8,
        sampleLabel: '8 phases clôturées',
      },
      {
        key: 'median_processing_duration',
        label: 'Médiane de traitement',
        value: '0.1 j',
        helper: 'Médiane des dossiers clôturés',
        tone: 'neutral',
        sampleSize: 6,
        sampleLabel: '6 dossiers délivrés',
        rawValue: 0.1,
        unit: 'calendar_days',
      },
      {
        key: 'outside_sla',
        label: 'Phases hors délai',
        value: '3',
        helper: 'Phases ouvertes au-delà de leur cible SLA',
        tone: 'danger',
        sampleSize: 1,
        sampleLabel: '1 phase ouverte',
      },
      {
        key: 'unsampled',
        label: 'Indicateur sans échantillon',
        value: '2',
        helper: 'Lecture',
        tone: 'neutral',
      },
    ],
    durationTrend: TREND,
    phaseStats: [
      phase('M3', 'Préliminaire', 8, 15),
      phase('M4', 'Demande formelle', 20.5, 15),
      phase('M5', 'Évaluation approfondie', null, 30),
    ],
    agingDistribution: [],
    slaDistribution: [],
    blockingPoints: [
      {
        key: 'dg_waiting',
        label: 'En attente DG',
        value: '2',
        helper: 'Délai moyen : 4 j 19 h',
        tone: 'warning',
      },
    ],
    delayedDossiers: [
      {
        requestId: 1,
        reference: 'DEM-2026-0001',
        organisationName: 'Air <Test>',
        requestType: 'Délivrance',
        phaseCode: 'M4',
        phaseLabel: 'Demande formelle',
        delayDays: 2.4,
        currentAgeDays: 17.4,
        slaTargetDays: 15,
        lastActionAt: '2026-10-10T10:00:00.000Z',
      },
    ],
    meetingFollowUps: { missingReports: [], missingR3Opinions: [] },
    reports: [],
    ...overrides,
  } as AnalyticsOverview;
  return {
    reportKey,
    reportTitle: 'Rapport test',
    generatedAt: overview.generatedAt,
    filters: overview.filters,
    overview,
  };
}

const html = (reportKey: ReportKey, overrides?: Partial<AnalyticsOverview>) =>
  renderAnalyticsReportHtml(snapshot(reportKey, overrides), null);
const hasTrendChart = (page: string) =>
  page.includes('aria-label="Évolution du délai de traitement, en jours calendaires"');
const hasPhaseChart = (page: string) =>
  page.includes('aria-label="Durée moyenne clôturée et cible SLA par phase"');

describe('formatCalendarDuration (shared)', () => {
  it('reads calendar days as days/hours or hours/minutes', () => {
    assert.deepEqual(
      [0.1, 0.5, 1, 1.25, 4.8, 6.8, 2.4, null, Number.NaN].map(formatCalendarDuration),
      ['2 h 24 min', '12 h', '1 j', '1 j 6 h', '4 j 19 h', '6 j 19 h', '2 j 10 h', '-', '-']
    );
  });
});

describe('analytics report page', () => {
  it('branding: AIDN - OMA, the institution line, the new footer; never « AIDN - Direction »', () => {
    const page = html('full_report');
    assert.match(page, /AIDN - OMA/);
    assert.match(page, /Service OMA · Direction de la Navigabilité · ANAC Gabon/);
    assert.match(page, /Rapport généré par AIDN - OMA\./);
    assert.match(page, /Les données reflètent les filtres appliqués au moment de la génération\./);
    assert.doesNotMatch(page, /AIDN - Direction de la Navigabilité/);
    assert.match(page, /Généré le : 19\/10\/2026 à 09:30/);
  });

  it('ANALYTICS-POLISH-1: process-wide full report, « Échantillon » column in words, grammar', () => {
    const page = html('full_report');
    assert.match(page, /Vue globale des indicateurs du processus OMA sur la période sélectionnée\./);
    assert.doesNotMatch(page, /indicateurs DN/);
    assert.match(page, /<th>Échantillon<\/th>/);
    assert.doesNotMatch(page, /Base \(éléments observés\)/);
    for (const label of ['6 dossiers délivrés', '8 phases clôturées', '1 phase ouverte'])
      assert.match(page, new RegExp(`<td>${label}</td>`));
    assert.match(page, /<td>Indicateur sans échantillon<\/td>[\s\S]*?<td>-<\/td>\s*<\/tr>/);
    assert.match(html('s5'), /Phases dépendant des validations Finance/);
  });

  it('reading keys: KPI and SLA spelled out, average, median, calendar and working days', () => {
    const page = html('sla');
    assert.match(page, /Repères de lecture/);
    assert.match(page, /<strong>KPI<\/strong> - Indicateur clé de performance/);
    assert.match(page, /<strong>SLA<\/strong> - Délai cible de traitement/);
    for (const term of ['Moyenne', 'Médiane', 'Jours calendaires', 'Jours ouvrés'])
      assert.match(page, new RegExp(`<strong>${term}</strong>`));
  });

  it('durations are humanized from the raw days (cards, tables, delays), never the raw « 4.8 j »', () => {
    const page = html('full_report');
    assert.match(page, /<strong>4 j 19 h<\/strong>/);
    assert.match(page, /<strong>2 h 24 min<\/strong>/);
    assert.doesNotMatch(page, /4\.8 j|0\.1 j|6\.8|20\.5/);
    assert.match(page, /<td>20 j 12 h<\/td>/, 'phase average');
    assert.match(page, /<td>6 j 19 h<\/td>/, 'average age of open phases');
    assert.match(page, /<td class="danger">2 j 10 h<\/td>/, 'over the SLA target');
    assert.match(page, /Dépassement de la cible SLA/);
    assert.match(page, /<td>15 jours<\/td>/, 'SLA targets stay whole calendar days');
    assert.match(page, /Durée moyenne clôturée<\/th>/);
    assert.match(page, /Âge moyen des phases ouvertes<\/th>/);
    assert.match(page, /75%/, 'non-duration metrics keep their API text');
  });

  it('charts per report: full and processing get both, SLA the phase chart, the others none', () => {
    const expected: Record<ReportKey, [boolean, boolean]> = {
      full_report: [true, true],
      processing_delay: [true, true],
      sla: [false, true],
      bottlenecks: [false, false],
      inspections: [false, false],
      s5: [false, false],
    };
    for (const [key, [trend, phases]] of Object.entries(expected) as Array<
      [ReportKey, [boolean, boolean]]
    >) {
      const page = html(key);
      assert.equal(hasTrendChart(page), trend, `${key} trend`);
      assert.equal(hasPhaseChart(page), phases, `${key} phases`);
    }
  });

  it('the detailed tables stay next to the charts', () => {
    const page = html('full_report');
    assert.match(page, /Évolution du délai de traitement - détail/);
    assert.match(page, /<td>01\/10\/2026<\/td>/);
    assert.match(page, /Lecture par phase/);
    assert.match(page, /DEM-2026-0001/);
  });

  it('no NaN / Infinity / undefined, no internal keys, text escaped', () => {
    for (const key of [
      'full_report',
      'processing_delay',
      'sla',
      'bottlenecks',
      'inspections',
      's5',
    ] as ReportKey[]) {
      const page = html(key);
      assert.doesNotMatch(page, /NaN|Infinity|undefined/, key);
      assert.doesNotMatch(
        page,
        /average_processing_duration|median_processing_duration|calendar_days|dg_waiting|full_report|sla_compliance/,
        key
      );
      assert.equal(
        (page.match(/<section/g) ?? []).length,
        (page.match(/<\/section>/g) ?? []).length,
        `${key} sections balanced`
      );
    }
    assert.match(html('full_report'), /Air &lt;Test&gt;/);
  });

  it('an empty trend: a sentence instead of a chart, the page still renders', () => {
    const page = html('full_report', { durationTrend: [] });
    assert.equal(hasTrendChart(page), false);
    assert.match(page, /Aucun dossier clôturé sur la période/);
    assert.match(page, /Aucune donnée sur la période\./);
    assert.doesNotMatch(page, /NaN|Infinity|undefined/);
  });
});

describe('trend SVG', () => {
  it('two series with distinct styles, a legend and the unit', () => {
    const svg = renderTrendSvg(TREND)!;
    assert.match(svg, /^<svg /);
    assert.equal((svg.match(/<path /g) ?? []).length, 2);
    assert.match(svg, /stroke-dasharray="6 4"/, 'the median is dashed (grayscale)');
    assert.match(svg, />Délai moyen</);
    assert.match(svg, />Médiane</);
    assert.match(svg, /Durée en jours calendaires/);
    assert.match(svg, />01\/10</);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  });

  it('a null bucket breaks the line instead of drawing to zero', () => {
    const svg = renderTrendSvg(TREND)!;
    const averagePath = svg.match(/<path d="([^"]+)"/)![1];
    assert.equal((averagePath.match(/M/g) ?? []).length, 2);
  });

  it('safe edge cases: no point or only nulls -> null; one point; equal values; zeros', () => {
    assert.equal(renderTrendSvg([]), null);
    assert.equal(
      renderTrendSvg([{ date: '2026-10-01', averageDurationDays: null, medianDurationDays: null }]),
      null
    );
    for (const points of [
      [{ date: '2026-10-01', averageDurationDays: 3, medianDurationDays: 3 }],
      [
        { date: '2026-10-01', averageDurationDays: 2, medianDurationDays: 2 },
        { date: '2026-10-02', averageDurationDays: 2, medianDurationDays: 2 },
      ],
      [
        { date: '2026-10-01', averageDurationDays: 0, medianDurationDays: 0 },
        { date: '2026-10-02', averageDurationDays: 0, medianDurationDays: 0 },
      ],
    ]) {
      const svg = renderTrendSvg(points);
      assert.ok(svg);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    }
  });

  it('nice axis maximum', () => {
    assert.deepEqual(
      [niceAxisMax(0), niceAxisMax(6.8), niceAxisMax(15), niceAxisMax(Number.NaN)],
      [4, 8, 20, 4]
    );
  });
});

describe('phase duration vs SLA SVG', () => {
  it('average and hatched SLA bars per phase, values printed, above-target flagged in text', () => {
    const svg = renderPhaseDurationSvg([
      phase('M3', 'Préliminaire', 8, 15),
      phase('M4', 'Demande formelle', 20.5, 15),
      phase('M5', 'Évaluation approfondie', null, 30),
    ])!;
    assert.match(svg, />Préliminaire</);
    assert.match(svg, /8 j - moyenne</);
    assert.match(svg, /15 j - cible SLA</);
    assert.match(svg, /20 j 12 h - moyenne \(au-dessus de la cible\)/);
    assert.match(svg, /Aucune phase clôturée/, 'a phase without average keeps its SLA bar');
    assert.match(svg, /30 j - cible SLA/);
    assert.match(svg, /url\(#sla-hatch\)/);
    assert.match(svg, /Durée moyenne clôturée/);
    assert.match(svg, /Cible SLA \(jours calendaires\)/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  });

  it('no phase -> null', () => {
    assert.equal(renderPhaseDurationSvg([]), null);
  });
});

describe('ANALYTICS-SLA-CLARITY-1 - PDF / Excel wording', () => {
  const sla = {
    agingDistribution: [{ label: '0 - 7 jours', value: 2, color: '#16A34A' }],
    slaDistribution: [
      { label: 'Dans le délai cible', value: 3, color: '#16A34A' },
      { label: 'Au-delà du délai cible', value: 9, color: '#DC2626' },
    ],
  };

  it('PDF: phases by business name, « Phases hors délai » KPI, no raw M3-M7 cell', () => {
    const page = html('sla', sla);
    for (const name of ['Préliminaire', 'Demande formelle', 'Évaluation approfondie']) assert.match(page, new RegExp(`<td>${name}</td>`));
    assert.match(page, /<td>Phases hors délai<\/td>/);
    assert.doesNotMatch(page, /<td>M[3-7]<\/td>/);
    assert.doesNotMatch(page, /au-dela/);
  });

  it('Excel: « Respect des SLA | Phases clôturées », target wording, same numbers; phases by business name', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = await renderAnalyticsReportExcel(snapshot('full_report', sla));
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const rows = (name: string) =>
      (workbook.getWorksheet(name)!.getSheetValues() as unknown as unknown[][]).filter(Boolean).map((row) => row.slice(1));
    const distributions = rows('Répartitions');
    const header = distributions.findIndex((row) => row[0] === 'Respect des SLA');
    assert.deepEqual(distributions[header], ['Respect des SLA', 'Phases clôturées']);
    assert.deepEqual(distributions.slice(header + 1, header + 3), [
      ['Dans le délai cible', 3],
      ['Au-delà du délai cible', 9],
    ]);
    const phaseNames = rows('Phases').map((row) => row[0]);
    assert.ok(phaseNames.includes('Préliminaire') && phaseNames.includes('Évaluation approfondie'));
    assert.ok(!phaseNames.some((name) => /^M[3-7]$/.test(String(name))));
  });
});
