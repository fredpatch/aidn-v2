import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../lib/axios';
import { fetchSystemParameters, updateSystemParameter } from '../../../lib/api/settings.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';

export function useSystemParameters() {
  const queryClient = useQueryClient();

  const paramsQuery = useQuery({
    queryKey: queryKeys.settings.systemParameters(),
    queryFn: fetchSystemParameters,
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSystemParameter(key, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.systemParameters() });
    },
  });

  async function saveParameter(key: string, value: string): Promise<string | null> {
    try {
      await updateMutation.mutateAsync({ key, value });
      return null;
    } catch (err) {
      return apiErrorMessage(err, "Impossible d'enregistrer.");
    }
  }

  return {
    parameters: paramsQuery.data ?? [],
    loading: paramsQuery.isLoading,
    error: paramsQuery.error
      ? apiErrorMessage(paramsQuery.error, 'Impossible de charger les parametres.')
      : null,
    saveParameter,
  };
}
