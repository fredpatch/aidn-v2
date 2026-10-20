import { formatCalendarDuration } from '@aidn/shared';
import { auditEntityKind } from '../auth/audit-request.js';
import {
  isCataloguedRequestActivity,
  resolveRequestActivityPresentation,
  type RequestActivityPresentation,
} from '../requests/request-activity-labels.js';
import type { DashboardActivityItem, DashboardMetric } from './dashboard.types.js';

/** DASH-DN-UX-1 - presentation helpers of the dashboard: durations read like
 *  /analytique and /pilotage, and recent activity names the real dossier
 *  (never the audit entity id). Pure: the service passes what it loaded. */

/** Audit actions that are connections, not business activity (matched as
 *  substrings: LOGIN also covers APPLICANT_LOGIN). */
export const TECHNICAL_AUDIT_ACTIONS = ['LOGIN', 'AUTH_REFRESH', 'LOGOUT'];

/** A calendar-day duration metric: the human value plus the raw number, so
 *  no client ever parses « 4.9 j ». */
export function calendarDurationMetricValue(
  averageDays: number | null
): Pick<DashboardMetric, 'value' | 'rawValue' | 'unit'> {
  return { value: formatCalendarDuration(averageDays), rawValue: averageDays, unit: 'calendar_days' };
}

export interface ActivityAuditRow {
  id: number;
  action: string;
  entityId: number | null;
  /** audit_logs.request_id - resolved by logAudit (D3a), backfilled by migration 0005. */
  requestId: number | null;
  details: unknown;
  /** The phase code for PHASE_OPENED / PHASE_CLOSED. */
  module: string | null;
  actor: string | null;
  createdAt: Date;
}

/** What the dashboard already loaded, as id maps (no query per audit row). */
export interface ActivityLookup {
  requestReferenceById: Map<number, string>;
  phaseRequestId: Map<number, number>;
  paymentPhaseId: Map<number, number>;
  meetingPhaseId: Map<number, number>;
  certificateRequestId: Map<number, number>;
  circuitRequestId: Map<number, number>;
  formalDocumentPhaseId: Map<number, number>;
  evaluationDocumentId: Map<number, number>;
}

function entityRequestId(action: string, entityId: number | null, lookup: ActivityLookup): number | undefined {
  if (entityId === null) return undefined;
  const viaPhase = (phaseId: number | undefined) => (phaseId === undefined ? undefined : lookup.phaseRequestId.get(phaseId));
  switch (auditEntityKind(action)) {
    case 'request':
      return entityId;
    case 'phase':
      return lookup.phaseRequestId.get(entityId);
    case 'payment':
      return viaPhase(lookup.paymentPhaseId.get(entityId));
    case 'meeting':
      return viaPhase(lookup.meetingPhaseId.get(entityId));
    case 'certificate':
      return lookup.certificateRequestId.get(entityId);
    case 'circuit':
      return lookup.circuitRequestId.get(entityId);
    case 'formal_document':
      return viaPhase(lookup.formalDocumentPhaseId.get(entityId));
    case 'document_evaluation': {
      const documentId = lookup.evaluationDocumentId.get(entityId);
      return documentId === undefined ? undefined : viaPhase(lookup.formalDocumentPhaseId.get(documentId));
    }
    default:
      // inspection / preliminary_form are not loaded by the dashboard: they
      // rely on audit_logs.request_id; unknown actions are not dossier events.
      return undefined;
  }
}

/** The dossier of an audit event: audit_logs.request_id, then a numeric
 *  details.requestId, then the entity (same action -> entity map as logAudit).
 *  A candidate counts only if that request exists. */
export function resolveActivityRequestId(row: ActivityAuditRow, lookup: ActivityLookup): number | null {
  const fromDetails = (row.details as { requestId?: unknown } | null)?.requestId;
  const candidates = [
    row.requestId,
    typeof fromDetails === 'number' && Number.isInteger(fromDetails) ? fromDetails : null,
    entityRequestId(row.action, row.entityId, lookup),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && lookup.requestReferenceById.has(candidate)) return candidate;
  }
  return null;
}

/** How a dashboard event reads: the same catalog as the Demandes reading
 *  pane (DASH-ACTIVITY-LABELS-1). Connections are not shown, and an action
 *  the catalog does not name is shown only when it belongs to a dossier, as
 *  the neutral « Activité du dossier mise à jour »: an account or system
 *  event never becomes dossier activity, and no raw audit code reaches the UI. */
export function dashboardActivityPresentation(
  row: Pick<ActivityAuditRow, 'action' | 'module'>,
  dossierResolved: boolean
): RequestActivityPresentation | null {
  if (TECHNICAL_AUDIT_ACTIONS.some((technicalAction) => row.action.includes(technicalAction))) return null;
  if (!dossierResolved && !isCataloguedRequestActivity(row.action)) return null;
  return resolveRequestActivityPresentation(row.action, row.module);
}

/** Up to `limit` business events, newest first, each with its dossier when
 *  resolvable. `dossierHref` returns the link the viewer may follow (or
 *  undefined). */
export function buildActivityItems(
  rows: ActivityAuditRow[],
  lookup: ActivityLookup,
  dossierHref: (requestId: number) => string | undefined,
  limit = 3
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [];
  for (const row of rows) {
    if (items.length >= limit) break;
    const requestId = resolveActivityRequestId(row, lookup);
    const presentation = dashboardActivityPresentation(row, requestId !== null);
    if (!presentation) continue;
    items.push({
      id: row.id,
      title: presentation.title,
      requestId,
      requestReference: requestId === null ? null : lookup.requestReferenceById.get(requestId)!,
      href: requestId === null ? undefined : dossierHref(requestId),
      actor: row.actor ?? 'Système',
      createdAt: row.createdAt.toISOString(),
      tone: presentation.tone,
    });
  }
  return items;
}
