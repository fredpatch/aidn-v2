import { OPERATIONAL_OWNERS, expectsPaymentProof, type NextActionOwner, type OperationalState } from '@aidn/shared';

/** SESSION1-COCKPIT-1 - the owners come from @aidn/shared (single source). */
export const DN_OWNER: NextActionOwner = OPERATIONAL_OWNERS.dn;
export const RECEPTION_OWNER: NextActionOwner = OPERATIONAL_OWNERS.reception;
export const ASSISTANT_DG_OWNER: NextActionOwner = OPERATIONAL_OWNERS.assistantDg;
export const FINANCE_OWNER: NextActionOwner = OPERATIONAL_OWNERS.finance;
export const INSPECTION_OWNER: NextActionOwner = OPERATIONAL_OWNERS.inspection;
export const APPLICANT_OWNER: NextActionOwner = OPERATIONAL_OWNERS.applicant;

interface OwnedState {
  title: string;
  description: string;
  state: OperationalState;
  owner: NextActionOwner;
}

/** M3 / M4 meeting still `scheduled`: MEET-1 confirmation first (admin is
 *  outside the API literals rule), then the DN resolves it. */
export function scheduledMeetingState(
  meeting: { negotiation: { confirmationStatus: string } },
  phaseLabel: string
): OwnedState {
  const confirmation = meeting.negotiation.confirmationStatus;
  if (confirmation === 'awaiting_applicant') {
    return {
      title: 'Confirmation du rendez-vous attendue',
      description: 'Le postulant doit confirmer ou contre-proposer le créneau de la réunion.',
      state: 'waiting',
      owner: APPLICANT_OWNER,
    };
  }
  if (confirmation === 'awaiting_dn') {
    return {
      title: 'Contre-proposition à traiter',
      description: 'Le postulant a proposé un autre créneau : l’accepter, le refuser ou confirmer à sa place.',
      state: 'action_required',
      owner: DN_OWNER,
    };
  }
  return {
    title: `Réunion ${phaseLabel} à résoudre`,
    description: 'Marquer la réunion comme tenue, absence constatée, reprogrammée ou dossier annulé.',
    state: 'action_required',
    owner: DN_OWNER,
  };
}

/** M5 / M6 / M7 payment not yet validated, invoice already sent. */
export function paymentPendingState(payment: { status: string; invoiceFileUrl: string | null }, validateDescription: string): OwnedState {
  if (expectsPaymentProof(payment)) {
    return {
      title: 'Preuve de paiement attendue du postulant',
      description: 'Le postulant doit déposer sa preuve de paiement depuis le portail.',
      state: 'waiting',
      owner: APPLICANT_OWNER,
    };
  }
  return { title: 'Paiement à valider', description: validateDescription, state: 'action_required', owner: FINANCE_OWNER };
}
