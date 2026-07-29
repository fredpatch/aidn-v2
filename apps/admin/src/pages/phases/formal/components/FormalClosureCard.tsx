import { FormEvent, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { useFormalCloseAction } from '../hooks/useFormalCloseAction';

interface FormalClosureCardProps {
  phaseId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function FormalClosureCard({
  phaseId,
  requestId,
  setActionError,
}: FormalClosureCardProps) {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { busy, close } = useFormalCloseAction(requestId, setActionError);

  async function handleClose(event: FormEvent) {
    event.preventDefault();
    const ok = await close({ phaseId, note, file });
    if (ok) {
      setNote('');
      setFile(null);
    }
  }

  return (
    <CollapsibleCard
      title="Cloturer la phase - Demande formelle"
      icon={<LockKeyhole size={16} className="text-anac-navy" />}
      defaultOpen
      resetKey={busy}
    >
      <form onSubmit={handleClose} className="space-y-3">
        <p className="text-anac-muted text-xs">Document et note sont tous les deux facultatifs.</p>
        <div>
          <label className="label">Note (optionnel)</label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div>
          <label className="label">Document joint (optionnel)</label>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Cloture...' : 'Cloturer la phase'}
        </Button>
      </form>
    </CollapsibleCard>
  );
}
