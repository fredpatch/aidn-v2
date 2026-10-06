import { useState } from 'react';
import { CalendarClock, CheckCircle2, Circle, ClipboardList, FileCheck2, FileText, UploadCloud } from 'lucide-react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchFormalBundle,
  submitFormalDocument,
  submitFormalLetter,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { FormalBundle, FormalDoc } from '../../../lib/api/requests.types';
import { useReadOnly } from '../../../components/request/ReadOnlyContext';
import { usePhaseBundle } from '../hooks/usePhaseBundle';
import { PhaseLoadError } from '../../../components/request/PhaseLoadError';
import { MEETING_STATUS_LABELS, labelOf } from '../constants';
import { formatDate, formatDateTime } from '../../../lib/format';
import FileLink from '../../../components/files/FileLink';
import { FileDropzone, TEXT_DOCUMENT_ACCEPT } from '../../../components/files/FileDropzone';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep, stepState } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { MeetingDetails, isMeetingResolved } from '../../../components/request/MeetingDetails';

function letterLabel(status: string | undefined): string {
  if (!status) return 'À déposer';
  return (
    {
      submitted: 'Lettre reçue, en circuit de signature',
      in_signature_circuit: 'Lettre en signature',
      signed: 'Lettre signée, transmission en cours',
      pending_review: 'Retour signé reçu par la DN',
    }[status] ?? 'Statut inconnu'
  );
}

export function buildFormalPresentation(bundle: FormalBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const letterDone = bundle.letterCircuit?.status === 'pending_review';
  const docsDone = bundle.completionRate === 11;
  const meetingDone = !!bundle.meeting && isMeetingResolved(bundle.meeting.status);

  let title = 'Demande formelle ouverte';
  let description =
    "Cette phase rassemble votre lettre officielle, les pièces du dossier et la réunion formelle.";
  let tone: PhaseTone = 'info';

  if (phaseClosed) {
    title = 'Demande formelle clôturée';
    description = 'Votre dossier formel est complet et passe à la phase suivante.';
    tone = 'success';
  } else if (!bundle.letterCircuit) {
    title = 'Action requise';
    description = "Déposez votre lettre officielle de demande d'agrément OMA.";
    tone = 'warning';
  } else if (!letterDone) {
    title = 'Courrier en traitement';
    description =
      "Votre lettre suit le circuit de signature. La réunion formelle sera planifiée après le retour signé.";
    tone = 'info';
  } else if (!docsDone) {
    title = 'Pièces à compléter';
    description = `Déposez les pièces manquantes du dossier formel (${bundle.completionRate}/11).`;
    tone = 'warning';
  } else if (bundle.meeting?.status === 'scheduled') {
    title = 'Réunion formelle planifiée';
    description = "Consultez votre invitation et présentez-vous au rendez-vous indiqué.";
  } else if (!meetingDone) {
    title = 'Traitement ANAC en cours';
    description = "La DN poursuit la vérification du dossier et la préparation de la réunion.";
  } else {
    title = 'Conditions remplies';
    description = "Les éléments attendus sont disponibles. La DN peut clôturer la phase.";
    tone = 'success';
  }

  return {
    title,
    description,
    tone,
    steps: [
      {
        key: 'letter',
        label: 'Lettre officielle',
        detail: letterLabel(bundle.letterCircuit?.status),
        state: stepState(letterDone, !bundle.letterCircuit || !letterDone),
      },
      {
        key: 'documents',
        label: 'Pièces du dossier',
        detail: `${bundle.completionRate}/11 pièces déposées`,
        state: stepState(docsDone, !!bundle.letterCircuit && !docsDone),
      },
      {
        key: 'meeting',
        label: 'Réunion formelle',
        detail: bundle.meeting
          ? `${labelOf(MEETING_STATUS_LABELS, bundle.meeting.status)} - ${formatDateTime(bundle.meeting.scheduledAt)}`
          : letterDone
            ? 'En attente de planification'
            : 'En attente du retour signé',
        state: stepState(meetingDone || phaseClosed, letterDone && docsDone && !meetingDone && !phaseClosed),
      },
    ],
  };
}

