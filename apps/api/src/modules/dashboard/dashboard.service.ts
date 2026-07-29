import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
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
  DashboardActivityItem,
  DashboardAlert,
  DashboardMetric,
  DashboardMeetingItem,
  DashboardPeriod,
  DashboardPerformanceMetric,
  DashboardPhaseStat,
  DashboardStatusStat,
  DashboardSummary,
} from './dashboard.types.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';

const PHASE_LABELS: Record<string, string> = {
  M3: 'Preliminaire',
  M4: 'Demande formelle',
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

const DASHBOARD_SLA_DEFAULTS = {
  phaseM3Days: 15,
  phaseM4Days: 20,
  phaseM5Days: 30,
  phaseM6Days: 30,
  phaseM7Days: 10,
  signatureDepositDays: 1,
  invoiceUploadDays: 2,
  paymentValidationDays: 1,
  documentEvaluationDays: 2,
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Depose',
  signed: 'Signe',
  pending_review: 'En attente',
  in_progress: 'En cours',
  rejected: 'Rejete',
  completed: 'Termine',
  cancelled: 'Annule',
};

const TERMINAL_REQUEST_STATUSES = ['rejected', 'completed', 'cancelled'];
const TECHNICAL_AUDIT_ACTIONS = ['LOGIN', 'AUTH_REFRESH', 'LOGOUT'];
const DASHBOARD_MONITORING_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];

type DashboardSlaStatus = DashboardActionItem['slaStatus'];

