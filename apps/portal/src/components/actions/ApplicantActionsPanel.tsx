import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { useApplicantActions } from '../../hooks/useApplicantActions';
import { actionCopy, dueLine } from '../../lib/actions/copy';
import { actionHref } from '../../lib/actions/selectors';

/** SESSION1-UX-1 - dashboard "Actions requises": one row per action the API
 *  expects from the applicant, in the server's order (never re-sorted here).
 *  In-app only: no e-mail is sent. */
export function ApplicantActionsPanel() {
  const { actions, error, retry } = useApplicantActions();

  if (error) {
    // Spec §6.5: the error stays inside the « Actions requises » region.
    return (
      <section
        aria-label="Actions requises"
        className="card flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <p role="alert" className="text-anac-danger">
          {error}
        </p>
        <button type="button" className="btn-secondary text-xs" onClick={retry}>
          Réessayer
        </button>
      </section>
    );
  }
  if (actions === null || actions.length === 0) return null;

  return (
    <section aria-label="Actions requises" className="rounded-lg border border-anac-warning/50 bg-anac-warning/10 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <ListChecks size={18} className="text-anac-warning" aria-hidden="true" />
        Actions requises ({actions.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {actions.map((a) => {
          const copy = actionCopy(a);
          const due = dueLine(a);
          return (
            <li
              key={a.id}
              data-urgent={a.urgent || undefined}
              className={`flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3 ${
                a.urgent ? 'border-anac-warning' : 'border-anac-border'
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-anac-navy">{copy.title}</p>
                <p className="text-xs text-anac-text">{copy.description}</p>
                <p className="text-xs text-anac-muted">
                  Dossier {a.requestReference}
                  {due ? ` · ${due}` : ''}
                </p>
              </div>
              <Link to={actionHref(a)} className="btn-primary rounded px-3 py-1.5 text-xs">
                {copy.cta}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
