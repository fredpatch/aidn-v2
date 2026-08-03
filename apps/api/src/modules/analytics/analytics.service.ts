import { db } from '../../shared/db/index.js';
import {
  dgCircuitDocuments,
  meetings,
  organisations,
  payments,
  phases,
  requests,
} from '../../shared/db/schema.js';
import type {
  AnalyticsDelayedDossier,
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsOverview,
  AnalyticsPhaseCode,
  AnalyticsPhaseStat,
  AnalyticsTrendPoint,
} from './analytics.types.js';

const PHASE_LABELS: Record<AnalyticsPhaseCode, string> = {
  M3: 'Preliminaire',
  M4: 'Demande formelle',
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

const PHASE_TARGETS: Record<AnalyticsPhaseCode, number> = {
  M3: 15,
  M4: 20,
  M5: 30,
  M6: 30,
  M7: 10,
};

const REPORTS = [
  {
    key: 'processing_delay',
    title: 'Rapport delais de traitement',
    description: 'Analyse detaillee des delais par phase et par dossier.',
    available: false,
  },
  {
    key: 'sla',
    title: 'Rapport SLA',
    description: 'Respect des SLA et dossiers hors delai.',
    available: false,
  },
  {
    key: 'bottlenecks',
    title: "Rapport goulots d'etranglement",
    description: 'Identification des retards et points de blocage.',
    available: false,
  },
  {
    key: 'inspections',
    title: 'Rapport inspections',
    description: 'Durees des inspections et delais associes.',
    available: false,
  },
  {
    key: 's5',
    title: 'Rapport S5 / delais paiement',
    description: 'Paiements en attente et impact sur les delais.',
    available: false,
  },
];

function sameOrAfter(date: Date, min: Date): boolean {
  return date.getTime() >= min.getTime();
}

function sameOrBefore(date: Date, max: Date): boolean {
  return date.getTime() <= max.getTime();
}

function inPeriod(date: Date | string | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const parsed = new Date(date);
  return sameOrAfter(parsed, start) && sameOrBefore(parsed, end);
}

function daysBetween(start: Date | string | null, end: Date | string | null): number | null {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Number(((endTime - startTime) / 86_400_000).toFixed(1));
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1));
}

function median(values: Array<number | null>): number | null {
  const valid = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2) return Number(valid[middle].toFixed(1));
  return Number(((valid[middle - 1] + valid[middle]) / 2).toFixed(1));
}

function formatDays(value: number | null): string {
  return value === null ? '-' : `${value} j`;
}

function percent(part: number, total: number): string {
  return total <= 0 ? '-' : `${Math.round((part / total) * 100)}%`;
}

function requestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    recognition: 'Reconnaissance',
    issuance: 'Delivrance',
    modification: 'Modification',
    renewal: 'Renouvellement',
  };
  return labels[type] ?? type;
}

function buildTrend(
  completedDurations: Array<{ closedAt: Date; duration: number }>,
  start: Date,
  end: Date
): AnalyticsTrendPoint[] {
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  const step = Math.max(1, Math.ceil(days / 12));
  const points: AnalyticsTrendPoint[] = [];

  for (let offset = 0; offset <= days; offset += step) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + offset);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + step);

    const values = completedDurations
      .filter((item) => item.closedAt >= bucketStart && item.closedAt < bucketEnd)
      .map((item) => item.duration);

    points.push({
      date: bucketStart.toISOString().slice(0, 10),
      averageDurationDays: average(values),
      medianDurationDays: median(values),
    });
  }

  return points;
}

function buildMetric(
  key: string,
  label: string,
  value: string,
  helper: string,
  tone: AnalyticsMetric['tone'],
  sampleSize?: number,
  warning?: string
): AnalyticsMetric {
  return { key, label, value, helper, tone, sampleSize, warning };
}

