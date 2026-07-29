import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  auditLogs,
  certificates,
  dgCircuitDocuments,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
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

const PHASE_LABELS: Record<string, string> = {
  M3: 'Preliminaire',
  M4: 'Demande formelle',
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
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
  if (previous === 0 && current === 0) {
    return { value: '0%', direction: 'flat', tone: 'muted' };
  }
  if (previous === 0) {
    return { value: '+100%', direction: 'up', tone: 'success' };
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

function activityTone(action: string): DashboardActivityItem['tone'] {
  if (action.includes('REJECT') || action.includes('CANCEL')) return 'danger';
  if (action.includes('VALIDATED') || action.includes('CLOSED') || action.includes('COLLECTED')) {
    return 'success';
  }
  if (action.includes('SIGN') || action.includes('PAYMENT')) return 'warning';
  return 'info';
}

async function countRequestsBetween(start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requests)
    .where(and(gte(requests.createdAt, start), lt(requests.createdAt, end)));
  return row?.count ?? 0;
}

export async function getDashboardSummary(
  period: DashboardPeriod = 'this_month'
): Promise<DashboardSummary> {
  const { start, end } = periodBounds(period);
  const previous = previousBounds(start, end);

  const [
    requestRows,
    phaseRows,
    circuitRows,
    meetingRows,
    paymentRows,
    certificateRows,
    formalDocumentRows,
    evaluationRows,
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
      .limit(3),
    countRequestsBetween(start, end),
    countRequestsBetween(previous.start, previous.end),
  ]);

  const requestById = new Map(requestRows.map((request) => [request.id, request]));
  const phaseById = new Map(phaseRows.map((phase) => [phase.id, phase]));
  const activeRequests = requestRows.filter(
    (request) => !TERMINAL_REQUEST_STATUSES.includes(request.status)
  ).length;
  const openDossiers = new Set(
    phaseRows.filter((phase) => phase.status === 'open').map((phase) => phase.requestId)
  ).size;
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
      label: 'Demandes actives',
      value: activeRequests,
      trend: trend(currentRequestVolume, previousRequestVolume),
      helper: 'Dossiers non termines',
    },
    {
      key: 'opened_dossiers',
      label: 'Dossiers ouverts',
      value: openDossiers,
      helper: 'Au moins une phase ouverte',
    },
    {
      key: 'average_global_duration',
      label: 'Duree moyenne globale',
      value: averageGlobalDuration === null ? '-' : `${averageGlobalDuration} j`,
      helper: 'Demande entree -> retrait',
    },
    {
      key: 'pending_dg_mail',
      label: 'Courriers en attente DG',
      value: pendingDgCircuit,
      helper: 'Signature ou retour attendu',
    },
    {
      key: 'pending_payments',
      label: 'Paiements en attente',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
    },
  ];

  const totalOpenPhases = phaseRows.filter((phase) => phase.status === 'open').length;
  const workflow: DashboardPhaseStat[] = ['M3', 'M4', 'M5', 'M6', 'M7'].map((phaseCode) => {
    const rows = phaseRows.filter((phase) => phase.phaseCode === phaseCode);
    const openCount = rows.filter((phase) => phase.status === 'open').length;
    const closedDurations = rows
      .filter((phase) => phase.closedAt)
      .map((phase) => daysBetween(phase.openedAt, phase.closedAt));
    return {
      phaseCode,
      label: PHASE_LABELS[phaseCode],
      count: openCount,
      percentage: percent(openCount, totalOpenPhases),
      averageDurationDays: average(closedDurations),
    };
  });

  const totalRequests = requestRows.length;
  const statusDistribution: DashboardStatusStat[] = Object.entries(STATUS_LABELS)
    .map(([status, label]) => {
      const count = requestRows.filter((request) => request.status === status).length;
      return { status, label, count, percentage: percent(count, totalRequests) };
    })
    .filter((item) => item.count > 0);

  const paymentActions: DashboardActionItem[] = paymentRows
    .filter((payment) => ['awaiting_invoice', 'pending_validation'].includes(payment.status))
    .slice(0, 4)
    .map((payment) => {
      const phase = phaseById.get(payment.phaseId);
      const request = phase ? requestById.get(phase.requestId) : null;
      return {
        id: `payment-${payment.id}`,
        owner: 'S5',
        dossierReference: request?.reference ?? `Demande #${phase?.requestId ?? '-'}`,
        title:
          payment.status === 'awaiting_invoice'
            ? 'Envoyer la facture au postulant'
            : 'Valider la preuve de paiement',
        submittedAt:
          (payment.proofUploadedAt ?? payment.invoiceUploadedAt ?? null)?.toISOString() ?? null,
        priority: priorityFromAge(payment.proofUploadedAt ?? payment.invoiceUploadedAt),
        href: phase
          ? `/demandes/${phase.requestId}/${phase.phaseCode === 'M7' ? 'delivrance' : phase.phaseCode === 'M6' ? 'demonstration-inspection' : 'evaluation-approfondie'}`
          : undefined,
      };
    });

  const signatureActions: DashboardActionItem[] = circuitRows
    .filter((circuit) => ['submitted', 'in_signature_circuit', 'signed'].includes(circuit.status))
    .slice(0, 4)
    .map((circuit) => ({
      id: `circuit-${circuit.id}`,
      owner:
        circuit.entityType === 'formal_request_letter' ? 'Reception / Assistant DG' : 'Reception',
      dossierReference:
        requestById.get(circuit.requestId)?.reference ?? `Demande #${circuit.requestId}`,
      title:
        circuit.status === 'submitted'
          ? 'Ouvrir / imprimer le courrier'
          : 'Scanner le retour signe',
      submittedAt: circuit.depositedAt.toISOString(),
      priority: priorityFromAge(circuit.depositedAt),
      href: '/courriers',
    }));

  const documentActions: DashboardActionItem[] = evaluationRows
    .filter((evaluation) => evaluation.verdict === null)
    .slice(0, 4)
    .map((evaluation) => {
      const formalDocument = formalDocumentRows.find(
        (document) => document.id === evaluation.formalRequestDocumentId
      );
      const phase = formalDocument ? phaseById.get(formalDocument.phaseId) : null;
      const request = phase ? requestById.get(phase.requestId) : null;
      return {
        id: `evaluation-${evaluation.id}`,
        owner: 'DN',
        dossierReference: request?.reference ?? `Demande #${phase?.requestId ?? '-'}`,
        title: 'Evaluer un document formel',
        submittedAt: formalDocument?.submittedAt?.toISOString() ?? null,
        priority: priorityFromAge(formalDocument?.submittedAt ?? null),
        href: phase ? `/demandes/${phase.requestId}/evaluation-approfondie` : undefined,
      };
    });

  const actions = [...signatureActions, ...paymentActions, ...documentActions]
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

  const activity: DashboardActivityItem[] = recentAuditRows.map((row) => ({
    id: row.id,
    title: row.action.replaceAll('_', ' ').toLowerCase(),
    requestReference: row.entityId ? `#${row.entityId}` : null,
    actor: row.actor ?? 'Systeme',
    createdAt: row.createdAt.toISOString(),
    tone: activityTone(row.action),
  }));

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
      href: '/demandes',
    },
    {
      key: 'pending_dg',
      title: 'Retour signature en attente',
      value: pendingDgCircuit,
      helper: 'Courriers en circuit signature',
      tone: pendingDgCircuit > 0 ? 'warning' : 'info',
      href: '/courriers',
    },
    {
      key: 'pending_payments',
      title: 'Paiements en attente',
      value: pendingPayments,
      helper: 'Facture, preuve ou validation',
      tone: pendingPayments > 0 ? 'danger' : 'info',
      href: '/paiements-s5',
    },
    {
      key: 'overdue_corrections',
      title: 'Echeances depassees',
      value: overdueCorrections,
      helper: 'Corrections documentaires en retard',
      tone: overdueCorrections > 0 ? 'warning' : 'info',
      href: '/demandes',
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
    },
    {
      label: 'Taux de conformite documentaire',
      value: `${complianceRate}%`,
      percentage: complianceRate,
      tone: complianceRate >= 80 ? 'success' : 'warning',
    },
    {
      label: 'Agrements / reconnaissances delivres',
      value: String(deliveredCertificates),
      percentage: percent(
        deliveredCertificates,
        Math.max(currentRequestVolume, deliveredCertificates)
      ),
      tone: 'success',
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
