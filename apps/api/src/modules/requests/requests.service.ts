import { and, eq, desc, isNotNull, sql } from 'drizzle-orm';
import { db, type DbTx } from '../../shared/db/index.js';
import {
  auditLogs,
  requests,
  dgCircuitDocuments,
  documentEvaluations,
  documentVersions,
  formalRequestDocuments,
  applicants,
  organisations,
  phases,
  requestViews,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { generateRequestReference } from './requests.helpers.js';
import type {
  RequestCockpitActivity,
  RequestCockpitItem,
  RequestCockpitPhase,
  RequestCockpitSummary,
  SubmitRequestParams,
  RequestView,
} from './requests.types.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  lockUploadAsset,
  trashCurrentVersions,
  versionValues,
  type AttachTarget,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { assertDossierOpen, dossierFlags } from './dossier-open.js';

export type { SubmitRequestParams, RequestView } from './requests.types.js';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposé',
  signed: 'Signé',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours',
  rejected: 'Rejeté',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposé',
  in_signature_circuit: 'En signature',
  signed: 'Signé',
  pending_review: 'Circuit terminé',
  completed: 'Circuit terminé',
};

const PHASE_LABELS: Record<string, string> = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

const PHASE_CODES = ['M3', 'M4', 'M5', 'M6', 'M7'] as const;
const TERMINAL_REQUEST_STATUSES = ['rejected', 'completed', 'cancelled'];

function phaseHref(phaseCode: string, requestId: number): string {
  if (phaseCode === 'M3') return `/demandes/${requestId}/phase-preliminaire`;
  if (phaseCode === 'M4') return `/demandes/${requestId}/phase-formelle`;
  if (phaseCode === 'M5') return `/demandes/${requestId}/evaluation-approfondie`;
  if (phaseCode === 'M6') return `/demandes/${requestId}/demonstration-inspection`;
  return `/demandes/${requestId}/delivrance`;
}

/** D3a - French titles of the dossier events shown in the reading pane, all
 *  phases (audit actions linked to a request, modules/auth/audit-request.ts). */
export const ACTIVITY_LABELS: Record<
  string,
  { title: string; tone: RequestCockpitActivity['tone'] }
> = {
  REQUEST_SUBMITTED: { title: 'Demande déposée', tone: 'info' },
  REQUEST_CANCELLED: { title: 'Demande annulée', tone: 'danger' },
  REQUEST_COMPLETED: { title: 'Dossier terminé', tone: 'success' },
  DG_CIRCUIT_SENT_TO_SIGNATURE: { title: 'Demande mise en signature', tone: 'warning' },
  DG_CIRCUIT_SIGNED: { title: 'Demande signée', tone: 'success' },
  DG_CIRCUIT_SIGNED_RETURNED: { title: 'Retour signé scanné', tone: 'success' },
  DG_CIRCUIT_PENDING_REVIEW: { title: 'Demande transmise à la DN', tone: 'success' },
  DG_CIRCUIT_DOCUMENT_REPLACED: { title: 'Document du circuit remplacé', tone: 'info' },
  DG_CIRCUIT_ALERT_SENT: { title: 'Alerte : circuit signature en retard', tone: 'warning' },
  PHASE_OPENED: { title: 'Phase ouverte', tone: 'info' },
  PHASE_CLOSED: { title: 'Phase clôturée', tone: 'success' },
  COURRIER_SENT_TO_SIGNATURE: { title: 'Courrier mis en signature', tone: 'warning' },
  COURRIER_SIGNED_RETURNED: { title: 'Retour signé du courrier scanné', tone: 'success' },
  FORMAL_LETTER_SUBMITTED: { title: 'Lettre formelle déposée', tone: 'info' },
  FORMAL_LETTER_SIGNED: { title: 'Lettre formelle signée', tone: 'success' },
  FORMAL_LETTER_TRANSMITTED: { title: 'Lettre formelle transmise', tone: 'success' },
  FORMAL_DOCUMENT_SUBMITTED: { title: 'Document de la demande formelle déposé', tone: 'info' },
  PRELIMINARY_EVALUATION_MADE_AVAILABLE: {
    title: 'Formulaire de pré-évaluation mis à disposition',
    tone: 'info',
  },
  PRELIMINARY_EVALUATION_SUBMITTED: { title: 'Pré-évaluation déposée', tone: 'info' },
  PRELIMINARY_DECLARATION_CIRCUIT_CREATED: {
    title: 'Déclaration de pré-évaluation en circuit',
    tone: 'warning',
  },
  DOCUMENT_VERDICT_SET: { title: 'Document évalué', tone: 'info' },
  DOCUMENT_RESUBMITTED: { title: 'Document redéposé', tone: 'info' },
  INVOICE_UPLOADED: { title: 'Facture envoyée', tone: 'info' },
  PAYMENT_PROOF_UPLOADED: { title: 'Preuve de paiement déposée', tone: 'info' },
  PAYMENT_VALIDATED: { title: 'Paiement validé', tone: 'success' },
  PAYMENT_REJECTED: { title: 'Paiement rejeté', tone: 'danger' },
  MEETING_SCHEDULED: { title: 'Réunion planifiée', tone: 'info' },
  MEETING_RESCHEDULED: { title: 'Réunion reportée', tone: 'warning' },
  MEETING_REPORT_ATTACHED: { title: 'Compte-rendu de réunion joint', tone: 'info' },
  MEETING_HELD: { title: 'Réunion tenue', tone: 'success' },
  MEETING_NO_SHOW: { title: 'Réunion : absence du postulant', tone: 'warning' },
  MEETING_FILE_CANCELLED: { title: 'Réunion : dossier annulé', tone: 'danger' },
  SITE_VISIT_HELD: { title: 'Visite sur site tenue', tone: 'success' },
  INSPECTION_VERDICT_SUBMITTED: { title: 'Avis R3 rendu', tone: 'success' },
  CERTIFICATE_CREATED: { title: 'Certificat créé', tone: 'info' },
  CERTIFICATE_DOCUMENT_GENERATED: { title: 'Certificat généré', tone: 'info' },
  CERTIFICATE_FIELDS_UPDATED: { title: 'Certificat mis à jour', tone: 'info' },
  CERTIFICATE_TYPE_OVERRIDDEN: { title: 'Type de certificat modifié', tone: 'warning' },
  CERTIFICATE_SIGNED_RETURN_REGISTERED: { title: 'Certificat signé enregistré', tone: 'success' },
  CERTIFICATE_STATUS_CHANGED: { title: 'Statut du certificat modifié', tone: 'info' },
};

