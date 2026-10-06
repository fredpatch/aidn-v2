import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import { fetchMyRequests } from '../../../lib/api/requests.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

export function useMyRequests() {
  const queryClient = useQueryClient();

  const myRequestsQuery = useQuery({
    queryKey: queryKeys.requests.mine(),
    queryFn: fetchMyRequests,
  });

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.requests.mine() });
  }

  // A failed background refetch keeps the last list on screen; only a load
  // with nothing to show is reported as an error.
  const error = myRequestsQuery.error && myRequestsQuery.data === undefined
    ? apiErrorMessage(myRequestsQuery.error, 'Impossible de charger votre demande.')
    : null;

  return {
    requests: myRequestsQuery.data ?? null,
    loading: myRequestsQuery.isLoading,
    fetching: myRequestsQuery.isFetching,
    error,
    reload,
  };
}
