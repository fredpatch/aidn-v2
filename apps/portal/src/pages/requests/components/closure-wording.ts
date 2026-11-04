/** WORKFLOW-FOUNDATION-1B - an M3/M4/M5 phase whose closure courrier is in
 *  progress at the ANAC. The applicant has nothing to do: neutral wording,
 *  no circuit detail, no staff name. */
export const CLOSURE_IN_PROGRESS = {
  title: 'Clôture administrative en cours',
  description: 'Les étapes de cette phase sont terminées. Sa clôture administrative est en cours.',
  step: 'Clôture administrative en cours',
};

export function closureStepDetail(phase: { status: string; closureInProgress?: boolean } | null | undefined): string {
  if (phase?.status === 'closed') return 'Phase clôturée';
  return phase?.closureInProgress ? CLOSURE_IN_PROGRESS.step : 'Prochaine étape à venir';
}