/** Phase code appended to phase events (« Phase ouverte (M4) »); the audit
 *  module is the phase for those actions. */
function activityLabel(
  action: string,
  module: string
): { title: string; tone: RequestCockpitActivity['tone'] } {
  const known = ACTIVITY_LABELS[action];
  if (known && (action === 'PHASE_OPENED' || action === 'PHASE_CLOSED')) {
    return { ...known, title: `${known.title} (${module})` };
  }
  if (known) return known;
  if (action.startsWith('MEETING_')) return { title: 'Réunion mise à jour', tone: 'info' };
  return { title: action.replaceAll('_', ' ').toLowerCase(), tone: 'info' };
}

/** A raw `timestamp` (no time zone) read through db.execute: decoded as UTC,
 *  the same convention as drizzle's column decoder (never the server's zone). */
function utcTimestamp(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}

function latestDate(a: Date, b: Date | undefined): Date {
  return b && b.getTime() > a.getTime() ? b : a;
}

/** D3a - events kept per dossier for the reading pane. */
const ACTIVITY_PER_REQUEST = 5;

/** Postgres unique_violation. Thrown by the partial unique index on
 *  requests.organisationId (pattern "one active request per organisation")
 *  or the one on dg_circuit_documents(entityType, requestId).
 *  Drizzle wraps the underlying pg error in a DrizzleQueryError, so the
 *  Postgres error code lives on `error.cause.code`, not `error.code`. */
function isUniqueViolation(error: unknown): boolean {
  const pgCode = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return pgCode === '23505' || causeCode === '23505';
}

async function getCurrentCircuitDocument(circuitDocumentId: number): Promise<{
  fileUrl: string;
  mimeType: string;
} | null> {
  const [document] = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.ownerType, 'dg_circuit_document'),
        eq(documentVersions.ownerId, circuitDocumentId),
        eq(documentVersions.isCurrent, true)
      )
    );

  return document ? { fileUrl: document.fileUrl, mimeType: document.mimeType } : null;
}

