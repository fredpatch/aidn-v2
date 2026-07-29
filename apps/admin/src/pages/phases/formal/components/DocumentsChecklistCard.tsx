import { CheckCircle2, Circle } from 'lucide-react';
import DocumentPreviewLink from '../../../../components/documents/DocumentPreviewLink';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { API_ORIGIN } from '../constants';
import { formatDate } from '../helpers';
import type { FormalDocumentView } from '../types';

interface DocumentsChecklistCardProps {
  documents: FormalDocumentView[];
  completionRate: number;
  phaseClosed: boolean;
}

export default function DocumentsChecklistCard({
  documents,
  completionRate,
  phaseClosed,
}: DocumentsChecklistCardProps) {
  const isComplete = completionRate === 11 || phaseClosed;

  return (
    <CollapsibleCard
      title="Dossier de demande formelle"
      icon={<CheckCircle2 size={16} className="text-anac-navy" />}
      defaultOpen={!isComplete}
      resetKey={`${completionRate}-${phaseClosed}`}
      badge={
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            completionRate === 11
              ? 'bg-anac-success/10 text-anac-success'
              : 'bg-anac-warning/10 text-anac-warning'
          }`}
        >
          Deposes {completionRate}/11
        </span>
      }
    >

      <p className="text-xs text-anac-muted">
        Ces pieces sont deposees par le postulant depuis le portail. DN les consulte et poursuit la
        revue, sans joindre ni remplacer les fichiers a sa place.
      </p>

      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.slot} className="border border-anac-border rounded p-3 space-y-2">
            <div className="flex items-start gap-2">
              {doc.status === 'submitted' ? (
                <CheckCircle2 size={14} className="text-anac-success flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={14} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-tight text-anac-navy">{doc.label}</p>
                <p className="mt-1 text-[10px] font-medium text-anac-muted">
                  {doc.status === 'submitted' ? 'Depose' : 'Manquant'} - Obligatoire
                </p>
                {doc.status === 'submitted' && doc.fileUrl && (
                  <p className="text-[10px] text-anac-muted mt-0.5">
                    Version actuelle deposee le{' '}
                    {formatDate(doc.currentVersionUploadedAt ?? doc.submittedAt)} -{' '}
                    <DocumentPreviewLink
                      title={doc.label}
                      url={`${API_ORIGIN}${doc.fileUrl}`}
                      label="ouvrir ce document"
                    />
                  </p>
                )}
                {doc.status === 'submitted' && (
                  <p className="text-[10px] text-anac-muted mt-0.5">
                    {doc.hasPreviousVersions
                      ? `${doc.versionCount} versions conservees dans l'historique du dossier.`
                      : 'Version initiale du dossier.'}
                  </p>
                )}
                {doc.status === 'submitted' && !doc.fileUrl && (
                  <p className="text-[10px] text-anac-warning mt-0.5">
                    Fichier courant indisponible.
                  </p>
                )}
                {doc.status === 'missing' && !phaseClosed && (
                  <p className="text-[10px] text-anac-muted mt-0.5">
                    En attente de depot par le postulant.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}
