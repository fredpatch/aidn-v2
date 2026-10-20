import { and, desc, eq, gte, inArray, lt, notLike, sql } from 'drizzle-orm';
import { RECEPTION_CIRCUIT_ENTITY_TYPES } from '../dn-annotation/dn-annotation.stage.js';
import { db } from '../../shared/db/index.js';
import {
  auditLogs,
  applicants,
  certificates,
  dgCircuitDocuments,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
  organisations,
  payments,
  phases,
  requests,
  users,
} from '../../shared/db/schema.js';
import type {
  DashboardActionItem,
  DashboardAlert,
  DashboardMetric,
  DashboardMeetingItem,
  DashboardPeriod,
  DashboardPerformanceMetric,
  DashboardPhaseStat,
  DashboardStatusStat,
  DashboardSummary,
} from './dashboard.types.js';
import { countLabel, formatCalendarDuration, workingDaysBetween, type PublicHolidays } from '@aidn/shared';
import {
  buildActivityItems,
  calendarDurationMetricValue,
  TECHNICAL_AUDIT_ACTIONS,
  type ActivityLookup,
} from './dashboard.activity.js';
import { getIntegerValue, getPublicHolidays } from '../system-parameters/system-parameters.service.js';
import { isMeetingOperationallyConfirmed } from '../meetings/meeting-confirmation.js';
import { DASHBOARD_SLA_DEFAULTS } from '../operational/thresholds.js';

const PHASE_LABELS: Record<string, string> = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposé',
  signed: 'Signé',
  pending_review: 'En attente',
  in_progress: 'En cours',
  rejected: 'Rejeté',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const TERMINAL_REQUEST_STATUSES = ['rejected', 'completed', 'cancelled'];
const DASHBOARD_MONITORING_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];

type DashboardSlaStatus = DashboardActionItem['slaStatus'];

const PHASE_SLA_STATUS_LABELS: Record<NonNullable<DashboardSlaStatus>, string> = {
  on_track: 'Dans les temps',
  warning: 'Échéance proche',
  overdue: 'Délai dépassé',
  blocked: 'Blocage opérationnel',
  unknown: 'Délai non mesuré',
};

interface DashboardSlaConfig {
  phaseTargets: Record<string, number>;
  signatureDepositDays: number;
  /** Working days (jours ouvrés), same threshold and count as the Circuit DG alert. */
  signatureReturnDays: number;
  publicHolidays: PublicHolidays;
  invoiceUploadDays: number;
  paymentValidationDays: number;
  documentEvaluationDays: number;
}

async function loadDashboardSlaConfig(): Promise<DashboardSlaConfig> {
  const [
    phaseM3Days,
    phaseM4Days,
    phaseM5Days,
    phaseM6Days,
    phaseM7Days,
    signatureDepositDays,
    signatureReturnDays,
    invoiceUploadDays,
    paymentValidationDays,
    documentEvaluationDays,
    publicHolidays,
  ] = await Promise.all([
    getIntegerValue('dashboard_sla_phase_m3_days', DASHBOARD_SLA_DEFAULTS.phaseM3Days),
    getIntegerValue('dashboard_sla_phase_m4_days', DASHBOARD_SLA_DEFAULTS.phaseM4Days),
    getIntegerValue('dashboard_sla_phase_m5_days', DASHBOARD_SLA_DEFAULTS.phaseM5Days),
    getIntegerValue('dashboard_sla_phase_m6_days', DASHBOARD_SLA_DEFAULTS.phaseM6Days),
    getIntegerValue('dashboard_sla_phase_m7_days', DASHBOARD_SLA_DEFAULTS.phaseM7Days),
    getIntegerValue(
      'dashboard_sla_signature_deposit_days',
      DASHBOARD_SLA_DEFAULTS.signatureDepositDays
    ),
    getIntegerValue('dg_circuit_alert_days', 3),
    getIntegerValue('dashboard_sla_invoice_upload_days', DASHBOARD_SLA_DEFAULTS.invoiceUploadDays),
    getIntegerValue(
      'dashboard_sla_payment_validation_days',
      DASHBOARD_SLA_DEFAULTS.paymentValidationDays
    ),
    getIntegerValue(
      'dashboard_sla_document_evaluation_days',
      DASHBOARD_SLA_DEFAULTS.documentEvaluationDays
    ),
    getPublicHolidays(),
  ]);

  return {
    phaseTargets: {
      M3: phaseM3Days,
      M4: phaseM4Days,
      M5: phaseM5Days,
      M6: phaseM6Days,
      M7: phaseM7Days,
    },
    signatureDepositDays,
    signatureReturnDays,
    publicHolidays,
    invoiceUploadDays,
    paymentValidationDays,
    documentEvaluationDays,
  };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function periodBounds(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  if (period === 'last_30_days') {
    const start = startOfDay(now);
    start.setDate(start.getDate() - 29);
    return { start, end };
  }
  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), quarterStartMonth, 1), end };
  }
  if (period === 'year') {
    return { start: new Date(now.getFullYear(), 0, 1), end };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
}