async function toRequestView(
  row: typeof requests.$inferSelect,
  circuitDoc: typeof dgCircuitDocuments.$inferSelect | null
): Promise<RequestView> {
  const currentDocument = circuitDoc ? await getCurrentCircuitDocument(circuitDoc.id) : null;
  const status = await resolveRequestStatus(row);
  return {
    id: row.id,
    reference: row.reference,
    applicantId: row.applicantId,
    organisationId: row.organisationId,
    requestType: row.requestType,
    message: row.message,
    status,
    rejectionReason: row.rejectionReason,
    circuitStatus: circuitDoc?.status ?? null,
    circuitDocumentUrl: currentDocument?.fileUrl ?? null,
    circuitDocumentMimeType: currentDocument?.mimeType ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Effective status: a closed M7 (Délivrance) completes the dossier even if
 *  requests.status was not updated; terminal statuses are kept as stored.
 *  Pure, so the cockpit applies it to the phases it already loaded (D2: no
 *  query per dossier). */
export function effectiveRequestStatus(storedStatus: string, deliveryPhaseStatus: string | null): string {
  if (TERMINAL_REQUEST_STATUSES.includes(storedStatus)) return storedStatus;
  if (deliveryPhaseStatus === 'closed') return 'completed';
  return storedStatus;
}

async function resolveRequestStatus(row: typeof requests.$inferSelect): Promise<string> {
  if (TERMINAL_REQUEST_STATUSES.includes(row.status)) return row.status;

  const [deliveryPhase] = await db
    .select({ status: phases.status })
    .from(phases)
    .where(and(eq(phases.requestId, row.id), eq(phases.phaseCode, 'M7')));

  return effectiveRequestStatus(row.status, deliveryPhase?.status ?? null);
}

/** The intake demande a circuit document belongs to, if it is this
 *  applicant's - used to answer a retried submission idempotently. */
async function findIntakeByCircuit(
  tx: DbTx,
  linkedTo: AttachTarget,
  applicantId: number
): Promise<{ request: typeof requests.$inferSelect; circuitDoc: typeof dgCircuitDocuments.$inferSelect } | null> {
  if (linkedTo.ownerType !== 'dg_circuit_document') return null;
  const [row] = await tx
    .select({ request: requests, circuitDoc: dgCircuitDocuments })
    .from(dgCircuitDocuments)
    .innerJoin(requests, eq(requests.id, dgCircuitDocuments.requestId))
    .where(and(eq(dgCircuitDocuments.id, linkedTo.ownerId), eq(dgCircuitDocuments.entityType, 'intake_request')));
  return row && row.request.applicantId === applicantId ? row : null;
}

/** M1 - submits a new demande. Works identically whether it came through the
 *  portal or was entered manually by reception/assistant_dg for a physical
 *  drop-off - see cross-cutting pattern "Circuit DG". */
export async function submitRequest(params: SubmitRequestParams): Promise<RequestView> {
  const [applicant] = await db
    .select()
    .from(applicants)
    .where(eq(applicants.id, params.applicantId));
  if (!applicant) throw new Error('APPLICANT_NOT_FOUND');

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, applicant.organisationId));
  if (!organisation) throw new Error('APPLICANT_NOT_FOUND');

  const { attachment } = params;

  let target: RelocationTarget | undefined;
  try {
    // Views read through the pool, so they are built after the commit.
    const { request, circuitDoc } = await db.transaction(async (tx) => {
      // The circuit document is created here, so there is no target row to
      // lock first. A retry with the same upload returns the demande it
      // already created (STORAGE-0B, idempotent attach).
      const linkedTo = await lockUploadAsset(tx, attachment);
      if (linkedTo) {
        const existing = await findIntakeByCircuit(tx, linkedTo, applicant.id);
        if (!existing) throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
        target = { ownerType: linkedTo.ownerType, ownerId: linkedTo.ownerId };
        return existing;
      }

      const reference = await generateRequestReference(organisation.id, organisation.normalizedName);
      const [request] = await tx
        .insert(requests)
        .values({
          reference,
          applicantId: applicant.id,
          organisationId: organisation.id,
          requestType: params.requestType,
          message: params.message,
          status: 'submitted',
        })
        .returning();

      const [circuitDoc] = await tx
        .insert(dgCircuitDocuments)
        .values({
          entityType: 'intake_request',
          requestId: request.id,
          status: 'submitted',
        })
        .returning();

      target = { ownerType: 'dg_circuit_document', ownerId: circuitDoc.id };
      await tx.insert(documentVersions).values(versionValues(attachment, 'dg_circuit_document', circuitDoc.id));
      await linkLockedAsset(tx, attachment.assetId, target);

      await logAudit(
        {
          userId: params.submittedByUserId,
          action: 'REQUEST_SUBMITTED',
          module: 'M1',
          entityId: request.id,
          details: { reference, requestType: params.requestType },
        },
        tx
      );

      return { request, circuitDoc };
    });
    if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
    return toRequestView(request, circuitDoc);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('REQUEST_ALREADY_ACTIVE');
    }
    throw error;
  }
}

export async function getRequest(requestId: number): Promise<RequestView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));

  return toRequestView(request, circuitDoc ?? null);
}

