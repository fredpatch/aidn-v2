import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, FileBadge2, PackageCheck, UploadCloud } from 'lucide-react';
import { api, apiErrorMessage } from '../../../lib/axios';
import { uploadFile } from '../../../lib/uploads';
import { notify } from '../../../lib/notify';
import FileLink from '../../../components/files/FileLink';
import { PAYMENT_STATUS_LABELS, labelOf } from '../constants';

interface CertificatesBundle {
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
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

function simplifiedCertificateStatus(status: string | undefined): string {
  if (!status || ['in_preparation', 'printed', 'signed', 'archived'].includes(status)) {
    return 'in_preparation';
  }
  return status;
}

function buildPresentation(bundle: CertificatesBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const paymentValidated = bundle.payment?.status === 'validated';
  const simplifiedStatus = simplifiedCertificateStatus(bundle.certificate?.status);

  let title = 'Délivrance ouverte';
  let description = 'Cette phase couvre le paiement final, la préparation et le retrait du certificat.';
  let tone: 'info' | 'warning' | 'success' = 'info';

  if (simplifiedStatus === 'collected' || phaseClosed) {
    title = 'Certificat retiré';
    description = 'Le certificat a été retiré et le workflow est terminé.';
    tone = 'success';
  } else if (simplifiedStatus === 'notified') {
    title = 'Certificat prêt';
    description = "Présentez-vous aux bureaux de l'ANAC pour retirer le certificat en personne.";
    tone = 'warning';
  } else if (!bundle.payment?.invoiceFileUrl) {
    title = 'Facture en préparation';
    description = "La facture finale sera disponible ici lorsqu'elle sera émise.";
  } else if (!paymentValidated && !bundle.payment.proofFileUrl) {
    title = 'Action requise';
    description = 'Téléchargez la facture puis déposez votre quittance de paiement.';
    tone = 'warning';
  } else if (bundle.payment.status === 'pending_validation') {
    title = 'Quittance en validation';
    description = "Votre preuve de paiement est en cours de vérification par l'ANAC.";
  } else if (bundle.payment.rejectionReason) {
    title = 'Nouvelle quittance requise';
    description = `Preuve rejetée : ${bundle.payment.rejectionReason}`;
    tone = 'warning';
  } else if (bundle.certificate) {
    title = 'Certificat en préparation';
    description = 'La DN prépare le certificat. Le portail indiquera quand il sera prêt au retrait.';
  }

  return { title, description, tone, paymentValidated, simplifiedStatus };
}

export function CertificatesSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<CertificatesBundle | null>(null);
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
      const uploaded = await uploadFile(proofFile);
      await api.post(`/certificates/phases/${bundle?.phase!.id}/requests/${requestId}/proof`, { uploadAssetId: uploaded.uploadAssetId });
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
  const presentation = buildPresentation(bundle);

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
          <div>
            <p className="text-sm font-semibold text-anac-navy">Délivrance du certificat</p>
            <h3 className="mt-1 text-base font-semibold text-anac-navy">{presentation.title}</h3>
            <p className="mt-1 text-sm text-anac-muted">{presentation.description}</p>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              phaseClosed
                ? 'bg-anac-success/10 text-anac-success'
                : 'bg-anac-info/10 text-anac-info'
            }`}
          >
            {phaseClosed ? 'Clôturée' : 'En cours'}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <StatusStep done={presentation.paymentValidated} label="Paiement" detail={labelOf(PAYMENT_STATUS_LABELS, bundle.payment?.status, 'En attente')} />
          <StatusStep
            done={!!cert}
            label="Préparation"
            detail={cert ? 'Certificat créé' : 'En attente'}
          />
          <StatusStep
            done={presentation.simplifiedStatus === 'collected'}
            label="Retrait"
            detail={
              presentation.simplifiedStatus === 'notified'
                ? 'Prêt au retrait'
                : presentation.simplifiedStatus === 'collected'
                  ? `Retiré le ${formatDate(cert?.collectedAt)}`
                  : 'Pas encore disponible'
            }
          />
        </div>
      </div>

      {bundle.payment && !cert && (
        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <CreditCard size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Paiement final</p>
          </div>
          <div className="mt-3 space-y-3 text-sm">
            {!bundle.payment.invoiceFileUrl ? (
              <p className="text-anac-muted">En attente de la facture du service S5.</p>
            ) : (
              <FileLink
                address={bundle.payment.invoiceFileUrl}
                className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
              >
                Consulter la facture
              </FileLink>
            )}
            {bundle.payment.proofFileUrl && bundle.payment.status === 'pending_validation' ? (
              <p className="text-anac-muted">Quittance soumise, en attente de validation.</p>
            ) : bundle.payment.invoiceFileUrl ? (
              <PaymentUpload
                rejectedReason={bundle.payment.rejectionReason}
                proofFile={proofFile}
                submitting={submitting}
                onFile={setProofFile}
                onSubmit={handleProofUpload}
              />
            ) : null}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-anac-border bg-white p-4">
        <div className="flex items-center gap-2 text-anac-navy">
          {presentation.simplifiedStatus === 'notified' ? (
            <PackageCheck size={16} className="text-anac-success" aria-hidden="true" />
          ) : (
            <FileBadge2 size={16} aria-hidden="true" />
          )}
          <p className="text-sm font-semibold">Statut du certificat</p>
        </div>

        {presentation.simplifiedStatus === 'in_preparation' && (
          <p className="mt-3 text-sm text-anac-muted">
            Votre certificat est en préparation. Aucun téléchargement n'est disponible sur le
            portail, le retrait se fait en personne.
          </p>
        )}
        {presentation.simplifiedStatus === 'notified' && (
          <div className="mt-3 rounded border border-anac-success/30 bg-anac-success/5 p-3">
            <p className="text-sm font-medium text-anac-navy">Certificat prêt au retrait</p>
            <p className="mt-1 text-xs text-anac-muted">
              Notification envoyée le {formatDate(cert?.notifiedAt)}. Merci de vous présenter aux
              bureaux de l'ANAC pour le retrait.
            </p>
          </div>
        )}
        {presentation.simplifiedStatus === 'collected' && (
          <p className="mt-3 text-sm text-anac-success">
            Certificat retiré le {formatDate(cert?.collectedAt)}.
          </p>
        )}
      </div>
    </section>
  );
}

function PaymentUpload({
  rejectedReason,
  proofFile,
  submitting,
  onFile,
  onSubmit,
}: {
  rejectedReason: string | null;
  proofFile: File | null;
  submitting: boolean;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded border border-dashed border-anac-border p-3">
      {rejectedReason && (
        <p className="mb-2 text-xs text-anac-danger">Preuve rejetée : {rejectedReason}</p>
      )}
      <input
        type="file"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        className="text-xs"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
        onClick={onSubmit}
        disabled={submitting || !proofFile}
      >
        <UploadCloud size={13} aria-hidden="true" />
        {submitting ? 'Envoi...' : 'Soumettre ma quittance'}
      </button>
    </div>
  );
}

function StatusStep({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div
      className={`rounded border p-3 ${
        done ? 'border-anac-success/30 text-anac-success' : 'border-anac-border text-anac-muted'
      } bg-white`}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 size={15} aria-hidden="true" />
        <p className="text-xs font-semibold text-anac-navy">{label}</p>
      </div>
      <p className="mt-1 text-xs text-anac-muted">{detail}</p>
    </div>
  );
}