interface DashboardSlaConfig {
  phaseTargets: Record<string, number>;
  signatureDepositDays: number;
  signatureReturnDays: number;
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
    return { value: 'Nouvelle activite', direction: 'up', tone: 'success' };
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

function slaLabel(status: DashboardSlaStatus, targetDays: number, overdueDays?: number | null): string {
  if (status === 'unknown') return 'Delai non mesure';
  if (status === 'overdue') return `Delai depasse${overdueDays ? ` de ${overdueDays} j` : ''}`;
  if (status === 'warning') return `Echeance proche (${targetDays} j cible)`;
  if (status === 'blocked') return 'Blocage operationnel';
  return `Dans les temps (${targetDays} j cible)`;
}

function enrichActionDelay<T extends DashboardActionItem>(
  action: T,
  targetDays: number,
  blockingStatus: DashboardSlaStatus = 'overdue'
): T {
  const waitingDays = action.waitingDays ?? null;
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
    slaLabel: slaLabel(status, targetDays, overdueDays),
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
    accessLabel: hasOperationalRole ? 'Action a traiter' : 'Suivi lecture seule',
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

function hrefForRoles(userRoles: string[], allowedRoles: string[], href: string): string | undefined {
  return hasAnyRole(userRoles, allowedRoles) ? href : undefined;
}

function waitingLabel(date: Date | string | null): string {
  const waitingDays = daysBetween(date, new Date());
  if (waitingDays === null) return 'Delai non mesure';
  if (waitingDays < 1) return "Aujourd'hui";
  return `${waitingDays} j d'attente`;
}

function activityTone(action: string): DashboardActivityItem['tone'] {
  if (action.includes('REJECT') || action.includes('CANCEL')) return 'danger';
  if (action.includes('VALIDATED') || action.includes('CLOSED') || action.includes('COLLECTED')) {
    return 'success';
  }
  if (action.includes('SIGN') || action.includes('PAYMENT')) return 'warning';
  return 'info';
}

function businessActivityLabel(action: string): string | null {
  if (TECHNICAL_AUDIT_ACTIONS.some((technicalAction) => action.includes(technicalAction))) {
    return null;
  }
  if (action.includes('PHASE') && action.includes('CLOSED')) return 'Phase cloturee';
  if (action.includes('CERTIFICATE') && action.includes('STATUS')) {
    return 'Statut certificat mis a jour';
  }
  if (action.includes('CERTIFICATE') && action.includes('COLLECTED')) {
    return 'Certificat retire';
  }
  if (action.includes('PAYMENT') && action.includes('VALIDATED')) {
    return 'Paiement valide';
  }
  if (action.includes('PAYMENT') && action.includes('REJECT')) {
    return 'Paiement rejete';
  }
  if (action.includes('DOCUMENT') && action.includes('VALIDATED')) {
    return 'Document accepte';
  }
  if (action.includes('DOCUMENT') && action.includes('REJECT')) {
    return 'Document a reprendre';
  }
  if (action.includes('SIGN') || action.includes('CIRCUIT')) {
    return 'Circuit signature mis a jour';
  }
  if (action.includes('MEETING')) return 'Reunion mise a jour';
  if (action.includes('REQUEST')) return 'Demande mise a jour';
  return action.replaceAll('_', ' ').toLowerCase();
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
    db.select().from(dgCircuitDocuments),
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
        module: auditLogs.module,
        createdAt: auditLogs.createdAt,
        actor: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
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

  function requestContext(requestId: number | undefined): Pick<
    DashboardActionItem,
    'dossierReference' | 'organisationName' | 'applicantName'
  > {
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
    (request) => !TERMINAL_REQUEST_STATUSES.includes(resolvedRequestStatusById.get(request.id) ?? request.status)
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
      helper: 'Non clotures / non rejetes',
      definition: 'Demandes dont le statut n est pas termine, rejete ou annule.',
      periodLabel: 'Etat actuel',
      sampleSize: requestRows.length,
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
    {
      key: 'open_phases',
      label: 'Phases ouvertes',
      value: openPhases,
      helper: 'Phases M3-M7 en cours',
      definition: 'Nombre de phases de traitement actuellement ouvertes, tous dossiers confondus.',
      periodLabel: 'Etat actuel',
      sampleSize: phaseRows.length,
      href: hrefForRoles(userRoles, ['dn_agent', 'dn_supervisor', 'SU'], '/demandes'),
    },
    {
      key: 'average_global_duration',
      label: 'Duree moyenne globale',
      value: averageGlobalDuration === null ? '-' : `${averageGlobalDuration} j`,
      helper: 'Entree -> retrait physique',
      definition:
        'Duree calendaire moyenne entre la creation de la demande et le retrait du certificat, calculee sur les certificats deja retires.',
      periodLabel: 'Historique retire',
      sampleSize: completedGlobalDurations.filter((value) => value !== null).length,
    },
    {
      key: 'pending_dg_mail',
      label: 'En attente signature',
      value: pendingDgCircuit,
      helper: 'Courriers en circuit',
      definition: 'Courriers deposes, en signature ou signes mais pas encore transmis au traitement.',
      periodLabel: 'Etat actuel',
      sampleSize: circuitRows.length,
      href: hrefForRoles(userRoles, ['reception', 'assistant_dg', 'SU'], '/courriers'),
    },
    {
      key: 'pending_payments',
      label: 'Paiements bloquants',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
      definition: 'Paiements qui bloquent une phase: facture attendue, preuve attendue ou validation S5 attendue.',
      periodLabel: 'Etat actuel',
      sampleSize: paymentRows.length,
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
      slaLabel:
        openCount === 0
          ? `Cible de suivi: ${slaTargetDays} j`
          : slaLabel(status, slaTargetDays, slaBreachCount > 0 ? slaBreachCount : null),
      emptyLabel: openCount === 0 ? 'Aucun dossier actif' : undefined,
      durationLabel:
        closedDurations.filter((duration): duration is number => duration !== null).length === 0
          ? 'Pas encore de duree cloturee'
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
      return enrichActionDelay({
        id: `payment-${payment.id}`,
        owner: 'S5',
        responsibleService: 'Facturation S5',
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
            : 'La phase attend la decision S5 sur la preuve de paiement.',
        priority: priorityFromAge(submittedAt),
        href: phase
          ? `/demandes/${phase.requestId}/${phase.phaseCode === 'M7' ? 'delivrance' : phase.phaseCode === 'M6' ? 'demonstration-inspection' : 'evaluation-approfondie'}`
          : undefined,
      }, targetDays, 'blocked');
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
            circuit.entityType === 'formal_request_letter'
              ? 'Reception / Assistant DG'
              : 'Reception',
          responsibleService: 'Circuit signature',
          ...actionAccess(userRoles, ['reception', 'assistant_dg']),
          ...requestContext(circuit.requestId),
          title:
            circuit.status === 'submitted'
              ? 'Ouvrir / imprimer le courrier'
              : 'Scanner le retour signe',
          submittedAt: circuit.depositedAt.toISOString(),
          dueAt: circuit.signatureSentAt?.toISOString() ?? null,
          waitingDays: daysBetween(waitingFrom, new Date()),
          waitingLabel: waitingLabel(waitingFrom),
          blockingReason:
            circuit.status === 'submitted'
              ? 'Le courrier doit etre imprime puis mis en circuit signature.'
              : 'Le retour signe doit etre scanne pour transmettre le dossier au traitement.',
          priority: priorityFromAge(circuit.depositedAt),
          href: '/courriers',
        },
        circuit.status === 'submitted'
          ? slaConfig.signatureDepositDays
          : slaConfig.signatureReturnDays,
        'blocked'
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
      return enrichActionDelay({
        id: `evaluation-${evaluation.id}`,
        owner: 'DN',
        responsibleService: 'Direction de la Navigabilite',
        ...actionAccess(userRoles, ['dn_agent', 'dn_supervisor']),
        ...context,
        title: 'Evaluer un document formel',
        submittedAt: formalDocument?.submittedAt?.toISOString() ?? null,
        dueAt: evaluation.correctionDeadline?.toISOString() ?? null,
        waitingDays: daysBetween(formalDocument?.submittedAt ?? null, new Date()),
        waitingLabel: waitingLabel(formalDocument?.submittedAt ?? null),
        blockingReason: 'Le dossier attend un verdict DN sur une piece documentaire.',
        priority: priorityFromAge(formalDocument?.submittedAt ?? null),
        href: phase ? `/demandes/${phase.requestId}/evaluation-approfondie` : undefined,
      }, slaConfig.documentEvaluationDays);
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
              ? 'Reunion formelle'
              : 'Reunion preliminaire',
        scheduledAt: meeting.scheduledAt.toISOString(),
        requestReference: request?.reference ?? `Demande #${phase?.requestId ?? '-'}`,
        tag: meeting.scheduledAt.toDateString() === today ? 'today' : 'planned',
      };
    });

