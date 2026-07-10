import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchFormalBundle,
  submitFormalDocument,
  submitFormalLetter,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { FormalBundle } from '../../../lib/api/requests.types';
import { API_ORIGIN, MEETING_STATUS_LABELS } from '../constants';

export function FormalPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<FormalBundle | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [submittingLetter, setSubmittingLetter] = useState(false);
  const [submittingDoc, setSubmittingDoc] = useState(false);

  async function load() {
    try {
      const data = await fetchFormalBundle(requestId);
      setBundle(data);
    } catch {
      // Silently ignore so section remains hidden until the phase exists.
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  if (!bundle?.phase) return null;

  async function handleSubmitLetter() {
    if (!letterFile) {
      notify.warning('Merci de joindre votre lettre de demande officielle.');
      return;
    }

    setSubmittingLetter(true);
    try {
      const uploaded = await uploadFile(letterFile);
      await submitFormalLetter(requestId, uploaded.fileUrl, uploaded.mimeType);
      notify.success('Lettre de demande soumise.');
      setLetterFile(null);
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la lettre.'));
    } finally {
      setSubmittingLetter(false);
    }
  }

  async function handleSubmitDocument(slot: string) {
    const file = slotFiles[slot];
    if (!file) return;

    setSubmittingDoc(true);
    try {
      const uploaded = await uploadFile(file);
      await submitFormalDocument(requestId, slot, uploaded.fileUrl, uploaded.mimeType);
      notify.success('Document soumis.');
      setUploadingSlot(null);
      setSlotFiles((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre le document.'));
    } finally {
      setSubmittingDoc(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Phase - Demande Formelle</p>
        <span
          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
            phaseClosed
              ? 'bg-anac-muted/10 text-anac-muted'
              : 'bg-anac-success/10 text-anac-success'
          }`}
        >
          {phaseClosed ? 'Clôturée' : 'En cours'}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-anac-navy">Lettre de demande officielle</p>
        {!bundle.letterCircuit ? (
          <div className="space-y-2">
            <p className="text-anac-muted text-xs">
              Joignez votre lettre officielle de demande d&apos;agrément d&apos;OMA.
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
            />
            <button
              className="btn-primary text-xs px-3 py-1.5 rounded"
              onClick={handleSubmitLetter}
              disabled={submittingLetter || !letterFile}
            >
              {submittingLetter ? 'Envoi...' : 'Soumettre'}
            </button>
          </div>
        ) : (
          <p
            className={`text-xs ${
              bundle.letterCircuit.status === 'pending_review'
                ? 'text-anac-success'
                : 'text-anac-muted'
            }`}
          >
            {{
              submitted: 'Lettre reçue - en attente de signature DG.',
              signed: 'Lettre signée - en cours de transmission à la DN.',
              pending_review: 'Lettre transmise à la Direction de la Navigabilité.',
            }[bundle.letterCircuit.status] ?? bundle.letterCircuit.status}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-anac-navy">Dossier complet</p>
          <span
            className={`text-[10px] font-medium ${
              bundle.completionRate === 11 ? 'text-anac-success' : 'text-anac-warning'
            }`}
          >
            {bundle.completionRate}/11
          </span>
        </div>

        <div className="space-y-1.5">
          {bundle.documents.map((doc) => (
            <div key={doc.slot} className="border border-anac-border rounded p-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <span
                  className={`text-xs mt-0.5 flex-shrink-0 ${
                    doc.status === 'submitted' ? 'text-anac-success' : 'text-anac-muted/50'
                  }`}
                >
                  {doc.status === 'submitted' ? '✓' : '○'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-tight">{doc.label}</p>
                  {doc.status === 'submitted' && doc.fileUrl && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <a
                        href={`${API_ORIGIN}${doc.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-anac-blue underline"
                      >
                        Voir le fichier
                      </a>
                    </div>
                  )}
                </div>
                {doc.status === 'missing' && uploadingSlot !== doc.slot && (
                  <button
                    type="button"
                    className="text-[10px] text-anac-blue underline flex-shrink-0"
                    onClick={() => setUploadingSlot(doc.slot)}
                  >
                    Joindre
                  </button>
                )}
              </div>

              {uploadingSlot === doc.slot && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="text-xs"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) {
                        setSlotFiles((prev) => ({ ...prev, [doc.slot]: selectedFile }));
                      }
                    }}
                  />
                  <button
                    className="btn-primary text-[10px] px-2 py-1 rounded"
                    disabled={!slotFiles[doc.slot] || submittingDoc}
                    onClick={() => handleSubmitDocument(doc.slot)}
                  >
                    {submittingDoc ? '...' : 'OK'}
                  </button>
                  <button
                    className="btn-secondary text-[10px] px-2 py-1 rounded"
                    onClick={() => {
                      setUploadingSlot(null);
                      setSlotFiles((prev) => {
                        const next = { ...prev };
                        delete next[doc.slot];
                        return next;
                      });
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {bundle.meeting && (
        <div className="text-sm space-y-1">
          <p className="text-xs font-medium text-anac-navy">Réunion formelle</p>
          <p>
            {new Date(bundle.meeting.scheduledAt).toLocaleString('fr-FR')}
            {bundle.meeting.location && ` - ${bundle.meeting.location}`}
          </p>
          <p>
            Statut :{' '}
            <span className="font-medium">
              {MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status}
            </span>
          </p>
          {bundle.meeting.status === 'scheduled' && (
            <a
              href={`${API_ORIGIN}/api/meetings/${bundle.meeting.id}/ticket`}
              target="_blank"
              rel="noreferrer"
              className="text-anac-blue underline text-xs"
            >
              Voir mon invitation
            </a>
          )}
          {bundle.meeting.crDocumentUrl && (
            <a
              href={`${API_ORIGIN}${bundle.meeting.crDocumentUrl}`}
              target="_blank"
              rel="noreferrer"
              className="text-anac-blue underline text-xs block"
            >
              Consulter le compte-rendu de la réunion
            </a>
          )}
        </div>
      )}
    </div>
  );
}
