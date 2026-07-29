import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { API_ORIGIN, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '../constants';
import { formatDate } from '../helpers';
import { usePaymentActions } from '../hooks/usePaymentActions';
import type { PaymentView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

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
  const [rejectionAction, setRejectionAction] = useState<'request_new_proof' | 'reject_dossier'>(
    'request_new_proof'
  );
  const [rejectionReason, setRejectionReason] = useState('');

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

  async function handleReject() {
    if (!rejectionReason.trim()) {
      setActionError('Un motif de rejet est requis.');
      return;
    }
    const ok = await reject(rejectionAction, rejectionReason);
    if (ok) {
      setRejecting(false);
      setRejectionReason('');
    }
  }

  return (
    <CollapsibleCard
      title="Paiement - Frais d'etude de dossier"
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
              url={`${API_ORIGIN}${payment.invoiceFileUrl}`}
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
                  url={`${API_ORIGIN}${payment.proofFileUrl}`}
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
                <div className="space-y-2">
                  <div>
                    <label className="label">Action</label>
                    <select
                      className="input"
                      value={rejectionAction}
                      onChange={(event) =>
                        setRejectionAction(
                          event.target.value as 'request_new_proof' | 'reject_dossier'
                        )
                      }
                    >
                      <option value="request_new_proof">Demander une nouvelle preuve</option>
                      <option value="reject_dossier">Rejeter le dossier definitivement</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Motif</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={rejectionAction === 'reject_dossier' ? 'destructive' : 'secondary'}
                      onClick={handleReject}
                      disabled={busy}
                    >
                      Confirmer
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRejecting(false);
                        setRejectionReason('');
                      }}
                      disabled={busy}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
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
