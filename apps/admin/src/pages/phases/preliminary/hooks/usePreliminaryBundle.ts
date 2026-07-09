import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchPreliminaryBundle, startPreliminaryPhase } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function usePreliminaryBundle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const bundleQuery = useQuery({
    queryKey: requestId ? queryKeys.preliminary.bundle(requestId) : queryKeys.preliminary.all,
    queryFn: () => fetchPreliminaryBundle(requestId!),
    enabled: !!requestId,
  });

  const startPhaseMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) {
        throw new Error('MISSING_REQUEST_ID');
      }
      await startPreliminaryPhase(requestId);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'MISSING_REQUEST_ID') {
        setActionError('Identifiant de demande manquant.');
        return;
      }
      setActionError(apiErrorMessage(err, 'Impossible de demarrer la phase.'));
    },
  });

  async function startPhase() {
    setActionError(null);
    await startPhaseMutation.mutateAsync();
  }

  async function reload() {
    if (!requestId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
  }

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
    reload,
    startPhase,
    startingPhase: startPhaseMutation.isPending,
  };
}
