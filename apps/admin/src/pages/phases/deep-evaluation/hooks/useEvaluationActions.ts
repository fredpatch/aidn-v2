import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { resubmitDocument, setVerdict, uploadFile } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useEvaluationActions(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({
        queryKey: queryKeys.deepEvaluation.bundle(requestId),
      });
    }
  }

  const verdictMutation = useMutation({
    mutationFn: (params: {
      evaluationId: number;
      verdict: 'validated' | 'rejected' | 'needs_correction';
      correctionDays?: number;
    }) => setVerdict(params.evaluationId, params.verdict, params.correctionDays),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de définir le verdict.')),
  });

  const resubmitMutation = useMutation({
    mutationFn: async (params: { evaluationId: number; file: File }) => {
      const uploaded = await uploadFile(params.file);
      await resubmitDocument(
        params.evaluationId,
        uploaded.fileUrl,
        uploaded.mimeType,
        uploaded.uploadAssetId
      );
    },
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de soumettre le document corrigé.')),
  });

  const busy = verdictMutation.isPending || resubmitMutation.isPending;

  async function verdict(
    evaluationId: number,
    v: 'validated' | 'rejected' | 'needs_correction',
    correctionDays?: number
  ): Promise<boolean> {
    setActionError(null);
    try {
      await verdictMutation.mutateAsync({ evaluationId, verdict: v, correctionDays });
      return true;
    } catch {
      return false;
    }
  }

  async function resubmit(evaluationId: number, file: File): Promise<boolean> {
    setActionError(null);
    try {
      await resubmitMutation.mutateAsync({ evaluationId, file });
      return true;
    } catch {
      return false;
    }
  }

  return { busy, verdict, resubmit };
}
