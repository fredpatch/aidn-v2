import { expectsPaymentProof, type NextActionOwner, type OperationalState } from '@aidn/shared';

/** SESSION1-UX-1 §7.2 - admin copy of the API cockpit OWNERS
 *  (apps/api/src/modules/requests/cockpit-next-action.ts). staff.roles copies
 *  the requireRole(...) list of the route performing the action. */
export const DN_OWNER: NextActionOwner = { kind: 'staff', label: 'DN', roles: ['dn_agent', 'dn_supervisor', 'SU'] };
export const RECEPTION_OWNER: NextActionOwner = {
  kind: 'staff',
  label: 'Réception',
  roles: ['assistant_dg', 'reception', 'SU'],
};
export const ASSISTANT_DG_OWNER: NextActionOwner = {
  kind: 'staff',
  label: 'Assistant DG',
  roles: ['assistant_dg', 'reception', 'SU'],
};
export const FINANCE_OWNER: NextActionOwner = { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] };
export const INSPECTION_OWNER: NextActionOwner = {
  kind: 'staff',
  label: 'Cellule Inspection',
  roles: ['r3_agent', 'SU'],
};
export const APPLICANT_OWNER: NextActionOwner = { kind: 'applicant', label: 'Postulant' };

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
      title: 'Quittance attendue du postulant',
      description: 'Le postulant doit déposer sa quittance de paiement depuis le portail.',
      state: 'waiting',
      owner: APPLICANT_OWNER,
    };
  }
  return { title: 'Paiement à valider', description: validateDescription, state: 'action_required', owner: FINANCE_OWNER };
}
