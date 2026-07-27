import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../../lib/axios';

interface RequestView {
  id: number;
  reference: string;
  applicantId: number;
  organisationId: number;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Delivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Depose',
  signed: 'Signe',
  pending_review: 'En attente de traitement',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Depose',
  signed: 'Signe',
  pending_review: 'En attente de traitement',
  in_progress: 'En cours',
  rejected: 'Rejete',
  completed: 'Termine',
  cancelled: 'Annule',
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const colorMap: Record<string, string> = {
    submitted: 'bg-anac-info/10 text-anac-info',
    signed: 'bg-anac-warning/10 text-anac-warning',
    pending_review: 'bg-anac-success/10 text-anac-success',
    in_progress: 'bg-anac-blue/10 text-anac-blue',
    rejected: 'bg-anac-danger/10 text-anac-danger',
    cancelled: 'bg-anac-muted/10 text-anac-muted',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[status] ?? 'bg-anac-gray text-anac-text'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default function RequestsPage() {
  const [requestsList, setRequestsList] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/requests');
      setRequestsList(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les demandes.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleAction(
    id: number,
    action: 'mark-signed' | 'mark-pending-review' | 'cancel'
  ) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.post(`/requests/${id}/${action}`);
      await loadRequests();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Action impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Demandes</h1>
          <p className="text-anac-muted text-sm">
            Circuit DG : Depose &rarr; Signe &rarr; En attente de traitement
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setShowManualForm((v) => !v)}>
          {showManualForm ? 'Fermer' : 'Saisie manuelle (guichet)'}
        </button>
      </div>

      {showManualForm && (
        <ManualRequestForm
          onCreated={() => {
            setShowManualForm(false);
            loadRequests();
          }}
        />
      )}

      {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-anac-muted">Chargement...</p>
        ) : error ? (
          <p className="text-anac-danger">{error}</p>
        ) : requestsList.length === 0 ? (
          <p className="text-anac-muted">Aucune demande pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-anac-muted border-b border-anac-border">
                <th className="pb-2 pr-4">Reference</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Circuit DG</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2 pr-4">Depose le</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requestsList.map((r) => (
                <tr key={r.id} className="border-b border-anac-border last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.reference}</td>
                  <td className="py-2 pr-4">
                    {REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}
                  </td>
                  <td className="py-2 pr-4">
                    {r.circuitStatus && (
                      <StatusBadge status={r.circuitStatus} labels={CIRCUIT_STATUS_LABELS} />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} labels={STATUS_LABELS} />
                  </td>
                  <td className="py-2 pr-4 text-anac-muted">
                    {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-2 space-x-2">
                    {r.circuitStatus === 'submitted' && (
                      <>
                        <button
                          className="text-anac-blue underline text-xs disabled:opacity-50"
                          disabled={busyId === r.id}
                          onClick={() => handleAction(r.id, 'mark-signed')}
                        >
                          Marquer signe
                        </button>
                        <button
                          className="text-anac-danger underline text-xs disabled:opacity-50"
                          disabled={busyId === r.id}
                          onClick={() => handleAction(r.id, 'cancel')}
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {r.circuitStatus === 'signed' && (
                      <button
                        className="text-anac-blue underline text-xs disabled:opacity-50"
                        disabled={busyId === r.id}
                        onClick={() => handleAction(r.id, 'mark-pending-review')}
                      >
                        Marquer en attente de traitement
                      </button>
                    )}
                    {r.circuitStatus === 'pending_review' && r.status === 'pending_review' && (
                      <Link
                        to={`/demandes/${r.id}/phase-preliminaire`}
                        className="text-anac-blue underline text-xs"
                      >
                        Phase Préliminaire
                      </Link>
                    )}
                    {r.status === 'in_progress' && (
                      <>
                        <Link
                          to={`/demandes/${r.id}/phase-preliminaire`}
                          className="text-anac-muted underline text-xs"
                        >
                          Phase Préliminaire
                        </Link>
                        <Link
                          to={`/demandes/${r.id}/phase-formelle`}
                          className="text-anac-blue underline text-xs"
                        >
                          Phase Formelle
                        </Link>
                        <Link
                          to={`/demandes/${r.id}/evaluation-approfondie`}
                          className="text-anac-blue underline text-xs"
                        >
                          Évaluation Approfondie
                        </Link>
                        <Link
                          to={`/demandes/${r.id}/demonstration-inspection`}
                          className="text-anac-blue underline text-xs"
                        >
                          Démonstration/Inspection
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ManualRequestForm({ onCreated }: { onCreated: () => void }) {
  const [applicantId, setApplicantId] = useState('');
  const [requestType, setRequestType] = useState('issuance');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Le document scanne est requis.');
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
        applicantId: Number(applicantId),
        requestType,
        message,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });

      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de creer la demande.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <h2 className="text-anac-navy font-semibold">Saisie manuelle - depot physique</h2>
        <p className="text-anac-muted text-sm mt-1">
          Pour un postulant deja enregistre. La creation de compte postulant (M13) arrive dans un
          sprint ulterieur - en attendant, saisissez son identifiant.
        </p>
      </div>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Identifiant postulant</label>
          <input
            className="input"
            value={applicantId}
            onChange={(e) => setApplicantId(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Type de demande</label>
          <select
            className="input"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
          >
            <option value="issuance">Delivrance</option>
            <option value="recognition">Reconnaissance</option>
            <option value="modification">Modification</option>
            <option value="renewal">Renouvellement</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Message (optionnel)</label>
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
        />
      </div>

      <div>
        <label className="label">Document scanne (PDF, Word, PNG, JPG)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </div>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Enregistrement...' : 'Enregistrer la demande'}
      </button>
    </form>
  );
}
