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

  const error = myRequestsQuery.error
    ? apiErrorMessage(myRequestsQuery.error, 'Impossible de charger votre demande.')
    : null;

  return {
    requests: myRequestsQuery.data ?? null,
    loading: myRequestsQuery.isLoading,
    error,
    reload,
  };
}
