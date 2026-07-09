import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { markLetterPendingReview, markLetterSigned, submitFormalLetter, uploadFile } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useFormalLetterActions(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) });
    }
  }

  const submitMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file);
      await submitFormalLetter(requestId!, uploaded.fileUrl, uploaded.mimeType);
    },
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de soumettre la lettre.')),
  });

  const signMutation = useMutation({
    mutationFn: () => markLetterSigned(requestId!),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer comme signée.')),
  });

  const transmitMutation = useMutation({
    mutationFn: () => markLetterPendingReview(requestId!),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de transmettre à la DN.')),
  });

  return {
    busy: submitMutation.isPending || signMutation.isPending || transmitMutation.isPending,
    submit: async (file: File): Promise<boolean> => {
      setActionError(null);
      try {
        await submitMutation.mutateAsync(file);
        return true;
      } catch {
        return false;
      }
    },
    sign: async (): Promise<boolean> => {
      setActionError(null);
      try {
        await signMutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
    transmit: async (): Promise<boolean> => {
      setActionError(null);
      try {
        await transmitMutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  };
}
