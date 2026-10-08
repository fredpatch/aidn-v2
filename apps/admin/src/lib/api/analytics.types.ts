export type AnalyticsPhaseCode = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

export interface AnalyticsFilters {
  periodStart?: string;
  periodEnd?: string;
  phaseCode?: AnalyticsPhaseCode | '';
  requestType?: string;
  status?: string;
}

export interface AnalyticsMetric {
  key: string;
  label: string;
  value: string;
  helper: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  sampleSize?: number;
  warning?: string;
}

export interface AnalyticsPhaseStat {
  phaseCode: AnalyticsPhaseCode;
  label: string;
  activeCount: number;
  closedCount: number;
  averageClosedDurationDays: number | null;
  averageActiveAgeDays: number | null;
  slaTargetDays: number;
  slaBreachCount: number;
}

export interface AnalyticsTrendPoint {
  date: string;
  averageDurationDays: number | null;
  medianDurationDays: number | null;
}

export interface AnalyticsDistributionItem {
  label: string;
  value: number;
  color: string;
}

export interface AnalyticsBlockingPoint {
  key: string;
  label: string;
  value: string;
  helper: string;
  tone: 'warning' | 'danger' | 'info';
  href?: string;
}

export interface AnalyticsDelayedDossier {
  requestId: number;
  reference: string;
  organisationName: string;
  requestType: string;
  phaseCode: AnalyticsPhaseCode;
  phaseLabel: string;
  delayDays: number;
  currentAgeDays: number;
  slaTargetDays: number;
  lastActionAt: string;
}

/** K6 - a held meeting that still calls for an action (API: meetings/meeting-follow-up.ts). */
export interface AnalyticsMeetingFollowUp {
  meetingId: number;
  requestId: number;
  reference: string;
  organisationName: string;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  phaseCode: AnalyticsPhaseCode;
  scheduledAt: string;
  agentName: string | null;
}

export interface AnalyticsReportCard {
  key: string;
  title: string;
  description: string;
  available: boolean;
}

export interface AnalyticsOverview {
  filters: {
    periodStart: string;
    periodEnd: string;
    phaseCode: AnalyticsPhaseCode | null;
    requestType: string | null;
    status: string | null;
  };
  generatedAt: string;
  warnings: string[];
  metrics: AnalyticsMetric[];
  durationTrend: AnalyticsTrendPoint[];
  phaseStats: AnalyticsPhaseStat[];
  agingDistribution: AnalyticsDistributionItem[];
  slaDistribution: AnalyticsDistributionItem[];
  blockingPoints: AnalyticsBlockingPoint[];
  delayedDossiers: AnalyticsDelayedDossier[];
  meetingFollowUps: {
    missingReports: AnalyticsMeetingFollowUp[];
    missingR3Opinions: AnalyticsMeetingFollowUp[];
  };
  reports: AnalyticsReportCard[];
}
