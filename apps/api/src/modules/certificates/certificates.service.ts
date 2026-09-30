import { eq, and, desc } from 'drizzle-orm';
import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer';
import { db } from '../../shared/db/index.js';
import {
  phases,
  requests,
  organisations,
  payments,
  certificates,
  documentVersions,
  notifications,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import { cleanupGeneratedFileOnFailure } from '../files/generated-file-cleanup.js';
import { attachPaymentInvoice, attachPaymentProof } from '../payments/payment-documents.js';
import { insertAssetWithAddress } from '../uploads/asset-registration.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { getTextValue } from '../system-parameters/system-parameters.service.js';
import { generateCertificateReference } from './certificates.helpers.js';
import {
  EMPTY_SCOPE_DETAILS,
  type PaymentView,
  type CertificateView,
  type CertificateBundle,
  type PaymentQueueItem,
  type ScopeDetails,
  type CertificateTemplateData,
} from './certificates.types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates/certificates');

function toPaymentView(row: typeof payments.$inferSelect): PaymentView {
  return {
    id: row.id,
    status: row.status,
    invoiceFileUrl: row.invoiceFileUrl,
    invoiceUploadedAt: row.invoiceUploadedAt,
    proofFileUrl: row.proofFileUrl,
    proofUploadedAt: row.proofUploadedAt,
    validatedAt: row.validatedAt,
    rejectionReason: row.rejectionReason,
    rejectionAction: row.rejectionAction,
  };
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function toCertificateView(row: typeof certificates.$inferSelect): CertificateView {
  return {
    id: row.id,
    reference: row.reference,
    certificateType: row.certificateType,
    typeOverriddenBy: row.typeOverriddenBy,
    status: row.status,
    createdAt: row.createdAt,
    printedAt: row.printedAt,
    signedAt: row.signedAt,
    signedFileUrl: row.signedFileUrl,
    archivedAt: row.archivedAt,
    notifiedAt: row.notifiedAt,
    collectedAt: row.collectedAt,
    approvalReferenceNumber: row.approvalReferenceNumber,
    expiresAt: row.expiresAt,
    initialIssueDate: row.initialIssueDate,
    currentIssueDate: row.currentIssueDate,
    dgFullNameOverride: row.dgFullNameOverride,
    scopeDetails: (row.scopeDetails as ScopeDetails | null) ?? null,
    daysToDeliver: daysBetween(row.createdAt, row.notifiedAt),
    daysToCollect: daysBetween(row.notifiedAt, row.collectedAt),
  };
}

function nextPaymentAction(status: string): PaymentQueueItem['nextAction'] {
  if (status === 'awaiting_invoice') return 'send_invoice';
  if (status === 'pending_validation') return 'validate_payment';
  if (status === 'awaiting_proof') return 'waiting_for_proof';
  if (status === 'validated') return 'done';
  return 'rejected';
}

// ── Open M7 ───────────────────────────────────────────────────────────────
export async function openDeliveryPhase(
  requestId: number,
  actorUserId: number
): Promise<{ id: number }> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [m6] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M6')));
  if (!m6 || m6.status !== 'closed') throw new Error('M6_NOT_CLOSED');

  const [existing] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M7')));
  if (existing) throw new Error('PHASE_ALREADY_OPEN');

  const [phase] = await db.insert(phases).values({ requestId, phaseCode: 'M7' }).returning();

  await db.insert(payments).values({ phaseId: phase.id });

  await logAudit({
    userId: actorUserId,
    action: 'PHASE_OPENED',
    module: 'M7',
    entityId: phase.id,
    details: { requestId, phaseCode: 'M7' },
  });

  return { id: phase.id };
}

// ── Bundle ────────────────────────────────────────────────────────────────
export async function getBundleForRequest(requestId: number): Promise<CertificateBundle> {
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M7')));

  if (!phase) {
    return { phase: null, payment: null, certificate: null };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phase.id));
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.requestId, requestId));

  return {
    phase: {
      id: phase.id,
      status: phase.status,
      openedAt: phase.openedAt,
      closedAt: phase.closedAt,
    },
    payment: payment ? toPaymentView(payment) : null,
    certificate: certificate ? toCertificateView(certificate) : null,
  };
}

