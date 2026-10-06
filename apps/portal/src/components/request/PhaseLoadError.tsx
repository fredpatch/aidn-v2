import { AlertTriangle, RotateCw } from 'lucide-react';

/** Inline replacement for a phase section whose bundle failed to load. */
export function PhaseLoadError({
  phaseLabel,
  onRetry,
  retrying,
}: {
  phaseLabel: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="border-t border-anac-border pt-4 mt-4">
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-anac-danger/30 bg-anac-danger/5 p-4"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-anac-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-anac-navy">{phaseLabel}</p>
            <p className="text-sm text-anac-muted">
              Impossible de charger cette étape. Vérifiez votre connexion puis réessayez.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCw size={13} className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
          {retrying ? 'Chargement...' : 'Réessayer'}
        </button>
      </div>
    </section>
  );
}
