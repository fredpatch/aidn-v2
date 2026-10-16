import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

/** Generic one-file upload dialog (courrier DG return, Directeur DN return,
 *  Finance invoice). Wording and business rules stay in the pages. */
export function CockpitUploadModal({
  title, subtitle, label, accept, hint, submitLabel, busySubmitLabel, file, busy, onFileChange, onClose, onSubmit,
}: {
  title: string;
  subtitle: string;
  label: string;
  accept: string;
  hint?: string;
  submitLabel: string;
  busySubmitLabel: string;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? busySubmitLabel : submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="label">{label}</label>
        <input type="file" accept={accept} disabled={busy} onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        {file ? <p className="text-xs text-anac-muted">{file.name}</p> : null}
        {hint ? <p className="text-xs text-anac-muted">{hint}</p> : null}
      </div>
    </Modal>
  );
}
