import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { formatDate } from '../helpers';
import { useDeclarationActions } from '../hooks/useDeclarationActions';
import type { EvaluationView } from '../types';

interface DeclarationCardProps {
  phaseId: number;
  evaluation: EvaluationView | null;
  meetingHeld: boolean;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function DeclarationCard({
  phaseId,
  evaluation,
  meetingHeld,
  requestId,
  setActionError,
}: DeclarationCardProps) {
  const [returnDays, setReturnDays] = useState('');
  const { busy, makeAvailable } = useDeclarationActions(setActionError, requestId);

  async function handleMakeAvailable() {
    const parsedReturnDays = returnDays ? Number(returnDays) : undefined;
    const ok = await makeAvailable(phaseId, parsedReturnDays);
    if (ok) {
      setReturnDays('');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Declaration de pre-evaluation</span>
      </div>

      {!evaluation?.madeAvailableAt ? (
        !meetingHeld ? (
          <p className="text-anac-muted text-sm">
            Disponible une fois la reunion preliminaire marquee "Tenue".
          </p>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="label">Delai de retour (jours, optionnel - 15 par defaut)</label>
              <input
                type="number"
                className="input"
                value={returnDays}
                onChange={(e) => setReturnDays(e.target.value)}
                placeholder="15"
              />
            </div>
            <Button size="sm" onClick={handleMakeAvailable} disabled={busy}>
              Rendre disponible au postulant
            </Button>
          </div>
        )
      ) : (
        <div className="text-sm space-y-1">
          <p>
            Mise a disposition le {formatDate(evaluation.madeAvailableAt)}, retour attendu avant le{' '}
            {formatDate(evaluation.returnDeadline)}
          </p>
          {evaluation.submittedFileUrl ? (
            <p className="text-anac-success">
              Recue le {formatDate(evaluation.submittedAt)} -{' '}
              <a
                href={`http://localhost:4000${evaluation.submittedFileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                voir le fichier
              </a>
            </p>
          ) : (
            <p className="text-anac-warning">En attente du retour du postulant</p>
          )}
        </div>
      )}
    </div>
  );
}
