import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, CreditCard, MapPinned, UploadCloud } from 'lucide-react';
import { api, apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { MEETING_STATUS_LABELS } from '../constants';

interface SiteInspectionBundle {
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
}

function fileHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' && parsed.port === '4000') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Relative URLs are already ideal for the portal dev proxy.
  }
  return url;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function buildPresentation(bundle: SiteInspectionBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const paymentValidated = bundle.payment?.status === 'validated';
  const visitHeld = bundle.siteVisit?.status === 'held';

  let title = 'Demonstration / inspection ouverte';
  let description = "Cette phase organise la visite sur site et l'avis technique interne.";
  let tone: 'info' | 'warning' | 'success' = 'info';

  if (phaseClosed) {
    title = 'Demonstration / inspection terminee';
    description = "La visite et l'avis interne ont ete traites.";
    tone = 'success';
  } else if (!bundle.payment?.invoiceFileUrl) {
    title = 'Facture en preparation';
    description = "La facture de cette phase sera disponible ici lorsqu'elle sera emise.";
  } else if (!paymentValidated && !bundle.payment.proofFileUrl) {
    title = 'Action requise';
    description = 'Telechargez la facture puis deposez votre quittance de paiement.';
    tone = 'warning';
  } else if (bundle.payment.status === 'pending_validation') {
    title = 'Quittance en validation';
    description = "Votre preuve de paiement est en cours de verification par l'ANAC.";
  } else if (bundle.payment.rejectionReason) {
    title = 'Nouvelle quittance requise';
    description = `Preuve rejetee : ${bundle.payment.rejectionReason}`;
    tone = 'warning';
  } else if (!bundle.siteVisit) {
    title = 'Visite en preparation';
    description = "La DN planifie la visite sur site avec l'equipe technique.";
  } else if (!visitHeld) {
    title = 'Visite sur site planifiee';
    description = 'Consultez les informations de visite et preparez votre equipe.';
  }

  return { title, description, tone, paymentValidated, visitHeld };
}

export function SiteInspectionSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<SiteInspectionBundle | null>(null);
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
        uploadAssetId: uploaded.id,
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
            <p className="text-sm font-semibold text-anac-navy">Demonstration / inspection</p>
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
            {phaseClosed ? 'Cloturee' : 'En cours'}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <StatusStep done={presentation.paymentValidated} label="Paiement" detail={bundle.payment?.status ?? 'En attente'} />
          <StatusStep
            done={!!bundle.siteVisit}
            label="Visite"
            detail={bundle.siteVisit ? formatDateTime(bundle.siteVisit.scheduledAt) : 'A planifier'}
          />
          <StatusStep
            done={phaseClosed}
            label="Avis interne"
            detail={phaseClosed ? 'Traite' : 'Reserve a la DN'}
          />
        </div>
      </div>

      {bundle.payment && (
        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <CreditCard size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Paiement</p>
          </div>
          <div className="mt-3 space-y-3 text-sm">
            {!bundle.payment.invoiceFileUrl ? (
              <p className="text-anac-muted">En attente de la facture de la DN.</p>
            ) : (
              <a
                href={fileHref(bundle.payment.invoiceFileUrl)}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary inline-flex rounded px-3 py-1.5 text-xs"
              >
                Consulter la facture
              </a>
            )}
            {bundle.payment.status === 'validated' ? (
              <p className="text-sm font-medium text-anac-success">Paiement valide.</p>
            ) : bundle.payment.proofFileUrl && bundle.payment.status === 'pending_validation' ? (
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
          <MapPinned size={16} aria-hidden="true" />
          <p className="text-sm font-semibold">Visite sur site</p>
        </div>
        {!bundle.siteVisit ? (
          <p className="mt-3 text-sm text-anac-muted">
            La visite sera affichee ici une fois planifiee par l'ANAC.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <span className="text-anac-muted">Date : </span>
              <span className="font-medium text-anac-navy">
                {formatDateTime(bundle.siteVisit.scheduledAt)}
              </span>
            </p>
            {bundle.siteVisit.location && (
              <p>
                <span className="text-anac-muted">Lieu : </span>
                <span className="font-medium text-anac-navy">{bundle.siteVisit.location}</span>
              </p>
            )}
            <p>
              <span className="text-anac-muted">Statut : </span>
              <span className="font-medium text-anac-navy">
                {MEETING_STATUS_LABELS[bundle.siteVisit.status] ?? bundle.siteVisit.status}
              </span>
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-anac-muted">
          L'avis technique interne n'est pas publie dans le portail postulant.
        </p>
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
        <p className="mb-2 text-xs text-anac-danger">Preuve rejetee : {rejectedReason}</p>
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
        {done ? <CheckCircle2 size={15} aria-hidden="true" /> : <CalendarClock size={15} aria-hidden="true" />}
        <p className="text-xs font-semibold text-anac-navy">{label}</p>
      </div>
      <p className="mt-1 text-xs text-anac-muted">{detail}</p>
    </div>
  );
}
