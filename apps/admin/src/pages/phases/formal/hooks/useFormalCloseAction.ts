import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { closeFormalPhase, uploadFile } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useFormalCloseAction(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
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
      await closeFormalPhase({
        phaseId: params.phaseId,
        closureDocumentUrl,
        closureDocumentMimeType,
        closureNote: params.note || undefined,
      });
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) });
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
