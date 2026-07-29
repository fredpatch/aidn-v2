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
  siteInspections,
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
  ReceptionDashboardActivityItem,
  ReceptionDashboardAlert,
  ReceptionDashboardCourrierItem,
  ReceptionDashboardProgressMetric,
  ReceptionDashboardSummary,
  R3DashboardActivityItem,
  R3DashboardAlert,
  R3DashboardMissionItem,
  R3DashboardProgressMetric,
  R3DashboardSummary,
  S5DashboardActivityItem,
  S5DashboardAlert,
  S5DashboardPaymentItem,
  S5DashboardProgressMetric,
  S5DashboardSummary,
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

const S5_PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'Facture a transmettre',
  awaiting_proof: 'Preuve attendue',
  pending_validation: 'Preuve a valider',
  validated: 'Paiement valide',
  rejected: 'Paiement rejete',
};

const S5_PAYMENT_ACTION_LABELS: Record<string, string> = {
  awaiting_invoice: 'Transmettre la facture',
  awaiting_proof: 'Attendre la preuve',
  pending_validation: 'Verifier la preuve',
  validated: 'Paiement termine',
  rejected: 'Suivre le rejet',
};

const RECEPTION_CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'A imprimer',
  in_signature_circuit: 'En signature',
  signed: 'Signe - a transmettre',
  pending_review: 'Transmis DN',
};

const RECEPTION_CIRCUIT_ACTION_LABELS: Record<string, string> = {
  submitted: 'Imprimer et mettre en signature',
  in_signature_circuit: 'Scanner le retour signe',
  signed: 'Transmettre a la DN',
  pending_review: 'Circuit termine',
};

const RECEPTION_CIRCUIT_SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
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

