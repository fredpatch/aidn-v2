import { FormEvent, useState } from 'react';
import { Button } from '../../../../components/ui/button';
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

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    const ok = await close({ phaseId, note, file });
    if (ok) {
      setNote('');
      setFile(null);
    }
  }

  return (
    <form onSubmit={handleClose} className="card space-y-3">
      <span className="font-medium text-sm">Clôturer la phase — Demande formelle</span>
      <p className="text-anac-muted text-xs">Document et note sont tous les deux facultatifs.</p>
      <div>
        <label className="label">Note (optionnel)</label>
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Document joint (optionnel)</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Clôture...' : 'Clôturer la phase'}
      </Button>
    </form>
  );
}
