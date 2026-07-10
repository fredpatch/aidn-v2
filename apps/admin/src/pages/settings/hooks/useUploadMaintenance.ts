import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import { cleanupOrphanUploads, fetchUploadDiagnostics } from '../../../lib/api/settings.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

export function useUploadMaintenance() {
  const queryClient = useQueryClient();

  const diagnosticsQuery = useQuery({
    queryKey: queryKeys.settings.uploadDiagnostics(),
    queryFn: fetchUploadDiagnostics,
    retry: false,
  });

  const cleanupMutation = useMutation({
    mutationFn: (retentionDays?: number) => cleanupOrphanUploads(retentionDays),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.uploadDiagnostics() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.systemParameters() });
    },
  });

  async function runCleanup(
    retentionDays?: number
  ): Promise<{ result: string | null; error: string | null }> {
    try {
      const data = await cleanupMutation.mutateAsync(retentionDays);
      return {
        result: `Nettoyage termine: ${data.marked} marque(s), ${data.deleted} fichier(s) supprime(s), retention ${data.retentionDays} jour(s).`,
        error: null,
      };
    } catch (err) {
      return {
        result: null,
        error: apiErrorMessage(err, 'Impossible de nettoyer les uploads orphelins.'),
      };
    }
  }

  return {
    diagnostics: diagnosticsQuery.data,
    loading: diagnosticsQuery.isLoading,
    error: diagnosticsQuery.error
      ? apiErrorMessage(diagnosticsQuery.error, 'Impossible de charger les diagnostics uploads.')
      : null,
    busy: cleanupMutation.isPending,
    runCleanup,
  };
}
