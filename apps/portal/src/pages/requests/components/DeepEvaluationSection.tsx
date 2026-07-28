import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, FileSearch, UploadCloud } from 'lucide-react';
import { api, apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';

type EvaluationVerdict = 'validated' | 'rejected' | 'needs_correction' | null;

interface DeepEvaluationBundle {
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
    verdict: EvaluationVerdict;
    correctionDeadline: string | null;
  }>;
  completionRate: { total: number; validated: number };
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

function paymentLabel(status: string | undefined): string {
  if (!status) return 'En attente';
  return (
    {
      awaiting_invoice: 'Facture en preparation',
      awaiting_proof: 'Quittance attendue',
      pending_validation: 'Quittance en validation',
      validated: 'Paiement valide',
      rejected: 'Quittance rejetee',
    }[status] ?? status
  );
}

function buildPresentation(bundle: DeepEvaluationBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const payment = bundle.payment;
  const paymentValidated = payment?.status === 'validated';
  const docsTotal = bundle.completionRate.total;
  const docsValidated = bundle.completionRate.validated;
  const docsComplete = docsTotal > 0 && docsValidated === docsTotal;
  const docsNeedingAction = bundle.evaluations.filter(
    (item) => item.verdict === 'rejected' || item.verdict === 'needs_correction'
  );

  let title = 'Evaluation approfondie ouverte';
  let description = "L'ANAC analyse les pieces techniques de votre dossier.";
  let tone: 'info' | 'warning' | 'success' = 'info';

  if (phaseClosed) {
    title = 'Evaluation approfondie cloturee';
    description = 'Les documents requis ont ete traites et le dossier passe a la suite.';
    tone = 'success';
  } else if (!payment?.invoiceFileUrl) {
    title = 'Facture en preparation';
    description = "La facture de cette phase sera disponible ici lorsqu'elle sera emise.";
  } else if (!paymentValidated && !payment.proofFileUrl) {
    title = 'Action requise';
    description = 'Telechargez la facture puis deposez votre quittance de paiement.';
    tone = 'warning';
  } else if (payment.status === 'pending_validation') {
    title = 'Quittance en validation';
    description = "Votre preuve de paiement est en cours de verification par l'ANAC.";
  } else if (payment.rejectionReason) {
    title = 'Nouvelle quittance requise';
    description = `Preuve rejetee : ${payment.rejectionReason}`;
    tone = 'warning';
  } else if (docsNeedingAction.length > 0) {
    title = 'Corrections requises';
    description = `${docsNeedingAction.length} document(s) necessitent une correction.`;
    tone = 'warning';
  } else if (docsComplete) {
    title = 'Documents valides';
    description = 'Tous les documents de cette phase ont ete valides.';
    tone = 'success';
  }

  return { title, description, tone, paymentValidated, docsComplete, docsNeedingAction };
}

export function DeepEvaluationSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<DeepEvaluationBundle | null>(null);
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

  async function upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  async function handleProofUpload() {
    if (!proofFile) {
      notify.warning('Merci de joindre votre quittance de paiement.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await upload(proofFile);
      await api.post(`/deep-evaluation/phases/${bundle?.phase!.id}/requests/${requestId}/proof`, {
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

  async function handleResubmit(evaluationId: number) {
    const file = resubmitFiles[evaluationId];
    if (!file) return;
    setSubmitting(true);
    try {
      const uploaded = await upload(file);
      await api.post(`/deep-evaluation/evaluations/${evaluationId}/resubmit`, {
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
        uploadAssetId: uploaded.id,
      });
      notify.success('Document corrige soumis.');
      setResubmitFiles((prev) => {
        const next = { ...prev };
        delete next[evaluationId];
        return next;
      });
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre le document corrige.'));
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
            <p className="text-sm font-semibold text-anac-navy">Evaluation approfondie</p>
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
          <StatusStep
            done={presentation.paymentValidated}
            label="Paiement"
            detail={paymentLabel(bundle.payment?.status)}
          />
          <StatusStep
            done={presentation.docsComplete}
            label="Documents"
            detail={`${bundle.completionRate.validated}/${bundle.completionRate.total} valides`}
          />
          <StatusStep
            done={phaseClosed}
            label="Suite du dossier"
            detail={phaseClosed ? 'Phase cloturee' : 'Traitement ANAC en cours'}
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

      {presentation.docsNeedingAction.length > 0 && (
        <div className="rounded-lg border border-anac-warning/40 bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <AlertCircle size={16} className="text-anac-warning" aria-hidden="true" />
            <p className="text-sm font-semibold">
              Documents a corriger ({presentation.docsNeedingAction.length})
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {presentation.docsNeedingAction.map((ev) => (
              <div key={ev.id} className="rounded border border-anac-border p-3">
                <p className="text-sm font-medium text-anac-navy">{ev.label}</p>
                <p className="mt-1 text-xs text-anac-muted">
                  {ev.verdict === 'rejected' ? 'Document rejete' : 'Document a corriger'}
                  {ev.correctionDeadline &&
                    ` - attendu avant le ${new Date(ev.correctionDeadline).toLocaleDateString('fr-FR')}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="text-xs"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) {
                        setResubmitFiles((prev) => ({ ...prev, [ev.id]: selected }));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                    disabled={!resubmitFiles[ev.id] || submitting}
                    onClick={() => handleResubmit(ev.id)}
                  >
                    <UploadCloud size={13} aria-hidden="true" />
                    {submitting ? 'Envoi...' : 'Soumettre la correction'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {presentation.docsNeedingAction.length === 0 && (
        <div className="rounded-lg border border-anac-border bg-white p-4">
          <div className="flex items-center gap-2 text-anac-navy">
            <FileSearch size={16} aria-hidden="true" />
            <p className="text-sm font-semibold">Evaluation des documents</p>
          </div>
          <p className="mt-3 text-sm text-anac-muted">
            {presentation.docsComplete
              ? 'Tous les documents ont ete valides.'
              : "L'ANAC analyse les documents soumis. Les corrections eventuelles apparaitront ici."}
          </p>
        </div>
      )}
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
      <label className="flex cursor-pointer flex-col gap-1 text-sm">
        <span className="font-medium text-anac-navy">Deposer ma quittance</span>
        <span className="text-xs text-anac-muted">Formats acceptes : PDF, Word, PNG ou JPG.</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          className="mt-2 text-xs"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
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
