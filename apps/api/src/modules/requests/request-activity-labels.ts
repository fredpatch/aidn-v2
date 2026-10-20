import { PHASE_LABELS } from './request-labels.js';

/** DASH-ACTIVITY-LABELS-1 - how a dossier audit event reads, for every screen
 *  that shows dossier history (Demandes reading pane, dashboard recent
 *  activity). Pure presentation: which events belong to a dossier stays
 *  decided by audit_logs.request_id (modules/auth/audit-request.ts). */

export type RequestActivityTone = 'info' | 'success' | 'warning' | 'danger';

export interface RequestActivityPresentation {
  title: string;
  tone: RequestActivityTone;
}

/** D3a - French titles and tones of the dossier events, all phases (audit
 *  actions linked to a request, modules/auth/audit-request.ts). The source of truth. */
export const ACTIVITY_LABELS: Record<string, RequestActivityPresentation> = {
  REQUEST_SUBMITTED: { title: 'Demande déposée', tone: 'info' },
  REQUEST_CANCELLED: { title: 'Demande annulée', tone: 'danger' },
  REQUEST_COMPLETED: { title: 'Dossier terminé', tone: 'success' },
  DG_CIRCUIT_SENT_TO_SIGNATURE: { title: 'Demande mise en circuit DG', tone: 'warning' },
  DG_CIRCUIT_SIGNED: { title: 'Demande signée', tone: 'success' },
  DG_CIRCUIT_SIGNED_RETURNED: { title: 'Annotation du DG reçue', tone: 'success' },
  DG_ANNOTATION_RETURNED: { title: 'Annotation du DG reçue', tone: 'success' },
  DN_ANNOTATION_CIRCUIT_CREATED: { title: 'À transmettre au Directeur DN', tone: 'info' },
  DN_ANNOTATION_SENT_TO_DIRECTOR: { title: 'Dossier en circuit Directeur DN', tone: 'warning' },
  DN_ANNOTATION_RETURNED: { title: 'Annotation du Directeur DN reçue', tone: 'success' },
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
  // SESSION1-MEET-2 - the applicant's signed copy (one upload per meeting).
  MEETING_SIGNED_REPORT_SUBMITTED: { title: 'Compte rendu signé transmis par le postulant', tone: 'info' },
  MEETING_HELD: { title: 'Réunion tenue', tone: 'success' },
  MEETING_NO_SHOW: { title: 'Réunion : absence du postulant', tone: 'warning' },
  MEETING_FILE_CANCELLED: { title: 'Réunion : dossier annulé', tone: 'danger' },
  MEETING_CONFIRMED_BY_APPLICANT: { title: 'Rendez-vous confirmé par le postulant', tone: 'success' },
  MEETING_ALTERNATE_PROPOSED: { title: 'Nouvelle date proposée par le postulant', tone: 'warning' },
  MEETING_ALTERNATE_ACCEPTED: { title: 'Date proposée acceptée', tone: 'success' },
  MEETING_ALTERNATE_REFUSED: { title: 'Date proposée refusée', tone: 'warning' },
  MEETING_CONFIRMED_BY_DN: { title: 'Rendez-vous confirmé au nom du postulant', tone: 'info' },
  SITE_VISIT_HELD: { title: 'Visite sur site tenue', tone: 'success' },
  INSPECTION_VERDICT_SUBMITTED: { title: 'Avis d’inspection rendu', tone: 'success' },
  CERTIFICATE_CREATED: { title: 'Certificat créé', tone: 'info' },
  CERTIFICATE_DOCUMENT_GENERATED: { title: 'Certificat généré', tone: 'info' },
  CERTIFICATE_FIELDS_UPDATED: { title: 'Certificat mis à jour', tone: 'info' },
  CERTIFICATE_TYPE_OVERRIDDEN: { title: 'Type de certificat modifié', tone: 'warning' },
  CERTIFICATE_SIGNED_RETURN_REGISTERED: { title: 'Certificat signé enregistré', tone: 'success' },
  CERTIFICATE_STATUS_CHANGED: { title: 'Statut du certificat modifié', tone: 'info' },
};

/** A dossier event this catalog does not name yet: visible, never as its raw audit code. */
export const UNKNOWN_DOSSIER_ACTIVITY: RequestActivityPresentation = {
  title: 'Activité du dossier mise à jour',
  tone: 'info',
};

const MEETING_UPDATED: RequestActivityPresentation = { title: 'Réunion mise à jour', tone: 'info' };

/** Whether the catalog names this action (exactly, or as a meeting status). */
export function isCataloguedRequestActivity(action: string): boolean {
  return Object.hasOwn(ACTIVITY_LABELS, action) || action.startsWith('MEETING_');
}

/** Title and tone of a dossier event. Phase events name the phase
 *  (« Phase ouverte - Demande formelle »); the audit module is the phase code
 *  for those actions, and an unknown module is simply left out. */
export function resolveRequestActivityPresentation(action: string, module?: string | null): RequestActivityPresentation {
  const known = Object.hasOwn(ACTIVITY_LABELS, action) ? ACTIVITY_LABELS[action] : undefined;
  if (known && (action === 'PHASE_OPENED' || action === 'PHASE_CLOSED')) {
    const phase = module && Object.hasOwn(PHASE_LABELS, module) ? PHASE_LABELS[module] : undefined;
    return phase ? { ...known, title: `${known.title} - ${phase}` } : known;
  }
  if (known) return known;
  if (action.startsWith('MEETING_')) return MEETING_UPDATED;
  return UNKNOWN_DOSSIER_ACTIVITY;
}
