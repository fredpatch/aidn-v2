import { useState } from 'react';
import { AlertCircle, FileSearch, UploadCloud } from 'lucide-react';
import { apiErrorMessage } from '../../../lib/axios';
import { uploadFile } from '../../../lib/uploads';
import { notify } from '../../../lib/notify';
import { formatDate } from '../../../lib/format';
import type { DeepEvaluationBundle } from '../../../lib/api/requests.types';
import { fetchDeepEvaluationBundle, submitDeepEvaluationProof, resubmitDeepEvaluationDocument } from '../../../lib/api/requests.api';
import { usePhaseBundle } from '../hooks/usePhaseBundle';
import { PhaseLoadError } from '../../../components/request/PhaseLoadError';
import { PAYMENT_STATUS_LABELS, labelOf } from '../constants';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { PaymentBlock } from '../../../components/request/PaymentBlock';

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

  let title = 'Évaluation approfondie ouverte';
  let description = "L'ANAC analyse les pièces techniques de votre dossier.";
  let tone: PhaseTone = 'info';

  if (phaseClosed) {
    title = 'Évaluation approfondie clôturée';
    description = 'Les documents requis ont été traités et le dossier passe à la suite.';
    tone = 'success';
  } else if (!payment?.invoiceFileUrl) {
    title = 'Facture en préparation';
    description = "La facture de cette phase sera disponible ici lorsqu'elle sera émise.";
  } else if (!paymentValidated && !payment.proofFileUrl) {
    title = 'Action requise';
    description = 'Téléchargez la facture puis déposez votre quittance de paiement.';
    tone = 'warning';
  } else if (payment.status === 'pending_validation') {
    title = 'Quittance en validation';
    description = "Votre preuve de paiement est en cours de vérification par l'ANAC.";
  } else if (payment.rejectionReason) {
    title = 'Nouvelle quittance requise';
    description = `Preuve rejetée : ${payment.rejectionReason}`;
    tone = 'warning';
  } else if (docsNeedingAction.length > 0) {
    title = 'Corrections requises';
    description = `${docsNeedingAction.length} document(s) nécessitent une correction.`;
    tone = 'warning';
  } else if (docsComplete) {
    title = 'Documents validés';
    description = 'Tous les documents de cette phase ont été validés.';
    tone = 'success';
  }

  return { title, description, tone, paymentValidated, docsComplete, docsNeedingAction };
}

export function DeepEvaluationSection({ requestId }: { requestId: number }) {
  const [resubmitFiles, setResubmitFiles] = useState<Record<number, File>>({});
  const [submitting, setSubmitting] = useState(false);
  const { bundle, loadFailed, isFetching, retry, invalidate } = usePhaseBundle(requestId, 'M5', fetchDeepEvaluationBundle);

  if (loadFailed) {
    return <PhaseLoadError phaseLabel="Évaluation approfondie" onRetry={retry} retrying={isFetching} />;
  }
  if (!bundle?.phase) return null;

  const phaseId = bundle.phase.id;

  async function submitProof(file: File) {
    const uploaded = await uploadFile(file);
    await submitDeepEvaluationProof(phaseId, requestId, uploaded.uploadAssetId);
    await invalidate();
  }

  async function handleResubmit(evaluationId: number) {
    const file = resubmitFiles[evaluationId];
    if (!file) return;
    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await resubmitDeepEvaluationDocument(evaluationId, uploaded.uploadAssetId);
      notify.success('Document corrigé soumis.');
      setResubmitFiles((prev) => {
        const next = { ...prev };
        delete next[evaluationId];
        return next;
      });
      await invalidate();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre le document corrigé.'));
    } finally {
      setSubmitting(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';
  const presentation = buildPresentation(bundle);

  return (
    <section className="border-t border-anac-border pt-4 mt-4 space-y-4">
      <PhaseSummaryCard
        phaseLabel="Évaluation approfondie"
        title={presentation.title}
        description={presentation.description}
        tone={presentation.tone}
        closed={phaseClosed}
      >
        <PhaseStep
          label="Paiement"
          detail={labelOf(PAYMENT_STATUS_LABELS, bundle.payment?.status, 'En attente')}
          state={presentation.paymentValidated ? 'done' : 'waiting'}
        />
        <PhaseStep
          label="Documents"
          detail={`${bundle.completionRate.validated}/${bundle.completionRate.total} validés`}
          state={presentation.docsComplete ? 'done' : 'waiting'}
        />
        <PhaseStep
          label="Suite du dossier"
          detail={phaseClosed ? 'Phase clôturée' : 'Traitement ANAC en cours'}
          state={phaseClosed ? 'done' : 'waiting'}
        />
      </PhaseSummaryCard>

      {bundle.payment && (
        <PaymentBlock
          payment={bundle.payment}
          waitingInvoiceText="En attente de la facture de la DN."
          onSubmitProof={submitProof}
        />
      )}

      {presentation.docsNeedingAction.length > 0 && (
        <SectionCard
          icon={AlertCircle}
          iconClassName="text-anac-warning"
          className="border-anac-warning/40"
          title={`Documents à corriger (${presentation.docsNeedingAction.length})`}
        >
          <div className="mt-3 space-y-2">
            {presentation.docsNeedingAction.map((ev) => (
              <div key={ev.id} className="rounded border border-anac-border p-3">
                <p className="text-sm font-medium text-anac-navy">{ev.label}</p>
                <p className="mt-1 text-xs text-anac-muted">
                  {ev.verdict === 'rejected' ? 'Document rejeté' : 'Document à corriger'}
                  {ev.correctionDeadline && ` - attendu avant le ${formatDate(ev.correctionDeadline)}`}
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
        </SectionCard>
      )}

      {presentation.docsNeedingAction.length === 0 && (
        <SectionCard icon={FileSearch} title="Évaluation des documents">
          <p className="mt-3 text-sm text-anac-muted">
            {presentation.docsComplete
              ? 'Tous les documents ont été validés.'
              : "L'ANAC analyse les documents soumis. Les corrections éventuelles apparaîtront ici."}
          </p>
        </SectionCard>
      )}
    </section>
  );
}
