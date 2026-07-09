import type { ChecklistItem, PreliminaryBundle } from './types';

export function buildChecklist(bundle: PreliminaryBundle): ChecklistItem[] {
  return [
    {
      label: 'Reunion planifiee',
      done: !!bundle.meeting,
    },
    {
      label: 'Reunion tenue ou absence constatee',
      done: !!bundle.meeting && bundle.meeting.status !== 'scheduled',
    },
    {
      label: 'Compte-rendu envoye',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    {
      label: 'Declaration mise a disposition',
      done: !!bundle.evaluation?.madeAvailableAt,
    },
    {
      label: 'Declaration retournee par le postulant',
      done: !!bundle.evaluation?.submittedFileUrl,
    },
    {
      label: 'Phase cloturee',
      done: bundle.phase?.status === 'closed',
    },
  ];
}

export function isMeetingResolved(bundle: PreliminaryBundle | null): boolean {
  return !!bundle?.meeting && bundle.meeting.status !== 'scheduled';
}

export function isDeclarationSubmitted(bundle: PreliminaryBundle | null): boolean {
  return !!bundle?.evaluation?.submittedFileUrl;
}

export function canClosePreliminaryPhase(bundle: PreliminaryBundle | null): boolean {
  return isMeetingResolved(bundle) && isDeclarationSubmitted(bundle);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}
