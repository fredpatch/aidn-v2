import { useState } from 'react';
import { CreditCard, UploadCloud } from 'lucide-react';
import FileLink from '../files/FileLink';
import { SectionCard } from './SectionCard';
import { useReadOnly } from './ReadOnlyContext';
import { apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import type { PaymentInfo } from '../../lib/api/requests.types';

/**
 * Invoice + payment-proof block shared by M5 / M6 / M7.
 * Order of states: validated > proof pending validation > upload allowed once
 * the invoice exists. The section supplies only the submit call.
 */
export function PaymentBlock({
  title = 'Paiement',
  payment,
  waitingInvoiceText,
  onSubmitProof,
}: {
  title?: string;
  payment: PaymentInfo;
  waitingInvoiceText: string;
  /** Upload the file and attach it to the payment; reload the section afterwards. */
  onSubmitProof: (file: File) => Promise<void>;
}) {
  const readOnly = useReadOnly();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!proofFile) {
      notify.warning('Merci de joindre votre quittance de paiement.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitProof(proofFile);
      notify.success('Preuve de paiement soumise.');
      setProofFile(null);
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la preuve.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard icon={CreditCard} title={title}>
      <div className="mt-3 space-y-3 text-sm">
        {!payment.invoiceFileUrl ? (
          <p className="text-anac-muted">{waitingInvoiceText}</p>
        ) : (
          <FileLink address={payment.invoiceFileUrl} className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs">
            Consulter la facture
          </FileLink>
        )}

        {payment.status === 'validated' ? (
          <p className="text-sm font-medium text-anac-success">Paiement validé.</p>
        ) : payment.proofFileUrl && payment.status === 'pending_validation' ? (
          <p className="text-anac-muted">Quittance soumise, en attente de validation.</p>
        ) : payment.invoiceFileUrl && !readOnly ? (
          <div className="rounded border border-dashed border-anac-border p-3">
            {payment.rejectionReason && (
              <p className="mb-2 text-xs text-anac-danger">Preuve rejetée : {payment.rejectionReason}</p>
            )}
            <label className="flex cursor-pointer flex-col gap-1 text-sm">
              <span className="font-medium text-anac-navy">Déposer ma quittance</span>
              <span className="text-xs text-anac-muted">Formats acceptés : PDF, Word, PNG ou JPG.</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                className="mt-2 text-xs"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
              onClick={handleSubmit}
              disabled={submitting || !proofFile}
            >
              <UploadCloud size={13} aria-hidden="true" />
              {submitting ? 'Envoi...' : 'Soumettre ma quittance'}
            </button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
