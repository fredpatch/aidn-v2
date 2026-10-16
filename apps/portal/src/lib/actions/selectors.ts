import type { ApplicantAction } from '@aidn/shared';

/** Deep link of an action: its dossier and the anchor of the section to act in. */
export function actionHref(action: ApplicantAction): { pathname: string; hash: string } {
  return { pathname: `/dossiers/${action.requestId}`, hash: `#${action.anchor}` };
}

// The list is ordered by the API: these selectors only filter / pick, never sort.
export function dossierActions(all: readonly ApplicantAction[], requestId: number): ApplicantAction[] {
  return all.filter((a) => a.requestId === requestId);
}

export function topDossierAction(all: readonly ApplicantAction[], requestId: number): ApplicantAction | undefined {
  return all.find((a) => a.requestId === requestId);
}

export function topPhaseAction(
  all: readonly ApplicantAction[],
  requestId: number,
  phaseCode: string,
): ApplicantAction | undefined {
  return all.find((a) => a.requestId === requestId && a.phaseCode === phaseCode);
}
