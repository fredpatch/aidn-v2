/** SESSION1-M1-1 - the intake dossier now crosses two physical circuits before
 *  M3: the DG annotation (intake_request circuit) then the Directeur DN
 *  annotation (dn_director_annotation circuit). Both reuse dg_circuit_status;
 *  its technical names (in_signature_circuit, signed, pending_review) never
 *  reach a screen - they are mapped here. Pure, no database. */

export type IntakeStage =
  | 'dg_to_circuit'
  | 'dg_in_circuit'
  | 'dg_legacy_signed'
  | 'dn_to_send'
  | 'dn_in_circuit'
  | 'dn_returned'
  | 'none';

export const INTAKE_STAGE_LABELS: Record<IntakeStage, string> = {
  dg_to_circuit: 'Déposé',
  dg_in_circuit: 'En circuit DG',
  dg_legacy_signed: 'Signé',
  dn_to_send: 'À transmettre au Directeur DN',
  dn_in_circuit: 'En circuit Directeur DN',
  dn_returned: 'Annotation du Directeur DN reçue',
  none: 'Non initialisé',
};

/** Where an intake dossier stands, from its two circuits (status null = no row). */
export function intakeStage(intakeStatus: string | null, dnStatus: string | null): IntakeStage {
  if (!intakeStatus) return 'none';
  if (intakeStatus === 'submitted') return 'dg_to_circuit';
  if (intakeStatus === 'in_signature_circuit') return 'dg_in_circuit';
  if (intakeStatus === 'signed') return 'dg_legacy_signed';
  // Intake circuit returned (pending_review): the DN circuit decides.
  if (dnStatus === 'pending_review') return 'dn_returned';
  if (dnStatus === 'in_signature_circuit') return 'dn_in_circuit';
  return 'dn_to_send';
}

/** The business gate for opening M3. The DN circuit is authoritative and
 *  requests.status is its projection: if they disagree, M3 stays closed. */
export function isPreliminaryOpenable(requestStatus: string, dnStatus: string | null): boolean {
  return requestStatus === 'pending_review' && dnStatus === 'pending_review';
}

/** The circuits owned by Réception / Assistant DG (courrier inbox, reception
 *  dashboard, DG alert). `dn_director_annotation` is deliberately NOT one of
 *  them: it belongs to Assistante DN and must never surface in those views. */
export const RECEPTION_CIRCUIT_ENTITY_TYPES = [
  'intake_request',
  'formal_request_letter',
  'pre_evaluation',
] as const;
