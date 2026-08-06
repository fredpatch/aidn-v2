import { Send } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import type { CourrierTask } from '../../../lib/api/courrier-tasks';

const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
};

export function ReturnSignedModal({
  task,
  file,
  busy,
  onFileChange,
  onClose,
  onSubmit,
}: {
  task: CourrierTask;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="Scanner le retour signe"
      subtitle={`${SOURCE_LABELS[task.source]} - ${task.requestReference}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer le retour'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="label">Document signe</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          disabled={busy}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        {file ? <p className="text-xs text-anac-muted">{file.name}</p> : null}
      </div>
    </Modal>
  );
}
