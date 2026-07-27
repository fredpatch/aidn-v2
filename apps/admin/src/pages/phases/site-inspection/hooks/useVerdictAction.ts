import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { submitVerdict } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useVerdictAction(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const verdictMutation = useMutation({
    mutationFn: (params: {
      phaseId: number;
      verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves';
      note: string;
    }) => submitVerdict(params.phaseId, params.verdict, params.note),
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.siteInspection.bundle(requestId),
        });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible de soumettre l'avis R3.")),
  });

  async function submit(
    phaseId: number,
    verdict: 'compliant' | 'non_compliant' | 'compliant_with_reserves',
    note: string
  ): Promise<boolean> {
    setActionError(null);
    try {
      await verdictMutation.mutateAsync({ phaseId, verdict, note });
      return true;
    } catch {
      return false;
    }
  }

  return { busy: verdictMutation.isPending, submit };
}
