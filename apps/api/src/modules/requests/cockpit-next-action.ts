/** SESSION1-UX-1 §7.4 - Demandes cockpit next action: who must act next
 *  (typed owner), the operational state, and the D9 open-phase resolution.
 *  Pure: the service computes the facts from its batch rows (no N+1). Staff
 *  wording stays server-side; the applicant's own wording is the portal's (D2). */
import type { ApplicantAction, NextActionOwner, OperationalState } from '@aidn/shared';
import type { RequestCockpitPhase } from './requests.types.js';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'] as const;

/** staff.roles copies the requireRole(...) list of the route performing the action. */
export const OWNERS = {
  dn: { kind: 'staff', label: 'DN', roles: [...DN_ROLES] },
  reception: { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] },
  assistantDg: { kind: 'staff', label: 'Assistant DG', roles: ['assistant_dg', 'reception', 'SU'] },
  assistantDn: { kind: 'staff', label: 'Assistante DN', roles: ['assistant_dn', 'SU'] },
  finance: { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] },
  inspection: { kind: 'staff', label: 'Cellule Inspection', roles: ['r3_agent', 'SU'] },
  applicant: { kind: 'applicant', label: 'Postulant' },
} satisfies Record<string, NextActionOwner>;

export function phaseHref(phaseCode: string, requestId: number): string {
  if (phaseCode === 'M3') return `/demandes/${requestId}/phase-preliminaire`;
  if (phaseCode === 'M4') return `/demandes/${requestId}/phase-formelle`;
  if (phaseCode === 'M5') return `/demandes/${requestId}/evaluation-approfondie`;
  if (phaseCode === 'M6') return `/demandes/${requestId}/demonstration-inspection`;
  return `/demandes/${requestId}/delivrance`;
}

export interface CockpitFacts {
  requestId: number;
  /** Effective request status. */
  status: string;
  /** Intake DG circuit. */
  circuitStatus: string | null;
  dnCircuitStatus: string | null;
  /** isPreliminaryOpenable(status, dnCircuitStatus). */
  preliminaryOpenable: boolean;
  phases: RequestCockpitPhase[];
  /** This dossier's applicant actions, server order. */
  applicantActions: ApplicantAction[];
  /** A live M3/M4 meeting of the open phase awaits the DN (counter-proposal). */
  meetingAwaitingDn: boolean;
  /** Submitted M4 documents with no evaluation or a null verdict. */
  m5DocumentsAwaitingVerdict: number;
  openPhasePayment: { status: string; invoiceFileUrl: string | null } | null;
  m6VisitHeldWithoutVerdict: boolean;
  /** M4 letter circuit or M3 pre_evaluation circuit of the open phase. */
  openPhaseCircuitStatus: string | null;
}

export interface CockpitNextAction {
  nextActionLabel: string;
  nextActionDescription: string;
  nextActionHref: string | null;
  nextActionTone: 'info' | 'warning' | 'success' | 'danger';
  nextActionState: OperationalState;
  nextActionOwner: NextActionOwner | null;
  canStartPreliminary: boolean;
}

/** Staff wording for "the applicant is awaited" - the portal wording is separate (D2). */
function awaitedFromApplicant(action: ApplicantAction): string {
  switch (action.key) {
    case 'meeting_confirmation':
      return 'Confirmation du rendez-vous attendue du postulant.';
    case 'preliminary_declaration':
      return 'Déclaration de pré-évaluation attendue du postulant.';
    case 'formal_letter':
      return 'Lettre officielle attendue du postulant.';
    case 'formal_missing_documents':
      return `${action.count ?? 0} pièce(s) attendue(s) du postulant.`;
    case 'payment_proof':
      return action.variant === 'after_rejection'
        ? `Nouvelle quittance attendue du postulant (${action.phaseCode}).`
        : `Quittance de paiement attendue du postulant (${action.phaseCode}).`;
    case 'document_correction':
      return `${action.count ?? 0} document(s) à corriger par le postulant.`;
    case 'certificate_collection':
      return 'Retrait du certificat attendu (en personne).';
    case 'signed_meeting_report':
      return 'Compte rendu signé attendu du postulant.';
  }
}

function result(
  label: string,
  description: string,
  href: string | null,
  tone: CockpitNextAction['nextActionTone'],
  state: OperationalState,
  owner: NextActionOwner | null,
  canStartPreliminary = false
): CockpitNextAction {
  return {
    nextActionLabel: label,
    nextActionDescription: description,
    nextActionHref: href,
    nextActionTone: tone,
    nextActionState: state,
    nextActionOwner: owner,
    canStartPreliminary,
  };
}