function previousBounds(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { start: previousStart, end: previousEnd };
}

function daysBetween(start: Date | string | null, end: Date | string | null): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.round((diff / 86_400_000) * 10) / 10;
}

/** Working days elapsed since `start` (1 decimal), for the signature-return
 *  target only - every other dashboard target counts calendar days. */
function workingDaysSince(start: Date | string | null, holidays: PublicHolidays): number | null {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  return Math.round(workingDaysBetween(startDate, new Date(), holidays) * 10) / 10;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function trend(current: number, previous: number): DashboardMetric['trend'] {
  if (current + previous < 5) {
    if (current === previous) {
      return { value: 'Stable', direction: 'flat', tone: 'muted' };
    }
    const delta = current - previous;
    return {
      value: `${delta > 0 ? '+' : ''}${delta} dossier${Math.abs(delta) > 1 ? 's' : ''}`,
      direction: delta > 0 ? 'up' : 'down',
      tone: delta >= 0 ? 'success' : 'warning',
    };
  }
  if (previous === 0 && current === 0) {
    return { value: 'Stable', direction: 'flat', tone: 'muted' };
  }
  if (previous === 0) {
    return { value: 'Nouvelle activité', direction: 'up', tone: 'success' };
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  return {
    value: `${delta > 0 ? '+' : ''}${delta}%`,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    tone: delta >= 0 ? 'success' : 'warning',
  };
}

function priorityFromAge(date: Date | string | null): DashboardActionItem['priority'] {
  if (!date) return 'basse';
  const ageDays = daysBetween(date, new Date()) ?? 0;
  if (ageDays >= 3) return 'haute';
  if (ageDays >= 1) return 'moyenne';
  return 'basse';
}

function slaStatusFromWaitingDays(
  waitingDays: number | null | undefined,
  targetDays: number
): DashboardSlaStatus {
  if (waitingDays === null || waitingDays === undefined) return 'unknown';
  if (waitingDays > targetDays) return 'overdue';
  if (waitingDays >= Math.max(targetDays - 1, 1)) return 'warning';
  return 'on_track';
}

function slaLabel(
  status: DashboardSlaStatus,
  targetDays: number,
  overdueDays?: number | null,
  unit = 'j'
): string {
  if (status === 'unknown') return 'Délai non mesuré';
  if (status === 'overdue') {
    // Calendar overruns read like /analytique; working days stay a count.
    const overrun = unit === 'j' ? formatCalendarDuration(overdueDays) : `${overdueDays} ${unit}`;
    return `Délai dépassé${overdueDays ? ` de ${overrun}` : ''}`;
  }
  if (status === 'warning') return `Échéance proche (${targetDays} ${unit} cible)`;
  if (status === 'blocked') return 'Blocage opérationnel';
  return `Dans les temps (${targetDays} ${unit} cible)`;
}

/** `workingDaysWaiting`, when given, replaces the calendar waitingDays for the
 *  target comparison (the signature return counts working days). */
function enrichActionDelay<T extends DashboardActionItem>(
  action: T,
  targetDays: number,
  blockingStatus: DashboardSlaStatus = 'overdue',
  workingDaysWaiting?: number | null
): T {
  const countsWorkingDays = workingDaysWaiting !== undefined;
  const waitingDays = countsWorkingDays ? workingDaysWaiting : (action.waitingDays ?? null);
  const computedStatus = slaStatusFromWaitingDays(waitingDays, targetDays);
  const status =
    computedStatus === 'overdue' && blockingStatus === 'blocked' ? 'blocked' : computedStatus;
  const overdueDays =
    waitingDays !== null && waitingDays !== undefined && waitingDays > targetDays
      ? Math.round((waitingDays - targetDays) * 10) / 10
      : null;
  return {
    ...action,
    slaTargetDays: targetDays,
    slaStatus: status,
    slaLabel: slaLabel(status, targetDays, overdueDays, countsWorkingDays ? 'j’ouvrés' : 'j'),
    overdueDays,
    priority:
      status === 'blocked' || status === 'overdue'
        ? 'haute'
        : status === 'warning'
          ? 'moyenne'
          : action.priority,
  };
}

function hasAnyRole(userRoles: string[], allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}

function actionAccess(
  userRoles: string[],
  actionRoles: string[]
): Pick<DashboardActionItem, 'actionRoles' | 'canAct' | 'accessLabel'> {
  const hasOperationalRole = hasAnyRole(
    userRoles.filter((role) => role !== 'SU'),
    actionRoles
  );
  return {
    actionRoles,
    canAct: hasOperationalRole,
    accessLabel: hasOperationalRole ? 'Action à traiter' : 'Suivi lecture seule',
  };
}

function alertAccess(
  userRoles: string[],
  actionRoles: string[]
): Pick<DashboardAlert, 'actionRoles' | 'canAct' | 'accessLabel'> {
  const access = actionAccess(userRoles, actionRoles);
  return access;
}

function shouldShowAction(userRoles: string[], actionRoles: string[]): boolean {
  return hasAnyRole(userRoles, actionRoles) || hasAnyRole(userRoles, DASHBOARD_MONITORING_ROLES);
}

function hrefForRoles(
  userRoles: string[],
  allowedRoles: string[],
  href: string
): string | undefined {
  return hasAnyRole(userRoles, allowedRoles) ? href : undefined;
}

function waitingLabel(date: Date | string | null): string {
  const waitingDays = daysBetween(date, new Date());
  if (waitingDays === null) return 'Délai non mesuré';
  if (waitingDays < 1) return "Aujourd'hui";
  return `${formatCalendarDuration(waitingDays)} d'attente`;
}

function resolveDashboardRequestStatus(
  request: typeof requests.$inferSelect,
  phaseRows: Array<typeof phases.$inferSelect>
): string {
  if (TERMINAL_REQUEST_STATUSES.includes(request.status)) return request.status;
  const deliveryPhase = phaseRows.find(
    (phase) => phase.requestId === request.id && phase.phaseCode === 'M7'
  );
  if (deliveryPhase?.status === 'closed') return 'completed';
  return request.status;
}

async function countRequestsBetween(start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requests)
    .where(and(gte(requests.createdAt, start), lt(requests.createdAt, end)));
  return row?.count ?? 0;
}

export async function getDashboardSummary(
  period: DashboardPeriod = 'this_month',
  userRoles: string[] = []
): Promise<DashboardSummary> {
  const { start, end } = periodBounds(period);
  const previous = previousBounds(start, end);
  const slaConfig = await loadDashboardSlaConfig();

  const [
    requestRows,
    phaseRows,
    circuitRows,
    meetingRows,
    paymentRows,
    certificateRows,
    formalDocumentRows,
    evaluationRows,
    applicantRows,
    organisationRows,
    recentAuditRows,
    currentRequestVolume,
    previousRequestVolume,
  ] = await Promise.all([
    db.select().from(requests),
    db.select().from(phases),
    db.select().from(dgCircuitDocuments).where(inArray(dgCircuitDocuments.entityType, [...RECEPTION_CIRCUIT_ENTITY_TYPES])),
    db.select().from(meetings),
    db.select().from(payments),
    db.select().from(certificates),
    db.select().from(formalRequestDocuments),
    db.select().from(documentEvaluations),
    db.select().from(applicants),
    db.select().from(organisations),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityId: auditLogs.entityId,
        requestId: auditLogs.requestId,
        details: auditLogs.details,
        module: auditLogs.module,
        createdAt: auditLogs.createdAt,
        // SESSION1-MEET-1 - portal actions are audited with the applicant as actor.
        actor: sql<string | null>`coalesce(${users.fullName}, ${applicants.fullName})`,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .leftJoin(applicants, eq(auditLogs.applicantId, applicants.id))
      // Connections are not business activity: filtered here so the 3 shown are never crowded out.
      .where(and(...TECHNICAL_AUDIT_ACTIONS.map((action) => notLike(auditLogs.action, `%${action}%`))))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(12),
    countRequestsBetween(start, end),
    countRequestsBetween(previous.start, previous.end),
  ]);

  const requestById = new Map(requestRows.map((request) => [request.id, request]));
  const phaseById = new Map(phaseRows.map((phase) => [phase.id, phase]));
  const resolvedRequestStatusById = new Map(
    requestRows.map((request) => [request.id, resolveDashboardRequestStatus(request, phaseRows)])
  );
  const applicantById = new Map(applicantRows.map((applicant) => [applicant.id, applicant]));
  const organisationById = new Map(
    organisationRows.map((organisation) => [organisation.id, organisation])
  );

  function requestContext(
    requestId: number | undefined
  ): Pick<DashboardActionItem, 'dossierReference' | 'organisationName' | 'applicantName'> {
    if (!requestId) return { dossierReference: 'Demande -' };
    const request = requestById.get(requestId);
    const applicant = request ? applicantById.get(request.applicantId) : null;
    const organisation = request ? organisationById.get(request.organisationId) : null;
    return {
      dossierReference: request?.reference ?? `Demande #${requestId}`,
      organisationName: organisation?.name,
      applicantName: applicant?.fullName,
    };
  }
  const activeRequests = requestRows.filter(
    (request) =>
      !TERMINAL_REQUEST_STATUSES.includes(
        resolvedRequestStatusById.get(request.id) ?? request.status
      )
  ).length;
  const openPhases = phaseRows.filter((phase) => phase.status === 'open').length;
  const pendingDgCircuit = circuitRows.filter((circuit) =>
    ['submitted', 'in_signature_circuit', 'signed'].includes(circuit.status)
  ).length;
  const pendingPayments = paymentRows.filter((payment) =>
    ['awaiting_invoice', 'awaiting_proof', 'pending_validation'].includes(payment.status)
  ).length;
  const deliveredCertificates = certificateRows.filter(
    (certificate) =>
      certificate.collectedAt && certificate.collectedAt >= start && certificate.collectedAt < end
  ).length;
  const completedGlobalDurations = certificateRows
    .filter((certificate) => certificate.collectedAt)
    .map((certificate) => {
      const request = requestById.get(certificate.requestId);
      return daysBetween(request?.createdAt ?? null, certificate.collectedAt);
    });
  const averageGlobalDuration = average(completedGlobalDurations);
  const globalDurationSample = completedGlobalDurations.filter((value) => value !== null).length;

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const upcomingMeetings = meetingRows.filter(
    (meeting) =>
      meeting.status === 'scheduled' &&
      meeting.scheduledAt >= new Date() &&
      meeting.scheduledAt <= nextWeek
  );

  const metrics: DashboardMetric[] = [
    {
      key: 'active_requests',
      label: 'Dossiers actifs',
      value: activeRequests,
      trend: trend(currentRequestVolume, previousRequestVolume),
      helper: 'Non clôturés / non rejetés',
      definition: 'Demandes dont le statut n’est pas terminé, rejeté ou annulé.',
      periodLabel: 'État actuel',
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
    {
      key: 'open_phases',
      label: 'Phases ouvertes',
      value: openPhases,
      helper: 'Phases M3-M7 en cours',
      definition: 'Nombre de phases de traitement actuellement ouvertes, tous dossiers confondus.',
      periodLabel: 'État actuel',
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
    {
      key: 'average_global_duration',
      label: 'Durée moyenne globale',
      ...calendarDurationMetricValue(averageGlobalDuration),
      helper: 'Entrée -> retrait physique',
      definition:
        'Durée calendaire moyenne entre la création de la demande et le retrait du certificat, calculée sur les certificats déjà retirés.',
      periodLabel: 'Historique des retraits',
      sampleSize: globalDurationSample,
      // One certificate per dossier (K8b): each observation is a dossier whose certificate was collected.
      sampleLabel: countLabel(globalDurationSample, { singular: 'dossier avec certificat retiré', plural: 'dossiers avec certificat retiré' }),
    },
    {
      key: 'pending_dg_mail',
      label: 'En attente signature',
      value: pendingDgCircuit,
      helper: 'Courriers en circuit',
      definition:
        'Courriers déposés, en signature ou signés mais pas encore transmis au traitement.',
      periodLabel: 'État actuel',
      href: hrefForRoles(userRoles, ['reception', 'assistant_dg', 'SU'], '/courriers'),
    },
    {
      key: 'pending_payments',
      label: 'Paiements bloquants',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
      definition:
        'Paiements qui bloquent une phase: facture attendue, preuve attendue ou validation Finance attendue.',
      periodLabel: 'État actuel',
      href: hrefForRoles(userRoles, ['s5_agent', 'SU'], '/paiements-s5'),
    },
  ];

  const totalOpenPhases = phaseRows.filter((phase) => phase.status === 'open').length;
  const workflow: DashboardPhaseStat[] = ['M3', 'M4', 'M5', 'M6', 'M7'].map((phaseCode) => {
    const rows = phaseRows.filter((phase) => phase.phaseCode === phaseCode);
    const openCount = rows.filter((phase) => phase.status === 'open').length;
    const openDurations = rows
      .filter((phase) => phase.status === 'open')
      .map((phase) => daysBetween(phase.openedAt, new Date()));
    const closedDurations = rows
      .filter((phase) => phase.closedAt)
      .map((phase) => daysBetween(phase.openedAt, phase.closedAt));
    const slaTargetDays = slaConfig.phaseTargets[phaseCode];
    const slaBreachCount = openDurations.filter(
      (duration): duration is number => duration !== null && duration > slaTargetDays
    ).length;
    const activeAverageAgeDays = average(openDurations);
    const status =
      openCount === 0
        ? 'unknown'
        : slaBreachCount > 0
          ? 'overdue'
          : activeAverageAgeDays !== null && activeAverageAgeDays >= Math.max(slaTargetDays - 2, 1)
            ? 'warning'
            : 'on_track';
    return {
      phaseCode,
      label: PHASE_LABELS[phaseCode],
      count: openCount,
      percentage: percent(openCount, totalOpenPhases),
      averageDurationDays: average(closedDurations),
      activeAverageAgeDays,
      slaTargetDays,
      slaBreachCount,
      slaStatus: status,
      // Concise status badge; the target is its own line (wording of /analytique).
      slaLabel: openCount === 0 ? undefined : PHASE_SLA_STATUS_LABELS[status],
      slaTargetLabel: `Cible SLA : ${slaTargetDays} jours calendaires`,
      emptyLabel: openCount === 0 ? 'Aucun dossier actif' : undefined,
      durationLabel:
        closedDurations.filter((duration): duration is number => duration !== null).length === 0
          ? 'Pas encore de durée clôturée'
          : undefined,
    };
  });

  const totalRequests = requestRows.length;
  const statusDistribution: DashboardStatusStat[] = Object.entries(STATUS_LABELS)
    .map(([status, label]) => {
      const count = requestRows.filter(
        (request) => (resolvedRequestStatusById.get(request.id) ?? request.status) === status
      ).length;
      return { status, label, count, percentage: percent(count, totalRequests) };
    })
    .filter((item) => item.count > 0);

  const paymentActions: DashboardActionItem[] = paymentRows
    .filter((payment) => ['awaiting_invoice', 'pending_validation'].includes(payment.status))
    .slice(0, 4)
    .map((payment) => {
      const phase = phaseById.get(payment.phaseId);
      const context = requestContext(phase?.requestId);
      const submittedAt = payment.proofUploadedAt ?? payment.invoiceUploadedAt ?? null;
      const targetDays =
        payment.status === 'awaiting_invoice'
          ? slaConfig.invoiceUploadDays
          : slaConfig.paymentValidationDays;
      return enrichActionDelay(
        {
          id: `payment-${payment.id}`,
          owner: 'Finance',
          responsibleService: 'Finance',
          ...actionAccess(userRoles, ['s5_agent']),
          ...context,
          title:
            payment.status === 'awaiting_invoice'
              ? 'Envoyer la facture au postulant'
              : 'Valider la preuve de paiement',
          submittedAt: submittedAt?.toISOString() ?? null,
          waitingDays: daysBetween(submittedAt, new Date()),
          waitingLabel: waitingLabel(submittedAt),
          blockingReason:
            payment.status === 'awaiting_invoice'
              ? 'La phase attend la facture avant la preuve de paiement.'
              : 'La phase attend la décision Finance sur la preuve de paiement.',
          priority: priorityFromAge(submittedAt),
          href: phase
            ? `/demandes/${phase.requestId}/${phase.phaseCode === 'M7' ? 'delivrance' : phase.phaseCode === 'M6' ? 'demonstration-inspection' : 'evaluation-approfondie'}`
            : undefined,
        },
        targetDays,
        'blocked'
      );
    });

  const signatureActions: DashboardActionItem[] = circuitRows
    .filter((circuit) => ['submitted', 'in_signature_circuit', 'signed'].includes(circuit.status))
    .slice(0, 4)
    .map((circuit) => {
      const waitingFrom = circuit.signatureSentAt ?? circuit.depositedAt;
      return enrichActionDelay(
        {
          id: `circuit-${circuit.id}`,
          owner:
            circuit.entityType === 'formal_request_letter' || circuit.entityType === 'pre_evaluation'
              ? 'Réception / Assistant DG'
              : 'Réception',
          responsibleService: 'Circuit signature',
          ...actionAccess(userRoles, ['reception', 'assistant_dg']),
          ...requestContext(circuit.requestId),
          title:
            circuit.status === 'submitted'
              ? 'Ouvrir / imprimer le courrier'
              : 'Scanner le retour signé',
          submittedAt: circuit.depositedAt.toISOString(),
          dueAt: circuit.signatureSentAt?.toISOString() ?? null,
          waitingDays: daysBetween(waitingFrom, new Date()),
          waitingLabel: waitingLabel(waitingFrom),
          blockingReason:
            circuit.status === 'submitted'
              ? 'Le courrier doit être imprimé puis mis en circuit signature.'
              : 'Le retour signé doit être scanné pour transmettre le dossier au traitement.',
          priority: priorityFromAge(circuit.depositedAt),
          href: '/courriers',
        },
        circuit.status === 'submitted'
          ? slaConfig.signatureDepositDays
          : slaConfig.signatureReturnDays,
        'blocked',
        circuit.status === 'submitted'
          ? undefined
          : workingDaysSince(waitingFrom, slaConfig.publicHolidays)
      );
    });

  const documentActions: DashboardActionItem[] = evaluationRows
    .filter((evaluation) => evaluation.verdict === null)
    .slice(0, 4)
    .map((evaluation) => {
      const formalDocument = formalDocumentRows.find(
        (document) => document.id === evaluation.formalRequestDocumentId
      );
      const phase = formalDocument ? phaseById.get(formalDocument.phaseId) : null;
      const context = requestContext(phase?.requestId);
      return enrichActionDelay(
        {
          id: `evaluation-${evaluation.id}`,
          owner: 'DN',
          responsibleService: 'Direction de la Navigabilité',
          ...actionAccess(userRoles, ['dn_agent', 'dn_supervisor']),
          ...context,
          title: 'Évaluer un document formel',
          submittedAt: formalDocument?.submittedAt?.toISOString() ?? null,
          dueAt: evaluation.correctionDeadline?.toISOString() ?? null,
          waitingDays: daysBetween(formalDocument?.submittedAt ?? null, new Date()),
          waitingLabel: waitingLabel(formalDocument?.submittedAt ?? null),
          blockingReason: 'Le dossier attend un verdict DN sur une pièce documentaire.',
          priority: priorityFromAge(formalDocument?.submittedAt ?? null),
          href: phase ? `/demandes/${phase.requestId}/evaluation-approfondie` : undefined,
        },
        slaConfig.documentEvaluationDays
      );
    });

  const actions = [...signatureActions, ...paymentActions, ...documentActions]
    .filter((action) => shouldShowAction(userRoles, action.actionRoles))
    .sort((a, b) => {
      const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 6);

  const today = new Date().toDateString();
  const meetingsList: DashboardMeetingItem[] = upcomingMeetings
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .slice(0, 5)
    .map((meeting) => {
      const phase = phaseById.get(meeting.phaseId);
      const request = phase ? requestById.get(phase.requestId) : null;
      return {
        id: meeting.id,
        title:
          meeting.meetingType === 'site_visit'
            ? 'Inspection sur site'
            : meeting.meetingType === 'formal'
              ? 'Réunion formelle'
              : 'Réunion préliminaire',
        scheduledAt: meeting.scheduledAt.toISOString(),
        requestReference: request?.reference ?? `Demande #${phase?.requestId ?? '-'}`,
        tag: meeting.scheduledAt.toDateString() === today ? 'today' : 'planned',
        awaitingConfirmation: !isMeetingOperationallyConfirmed(meeting),
      };
    });

  // DASH-DN-UX-1 - the dossier of each event, from what is already loaded.
  const activityLookup: ActivityLookup = {
    requestReferenceById: new Map(requestRows.map((request) => [request.id, request.reference])),
    phaseRequestId: new Map(phaseRows.map((phase) => [phase.id, phase.requestId])),
    paymentPhaseId: new Map(paymentRows.map((payment) => [payment.id, payment.phaseId])),
    meetingPhaseId: new Map(meetingRows.map((meeting) => [meeting.id, meeting.phaseId])),
    certificateRequestId: new Map(certificateRows.map((certificate) => [certificate.id, certificate.requestId])),
    circuitRequestId: new Map(circuitRows.map((circuit) => [circuit.id, circuit.requestId])),
    formalDocumentPhaseId: new Map(formalDocumentRows.map((document) => [document.id, document.phaseId])),
    evaluationDocumentId: new Map(
      evaluationRows.map((evaluation) => [evaluation.id, evaluation.formalRequestDocumentId])
    ),
  };
  const activity = buildActivityItems(recentAuditRows, activityLookup, (requestId) =>
    hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], `/demandes?id=${requestId}`)
  );

  const missingFormalDocumentRequests = new Set(
    formalDocumentRows
      .filter((document) => document.status === 'missing')
      .map((document) => phaseById.get(document.phaseId)?.requestId)
      .filter((requestId): requestId is number => requestId !== undefined)
  );
  const missingFormalDocuments = missingFormalDocumentRequests.size;
  const overdueCorrections = evaluationRows.filter(
    (evaluation) =>
      evaluation.correctionDeadline !== null &&
      evaluation.verdict !== 'validated' &&
      evaluation.correctionDeadline < new Date()
  ).length;

  const alerts: DashboardAlert[] = [
    {
      key: 'missing_documents',
      title: 'Documents manquants',
      value: `${missingFormalDocuments} dossier${missingFormalDocuments > 1 ? 's' : ''}`,
      helper: 'En attente de documents obligatoires',
      tone: missingFormalDocuments > 0 ? 'danger' : 'info',
      ...alertAccess(userRoles, ['dn_agent', 'dn_supervisor']),
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
    {
      key: 'pending_dg',
      title: 'Retour signature en attente',
      value: pendingDgCircuit,
      helper: 'Courriers en circuit signature',
      tone: pendingDgCircuit > 0 ? 'warning' : 'info',
      ...alertAccess(userRoles, ['reception', 'assistant_dg']),
      href: hrefForRoles(userRoles, ['reception', 'assistant_dg', 'SU'], '/courriers'),
    },
    {
      key: 'pending_payments',
      title: 'Paiements en attente',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
      tone: pendingPayments > 0 ? 'danger' : 'info',
      ...alertAccess(userRoles, ['s5_agent']),
      href: hrefForRoles(userRoles, ['s5_agent', 'SU'], '/paiements-s5'),
    },
    {
      key: 'overdue_corrections',
      title: 'Échéances dépassées',
      value: overdueCorrections,
      helper: 'Corrections documentaires en retard',
      tone: overdueCorrections > 0 ? 'warning' : 'info',
      ...alertAccess(userRoles, ['dn_agent', 'dn_supervisor']),
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
  ];

  const closedThisPeriod = phaseRows.filter(
    (phase) =>
      phase.phaseCode === 'M7' && phase.closedAt && phase.closedAt >= start && phase.closedAt < end
  ).length;
  const totalEvaluations = evaluationRows.length;
  const validatedEvaluations = evaluationRows.filter(
    (evaluation) => evaluation.verdict === 'validated'
  ).length;
  const complianceRate = percent(validatedEvaluations, totalEvaluations);

  const performance: DashboardPerformanceMetric[] = [
    {
      label: 'Dossiers clôturés sur la période',
      value: `${closedThisPeriod} / ${Math.max(currentRequestVolume, closedThisPeriod)}`,
      percentage: percent(closedThisPeriod, Math.max(currentRequestVolume, closedThisPeriod)),
      tone: 'success',
      helper: 'Phases de délivrance clôturées sur le volume entrant de la période.',
      denominator: Math.max(currentRequestVolume, closedThisPeriod),
    },
    {
      label: 'Demandes reçues sur la période',
      value: String(currentRequestVolume),
      target: 'Volume entrant',
      percentage: percent(
        currentRequestVolume,
        Math.max(previousRequestVolume, currentRequestVolume, 1)
      ),
      tone: 'info',
      helper: 'Demandes créées dans la période sélectionnée.',
      denominator: Math.max(previousRequestVolume, currentRequestVolume, 1),
    },
    {
      label: 'Taux de conformité documentaire',
      value: `${complianceRate}%`,
      percentage: complianceRate,
      tone: complianceRate >= 80 ? 'success' : 'warning',
      helper: `${validatedEvaluations} document${validatedEvaluations > 1 ? 's' : ''} accepte${validatedEvaluations > 1 ? 's' : ''} sur ${totalEvaluations}.`,
      denominator: totalEvaluations,
    },
    {
      label: 'Agréments / reconnaissances délivrés',
      value: String(deliveredCertificates),
      percentage: percent(
        deliveredCertificates,
        Math.max(currentRequestVolume, deliveredCertificates)
      ),
      tone: 'success',
      helper: 'Certificats retires physiquement pendant la période.',
      denominator: Math.max(currentRequestVolume, deliveredCertificates),
    },
  ];

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics,
    workflow,
    statusDistribution,
    actions,
    meetings: meetingsList,
    activity,
    alerts,
    performance,
  };
}
