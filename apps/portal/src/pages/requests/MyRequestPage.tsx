import { useEffect, useState, FormEvent } from 'react';
import { api, apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';

const API_ORIGIN = 'http://localhost:4000';

interface RequestView {
  id: number;
  reference: string;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  createdAt: string;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: "Reconnaissance d'agrément",
  issuance: "Délivrance d'agrément",
  modification: "Modification d'agrément",
  renewal: "Renouvellement d'agrément",
};

const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposée — en attente de signature DG',
  signed: 'Signée par la DG',
  pending_review: 'Transmise à la Direction de la Navigabilité',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Déposée',
  signed: 'Signée',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours de traitement',
  rejected: 'Rejetée',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiée',
  held: 'Tenue',
  no_show: 'Absence constatée',
  rescheduled: 'Reprogrammée',
  file_cancelled: 'Dossier annulé',
};

const TERMINAL_STATUSES = ['rejected', 'completed', 'cancelled'];

// ── Root ──────────────────────────────────────────────────────────────────
export default function MyRequestPage() {
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get('/requests/mine');
      setRequests(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger votre demande.'));
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="card max-w-lg mx-auto">
        <p className="text-anac-danger">{error}</p>
      </div>
    );
  }

  if (requests === null) {
    return <p className="text-anac-muted text-center">Chargement...</p>;
  }

  const activeRequest = requests.find((r) => !TERMINAL_STATUSES.includes(r.status));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Ma demande</h1>
        <p className="text-anac-muted text-sm">
          Reconnaissance, délivrance, modification ou renouvellement d'agrément OMA
        </p>
      </div>

      {activeRequest ? (
        <ActiveRequestCard request={activeRequest} onChanged={load} />
      ) : (
        <SubmitRequestForm onSubmitted={load} />
      )}

      {requests.length > 0 && (
        <div>
          <h2 className="text-anac-navy font-medium text-sm mb-2">Historique</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="card text-sm flex items-center justify-between">
                <div>
                  <p className="font-medium">{r.reference}</p>
                  <p className="text-anac-muted">
                    {REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}
                  </p>
                </div>
                <span className="text-anac-muted text-xs">
                  {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active request card ───────────────────────────────────────────────────
function ActiveRequestCard({
  request,
  onChanged,
}: {
  request: RequestView;
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = request.circuitStatus === 'submitted';

  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      await api.post(`/requests/${request.id}/cancel`);
      notify.success('Demande annulée.');
      onChanged();
    } catch (err) {
      const message = apiErrorMessage(err, 'Annulation impossible.');
      setError(message);
      notify.error(message);
    } finally {
      setCancelling(false);
    }
  }

  const statusLabel =
    CIRCUIT_STATUS_LABELS[request.circuitStatus ?? ''] ??
    STATUS_LABELS[request.status] ??
    request.status;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-anac-navy">{request.reference}</span>
        <span className="text-xs text-anac-muted">
          {REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType}
        </span>
      </div>

      <p className="text-sm">
        Statut : <span className="font-medium">{statusLabel}</span>
      </p>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      {canCancel && (
        <button className="btn-secondary text-sm" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Annulation...' : 'Annuler ma demande'}
        </button>
      )}

      {!canCancel && request.status !== 'in_progress' && (
        <p className="text-anac-muted text-xs">
          Cette demande ne peut plus être annulée (déjà transmise à la DG ou au-delà).
        </p>
      )}

      {/* Phase sections — shown based on request status */}
      {(request.circuitStatus === 'pending_review' || request.status === 'in_progress') && (
        <PreliminaryPhaseSection requestId={request.id} />
      )}

      {request.status === 'in_progress' && <FormalPhaseSection requestId={request.id} />}
    </div>
  );
}

// ── M3 — Preliminary phase section ───────────────────────────────────────
function PreliminaryPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<{
    phase: { id: number; status: string } | null;
    meeting: {
      id: number;
      scheduledAt: string;
      location: string | null;
      status: string;
      crDocumentUrl: string | null;
      crUploadedAt: string | null;
    } | null;
    evaluation: {
      templateFileUrl: string | null;
      madeAvailableAt: string | null;
      returnDeadline: string | null;
      submittedFileUrl: string | null;
      submittedAt: string | null;
    } | null;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/preliminary-evaluation/by-request/${requestId}`);
      setBundle(data);
    } catch {
      // silently ignore — section just won't render
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  if (!bundle?.phase) return null;

  async function handleSubmitDeclaration() {
    if (!file) {
      notify.warning('Merci de joindre votre déclaration remplie.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/preliminary-evaluation/${bundle!.phase!.id}/submit`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });
      notify.success('Déclaration soumise avec succès.');
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la déclaration.'));
    } finally {
      setSubmitting(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Phase préliminaire</p>
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

      {bundle.meeting && (
        <div className="text-sm space-y-1">
          <p>
            Réunion le {new Date(bundle.meeting.scheduledAt).toLocaleString('fr-FR')}
            {bundle.meeting.location && ` — ${bundle.meeting.location}`}
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

      {bundle.evaluation?.madeAvailableAt && (
        <div className="text-sm space-y-2">
          <p className="text-anac-muted text-xs">
            Retour attendu avant le{' '}
            {bundle.evaluation.returnDeadline &&
              new Date(bundle.evaluation.returnDeadline).toLocaleDateString('fr-FR')}
          </p>
          {bundle.evaluation.templateFileUrl && (
            <a
              href={`${API_ORIGIN}${bundle.evaluation.templateFileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs inline-block px-2 py-1 rounded"
            >
              Télécharger le formulaire vierge
            </a>
          )}
          {bundle.evaluation.submittedFileUrl ? (
            <p className="text-anac-success text-xs">Déclaration soumise, merci.</p>
          ) : (
            <div className="space-y-2">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn-primary text-xs px-3 py-1.5 rounded"
                onClick={handleSubmitDeclaration}
                disabled={submitting}
              >
                {submitting ? 'Envoi...' : 'Soumettre ma déclaration remplie'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── M4 — Formal phase section ─────────────────────────────────────────────
interface FormalDoc {
  id: number | null;
  slot: string;
  label: string;
  status: 'missing' | 'submitted';
  fileUrl: string | null;
  submittedAt: string | null;
}

interface FormalBundle {
  phase: { id: number; status: string } | null;
  letterCircuit: { id: number; status: string; fileUrl: string | null } | null;
  documents: FormalDoc[];
  meeting: {
    id: number;
    scheduledAt: string;
    location: string | null;
    status: string;
    crDocumentUrl: string | null;
  } | null;
  completionRate: number;
}

function FormalPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<FormalBundle | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [submittingLetter, setSubmittingLetter] = useState(false);
  const [submittingDoc, setSubmittingDoc] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/formal-request/by-request/${requestId}`);
      setBundle(data);
    } catch {
      // phase not open yet — section won't render
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
      const formData = new FormData();
      formData.append('file', letterFile);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/formal-request/requests/${requestId}/letter`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });
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
      const formData = new FormData();
      formData.append('file', file);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/formal-request/requests/${requestId}/documents`, {
        slot,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });
      notify.success('Document soumis.');
      setUploadingSlot(null);
      setSlotFiles((prev) => {
        const n = { ...prev };
        delete n[slot];
        return n;
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
        <p className="font-medium text-sm text-anac-navy">Phase — Demande Formelle</p>
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

      {/* Formal letter */}
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
              submitted: 'Lettre reçue — en attente de signature DG.',
              signed: 'Lettre signée — en cours de transmission à la DN.',
              pending_review: 'Lettre transmise à la Direction de la Navigabilité.',
            }[bundle.letterCircuit.status] ?? bundle.letterCircuit.status}
          </p>
        )}
      </div>

      {/* Documents checklist */}
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
                      <span className="text-[10px] text-anac-muted">—</span>
                      <button
                        type="button"
                        className="text-[10px] text-anac-muted underline"
                        onClick={() => setUploadingSlot(doc.slot)}
                      >
                        Remplacer
                      </button>
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
                      const f = e.target.files?.[0];
                      if (f) setSlotFiles((prev) => ({ ...prev, [doc.slot]: f }));
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
                        const n = { ...prev };
                        delete n[doc.slot];
                        return n;
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

      {/* Formal meeting */}
      {bundle.meeting && (
        <div className="text-sm space-y-1">
          <p className="text-xs font-medium text-anac-navy">Réunion formelle</p>
          <p>
            {new Date(bundle.meeting.scheduledAt).toLocaleString('fr-FR')}
            {bundle.meeting.location && ` — ${bundle.meeting.location}`}
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

// ── Submit new request form ───────────────────────────────────────────────
function SubmitRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [requestType, setRequestType] = useState('issuance');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      const msg = 'Merci de joindre votre demande scannée (PDF, Word, PNG ou JPG).';
      setError(msg);
      notify.warning(msg);
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post('/requests', {
        requestType,
        message,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });
      notify.success('Demande soumise avec succès.');
      onSubmitted();
    } catch (err) {
      const msg = apiErrorMessage(err, 'Impossible de soumettre la demande.');
      setError(msg);
      notify.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <p className="text-anac-muted text-sm">
        Choisissez le type de demande et joignez votre courrier scanné.
      </p>
      {error && <p className="text-anac-danger text-sm">{error}</p>}
      <div>
        <label className="label">Type de demande</label>
        <select
          className="input"
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
        >
          <option value="issuance">Délivrance d&apos;un nouvel agrément</option>
          <option value="recognition">Reconnaissance d&apos;agrément</option>
          <option value="modification">Modification d&apos;un agrément existant</option>
          <option value="renewal">Renouvellement d&apos;un agrément existant</option>
        </select>
      </div>
      <div>
        <label className="label">Message (optionnel)</label>
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
        />
      </div>
      <div>
        <label className="label">Votre demande scannée (PDF, Word, PNG, JPG)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Envoi...' : 'Soumettre ma demande'}
      </button>
    </form>
  );
}