  const activity: DashboardActivityItem[] = recentAuditRows
    .map((row) => {
      const title = businessActivityLabel(row.action);
      if (!title) return null;
      return {
        id: row.id,
        title,
        requestReference: row.entityId ? `#${row.entityId}` : null,
        actor: row.actor ?? 'Systeme',
        createdAt: row.createdAt.toISOString(),
        tone: activityTone(row.action),
      };
    })
    .filter((item): item is DashboardActivityItem => item !== null)
    .slice(0, 3);

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
      title: 'Echeances depassees',
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
      label: 'Dossiers clotures sur la periode',
      value: `${closedThisPeriod} / ${Math.max(currentRequestVolume, closedThisPeriod)}`,
      percentage: percent(closedThisPeriod, Math.max(currentRequestVolume, closedThisPeriod)),
      tone: 'success',
      helper: 'Phases de delivrance cloturees sur le volume entrant de la periode.',
      denominator: Math.max(currentRequestVolume, closedThisPeriod),
    },
    {
      label: 'Demandes recues sur la periode',
      value: String(currentRequestVolume),
      target: 'Volume entrant',
      percentage: percent(
        currentRequestVolume,
        Math.max(previousRequestVolume, currentRequestVolume, 1)
      ),
      tone: 'info',
      helper: 'Demandes creees dans la periode selectionnee.',
      denominator: Math.max(previousRequestVolume, currentRequestVolume, 1),
    },
    {
      label: 'Taux de conformite documentaire',
      value: `${complianceRate}%`,
      percentage: complianceRate,
      tone: complianceRate >= 80 ? 'success' : 'warning',
      helper: `${validatedEvaluations} document${validatedEvaluations > 1 ? 's' : ''} accepte${validatedEvaluations > 1 ? 's' : ''} sur ${totalEvaluations}.`,
      denominator: totalEvaluations,
    },
    {
      label: 'Agrements / reconnaissances delivres',
      value: String(deliveredCertificates),
      percentage: percent(
        deliveredCertificates,
        Math.max(currentRequestVolume, deliveredCertificates)
      ),
      tone: 'success',
      helper: 'Certificats retires physiquement pendant la periode.',
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