function slaLabel(
  status: DashboardSlaStatus,
  targetDays: number,
  overdueDays?: number | null
): string {
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

function hrefForRoles(
  userRoles: string[],
  allowedRoles: string[],
  href: string
): string | undefined {
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

function s5ActivityLabel(action: string): string | null {
  if (action === 'INVOICE_UPLOADED') return 'Facture transmise';
  if (action === 'PAYMENT_PROOF_UPLOADED') return 'Preuve recue';
  if (action === 'PAYMENT_VALIDATED') return 'Preuve validee';
  if (action === 'PAYMENT_REJECTED') return 'Preuve rejetee';
  return null;
}

function receptionActivityLabel(action: string): string | null {
  if (action === 'REQUEST_SUBMITTED') return 'Demande deposee';
  if (action === 'DG_CIRCUIT_SENT_TO_SIGNATURE') return 'Demande mise en signature';
  if (action === 'DG_CIRCUIT_SIGNED_RETURNED') return 'Retour signe scanne';
  if (action === 'COURRIER_SENT_TO_SIGNATURE') return 'Courrier mis en signature';
  if (action === 'COURRIER_SIGNED_RETURNED') return 'Retour courrier scanne';
  if (action === 'FORMAL_LETTER_SUBMITTED') return 'Lettre officielle deposee';
  return null;
}

function r3ActivityLabel(action: string): string | null {
  if (action === 'MEETING_SCHEDULED') return 'Visite planifiee';
  if (action === 'SITE_VISIT_HELD') return 'Visite tenue';
  if (action === 'INSPECTION_VERDICT_SUBMITTED') return 'Avis R3 soumis';
  if (action === 'PHASE_CLOSED') return 'Phase demonstration cloturee';
  return null;
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

function phasePath(phaseCode: string, requestId: number): string {
  if (phaseCode === 'M5') return `/demandes/${requestId}/evaluation-approfondie`;
  if (phaseCode === 'M6') return `/demandes/${requestId}/demonstration-inspection`;
  return `/demandes/${requestId}/delivrance`;
}

function s5WaitingFrom(payment: typeof payments.$inferSelect): Date | null {
  if (payment.status === 'awaiting_invoice') return payment.invoiceUploadedAt ?? null;
  if (payment.status === 'awaiting_proof') return payment.invoiceUploadedAt ?? null;
  if (payment.status === 'pending_validation') return payment.proofUploadedAt ?? null;
  if (payment.status === 'validated') return payment.validatedAt ?? null;
  return payment.proofUploadedAt ?? payment.invoiceUploadedAt ?? null;
}

function s5WaitingDays(payment: typeof payments.$inferSelect): number | null {
  const from = s5WaitingFrom(payment);
  return daysBetween(from, new Date());
}

function s5Priority(
  payment: typeof payments.$inferSelect,
  targetDays: number
): 'haute' | 'moyenne' | 'basse' {
  const waitingDays = s5WaitingDays(payment);
  if (payment.status === 'pending_validation') return 'haute';
  if (waitingDays !== null && waitingDays > targetDays) return 'haute';
  if (waitingDays !== null && waitingDays >= Math.max(targetDays - 1, 1)) return 'moyenne';
  return 'basse';
}

function receptionWaitingFrom(circuit: typeof dgCircuitDocuments.$inferSelect): Date | null {
  return circuit.signatureSentAt ?? circuit.depositedAt ?? null;
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
      definition:
        'Courriers deposes, en signature ou signes mais pas encore transmis au traitement.',
      periodLabel: 'Etat actuel',
      sampleSize: circuitRows.length,
      href: hrefForRoles(userRoles, ['reception', 'assistant_dg', 'SU'], '/courriers'),
    },
    {
      key: 'pending_payments',
      label: 'Paiements bloquants',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
      definition:
        'Paiements qui bloquent une phase: facture attendue, preuve attendue ou validation S5 attendue.',
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
      return enrichActionDelay(
        {
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
      return enrichActionDelay(
        {
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

export async function getS5DashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<S5DashboardSummary> {
  const { start, end } = periodBounds(period);
  const slaConfig = await loadDashboardSlaConfig();

  const [paymentRows, recentAuditRows] = await Promise.all([
    db
      .select({
        phaseId: phases.id,
        phaseCode: phases.phaseCode,
        requestId: requests.id,
        requestReference: requests.reference,
        requestType: requests.requestType,
        organisationName: organisations.name,
        payment: payments,
      })
      .from(phases)
      .innerJoin(requests, eq(phases.requestId, requests.id))
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(payments, eq(payments.phaseId, phases.id))
      .where(sql`${phases.phaseCode} in ('M5', 'M6', 'M7')`)
      .orderBy(desc(phases.openedAt)),
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
      .where(
        sql`${auditLogs.action} in ('INVOICE_UPLOADED', 'PAYMENT_PROOF_UPLOADED', 'PAYMENT_VALIDATED', 'PAYMENT_REJECTED')`
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(4),
  ]);

  function toPaymentItem(row: (typeof paymentRows)[number]): S5DashboardPaymentItem {
    const payment = row.payment;
    const target =
      payment.status === 'pending_validation'
        ? slaConfig.paymentValidationDays
        : slaConfig.invoiceUploadDays;
    const waitingDays = s5WaitingDays(payment);
    return {
      id: `${row.phaseCode}:${row.phaseId}`,
      phaseId: row.phaseId,
      phaseCode: row.phaseCode as 'M5' | 'M6' | 'M7',
      phaseLabel: PHASE_LABELS[row.phaseCode] ?? row.phaseCode,
      requestId: row.requestId,
      requestReference: row.requestReference,
      requestType: row.requestType,
      organisationName: row.organisationName,
      paymentId: payment.id,
      status: payment.status,
      statusLabel: S5_PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
      nextAction: S5_PAYMENT_ACTION_LABELS[payment.status] ?? 'Suivre',
      invoiceUploadedAt: payment.invoiceUploadedAt?.toISOString() ?? null,
      proofUploadedAt: payment.proofUploadedAt?.toISOString() ?? null,
      validatedAt: payment.validatedAt?.toISOString() ?? null,
      waitingDays,
      waitingLabel: waitingLabel(s5WaitingFrom(payment)),
      priority: s5Priority(payment, target),
      href: '/paiements-s5',
    };
  }

  const items = paymentRows.map(toPaymentItem);
  const awaitingInvoice = paymentRows.filter((row) => row.payment.status === 'awaiting_invoice');
  const awaitingProof = paymentRows.filter((row) => row.payment.status === 'awaiting_proof');
  const pendingValidation = paymentRows.filter(
    (row) => row.payment.status === 'pending_validation'
  );
  const validatedThisPeriod = paymentRows.filter(
    (row) =>
      row.payment.status === 'validated' &&
      row.payment.validatedAt &&
      row.payment.validatedAt >= start &&
      row.payment.validatedAt < end
  );
  const rejectedThisPeriod = paymentRows.filter(
    (row) =>
      row.payment.status === 'rejected' &&
      row.payment.proofUploadedAt &&
      row.payment.proofUploadedAt >= start &&
      row.payment.proofUploadedAt < end
  );
  const invoicesTransmittedThisPeriod = paymentRows.filter(
    (row) =>
      row.payment.invoiceUploadedAt &&
      row.payment.invoiceUploadedAt >= start &&
      row.payment.invoiceUploadedAt < end
  );
  const proofsReceivedThisPeriod = paymentRows.filter(
    (row) =>
      row.payment.proofUploadedAt &&
      row.payment.proofUploadedAt >= start &&
      row.payment.proofUploadedAt < end
  );

  const priorityActions = items
    .filter((item) => ['awaiting_invoice', 'pending_validation', 'rejected'].includes(item.status))
    .sort((a, b) => {
      const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (b.waitingDays ?? 0) - (a.waitingDays ?? 0);
    })
    .slice(0, 5);

  const recentInvoices = items.filter((item) => item.status === 'awaiting_invoice').slice(0, 5);

  const proofsToApprove = items.filter((item) => item.status === 'pending_validation').slice(0, 5);

  const overdueInvoices = awaitingInvoice.filter(
    (row) => (s5WaitingDays(row.payment) ?? 0) > slaConfig.invoiceUploadDays
  ).length;
  const overdueProofs = awaitingProof.filter(
    (row) => (s5WaitingDays(row.payment) ?? 0) > slaConfig.paymentValidationDays + 4
  ).length;
  const overdueValidation = pendingValidation.filter(
    (row) => (s5WaitingDays(row.payment) ?? 0) > slaConfig.paymentValidationDays
  ).length;

  const alerts: S5DashboardAlert[] = [
    {
      key: 'overdue_invoices',
      title: 'Factures non transmises',
      value: overdueInvoices,
      helper: `Cible: ${slaConfig.invoiceUploadDays} j apres reception par S5`,
      tone: overdueInvoices > 0 ? 'warning' : 'info',
      href: '/paiements-s5',
    },
    {
      key: 'overdue_proofs',
      title: 'Preuves attendues > 5 jours',
      value: overdueProofs,
      helper: 'Factures envoyees, preuve postulant non recue',
      tone: overdueProofs > 0 ? 'warning' : 'info',
      href: '/paiements-s5',
    },
    {
      key: 'overdue_validation',
      title: 'Preuves a valider en retard',
      value: overdueValidation,
      helper: `Cible validation S5: ${slaConfig.paymentValidationDays} j`,
      tone: overdueValidation > 0 ? 'danger' : 'info',
      href: '/paiements-s5',
    },
    {
      key: 'rejected_payments',
      title: 'Paiements rejetes / a corriger',
      value: paymentRows.filter((row) => row.payment.status === 'rejected').length,
      helper: 'Historique des rejets et dossiers a suivre',
      tone: paymentRows.some((row) => row.payment.status === 'rejected') ? 'danger' : 'info',
      href: '/paiements-s5',
    },
  ];

  const paymentById = new Map(paymentRows.map((row) => [row.payment.id, row]));
  const activity: S5DashboardActivityItem[] = recentAuditRows
    .map((row): S5DashboardActivityItem | null => {
      const title = s5ActivityLabel(row.action);
      if (!title) return null;
      const paymentContext = row.entityId ? paymentById.get(row.entityId) : undefined;
      return {
        id: row.id,
        title,
        requestReference: paymentContext?.requestReference ?? null,
        organisationName: paymentContext?.organisationName,
        actor: row.actor ?? 'Systeme',
        createdAt: row.createdAt.toISOString(),
        tone: activityTone(row.action),
      };
    })
    .filter((item): item is S5DashboardActivityItem => item !== null);

  const decisionsThisPeriod = validatedThisPeriod.length + rejectedThisPeriod.length;
  const approvalRate = percent(validatedThisPeriod.length, decisionsThisPeriod);

  const monthlyProgress: S5DashboardProgressMetric[] = [
    {
      label: 'Factures transmises sur la periode',
      value: String(invoicesTransmittedThisPeriod.length),
      helper: 'Volume de factures enregistrees comme transmises au postulant.',
      percentage: percent(invoicesTransmittedThisPeriod.length, Math.max(paymentRows.length, 1)),
      tone: 'info',
    },
    {
      label: 'Preuves validees sur la periode',
      value: String(validatedThisPeriod.length),
      helper: 'Paiements approuves par S5.',
      percentage: percent(validatedThisPeriod.length, Math.max(proofsReceivedThisPeriod.length, 1)),
      tone: 'success',
    },
    {
      label: "Taux d'approbation",
      value: decisionsThisPeriod === 0 ? '-' : `${approvalRate}%`,
      helper: `${validatedThisPeriod.length} validation(s), ${rejectedThisPeriod.length} rejet(s).`,
      percentage: approvalRate,
      tone: approvalRate >= 80 || decisionsThisPeriod === 0 ? 'success' : 'warning',
    },
  ];

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics: [
      {
        key: 'invoices_to_send',
        label: 'Factures a transmettre',
        value: awaitingInvoice.length,
        helper: 'Factures recues par S5 a envoyer au postulant',
        tone: awaitingInvoice.length > 0 ? 'info' : 'success',
      },
      {
        key: 'proofs_to_check',
        label: 'Preuves a verifier',
        value: pendingValidation.length,
        helper: 'Preuves retournees par le postulant',
        tone: pendingValidation.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'validated_payments',
        label: 'Paiements valides',
        value: validatedThisPeriod.length,
        helper: 'Paiements approuves sur la periode',
        tone: 'success',
      },
      {
        key: 'rejected_payments',
        label: 'Paiements rejetes / a corriger',
        value: paymentRows.filter((row) => row.payment.status === 'rejected').length,
        helper: 'Paiements rejetes conserves en historique',
        tone: paymentRows.some((row) => row.payment.status === 'rejected') ? 'danger' : 'success',
      },
    ],
    flow: [
      {
        key: 'invoice_received',
        label: 'Facture recue',
        description: 'A transmettre par S5',
        count: awaitingInvoice.length,
        tone: 'info',
      },
      {
        key: 'invoice_sent',
        label: 'Facture transmise',
        description: 'Preuve postulant attendue',
        count: awaitingProof.length,
        tone: 'info',
      },
      {
        key: 'proof_received',
        label: 'Preuve recue',
        description: 'Validation S5 requise',
        count: pendingValidation.length,
        tone: 'warning',
      },
      {
        key: 'validated',
        label: 'Validation S5',
        description: 'Paiements approuves',
        count: paymentRows.filter((row) => row.payment.status === 'validated').length,
        tone: 'success',
      },
    ],
    priorityActions,
    recentInvoices,
    proofsToApprove,
    alerts,
    activity,
    monthlyProgress,
    updatedAt: new Date().toISOString(),
  };
}

export async function getReceptionDashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<ReceptionDashboardSummary> {
  const { start, end } = periodBounds(period);
  const slaConfig = await loadDashboardSlaConfig();

  const [circuitRows, recentAuditRows] = await Promise.all([
    db
      .select({
        circuit: dgCircuitDocuments,
        requestId: requests.id,
        requestReference: requests.reference,
        requestType: requests.requestType,
        organisationName: organisations.name,
        applicantName: applicants.fullName,
      })
      .from(dgCircuitDocuments)
      .innerJoin(requests, eq(dgCircuitDocuments.requestId, requests.id))
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(applicants, eq(requests.applicantId, applicants.id))
      .orderBy(desc(dgCircuitDocuments.createdAt)),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        actor: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        sql`${auditLogs.action} in ('REQUEST_SUBMITTED', 'DG_CIRCUIT_SENT_TO_SIGNATURE', 'DG_CIRCUIT_SIGNED_RETURNED', 'COURRIER_SENT_TO_SIGNATURE', 'COURRIER_SIGNED_RETURNED', 'FORMAL_LETTER_SUBMITTED')`
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(5),
  ]);

  function toCourrierItem(row: (typeof circuitRows)[number]): ReceptionDashboardCourrierItem {
    const circuit = row.circuit;
    const targetDays =
      circuit.status === 'submitted'
        ? slaConfig.signatureDepositDays
        : slaConfig.signatureReturnDays;
    const waitingFrom = receptionWaitingFrom(circuit);
    const waitingDays = daysBetween(waitingFrom, new Date());
    return {
      id: `${circuit.entityType}:${row.requestId}`,
      circuitId: circuit.id,
      entityType: circuit.entityType,
      sourceLabel: RECEPTION_CIRCUIT_SOURCE_LABELS[circuit.entityType] ?? circuit.entityType,
      requestId: row.requestId,
      requestReference: row.requestReference,
      requestType: row.requestType,
      organisationName: row.organisationName,
      applicantName: row.applicantName,
      status: circuit.status,
      statusLabel: RECEPTION_CIRCUIT_STATUS_LABELS[circuit.status] ?? circuit.status,
      nextAction: RECEPTION_CIRCUIT_ACTION_LABELS[circuit.status] ?? 'Suivre',
      depositedAt: circuit.depositedAt.toISOString(),
      signatureSentAt: circuit.signatureSentAt?.toISOString() ?? null,
      signedAt: circuit.signedAt?.toISOString() ?? null,
      waitingDays,
      waitingLabel: waitingLabel(waitingFrom),
      priority:
        waitingDays !== null && waitingDays > targetDays
          ? 'haute'
          : waitingDays !== null && waitingDays >= Math.max(targetDays - 1, 1)
            ? 'moyenne'
            : priorityFromAge(waitingFrom),
      href: '/courriers',
    };
  }

  const items = circuitRows.map(toCourrierItem);
  const toPrintRows = circuitRows.filter((row) => row.circuit.status === 'submitted');
  const waitingSignatureRows = circuitRows.filter(
    (row) => row.circuit.status === 'in_signature_circuit'
  );
  const transmittedThisPeriod = circuitRows.filter(
    (row) =>
      row.circuit.pendingReviewAt &&
      row.circuit.pendingReviewAt >= start &&
      row.circuit.pendingReviewAt < end
  );
  const sentThisPeriod = circuitRows.filter(
    (row) =>
      row.circuit.signatureSentAt &&
      row.circuit.signatureSentAt >= start &&
      row.circuit.signatureSentAt < end
  );
  const signedThisPeriod = circuitRows.filter(
    (row) =>
      row.circuit.signedAt &&
      row.circuit.signedAt >= start &&
      row.circuit.signedAt < end
  );
  const returnedDurations = circuitRows
    .filter((row) => row.circuit.signatureSentAt && row.circuit.signedAt)
    .map((row) => daysBetween(row.circuit.signatureSentAt, row.circuit.signedAt));
  const averageSignatureReturn = average(returnedDurations);

  const priorityActions = items
    .filter((item) => ['submitted', 'in_signature_circuit', 'signed'].includes(item.status))
    .sort((a, b) => {
      const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (b.waitingDays ?? 0) - (a.waitingDays ?? 0);
    })
    .slice(0, 5);

  const toPrint = items.filter((item) => item.status === 'submitted').slice(0, 5);
  const waitingSignature = items
    .filter((item) => item.status === 'in_signature_circuit')
    .slice(0, 5);

  const overduePrint = toPrintRows.filter(
    (row) => (daysBetween(row.circuit.depositedAt, new Date()) ?? 0) > slaConfig.signatureDepositDays
  ).length;
  const overdueSignatureReturn = waitingSignatureRows.filter(
    (row) =>
      (daysBetween(row.circuit.signatureSentAt ?? row.circuit.depositedAt, new Date()) ?? 0) >
      slaConfig.signatureReturnDays
  ).length;
  const formalLettersWaiting = waitingSignatureRows.filter(
    (row) => row.circuit.entityType === 'formal_request_letter'
  ).length;
  const intakeRequestsWaiting = waitingSignatureRows.filter(
    (row) => row.circuit.entityType === 'intake_request'
  ).length;

  const circuitByRequestId = new Map(circuitRows.map((row) => [row.requestId, row]));
  const activity: ReceptionDashboardActivityItem[] = recentAuditRows
    .map((row): ReceptionDashboardActivityItem | null => {
      const title = receptionActivityLabel(row.action);
      if (!title) return null;
      const context = row.entityId ? circuitByRequestId.get(row.entityId) : undefined;
      return {
        id: row.id,
        title,
        requestReference: context?.requestReference ?? (row.entityId ? `#${row.entityId}` : null),
        organisationName: context?.organisationName,
        actor: row.actor ?? 'Systeme',
        createdAt: row.createdAt.toISOString(),
        tone: activityTone(row.action),
      };
    })
    .filter((item): item is ReceptionDashboardActivityItem => item !== null);

  const returnRate = percent(transmittedThisPeriod.length, Math.max(sentThisPeriod.length, 1));

  const periodProgress: ReceptionDashboardProgressMetric[] = [
    {
      label: 'Courriers mis en signature',
      value: String(sentThisPeriod.length),
      helper: 'Courriers imprimes puis confirmes en circuit signature sur la periode.',
      percentage: percent(sentThisPeriod.length, Math.max(circuitRows.length, 1)),
      tone: 'info',
    },
    {
      label: 'Retours signes transmis DN',
      value: String(transmittedThisPeriod.length),
      helper: 'Retours signes scannes et transmis au traitement DN.',
      percentage: returnRate,
      tone: 'success',
    },
    {
      label: 'Delai moyen retour signature',
      value: averageSignatureReturn === null ? '-' : `${averageSignatureReturn} j`,
      helper: `Cible: ${slaConfig.signatureReturnDays} j apres mise en signature.`,
      percentage:
        averageSignatureReturn === null
          ? 0
          : Math.min(100, Math.round((slaConfig.signatureReturnDays / Math.max(averageSignatureReturn, 1)) * 100)),
      tone:
        averageSignatureReturn === null || averageSignatureReturn <= slaConfig.signatureReturnDays
          ? 'success'
          : 'warning',
    },
  ];

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics: [
      {
        key: 'courriers_to_print',
        label: 'Courriers a imprimer',
        value: toPrintRows.length,
        helper: 'Documents deposes a mettre en circuit signature',
        tone: toPrintRows.length > 0 ? 'info' : 'success',
      },
      {
        key: 'waiting_signature',
        label: 'Retours signes attendus',
        value: waitingSignatureRows.length,
        helper: 'Courriers actuellement en signature',
        tone: waitingSignatureRows.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'returned_this_period',
        label: 'Retours transmis DN',
        value: transmittedThisPeriod.length,
        helper: 'Retours signes scannes sur la periode',
        tone: 'success',
      },
      {
        key: 'average_signature_return',
        label: 'Delai moyen signature',
        value: averageSignatureReturn === null ? '-' : `${averageSignatureReturn} j`,
        helper: 'Mise en signature -> scan retour signe',
        tone:
          averageSignatureReturn === null || averageSignatureReturn <= slaConfig.signatureReturnDays
            ? 'success'
            : 'warning',
      },
    ],
    flow: [
      {
        key: 'deposited',
        label: 'Depose',
        description: 'Document a imprimer',
        count: toPrintRows.length,
        tone: toPrintRows.length > 0 ? 'info' : 'success',
      },
      {
        key: 'in_signature',
        label: 'En signature',
        description: 'Retour signe attendu',
        count: waitingSignatureRows.length,
        tone: waitingSignatureRows.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'signed_return',
        label: 'Retour scanne',
        description: 'Scan recu sur la periode',
        count: signedThisPeriod.length,
        tone: 'success',
      },
      {
        key: 'transmitted_dn',
        label: 'Transmis DN',
        description: 'Traitement DN debloque',
        count: transmittedThisPeriod.length,
        tone: 'success',
      },
    ],
    priorityActions,
    toPrint,
    waitingSignature,
    alerts: [
      {
        key: 'overdue_print',
        title: 'Mise en signature en retard',
        value: overduePrint,
        helper: `Cible impression: ${slaConfig.signatureDepositDays} j apres depot`,
        tone: overduePrint > 0 ? 'warning' : 'info',
        href: '/courriers',
      },
      {
        key: 'overdue_signature_return',
        title: 'Retour signature hors delai',
        value: overdueSignatureReturn,
        helper: `Cible retour: ${slaConfig.signatureReturnDays} j apres mise en signature`,
        tone: overdueSignatureReturn > 0 ? 'danger' : 'info',
        href: '/courriers',
      },
      {
        key: 'formal_letters_waiting',
        title: 'Lettres formelles bloquees',
        value: formalLettersWaiting,
        helper: 'La reunion formelle attend le retour signe',
        tone: formalLettersWaiting > 0 ? 'warning' : 'info',
        href: '/courriers',
      },
      {
        key: 'intake_requests_waiting',
        title: 'Demandes initiales bloquees',
        value: intakeRequestsWaiting,
        helper: 'DN attend le retour signe pour ouvrir M3',
        tone: intakeRequestsWaiting > 0 ? 'warning' : 'info',
        href: '/courriers',
      },
    ],
    activity,
    periodProgress,
    updatedAt: new Date().toISOString(),
  };
}

export async function getR3DashboardSummary(
  period: DashboardPeriod = 'this_month',
  r3AgentId: number,
  includeAll = false
): Promise<R3DashboardSummary> {
  const { start, end } = periodBounds(period);
  const scopeCondition = includeAll ? undefined : eq(meetings.dnAgentId, r3AgentId);
  const [missionRows, recentAuditRows] = await Promise.all([
    db
      .select({
        phaseId: phases.id,
        phaseStatus: phases.status,
        openedAt: phases.openedAt,
        closedAt: phases.closedAt,
        requestId: requests.id,
        requestReference: requests.reference,
        requestType: requests.requestType,
        organisationName: organisations.name,
        siteVisit: meetings,
        payment: payments,
        inspection: siteInspections,
      })
      .from(meetings)
      .innerJoin(phases, eq(meetings.phaseId, phases.id))
      .innerJoin(requests, eq(phases.requestId, requests.id))
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .leftJoin(payments, eq(payments.phaseId, phases.id))
      .leftJoin(siteInspections, eq(siteInspections.phaseId, phases.id))
      .where(
        scopeCondition
          ? and(eq(phases.phaseCode, 'M6'), eq(meetings.meetingType, 'site_visit'), scopeCondition)
          : and(eq(phases.phaseCode, 'M6'), eq(meetings.meetingType, 'site_visit'))
      )
      .orderBy(desc(meetings.scheduledAt)),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        actor: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        includeAll
          ? sql`${auditLogs.action} in ('MEETING_SCHEDULED', 'SITE_VISIT_HELD', 'INSPECTION_VERDICT_SUBMITTED', 'PHASE_CLOSED') and ${auditLogs.module} = 'M6'`
          : and(
              eq(auditLogs.userId, r3AgentId),
              sql`${auditLogs.action} in ('MEETING_SCHEDULED', 'SITE_VISIT_HELD', 'INSPECTION_VERDICT_SUBMITTED', 'PHASE_CLOSED') and ${auditLogs.module} = 'M6'`
            )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(5),
  ]);

  function toMissionItem(row: (typeof missionRows)[number]): R3DashboardMissionItem {
    const paymentValidated = row.payment?.status === 'validated';
    const visitHeld = row.siteVisit.status === 'held';
    const closed = row.phaseStatus === 'closed' || !!row.inspection;
    const waitingDays = daysBetween(
      visitHeld ? row.siteVisit.scheduledAt : row.siteVisit.scheduledAt,
      new Date()
    );
    const statusLabel = closed
      ? 'Cloturee'
      : row.inspection
        ? 'Avis soumis'
        : !paymentValidated
          ? 'Paiement attendu'
          : visitHeld
            ? 'Avis attendu'
            : 'Prevue';
    const nextAction = closed
      ? 'Consulter'
      : !paymentValidated
        ? 'Suivre le paiement'
        : visitHeld
          ? "Soumettre l'avis"
          : 'Enregistrer la tenue';
    const priority: R3DashboardMissionItem['priority'] = closed
      ? 'basse'
      : visitHeld
        ? 'haute'
        : waitingDays !== null && row.siteVisit.scheduledAt <= new Date()
          ? 'haute'
          : waitingDays !== null && waitingDays >= 1
            ? 'moyenne'
            : 'basse';
    return {
      id: `r3:${row.phaseId}`,
      phaseId: row.phaseId,
      requestId: row.requestId,
      requestReference: row.requestReference,
      requestType: requestTypeLabel(row.requestType),
      organisationName: row.organisationName,
      scheduledAt: row.siteVisit.scheduledAt.toISOString(),
      location: row.siteVisit.location,
      visitStatus: row.siteVisit.status,
      paymentStatus: row.payment?.status ?? null,
      inspectionVerdict: row.inspection?.verdict ?? null,
      statusLabel,
      nextAction,
      waitingDays,
      priority,
      href: '/mes-inspections',
    };
  }

  const items = missionRows.map(toMissionItem);
  const upcomingVisits = items
    .filter((item) => item.visitStatus === 'scheduled' && item.scheduledAt >= new Date().toISOString())
    .slice(0, 5);
  const reportsDue = items.filter(
    (item) => item.visitStatus === 'held' && item.inspectionVerdict === null
  );
  const openMissions = items.filter((item) => item.statusLabel !== 'Cloturee');
  const plannedVisits = items.filter((item) => item.visitStatus === 'scheduled');
  const closedThisPeriod = missionRows.filter(
    (row) => row.closedAt && row.closedAt >= start && row.closedAt < end
  );
  const visitsHeldThisPeriod = missionRows.filter(
    (row) =>
      row.siteVisit.status === 'held' &&
      row.siteVisit.scheduledAt >= start &&
      row.siteVisit.scheduledAt < end
  );
  const reportsSubmittedThisPeriod = missionRows.filter(
    (row) =>
      row.inspection &&
      row.inspection.submittedAt >= start &&
      row.inspection.submittedAt < end
  );
  const overdueVisits = items.filter(
    (item) =>
      item.visitStatus === 'scheduled' &&
      new Date(item.scheduledAt) < new Date() &&
      item.inspectionVerdict === null
  ).length;
  const overdueReports = reportsDue.filter((item) => (item.waitingDays ?? 0) >= 1).length;

  const requestByMeetingId = new Map(
    missionRows.map((row) => [row.siteVisit.id, row] as const)
  );
  const requestByPhaseId = new Map(missionRows.map((row) => [row.phaseId, row] as const));
  const requestByInspectionId = new Map(
    missionRows
      .filter((row) => row.inspection)
      .map((row) => [row.inspection!.id, row] as const)
  );

  const activity: R3DashboardActivityItem[] = recentAuditRows
    .map((row): R3DashboardActivityItem | null => {
      const title = r3ActivityLabel(row.action);
      if (!title) return null;
      const context =
        row.action === 'INSPECTION_VERDICT_SUBMITTED'
          ? requestByInspectionId.get(row.entityId ?? 0)
          : row.action === 'PHASE_CLOSED'
            ? requestByPhaseId.get(row.entityId ?? 0)
            : requestByMeetingId.get(row.entityId ?? 0);
      return {
        id: row.id,
        title,
        requestReference: context?.requestReference ?? null,
        organisationName: context?.organisationName,
        actor: row.actor ?? 'Systeme',
        createdAt: row.createdAt.toISOString(),
        tone: activityTone(row.action),
      };
    })
    .filter((item): item is R3DashboardActivityItem => item !== null);

  const priorityActions = items
    .filter((item) => item.statusLabel !== 'Cloturee')
    .sort((a, b) => {
      const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (b.waitingDays ?? 0) - (a.waitingDays ?? 0);
    })
    .slice(0, 5);

  const periodProgress: R3DashboardProgressMetric[] = [
    {
      label: 'Visites tenues sur la periode',
      value: String(visitsHeldThisPeriod.length),
      helper: 'Visites R3 marquees comme tenues dans la periode.',
      percentage: percent(visitsHeldThisPeriod.length, Math.max(missionRows.length, 1)),
      tone: 'info',
    },
    {
      label: 'Avis soumis sur la periode',
      value: String(reportsSubmittedThisPeriod.length),
      helper: 'Avis R3 soumis et phases cloturees automatiquement.',
      percentage: percent(reportsSubmittedThisPeriod.length, Math.max(visitsHeldThisPeriod.length, 1)),
      tone: 'success',
    },
    {
      label: 'Missions cloturees',
      value: String(closedThisPeriod.length),
      helper: 'Missions R3 cloturees sur la periode selectionnee.',
      percentage: percent(closedThisPeriod.length, Math.max(missionRows.length, 1)),
      tone: 'success',
    },
  ];

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics: [
      {
        key: 'planned_visits',
        label: 'Inspections prevues',
        value: plannedVisits.length,
        helper: 'Visites planifiees assignees a R3',
        tone: plannedVisits.length > 0 ? 'info' : 'success',
      },
      {
        key: 'open_missions',
        label: 'Missions en cours',
        value: openMissions.length,
        helper: 'Missions non cloturees',
        tone: openMissions.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'reports_due',
        label: 'Avis a remettre',
        value: reportsDue.length,
        helper: 'Visites tenues sans avis R3',
        tone: reportsDue.length > 0 ? 'danger' : 'success',
      },
      {
        key: 'closed_period',
        label: 'Cloturees periode',
        value: closedThisPeriod.length,
        helper: 'Avis soumis sur la periode',
        tone: 'success',
      },
    ],
    flow: [
      {
        key: 'planned',
        label: 'Planifiee',
        description: 'Visite programmee',
        count: plannedVisits.length,
        tone: 'info',
      },
      {
        key: 'held',
        label: 'Tenue',
        description: 'Avis R3 attendu',
        count: reportsDue.length,
        tone: reportsDue.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'submitted',
        label: 'Avis soumis',
        description: 'Decision R3 enregistree',
        count: items.filter((item) => item.inspectionVerdict !== null).length,
        tone: 'success',
      },
      {
        key: 'closed',
        label: 'Cloturee',
        description: 'Phase M6 terminee',
        count: items.filter((item) => item.statusLabel === 'Cloturee').length,
        tone: 'success',
      },
    ],
    priorityActions,
    upcomingVisits,
    reportsDue: reportsDue.slice(0, 5),
    alerts: [
      {
        key: 'overdue_visits',
        title: 'Visites depassees',
        value: overdueVisits,
        helper: 'Visites planifiees dont la date est passee',
        tone: overdueVisits > 0 ? 'warning' : 'info',
        href: '/mes-inspections',
      },
      {
        key: 'overdue_reports',
        title: 'Avis R3 en retard',
        value: overdueReports,
        helper: 'Visites tenues sans avis depuis au moins 1 jour',
        tone: overdueReports > 0 ? 'danger' : 'info',
        href: '/mes-inspections',
      },
      {
        key: 'payment_blocked',
        title: 'Paiements bloquants',
        value: items.filter((item) => item.paymentStatus !== 'validated' && item.statusLabel !== 'Cloturee')
          .length,
        helper: 'R3 attend la validation S5 avant action finale',
        tone: items.some((item) => item.paymentStatus !== 'validated' && item.statusLabel !== 'Cloturee')
          ? 'warning'
          : 'info',
        href: '/mes-inspections',
      },
    ],
    activity,
    periodProgress,
    updatedAt: new Date().toISOString(),
  };
}
