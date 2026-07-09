import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closePhase, uploadFile } from '../api';
import { apiErrorMessage } from '../../../../lib/axios';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function usePhaseCloseAction(
  setActionError: (message: string | null) => void,
  requestId: string | undefined
) {
  const queryClient = useQueryClient();

  const closeMutation = useMutation({
    mutationFn: async (params: { phaseId: number; note?: string; file?: File | null }) => {
      let closureDocumentUrl: string | undefined;
      let closureDocumentMimeType: string | undefined;

      if (params.file) {
        const uploaded = await uploadFile(params.file);
        closureDocumentUrl = uploaded.fileUrl;
        closureDocumentMimeType = uploaded.mimeType;
      }

      await closePhase({
        phaseId: params.phaseId,
        closureDocumentUrl,
        closureDocumentMimeType,
        closureNote: params.note || undefined,
      });
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de cloturer la phase.')),
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

  return {
    busy: closeMutation.isPending,
    close,
  };
}
