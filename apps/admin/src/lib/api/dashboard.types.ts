export type DashboardPeriod = 'this_month' | 'last_30_days' | 'quarter' | 'year';
export type DashboardSlaStatus = 'on_track' | 'warning' | 'overdue' | 'blocked' | 'unknown';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string | number;
  helper?: string;
  definition?: string;
  periodLabel?: string;
  sampleSize?: number;
  href?: string;
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
  activeAverageAgeDays?: number | null;
  slaTargetDays?: number;
  slaBreachCount?: number;
  slaStatus?: DashboardSlaStatus;
  slaLabel?: string;
  emptyLabel?: string;
  durationLabel?: string;
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
  responsibleService: string;
  actionRoles: string[];
  canAct: boolean;
  accessLabel: string;
  dossierReference: string;
  organisationName?: string;
  applicantName?: string;
  title: string;
  submittedAt: string | null;
  dueAt?: string | null;
  waitingDays?: number | null;
  waitingLabel?: string;
  slaTargetDays?: number;
  slaStatus?: DashboardSlaStatus;
  slaLabel?: string;
  overdueDays?: number | null;
  blockingReason?: string;
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
  actionRoles: string[];
  canAct: boolean;
  accessLabel: string;
  href?: string;
}

export interface DashboardPerformanceMetric {
  label: string;
  value: string;
  target?: string;
  percentage: number;
  tone: 'success' | 'warning' | 'info';
  helper?: string;
  denominator?: number;
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