export async function listRequests(filters: { status?: string }): Promise<RequestView[]> {
  const rows = filters.status
    ? await db
        .select()
        .from(requests)
        .where(eq(requests.status, filters.status as typeof requests.$inferSelect.status))
        .orderBy(desc(requests.createdAt))
    : await db.select().from(requests).orderBy(desc(requests.createdAt));

  const withCircuit = await Promise.all(
    rows.map(async (row) => {
      const [circuitDoc] = await db
        .select()
        .from(dgCircuitDocuments)
        .where(eq(dgCircuitDocuments.requestId, row.id));
      return toRequestView(row, circuitDoc ?? null);
    })
  );

  return withCircuit;
}

/** D3b - the viewer opened this dossier in the reading pane (upsert). */
export async function markRequestViewed(requestId: number, userId: number): Promise<void> {
  if (!Number.isInteger(requestId) || requestId <= 0) throw new Error('REQUEST_NOT_FOUND');
  const [request] = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  // Database clock, like audit_logs.created_at: both sides of the unread
  // comparison come from the same clock.
  await db
    .insert(requestViews)
    .values({ userId, requestId, lastViewedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [requestViews.userId, requestViews.requestId],
      set: { lastViewedAt: sql`now()` },
    });
}

/**
 * D3b - « non lue » for one agent: something happened on an open dossier
 * since this agent last opened it (or never opened it). The agent's own
 * events do not count; the submission (applicant) does. A closed dossier
 * (K7) is never unread: nothing is left to do on it.
 */
export function isUnread(params: {
  closed: boolean;
  createdAt: Date;
  lastOthersActivityAt: Date | undefined;
  lastViewedAt: Date | undefined;
}): boolean {
  if (params.closed) return false;
  if (!params.lastViewedAt) return true;
  return latestDate(params.createdAt, params.lastOthersActivityAt) > params.lastViewedAt;
}

