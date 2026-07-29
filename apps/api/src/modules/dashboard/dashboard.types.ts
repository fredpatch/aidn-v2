export type DashboardPeriod = 'this_month' | 'last_30_days' | 'quarter' | 'year';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string | number;
  helper?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
    tone: 'success' | 'warning' | 'danger' | 'muted';
  };
}

export interface DashboardPhaseStat {
  phaseCode: string;
  label: string;
  count: number;
  percentage: number;
  averageDurationDays: number | null;
}

export interface DashboardStatusStat {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface DashboardActionItem {
  id: string;
  owner: string;
  dossierReference: string;
  title: string;
  submittedAt: string | null;
  priority: 'haute' | 'moyenne' | 'basse';
  href?: string;
}

export interface DashboardMeetingItem {
  id: number;
  title: string;
  scheduledAt: string;
  requestReference: string;
  tag: 'today' | 'planned';
}

export interface DashboardActivityItem {
  id: number;
  title: string;
  requestReference: string | null;
  actor: string;
  createdAt: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}

export interface DashboardAlert {
  key: string;
  title: string;
  value: string | number;
  helper: string;
  tone: 'danger' | 'warning' | 'info';
  href?: string;
}

export interface DashboardPerformanceMetric {
  label: string;
  value: string;
  target?: string;
  percentage: number;
  tone: 'success' | 'warning' | 'info';
}

export interface DashboardSummary {
  period: DashboardPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: DashboardMetric[];
  workflow: DashboardPhaseStat[];
  statusDistribution: DashboardStatusStat[];
  actions: DashboardActionItem[];
  meetings: DashboardMeetingItem[];
  activity: DashboardActivityItem[];
  alerts: DashboardAlert[];
  performance: DashboardPerformanceMetric[];
}
