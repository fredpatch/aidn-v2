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

/**
 * 'interrupted': the phase was still open when the dossier was rejected. The
 * DN leaves the phase row open on rejection, so the dossier status decides.
 */
export type PhaseStage = 'upcoming' | 'loading' | 'error' | 'current' | 'closed' | 'interrupted';

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

export function buildProgressItems(
  snapshots: Record<PhaseCode, PhaseSnapshot>,
  { rejected = false }: { rejected?: boolean } = {},
): PhaseProgressItem[] {
  return PHASES.map((phase) => {
    const snapshot = snapshots[phase.code];
    const stage = phaseStage(snapshot);
    return {
      ...phase,
      stage: rejected && stage === 'current' ? 'interrupted' : stage,
      presentation: snapshot.presentation,
      summary: snapshot.summary,
    };
  });
}

/**
 * The phase the applicant is in now. Business rule: at most one phase is open
 * at a time, so the first open phase is the only one.
 */
export function currentPhase(items: PhaseProgressItem[]): PhaseProgressItem | undefined {
  return items.find((item) => item.stage === 'current');
}

export const TERMINAL_DOSSIER_STATUSES = ['completed', 'rejected', 'cancelled'];

export function isTerminalDossier(request: Pick<RequestView, 'status'>): boolean {
  return TERMINAL_DOSSIER_STATUSES.includes(request.status);
}

/** The request has left the DG signature circuit and reached the DN. */
export function isIntakeDone(request: Pick<RequestView, 'status' | 'circuitStatus'>): boolean {
  return (
    request.circuitStatus === 'pending_review' ||
    request.status === 'in_progress' ||
    request.status === 'completed' ||
    request.status === 'rejected'
  );
}

/** Phases M4-M7 can exist: processing started (and possibly ended). */
export function phasesReachable(request: Pick<RequestView, 'status'>): boolean {
  return ['in_progress', 'completed', 'rejected'].includes(request.status);
}

export interface BannerContent {
  kind: 'action' | 'waiting' | 'done' | 'rejected' | 'cancelled';
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
 * open phase so it always matches that phase's own summary card.
 * Returns null while phases are still loading (avoids a flicker) or when a
 * load error leaves no reliable state - the failing section shows its error.
 */
export function buildBanner(
  request: Pick<RequestView, 'status' | 'circuitStatus' | 'rejectionReason'>,
  items: PhaseProgressItem[],
): BannerContent | null {
  const outcome = buildOutcomeBanner(request, items);
  if (outcome) return outcome;

  if (items.some((item) => item.stage === 'loading')) return null;

  const current = currentPhase(items);
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

const ARCHIVED = 'Ce dossier est archivé. Les documents restent consultables.';

/** Terminal dossiers: the outcome replaces the "what now" message. */
function buildOutcomeBanner(
  request: Pick<RequestView, 'status' | 'rejectionReason'>,
  items: PhaseProgressItem[],
): BannerContent | null {
  switch (request.status) {
    case 'completed': {
      const delivery = items.find((item) => item.code === 'M7');
      return {
        kind: 'done',
        eyebrow: 'Dossier terminé',
        title: delivery?.summary ?? 'Traitement terminé',
        description: ARCHIVED,
      };
    }
    case 'rejected':
      return {
        kind: 'rejected',
        eyebrow: 'Dossier rejeté',
        title: 'Votre demande a été rejetée',
        description: request.rejectionReason ? `Motif : ${request.rejectionReason}` : ARCHIVED,
      };
    case 'cancelled':
      return { kind: 'cancelled', eyebrow: 'Demande annulée', title: 'Cette demande a été annulée', description: ARCHIVED };
    default:
      return null;
  }
}
