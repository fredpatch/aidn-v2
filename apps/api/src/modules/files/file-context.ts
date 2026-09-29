/** STORAGE-0A - resolves where an upload asset belongs (dossier + stage,
 *  template, report, or its uploader when unlinked). At most two joins; any
 *  broken link in the chain makes the file "unresolvable" (SU only). */
import { eq } from 'drizzle-orm';
import { fileAddress } from '@aidn/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/db/schema.js';
import type { FileContext } from './file-access.policy.js';

export interface AssetForContext {
  id: number;
  storageKey: string;
  linkedOwnerType: string | null;
  linkedOwnerId: number | null;
  uploadedByUserId: number | null;
  uploadedByApplicantId: number | null;
}

type PhaseOwnedType =
  | 'formal_request_document'
  | 'preliminary_evaluation_form'
  | 'payment_invoice'
  | 'payment_proof'
  | 'meeting_report';

export interface FileContextStore {
  findRequestApplicant(requestId: number): Promise<number | null>;
  findDgCircuitRequest(dgCircuitDocumentId: number): Promise<number | null>;
  findPhase(phaseId: number): Promise<{ requestId: number; phaseCode: string } | null>;
  findOwnerPhaseId(ownerType: PhaseOwnedType, ownerId: number): Promise<number | null>;
  findCertificateRequest(certificateId: number): Promise<number | null>;
  findTemplate(templateId: number): Promise<{ active: boolean; fileUrl: string | null } | null>;
  reportExists(reportId: number): Promise<boolean>;
}

const PHASE_OWNED = new Set<string>([
  'formal_request_document',
  'preliminary_evaluation_form',
  'payment_invoice',
  'payment_proof',
  'meeting_report',
]);

const UNRESOLVABLE: FileContext = { kind: 'unresolvable' };

async function dossier(
  store: FileContextStore,
  ownerType: string,
  requestId: number | null,
  stage: string
): Promise<FileContext> {
  if (requestId === null) return UNRESOLVABLE;
  const applicantId = await store.findRequestApplicant(requestId);
  return applicantId === null ? UNRESOLVABLE : { kind: 'dossier', ownerType, requestId, applicantId, stage };
}

async function phaseDossier(store: FileContextStore, ownerType: string, phaseId: number | null): Promise<FileContext> {
  if (phaseId === null) return UNRESOLVABLE;
  const phase = await store.findPhase(phaseId);
  return phase ? dossier(store, ownerType, phase.requestId, phase.phaseCode) : UNRESOLVABLE;
}

export async function resolveAssetContext(asset: AssetForContext, store: FileContextStore): Promise<FileContext> {
  const { linkedOwnerType: ownerType, linkedOwnerId: ownerId } = asset;
  if (!ownerType || ownerId === null) {
    return {
      kind: 'unlinked',
      uploadedByUserId: asset.uploadedByUserId,
      uploadedByApplicantId: asset.uploadedByApplicantId,
    };
  }

  if (ownerType === 'dg_circuit_document') {
    return dossier(store, ownerType, await store.findDgCircuitRequest(ownerId), 'dg_circuit');
  }
  if (PHASE_OWNED.has(ownerType)) {
    return phaseDossier(store, ownerType, await store.findOwnerPhaseId(ownerType as PhaseOwnedType, ownerId));
  }
  if (ownerType === 'phase_closure_document') {
    return phaseDossier(store, ownerType, ownerId);
  }
  if (ownerType === 'certificate_document') {
    return dossier(store, ownerType, await store.findCertificateRequest(ownerId), 'M7');
  }
  if (ownerType === 'document_template') {
    const template = await store.findTemplate(ownerId);
    if (!template) return UNRESOLVABLE;
    // Current = the template points at this asset (stable address, or the
    // legacy /uploads address until the rewrite has run).
    const isCurrent =
      template.fileUrl === fileAddress(asset.id) || template.fileUrl === `/uploads/${asset.storageKey}`;
    return { kind: 'template', active: template.active, isCurrent };
  }
  if (ownerType === 'report') {
    return (await store.reportExists(ownerId)) ? { kind: 'report' } : UNRESOLVABLE;
  }
  return UNRESOLVABLE;
}

type Executor = NodePgDatabase<typeof schema>;

export function createDbFileContextStore(executor: Executor): FileContextStore {
  const one = async <T>(rows: Promise<T[]>): Promise<T | null> => (await rows)[0] ?? null;
  return {
    async findRequestApplicant(requestId) {
      const row = await one(
        executor.select({ applicantId: schema.requests.applicantId }).from(schema.requests).where(eq(schema.requests.id, requestId))
      );
      return row?.applicantId ?? null;
    },
    async findDgCircuitRequest(id) {
      const row = await one(
        executor
          .select({ requestId: schema.dgCircuitDocuments.requestId })
          .from(schema.dgCircuitDocuments)
          .where(eq(schema.dgCircuitDocuments.id, id))
      );
      return row?.requestId ?? null;
    },
    async findPhase(id) {
      return one(
        executor
          .select({ requestId: schema.phases.requestId, phaseCode: schema.phases.phaseCode })
          .from(schema.phases)
          .where(eq(schema.phases.id, id))
      );
    },
    async findOwnerPhaseId(ownerType, id) {
      const table = {
        formal_request_document: schema.formalRequestDocuments,
        preliminary_evaluation_form: schema.preliminaryEvaluationForms,
        payment_invoice: schema.payments,
        payment_proof: schema.payments,
        meeting_report: schema.meetings,
      }[ownerType];
      const row = await one(executor.select({ phaseId: table.phaseId }).from(table).where(eq(table.id, id)));
      return row?.phaseId ?? null;
    },
    async findCertificateRequest(id) {
      const row = await one(
        executor.select({ requestId: schema.certificates.requestId }).from(schema.certificates).where(eq(schema.certificates.id, id))
      );
      return row?.requestId ?? null;
    },
    async findTemplate(id) {
      return one(
        executor
          .select({ active: schema.documentTemplates.active, fileUrl: schema.documentTemplates.fileUrl })
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.id, id))
      );
    },
    async reportExists(id) {
      return (await one(executor.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.id, id)))) !== null;
    },
  };
}
