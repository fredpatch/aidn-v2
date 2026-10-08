import { useState } from 'react';
import { FileText } from 'lucide-react';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import { Button } from '../../../../components/ui/button';
import { formatDate } from '../helpers';
import { useDeclarationActions } from '../hooks/useDeclarationActions';
import type { EvaluationView, PreliminaryCircuitView } from '../types';
import { ClosedDossierNote, useDossierReadOnly } from '../../components/DossierReadOnly';

interface DeclarationCardProps {
  phaseId: number;
  evaluation: EvaluationView | null;
  circuit: PreliminaryCircuitView | null;
  meetingHeld: boolean;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

/** PRELIM-DG-CIRCUIT-1 - read-only; the mutation actions (print, confirm
 *  signature circuit, upload signed return) live only in "Courriers a
 *  traiter", never here. */
function circuitStatusLabel(status: string | undefined): string {
  if (!status) return 'En attente du formulaire du postulant';
  if (status === 'submitted') return 'Formulaire recu - en attente de mise en circuit';
  if (status === 'in_signature_circuit') return 'Formulaire en circuit de signature';
  if (status === 'pending_review') return 'Retour signe recu - traitement DN possible';
  return status;
}

export default function DeclarationCard({
  phaseId,
  evaluation,
  circuit,
  meetingHeld,
  requestId,
  setActionError,
}: DeclarationCardProps) {
  // K7b - closed dossier: the declaration stays viewable, no action.
  const readOnly = useDossierReadOnly();
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
        readOnly ? (
          <ClosedDossierNote>Declaration non mise a disposition - dossier clos.</ClosedDossierNote>
        ) : !meetingHeld ? (
          <p className="text-anac-muted text-sm">
            Disponible une fois la reunion preliminaire marquee &quot;Tenue&quot;.
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
            <>
              <p className="text-anac-success">
                Recue le {formatDate(evaluation.submittedAt)} -{' '}
                <DocumentPreviewLink
                  title="Formulaire soumis par le postulant"
                  url={evaluation.submittedFileUrl}
                  className="underline text-anac-blue"
                />
              </p>
              <p className={circuit?.status === 'pending_review' ? 'text-anac-success' : 'text-anac-muted'}>
                {circuitStatusLabel(circuit?.status)}
                {circuit?.status === 'pending_review' && circuit.fileUrl && (
                  <>
                    {' - '}
                    <DocumentPreviewLink
                      title="Retour signe / vise DG"
                      url={circuit.fileUrl}
                      className="underline text-anac-blue"
                    />
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={readOnly ? 'text-anac-muted' : 'text-anac-warning'}>
              {readOnly ? 'Aucun retour du postulant - dossier clos.' : 'En attente du retour du postulant'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
