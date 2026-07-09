import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { submitFormalDocument, uploadFile } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useFormalDocumentActions(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async ({ slot, file }: { slot: string; file: File }) => {
      const uploaded = await uploadFile(file);
      await submitFormalDocument(requestId!, slot, uploaded.fileUrl, uploaded.mimeType);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de soumettre le document.')),
  });

  async function submit(slot: string, file: File): Promise<boolean> {
    setActionError(null);
    try {
      await submitMutation.mutateAsync({ slot, file });
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: submitMutation.isPending,
    submit,
  };
}
