/** STORAGE-1B - resolves the canonical dossier location for a linked
 *  upload_assets row, and computes its canonical storage key.
 *
 *  Every path segment here is either `requests.reference` (server-generated,
 *  never mutated after creation - see the invariant note next to its
 *  generation in requests.service.ts), one of the hardcoded French phase
 *  folder constants below, a controlled category/slot slug, or the opaque
 *  filename carried over unchanged from the staging key. Nothing here is
 *  ever derived from client input, an original filename, or `moduleHint`. */
import { eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../../shared/db/index.js';
import {
  certificates,
  dgCircuitDocuments,
  formalRequestDocuments,
  meetings,
  payments,
  phases,
  preliminaryEvaluationForms,
  requests,
} from '../../shared/db/schema.js';
import type { UploadOwnerType } from './uploads.types.js';

/** Hardcoded French dossier folder names - do NOT derive these from
 *  MODULE_CODES or any UI translation table (approved decision). */
export const PHASE_FOLDERS = {
  M1: 'M1-circuit-dg',
  M3: 'M3-phase-preliminaire',
  M4: 'M4-demande-formelle',
  M5: 'M5-evaluation-approfondie',
  M6: 'M6-demonstration-inspection',
  M7: 'M7-delivrance',
} as const;

export type PhaseFolderCode = keyof typeof PHASE_FOLDERS;

export interface StorageContext {
  requestReference: string;
  phaseFolder: string;
  /** Server-controlled slug, e.g. 'certificates' or 'formal-documents/<slot>'. */
  categorySlug: string;
}

/** Owner types this slice ever relocates. document_template, report and the
 *  generated certificate PDF (uploadedFromApp: 'api', never attachable here
 *  in the first place) are excluded on purpose. Exported as an array (not
 *  just the Set below) so callers outside this module - e.g. the health
 *  diagnostics query in uploads.service.ts - can filter SQL with it instead
 *  of duplicating the owner-type list. */
export const RELOCATABLE_OWNER_TYPES_LIST: readonly UploadOwnerType[] = [
  'dg_circuit_document',
  'formal_request_document',
  'preliminary_evaluation_form',
  'payment_invoice',
  'payment_proof',
  'meeting_report',
  'phase_closure_document',
  'certificate_document',
];

const RELOCATABLE_OWNER_TYPES: ReadonlySet<UploadOwnerType> = new Set(RELOCATABLE_OWNER_TYPES_LIST);

export function isRelocatableOwnerType(ownerType: string): ownerType is UploadOwnerType {
  return RELOCATABLE_OWNER_TYPES.has(ownerType as UploadOwnerType);
}

/** Injectable lookups, one per owner type that needs a join - kept as plain
 *  functions so tests can supply fixtures without a database. */
export interface StorageContextDeps {
  dgCircuitDocument: (id: number) => Promise<{ entityType: 'intake_request' | 'formal_request_letter'; reference: string } | undefined>;
  formalRequestDocument: (id: number) => Promise<{ slot: string; reference: string } | undefined>;
  preliminaryEvaluationForm: (id: number) => Promise<{ reference: string } | undefined>;
  payment: (id: number) => Promise<{ reference: string; phaseCode: PhaseFolderCode } | undefined>;
  meetingReport: (id: number) => Promise<{ reference: string; phaseCode: PhaseFolderCode } | undefined>;
  phaseClosure: (id: number) => Promise<{ reference: string; phaseCode: PhaseFolderCode } | undefined>;
  certificate: (id: number) => Promise<{ reference: string } | undefined>;
}

export function defaultStorageContextDeps(executor: DbExecutor = db): StorageContextDeps {
  return {
    dgCircuitDocument: async (id) => {
      const [row] = await executor
        .select({ entityType: dgCircuitDocuments.entityType, reference: requests.reference })
        .from(dgCircuitDocuments)
        .innerJoin(requests, eq(requests.id, dgCircuitDocuments.requestId))
        .where(eq(dgCircuitDocuments.id, id));
      return row;
    },
    formalRequestDocument: async (id) => {
      const [row] = await executor
        .select({ slot: formalRequestDocuments.slot, reference: requests.reference })
        .from(formalRequestDocuments)
        .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(eq(formalRequestDocuments.id, id));
      return row;
    },
    preliminaryEvaluationForm: async (id) => {
      const [row] = await executor
        .select({ reference: requests.reference })
        .from(preliminaryEvaluationForms)
        .innerJoin(phases, eq(phases.id, preliminaryEvaluationForms.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(eq(preliminaryEvaluationForms.id, id));
      return row;
    },
    payment: async (id) => {
      const [row] = await executor
        .select({ reference: requests.reference, phaseCode: phases.phaseCode })
        .from(payments)
        .innerJoin(phases, eq(phases.id, payments.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(eq(payments.id, id));
      return row;
    },
    meetingReport: async (id) => {
      const [row] = await executor
        .select({ reference: requests.reference, phaseCode: phases.phaseCode })
        .from(meetings)
        .innerJoin(phases, eq(phases.id, meetings.phaseId))
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(eq(meetings.id, id));
      return row;
    },
    phaseClosure: async (id) => {
      const [row] = await executor
        .select({ reference: requests.reference, phaseCode: phases.phaseCode })
        .from(phases)
        .innerJoin(requests, eq(requests.id, phases.requestId))
        .where(eq(phases.id, id));
      return row;
    },
    certificate: async (id) => {
      const [row] = await executor
        .select({ reference: requests.reference })
        .from(certificates)
        .innerJoin(requests, eq(requests.id, certificates.requestId))
        .where(eq(certificates.id, id));
      return row;
    },
  };
}

/** Resolves {requestReference, phaseFolder, categorySlug} for a linked
 *  owner, or null when the owner type is excluded from relocation
 *  (document_template, report) or the row cannot be found (already deleted,
 *  bad id - relocation callers treat null as "do nothing, log it"). */
export async function resolveStorageContext(
  ownerType: UploadOwnerType,
  ownerId: number,
  deps: StorageContextDeps = defaultStorageContextDeps()
): Promise<StorageContext | null> {
  switch (ownerType) {
    case 'document_template':
    case 'report':
      return null;

    case 'dg_circuit_document': {
      const row = await deps.dgCircuitDocument(ownerId);
      if (!row) return null;
      const phase: PhaseFolderCode = row.entityType === 'intake_request' ? 'M1' : 'M4';
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS[phase], categorySlug: 'circuit-dg' };
    }

    case 'formal_request_document': {
      const row = await deps.formalRequestDocument(ownerId);
      if (!row) return null;
      return {
        requestReference: row.reference,
        phaseFolder: PHASE_FOLDERS.M4,
        categorySlug: `formal-documents/${row.slot}`,
      };
    }

    case 'preliminary_evaluation_form': {
      const row = await deps.preliminaryEvaluationForm(ownerId);
      if (!row) return null;
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS.M3, categorySlug: 'preliminary-evaluation' };
    }

    case 'payment_invoice':
    case 'payment_proof': {
      const row = await deps.payment(ownerId);
      if (!row) return null;
      const categorySlug = ownerType === 'payment_invoice' ? 'payment-invoices' : 'payment-proofs';
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS[row.phaseCode], categorySlug };
    }

    case 'meeting_report': {
      const row = await deps.meetingReport(ownerId);
      if (!row) return null;
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS[row.phaseCode], categorySlug: 'meeting-reports' };
    }

    case 'phase_closure_document': {
      const row = await deps.phaseClosure(ownerId);
      if (!row) return null;
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS[row.phaseCode], categorySlug: 'phase-closure' };
    }

    case 'certificate_document': {
      const row = await deps.certificate(ownerId);
      if (!row) return null;
      return { requestReference: row.reference, phaseFolder: PHASE_FOLDERS.M7, categorySlug: 'certificates' };
    }

    default:
      return null;
  }
}

/** Pure - the canonical dossier storage key, reusing the staging key's UUID
 *  filename (and extension) unchanged. Never re-randomizes on move. */
export function computeDossierStorageKey(context: StorageContext, stagingStorageKey: string): string {
  const filename = stagingStorageKey.split('/').pop();
  if (!filename) throw new Error('STORAGE_KEY_INVALID');
  return [
    'dossiers',
    context.requestReference,
    context.phaseFolder,
    ...context.categorySlug.split('/'),
    filename,
  ].join('/');
}
