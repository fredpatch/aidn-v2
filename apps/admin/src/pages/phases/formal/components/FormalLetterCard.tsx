import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { API_ORIGIN, CIRCUIT_STATUS_LABELS, CIRCUIT_STATUS_TONES } from '../constants';
import { formatDate } from '../helpers';
import { useFormalLetterActions } from '../hooks/useFormalLetterActions';
import type { FormalLetterCircuitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface FormalLetterCardProps {
  requestId: string | undefined;
  circuit: FormalLetterCircuitView | null;
  canManage: boolean;
  setActionError: (message: string | null) => void;
}

export default function FormalLetterCard({
  requestId,
  circuit,
  canManage,
  setActionError,
}: FormalLetterCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const { busy, submit, sign, transmit } = useFormalLetterActions(requestId, setActionError);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Lettre de demande officielle - Circuit signature</span>
      </div>

      {!circuit ? (
        <div className="space-y-2">
          <p className="text-anac-muted text-sm">
            Le postulant doit soumettre sa lettre de demande officielle d&apos;agrément d&apos;OMA.
          </p>
          <p className="text-anac-muted text-xs">
            Saisie manuelle par la DN après dépôt physique au guichet.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              disabled={!canManage}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              size="sm"
              disabled={!file || busy || !canManage}
              onClick={() => file && submit(file)}
            >
              Soumettre
            </Button>
          </div>
          {!canManage && (
            <p className="text-anac-muted text-xs">Action réservée à la DN.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <PhaseStatusBadge
            status={circuit.status}
            label={CIRCUIT_STATUS_LABELS[circuit.status] ?? circuit.status}
            toneMap={CIRCUIT_STATUS_TONES}
            fallbackTone="bg-anac-info/10 text-anac-info"
          />

          <p className="text-anac-muted text-xs">
            {circuit.fileUrl ? (
              <>
                Document de circuit joint le{' '}
                {formatDate(circuit.currentVersionUploadedAt)} -{' '}
                <a
                  href={`${API_ORIGIN}${circuit.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-anac-blue"
                >
                  ouvrir la lettre
                </a>
                {circuit.hasPreviousVersions &&
                  ` - ${circuit.versionCount} versions conservées dans l'historique.`}
              </>
            ) : (
              'Document de circuit non disponible.'
            )}
          </p>

          {circuit.status === 'submitted' && (
            <Button size="sm" variant="secondary" onClick={sign} disabled={busy || !canManage}>
              Marquer signee
            </Button>
          )}

          {circuit.status === 'signed' && (
            <Button size="sm" variant="secondary" onClick={transmit} disabled={busy || !canManage}>
              Transmettre à la DN
            </Button>
          )}

          {circuit.status === 'pending_review' && (
            <p className="text-anac-success text-xs">
              Lettre transmise à la Direction de la Navigabilité.
            </p>
          )}

          {!canManage && circuit.status !== 'pending_review' && (
            <p className="text-anac-muted text-xs">Action réservée à la DN.</p>
          )}
        </div>
      )}
    </div>
  );
}
