import { Navigate } from 'react-router-dom';
import { SubmitRequestForm } from './components/SubmitRequestForm';
import { TERMINAL_STATUSES } from './constants';
import { useMyRequests } from './hooks/useMyRequests';
import { PageError } from '../../components/layout/PageError';

/**
 * /demande - submission form. One active dossier per organisation: while one
 * exists this route opens it instead (keeps old links and bookmarks working).
 */
export default function NewRequestPage() {
  const { requests, error, reload, fetching } = useMyRequests();

  if (error) return <PageError message={error} onRetry={reload} retrying={fetching} />;
  if (requests === null) return <p className="text-anac-muted text-center">Chargement...</p>;

  const activeRequest = requests.find((request) => !TERMINAL_STATUSES.includes(request.status));
  if (activeRequest) return <Navigate to={`/dossiers/${activeRequest.id}`} replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Déposer une demande</h1>
        <p className="text-anac-muted text-sm">
          Reconnaissance, délivrance, modification ou renouvellement d&apos;agrément OMA
        </p>
      </div>
      <SubmitRequestForm onSubmitted={reload} />
    </div>
  );
}
