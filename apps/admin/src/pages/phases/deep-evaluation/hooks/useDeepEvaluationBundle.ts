import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchDeepEvaluationBundle, startDeepEvaluation } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useDeepEvaluationBundle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const bundleQuery = useQuery({
    queryKey: requestId ? queryKeys.deepEvaluation.bundle(requestId) : queryKeys.deepEvaluation.all,
    queryFn: () => fetchDeepEvaluationBundle(requestId!),
    enabled: !!requestId,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error('MISSING_REQUEST_ID');
      await startDeepEvaluation(requestId);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.deepEvaluation.bundle(requestId),
        });
      }
    },
    onError: (err) => {
      setActionError(
        apiErrorMessage(err, "Impossible de démarrer la phase d'évaluation approfondie.")
      );
    },
  });

  const queryError =
    requestId && bundleQuery.error
      ? apiErrorMessage(bundleQuery.error, 'Impossible de charger la phase.')
      : !requestId
        ? 'Identifiant de demande manquant.'
        : null;

  return {
    bundle: bundleQuery.data ?? null,
    loading: bundleQuery.isLoading,
    error: queryError,
    startPhase: () => {
      setActionError(null);
      startMutation.mutate();
    },
    startingPhase: startMutation.isPending,
  };
}