export async function getPaymentQueue(): Promise<PaymentQueueItem[]> {
  const rows = await db
    .select({
      phaseId: phases.id,
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
    .where(eq(phases.phaseCode, 'M7'))
    .orderBy(desc(phases.openedAt));

  return rows.map((row) => ({
    phaseId: row.phaseId,
    requestId: row.requestId,
    requestReference: row.requestReference,
    requestType: row.requestType,
    organisationName: row.organisationName,
    payment: toPaymentView(row.payment),
    nextAction: nextPaymentAction(row.payment.status),
  }));
}

// ── Invoice ───────────────────────────────────────────────────────────────
export async function uploadInvoice(
  phaseId: number,
  attachment: PreparedAttachment,
  actorUserId: number
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentInvoice(phaseId, 'M7', attachment, actorUserId));
}

// ── Proof of payment ─────────────────────────────────────────────────────
export async function uploadPaymentProof(
  phaseId: number,
  requestId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<PaymentView> {
  return toPaymentView(await attachPaymentProof(phaseId, requestId, applicantId, 'M7', attachment));
}

// ── Validate proof - this is where the certificate row is created ────────
// Per the M7 spec: "À la validation de la preuve de paiement, le certificat
// est créé en base (statut initial En préparation)". createdAt is the point
// zero of the time-to-deliver KPI.
export async function validatePayment(
  phaseId: number,
  actorUserId: number
): Promise<{ payment: PaymentView; certificate: CertificateView }> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  if (!phase) throw new Error('PHASE_NOT_FOUND');

  const [existingCert] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.requestId, phase.requestId));
  if (existingCert) throw new Error('CERTIFICATE_ALREADY_EXISTS');

  const [request] = await db.select().from(requests).where(eq(requests.id, phase.requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [updatedPayment] = await db
    .update(payments)
    .set({ status: 'validated', validatedBy: actorUserId, validatedAt: new Date() })
    .where(eq(payments.id, payment.id))
    .returning();

  // Default certificate type from request type; DN can override anytime.
  const certificateType = request.requestType === 'recognition' ? 'recognition' : 'agreement';
  const reference = await generateCertificateReference();

  const [certificate] = await db
    .insert(certificates)
    .values({
      requestId: phase.requestId,
      reference,
      certificateType,
      scopeDetails: EMPTY_SCOPE_DETAILS,
    })
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'PAYMENT_VALIDATED',
    module: 'M7',
    entityId: payment.id,
  });
  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_CREATED',
    module: 'M7',
    entityId: certificate.id,
    details: { reference, certificateType },
  });

  return { payment: toPaymentView(updatedPayment), certificate: toCertificateView(certificate) };
}

