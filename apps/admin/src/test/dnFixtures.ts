import { OPERATIONAL_OWNERS } from '@aidn/shared';
import type { DnAnnotationTask } from '../lib/api/dn-annotation';

/** A Directeur DN circuit item, default: « À transmettre » (to_send). */
export const dnTask = (over: Partial<DnAnnotationTask> = {}): DnAnnotationTask => ({
  id: 'dn_director_annotation:1', requestId: 1, requestReference: 'DEM-DN-01', organisationName: 'OMA 1',
  bucket: 'to_send', state: 'action_required', owner: OPERATIONAL_OWNERS.assistantDn, actionKey: 'send_to_director',
  blockReason: null, urgency: 'normal', stepSince: '2026-10-01T09:00:00.000Z', dueAt: null,
  dossierClosed: false, dossierStatus: 'submitted', requestType: 'issuance', applicantName: 'Jean Test',
  circuitDocumentId: 1, fileUrl: '/api/files/1', mimeType: 'application/pdf', createdAt: '2026-10-01T09:00:00.000Z',
  sentToDirectorAt: null, returnedAt: null, availableActions: ['send_to_director'], directorWorkingDays: null,
  predatesProcess: false, ...over,
});

export const dnWithDirector = (over: Partial<DnAnnotationTask> = {}): DnAnnotationTask =>
  dnTask({
    bucket: 'with_director', state: 'waiting', actionKey: 'record_director_annotation',
    availableActions: ['upload_annotated_return'], sentToDirectorAt: '2026-10-03T09:00:00.000Z',
    stepSince: '2026-10-03T09:00:00.000Z', directorWorkingDays: 2, ...over,
  });

export const dnReturned = (over: Partial<DnAnnotationTask> = {}): DnAnnotationTask =>
  dnTask({
    bucket: 'returned', state: 'done', owner: null, actionKey: 'handed_to_dn', availableActions: [],
    returnedAt: '2026-10-04T09:00:00.000Z', stepSince: '2026-10-04T09:00:00.000Z', ...over,
  });

export const dnInactive = (over: Partial<DnAnnotationTask> = {}): DnAnnotationTask =>
  dnTask({
    bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed',
    dossierClosed: true, dossierStatus: 'rejected', availableActions: [], ...over,
  });
