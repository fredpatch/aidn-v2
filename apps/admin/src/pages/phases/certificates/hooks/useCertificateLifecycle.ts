import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import {
  generateCertificateDocument,
  markArchived,
  markCollected,
  markPrinted,
  markSigned,
  notifyApplicant,
} from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useCertificateLifecycle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({ queryKey: queryKeys.certificates.bundle(requestId) });
    }
  }

  const generateMutation = useMutation({
    mutationFn: (certificateId: number) => generateCertificateDocument(certificateId),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de générer le document du certificat.')),
  });

  const printedMutation = useMutation({
    mutationFn: (certificateId: number) => markPrinted(certificateId),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer comme imprimé.')),
  });
  const signedMutation = useMutation({
    mutationFn: (certificateId: number) => markSigned(certificateId),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer comme signé.')),
  });
  const archivedMutation = useMutation({
    mutationFn: (certificateId: number) => markArchived(certificateId),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer comme archivé.')),
  });
  const notifyMutation = useMutation({
    mutationFn: (certificateId: number) => notifyApplicant(certificateId),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de notifier le postulant.')),
  });
  const collectedMutation = useMutation({
    mutationFn: (certificateId: number) => markCollected(certificateId),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de marquer comme retiré.')),
  });

  async function generate(certificateId: number): Promise<{ fileUrl: string } | null> {
    setActionError(null);
    try {
      return await generateMutation.mutateAsync(certificateId);
    } catch {
      return null;
    }
  }

  async function advance(
    certificateId: number,
    step: 'printed' | 'signed' | 'archived' | 'notify' | 'collected'
  ): Promise<boolean> {
    setActionError(null);
    try {
      if (step === 'printed') await printedMutation.mutateAsync(certificateId);
      else if (step === 'signed') await signedMutation.mutateAsync(certificateId);
      else if (step === 'archived') await archivedMutation.mutateAsync(certificateId);
      else if (step === 'notify') await notifyMutation.mutateAsync(certificateId);
      else if (step === 'collected') await collectedMutation.mutateAsync(certificateId);
      return true;
    } catch {
      return false;
    }
  }

  const busy =
    generateMutation.isPending ||
    printedMutation.isPending ||
    signedMutation.isPending ||
    archivedMutation.isPending ||
    notifyMutation.isPending ||
    collectedMutation.isPending;

  return { busy, generate, advance };
}
