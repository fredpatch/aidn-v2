import { Send } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { PHASE_LABELS } from '../s5PaymentLabels';
import type { S5PaymentQueueItem } from '../s5PaymentTypes';

export function S5InvoiceModal({
  task,
  file,
  busy,
  onFileChange,
  onClose,
  onSubmit,
}: {
  task: S5PaymentQueueItem;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="Joindre la facture transmise"
      subtitle={`${task.requestReference} - ${PHASE_LABELS[task.phaseCode]}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="label">Facture recue par S5</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          disabled={busy}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-anac-muted">
          Cette action enregistre la facture comme transmise au postulant.
        </p>
        {file ? <p className="text-xs font-medium text-anac-navy">{file.name}</p> : null}
      </div>
    </Modal>
  );
}
