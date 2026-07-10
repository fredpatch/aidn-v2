import { useState } from 'react';
import { CheckCircle2, Circle, Upload } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { API_ORIGIN } from '../constants';
import { formatDate } from '../helpers';
import { useFormalDocumentActions } from '../hooks/useFormalDocumentActions';
import type { FormalDocumentView } from '../types';

interface DocumentsChecklistCardProps {
  requestId: string | undefined;
  documents: FormalDocumentView[];
  completionRate: number;
  phaseClosed: boolean;
  setActionError: (message: string | null) => void;
}

export default function DocumentsChecklistCard({
  requestId,
  documents,
  completionRate,
  phaseClosed,
  setActionError,
}: DocumentsChecklistCardProps) {
  const { busy, submit } = useFormalDocumentActions(requestId, setActionError);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});

  async function handleSubmit(slot: string) {
    const file = slotFiles[slot];
    if (!file) return;
    const ok = await submit(slot, file);
    if (ok) {
      setUploadingSlot(null);
      setSlotFiles((prev) => {
        const n = { ...prev };
        delete n[slot];
        return n;
      });
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-anac-navy" />
          <span className="font-medium text-sm">Dossier de demande formelle</span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            completionRate === 11
              ? 'bg-anac-success/10 text-anac-success'
              : 'bg-anac-warning/10 text-anac-warning'
          }`}
        >
          {completionRate}/11
        </span>
      </div>

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
                <p
                  className={`text-xs leading-tight ${doc.status === 'submitted' ? 'text-anac-navy' : 'text-anac-navy'}`}
                >
                  {doc.label}
                </p>
                {doc.status === 'submitted' && doc.fileUrl && (
                  <p className="text-[10px] text-anac-muted mt-0.5">
                    Soumis le {formatDate(doc.submittedAt)} -{' '}
                    <a
                      href={`${API_ORIGIN}${doc.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-anac-blue"
                    >
                      voir le fichier
                    </a>
                    {!phaseClosed && (
                      <>
                        {' - '}
                        <button
                          type="button"
                          className="underline text-anac-muted"
                          onClick={() => setUploadingSlot(doc.slot)}
                        >
                          remplacer (DN uniquement)
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>

              {doc.status === 'missing' && uploadingSlot !== doc.slot && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1 flex-shrink-0"
                  onClick={() => setUploadingSlot(doc.slot)}
                >
                  <Upload size={11} /> Joindre
                </Button>
              )}
            </div>

            {uploadingSlot === doc.slot && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setSlotFiles((prev) => ({ ...prev, [doc.slot]: f }));
                  }}
                />
                <Button
                  size="sm"
                  disabled={!slotFiles[doc.slot] || busy}
                  onClick={() => handleSubmit(doc.slot)}
                >
                  {busy ? 'Envoi...' : 'Confirmer'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setUploadingSlot(null);
                    setSlotFiles((prev) => {
                      const n = { ...prev };
                      delete n[doc.slot];
                      return n;
                    });
                  }}
                >
                  Annuler
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
