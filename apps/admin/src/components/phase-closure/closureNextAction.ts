import { OPERATIONAL_OWNERS, type NextActionOwner, type OperationalState, type PhaseClosureState } from '@aidn/shared';

export interface ClosureNextAction {
  title: string;
  description: string;
  state: OperationalState;
  owner: NextActionOwner;
}

/** WORKFLOW-FOUNDATION-1B - once the business work is done, only the closure
 *  courrier keeps an M3/M4/M5 phase open: the phase page's next action is
 *  then the courrier's (same wording as the Demandes cockpit). null while
 *  the phase still has substantive work, or once it is closed. */
export function closureNextAction(state: PhaseClosureState | null): ClosureNextAction | null {
  if (!state || state.phaseStatus !== 'open') return null;
  if (state.closure?.status === 'submitted') {
    return {
      title: 'Courrier de clôture à mettre en circuit',
      description: 'Le courrier de clôture est déposé : la Réception l’imprime puis le met en circuit DG.',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.reception,
    };
  }
  if (state.closure?.status === 'in_signature_circuit') {
    return {
      title: 'Retour DG du courrier de clôture attendu',
      description: 'Le courrier de clôture est dans le circuit DG. La phase sera clôturée à son retour signé.',
      state: 'waiting',
      owner: OPERATIONAL_OWNERS.assistantDg,
    };
  }
  if (!state.closure && state.readiness?.ready) {
    return {
      title: 'Courrier de clôture à déposer',
      description: 'Les conditions de la phase sont réunies. Le Chef de service DN dépose le courrier de clôture.',
      state: 'action_required',
      owner: OPERATIONAL_OWNERS.dnSupervisor,
    };
  }
  return null;
}