export async function getAnalyticsOverview(filters: AnalyticsFilters): Promise<AnalyticsOverview> {
  const requestRows = await db.select().from(requests);
  const phaseRows = await db.select().from(phases);
  const circuitRows = await db.select().from(dgCircuitDocuments);
  const paymentRows = await db.select().from(payments);
  const meetingRows = await db.select().from(meetings);
  const organisationRows = await db.select().from(organisations);

  const organisationsById = new Map(organisationRows.map((organisation) => [organisation.id, organisation]));
  const phasesByRequest = new Map<number, typeof phaseRows>();
  phaseRows.forEach((phase) => {
    phasesByRequest.set(phase.requestId, [...(phasesByRequest.get(phase.requestId) ?? []), phase]);
  });

  const filteredRequests = requestRows.filter((request) => {
    if (filters.requestType && request.requestType !== filters.requestType) return false;
    if (filters.status && request.status !== filters.status) return false;
    if (!inPeriod(request.createdAt, filters.periodStart, filters.periodEnd)) {
      const requestPhases = phasesByRequest.get(request.id) ?? [];
      return requestPhases.some((phase) => inPeriod(phase.closedAt, filters.periodStart, filters.periodEnd));
    }
    return true;
  });
  const filteredRequestIds = new Set(filteredRequests.map((request) => request.id));

  const activeRequests = filteredRequests.filter(
    (request) => !['completed', 'cancelled', 'rejected'].includes(request.status)
  );
  const closedDeliveryPhases = phaseRows.filter(
    (phase) =>
      phase.phaseCode === 'M7' &&
      phase.closedAt &&
      inPeriod(phase.closedAt, filters.periodStart, filters.periodEnd) &&
      filteredRequestIds.has(phase.requestId)
  );

  const completedDurations = closedDeliveryPhases
    .map((phase) => {
      const request = requestRows.find((item) => item.id === phase.requestId);
      const duration = daysBetween(request?.createdAt ?? null, phase.closedAt);
      return duration === null ? null : { closedAt: phase.closedAt!, duration };
    })
    .filter((item): item is { closedAt: Date; duration: number } => item !== null);

  const averageGlobalDuration = average(completedDurations.map((item) => item.duration));
  const medianGlobalDuration = median(completedDurations.map((item) => item.duration));

  const relevantPhases = phaseRows.filter((phase) => {
    if (!filteredRequestIds.has(phase.requestId)) return false;
    if (filters.phaseCode && phase.phaseCode !== filters.phaseCode) return false;
    return true;
  });

  const phaseStats: AnalyticsPhaseStat[] = (Object.keys(PHASE_LABELS) as AnalyticsPhaseCode[]).map(
    (phaseCode) => {
      const rows = relevantPhases.filter((phase) => phase.phaseCode === phaseCode);
      const openRows = rows.filter((phase) => phase.status === 'open');
      const closedRows = rows.filter(
        (phase) => phase.status === 'closed' && inPeriod(phase.closedAt, filters.periodStart, filters.periodEnd)
      );
      const target = PHASE_TARGETS[phaseCode];
      const activeAges = openRows.map((phase) => daysBetween(phase.openedAt, new Date()));
      const closedDurations = closedRows.map((phase) => daysBetween(phase.openedAt, phase.closedAt));
      const slaBreachCount = openRows.filter((phase) => {
        const age = daysBetween(phase.openedAt, new Date());
        return age !== null && age > target;
      }).length;

      return {
        phaseCode,
        label: PHASE_LABELS[phaseCode],
        activeCount: openRows.length,
        closedCount: closedRows.length,
        averageClosedDurationDays: average(closedDurations),
        averageActiveAgeDays: average(activeAges),
        slaTargetDays: target,
        slaBreachCount,
      };
    }
  );

  const delayedDossiers: AnalyticsDelayedDossier[] = relevantPhases
    .filter((phase) => phase.status === 'open')
    .map((phase) => {
      const age = daysBetween(phase.openedAt, new Date()) ?? 0;
      const target = PHASE_TARGETS[phase.phaseCode as AnalyticsPhaseCode] ?? 0;
      const request = requestRows.find((item) => item.id === phase.requestId);
      const organisation = request ? organisationsById.get(request.organisationId) : null;

      return {
        requestId: phase.requestId,
        reference: request?.reference ?? `Demande #${phase.requestId}`,
        organisationName: organisation?.name ?? '-',
        requestType: requestTypeLabel(request?.requestType ?? '-'),
        phaseCode: phase.phaseCode as AnalyticsPhaseCode,
        phaseLabel: PHASE_LABELS[phase.phaseCode as AnalyticsPhaseCode],
        delayDays: Math.max(0, Number((age - target).toFixed(1))),
        currentAgeDays: age,
        slaTargetDays: target,
        lastActionAt: request?.updatedAt?.toISOString() ?? phase.openedAt.toISOString(),
      };
    })
    .filter((item) => item.delayDays > 0)
    .sort((a, b) => b.delayDays - a.delayDays)
    .slice(0, 6);

  const openPhaseRows = relevantPhases.filter((phase) => phase.status === 'open');
  const outsideSla = openPhaseRows.filter((phase) => {
    const age = daysBetween(phase.openedAt, new Date());
    const target = PHASE_TARGETS[phase.phaseCode as AnalyticsPhaseCode] ?? 0;
    return age !== null && age > target;
  });

  const closedPhaseRows = relevantPhases.filter(
    (phase) => phase.status === 'closed' && inPeriod(phase.closedAt, filters.periodStart, filters.periodEnd)
  );
  const closedPhaseWithinSla = closedPhaseRows.filter((phase) => {
    const duration = daysBetween(phase.openedAt, phase.closedAt);
    const target = PHASE_TARGETS[phase.phaseCode as AnalyticsPhaseCode] ?? 0;
    return duration !== null && duration <= target;
  });

  const dgWaiting = circuitRows.filter(
    (row) =>
      filteredRequestIds.has(row.requestId) &&
      ['submitted', 'in_signature_circuit'].includes(row.status)
  );
  const dgWaitingDurations = dgWaiting.map((row) =>
    daysBetween(row.signatureSentAt ?? row.depositedAt, new Date())
  );

  const phaseIdsByFilteredRequest = new Set(relevantPhases.map((phase) => phase.id));
  const blockingPayments = paymentRows.filter(
    (payment) => phaseIdsByFilteredRequest.has(payment.phaseId) && payment.status !== 'validated'
  );

  const missingReports = meetingRows.filter(
    (meeting) =>
      phaseIdsByFilteredRequest.has(meeting.phaseId) &&
      meeting.status === 'held' &&
      !meeting.crUploadedAt
  );

  const inactiveRequests = activeRequests.filter((request) => {
    const age = daysBetween(request.updatedAt, new Date());
    return age !== null && age > 15;
  });

  const agingBuckets = [
    { label: '0 - 7 jours', min: 0, max: 7, color: '#16A34A' },
    { label: '8 - 15 jours', min: 8, max: 15, color: '#F59E0B' },
    { label: '16 - 30 jours', min: 16, max: 30, color: '#F97316' },
    { label: '30+ jours', min: 31, max: Number.POSITIVE_INFINITY, color: '#DC2626' },
  ].map((bucket) => ({
    label: bucket.label,
    color: bucket.color,
    value: activeRequests.filter((request) => {
      const age = daysBetween(request.createdAt, new Date()) ?? 0;
      return age >= bucket.min && age <= bucket.max;
    }).length,
  }));

  const metrics: AnalyticsMetric[] = [
    buildMetric(
      'average_processing_duration',
      'Delai moyen de traitement',
      formatDays(averageGlobalDuration),
      'Depot initial -> cloture delivrance',
      averageGlobalDuration === null ? 'neutral' : averageGlobalDuration > 45 ? 'warning' : 'info',
      completedDurations.length,
      completedDurations.length < 5 ? 'Echantillon faible' : undefined
    ),
    buildMetric(
      'outside_sla',
      'Dossiers hors delai',
      String(outsideSla.length),
      'Phases ouvertes au-dela de leur cible',
      outsideSla.length > 0 ? 'danger' : 'success',
      openPhaseRows.length
    ),
    buildMetric(
      'sla_compliance',
      'Taux de respect SLA',
      percent(closedPhaseWithinSla.length, closedPhaseRows.length),
      'Phases cloturees dans le delai cible',
      closedPhaseRows.length === 0 ? 'neutral' : 'success',
      closedPhaseRows.length,
      closedPhaseRows.length < 5 ? 'Echantillon faible' : undefined
    ),
    buildMetric(
      'dg_wait',
      'Temps moyen en attente DG',
      formatDays(average(dgWaitingDurations)),
      'Courriers en depot ou en signature',
      dgWaiting.length > 0 ? 'warning' : 'success',
      dgWaiting.length
    ),
    buildMetric(
      'inactivity',
      "Temps d'inactivite moyen",
      formatDays(average(inactiveRequests.map((request) => daysBetween(request.updatedAt, new Date())))),
      'Dossiers actifs sans action depuis plus de 15 jours',
      inactiveRequests.length > 0 ? 'warning' : 'success',
      inactiveRequests.length
    ),
    buildMetric(
      'median_processing_duration',
      'Mediane de traitement',
      formatDays(medianGlobalDuration),
      'Mediane des dossiers clotures',
      'neutral',
      completedDurations.length
    ),
  ];

  const warnings = metrics
    .filter((metric) => metric.warning)
    .map((metric) => `${metric.label}: ${metric.warning}`);

  return {
    filters: {
      periodStart: filters.periodStart.toISOString(),
      periodEnd: filters.periodEnd.toISOString(),
      phaseCode: filters.phaseCode ?? null,
      requestType: filters.requestType ?? null,
      status: filters.status ?? null,
    },
    generatedAt: new Date().toISOString(),
    warnings,
    metrics,
    durationTrend: buildTrend(completedDurations, filters.periodStart, filters.periodEnd),
    phaseStats,
    agingDistribution: agingBuckets,
    slaDistribution: [
      { label: 'Dans les delais', value: closedPhaseWithinSla.length, color: '#16A34A' },
      {
        label: 'Hors delai',
        value: Math.max(0, closedPhaseRows.length - closedPhaseWithinSla.length),
        color: '#DC2626',
      },
    ],
    blockingPoints: [
      {
        key: 'delayed_phases',
        label: 'Phases en depassement',
        value: String(outsideSla.length),
        helper: 'Phases ouvertes au-dela du SLA',
        tone: outsideSla.length > 0 ? 'danger' : 'info',
        href: '/demandes',
      },
      {
        key: 'dg_waiting',
        label: 'Dossiers en attente DG',
        value: String(dgWaiting.length),
        helper: `Delai moyen: ${formatDays(average(dgWaitingDurations))}`,
        tone: dgWaiting.length > 0 ? 'warning' : 'info',
        href: '/courriers',
      },
      {
        key: 'inactive',
        label: 'Dossiers sans action depuis 15+ jours',
        value: String(inactiveRequests.length),
        helper: 'Basee sur la derniere mise a jour du dossier',
        tone: inactiveRequests.length > 0 ? 'warning' : 'info',
        href: '/demandes',
      },
      {
        key: 'missing_reports',
        label: 'Reunions sans compte-rendu',
        value: String(missingReports.length),
        helper: 'Reunions tenues sans CR depose',
        tone: missingReports.length > 0 ? 'warning' : 'info',
        href: '/reunions',
      },
      {
        key: 'payment_blockers',
        label: 'Paiements en attente',
        value: String(blockingPayments.length),
        helper: 'Facture, preuve ou validation bloquante',
        tone: blockingPayments.length > 0 ? 'danger' : 'info',
        href: '/paiements-s5',
      },
    ],
    delayedDossiers,
    reports: REPORTS,
  };
}

export function defaultAnalyticsFilters(): AnalyticsFilters {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart: start, periodEnd: end };
}

export function parseAnalyticsFilters(query: Record<string, unknown>): AnalyticsFilters {
  const fallback = defaultAnalyticsFilters();
  const rawStart = typeof query.periodStart === 'string' ? new Date(query.periodStart) : fallback.periodStart;
  const rawEnd = typeof query.periodEnd === 'string' ? new Date(query.periodEnd) : fallback.periodEnd;
  const periodStart = Number.isFinite(rawStart.getTime()) ? rawStart : fallback.periodStart;
  const periodEnd = Number.isFinite(rawEnd.getTime()) ? rawEnd : fallback.periodEnd;

  const phaseCode =
    typeof query.phaseCode === 'string' && query.phaseCode in PHASE_LABELS
      ? (query.phaseCode as AnalyticsPhaseCode)
      : undefined;

  return {
    periodStart,
    periodEnd,
    phaseCode,
    requestType: typeof query.requestType === 'string' && query.requestType ? query.requestType : undefined,
    status: typeof query.status === 'string' && query.status ? query.status : undefined,
  };
}
