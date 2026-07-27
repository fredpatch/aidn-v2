import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { overrideCertificateType, updateCertificateFields } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';
import type { CertificateFieldsInput } from '../api';

export function useCertificateFields(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({ queryKey: queryKeys.certificates.bundle(requestId) });
    }
  }

  const fieldsMutation = useMutation({
    mutationFn: (params: { certificateId: number; fields: CertificateFieldsInput }) =>
      updateCertificateFields(params.certificateId, params.fields),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible d'enregistrer les champs.")),
  });

  const typeMutation = useMutation({
    mutationFn: (params: { certificateId: number; certificateType: 'agreement' | 'recognition' }) =>
      overrideCertificateType(params.certificateId, params.certificateType),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de modifier le type de certificat.')),
  });

  async function saveFields(certificateId: number, fields: CertificateFieldsInput): Promise<boolean> {
    setActionError(null);
    try {
      await fieldsMutation.mutateAsync({ certificateId, fields });
      return true;
    } catch {
      return false;
    }
  }

  async function setType(
    certificateId: number,
    certificateType: 'agreement' | 'recognition'
  ): Promise<boolean> {
    setActionError(null);
    try {
      await typeMutation.mutateAsync({ certificateId, certificateType });
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: fieldsMutation.isPending || typeMutation.isPending,
    saveFields,
    setType,
  };
}