export async function listRequestCockpit(viewerUserId?: number): Promise<RequestCockpitSummary> {
  const [
    requestRows,
    phaseRows,
    circuitRows,
    formalDocumentRows,
    evaluationRows,
    activityResult,
    lastActivityRows,
    viewRows,
  ] = await Promise.all([
    db
      .select({
        request: requests,
        organisation: organisations,
        applicant: applicants,
      })
      .from(requests)
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(applicants, eq(requests.applicantId, applicants.id))
      .orderBy(desc(requests.createdAt)),
    db.select().from(phases),
    db.select().from(dgCircuitDocuments),
    db.select().from(formalRequestDocuments),
    db.select().from(documentEvaluations),
    // D3a - the latest events of every dossier, all phases (was: the 120
    // latest rows of the whole app, M1 only).
    db.execute(sql`
      select a.id, a.action, a.module, a.request_id, a.created_at, u.full_name as actor
      from (
        select id, action, module, request_id, created_at, user_id,
               row_number() over (partition by request_id order by created_at desc, id desc) as rn
        from audit_logs
        where request_id is not null
      ) a
      left join users u on u.id = a.user_id
      where a.rn <= ${ACTIVITY_PER_REQUEST}
      order by a.request_id, a.created_at desc, a.id desc
    `),
    db
      .select({
        requestId: auditLogs.requestId,
        lastActivityAt: sql<Date>`max(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt),
        // D3b - same, without the viewer's own events (null when only theirs).
        lastOthersActivityAt: sql<Date | null>`max(${auditLogs.createdAt}) filter (where ${auditLogs.userId} is distinct from ${viewerUserId ?? null})`.mapWith(auditLogs.createdAt),
      })
      .from(auditLogs)
      .where(isNotNull(auditLogs.requestId))
      .groupBy(auditLogs.requestId),
    viewerUserId === undefined
      ? Promise.resolve([] as Array<typeof requestViews.$inferSelect>)
      : db.select().from(requestViews).where(eq(requestViews.userId, viewerUserId)),
  ]);

  const phaseRowsByRequestId = new Map<number, Array<typeof phases.$inferSelect>>();
  for (const phase of phaseRows) {
    const list = phaseRowsByRequestId.get(phase.requestId) ?? [];
    list.push(phase);
    phaseRowsByRequestId.set(phase.requestId, list);
  }

  const circuitByRequestId = new Map(circuitRows.map((row) => [row.requestId, row]));
  const formalDocsByPhaseId = new Map<number, Array<typeof formalRequestDocuments.$inferSelect>>();
  for (const document of formalDocumentRows) {
    const list = formalDocsByPhaseId.get(document.phaseId) ?? [];
    list.push(document);
    formalDocsByPhaseId.set(document.phaseId, list);
  }
  const evaluationsByDocumentId = new Map(evaluationRows.map((row) => [row.formalRequestDocumentId, row]));
  const activitiesByRequestId = new Map<number, RequestCockpitActivity[]>();
  for (const raw of activityResult.rows) {
    const activity = raw as {
      id: number;
      action: string;
      module: string;
      request_id: number;
      created_at: Date | string;
      actor: string | null;
    };
    const label = activityLabel(activity.action, activity.module);
    const list = activitiesByRequestId.get(activity.request_id) ?? [];
    list.push({
      id: activity.id,
      title: label.title,
      actor: activity.actor ?? 'Système',
      createdAt: utcTimestamp(activity.created_at).toISOString(),
      tone: label.tone,
    });
    activitiesByRequestId.set(activity.request_id, list);
  }
  const lastActivityByRequestId = new Map(
    lastActivityRows.map((row) => [row.requestId as number, row.lastActivityAt])
  );
  const lastOthersActivityByRequestId = new Map(
    lastActivityRows.map((row) => [row.requestId as number, row.lastOthersActivityAt ?? undefined])
  );
  const lastViewedByRequestId = new Map(viewRows.map((row) => [row.requestId, row.lastViewedAt]));

  function phasesForRequest(requestId: number): RequestCockpitPhase[] {
    const rows = phaseRowsByRequestId.get(requestId) ?? [];
    const byCode = new Map(rows.map((row) => [row.phaseCode, row]));
    return PHASE_CODES.map((phaseCode) => {
      const row = byCode.get(phaseCode);
      return {
        phaseCode,
        label: PHASE_LABELS[phaseCode],
        status: row ? (row.status === 'closed' ? 'closed' : 'open') : 'not_started',
        href: phaseHref(phaseCode, requestId),
      };
    });
  }

  function currentPhaseLabel(phasesSummary: RequestCockpitPhase[]): {
    currentPhaseCode: string | null;
    currentPhaseLabel: string;
  } {
    const openPhase = [...phasesSummary].reverse().find((phase) => phase.status === 'open');
    if (openPhase) {
      return { currentPhaseCode: openPhase.phaseCode, currentPhaseLabel: openPhase.label };
    }
    const closedPhase = [...phasesSummary].reverse().find((phase) => phase.status === 'closed');
    if (closedPhase) {
      return { currentPhaseCode: closedPhase.phaseCode, currentPhaseLabel: closedPhase.label };
    }
    return { currentPhaseCode: null, currentPhaseLabel: 'Circuit signature' };
  }

  function documentSummary(requestId: number) {
    const requestPhases = phaseRowsByRequestId.get(requestId) ?? [];
    const formalPhase = requestPhases.find((phase) => phase.phaseCode === 'M4');
    if (!formalPhase) return { completed: 0, missing: 0, pending: 0, total: 0 };
    const documents = formalDocsByPhaseId.get(formalPhase.id) ?? [];
    const submittedDocs = documents.filter((document) => document.status === 'submitted');
    const completed = submittedDocs.length;
    const pending = submittedDocs.filter((document) => {
      const evaluation = evaluationsByDocumentId.get(document.id);
      return !evaluation || !evaluation.verdict;
    }).length;
    return {
      completed,
      missing: Math.max(11 - completed, 0),
      pending,
      total: 11,
    };
  }

  function nextAction(params: {
    requestId: number;
    status: string;
    circuitStatus: string | null;
    phasesSummary: RequestCockpitPhase[];
  }): Pick<
    RequestCockpitItem,
    | 'nextActionLabel'
    | 'nextActionDescription'
    | 'nextActionHref'
    | 'nextActionTone'
    | 'canStartPreliminary'
  > {
    const { requestId, status, circuitStatus, phasesSummary } = params;
    if (status === 'completed') {
      return {
        nextActionLabel: 'Workflow terminé',
        nextActionDescription: 'Dossier clos : consultation et téléchargement uniquement.',
        nextActionHref: phaseHref('M7', requestId),
        nextActionTone: 'success',
        canStartPreliminary: false,
      };
    }
    if (status === 'rejected' || status === 'cancelled') {
      // D2 - K7: a closed dossier stays viewable. Link to the last phase that
      // was started (open or closed); none started (closed during the DG
      // circuit) means there is no phase page to open.
      const lastStarted = [...phasesSummary].reverse().find((phase) => phase.status !== 'not_started');
      return {
        nextActionLabel: status === 'rejected' ? 'Dossier rejeté' : 'Dossier annulé',
        nextActionDescription: lastStarted
          ? 'Dossier clos : consultation et téléchargement uniquement.'
          : 'Dossier clos avant la phase préliminaire : aucune page de phase à consulter.',
        nextActionHref: lastStarted?.href ?? null,
        nextActionTone: 'danger',
        canStartPreliminary: false,
      };
    }
    if (circuitStatus === 'submitted') {
      return {
        nextActionLabel: 'Réception doit mettre en signature',
        nextActionDescription: 'Le dossier attend impression et mise en circuit signature.',
        nextActionHref: null,
        nextActionTone: 'warning',
        canStartPreliminary: false,
      };
    }
    if (circuitStatus === 'in_signature_circuit') {
      return {
        nextActionLabel: 'Retour signé attendu',
        nextActionDescription: 'La DN suit le dossier en lecture seule jusqu’au scan retour.',
        nextActionHref: null,
        nextActionTone: 'warning',
        canStartPreliminary: false,
      };
    }
    if (status === 'pending_review' && circuitStatus === 'pending_review') {
      return {
        nextActionLabel: 'Ouvrir la phase préliminaire',
        nextActionDescription: 'Le retour signé est transmis. La DN peut démarrer le traitement.',
        nextActionHref: phaseHref('M3', requestId),
        nextActionTone: 'info',
        canStartPreliminary: true,
      };
    }
    const openPhase = phasesSummary.find((phase) => phase.status === 'open');
    if (openPhase) {
      return {
        nextActionLabel: `Poursuivre ${openPhase.label}`,
        nextActionDescription: 'Continuer le traitement depuis la phase ouverte.',
        nextActionHref: openPhase.href,
        nextActionTone: 'info',
        canStartPreliminary: false,
      };
    }
    const lastClosed = [...phasesSummary].reverse().find((phase) => phase.status === 'closed');
    if (lastClosed) {
      return {
        nextActionLabel: 'Ouvrir la phase suivante',
        nextActionDescription: 'La dernière phase est clôturée. La DN peut poursuivre le circuit.',
        nextActionHref: lastClosed.href,
        nextActionTone: 'info',
        canStartPreliminary: false,
      };
    }
    return {
      nextActionLabel: 'À vérifier',
      nextActionDescription: 'Le dossier ne correspond pas encore à une action DN standard.',
      nextActionHref: null,
      nextActionTone: 'warning',
      canStartPreliminary: false,
    };
  }

  const items: RequestCockpitItem[] = requestRows.map((row) => {
    // D2 - status from the phases loaded above (was one query per dossier).
    const deliveryPhase = phaseRowsByRequestId.get(row.request.id)?.find((phase) => phase.phaseCode === 'M7');
    const resolvedStatus = effectiveRequestStatus(row.request.status, deliveryPhase?.status ?? null);
    const phasesSummary = phasesForRequest(row.request.id);
    const currentPhase = currentPhaseLabel(phasesSummary);
    const circuit = circuitByRequestId.get(row.request.id) ?? null;
    const action = nextAction({
      requestId: row.request.id,
      status: resolvedStatus,
      circuitStatus: circuit?.status ?? null,
      phasesSummary,
    });
    return {
      id: row.request.id,
      reference: row.request.reference,
      requestType: row.request.requestType,
      requestTypeLabel: REQUEST_TYPE_LABELS[row.request.requestType] ?? row.request.requestType,
      status: resolvedStatus,
      statusLabel: REQUEST_STATUS_LABELS[resolvedStatus] ?? resolvedStatus,
      circuitStatus: circuit?.status ?? null,
      circuitStatusLabel: circuit
        ? CIRCUIT_STATUS_LABELS[circuit.status] ?? circuit.status
        : 'Non initialisé',
      createdAt: row.request.createdAt.toISOString(),
      updatedAt: row.request.updatedAt.toISOString(),
      organisationName: row.organisation.name,
      organisationEmail: row.organisation.email,
      organisationPhone: row.organisation.phone,
      applicantName: row.applicant.fullName,
      applicantEmail: row.applicant.email,
      applicantPhone: row.applicant.phone,
      ...currentPhase,
      phases: phasesSummary,
      documentSummary: documentSummary(row.request.id),
      ...action,
      activity: activitiesByRequestId.get(row.request.id) ?? [],
      // D3a - latest dossier event, or the submission when none is linked yet.
      lastActivityAt: latestDate(
        row.request.createdAt,
        lastActivityByRequestId.get(row.request.id)
      ).toISOString(),
      unread: isUnread({
        closed: dossierFlags(row.request.status).dossierClosed,
        createdAt: row.request.createdAt,
        lastOthersActivityAt: lastOthersActivityByRequestId.get(row.request.id),
        lastViewedAt: lastViewedByRequestId.get(row.request.id),
      }),
    };
  });

  const activeItems = items.filter((item) => !TERMINAL_REQUEST_STATUSES.includes(item.status));
  const waitingDg = items.filter((item) =>
    ['submitted', 'in_signature_circuit', 'signed'].includes(item.circuitStatus ?? '')
  );
  const inReview = items.filter((item) => item.status === 'in_progress' || item.status === 'pending_review');
  const completed = items.filter((item) => item.status === 'completed');

  return {
    metrics: [
      {
        key: 'new',
        label: 'Nouvelles',
        value: items.filter((item) => item.status === 'pending_review').length,
        helper: 'Retours signés prêts à ouvrir',
        tone: 'info',
      },
      {
        key: 'in_review',
        label: "En cours d'examen",
        value: inReview.length,
        helper: 'Dossiers ouverts ou prêts DN',
        tone: inReview.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'waiting_dg',
        label: 'En attente DG',
        value: waitingDg.length,
        helper: 'Circuit signature non terminé',
        tone: waitingDg.length > 0 ? 'warning' : 'success',
      },
      {
        key: 'closed',
        label: 'Clôturées',
        value: completed.length,
        helper: `${activeItems.length} dossier(s) non terminé(s)`,
        tone: 'success',
      },
    ],
    items,
    updatedAt: new Date().toISOString(),
  };
}

export async function sendToSignature(requestId: number, actorUserId: number): Promise<RequestView> {
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertDossierOpen(db, requestId);
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  const [updatedCircuitDoc] = await db
    .update(dgCircuitDocuments)
    .set({ status: 'in_signature_circuit', signatureSentAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id))
    .returning();

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_SENT_TO_SIGNATURE',
    module: 'M1',
    entityId: requestId,
  });

  return toRequestView(request, updatedCircuitDoc);
}

/** Legacy fallback for records already in the old two-step state. New M1 intake
 *  uses sendToSignature() then returnSignedFromDg(). */
export async function markSigned(requestId: number, actorUserId: number): Promise<RequestView> {
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertDossierOpen(db, requestId);
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await db
    .update(dgCircuitDocuments)
    .set({ status: 'signed', signedAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: 'signed', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_SIGNED',
    module: 'M1',
    entityId: requestId,
  });

  const updatedCircuitDoc = { ...circuitDoc, status: 'signed' } as typeof circuitDoc;
  return toRequestView(request, updatedCircuitDoc);
}

/** Pattern "Circuit DG" - Signe -> En attente de traitement. DN can now
 *  start working the dossier (Phase 1 creation is a separate module). */
export async function markPendingReview(
  requestId: number,
  actorUserId: number
): Promise<RequestView> {
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertDossierOpen(db, requestId);
  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'signed') throw new Error('INVALID_CIRCUIT_TRANSITION');

  await db
    .update(dgCircuitDocuments)
    .set({ status: 'pending_review', pendingReviewAt: new Date() })
    .where(eq(dgCircuitDocuments.id, circuitDoc.id));

  const [request] = await db
    .update(requests)
    .set({ status: 'pending_review', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'DG_CIRCUIT_PENDING_REVIEW',
    module: 'M1',
    entityId: requestId,
  });

  const updatedCircuitDoc = { ...circuitDoc, status: 'pending_review' } as typeof circuitDoc;
  return toRequestView(request, updatedCircuitDoc);
}

export async function returnSignedFromDg(
  requestId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<RequestView> {
  let target: RelocationTarget | undefined;
  const { request, circuitDoc } = await db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertDossierOpen(tx, requestId);
    const circuit = await lockIntakeCircuit(tx, requestId);
    target = { ownerType: 'dg_circuit_document', ownerId: circuit.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') {
      const [current] = await tx.select().from(requests).where(eq(requests.id, requestId));
      return { request: current, circuitDoc: circuit };
    }
    if (circuit.status !== 'in_signature_circuit') throw new Error('INVALID_CIRCUIT_TRANSITION');

    await replaceCircuitVersion(tx, requestId, circuit.id, attachment, actorUserId);

    const now = new Date();
    const [updatedCircuitDoc] = await tx
      .update(dgCircuitDocuments)
      .set({ status: 'pending_review', signedAt: now, pendingReviewAt: now })
      .where(eq(dgCircuitDocuments.id, circuit.id))
      .returning();

    const [updatedRequest] = await tx
      .update(requests)
      .set({ status: 'pending_review', updatedAt: now })
      .where(eq(requests.id, requestId))
      .returning();

    await logAudit({ userId: actorUserId, action: 'DG_CIRCUIT_SIGNED_RETURNED', module: 'M1', entityId: requestId }, tx);
    return { request: updatedRequest, circuitDoc: updatedCircuitDoc };
  });

  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return toRequestView(request, circuitDoc);
}

/** Cancellable only while still in Depose - locked the instant DG signs it.
 *  Releases the "one active request" rule immediately. */
/** Cancellable only while still in Depose (checked above). Can be called
 *  either by staff (on the postulant's behalf) or by the applicant
 *  themselves - when it's the applicant, ownership is enforced: they can
 *  only cancel their own demande. */
export async function cancelRequest(
  requestId: number,
  actor: { userId?: number; applicantId?: number }
): Promise<RequestView> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  if (actor.applicantId !== undefined && request.applicantId !== actor.applicantId) {
    throw new Error('REQUEST_NOT_FOUND'); // don't leak existence of someone else's request
  }
  // K7 - closed dossier: read-only (requests/dossier-open.ts).
  await assertDossierOpen(db, requestId);

  const [circuitDoc] = await db
    .select()
    .from(dgCircuitDocuments)
    .where(eq(dgCircuitDocuments.requestId, requestId));
  if (!circuitDoc) throw new Error('DG_CIRCUIT_NOT_FOUND');
  if (circuitDoc.status !== 'submitted') throw new Error('REQUEST_NOT_CANCELLABLE');

  const [updated] = await db
    .update(requests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(requests.id, requestId))
    .returning();

  await logAudit({
    userId: actor.userId,
    action: 'REQUEST_CANCELLED',
    module: 'M1',
    entityId: requestId,
    details: actor.applicantId ? { cancelledByApplicant: actor.applicantId } : undefined,
  });

  return toRequestView(updated, circuitDoc);
}

/** M1 - "my current demande" for the portal. At most one non-terminal
 *  request exists per applicant's organisation (see the "one active
 *  request" rule), but history (cancelled/rejected/completed) is included
 *  too so the applicant can see what happened to past attempts. */
export async function listRequestsByApplicant(applicantId: number): Promise<RequestView[]> {
  const rows = await db
    .select()
    .from(requests)
    .where(eq(requests.applicantId, applicantId))
    .orderBy(desc(requests.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      const [circuitDoc] = await db
        .select()
        .from(dgCircuitDocuments)
        .where(eq(dgCircuitDocuments.requestId, row.id));
      return toRequestView(row, circuitDoc ?? null);
    })
  );
}

/** The demande's intake circuit document, locked (STORAGE-0B: the target
 *  row is locked before the upload asset). Filtered on entity type - the
 *  M4 formal letter circuit shares the request id. */
async function lockIntakeCircuit(tx: DbTx, requestId: number): Promise<typeof dgCircuitDocuments.$inferSelect> {
  const [circuit] = await tx
    .select()
    .from(dgCircuitDocuments)
    .where(and(eq(dgCircuitDocuments.requestId, requestId), eq(dgCircuitDocuments.entityType, 'intake_request')))
    .for('update');
  if (!circuit) throw new Error('DG_CIRCUIT_NOT_FOUND');
  return circuit;
}

/** New current version + link, inside the caller's transaction (asset
 *  already claimed). */
async function replaceCircuitVersion(
  tx: DbTx,
  requestId: number,
  circuitId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<void> {
  await trashCurrentVersions(tx, 'dg_circuit_document', circuitId);
  await tx.insert(documentVersions).values(versionValues(attachment, 'dg_circuit_document', circuitId));
  await linkLockedAsset(tx, attachment.assetId, { ownerType: 'dg_circuit_document', ownerId: circuitId });
  await logAudit({ userId: actorUserId, action: 'DG_CIRCUIT_DOCUMENT_REPLACED', module: 'M1', entityId: requestId }, tx);
}

/** M8 pattern - replace a mis-scanned document. The old version goes to
 *  trash (isCurrent=false, trashedAt set), never deleted outright. Both
 *  versions stay visible to applicant and DN per the M8 decision. */
export async function replaceCircuitDocument(
  requestId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<void> {
  let target: RelocationTarget | undefined;
  await db.transaction(async (tx) => {
    // K7 - closed dossier: read-only (requests/dossier-open.ts).
    await assertDossierOpen(tx, requestId);
    const circuit = await lockIntakeCircuit(tx, requestId);
    target = { ownerType: 'dg_circuit_document', ownerId: circuit.id };
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return;
    await replaceCircuitVersion(tx, requestId, circuit.id, attachment, actorUserId);
  });

  if (target) await relocateDossierAssetAfterCommit(attachment.assetId, target);
}
