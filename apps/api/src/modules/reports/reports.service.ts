import fs from 'fs/promises';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { reports } from '../../shared/db/schema.js';
import {
  ANALYTICS_REPORTS,
  defaultAnalyticsFilters,
  getAnalyticsOverview,
} from '../analytics/analytics.service.js';
import type { AnalyticsFilters, AnalyticsOverview } from '../analytics/analytics.types.js';
import { renderAnalyticsReportExcel } from './renderers/analytics-report-excel.js';
import { renderAnalyticsReportPdf } from './renderers/analytics-report-pdf.js';
import type {
  GenerateReportInput,
  GeneratedReport,
  ReportFormat,
  ReportKey,
  ReportSnapshot,
} from './reports.types.js';

const REPORT_KEYS = new Set(ANALYTICS_REPORTS.map((report) => report.key));
const FORMATS = new Set<ReportFormat>(['pdf', 'excel']);

function isReportKey(value: unknown): value is ReportKey {
  return typeof value === 'string' && REPORT_KEYS.has(value);
}

function isFormat(value: unknown): value is ReportFormat {
  return typeof value === 'string' && FORMATS.has(value as ReportFormat);
}

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

export function parseGenerateReportInput(
  body: Record<string, unknown>,
  generatedBy: number
): GenerateReportInput {
  if (!isReportKey(body.reportKey)) {
    throw new Error('REPORT_KEY_INVALID');
  }
  if (!isFormat(body.format)) {
    throw new Error('REPORT_FORMAT_INVALID');
  }

  const fallback = defaultAnalyticsFilters();
  const filters: AnalyticsFilters = {
    periodStart: parseDate(body.periodStart, fallback.periodStart),
    periodEnd: parseDate(body.periodEnd, fallback.periodEnd),
    phaseCode:
      typeof body.phaseCode === 'string' && body.phaseCode
        ? (body.phaseCode as AnalyticsFilters['phaseCode'])
        : undefined,
    requestType: typeof body.requestType === 'string' && body.requestType ? body.requestType : undefined,
    status: typeof body.status === 'string' && body.status ? body.status : undefined,
  };

  return {
    reportKey: body.reportKey,
    format: body.format,
    filters,
    generatedBy,
  };
}

function reportTitle(reportKey: ReportKey): string {
  return ANALYTICS_REPORTS.find((report) => report.key === reportKey)?.title ?? 'Rapport analytique';
}

function fileExtension(format: ReportFormat): string {
  return format === 'pdf' ? 'pdf' : 'xlsx';
}

function contentType(format: ReportFormat): string {
  return format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function buildSnapshot(reportKey: ReportKey, overview: AnalyticsOverview): ReportSnapshot {
  return {
    reportKey,
    reportTitle: reportTitle(reportKey),
    generatedAt: new Date().toISOString(),
    filters: overview.filters,
    overview,
  };
}

function buildSummary(snapshot: ReportSnapshot): Record<string, unknown> {
  return {
    reportTitle: snapshot.reportTitle,
    generatedAt: snapshot.generatedAt,
    metrics: snapshot.overview.metrics.map((metric) => ({
      key: metric.key,
      value: metric.value,
      sampleSize: metric.sampleSize ?? null,
    })),
    blockers: snapshot.overview.blockingPoints.map((point) => ({
      key: point.key,
      value: point.value,
      tone: point.tone,
    })),
    delayedDossiers: snapshot.overview.delayedDossiers.length,
  };
}

function publicReportUrl(fileName: string): string {
  return `/uploads/reports/${fileName}`;
}

async function writeReportFile(buffer: Buffer, params: GenerateReportInput): Promise<string> {
  const folder = path.resolve(process.cwd(), 'uploads', 'reports');
  await fs.mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const fileName = `${params.reportKey}-${params.format}-${stamp}.${fileExtension(params.format)}`;
  await fs.writeFile(path.join(folder, fileName), buffer);
  return publicReportUrl(fileName);
}

function toGeneratedReport(row: typeof reports.$inferSelect): GeneratedReport {
  return {
    id: row.id,
    reportKey: row.reportKey as ReportKey,
    title: reportTitle(row.reportKey as ReportKey),
    format: row.format as ReportFormat,
    fileUrl: row.fileUrl,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
  const overview = await getAnalyticsOverview(input.filters);
  const snapshot = buildSnapshot(input.reportKey, overview);
  const buffer =
    input.format === 'pdf'
      ? await renderAnalyticsReportPdf(snapshot)
      : await renderAnalyticsReportExcel(snapshot);
  const fileUrl = await writeReportFile(buffer, input);

  const inserted = await db
    .insert(reports)
    .values({
      reportKey: input.reportKey,
      periodStart: input.filters.periodStart,
      periodEnd: input.filters.periodEnd,
      format: input.format,
      trigger: 'on_demand',
      fileUrl,
      filters: overview.filters,
      summary: buildSummary(snapshot),
      generatedBy: input.generatedBy,
      aiAnalysisStatus: 'not_applicable',
    })
    .returning();

  return toGeneratedReport(inserted[0]);
}

export async function listReports(): Promise<GeneratedReport[]> {
  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(20);
  return rows.map(toGeneratedReport);
}

export async function getReport(reportId: number): Promise<GeneratedReport | null> {
  const [row] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  return row ? toGeneratedReport(row) : null;
}

export function reportDownloadHeaders(report: GeneratedReport): Record<string, string> {
  return {
    'Content-Type': contentType(report.format),
  };
}
