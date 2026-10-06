import { Link, useParams } from 'react-router-dom';
import { useMyRequests } from '../requests/hooks/useMyRequests';
import { DossierView } from '../requests/components/DossierView';
import { Breadcrumb } from '../../components/layout/Breadcrumb';
import { PageError } from '../../components/layout/PageError';

/**
 * /dossiers/:id - any dossier of the signed-in applicant. The dossier comes from
 * the applicant's own list (/requests/mine), so an id that is not theirs is
 * simply "not found"; phase endpoints enforce ownership server-side as well.
 */
export default function DossierPage() {
  const { id } = useParams();
  const { requests, error, reload, fetching } = useMyRequests();

  if (error) return <PageError message={error} onRetry={reload} retrying={fetching} />;
  if (requests === null) return <p className="text-anac-muted text-center">Chargement...</p>;

  const request = requests.find((item) => String(item.id) === id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Breadcrumb parent={{ to: '/dossiers', label: 'Mes dossiers' }} current={request?.reference ?? 'Dossier'} />
      {request ? (
        <DossierView request={request} onChanged={reload} />
      ) : (
        <div className="card space-y-2 text-sm">
          <p className="font-medium text-anac-navy">Dossier introuvable</p>
          <p className="text-anac-muted">Ce dossier n&apos;existe pas ou n&apos;est pas rattaché à votre compte.</p>
          <Link to="/dossiers" className="text-anac-blue underline">
            Voir mes dossiers
          </Link>
        </div>
      )}
    </div>
  );
}