export function resolveCockpitNextAction(facts: CockpitFacts): CockpitNextAction {
  const { requestId, status, circuitStatus, dnCircuitStatus, preliminaryOpenable, phases } = facts;

  if (status === 'completed') {
    return result(
      'Workflow terminé',
      'Dossier clos : consultation et téléchargement uniquement.',
      phaseHref('M7', requestId),
      'success',
      'done',
      null
    );
  }
  if (status === 'rejected' || status === 'cancelled') {
    // D2 - K7: a closed dossier stays viewable. Link to the last phase that
    // was started (open or closed); none started (closed during the DG
    // circuit) means there is no phase page to open.
    const lastStarted = [...phases].reverse().find((phase) => phase.status !== 'not_started');
    return result(
      status === 'rejected' ? 'Dossier rejeté' : 'Dossier annulé',
      lastStarted
        ? 'Dossier clos : consultation et téléchargement uniquement.'
        : 'Dossier clos avant la phase préliminaire : aucune page de phase à consulter.',
      lastStarted?.href ?? null,
      'danger',
      'done',
      null
    );
  }
  if (circuitStatus === 'submitted') {
    return result(
      'Impression et mise en circuit DG',
      'Le dossier attend impression et mise en circuit DG.',
      null,
      'warning',
      'action_required',
      OWNERS.reception
    );
  }
  if (circuitStatus === 'in_signature_circuit') {
    return result(
      'Annotation du DG attendue',
      'Le dossier est dans le circuit de signature du DG. La DN le suit en lecture seule.',
      null,
      'warning',
      'waiting',
      OWNERS.assistantDg
    );
  }
  if (circuitStatus === 'pending_review' && (status === 'submitted' || status === 'pending_review') && !preliminaryOpenable) {
    // The Directeur DN signs on paper (external); the next system step is the
    // Assistante DN's, hence the staff owner with the external actor described (§7.2).
    return dnCircuitStatus === 'in_signature_circuit'
      ? result(
          'En attente du retour du Directeur DN',
          'Le dossier est chez le Directeur DN (circuit papier). L’Assistante DN enregistrera le retour annoté.',
          null,
          'warning',
          'waiting',
          OWNERS.assistantDn
        )
      : result(
          'À transmettre au Directeur DN',
          'Annotation du DG reçue. L’Assistante DN doit transmettre le dossier au Directeur DN.',
          null,
          'warning',
          'action_required',
          OWNERS.assistantDn
        );
  }
  if (preliminaryOpenable) {
    return result(
      'Ouvrir la phase préliminaire',
      'L’annotation du Directeur DN est reçue. La DN peut démarrer le traitement.',
      phaseHref('M3', requestId),
      'info',
      'action_required',
      OWNERS.dn,
      true
    );
  }

  const open = phases.find((phase) => phase.status === 'open');
  if (open) return resolveOpenPhase(open, facts);

  const lastClosed = [...phases].reverse().find((phase) => phase.status === 'closed');
  if (lastClosed) {
    return result(
      'Ouvrir la phase suivante',
      'La dernière phase est clôturée. La DN peut poursuivre le circuit.',
      lastClosed.href,
      'info',
      'action_required',
      OWNERS.dn
    );
  }
  return result(
    'À vérifier',
    'Le dossier ne correspond pas encore à une action DN standard.',
    null,
    'warning',
    'information',
    OWNERS.dn
  );
}

/** D9 - first match per open phase. */
function resolveOpenPhase(open: RequestCockpitPhase, facts: CockpitFacts): CockpitNextAction {
  const href = open.href;

  // 0. DN work pending in parallel: the DN never reads « en attente » while it has something to do.
  if (facts.meetingAwaitingDn) {
    return result(
      'Contre-proposition à traiter',
      'Le postulant a proposé une autre date. La DN doit l’accepter ou la refuser.',
      href,
      'info',
      'action_required',
      OWNERS.dn
    );
  }
  if (open.phaseCode === 'M5' && facts.m5DocumentsAwaitingVerdict > 0) {
    return result(
      `Évaluer ${facts.m5DocumentsAwaitingVerdict} document(s)`,
      'Des documents déposés ou redéposés attendent l’avis de la DN.',
      href,
      'info',
      'action_required',
      OWNERS.dn
    );
  }

  // 1. Applicant expected (the shared policy). The signed meeting report never blocks (MEET-2).
  const awaited = facts.applicantActions.find(
    (action) => action.phaseCode === open.phaseCode && action.key !== 'signed_meeting_report'
  );
  if (awaited) {
    return result('En attente du postulant', awaitedFromApplicant(awaited), href, 'warning', 'waiting', OWNERS.applicant);
  }

  // 2. Finance.
  if (facts.openPhasePayment && facts.openPhasePayment.invoiceFileUrl === null) {
    return result(
      'Facture à émettre',
      'La facture de la phase doit être émise par le service Finance.',
      href,
      'warning',
      'action_required',
      OWNERS.finance
    );
  }
  if (facts.openPhasePayment?.status === 'pending_validation') {
    return result(
      'Quittance à valider',
      'La quittance du postulant doit être validée par le service Finance.',
      href,
      'warning',
      'action_required',
      OWNERS.finance
    );
  }

  // 3. Cellule Inspection.
  if (facts.m6VisitHeldWithoutVerdict) {
    return result(
      'Avis d’inspection attendu',
      'La visite est tenue. La Cellule Inspection doit rendre son avis.',
      href,
      'warning',
      'action_required',
      OWNERS.inspection
    );
  }

  // 4. DG circuits inside a phase (M4 letter, M3 declaration).
  if (facts.openPhaseCircuitStatus === 'submitted') {
    return result(
      'Impression et mise en circuit DG',
      'Le document de la phase attend impression et mise en circuit DG.',
      href,
      'warning',
      'action_required',
      OWNERS.reception
    );
  }
  if (facts.openPhaseCircuitStatus === 'in_signature_circuit' || facts.openPhaseCircuitStatus === 'signed') {
    return result(
      'Circuit DG en cours',
      'Le document de la phase est dans le circuit de signature du DG.',
      href,
      'warning',
      'waiting',
      OWNERS.assistantDg
    );
  }

  // 5. Otherwise the DN works the phase.
  return result(
    `Traiter ${open.label}`,
    'La DN poursuit le traitement de la phase ouverte.',
    href,
    'info',
    'action_required',
    OWNERS.dn
  );
}
