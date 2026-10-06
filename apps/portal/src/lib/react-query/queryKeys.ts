export type PhaseCode = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

export const queryKeys = {
  requests: {
    all: () => ['requests'] as const,
    mine: () => ['requests', 'mine'] as const,
    /** One phase bundle of one dossier (M3 préliminaire ... M7 délivrance). */
    phase: (requestId: number, code: PhaseCode) => ['requests', requestId, 'phase', code] as const,
  },
  meetings: {
    mine: () => ['meetings', 'mine'] as const,
  },
};
