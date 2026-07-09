import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchFormalBundle, startFormalPhase } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useFormalBundle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const bundleQuery = useQuery({
    queryKey: requestId ? queryKeys.formal.bundle(requestId) : queryKeys.formal.all,
    queryFn: () => fetchFormalBundle(requestId!),
    enabled: !!requestId,
  });

  const startPhaseMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error('MISSING_REQUEST_ID');
      await startFormalPhase(requestId);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) });
      }
    },
    onError: (err) => {
      setActionError(apiErrorMessage(err, 'Impossible de démarrer la phase formelle.'));
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
      startPhaseMutation.mutate();
    },
    startingPhase: startPhaseMutation.isPending,
  };
}
