import { useEffect, useState } from 'react';
import { CalendarClock, FileCheck2, FileText, UploadCloud } from 'lucide-react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchPreliminaryBundle,
  submitPreliminaryDeclaration,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { PreliminaryBundle } from '../../../lib/api/requests.types';
import { MEETING_STATUS_LABELS, labelOf } from '../constants';
import { formatDate, formatDateTime } from '../../../lib/format';
import FileLink from '../../../components/files/FileLink';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep, stepState } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { MeetingDetails, isMeetingResolved } from '../../../components/request/MeetingDetails';

function buildPreliminaryPresentation(bundle: PreliminaryBundle) {
  const meeting = bundle.meeting;
  const evaluation = bundle.evaluation;
  const phaseClosed = bundle.phase?.status === 'closed';
  const meetingScheduled = !!meeting && meeting.status === 'scheduled';
  const meetingDone = !!meeting && isMeetingResolved(meeting.status);
  const declarationAvailable = !!evaluation?.madeAvailableAt;
  const declarationSubmitted = !!evaluation?.submittedFileUrl;

  let title = 'Traitement préliminaire ouvert';
  let description = "La Direction de la Navigabilité a pris votre dossier en charge.";
  let tone: PhaseTone = 'info';

  if (phaseClosed) {
    title = 'Phase préliminaire clôturée';
    description = 'Votre dossier passe à la phase suivante du traitement.';
    tone = 'success';
  } else if (declarationSubmitted) {
    title = 'Formulaire transmis';
    description = "Votre déclaration est en cours de traitement par l'ANAC.";
    tone = 'success';
  } else if (declarationAvailable) {
    title = 'Action requise';
    description = 'Téléchargez le formulaire, remplissez-le, puis déposez votre déclaration.';
    tone = 'warning';
  } else if (meetingScheduled) {
    title = 'Réunion préliminaire planifiée';
    description = "Consultez votre invitation et présentez-vous au rendez-vous indiqué.";
    tone = 'info';
  } else if (meetingDone) {
    title = 'Déclaration en préparation';
    description = "L'ANAC prépare le formulaire de pré-évaluation à vous transmettre.";
    tone = 'info';
  } else {
    title = 'Réunion à planifier';
    description = "L'ANAC va planifier la réunion préliminaire et rendre l'invitation disponible ici.";
    tone = 'muted';
  }

  return {
    title,
    description,
    tone,
    steps: [
      {
        key: 'meeting',
        label: 'Réunion',
        detail: meeting
          ? `${labelOf(MEETING_STATUS_LABELS, meeting.status)} - ${formatDateTime(meeting.scheduledAt)}`
          : 'En attente de planification',
        state: stepState(meetingDone, !meeting || meetingScheduled),
      },
      {
        key: 'declaration',
        label: 'Déclaration',
        detail: declarationAvailable
          ? declarationSubmitted
            ? `Soumise le ${formatDate(evaluation?.submittedAt)}`
            : `Retour attendu avant le ${formatDate(evaluation?.returnDeadline)}`
          : 'Pas encore disponible',
        state: stepState(declarationSubmitted, declarationAvailable && !declarationSubmitted),
      },
      {
        key: 'closure',
        label: 'Suite du dossier',
        detail: phaseClosed ? 'Phase clôturée' : 'Traitement ANAC en cours',
        state: stepState(phaseClosed, declarationSubmitted && !phaseClosed),
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
        <p className="text-xs text-anac-muted">Chargement de la phase préliminaire...</p>
      </div>
    );
  }

  if (!bundle?.phase) return null;

  async function handleSubmitDeclaration() {
    if (!file) {
      notify.warning('Merci de joindre votre déclaration remplie.');
      return;
    }
    const phaseId = bundle?.phase?.id;
    if (!phaseId) return;

    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await submitPreliminaryDeclaration(phaseId, uploaded.uploadAssetId);
      notify.success('Déclaration soumise avec succès.');
      setFile(null);
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la déclaration.'));
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
      <PhaseSummaryCard
        phaseLabel="Phase préliminaire"
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
        <SectionCard icon={CalendarClock} title="Réunion préliminaire">
          {!meeting ? (
            <p className="mt-3 text-sm text-anac-muted">
              La réunion n'est pas encore planifiée. L'invitation apparaîtra ici dès qu'elle sera
              disponible.
            </p>
          ) : (
            <MeetingDetails meeting={meeting} />
          )}
        </SectionCard>

        <SectionCard icon={FileText} title="Déclaration de pré-évaluation">
          {!declarationAvailable ? (
            <p className="mt-3 text-sm text-anac-muted">
              Le formulaire sera disponible après la réunion préliminaire.
            </p>
          ) : declarationSubmitted ? (
            <div className="mt-3 rounded border border-anac-success/30 bg-anac-success/5 p-3">
              <div className="flex items-start gap-2">
                <FileCheck2 size={16} className="mt-0.5 text-anac-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-anac-navy">Formulaire transmis</p>
                  <p className="text-xs text-anac-muted">
                    Transmis le {formatDate(evaluation?.submittedAt)}. Votre déclaration est en
                    cours de traitement par l'ANAC.
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
                <FileLink
                  address={evaluation.templateFileUrl}
                  download
                  className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
                >
                  Télécharger le formulaire vierge
                </FileLink>
              )}
              <div className="rounded border border-dashed border-anac-border p-3">
                <label className="flex cursor-pointer flex-col gap-1 text-sm">
                  <span className="font-medium text-anac-navy">Déposer ma déclaration remplie</span>
                  <span className="text-xs text-anac-muted">
                    Formats acceptés : PDF, Word, PNG ou JPG.
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
                  {submitting ? 'Envoi...' : 'Soumettre ma déclaration'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </section>
  );
}
