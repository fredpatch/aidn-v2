import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileCheck2,
  FileText,
  UploadCloud,
} from 'lucide-react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchFormalBundle,
  submitFormalDocument,
  submitFormalLetter,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { FormalBundle, FormalDoc } from '../../../lib/api/requests.types';
import { MEETING_STATUS_LABELS } from '../constants';

type StepState = 'done' | 'current' | 'waiting';

function fileHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' && parsed.port === '4000') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Relative URLs are already ideal for the portal dev proxy.
  }
  return url;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function isMeetingResolved(status: string | undefined): boolean {
  return status === 'held' || status === 'no_show' || status === 'file_cancelled';
}

function stepState(done: boolean, current: boolean): StepState {
  if (done) return 'done';
  if (current) return 'current';
  return 'waiting';
}

function letterLabel(status: string | undefined): string {
  if (!status) return 'A deposer';
  return (
    {
      submitted: 'Lettre recue, en circuit de signature',
      in_signature_circuit: 'Lettre en signature',
      signed: 'Lettre signee, transmission en cours',
      pending_review: 'Retour signe recu par la DN',
    }[status] ?? status
  );
}

function buildFormalPresentation(bundle: FormalBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const letterDone = bundle.letterCircuit?.status === 'pending_review';
  const docsDone = bundle.completionRate === 11;
  const meetingDone = !!bundle.meeting && isMeetingResolved(bundle.meeting.status);

  let title = 'Demande formelle ouverte';
  let description =
    "Cette phase rassemble votre lettre officielle, les pieces du dossier et la reunion formelle.";
  let tone: 'info' | 'warning' | 'success' | 'muted' = 'info';

  if (phaseClosed) {
    title = 'Demande formelle cloturee';
    description = 'Votre dossier formel est complet et passe a la phase suivante.';
    tone = 'success';
  } else if (!bundle.letterCircuit) {
    title = 'Action requise';
    description = "Deposez votre lettre officielle de demande d'agrement OMA.";
    tone = 'warning';
  } else if (!letterDone) {
    title = 'Courrier en traitement';
    description =
      "Votre lettre suit le circuit de signature. La reunion formelle sera planifiee apres le retour signe.";
    tone = 'info';
  } else if (!docsDone) {
    title = 'Pieces a completer';
    description = `Deposez les pieces manquantes du dossier formel (${bundle.completionRate}/11).`;
    tone = 'warning';
  } else if (bundle.meeting?.status === 'scheduled') {
    title = 'Reunion formelle planifiee';
    description = "Consultez votre invitation et presentez-vous au rendez-vous indique.";
  } else if (!meetingDone) {
    title = 'Traitement ANAC en cours';
    description = "La DN poursuit la verification du dossier et la preparation de la reunion.";
  } else {
    title = 'Conditions remplies';
    description = "Les elements attendus sont disponibles. La DN peut cloturer la phase.";
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
        label: 'Pieces du dossier',
        detail: `${bundle.completionRate}/11 pieces deposees`,
        state: stepState(docsDone, !!bundle.letterCircuit && !docsDone),
      },
      {
        key: 'meeting',
        label: 'Reunion formelle',
        detail: bundle.meeting
          ? `${MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status} - ${formatDateTime(bundle.meeting.scheduledAt)}`
          : letterDone
            ? 'En attente de planification'
            : 'En attente du retour signe',
        state: stepState(meetingDone || phaseClosed, letterDone && docsDone && !meetingDone && !phaseClosed),
      },
    ],
  };
}

