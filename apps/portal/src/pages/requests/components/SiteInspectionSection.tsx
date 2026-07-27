import { api, apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { useEffect, useState } from 'react';
import { MEETING_STATUS_LABELS } from '../constants';

export function SiteInspectionSection({ requestId }: { requestId: number }) {
  // ── M6 — Démonstration/Inspection sur site ───────────────────────────────

  const [bundle, setBundle] = useState<{
    phase: { id: number; status: string } | null;
    payment: {
      id: number;
      status: string;
      invoiceFileUrl: string | null;
      proofFileUrl: string | null;
      rejectionReason: string | null;
    } | null;
    siteVisit: {
      scheduledAt: string;
      location: string | null;
      status: string;
    } | null;
  } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/site-inspection/by-request/${requestId}`);
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
      await api.post(`/site-inspection/phases/${bundle?.phase!.id}/requests/${requestId}/proof`, {
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

  const phaseClosed = bundle.phase.status === 'closed';

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Démonstration / Inspection sur site</p>
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

      {/* Site visit — read-only, DN plans it */}
      {bundle.siteVisit && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-anac-navy">Visite sur site</p>
          <p className="text-xs text-anac-muted">
            {new Date(bundle.siteVisit.scheduledAt).toLocaleString('fr-FR')}
            {bundle.siteVisit.location && ` — ${bundle.siteVisit.location}`}
          </p>
          <p className="text-[10px] text-anac-muted">
            {MEETING_STATUS_LABELS[bundle.siteVisit.status] ?? bundle.siteVisit.status}
          </p>
        </div>
      )}

      {/* R3's opinion is intentionally never shown here — DN-internal only,
          per the locked business rule in modules-feasibility.md (M8 doc
          visibility section). The postulant only sees that the phase has
          closed; they learn the outcome through the physical DG decision
          process, not through this portal. */}
    </div>
  );
}
