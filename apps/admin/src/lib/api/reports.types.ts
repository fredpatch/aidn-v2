import type { AnalyticsFilters } from './analytics.types';

export type ReportKey =
  | 'full_report'
  | 'processing_delay'
  | 'sla'
  | 'bottlenecks'
  | 'inspections'
  | 's5';

export type ReportFormat = 'pdf' | 'excel';

export interface GenerateReportInput extends AnalyticsFilters {
  reportKey: ReportKey;
  format: ReportFormat;
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
