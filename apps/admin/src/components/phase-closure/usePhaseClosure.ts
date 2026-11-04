import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { fetchPhaseClosure, startPhaseClosure } from '../../lib/api/phase-closure.api';
import { apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { uploadFile } from '../../lib/uploads';

/** WORKFLOW-FOUNDATION-1B - the closure courrier of a phase page: its state
 *  (courrier + server readiness) and the deposit. `bundleKey` is the page's
 *  own bundle, refreshed with it. */
export function usePhaseClosure(phaseId: number | undefined, bundleKey: QueryKey) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.phaseClosure.byPhase(phaseId ?? 0),
    queryFn: () => fetchPhaseClosure(phaseId!),
    enabled: !!phaseId,
  });

  const deposit = useMutation({
    mutationFn: async (file: File) => {
      const { uploadAssetId } = await uploadFile(file);
      return startPhaseClosure(phaseId!, uploadAssetId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.phaseClosure.byPhase(phaseId ?? 0) }),
        queryClient.invalidateQueries({ queryKey: bundleKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.requests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courrierTasks.all }),
      ]);
    },
  });

  return {
    state: query.data ?? null,
    loading: query.isLoading,
    /** Resolves to null on success, or the French error to show. */
    async depositCourrier(file: File): Promise<string | null> {
      try {
        await deposit.mutateAsync(file);
        return null;
      } catch (error) {
        return apiErrorMessage(error, 'Impossible de déposer le courrier de clôture.');
      }
    },
    depositing: deposit.isPending,
  };
}
