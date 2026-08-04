import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import DocumentFileIcon from '../../../../components/documents/DocumentFileIcon';
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
  const [showAll, setShowAll] = useState(false);
  const visibleDocuments = showAll ? documents : documents.slice(0, 4);
  const hiddenCount = Math.max(documents.length - visibleDocuments.length, 0);

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
        {visibleDocuments.map((doc) => (
          <div key={doc.slot} className="rounded border border-anac-border px-3 py-2.5">
            <div className="flex items-start gap-3">
              <DocumentFileIcon fileUrl={doc.fileUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs leading-tight text-anac-navy">{doc.label}</p>
                    <p className="mt-1 text-[10px] font-medium text-anac-muted">
                      {doc.status === 'submitted' ? 'Depose' : 'Manquant'} - Obligatoire
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                      doc.status === 'submitted'
                        ? 'bg-anac-success/10 text-anac-success'
                        : 'bg-anac-muted/10 text-anac-muted'
                    }`}
                  >
                    {doc.status === 'submitted' ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : (
                      <Circle size={12} aria-hidden="true" />
                    )}
                    {doc.status === 'submitted' ? 'Depose' : 'Manquant'}
                  </span>
                </div>
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

      {documents.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="text-xs font-medium text-anac-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
        >
          {showAll ? 'Afficher moins' : `Afficher les ${hiddenCount} autres documents`}
        </button>
      )}
    </CollapsibleCard>
  );
}
