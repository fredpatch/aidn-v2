import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import type { ReferenceDataRunResult } from '../../../lib/api/settings.types';
import { fetchSystemStatus, runReferenceDataSeed } from '../../../lib/api/settings.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

/** « État du système ». Each check is a live server-side check, so the data
 *  is never considered fresh and never refetched behind the SU's back: it
 *  loads when the tab opens, on « Actualiser », and after a run. */
export function useSystemHealth() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: queryKeys.settings.systemStatus(),
    queryFn: fetchSystemStatus,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const runMutation = useMutation({
    mutationFn: runReferenceDataSeed,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.systemStatus() });
      // A run can create parameters shown in the Configuration tab.
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.systemParameters() });
    },
  });

  async function run(): Promise<{ result: ReferenceDataRunResult | null; error: string | null }> {
    try {
      return { result: await runMutation.mutateAsync(), error: null };
    } catch (err) {
      return { result: null, error: apiErrorMessage(err, 'Impossible de créer les éléments manquants.') };
    }
  }

  return {
    status: statusQuery.data,
    loading: statusQuery.isLoading,
    error: statusQuery.error ? apiErrorMessage(statusQuery.error, 'Impossible de vérifier l’état du système.') : null,
    refetch: statusQuery.refetch,
    refetching: statusQuery.isFetching,
    run,
    running: runMutation.isPending,
  };
}
