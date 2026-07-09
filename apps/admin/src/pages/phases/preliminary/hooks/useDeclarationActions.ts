import { useMutation, useQueryClient } from '@tanstack/react-query';
import { makeDeclarationAvailable } from '../api';
import { apiErrorMessage } from '../../../../lib/axios';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useDeclarationActions(
  setActionError: (message: string | null) => void,
  requestId: string | undefined
) {
  const queryClient = useQueryClient();

  const makeAvailableMutation = useMutation({
    mutationFn: ({ phaseId, returnDays }: { phaseId: number; returnDays?: number }) =>
      makeDeclarationAvailable(phaseId, returnDays),
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de rendre la declaration disponible.')),
  });

  async function makeAvailable(phaseId: number, returnDays?: number): Promise<boolean> {
    setActionError(null);
    try {
      await makeAvailableMutation.mutateAsync({ phaseId, returnDays });
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: makeAvailableMutation.isPending,
    makeAvailable,
  };
}
