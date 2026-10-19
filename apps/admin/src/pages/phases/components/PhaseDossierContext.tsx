import { useQuery } from '@tanstack/react-query';
import { fetchDossierState } from '../../../lib/api/phases.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { DossierContextHeader } from '../../../components/dossier/DossierContextHeader';

/** DOSSIER-CONTEXT-UX-1 - the dossier identity of a phase page. Same query
 *  (and cache entry) as useDossierState, which every phase page already runs:
 *  no extra request. */
export function useDossierIdentity(requestId: string | undefined) {
  const query = useQuery({
    queryKey: requestId ? queryKeys.phases.dossierState(requestId) : queryKeys.phases.all,
    queryFn: () => fetchDossierState(requestId!),
    enabled: !!requestId,
  });
  return { identity: query.data?.identity ?? null, loading: query.isPending && !!requestId };
}

export function PhaseDossierContext({ requestId }: { requestId: string | undefined }) {
  const { identity, loading } = useDossierIdentity(requestId);
  return <DossierContextHeader context={identity} requestId={requestId} loading={loading} />;
}
