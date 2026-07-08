import { useEffect, useState, FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CalendarClock, FileText, CheckCircle2, XCircle, RotateCcw, Ticket } from "lucide-react";
import { api, apiErrorMessage } from "../../lib/axios";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";

interface Bundle {
  phase: { id: number; status: string; openedAt: string; closedAt: string | null } | null;
  meeting: { id: number; scheduledAt: string; location: string | null; status: string } | null;
  evaluation: {
    id: number;
    templateFileUrl: string | null;
    madeAvailableAt: string | null;
    returnDeadline: string | null;
    submittedFileUrl: string | null;
    submittedAt: string | null;
  } | null;
}

export default function PreliminaryPhasePage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
      setBundle(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger la phase."));
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
      setActionError(apiErrorMessage(err, "Impossible de demarrer la phase."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-anac-muted">Chargement...</p>;
  if (error) return <p className="text-anac-danger">{error}</p>;
  if (!bundle) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Phase Preliminaire</h1>
          <p className="text-anac-muted text-sm">Demande #{requestId}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
          Retour aux demandes
        </Button>
      </div>

      {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

      {!bundle.phase ? (
        <div className="card">
          <p className="text-anac-muted text-sm mb-3">
            Cette demande est en attente de traitement. Demarrez la phase preliminaire pour commencer.
          </p>
          <Button onClick={startPhase} disabled={busy}>
            {busy ? "Demarrage..." : "Demarrer la Phase Preliminaire"}
          </Button>
        </div>
      ) : (
        <>
          <div className="card flex items-center justify-between">
            <span className="text-sm font-medium">Statut de la phase</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                bundle.phase.status === "closed" ? "bg-anac-muted/10 text-anac-muted" : "bg-anac-success/10 text-anac-success"
              }`}
            >
              {bundle.phase.status === "closed" ? "Cloturee" : "Ouverte"}
            </span>
          </div>

          <MeetingSection
            phaseId={bundle.phase.id}
            meeting={bundle.meeting}
            dnAgentId={user!.id}
            onChanged={load}
            setActionError={setActionError}
          />

          <DeclarationSection phaseId={bundle.phase.id} evaluation={bundle.evaluation} onChanged={load} setActionError={setActionError} />

          {bundle.phase.status === "open" && (
            <ClosureSection phaseId={bundle.phase.id} onChanged={load} setActionError={setActionError} />
          )}
        </>
      )}
    </div>
  );
}

function MeetingSection({
  phaseId,
  meeting,
  dnAgentId,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  meeting: Bundle["meeting"];
  dnAgentId: number;
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [dateTime, setDateTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setWarning(null);
    setBusy(true);
    try {
      const { data } = await api.post("/meetings", {
        phaseId,
        meetingType: "preliminary",
        dnAgentId,
        scheduledAt: new Date(dateTime).toISOString(),
        location: location || undefined,
      });
      if (data.softOverlapWarning) {
        setWarning("Attention : vous avez deja une autre reunion ce jour-la, a un horaire different.");
      }
      setScheduling(false);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible de planifier la reunion."));
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/meetings/${meeting!.id}/reschedule`, { newScheduledAt: new Date(dateTime).toISOString() });
      setRescheduling(false);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible de reprogrammer."));
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(status: "held" | "no_show" | "file_cancelled") {
    setActionError(null);
    setBusy(true);
    try {
      await api.patch(`/meetings/${meeting!.id}/status`, { status });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Action impossible."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Reunion preliminaire</span>
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
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Planifier
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setScheduling(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" onClick={() => setScheduling(true)}>
            Planifier la reunion
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
            <Button type="button" variant="secondary" size="sm" onClick={() => setRescheduling(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {new Date(meeting.scheduledAt).toLocaleString("fr-FR")}
            {meeting.location && ` - ${meeting.location}`}
          </p>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-anac-info/10 text-anac-info">
            {meeting.status}
          </span>
          {meeting.status === "scheduled" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`http://localhost:4000/api/meetings/${meeting.id}/ticket`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
              >
                <Ticket size={12} /> Voir le ticket
              </a>
              <Button size="sm" variant="secondary" onClick={() => markStatus("held")} disabled={busy} className="gap-1">
                <CheckCircle2 size={12} /> Tenue
              </Button>
              <Button size="sm" variant="secondary" onClick={() => markStatus("no_show")} disabled={busy} className="gap-1">
                <XCircle size={12} /> No-show
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRescheduling(true)} disabled={busy} className="gap-1">
                <RotateCcw size={12} /> Reprogrammer
              </Button>
              <Button size="sm" variant="destructive" onClick={() => markStatus("file_cancelled")} disabled={busy}>
                Annuler le dossier
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeclarationSection({
  phaseId,
  evaluation,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  evaluation: Bundle["evaluation"];
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [returnDays, setReturnDays] = useState("");

  async function makeAvailable() {
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/preliminary-evaluation/${phaseId}/make-available`, {
        returnDays: returnDays ? Number(returnDays) : undefined,
      });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible de rendre la declaration disponible."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Declaration de pre-evaluation</span>
      </div>

      {!evaluation?.madeAvailableAt ? (
        <div className="space-y-2">
          <div>
            <label className="label">Delai de retour (jours, optionnel - 15 par defaut)</label>
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
      ) : (
        <div className="text-sm space-y-1">
          <p>
            Mise a disposition le {new Date(evaluation.madeAvailableAt).toLocaleDateString("fr-FR")}, retour attendu
            avant le {evaluation.returnDeadline && new Date(evaluation.returnDeadline).toLocaleDateString("fr-FR")}
          </p>
          {evaluation.submittedFileUrl ? (
            <p className="text-anac-success">
              Recue le {evaluation.submittedAt && new Date(evaluation.submittedAt).toLocaleDateString("fr-FR")} -{" "}
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

function ClosureSection({
  phaseId,
  onChanged,
  setActionError,
}: {
  phaseId: number;
  onChanged: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    setActionError(null);

    if (!note && !file) {
      setActionError("Un document ou une note est requis pour cloturer.");
      return;
    }

    setBusy(true);
    try {
      let closureDocumentUrl: string | undefined;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const { data: uploaded } = await api.post("/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        closureDocumentUrl = uploaded.fileUrl;
      }

      await api.post(`/phases/${phaseId}/close`, { closureDocumentUrl, closureNote: note || undefined });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible de cloturer la phase."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleClose} className="card space-y-3">
      <span className="font-medium text-sm">Cloturer la phase</span>
      <p className="text-anac-muted text-xs">Un document OU une note suffit.</p>
      <div>
        <label className="label">Note (optionnel)</label>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <label className="label">Document joint (optionnel)</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Cloture..." : "Cloturer la phase"}
      </Button>
    </form>
  );
}
