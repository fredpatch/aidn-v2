import { ActiveRequestCard } from './components/ActiveRequestCard';
import { SubmitRequestForm } from './components/SubmitRequestForm';
import { REQUEST_TYPE_LABELS, TERMINAL_STATUSES } from './constants';
import { useMyRequests } from './hooks/useMyRequests';

export default function MyRequestPage() {
  const { requests, error, reload } = useMyRequests();

  if (error) {
    return (
      <div className="card max-w-lg mx-auto">
        <p className="text-anac-danger">{error}</p>
      </div>
    );
  }

  if (requests === null) {
    return <p className="text-anac-muted text-center">Chargement...</p>;
  }

  const activeRequest = requests.find((request) => !TERMINAL_STATUSES.includes(request.status));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Ma demande</h1>
        <p className="text-anac-muted text-sm">
          Reconnaissance, délivrance, modification ou renouvellement d&apos;agrément OMA
        </p>
      </div>

      {activeRequest ? (
        <ActiveRequestCard request={activeRequest} onChanged={reload} />
      ) : (
        <SubmitRequestForm onSubmitted={reload} />
      )}

      {requests.length > 0 && (
        <div>
          <h2 className="text-anac-navy font-medium text-sm mb-2">Historique</h2>
          <div className="space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="card text-sm flex items-center justify-between">
                <div>
                  <p className="font-medium">{request.reference}</p>
                  <p className="text-anac-muted">
                    {REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType}
                  </p>
                </div>
                <span className="text-anac-muted text-xs">
                  {new Date(request.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
