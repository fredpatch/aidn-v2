import { api, apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { useEffect, useState } from 'react';

export function CertificatesSection({ requestId }: { requestId: number }) {
  // ── M7 — Délivrance & Certificats ────────────────────────────────────────

  const [bundle, setBundle] = useState<{
    phase: { id: number; status: string } | null;
    payment: {
      id: number;
      status: string;
      invoiceFileUrl: string | null;
      proofFileUrl: string | null;
      rejectionReason: string | null;
    } | null;
    certificate: {
      status: string;
      notifiedAt: string | null;
      collectedAt: string | null;
    } | null;
  } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/certificates/by-request/${requestId}`);
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
      await api.post(`/certificates/phases/${bundle?.phase!.id}/requests/${requestId}/proof`, {
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
  const cert = bundle.certificate;

  // Internal steps (imprimé/signé/archivé) are DN workflow detail, not
  // meaningful to the postulant - collapse them to one "en préparation"
  // state. Only "notified" (ready for pickup) and "collected" are shown
  // distinctly, since those are the two states that actually change what
  // the postulant needs to do next.
  const simplifiedStatus =
    !cert || ['in_preparation', 'printed', 'signed', 'archived'].includes(cert.status)
      ? 'in_preparation'
      : cert.status;

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Délivrance du certificat</p>
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
      {bundle.payment && !cert && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-anac-navy">Paiement</p>
          {!bundle.payment.invoiceFileUrl ? (
            <p className="text-anac-muted text-xs">
              En attente de la facture de la Direction de la Navigabilité.
            </p>
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

      {/* Certificate status - simplified, no document download (collection
          is always in person, never digital) */}
      {cert && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-anac-navy">Statut du certificat</p>
          {simplifiedStatus === 'in_preparation' && (
            <p className="text-anac-muted text-xs">
              Votre certificat est en cours de préparation par la Direction de la Navigabilité.
            </p>
          )}
          {simplifiedStatus === 'notified' && (
            <p className="text-anac-success text-xs">
              Votre certificat est prêt. Merci de vous présenter à nos bureaux pour le retirer en
              personne.
            </p>
          )}
          {simplifiedStatus === 'collected' && (
            <p className="text-anac-muted text-xs">
              Certificat retiré
              {cert.collectedAt && ` le ${new Date(cert.collectedAt).toLocaleDateString('fr-FR')}`}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
