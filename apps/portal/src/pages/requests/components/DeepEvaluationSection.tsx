import { api, apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { useEffect, useState } from 'react';

const API_ORIGIN = 'http://localhost:4000';

export function DeepEvaluationSection({ requestId }: { requestId: number }) {
  // ── M5 — Deep evaluation section ─────────────────────────────────────────

  const [bundle, setBundle] = useState<{
    phase: { id: number; status: string } | null;
    payment: {
      id: number;
      status: string;
      invoiceFileUrl: string | null;
      proofFileUrl: string | null;
      rejectionReason: string | null;
    } | null;
    evaluations: Array<{
      id: number;
      slot: string;
      label: string;
      currentFileUrl: string | null;
      verdict: 'validated' | 'rejected' | 'needs_correction' | null;
      correctionDeadline: string | null;
    }>;
    completionRate: { total: number; validated: number };
  } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [resubmitFiles, setResubmitFiles] = useState<Record<number, File>>({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/deep-evaluation/by-request/${requestId}`);
      setBundle(data);
    } catch {
      // phase not open yet
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  if (!bundle?.phase) return null;

  async function handleProofUpload() {
    if (!proofFile) {
      notify.warning('Merci de joindre votre quittance de paiement.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', proofFile);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/deep-evaluation/phases/${bundle?.phase!.id}/requests/${requestId}/proof`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
        uploadAssetId: uploaded.uploadAssetId,
      });
      notify.success('Preuve de paiement soumise.');
      setProofFile(null);
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la preuve.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResubmit(evaluationId: number) {
    const file = resubmitFiles[evaluationId];
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/deep-evaluation/evaluations/${evaluationId}/resubmit`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
        uploadAssetId: uploaded.uploadAssetId,
      });
      notify.success('Document corrigé soumis.');
      setResubmitFiles((prev) => {
        const n = { ...prev };
        delete n[evaluationId];
        return n;
      });
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre le document corrigé.'));
    } finally {
      setSubmitting(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';
  const docsNeedingAction = bundle.evaluations.filter(
    (e) => e.verdict === 'rejected' || e.verdict === 'needs_correction'
  );

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Évaluation approfondie</p>
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

      {/* Payment */}
      {bundle.payment && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-anac-navy">Paiement</p>
          {!bundle.payment.invoiceFileUrl ? (
            <p className="text-anac-muted text-xs">
              En attente de la facture de la Direction de la Navigabilité.
            </p>
          ) : bundle.payment.status === 'validated' ? (
            <p className="text-anac-success text-xs">Paiement validé.</p>
          ) : bundle.payment.proofFileUrl ? (
            <p className="text-anac-muted text-xs">
              {bundle.payment.status === 'pending_validation'
                ? 'Preuve soumise — en attente de validation par la DN.'
                : bundle.payment.rejectionReason
                  ? `Preuve rejetée : ${bundle.payment.rejectionReason}. Merci de soumettre une nouvelle quittance.`
                  : 'En attente.'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-anac-muted text-xs">
                Une facture vous a été envoyée. Merci de soumettre votre quittance de paiement.
              </p>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn-primary text-xs px-3 py-1.5 rounded"
                onClick={handleProofUpload}
                disabled={submitting || !proofFile}
              >
                {submitting ? 'Envoi...' : 'Soumettre ma quittance'}
              </button>
            </div>
          )}

          {/* Re-upload proof if rejected */}
          {bundle.payment.status === 'awaiting_proof' && bundle.payment.rejectionReason && (
            <div className="space-y-2">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn-primary text-xs px-3 py-1.5 rounded"
                onClick={handleProofUpload}
                disabled={submitting || !proofFile}
              >
                {submitting ? 'Envoi...' : 'Soumettre une nouvelle quittance'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Documents needing action */}
      {docsNeedingAction.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-anac-navy">
            Documents à corriger ({docsNeedingAction.length})
          </p>
          {docsNeedingAction.map((ev) => (
            <div key={ev.id} className="border border-anac-border rounded p-2.5 space-y-2">
              <p className="text-xs leading-tight">{ev.label}</p>
              <p
                className={`text-[10px] font-medium ${
                  ev.verdict === 'rejected' ? 'text-anac-danger' : 'text-anac-warning'
                }`}
              >
                {ev.verdict === 'rejected' ? 'Rejeté' : 'À corriger'}
                {ev.correctionDeadline &&
                  ` — avant le ${new Date(ev.correctionDeadline).toLocaleDateString('fr-FR')}`}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="text-[10px]"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setResubmitFiles((prev) => ({ ...prev, [ev.id]: f }));
                  }}
                />
                <button
                  className="btn-primary text-[10px] px-2 py-1 rounded"
                  disabled={!resubmitFiles[ev.id] || submitting}
                  onClick={() => handleResubmit(ev.id)}
                >
                  {submitting ? '...' : 'Soumettre'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bundle.completionRate.validated === bundle.completionRate.total &&
        bundle.completionRate.total > 0 && (
          <p className="text-anac-success text-xs">Tous les documents ont été validés.</p>
        )}
    </div>
  );
}
