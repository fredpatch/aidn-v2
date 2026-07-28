import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  UploadCloud,
} from 'lucide-react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchPreliminaryBundle,
  submitPreliminaryDeclaration,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { PreliminaryBundle } from '../../../lib/api/requests.types';
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function isMeetingResolved(status: string | undefined): boolean {
  return status === 'held' || status === 'no_show' || status === 'file_cancelled';
}

function buildStepState(done: boolean, current: boolean): StepState {
  if (done) return 'done';
  if (current) return 'current';
  return 'waiting';
}

function buildPreliminaryPresentation(bundle: PreliminaryBundle) {
  const meeting = bundle.meeting;
  const evaluation = bundle.evaluation;
  const phaseClosed = bundle.phase?.status === 'closed';
  const meetingScheduled = !!meeting && meeting.status === 'scheduled';
  const meetingDone = !!meeting && isMeetingResolved(meeting.status);
  const declarationAvailable = !!evaluation?.madeAvailableAt;
  const declarationSubmitted = !!evaluation?.submittedFileUrl;

  let title = 'Traitement preliminaire ouvert';
  let description = "La Direction de la Navigabilite a pris votre dossier en charge.";
  let tone: 'info' | 'warning' | 'success' | 'muted' = 'info';

  if (phaseClosed) {
    title = 'Phase preliminaire cloturee';
    description = 'Votre dossier passe a la phase suivante du traitement.';
    tone = 'success';
  } else if (declarationSubmitted) {
    title = 'Declaration recue';
    description = "Votre declaration remplie a ete transmise a l'ANAC.";
    tone = 'success';
  } else if (declarationAvailable) {
    title = 'Action requise';
    description = 'Telechargez le formulaire, remplissez-le, puis deposez votre declaration.';
    tone = 'warning';
  } else if (meetingScheduled) {
    title = 'Reunion preliminaire planifiee';
    description = "Consultez votre invitation et presentez-vous au rendez-vous indique.";
    tone = 'info';
  } else if (meetingDone) {
    title = 'Declaration en preparation';
    description = "L'ANAC prepare le formulaire de pre-evaluation a vous transmettre.";
    tone = 'info';
  } else {
    title = 'Reunion a planifier';
    description = "L'ANAC va planifier la reunion preliminaire et rendre l'invitation disponible ici.";
    tone = 'muted';
  }

  return {
    title,
    description,
    tone,
    steps: [
      {
        key: 'meeting',
        label: 'Reunion',
        detail: meeting
          ? `${MEETING_STATUS_LABELS[meeting.status] ?? meeting.status} - ${formatDateTime(meeting.scheduledAt)}`
          : 'En attente de planification',
        state: buildStepState(meetingDone, !meeting || meetingScheduled),
      },
      {
        key: 'declaration',
        label: 'Declaration',
        detail: declarationAvailable
          ? declarationSubmitted
            ? `Soumise le ${formatDate(evaluation?.submittedAt)}`
            : `Retour attendu avant le ${formatDate(evaluation?.returnDeadline)}`
          : 'Pas encore disponible',
        state: buildStepState(declarationSubmitted, declarationAvailable && !declarationSubmitted),
      },
      {
        key: 'closure',
        label: 'Suite du dossier',
        detail: phaseClosed ? 'Phase cloturee' : 'Traitement ANAC en cours',
        state: buildStepState(phaseClosed, declarationSubmitted && !phaseClosed),
      },
    ],
  };
}

export function PreliminaryPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<PreliminaryBundle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPreliminaryBundle(requestId);
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
        <p className="text-xs text-anac-muted">Chargement de la phase preliminaire...</p>
      </div>
    );
  }

  if (!bundle?.phase) return null;

  async function handleSubmitDeclaration() {
    if (!file) {
      notify.warning('Merci de joindre votre declaration remplie.');
      return;
    }
    const phaseId = bundle?.phase?.id;
    if (!phaseId) return;

    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await submitPreliminaryDeclaration(phaseId, uploaded.fileUrl, uploaded.mimeType);
      notify.success('Declaration soumise avec succes.');
      setFile(null);
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la declaration.'));
    } finally {
      setSubmitting(false);
    }
  }

  const presentation = buildPreliminaryPresentation(bundle);
  const meeting = bundle.meeting;
  const evaluation = bundle.evaluation;
  const phaseClosed = bundle.phase.status === 'closed';
  const declarationAvailable = !!evaluation?.madeAvailableAt;
  const declarationSubmitted = !!evaluation?.submittedFileUrl;

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
          <div className="min-w-0">
            <p className="text-sm font-semibold text-anac-navy">Phase preliminaire</p>
            <h3 className="mt-1 text-base font-semibold text-anac-navy">
              {presentation.title}
            </h3>
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
            <CalendarClock size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Reunion preliminaire</p>
          </div>

          {!meeting ? (
            <p className="mt-3 text-sm text-anac-muted">
              La reunion n'est pas encore planifiee. L'invitation apparaitra ici des qu'elle sera
              disponible.
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="text-anac-muted">Date : </span>
                <span className="font-medium text-anac-navy">
                  {formatDateTime(meeting.scheduledAt)}
                </span>
              </p>
              {meeting.location && (
                <p>
                  <span className="text-anac-muted">Lieu : </span>
                  <span className="font-medium text-anac-navy">{meeting.location}</span>
                </p>
              )}
              <p>
                <span className="text-anac-muted">Statut : </span>
                <span className="font-medium text-anac-navy">
                  {MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
                </span>
              </p>
              {meeting.status === 'scheduled' && (
                <a
                  href={`/api/meetings/${meeting.id}/ticket`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
                >
                  Voir mon invitation
                </a>
              )}
              {meeting.crDocumentUrl && (
                <a
                  href={fileHref(meeting.crDocumentUrl)}
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

        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <FileText size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Declaration de pre-evaluation</p>
          </div>

          {!declarationAvailable ? (
            <p className="mt-3 text-sm text-anac-muted">
              Le formulaire sera disponible apres la reunion preliminaire.
            </p>
          ) : declarationSubmitted ? (
            <div className="mt-3 rounded border border-anac-success/30 bg-anac-success/5 p-3">
              <div className="flex items-start gap-2">
                <FileCheck2 size={16} className="mt-0.5 text-anac-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-anac-navy">Declaration soumise</p>
                  <p className="text-xs text-anac-muted">
                    Transmise le {formatDate(evaluation?.submittedAt)}. L'ANAC poursuit le
                    traitement.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-anac-muted">
                Retour attendu avant le {formatDate(evaluation?.returnDeadline)}.
              </p>
              {evaluation?.templateFileUrl && (
                <a
                  href={fileHref(evaluation.templateFileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
                >
                  Telecharger le formulaire vierge
                </a>
              )}
              <div className="rounded border border-dashed border-anac-border p-3">
                <label className="flex cursor-pointer flex-col gap-1 text-sm">
                  <span className="font-medium text-anac-navy">Deposer ma declaration remplie</span>
                  <span className="text-xs text-anac-muted">
                    Formats acceptes : PDF, Word, PNG ou JPG.
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="mt-2 text-xs"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                  onClick={handleSubmitDeclaration}
                  disabled={submitting || !file}
                >
                  <UploadCloud size={13} aria-hidden="true" />
                  {submitting ? 'Envoi...' : 'Soumettre ma declaration'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
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
  const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? Clock3 : ClipboardCheck;
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
