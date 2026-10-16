/** SESSION1-UX-1 - the rows the applicant-actions policy reads. Exactly eight
 *  queries in one round, whatever the number of dossiers (pinned by the DB test). */
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  certificates,
  dgCircuitDocuments,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
  payments,
  phases,
  preliminaryEvaluationForms,
  requests,
} from '../../shared/db/schema.js';
import { CLOSED_DOSSIER_STATUSES } from '../requests/dossier-open.js';

export interface ApplicantActionRows {
  phases: Array<{ id: number; requestId: number; requestReference: string; requestStatus: string; phaseCode: string; status: string }>;
  meetings: Array<{
    id: number; phaseId: number; meetingType: string; status: string; confirmationStatus: string;
    scheduledAt: Date; crDocumentUrl: string | null; signedCrDocumentUrl: string | null;
  }>;
  forms: Array<{ id: number; phaseId: number; madeAvailableAt: Date | null; submittedFileUrl: string | null; returnDeadline: Date | null }>;
  formalDocuments: Array<{ id: number; phaseId: number; status: string }>;
  /** Every dg_circuit_documents row in scope, all entity types (intake, DN annotation, M3 declaration, M4 letter). */
  circuits: Array<{ id: number; requestId: number; entityType: string; status: string }>;
  payments: Array<{ id: number; phaseId: number; status: string; invoiceFileUrl: string | null; rejectionReason: string | null }>;
  evaluations: Array<{ id: number; requestId: number; formalRequestDocumentId: number; verdict: string | null; correctionDeadline: Date | null }>;
  certificates: Array<{ id: number; requestId: number; status: string }>;
}

export interface ApplicantActionScope {
  applicantId?: number;
  includeClosedDossiers?: boolean;
}

const open = notInArray(requests.status, CLOSED_DOSSIER_STATUSES as Array<(typeof requests.$inferSelect)['status']>);

function scoped({ applicantId, includeClosedDossiers = false }: ApplicantActionScope) {
  const conditions = [
    ...(includeClosedDossiers ? [] : [open]),
    ...(applicantId === undefined ? [] : [eq(requests.applicantId, applicantId)]),
  ];
  return conditions.length ? and(...conditions) : undefined;
}

/** Exactly 8 queries, whatever the number of dossiers. Open dossiers only,
 *  unless includeClosedDossiers (Demandes cockpit, which also lists terminal
 *  dossiers and reuses these rows instead of re-reading the tables).
 *  applicantId undefined = every applicant. buildApplicantActions skips closed
 *  dossiers itself. */
export async function loadApplicantActionRows(scope: ApplicantActionScope): Promise<ApplicantActionRows> {
  const where = scoped(scope);
  const [phaseRows, meetingRows, formRows, formalDocumentRows, circuitRows, paymentRows, evaluationRows, certificateRows] =
    await Promise.all([
      db
        .select({
          id: phases.id,
          requestId: phases.requestId,
          requestReference: requests.reference,
          requestStatus: requests.status,
          phaseCode: phases.phaseCode,
          status: phases.status,
        })
        .from(phases)
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({
          id: meetings.id,
          phaseId: meetings.phaseId,
          meetingType: meetings.meetingType,
          status: meetings.status,
          confirmationStatus: meetings.confirmationStatus,
          scheduledAt: meetings.scheduledAt,
          crDocumentUrl: meetings.crDocumentUrl,
          signedCrDocumentUrl: meetings.signedCrDocumentUrl,
        })
        .from(meetings)
        .innerJoin(phases, eq(phases.id, meetings.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({
          id: preliminaryEvaluationForms.id,
          phaseId: preliminaryEvaluationForms.phaseId,
          madeAvailableAt: preliminaryEvaluationForms.madeAvailableAt,
          submittedFileUrl: preliminaryEvaluationForms.submittedFileUrl,
          returnDeadline: preliminaryEvaluationForms.returnDeadline,
        })
        .from(preliminaryEvaluationForms)
        .innerJoin(phases, eq(phases.id, preliminaryEvaluationForms.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({
          id: formalRequestDocuments.id,
          phaseId: formalRequestDocuments.phaseId,
          status: formalRequestDocuments.status,
        })
        .from(formalRequestDocuments)
        .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({
          id: dgCircuitDocuments.id,
          requestId: dgCircuitDocuments.requestId,
          entityType: dgCircuitDocuments.entityType,
          status: dgCircuitDocuments.status,
        })
        .from(dgCircuitDocuments)
        .innerJoin(requests, eq(requests.id, dgCircuitDocuments.requestId))
        .where(where),
      db
        .select({
          id: payments.id,
          phaseId: payments.phaseId,
          status: payments.status,
          invoiceFileUrl: payments.invoiceFileUrl,
          rejectionReason: payments.rejectionReason,
        })
        .from(payments)
        .innerJoin(phases, eq(phases.id, payments.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({
          id: documentEvaluations.id,
          requestId: requests.id,
          formalRequestDocumentId: documentEvaluations.formalRequestDocumentId,
          verdict: documentEvaluations.verdict,
          correctionDeadline: documentEvaluations.correctionDeadline,
        })
        .from(documentEvaluations)
        .innerJoin(formalRequestDocuments, eq(formalRequestDocuments.id, documentEvaluations.formalRequestDocumentId))
        .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(where),
      db
        .select({ id: certificates.id, requestId: certificates.requestId, status: certificates.status })
        .from(certificates)
        .innerJoin(requests, eq(requests.id, certificates.requestId))
        .where(where),
    ]);
  return {
    phases: phaseRows,
    meetings: meetingRows,
    forms: formRows,
    formalDocuments: formalDocumentRows,
    circuits: circuitRows,
    payments: paymentRows,
    evaluations: evaluationRows,
    certificates: certificateRows,
  };
}
