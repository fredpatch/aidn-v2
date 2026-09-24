import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import type { S5PaymentQueueItem } from '../s5PaymentTypes';

export function S5RejectModal({
  task,
  busy,
  onClose,
  onSubmit,
}: {
  task: S5PaymentQueueItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (params: {
    action: 'request_new_proof' | 'reject_dossier';
    reason: string;
  }) => void;
}) {
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'request_new_proof' | 'reject_dossier'>('request_new_proof');

  return (
    <Modal
      title="Rejeter la preuve de paiement"
      subtitle={task.requestReference}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || busy}
            onClick={() => onSubmit({ action, reason })}
          >
            <XCircle size={14} aria-hidden="true" />
            {busy ? 'Rejet...' : 'Confirmer le rejet'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="label" htmlFor="rejection-action">Action apres rejet</label>
        <select
          id="rejection-action"
          value={action}
          disabled={busy}
          onChange={(event) => setAction(event.target.value as 'request_new_proof' | 'reject_dossier')}
          className="input"
        >
          <option value="request_new_proof">Demander une nouvelle preuve</option>
          <option value="reject_dossier">Rejeter le dossier</option>
        </select>
        <label className="label" htmlFor="rejection-reason">Motif</label>
        <textarea
          id="rejection-reason"
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          className="input min-h-24"
          placeholder="Expliquez ce qui rend la preuve non conforme..."
        />
      </div>
    </Modal>
  );
}
