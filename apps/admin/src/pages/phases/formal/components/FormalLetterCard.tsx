import { FileText } from 'lucide-react';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { API_ORIGIN, CIRCUIT_STATUS_LABELS, CIRCUIT_STATUS_TONES } from '../constants';
import { formatDate } from '../helpers';
import type { FormalLetterCircuitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface FormalLetterCardProps {
  circuit: FormalLetterCircuitView | null;
}

export default function FormalLetterCard({ circuit }: FormalLetterCardProps) {
  return (
    <CollapsibleCard
      title="Lettre de demande officielle - Circuit signature"
      icon={<FileText size={16} className="text-anac-navy" />}
      defaultOpen={circuit?.status !== 'pending_review'}
      resetKey={circuit?.status ?? 'missing'}
    >
      {!circuit ? (
        <div className="space-y-2">
          <p className="text-anac-muted text-sm">
            Le postulant doit soumettre sa lettre de demande officielle d'agrement d'OMA.
          </p>
          <p className="text-anac-muted text-xs">
            Apres depot, reception / assistant DG gere l'impression, la mise en signature et le
            scan du retour signe depuis l'ecran Courriers a traiter.
          </p>
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
                Document courant le {formatDate(circuit.currentVersionUploadedAt)} -{' '}
                <DocumentPreviewLink
                  title="Lettre de demande officielle"
                  url={`${API_ORIGIN}${circuit.fileUrl}`}
                  label="ouvrir la lettre"
                />
                {circuit.hasPreviousVersions &&
                  ` - ${circuit.versionCount} versions conservees dans l'historique.`}
              </>
            ) : (
              'Document de circuit non disponible.'
            )}
          </p>

          {circuit.status === 'submitted' && (
            <p className="text-anac-muted text-xs">
              Courrier recu. Reception / assistant DG doit l'imprimer et confirmer sa mise en
              signature.
            </p>
          )}

          {circuit.status === 'in_signature_circuit' && (
            <p className="text-anac-warning text-xs">
              Lettre en signature. DN attend le scan du retour signe.
            </p>
          )}

          {circuit.status === 'signed' && (
            <p className="text-anac-warning text-xs">
              Ancien statut intermediaire. Finalisez le retour depuis Courriers a traiter.
            </p>
          )}

          {circuit.status === 'pending_review' && (
            <p className="text-anac-success text-xs">
              Retour signe recu. DN peut poursuivre le traitement formel.
            </p>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
