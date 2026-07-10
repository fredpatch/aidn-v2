import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import {
  rejectPayment,
  uploadFile,
  uploadInvoice,
  uploadPaymentProof,
  validatePayment,
} from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function usePaymentActions(
  requestId: string | undefined,
  phaseId: number | undefined,
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

  const invoiceMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file);
      await uploadInvoice(phaseId!, uploaded.fileUrl, uploaded.mimeType, uploaded.uploadAssetId);
    },
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de mettre en ligne la facture.')),
  });

  const proofMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file);
      await uploadPaymentProof(
        phaseId!,
        requestId!,
        uploaded.fileUrl,
        uploaded.mimeType,
        uploaded.uploadAssetId
      );
    },
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de soumettre la preuve de paiement.')),
  });

  const validateMutation = useMutation({
    mutationFn: () => validatePayment(phaseId!),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de valider le paiement.')),
  });

  const rejectMutation = useMutation({
    mutationFn: (params: {
      rejectionAction: 'request_new_proof' | 'reject_dossier';
      rejectionReason: string;
    }) => rejectPayment(phaseId!, params.rejectionAction, params.rejectionReason),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de rejeter le paiement.')),
  });

  const busy =
    invoiceMutation.isPending ||
    proofMutation.isPending ||
    validateMutation.isPending ||
    rejectMutation.isPending;

  async function uploadInvoiceFile(file: File): Promise<boolean> {
    setActionError(null);
    try {
      await invoiceMutation.mutateAsync(file);
      return true;
    } catch {
      return false;
    }
  }

  async function uploadProofFile(file: File): Promise<boolean> {
    setActionError(null);
    try {
      await proofMutation.mutateAsync(file);
      return true;
    } catch {
      return false;
    }
  }

  async function validate(): Promise<boolean> {
    setActionError(null);
    try {
      await validateMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }

  async function reject(
    rejectionAction: 'request_new_proof' | 'reject_dossier',
    rejectionReason: string
  ): Promise<boolean> {
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({ rejectionAction, rejectionReason });
      return true;
    } catch {
      return false;
    }
  }

  return { busy, uploadInvoiceFile, uploadProofFile, validate, reject };
}
