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
      const closureDocumentUploadAssetId = params.file
        ? (await uploadFile(params.file)).uploadAssetId
        : undefined;

      await closePhase({
        phaseId: params.phaseId,
        closureDocumentUploadAssetId,
        closureNote: params.note || undefined,
      });
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
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

  return {
    busy: closeMutation.isPending,
    close,
  };
}
