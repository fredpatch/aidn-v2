import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FilePlus2 } from 'lucide-react';
import type { RequestView } from '../../lib/api/requests.types';
import { formatDate } from '../../lib/format';
import { REQUEST_TYPE_LABELS, TERMINAL_STATUSES, labelOf } from '../requests/constants';
import { useMyRequests } from '../requests/hooks/useMyRequests';
import { useDossierProgress } from '../requests/hooks/useDossierProgress';
import { DossierStatusBadge } from '../../components/request/DossierStatusBadge';
import { PageError } from '../../components/layout/PageError';

/** /dossiers - the active dossier first (with its current state), then history. */
export default function DossiersPage() {
  const { requests, error, reload, fetching } = useMyRequests();

  if (error) return <PageError message={error} onRetry={reload} retrying={fetching} />;
  if (requests === null) return <p className="text-anac-muted text-center">Chargement...</p>;

  const active = requests.find((request) => !TERMINAL_STATUSES.includes(request.status));
  const history = requests.filter((request) => request !== active);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Mes dossiers</h1>
          <p className="text-anac-muted text-sm">Suivi de vos demandes d&apos;agrément OMA</p>
        </div>
        {!active && (
          <Link to="/demande" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <FilePlus2 size={14} aria-hidden="true" />
            Déposer une demande
          </Link>
        )}
      </div>

      {active ? (
        <section aria-labelledby="active-title" className="space-y-2">
          <h2 id="active-title" className="text-xs font-semibold text-anac-muted">Dossier en cours</h2>
          <ActiveDossierRow request={active} />
          <p className="text-xs text-anac-muted">
            Un seul dossier peut être en cours à la fois : une nouvelle demande sera possible à sa clôture.
          </p>
        </section>
      ) : (
        requests.length === 0 && (
          <div className="card text-sm text-anac-muted">
            Vous n&apos;avez encore déposé aucune demande.
          </div>
        )
      )}

      {history.length > 0 && (
        <section aria-labelledby="history-title" className="space-y-2">
          <h2 id="history-title" className="text-xs font-semibold text-anac-muted">Historique</h2>
          <ul className="space-y-2">
            {history.map((request) => (
              <li key={request.id}>
                <DossierRow request={request} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DossierRow({ request, children }: { request: RequestView; children?: ReactNode }) {
  return (
    <Link
      to={`/dossiers/${request.id}`}
      className="block rounded-lg border border-anac-border bg-white p-4 transition-colors hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-anac-navy">{request.reference}</p>
          <p className="text-sm text-anac-muted">
            {labelOf(REQUEST_TYPE_LABELS, request.requestType)} · déposée le {formatDate(request.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DossierStatusBadge request={request} />
          <ChevronRight size={16} className="text-anac-muted" aria-hidden="true" />
        </div>
      </div>
      {children}
    </Link>
  );
}

/** Same derivation as the dossier page (shared query cache): the row says what is expected now. */
function ActiveDossierRow({ request }: { request: RequestView }) {
  const { banner, items } = useDossierProgress(request);
  const current = [...items].reverse().find((item) => item.stage === 'current');

  return (
    <DossierRow request={request}>
      {banner && (
        <p className="mt-2 text-sm">
          <span className={banner.kind === 'action' ? 'font-semibold text-anac-warning' : 'text-anac-blue'}>
            {banner.eyebrow}
          </span>
          <span className="text-anac-muted">
            {' · '}
            {current ? `${current.shortLabel} : ` : ''}
            {banner.title}
          </span>
        </p>
      )}
    </DossierRow>
  );
}
