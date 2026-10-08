/** K7b - a closed dossier (rejected, cancelled or completed) is read-only.
 *
 *  Decision (Fred, 2026-10-08): only viewing and downloading stay possible;
 *  the API refuses every workflow action since K7a (409 DOSSIER_CLOSED). The
 *  phase pages now say so up front: a banner explains why, and each card
 *  hides its actions (document links stay).
 *
 *  The state comes from GET /phases/requests/:id/dossier-state (any staff
 *  role, like phases-summary). While it loads, or if it fails, the page stays
 *  as before: the API guard remains the safety net. */
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { fetchDossierState } from '../../../lib/api/phases.api';
import type { DossierState } from '../../../lib/api/phases.types';
import { queryKeys } from '../../../lib/react-query/queryKeys';

const DossierStateContext = createContext<DossierState | null>(null);

export function useDossierState(requestId: string | undefined) {
  const { data } = useQuery({
    queryKey: requestId ? queryKeys.phases.dossierState(requestId) : queryKeys.phases.all,
    queryFn: () => fetchDossierState(requestId!),
    enabled: !!requestId,
  });
  return data ?? null;
}

/** Wraps a phase page (WorkflowCockpit does it; the S5-only and R3-only
 *  views wrap themselves) so its cards can call useDossierReadOnly(). */
export function DossierReadOnlyProvider({
  requestId,
  children,
}: {
  requestId: string | undefined;
  children: ReactNode;
}) {
  const state = useDossierState(requestId);
  return <DossierStateContext.Provider value={state}>{children}</DossierStateContext.Provider>;
}

export function DossierStateValue({ state, children }: { state: DossierState | null; children: ReactNode }) {
  return <DossierStateContext.Provider value={state}>{children}</DossierStateContext.Provider>;
}

/** True when the dossier is closed: the card must not offer any action. */
export function useDossierReadOnly(): boolean {
  return useContext(DossierStateContext)?.closed ?? false;
}

const CLOSED_LABELS: Record<string, string> = {
  rejected: 'rejeté',
  cancelled: 'annulé',
  completed: 'terminé',
};

function formatDay(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString('fr-FR') : null;
}

export function closedDossierTitle(state: DossierState): string {
  const label = CLOSED_LABELS[state.status] ?? 'clos';
  const day = formatDay(state.closedAt);
  return `Dossier ${label}${day ? ` le ${day}` : ''} - consultation uniquement`;
}

/** The banner under the page header. Renders nothing on an open dossier. */
export function ClosedDossierBanner() {
  const state = useContext(DossierStateContext);
  if (!state?.closed) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-slate-700"
    >
      <LockKeyhole size={16} className="mt-0.5 flex-shrink-0 text-slate-500" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">{closedDossierTitle(state)}</p>
        {state.status === 'rejected' && state.rejectionReason && (
          <p className="text-xs text-slate-600">Motif : {state.rejectionReason}</p>
        )}
        <p className="text-xs text-slate-600">
          {state.status === 'completed'
            ? 'Le certificat a été délivré. Les informations et les documents restent consultables et téléchargeables.'
            : "Les informations et les documents restent consultables et téléchargeables. Aucune action n'est possible sur ce dossier."}
        </p>
      </div>
    </div>
  );
}

/** Replaces a card's action area (form, buttons) on a closed dossier. */
export function ClosedDossierNote({ children = 'Aucune action - dossier clos.' }: { children?: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {children}
    </p>
  );
}