export function FormalPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<FormalBundle | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [submittingLetter, setSubmittingLetter] = useState(false);
  const [submittingDoc, setSubmittingDoc] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchFormalBundle(requestId);
      setBundle(data);
    } catch {
      // Silently ignore so section remains hidden until the phase exists.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  if (loading && !bundle) {
    return (
      <div className="border-t border-anac-border pt-4 mt-4">
        <p className="text-xs text-anac-muted">Chargement de la demande formelle...</p>
      </div>
    );
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
  const presentation = buildFormalPresentation(bundle);
  const missingDocs = bundle.documents.filter((doc) => doc.status === 'missing');
  const submittedDocs = bundle.documents.filter((doc) => doc.status === 'submitted');

  return (
    <section className="border-t border-anac-border pt-4 mt-4 space-y-4">
      <div
        className={`rounded-lg border p-4 ${
          presentation.tone === 'warning'
            ? 'border-anac-warning/40 bg-anac-warning/5'
            : presentation.tone === 'success'
              ? 'border-anac-success/30 bg-anac-success/5'
              : 'border-anac-border bg-white'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-anac-navy">Demande formelle</p>
            <h3 className="mt-1 text-base font-semibold text-anac-navy">{presentation.title}</h3>
            <p className="mt-1 text-sm text-anac-muted">{presentation.description}</p>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              phaseClosed
                ? 'bg-anac-success/10 text-anac-success'
                : 'bg-anac-info/10 text-anac-info'
            }`}
          >
            {phaseClosed ? 'Cloturee' : 'En cours'}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {presentation.steps.map((step) => (
            <PhaseStep key={step.key} label={step.label} detail={step.detail} state={step.state} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <FileText size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Lettre de demande officielle</p>
          </div>

          {!bundle.letterCircuit ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-anac-muted">
                Joignez votre lettre officielle de demande d'agrement OMA.
              </p>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="text-xs"
                onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
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
                    <a
                      href={fileHref(bundle.letterCircuit.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-anac-blue underline"
                    >
                      Voir le fichier
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <CalendarClock size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Reunion formelle</p>
          </div>

          {!bundle.meeting ? (
            <p className="mt-3 text-sm text-anac-muted">
              {bundle.letterCircuit?.status === 'pending_review'
                ? 'La reunion sera planifiee par la DN lorsque le dossier sera suffisamment avance.'
                : 'La reunion sera planifiee apres le retour signe de votre lettre officielle.'}
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="text-anac-muted">Date : </span>
                <span className="font-medium text-anac-navy">
                  {formatDateTime(bundle.meeting.scheduledAt)}
                </span>
              </p>
              {bundle.meeting.location && (
                <p>
                  <span className="text-anac-muted">Lieu : </span>
                  <span className="font-medium text-anac-navy">{bundle.meeting.location}</span>
                </p>
              )}
              <p>
                <span className="text-anac-muted">Statut : </span>
                <span className="font-medium text-anac-navy">
                  {MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status}
                </span>
              </p>
              {bundle.meeting.status === 'scheduled' && (
                <a
                  href={`/api/meetings/${bundle.meeting.id}/ticket`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
                >
                  Voir mon invitation
                </a>
              )}
              {bundle.meeting.crDocumentUrl && (
                <a
                  href={fileHref(bundle.meeting.crDocumentUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-xs text-anac-blue underline"
                >
                  Consulter le compte-rendu
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-anac-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-anac-navy">
            <ClipboardList size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Pieces du dossier formel</p>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              bundle.completionRate === 11
                ? 'bg-anac-success/10 text-anac-success'
                : 'bg-anac-warning/10 text-anac-warning'
            }`}
          >
            {bundle.completionRate}/11 deposees
          </span>
        </div>

        {missingDocs.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-anac-navy">
              A deposer ({missingDocs.length})
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
                onFile={(file) => setSlotFiles((prev) => ({ ...prev, [doc.slot]: file }))}
                onSubmit={() => handleSubmitDocument(doc.slot)}
              />
            ))}
          </div>
        )}

        {submittedDocs.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-anac-navy">
              Deja deposees ({submittedDocs.length})
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
                      <a
                        href={fileHref(doc.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-anac-blue underline"
                      >
                        Voir le fichier
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
  onFile: (file: File) => void;
  onSubmit: () => void;
}) {
  const isUploading = uploadingSlot === doc.slot;

  return (
    <div className="rounded border border-anac-border p-2.5">
      <div className="flex items-start gap-2">
        <Circle size={14} className="mt-0.5 flex-shrink-0 text-anac-muted/50" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-tight text-anac-navy">{doc.label}</p>
        </div>
        {!isUploading && (
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
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            className="text-xs"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) onFile(selected);
            }}
          />
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

function PhaseStep({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: StepState;
}) {
  const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? Circle : ClipboardList;
  const tone =
    state === 'done'
      ? 'border-anac-success/30 bg-white text-anac-success'
      : state === 'current'
        ? 'border-anac-warning/40 bg-white text-anac-warning'
        : 'border-anac-border bg-white text-anac-muted';

  return (
    <div className={`rounded border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} aria-hidden="true" />
        <p className="text-xs font-semibold text-anac-navy">{label}</p>
      </div>
      <p className="mt-1 text-xs text-anac-muted">{detail}</p>
    </div>
  );
}
