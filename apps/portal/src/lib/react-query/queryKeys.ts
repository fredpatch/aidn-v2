export type PhaseCode = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

export const queryKeys = {
  requests: {
    all: () => ['requests'] as const,
    mine: () => ['requests', 'mine'] as const,
    /** The applicant's required actions across dossiers (GET /applicant/actions). */
    actions: () => ['requests', 'actions'] as const,
    /** One phase bundle of one dossier (M3 préliminaire ... M7 délivrance). */
    phase: (requestId: number, code: PhaseCode) => ['requests', requestId, 'phase', code] as const,
  },
  meetings: {
    all: () => ['meetings'] as const,
    mine: () => ['meetings', 'mine'] as const,
  },
};
