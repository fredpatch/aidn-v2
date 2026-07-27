import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { fetchMyQueue } from '../../lib/api/site-inspection.api';
import { queryKeys } from '../../lib/react-query/queryKeys';

export default function MyInspectionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.siteInspection.myQueue(),
    queryFn: fetchMyQueue,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={18} className="text-anac-navy" />
        <h1 className="text-anac-navy text-xl font-semibold">Mes Inspections</h1>
      </div>
      <p className="text-anac-muted text-sm">
        Dossiers en démonstration/inspection qui vous sont assignés.
      </p>

      {isLoading && <p className="text-anac-muted text-sm">Chargement...</p>}
      {error && (
        <p className="text-anac-danger text-sm">Impossible de charger la file de dossiers.</p>
      )}

      {data && data.length === 0 && (
        <div className="card">
          <p className="text-anac-muted text-sm">Aucun dossier assigné pour le moment.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-anac-gray text-anac-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Référence</th>
                <th className="text-left px-4 py-2">Organisme</th>
                <th className="text-left px-4 py-2">Visite</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-anac-border">
              {data.map((item) => (
                <tr key={item.phaseId}>
                  <td className="px-4 py-2 font-medium">{item.requestReference}</td>
                  <td className="px-4 py-2">{item.organisationName}</td>
                  <td className="px-4 py-2">
                    {item.siteVisit
                      ? new Date(item.siteVisit.scheduledAt).toLocaleString('fr-FR')
                      : '-'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/demandes/${item.requestId}/demonstration-inspection`}
                      className="text-anac-blue underline text-xs"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