export async function rejectPayment(
  phaseId: number,
  actorUserId: number,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<PaymentView> {
  const [payment] = await db.select().from(payments).where(eq(payments.phaseId, phaseId));
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending_validation') throw new Error('PAYMENT_NOT_PENDING');

  const newStatus = rejectionAction === 'reject_dossier' ? 'rejected' : 'awaiting_proof';

  const [updated] = await db
    .update(payments)
    .set({ status: newStatus, rejectionAction, rejectionReason })
    .where(eq(payments.id, payment.id))
    .returning();

  if (rejectionAction === 'reject_dossier') {
    const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
    if (phase) {
      await db
        .update(requests)
        .set({
          status: 'rejected',
          rejectionReason: `Paiement rejeté - dossier annulé : ${rejectionReason}`,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, phase.requestId));
    }
  }

  await logAudit({
    userId: actorUserId,
    action: 'PAYMENT_REJECTED',
    module: 'M7',
    entityId: payment.id,
    details: { rejectionAction },
  });

  return toPaymentView(updated);
}

// ── DN data entry: certificate header fields + scope details + type override
export async function updateCertificateFields(
  certificateId: number,
  actorUserId: number,
  fields: {
    approvalReferenceNumber?: string;
    expiresAt?: string; // ISO date
    initialIssueDate?: string;
    currentIssueDate?: string;
    dgFullNameOverride?: string;
    scopeDetails?: ScopeDetails;
  }
): Promise<CertificateView> {
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');
  if (existing.status !== 'in_preparation') throw new Error('CERTIFICATE_NOT_EDITABLE');

  const updates: Partial<typeof certificates.$inferInsert> = {};
  if (fields.approvalReferenceNumber !== undefined)
    updates.approvalReferenceNumber = fields.approvalReferenceNumber;
  if (fields.expiresAt !== undefined) updates.expiresAt = new Date(fields.expiresAt);
  if (fields.initialIssueDate !== undefined)
    updates.initialIssueDate = new Date(fields.initialIssueDate);
  if (fields.currentIssueDate !== undefined)
    updates.currentIssueDate = new Date(fields.currentIssueDate);
  if (fields.dgFullNameOverride !== undefined)
    updates.dgFullNameOverride = fields.dgFullNameOverride;
  if (fields.scopeDetails !== undefined) updates.scopeDetails = fields.scopeDetails;

  const [updated] = await db
    .update(certificates)
    .set(updates)
    .where(eq(certificates.id, certificateId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_FIELDS_UPDATED',
    module: 'M7',
    entityId: certificateId,
  });

  return toCertificateView(updated);
}

export async function overrideCertificateType(
  certificateId: number,
  actorUserId: number,
  certificateType: 'agreement' | 'recognition'
): Promise<CertificateView> {
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');
  if (existing.status !== 'in_preparation') throw new Error('CERTIFICATE_NOT_EDITABLE');

  const [updated] = await db
    .update(certificates)
    .set({ certificateType, typeOverriddenBy: actorUserId })
    .where(eq(certificates.id, certificateId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_TYPE_OVERRIDDEN',
    module: 'M7',
    entityId: certificateId,
    details: { certificateType },
  });

  return toCertificateView(updated);
}

function formatDateFr(d: Date | null): string {
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

// ── Generate the filled certificate (Puppeteer: load template, call
// renderCertificate(data) in-page, print to PDF) ──────────────────────────
export async function generateCertificateDocument(
  certificateId: number,
  actorUserId: number
): Promise<{ fileUrl: string }> {
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, certificateId));
  if (!certificate) throw new Error('CERTIFICATE_NOT_FOUND');

  const [request] = await db.select().from(requests).where(eq(requests.id, certificate.requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, request.organisationId));
  if (!organisation) throw new Error('ORGANISATION_NOT_FOUND');

  const scope = (certificate.scopeDetails as ScopeDetails | null) ?? EMPTY_SCOPE_DETAILS;
  const dgFullName =
    certificate.dgFullNameOverride ??
    (await getTextValue('certificate_dg_full_name', 'Directeur Général'));
  // Fixed, part of the certificate's official identity - not configurable
  // per-certificate, see project decisions.
  const deliveranceAuthorityCertificate = "AGENCE NATIONALE DE L'AVIATION CIVILE - GABON";

  const data: CertificateTemplateData = {
    deliveranceAuthorityCertificate,
    approvalReferenceNumber: certificate.approvalReferenceNumber ?? '',
    organisationName: organisation.name,
    legalAddress: organisation.legalAddress,
    phone: organisation.phone ?? '',
    email: organisation.email ?? '',
    expiresAt: formatDateFr(certificate.expiresAt),
    initialIssueDate: formatDateFr(certificate.initialIssueDate),
    currentIssueDate: formatDateFr(certificate.currentIssueDate),
    dgFullName,
    qualificationAeronefs: scope.aeronefs.qualification,
    qualificationAeronefsEn: scope.aeronefs.qualificationEn,
    limitationsAeronefs: scope.aeronefs.limitations,
    qualificationMoteurs: scope.moteurs.qualification,
    qualificationMoteursEn: scope.moteurs.qualificationEn,
    limitationsMoteurs: scope.moteurs.limitations,
    qualificationComposants: scope.composants.qualification,
    qualificationComposantsEn: scope.composants.qualificationEn,
    limitationsComposants: scope.composants.limitations,
    qualificationSpecialisee: scope.specialisee.qualification,
    qualificationSpecialiseeEn: scope.specialisee.qualificationEn,
    limitationsSpecialisee: scope.specialisee.limitations,
  };

  const templateFile =
    certificate.certificateType === 'recognition' ? 'recognition.html' : 'agreement.html';
  const templatePath = path.join(TEMPLATES_DIR, templateFile);
  const html = await readFile(templatePath, 'utf-8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  let pdfBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate((certData) => {
      // renderCertificate is defined in the template's own <script>; this
      // callback executes in the browser context, not Node, but tsc type-
      // checks it against Node's lib, so reference globalThis rather than
      // `window` (not declared without the DOM lib).
      (globalThis as unknown as { renderCertificate: (d: unknown) => void }).renderCertificate(
        certData
      );
    }, data);
    pdfBuffer = Buffer.from(
      await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    );
  } finally {
    await browser.close();
  }

  // STORAGE-3C - written directly under generated/certificates/ with an
  // opaque UUID filename, deliberately flat (no request-reference segment):
  // this is a server-produced artifact, not a dossier document, and keeping
  // it out of the reference-keyed dossier tree avoids it ever being mistaken
  // for one. The human-readable reference stays in originalName and on the
  // certificate row itself. This never goes through staging or dossier
  // relocation - it shares the certificate_document owner type with the
  // signed-return scan (markSigned) only in the DB, never in physical
  // storage; markSigned's own asset is always a distinct upload_assets row.
  const fileName = `${randomUUID()}.pdf`;
  const storageKey = `generated/certificates/${fileName}`;
  const storagePath = path.join(UPLOADS_ROOT, 'generated', 'certificates', fileName);
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, pdfBuffer);

  let fileUrl: string;
  try {
    // STORAGE-3C - asset registration and the current-version row commit
    // together: no window where the asset is linked but no current version
    // points at it.
    // VERSION-CURRENT-DISCIPLINE - the certificate row is locked FOR UPDATE
    // before trashing/inserting so two concurrent generate calls can never
    // both insert a current row (STORAGE-0B lock convention); trashing the
    // prior generated version first means a regenerate-before-signing
    // replaces it instead of accumulating a second current row.
    fileUrl = await db.transaction(async (tx) => {
      await tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, certificateId)).for('update');
      await trashCurrentVersions(tx, 'certificate_document', certificateId);

      const { address } = await insertAssetWithAddress(tx, {
        storageKey,
        originalName: `certificate-${certificate.reference}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        uploadedByUserId: actorUserId,
        uploadedFromApp: 'api',
        moduleHint: 'certificates',
        linkedOwnerType: 'certificate_document',
        linkedOwnerId: certificate.id,
        linkedAt: new Date(),
      });

      await tx.insert(documentVersions).values({
        ownerType: 'certificate_document',
        ownerId: certificate.id,
        fileUrl: address,
        mimeType: 'application/pdf',
        uploadedBy: actorUserId,
        isCurrent: true,
      });

      await logAudit(
        {
          userId: actorUserId,
          action: 'CERTIFICATE_DOCUMENT_GENERATED',
          module: 'M7',
          entityId: certificate.id,
        },
        tx
      );

      return address;
    });
  } catch (error) {
    // STORAGE-3C - the PDF was written before this transaction; a failure
    // here must not leave it behind with nothing pointing at it.
    await cleanupGeneratedFileOnFailure(storagePath, 'certificates');
    throw error;
  }

  return { fileUrl };
}

// ── Status lifecycle: printed -> signed -> archived -> notified -> collected
async function setStatus(
  certificateId: number,
  actorUserId: number,
  status: 'printed' | 'signed' | 'archived',
  timestampField: 'printedAt' | 'signedAt' | 'archivedAt'
): Promise<CertificateView> {
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');

  const order = ['in_preparation', 'printed', 'signed', 'archived', 'notified', 'collected'];
  const currentIdx = order.indexOf(existing.status);
  const targetIdx = order.indexOf(status);
  if (targetIdx !== currentIdx + 1) throw new Error('INVALID_STATUS_TRANSITION');

  const [updated] = await db
    .update(certificates)
    .set({ status, [timestampField]: new Date() })
    .where(eq(certificates.id, certificateId))
    .returning();

  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_STATUS_CHANGED',
    module: 'M7',
    entityId: certificateId,
    details: { status },
  });

  return toCertificateView(updated);
}

export const markPrinted = (id: number, userId: number) =>
  setStatus(id, userId, 'printed', 'printedAt');

export async function markSigned(
  certificateId: number,
  actorUserId: number,
  attachment: PreparedAttachment
): Promise<CertificateView> {
  const target: RelocationTarget = { ownerType: 'certificate_document', ownerId: certificateId };
  const updated = await db.transaction(async (tx) => {
    // Target first: the certificate row, then the upload asset.
    const [existing] = await tx
      .select()
      .from(certificates)
      .where(eq(certificates.id, certificateId))
      .for('update');
    if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return existing;
    if (existing.status !== 'printed') throw new Error('INVALID_STATUS_TRANSITION');

    // VERSION-CURRENT-DISCIPLINE - the signed return supersedes the
    // generated PDF as the certificate's current document; both remain
    // preserved as history (trashed, never deleted).
    await trashCurrentVersions(tx, 'certificate_document', certificateId);
    await tx.insert(documentVersions).values(versionValues(attachment, 'certificate_document', certificateId));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [signed] = await tx
      .update(certificates)
      .set({ status: 'signed', signedAt: new Date(), signedFileUrl: attachment.fileUrl })
      .where(eq(certificates.id, certificateId))
      .returning();

    await logAudit(
      {
        userId: actorUserId,
        action: 'CERTIFICATE_SIGNED_RETURN_REGISTERED',
        module: 'M7',
        entityId: certificateId,
        details: { fileUrl: attachment.fileUrl },
      },
      tx
    );
    return signed;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return toCertificateView(updated);
}

export const markArchived = (id: number, userId: number) =>
  setStatus(id, userId, 'archived', 'archivedAt');

export async function notifyApplicant(
  certificateId: number,
  actorUserId: number
): Promise<CertificateView> {
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');
  if (existing.status !== 'archived') throw new Error('INVALID_STATUS_TRANSITION');

  const [request] = await db.select().from(requests).where(eq(requests.id, existing.requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');

  const [updated] = await db
    .update(certificates)
    .set({ status: 'notified', notifiedAt: new Date() })
    .where(eq(certificates.id, certificateId))
    .returning();

  await db.insert(notifications).values({
    recipientType: 'applicant',
    applicantId: request.applicantId,
    channel: 'email',
    eventType: 'CERTIFICATE_READY',
    message:
      'Votre certificat est prêt. Merci de vous présenter à nos bureaux pour le retirer en personne.',
    requestId: request.id,
  });

  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_STATUS_CHANGED',
    module: 'M7',
    entityId: certificateId,
    details: { status: 'notified' },
  });

  return toCertificateView(updated);
}

// Collection auto-closes the M7 phase - the certificate lifecycle IS the
// phase's reason to stay open, per the M7 spec ("la phase reste ouverte tout
// le long du cycle"). No separate manual close endpoint exists for M7.
export async function markCollected(
  certificateId: number,
  actorUserId: number
): Promise<CertificateView> {
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!existing) throw new Error('CERTIFICATE_NOT_FOUND');
  if (existing.status !== 'notified') throw new Error('INVALID_STATUS_TRANSITION');

  const [updated] = await db
    .update(certificates)
    .set({ status: 'collected', collectedAt: new Date() })
    .where(eq(certificates.id, certificateId))
    .returning();

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.requestId, existing.requestId), eq(phases.phaseCode, 'M7')));
  if (phase) {
    await db
      .update(phases)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(phases.id, phase.id));
  }

  await db
    .update(requests)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(requests.id, existing.requestId));

  await logAudit({
    userId: actorUserId,
    action: 'CERTIFICATE_STATUS_CHANGED',
    module: 'M7',
    entityId: certificateId,
    details: { status: 'collected' },
  });
  if (phase) {
    await logAudit({
      userId: actorUserId,
      action: 'PHASE_CLOSED',
      module: 'M7',
      entityId: phase.id,
      details: { trigger: 'auto_on_collection' },
    });
  }
  await logAudit({
    userId: actorUserId,
    action: 'REQUEST_COMPLETED',
    module: 'M7',
    entityId: existing.requestId,
    details: { trigger: 'certificate_collected' },
  });

  return toCertificateView(updated);
}
