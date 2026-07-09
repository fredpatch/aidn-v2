import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  FileText,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ticket,
  FileUp,
  Lock,
  Circle,
  CheckCircle,
  CircleDashed,
} from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';

// ── Phase roadmap (grows as sprints land) ──────────────────────────────────
const PHASE_ROADMAP = [
  { code: 'M3', label: 'Phase Préliminaire' },
  { code: 'M4', label: 'Demande Formelle' },
  { code: 'M5', label: 'Évaluation Approfondie' },
  { code: 'M6', label: 'Démonstration / Inspection' },
  { code: 'M7', label: 'Délivrance' },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────
interface Bundle {
  phase: { id: number; status: string; openedAt: string; closedAt: string | null } | null;
  meeting: {
    id: number;
    scheduledAt: string;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
    crUploadedAt: string | null;
  } | null;
  evaluation: {
    id: number;
    templateFileUrl: string | null;
    madeAvailableAt: string | null;
    returnDeadline: string | null;
    submittedFileUrl: string | null;
    submittedAt: string | null;
  } | null;
}

type ChecklistItem = {
  label: string;
  done: boolean;
  optional?: boolean;
};

function buildChecklist(bundle: Bundle): ChecklistItem[] {
  return [
    {
      label: 'Réunion planifiée',
      done: !!bundle.meeting,
    },
    {
      label: 'Réunion tenue ou absence constatée',
      done: !!bundle.meeting && bundle.meeting.status !== 'scheduled',
    },
    {
      label: 'Compte-rendu envoyé',
      done: !!bundle.meeting?.crDocumentUrl,
      optional: true,
    },
    {
      label: 'Déclaration mise à disposition',
      done: !!bundle.evaluation?.madeAvailableAt,
    },
    {
      label: 'Déclaration retournée par le postulant',
      done: !!bundle.evaluation?.submittedFileUrl,
    },
    {
      label: 'Phase clôturée',
      done: bundle.phase?.status === 'closed',
    },
  ];
}

// ── Root page ──────────────────────────────────────────────────────────────
export default function PreliminaryPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedTooltip, setLockedTooltip] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
      setBundle(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger la phase.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  async function startPhase() {
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/phases/requests/${requestId}/start-preliminary-phase`);
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de démarrer la phase.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-anac-muted p-6">Chargement...</p>;
  if (error) return <p className="text-anac-danger p-6">{error}</p>;

  const meetingResolved = !!bundle?.meeting && bundle.meeting.status !== 'scheduled';
  const declarationSubmitted = !!bundle?.evaluation?.submittedFileUrl;
  const canClose = meetingResolved && declarationSubmitted;
  const checklist = bundle ? buildChecklist(bundle) : [];

  return (
    <div className="flex gap-6 items-start">
      {/* ── Left column ───────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 space-y-4">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="text-anac-muted text-xs hover:text-anac-navy transition-colors"
        >
          ← Retour aux demandes
        </button>

        {/* Phase roadmap */}
        <div className="card p-4 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
            Phases du dossier
          </p>
          {PHASE_ROADMAP.map((phase) => {
            const isCurrent = phase.code === 'M3';
            return (
              <div key={phase.code} className="relative">
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    if (!isCurrent) {
                      setLockedTooltip(lockedTooltip === phase.code ? null : phase.code);
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                    isCurrent
                      ? 'bg-anac-blue/10 text-anac-blue font-semibold'
                      : 'text-anac-muted/60 hover:bg-anac-gray cursor-pointer'
                  }`}
                >
                  {isCurrent ? (
                    <Circle size={12} className="text-anac-blue fill-anac-blue flex-shrink-0" />
                  ) : (
                    <Lock size={11} className="flex-shrink-0 opacity-40" />
                  )}
                  <span>{phase.label}</span>
                </button>

                {lockedTooltip === phase.code && (
                  <div className="absolute left-0 top-full mt-1 z-10 bg-anac-navy text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                    Phase non encore ouverte
                    <button
                      className="ml-2 opacity-60 hover:opacity-100"
                      onClick={() => setLockedTooltip(null)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Checklist — only when phase is open or has data */}
        {bundle?.phase && (
          <div className="card p-4 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted mb-3">
              Checklist — Phase Préliminaire
            </p>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  {item.done ? (
                    <CheckCircle size={13} className="text-anac-success flex-shrink-0 mt-0.5" />
                  ) : item.optional ? (
                    <CircleDashed size={13} className="text-anac-muted/50 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={13} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
                  )}
                  <span
                    className={`text-xs leading-tight ${
                      item.done
                        ? 'text-anac-navy line-through decoration-anac-muted/40'
                        : item.optional
                          ? 'text-anac-muted/60 italic'
                          : 'text-anac-navy'
                    }`}
                  >
                    {item.label}
                    {item.optional && (
                      <span className="ml-1 text-[9px] text-anac-muted/50 not-italic font-medium uppercase tracking-wide">
                        facultatif
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right column ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Phase Préliminaire</h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>

        {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

        {!bundle?.phase ? (
          <div className="card">
            <p className="text-anac-muted text-sm mb-3">
              Cette demande est en attente de traitement. Démarrez la phase préliminaire pour
              commencer.
            </p>
            <Button onClick={startPhase} disabled={busy}>
              {busy ? 'Démarrage...' : 'Démarrer la Phase Préliminaire'}
            </Button>
          </div>
        ) : (
          <>
            <div className="card flex items-center justify-between">
              <span className="text-sm font-medium">Statut de la phase</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  bundle.phase.status === 'closed'
                    ? 'bg-anac-muted/10 text-anac-muted'
                    : 'bg-anac-success/10 text-anac-success'
                }`}
              >
                {bundle.phase.status === 'closed' ? 'Clôturée' : 'Ouverte'}
              </span>
            </div>

            <MeetingSection
              phaseId={bundle.phase.id}
              meeting={bundle.meeting}
              dnAgentId={user!.id}
              onChanged={load}
              setActionError={setActionError}
            />

            <DeclarationSection
              phaseId={bundle.phase.id}
              evaluation={bundle.evaluation}
              meetingHeld={bundle.meeting?.status === 'held'}
              onChanged={load}
              setActionError={setActionError}
            />

            {bundle.phase.status === 'open' && canClose && (
              <ClosureSection
                phaseId={bundle.phase.id}
                onChanged={load}
                setActionError={setActionError}
              />
            )}

            {bundle.phase.status === 'open' && !canClose && (
              <div className="card">
                <p className="text-anac-muted text-sm">
                  {!meetingResolved
                    ? 'La clôture sera disponible une fois la réunion résolue (tenue, absence, ou dossier annulé).'
                    : 'La clôture sera disponible une fois la déclaration de pré-évaluation retournée par le postulant.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MeetingSection ─────────────────────────────────────────────────────────
function MeetingSection({
  phaseId,
  meeting,
  dnAgentId,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  meeting: Bundle['meeting'];
  dnAgentId: number;
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportFile, setReportFile] = useState<File | null>(null);

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setWarning(null);
    setBusy(true);
    try {
      const { data } = await api.post('/meetings', {
        phaseId,
        meetingType: 'preliminary',
        dnAgentId,
        scheduledAt: new Date(dateTime).toISOString(),
        location: location || undefined,
      });
      if (data.softOverlapWarning) {
        setWarning(
          'Attention : vous avez déjà une autre réunion ce jour-là, à un horaire différent.'
        );
      }
      setScheduling(false);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de planifier la réunion.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/meetings/${meeting!.id}/reschedule`, {
        newScheduledAt: new Date(dateTime).toISOString(),
      });
      setRescheduling(false);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de reprogrammer.'));
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(status: 'held' | 'no_show' | 'file_cancelled') {
    setActionError(null);
    setBusy(true);
    try {
      await api.patch(`/meetings/${meeting!.id}/status`, { status });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Action impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReport() {
    if (!reportFile) {
      setActionError('Merci de sélectionner un fichier pour le compte-rendu.');
      return;
    }
    setActionError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', reportFile);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/meetings/${meeting!.id}/report`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });
      setSendingReport(false);
      setReportFile(null);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible d'envoyer le compte-rendu."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Réunion préliminaire</span>
      </div>

      {warning && <p className="text-anac-warning text-xs">{warning}</p>}

      {!meeting ? (
        scheduling ? (
          <form onSubmit={handleSchedule} className="space-y-3">
            <div>
              <label className="label">Date et heure</label>
              <input
                type="datetime-local"
                className="input"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Lieu (optionnel)</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Planifier
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setScheduling(false)}
              >
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" onClick={() => setScheduling(true)}>
            Planifier la réunion
          </Button>
        )
      ) : rescheduling ? (
        <form onSubmit={handleReschedule} className="space-y-3">
          <div>
            <label className="label">Nouvelle date et heure</label>
            <input
              type="datetime-local"
              className="input"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Confirmer
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRescheduling(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {new Date(meeting.scheduledAt).toLocaleString('fr-FR')}
            {meeting.location && ` — ${meeting.location}`}
          </p>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-anac-info/10 text-anac-info">
            {meeting.status}
          </span>

          {meeting.status === 'scheduled' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`http://localhost:4000/api/meetings/${meeting.id}/ticket`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              >
                <Ticket size={12} /> Voir le ticket
              </a>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus('held')}
                disabled={busy}
                className="gap-1"
              >
                <CheckCircle2 size={12} /> Tenue
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus('no_show')}
                disabled={busy}
                className="gap-1"
              >
                <XCircle size={12} /> No-show
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRescheduling(true)}
                disabled={busy}
                className="gap-1"
              >
                <RotateCcw size={12} /> Reprogrammer
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => markStatus('file_cancelled')}
                disabled={busy}
              >
                Annuler le dossier
              </Button>
            </div>
          )}

          {meeting.status === 'held' && (
            <div className="pt-1 space-y-2">
              {meeting.crDocumentUrl ? (
                <p className="text-sm">
                  Compte-rendu envoyé le{' '}
                  {meeting.crUploadedAt &&
                    new Date(meeting.crUploadedAt).toLocaleDateString('fr-FR')}{' '}
                  —{' '}
                  <a
                    href={`http://localhost:4000${meeting.crDocumentUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-anac-blue"
                  >
                    voir le fichier
                  </a>
                  {' — '}
                  <button
                    type="button"
                    className="underline text-anac-muted text-xs"
                    onClick={() => setSendingReport(true)}
                  >
                    remplacer
                  </button>
                </p>
              ) : sendingReport ? (
                <div className="flex items-center gap-2">
                  <input type="file" onChange={(e) => setReportFile(e.target.files?.[0] ?? null)} />
                  <Button size="sm" onClick={handleSendReport} disabled={busy}>
                    Envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSendingReport(false)}
                    disabled={busy}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSendingReport(true)}
                  className="gap-1"
                >
                  <FileUp size={12} /> Envoyer le compte-rendu (optionnel)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DeclarationSection ─────────────────────────────────────────────────────
function DeclarationSection({
  phaseId,
  evaluation,
  meetingHeld,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  evaluation: Bundle['evaluation'];
  meetingHeld: boolean;
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [returnDays, setReturnDays] = useState('');

  async function makeAvailable() {
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/preliminary-evaluation/${phaseId}/make-available`, {
        returnDays: returnDays ? Number(returnDays) : undefined,
      });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de rendre la déclaration disponible.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Déclaration de pré-évaluation</span>
      </div>

      {!evaluation?.madeAvailableAt ? (
        !meetingHeld ? (
          <p className="text-anac-muted text-sm">
            Disponible une fois la réunion préliminaire marquée &quot;Tenue&quot;.
          </p>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="label">Délai de retour (jours, optionnel — 15 par défaut)</label>
              <input
                type="number"
                className="input"
                value={returnDays}
                onChange={(e) => setReturnDays(e.target.value)}
                placeholder="15"
              />
            </div>
            <Button size="sm" onClick={makeAvailable} disabled={busy}>
              Rendre disponible au postulant
            </Button>
          </div>
        )
      ) : (
        <div className="text-sm space-y-1">
          <p>
            Mise à disposition le {new Date(evaluation.madeAvailableAt).toLocaleDateString('fr-FR')}
            , retour attendu avant le{' '}
            {evaluation.returnDeadline &&
              new Date(evaluation.returnDeadline).toLocaleDateString('fr-FR')}
          </p>
          {evaluation.submittedFileUrl ? (
            <p className="text-anac-success">
              Reçue le{' '}
              {evaluation.submittedAt &&
                new Date(evaluation.submittedAt).toLocaleDateString('fr-FR')}{' '}
              —{' '}
              <a
                href={`http://localhost:4000${evaluation.submittedFileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                voir le fichier
              </a>
            </p>
          ) : (
            <p className="text-anac-warning">En attente du retour du postulant</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── ClosureSection ─────────────────────────────────────────────────────────
function ClosureSection({
  phaseId,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      let closureDocumentUrl: string | undefined;
      let closureDocumentMimeType: string | undefined;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const { data: uploaded } = await api.post('/uploads', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        closureDocumentUrl = uploaded.fileUrl;
        closureDocumentMimeType = uploaded.mimeType;
      }
      await api.post(`/phases/${phaseId}/close`, {
        closureDocumentUrl,
        closureDocumentMimeType,
        closureNote: note || undefined,
      });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de clôturer la phase.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleClose} className="card space-y-3">
      <span className="font-medium text-sm">Clôturer la phase</span>
      <p className="text-anac-muted text-xs">
        Document et note sont tous les deux facultatifs — vous pouvez clôturer directement.
      </p>
      <div>
        <label className="label">Note (optionnel)</label>
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Document joint (optionnel)</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Clôture...' : 'Clôturer la phase'}
      </Button>
    </form>
  );
}
