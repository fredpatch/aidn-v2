import { StatusBadge } from '../common/StatusBadge';

/** DOSSIER-CONTEXT-UX-1 - which dossier a treatment screen is about. Data
 *  comes from the dossier-state read (same labels as the Demandes reading
 *  pane); this component only presents it. */
export interface DossierContext {
  reference: string;
  organisationName: string;
  applicantName?: string | null;
  /** Authoritative label from the API, never inferred from phase state. */
  statusLabel?: string | null;
}

interface DossierContextHeaderProps {
  context: DossierContext | null;
  /** Used only for the degraded fallback when the context could not load. */
  requestId?: string;
  loading?: boolean;
}

export function DossierContextHeader({ context, requestId, loading = false }: DossierContextHeaderProps) {
  if (!context) {
    if (loading) {
      return (
        <div className="mt-1 space-y-1.5" aria-busy="true" aria-label="Chargement du dossier">
          <span className="block h-4 w-72 max-w-full animate-pulse rounded bg-slate-200" />
          <span className="block h-3 w-40 animate-pulse rounded bg-slate-100" />
        </div>
      );
    }
    // Degraded: the identity read failed; the screen keeps working.
    return (
      <p className="mt-1 text-sm text-anac-muted" aria-label={`Dossier ${requestId ?? 'non identifié'}`}>
        Dossier {requestId ? `#${requestId}` : 'non identifié'}
      </p>
    );
  }

  const { reference, organisationName, applicantName, statusLabel } = context;
  return (
    <section className="mt-1 min-w-0" aria-label={`Dossier ${reference}${organisationName ? `, ${organisationName}` : ''}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-anac-navy">{reference}</span>
        {organisationName ? (
          <>
            <span className="text-anac-muted" aria-hidden="true">
              ·
            </span>
            <span className="font-medium text-anac-navy">{organisationName}</span>
          </>
        ) : null}
        {statusLabel ? (
          <StatusBadge label={statusLabel} tone="border-anac-border bg-anac-gray text-anac-navy" />
        ) : null}
      </p>
      {applicantName ? <p className="mt-0.5 text-xs text-anac-muted">Postulant : {applicantName}</p> : null}
    </section>
  );
}
