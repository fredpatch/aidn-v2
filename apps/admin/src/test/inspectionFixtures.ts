import { OPERATIONAL_OWNERS } from '@aidn/shared';
import type { InspectionQueueItem } from '../lib/api/site-inspection.types';

/** Default: a scheduled visit to record, payment validated, assigned to the viewer. */
export const mission = (over: Partial<InspectionQueueItem> = {}): InspectionQueueItem => ({
  id: 'site_visit:11', requestId: 1, requestReference: 'DEM-CI-01', organisationName: 'OMA 1', bucket: 'to_hold',
  state: 'action_required', owner: OPERATIONAL_OWNERS.inspection, actionKey: 'record_visit_held', blockReason: null,
  urgency: 'normal', stepSince: '2026-10-15T09:00:00.000Z', dueAt: '2026-10-20T08:00:00.000Z', dossierClosed: false,
  dossierStatus: 'in_progress', phaseId: 1, phaseStatus: 'open', requestType: 'issuance',
  payment: {
    id: 1, status: 'validated', invoiceFileUrl: null, invoiceUploadedAt: null, proofFileUrl: null, proofUploadedAt: null,
    validatedAt: '2026-10-14T09:00:00.000Z', rejectionReason: null, rejectionAction: null,
  },
  siteVisit: { id: 11, r3AgentId: 5, scheduledAt: '2026-10-20T08:00:00.000Z', location: 'Hangar 3', status: 'scheduled' },
  inspection: null, assignedToViewer: true, assignedAgentName: 'Agent CI', ...over,
});
