import type { AnalyticsFilters, AnalyticsOverview } from '../analytics/analytics.types.js';

export type ReportKey =
  | 'full_report'
  | 'processing_delay'
  | 'sla'
  | 'bottlenecks'
  | 'inspections'
  | 's5';

export type ReportFormat = 'pdf' | 'excel';

export interface GenerateReportInput {
  reportKey: ReportKey;
  format: ReportFormat;
  filters: AnalyticsFilters;
  generatedBy: number;
}

export interface ReportSnapshot {
  reportKey: ReportKey;
  reportTitle: string;
  generatedAt: string;
  filters: AnalyticsOverview['filters'];
  overview: AnalyticsOverview;
}

export interface GeneratedReport {
  id: number;
  reportKey: ReportKey;
  title: string;
  format: ReportFormat;
  fileUrl: string | null;
  periodStart: string;
  periodEnd: string;
  generatedBy: number | null;
  createdAt: string;
}
