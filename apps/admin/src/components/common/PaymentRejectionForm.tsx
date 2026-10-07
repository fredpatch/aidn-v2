import { useId, useState } from 'react';
import { Button } from '../ui/button';
import { DossierRejectionConfirmModal } from './DossierRejectionConfirm';

export type PaymentRejectionAction = 'request_new_proof' | 'reject_dossier';

/**
 * Rejection form of the phase payment cards (M5, M6, M7): action + reason.
 * "Nouvelle preuve" is sent on Confirmer; "Rejeter le dossier" first opens
 * a second confirmation. Each card keeps its own hook: this component only
 * owns the form and that confirmation step.
 */
export function PaymentRejectionForm({
  paymentLabel,
  busy,
  onReject,
  onCancel,
  setActionError,
}: {
  /** Card title, reused as the confirmation's subtitle. */
  paymentLabel: string;
  busy: boolean;
  onReject: (action: PaymentRejectionAction, reason: string) => Promise<boolean>;
  onCancel: () => void;
  setActionError: (message: string | null) => void;
}) {
  const fieldId = useId();
  const [action, setAction] = useState<PaymentRejectionAction>('request_new_proof');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const finalRejection = action === 'reject_dossier';

  function handleConfirm() {
    if (!reason.trim()) {
      setActionError('Un motif de rejet est requis.');
      return;
    }
    if (finalRejection) {
      setActionError(null);
      setConfirming(true);
      return;
    }
    void onReject(action, reason);
  }

  async function handleFinalRejection() {
    await onReject('reject_dossier', reason);
    // On success the card closes this form; on failure the error is shown
    // on the page and the form keeps the reason.
    setConfirming(false);
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="label" htmlFor={`${fieldId}-action`}>
          Action
        </label>
        <select
          id={`${fieldId}-action`}
          className="input"
          value={action}
          onChange={(e) => setAction(e.target.value as PaymentRejectionAction)}
        >
          <option value="request_new_proof">Demander une nouvelle preuve</option>
          <option value="reject_dossier">Rejeter le dossier (annulation définitive)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${fieldId}-reason`}>
          Motif
        </label>
        <textarea
          id={`${fieldId}-reason`}
          className="input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={finalRejection ? 'destructive' : 'secondary'}
          onClick={handleConfirm}
          disabled={busy}
        >
          {finalRejection ? 'Rejeter le dossier…' : 'Confirmer'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>

      {confirming ? (
        <DossierRejectionConfirmModal
          subtitle={paymentLabel}
          reason={reason}
          busy={busy}
          onConfirm={() => void handleFinalRejection()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
