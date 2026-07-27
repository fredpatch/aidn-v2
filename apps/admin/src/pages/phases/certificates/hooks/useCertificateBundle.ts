import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchCertificateBundle, startDelivery } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useCertificateBundle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const bundleQuery = useQuery({
    queryKey: requestId ? queryKeys.certificates.bundle(requestId) : queryKeys.certificates.all,
    queryFn: () => fetchCertificateBundle(requestId!),
    enabled: !!requestId,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error('MISSING_REQUEST_ID');
      await startDelivery(requestId);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.certificates.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de démarrer la phase de délivrance.')),
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
