import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { closeDeepEvaluationPhase, uploadFile } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useDeepEvaluationCloseAction(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const closeMutation = useMutation({
    mutationFn: async (params: { phaseId: number; note?: string; file?: File | null }) => {
      let closureDocumentUrl: string | undefined;
      let closureDocumentMimeType: string | undefined;
      let closureDocumentUploadAssetId: number | undefined;
      if (params.file) {
        const uploaded = await uploadFile(params.file);
        closureDocumentUrl = uploaded.fileUrl;
        closureDocumentMimeType = uploaded.mimeType;
        closureDocumentUploadAssetId = uploaded.uploadAssetId;
      }
      await closeDeepEvaluationPhase({
        phaseId: params.phaseId,
        closureDocumentUrl,
        closureDocumentMimeType,
        closureDocumentUploadAssetId,
        closureNote: params.note || undefined,
      });
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.deepEvaluation.bundle(requestId),
        });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de clôturer la phase.')),
  });

  async function close(params: {
    phaseId: number;
    note?: string;
    file?: File | null;
  }): Promise<boolean> {
    setActionError(null);
    try {
      await closeMutation.mutateAsync(params);
      return true;
    } catch {
      return false;
    }
  }

  return { busy: closeMutation.isPending, close };
}
