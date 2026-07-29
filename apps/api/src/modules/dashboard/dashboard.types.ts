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

export interface S5DashboardMetric {
  key: string;
  label: string;
  value: string | number;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface S5DashboardPaymentItem {
  id: string;
  phaseId: number;
  phaseCode: 'M5' | 'M6' | 'M7';
  phaseLabel: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  paymentId: number;
  status: string;
  statusLabel: string;
  nextAction: string;
  invoiceUploadedAt: string | null;
  proofUploadedAt: string | null;
  validatedAt: string | null;
  waitingDays: number | null;
  waitingLabel: string;
  priority: 'haute' | 'moyenne' | 'basse';
  href: string;
}

export interface S5DashboardFlowStep {
  key: string;
  label: string;
  description: string;
  count: number;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface S5DashboardAlert {
  key: string;
  title: string;
  value: number | string;
  helper: string;
  tone: 'danger' | 'warning' | 'info';
  href?: string;
}

export interface S5DashboardActivityItem {
  id: number;
  title: string;
  requestReference: string | null;
  organisationName?: string;
  actor: string;
  createdAt: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}

export interface S5DashboardProgressMetric {
  label: string;
  value: string;
  helper?: string;
  percentage: number;
  tone: 'success' | 'warning' | 'info' | 'danger';
}

export interface S5DashboardSummary {
  period: DashboardPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: S5DashboardMetric[];
  flow: S5DashboardFlowStep[];
  priorityActions: S5DashboardPaymentItem[];
  recentInvoices: S5DashboardPaymentItem[];
  proofsToApprove: S5DashboardPaymentItem[];
  alerts: S5DashboardAlert[];
  activity: S5DashboardActivityItem[];
  monthlyProgress: S5DashboardProgressMetric[];
  updatedAt: string;
}

export interface ReceptionDashboardMetric {
  key: string;
  label: string;
  value: string | number;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface ReceptionDashboardCourrierItem {
  id: string;
  circuitId: number;
  entityType: 'intake_request' | 'formal_request_letter';
  sourceLabel: string;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  applicantName: string;
  status: string;
  statusLabel: string;
  nextAction: string;
  depositedAt: string;
  signatureSentAt: string | null;
  signedAt: string | null;
  waitingDays: number | null;
  waitingLabel: string;
  priority: 'haute' | 'moyenne' | 'basse';
  href: string;
}

export interface ReceptionDashboardFlowStep {
  key: string;
  label: string;
  description: string;
  count: number;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface ReceptionDashboardAlert {
  key: string;
  title: string;
  value: number | string;
  helper: string;
  tone: 'danger' | 'warning' | 'info';
  href?: string;
}

export interface ReceptionDashboardActivityItem {
  id: number;
  title: string;
  requestReference: string | null;
  organisationName?: string;
  actor: string;
  createdAt: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}

export interface ReceptionDashboardProgressMetric {
  label: string;
  value: string;
  helper?: string;
  percentage: number;
  tone: 'success' | 'warning' | 'info' | 'danger';
}

export interface ReceptionDashboardSummary {
  period: DashboardPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: ReceptionDashboardMetric[];
  flow: ReceptionDashboardFlowStep[];
  priorityActions: ReceptionDashboardCourrierItem[];
  toPrint: ReceptionDashboardCourrierItem[];
  waitingSignature: ReceptionDashboardCourrierItem[];
  alerts: ReceptionDashboardAlert[];
  activity: ReceptionDashboardActivityItem[];
  periodProgress: ReceptionDashboardProgressMetric[];
  updatedAt: string;
}

export interface R3DashboardMetric {
  key: string;
  label: string;
  value: string | number;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface R3DashboardMissionItem {
  id: string;
  phaseId: number;
  requestId: number;
  requestReference: string;
  requestType: string;
  organisationName: string;
  scheduledAt: string;
  location: string | null;
  visitStatus: string;
  paymentStatus: string | null;
  inspectionVerdict: string | null;
  statusLabel: string;
  nextAction: string;
  waitingDays: number | null;
  priority: 'haute' | 'moyenne' | 'basse';
  href: string;
}

export interface R3DashboardFlowStep {
  key: string;
  label: string;
  description: string;
  count: number;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface R3DashboardAlert {
  key: string;
  title: string;
  value: number | string;
  helper: string;
  tone: 'danger' | 'warning' | 'info';
  href?: string;
}

export interface R3DashboardActivityItem {
  id: number;
  title: string;
  requestReference: string | null;
  organisationName?: string;
  actor: string;
  createdAt: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}

export interface R3DashboardProgressMetric {
  label: string;
  value: string;
  helper?: string;
  percentage: number;
  tone: 'success' | 'warning' | 'info' | 'danger';
}

export interface R3DashboardSummary {
  period: DashboardPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: R3DashboardMetric[];
  flow: R3DashboardFlowStep[];
  priorityActions: R3DashboardMissionItem[];
  upcomingVisits: R3DashboardMissionItem[];
  reportsDue: R3DashboardMissionItem[];
  alerts: R3DashboardAlert[];
  activity: R3DashboardActivityItem[];
  periodProgress: R3DashboardProgressMetric[];
  updatedAt: string;
}
