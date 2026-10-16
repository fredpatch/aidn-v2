import { OPERATIONAL_OWNERS } from '@aidn/shared';
import type { CourrierTask } from '../lib/api/courrier-tasks';

export const courrier = (over: Partial<CourrierTask> = {}): CourrierTask => ({
  id: 'formal_request_letter:1', requestId: 1, requestReference: 'DEM-1', organisationName: 'OMA 1',
  bucket: 'to_print', state: 'action_required', owner: OPERATIONAL_OWNERS.reception, actionKey: 'print_for_dg',
  blockReason: null, urgency: 'normal', stepSince: '2026-10-15T09:00:00.000Z', dueAt: null,
  dossierClosed: false, dossierStatus: 'in_progress', source: 'formal_request_letter', requestType: 'issuance',
  applicantName: 'Jean', circuitDocumentId: 1, circuitStatus: 'submitted', circuitStep: 'deposited',
  fileUrl: '/api/files/1', mimeType: 'application/pdf', depositedAt: '2026-10-15T09:00:00.000Z',
  signatureSentAt: null, signedAt: null, pendingReviewAt: null, availableActions: ['print', 'confirm_signature_circuit'],
  signatureWorkingDays: null, signatureLate: false, ...over,
});
