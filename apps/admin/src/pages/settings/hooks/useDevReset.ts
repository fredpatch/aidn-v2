import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import {
  fetchDevToolsStatus,
  resetDevTools,
  startDevToolsSession,
} from '../../../lib/api/settings.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

export function useDevReset() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: queryKeys.settings.devToolsStatus(),
    queryFn: fetchDevToolsStatus,
    retry: false,
  });

  const sessionMutation = useMutation({
    mutationFn: (durationMinutes: number) => startDevToolsSession(durationMinutes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.devToolsStatus() });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ scopes, confirmation }: { scopes: string[]; confirmation: string }) =>
      resetDevTools(scopes, confirmation),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.devToolsStatus() });
    },
  });

  async function startSession(
    durationMinutes: number
  ): Promise<{ result: string | null; error: string | null }> {
    try {
      const data = await sessionMutation.mutateAsync(durationMinutes);
      return {
        result: data.session.expiresAt
          ? `Session ouverte jusqu'a ${new Date(data.session.expiresAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}.`
          : 'Session de maintenance ouverte.',
        error: null,
      };
    } catch (err) {
      return {
        result: null,
        error: apiErrorMessage(err, 'Impossible de demarrer la session de maintenance.'),
      };
    }
  }

  async function runReset(
    scopes: string[],
    confirmation: string
  ): Promise<{ result: string | null; error: string | null }> {
    try {
      const data = await resetMutation.mutateAsync({ scopes, confirmation });
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
    environment: statusQuery.data?.environment ?? 'unknown',
    accessRequired: statusQuery.data?.accessRequired ?? 'Super admin',
    mode: statusQuery.data?.mode ?? 'irreversible',
    session: statusQuery.data?.session ?? {
      active: false,
      expiresAt: null,
      durationMinutes: null,
    },
    scopes: statusQuery.data?.scopes ?? [],
    labels: statusQuery.data?.labels ?? {},
    scopeDetails: statusQuery.data?.scopeDetails ?? [],
    loadingStatus: statusQuery.isLoading,
    busy: resetMutation.isPending || sessionMutation.isPending,
    startSession,
    runReset,
  };
}
