import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import { fetchDevToolsStatus, resetDevTools } from '../../../lib/api/settings.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

export function useDevReset() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: queryKeys.settings.devToolsStatus(),
    queryFn: fetchDevToolsStatus,
    retry: false,
  });

  const resetMutation = useMutation({
    mutationFn: (scopes: string[]) => resetDevTools(scopes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.devToolsStatus() });
    },
  });

  async function runReset(
    scopes: string[]
  ): Promise<{ result: string | null; error: string | null }> {
    try {
      const data = await resetMutation.mutateAsync(scopes);
      return {
        result: `Reinitialise : ${data.scopesCleared.join(', ')}`,
        error: null,
      };
    } catch (err) {
      return {
        result: null,
        error: apiErrorMessage(err, 'Impossible de reinitialiser.'),
      };
    }
  }

  return {
    enabled: statusQuery.data?.enabled ?? false,
    scopes: statusQuery.data?.scopes ?? [],
    labels: statusQuery.data?.labels ?? {},
    loadingStatus: statusQuery.isLoading,
    busy: resetMutation.isPending,
    runReset,
  };
}