/** One line for the collapsed row of a closed phase. */
export function summarizeFormal(bundle: FormalBundle): string {
  const parts = [letterLabel(bundle.letterCircuit?.status), `${bundle.completionRate}/11 pièces`];
  if (bundle.meeting) {
    parts.push(`réunion : ${labelOf(MEETING_STATUS_LABELS, bundle.meeting.status).toLowerCase()} (${formatDate(bundle.meeting.scheduledAt)})`);
  }
  return parts.join(' · ');
}

export function FormalPhaseSection({ requestId }: { requestId: number }) {
  const readOnly = useReadOnly();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [submittingLetter, setSubmittingLetter] = useState(false);
  const [submittingDoc, setSubmittingDoc] = useState(false);
  const { bundle, isLoading, loadFailed, isFetching, retry, invalidate } = usePhaseBundle(
    requestId,
    'M4',
    fetchFormalBundle,
  );

  if (isLoading) {
    return (
      <p className="text-xs text-anac-muted">Chargement de la demande formelle...</p>
    );
  }
  if (loadFailed) {
    return <PhaseLoadError phaseLabel="Demande formelle" onRetry={retry} retrying={isFetching} />;
  }

  if (!bundle?.phase) return null;

  async function handleSubmitLetter() {
    if (!letterFile) {
      notify.warning('Merci de joindre votre lettre de demande officielle.');
      return;
    }

    setSubmittingLetter(true);
    try {
      const uploaded = await uploadFile(letterFile);
      await submitFormalLetter(requestId, uploaded.uploadAssetId);
      notify.success('Lettre de demande soumise.');
      setLetterFile(null);
      await invalidate();
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
      await submitFormalDocument(requestId, slot, uploaded.uploadAssetId);
      notify.success('Document soumis.');
      setUploadingSlot(null);
      setSlotFiles((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      await invalidate();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre le document.'));
    } finally {
      setSubmittingDoc(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';
  const presentation = buildFormalPresentation(bundle);
  const missingDocs = bundle.documents.filter((doc) => doc.status === 'missing');
  const submittedDocs = bundle.documents.filter((doc) => doc.status === 'submitted');

  return (
    <section className="space-y-4">
      <PhaseSummaryCard
        phaseLabel="Demande formelle"
        title={presentation.title}
        description={presentation.description}
        tone={presentation.tone}
        closed={phaseClosed}
      >
        {presentation.steps.map((step) => (
          <PhaseStep key={step.key} label={step.label} detail={step.detail} state={step.state} />
        ))}
      </PhaseSummaryCard>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard icon={FileText} title="Lettre de demande officielle">

          {!bundle.letterCircuit && readOnly ? (
            <p className="mt-3 text-sm text-anac-muted">Aucune lettre déposée.</p>
          ) : !bundle.letterCircuit ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-anac-muted">
                Joignez votre lettre officielle de demande d&apos;agrément OMA.
              </p>
              <FileDropzone
                label="Déposer la lettre officielle"
                accept={TEXT_DOCUMENT_ACCEPT}
                file={letterFile}
                onFileChange={setLetterFile}
                disabled={submittingLetter}
              />
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                onClick={handleSubmitLetter}
                disabled={submittingLetter || !letterFile}
              >
                <UploadCloud size={13} aria-hidden="true" />
                {submittingLetter ? 'Envoi...' : 'Soumettre la lettre'}
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded border border-anac-success/30 bg-anac-success/5 p-3">
              <div className="flex items-start gap-2">
                <FileCheck2 size={16} className="mt-0.5 text-anac-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-anac-navy">
                    {letterLabel(bundle.letterCircuit.status)}
                  </p>
                  {bundle.letterCircuit.fileUrl && (
                    <FileLink
                      address={bundle.letterCircuit.fileUrl}
                      className="text-xs text-anac-blue underline"
                    >
                      Voir le fichier
                    </FileLink>
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={CalendarClock} title="Réunion formelle">

          {!bundle.meeting ? (
            <p className="mt-3 text-sm text-anac-muted">
              {bundle.letterCircuit?.status === 'pending_review'
                ? 'La réunion sera planifiée par la DN lorsque le dossier sera suffisamment avancé.'
                : 'La réunion sera planifiée après le retour signé de votre lettre officielle.'}
            </p>
          ) : (
            <MeetingDetails meeting={bundle.meeting} />
          )}
        </SectionCard>
      </div>

      <SectionCard
        icon={ClipboardList}
        title="Pièces du dossier formel"
        aside={
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              bundle.completionRate === 11
                ? 'bg-anac-success/10 text-anac-success'
                : 'bg-anac-warning/10 text-anac-warning'
            }`}
          >
            {bundle.completionRate}/11 déposées
          </span>
        }
      >

        {missingDocs.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-anac-navy">
              À déposer ({missingDocs.length})
            </p>
            {missingDocs.map((doc) => (
              <FormalDocumentRow
                key={doc.slot}
                doc={doc}
                uploadingSlot={uploadingSlot}
                selectedFile={slotFiles[doc.slot]}
                submitting={submittingDoc}
                onOpenUpload={() => setUploadingSlot(doc.slot)}
                onCancel={() => {
                  setUploadingSlot(null);
                  setSlotFiles((prev) => {
                    const next = { ...prev };
                    delete next[doc.slot];
                    return next;
                  });
                }}
                onFile={(file) =>
                  setSlotFiles((prev) => {
                    const next = { ...prev };
                    if (file) next[doc.slot] = file;
                    else delete next[doc.slot];
                    return next;
                  })
                }
                onSubmit={() => handleSubmitDocument(doc.slot)}
              />
            ))}
          </div>
        )}

        {submittedDocs.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-anac-navy">
              Déjà déposées ({submittedDocs.length})
            </p>
            {submittedDocs.map((doc) => (
              <div key={doc.slot} className="rounded border border-anac-success/20 p-2.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 flex-shrink-0 text-anac-success"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs leading-tight text-anac-navy">{doc.label}</p>
                    {doc.fileUrl && (
                      <FileLink
                        address={doc.fileUrl}
                        className="text-[10px] text-anac-blue underline"
                      >
                        Voir le fichier
                      </FileLink>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </section>
  );
}

function FormalDocumentRow({
  doc,
  uploadingSlot,
  selectedFile,
  submitting,
  onOpenUpload,
  onCancel,
  onFile,
  onSubmit,
}: {
  doc: FormalDoc;
  uploadingSlot: string | null;
  selectedFile: File | undefined;
  submitting: boolean;
  onOpenUpload: () => void;
  onCancel: () => void;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const readOnly = useReadOnly();
  const isUploading = uploadingSlot === doc.slot;

  return (
    <div className="rounded border border-anac-border p-2.5">
      <div className="flex items-start gap-2">
        <Circle size={14} className="mt-0.5 flex-shrink-0 text-anac-muted/50" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-tight text-anac-navy">{doc.label}</p>
        </div>
        {!isUploading && !readOnly && (
          <button
            type="button"
            className="flex-shrink-0 text-[10px] text-anac-blue underline"
            onClick={onOpenUpload}
          >
            Joindre
          </button>
        )}
      </div>

      {isUploading && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <div className="min-w-0 flex-1 basis-56">
            <FileDropzone
              compact
              label={`Fichier pour « ${doc.label} »`}
              file={selectedFile ?? null}
              onFileChange={onFile}
              disabled={submitting}
            />
          </div>
          <button
            type="button"
            className="btn-primary rounded px-2 py-1 text-[10px]"
            disabled={!selectedFile || submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Envoi...' : 'Soumettre'}
          </button>
          <button
            type="button"
            className="btn-secondary rounded px-2 py-1 text-[10px]"
            onClick={onCancel}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
