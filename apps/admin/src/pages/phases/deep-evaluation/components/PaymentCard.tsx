import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import {
  PaymentRejectionForm,
  type PaymentRejectionAction,
} from '../../../../components/common/PaymentRejectionForm';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '../constants';
import { formatDate } from '../helpers';
import { usePaymentActions } from '../hooks/usePaymentActions';
import type { PaymentView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

const PAYMENT_LABEL = "Paiement - Frais d'etude de dossier";

interface PaymentCardProps {
  requestId: string | undefined;
  phaseId: number | undefined;
  payment: PaymentView | null;
  canManagePayment: boolean;
  setActionError: (message: string | null) => void;
}

export default function PaymentCard({
  requestId,
  phaseId,
  payment,
  canManagePayment,
  setActionError,
}: PaymentCardProps) {
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const { busy, uploadInvoiceFile, validate, reject } = usePaymentActions(
    requestId,
    phaseId,
    setActionError
  );

  async function handleInvoiceUpload() {
    if (!invoiceFile) return;
    const ok = await uploadInvoiceFile(invoiceFile);
    if (ok) setInvoiceFile(null);
  }

  async function handleReject(action: PaymentRejectionAction, reason: string): Promise<boolean> {
    const ok = await reject(action, reason);
    if (ok) setRejecting(false);
    return ok;
  }

  return (
    <CollapsibleCard
      title={PAYMENT_LABEL}
      icon={<CreditCard size={16} className="text-anac-navy" />}
      defaultOpen={payment?.status !== 'validated'}
      resetKey={payment?.status ?? 'missing'}
      badge={
        payment ? (
          <PhaseStatusBadge
            status={payment.status}
            label={PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
            toneMap={PAYMENT_STATUS_TONES}
          />
        ) : null
      }
    >
      <div className="space-y-2">
        <p className="text-xs font-medium text-anac-navy">Facture (S5)</p>
        {!payment?.invoiceFileUrl ? (
          canManagePayment ? (
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)}
              />
              <Button size="sm" disabled={!invoiceFile || busy} onClick={handleInvoiceUpload}>
                Envoyer la facture
              </Button>
            </div>
          ) : (
            <p className="text-anac-muted text-xs">
              En attente de l&apos;envoi par le service S5.
            </p>
          )
        ) : (
          <p className="text-xs text-anac-muted">
            Envoyee le {formatDate(payment.invoiceUploadedAt)} -{' '}
            <DocumentPreviewLink
              title="Facture evaluation approfondie"
              url={payment.invoiceFileUrl}
            />
          </p>
        )}
      </div>

      {payment?.invoiceFileUrl && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-anac-navy">Preuve de paiement (postulant)</p>
          {!payment.proofFileUrl ? (
            <p className="text-anac-muted text-xs">
              En attente - le postulant doit soumettre sa quittance via le portail.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-anac-muted">
                Soumise le {formatDate(payment.proofUploadedAt)} -{' '}
                <DocumentPreviewLink
                  title="Preuve de paiement evaluation approfondie"
                  url={payment.proofFileUrl}
                />
              </p>

              {payment.status === 'pending_validation' && canManagePayment && !rejecting && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={validate} disabled={busy}>
                    Valider le paiement
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRejecting(true)}
                    disabled={busy}
                  >
                    Rejeter
                  </Button>
                </div>
              )}

              {payment.status === 'pending_validation' && canManagePayment && rejecting && (
                <PaymentRejectionForm
                  paymentLabel={PAYMENT_LABEL}
                  busy={busy}
                  onReject={handleReject}
                  onCancel={() => setRejecting(false)}
                  setActionError={setActionError}
                />
              )}

              {payment.status === 'validated' && (
                <p className="text-anac-success text-xs">
                  Valide le {formatDate(payment.validatedAt)}.
                </p>
              )}

              {payment.status === 'awaiting_proof' && payment.rejectionReason && (
                <div className="text-xs space-y-1">
                  <p className="text-anac-danger">Preuve rejetee : {payment.rejectionReason}</p>
                  <p className="text-anac-muted">
                    En attente d&apos;une nouvelle preuve du postulant.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
