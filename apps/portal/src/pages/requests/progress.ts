import type { PhaseCode } from '../../lib/react-query/queryKeys';
import type { RequestView } from '../../lib/api/requests.types';
import type { PhaseTone } from '../../components/request/PhaseSummaryCard';

/** The five applicant-visible phases, in workflow order. */
export const PHASES: ReadonlyArray<{ code: PhaseCode; label: string; shortLabel: string }> = [
  { code: 'M3', label: 'Phase préliminaire', shortLabel: 'Préliminaire' },
  { code: 'M4', label: 'Demande formelle', shortLabel: 'Formelle' },
  { code: 'M5', label: 'Évaluation approfondie', shortLabel: 'Évaluation' },
  { code: 'M6', label: 'Démonstration / inspection', shortLabel: 'Inspection' },
  { code: 'M7', label: 'Délivrance du certificat', shortLabel: 'Délivrance' },
];

export type PhaseStage = 'upcoming' | 'loading' | 'error' | 'current' | 'closed';

export interface PhasePresentation {
  title: string;
  description: string;
  tone: PhaseTone;
}

/** What the parent knows about one phase after its query settled. */
export interface PhaseSnapshot {
  enabled: boolean;
  isLoading: boolean;
  loadFailed: boolean;
  /** null when the bundle is not loaded or the phase is not opened yet. */
  phaseStatus: string | null;
  presentation: PhasePresentation | null;
  summary: string | null;
}

export interface PhaseProgressItem {
  code: PhaseCode;
  label: string;
  shortLabel: string;
  stage: PhaseStage;
  presentation: PhasePresentation | null;
  summary: string | null;
}

export function phaseStage(snapshot: PhaseSnapshot): PhaseStage {
  if (!snapshot.enabled) return 'upcoming';
  if (snapshot.loadFailed) return 'error';
  if (snapshot.isLoading) return 'loading';
  if (!snapshot.phaseStatus) return 'upcoming';
  return snapshot.phaseStatus === 'closed' ? 'closed' : 'current';
}

export function buildProgressItems(snapshots: Record<PhaseCode, PhaseSnapshot>): PhaseProgressItem[] {
  return PHASES.map((phase) => {
    const snapshot = snapshots[phase.code];
    return {
      ...phase,
      stage: phaseStage(snapshot),
      presentation: snapshot.presentation,
      summary: snapshot.summary,
    };
  });
}

/** The request has left the DG signature circuit and reached the DN. */
export function isIntakeDone(request: Pick<RequestView, 'status' | 'circuitStatus'>): boolean {
  return request.circuitStatus === 'pending_review' || request.status === 'in_progress';
}

export interface BannerContent {
  kind: 'action' | 'waiting';
  eyebrow: string;
  title: string;
  description: string;
}

const INTAKE_BANNERS: Record<string, { title: string; description: string }> = {
  submitted: {
    title: 'Demande déposée',
    description: "Votre demande va suivre le circuit de signature de l'ANAC. Vous pouvez encore l'annuler.",
  },
  in_signature_circuit: {
    title: 'Demande en signature',
    description: "Votre demande suit le circuit de signature interne de l'ANAC.",
  },
  signed: {
    title: 'Demande signée',
    description: 'Votre demande signée va être transmise à la Direction de la Navigabilité.',
  },
  pending_review: {
    title: 'Transmise à la Direction de la Navigabilité',
    description: 'Le traitement de votre dossier commencera par la phase préliminaire.',
  },
};

const WAITING = "En attente de l'ANAC";

/**
 * The single "what now" message at the top of the dossier. Derived from the
 * most advanced open phase so it always matches that phase's own summary card.
 * Returns null while phases are still loading (avoids a flicker) or when a
 * load error leaves no reliable state - the failing section shows its error.
 */
export function buildBanner(
  request: Pick<RequestView, 'status' | 'circuitStatus'>,
  items: PhaseProgressItem[],
): BannerContent | null {
  if (items.some((item) => item.stage === 'loading')) return null;

  const current = [...items].reverse().find((item) => item.stage === 'current');
  if (current?.presentation) {
    const isAction = current.presentation.tone === 'warning';
    return {
      kind: isAction ? 'action' : 'waiting',
      eyebrow: isAction ? 'Action requise' : WAITING,
      title: current.presentation.title,
      description: current.presentation.description,
    };
  }

  if (items.some((item) => item.stage === 'error')) return null;

  const lastClosed = [...items].reverse().find((item) => item.stage === 'closed');
  if (lastClosed) {
    return {
      kind: 'waiting',
      eyebrow: WAITING,
      title: `${lastClosed.label} : étape clôturée`,
      description: "L'ANAC prépare l'ouverture de l'étape suivante de votre dossier.",
    };
  }

  const intake = INTAKE_BANNERS[request.circuitStatus ?? ''];
  if (!intake) return null;
  return { kind: 'waiting', eyebrow: WAITING, ...intake };
}
