import { useEffect, useState, FormEvent } from "react";
import { api, apiErrorMessage } from "../../lib/api";

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
  recognition: "Reconnaissance d'agrement",
  issuance: "Delivrance d'agrement",
  modification: "Modification d'agrement",
  renewal: "Renouvellement d'agrement",
};

const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: "Deposee - en attente de signature DG",
  signed: "Signee par la DG",
  pending_review: "Transmise a la Direction de la Navigabilite",
};

const TERMINAL_STATUSES = ["rejected", "completed", "cancelled"];

export default function MyRequestPage() {
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get("/requests/mine");
      setRequests(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger votre demande."));
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
          Reconnaissance, delivrance, modification ou renouvellement d'agrement OMA
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
                  <p className="text-anac-muted">{REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}</p>
                </div>
                <span className="text-anac-muted text-xs">
                  {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveRequestCard({ request, onChanged }: { request: RequestView; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = request.circuitStatus === "submitted";

  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      await api.post(`/requests/${request.id}/cancel`);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "Annulation impossible."));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-anac-navy">{request.reference}</span>
        <span className="text-xs text-anac-muted">
          {REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType}
        </span>
      </div>

      <p className="text-sm">
        Statut : <span className="font-medium">{CIRCUIT_STATUS_LABELS[request.circuitStatus ?? ""] ?? request.status}</span>
      </p>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      {canCancel && (
        <button className="btn-secondary text-sm" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Annulation..." : "Annuler ma demande"}
        </button>
      )}

      {!canCancel && (
        <p className="text-anac-muted text-xs">
          Cette demande ne peut plus etre annulee (deja transmise a la DG ou au-dela).
        </p>
      )}
    </div>
  );
}

function SubmitRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [requestType, setRequestType] = useState("issuance");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Merci de joindre votre demande scannee (PDF, Word, PNG ou JPG).");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data: uploaded } = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await api.post("/requests", {
        requestType,
        message,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });

      onSubmitted();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de soumettre la demande."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <p className="text-anac-muted text-sm">
        Choisissez le type de demande et joignez votre courrier scanne.
      </p>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div>
        <label className="label">Type de demande</label>
        <select className="input" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
          <option value="issuance">Delivrance d'un nouvel agrement</option>
          <option value="recognition">Reconnaissance d'agrement</option>
          <option value="modification">Modification d'un agrement existant</option>
          <option value="renewal">Renouvellement d'un agrement existant</option>
        </select>
      </div>

      <div>
        <label className="label">Message (optionnel)</label>
        <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </div>

      <div>
        <label className="label">Votre demande scannee (PDF, Word, PNG, JPG)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Envoi..." : "Soumettre ma demande"}
      </button>
    </form>
  );
}
