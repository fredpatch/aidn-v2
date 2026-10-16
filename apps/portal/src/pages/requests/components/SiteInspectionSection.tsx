import { MapPinned } from 'lucide-react';
import { uploadFile } from '../../../lib/uploads';
import { formatDate, formatDateTime } from '../../../lib/format';
import type { SiteInspectionBundle } from '../../../lib/api/requests.types';
import { fetchSiteInspectionBundle, submitSiteInspectionProof } from '../../../lib/api/requests.api';
import { usePhaseBundle } from '../hooks/usePhaseBundle';
import { PhaseLoadError } from '../../../components/request/PhaseLoadError';
import { MEETING_STATUS_LABELS, PAYMENT_STATUS_LABELS, labelOf } from '../constants';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { PaymentBlock } from '../../../components/request/PaymentBlock';
import { useApplicantActions } from '../../../hooks/useApplicantActions';
import { topPhaseAction } from '../../../lib/actions/selectors';
import { MeetingDetails } from '../../../components/request/MeetingDetails';

export function buildSiteInspectionPresentation(bundle: SiteInspectionBundle) {
  const phaseClosed = bundle.phase?.status === 'closed';
  const paymentValidated = bundle.payment?.status === 'validated';
  const visitHeld = bundle.siteVisit?.status === 'held';

  let title = 'Démonstration / inspection ouverte';
  let description = "Cette phase organise la visite sur site et l'avis technique interne.";
  let tone: PhaseTone = 'info';

  if (phaseClosed) {
    title = 'Démonstration / inspection terminée';
    description = "La visite et l'avis interne ont été traités.";
    tone = 'success';
  } else if (!bundle.payment?.invoiceFileUrl) {
    title = 'Facture en préparation';
    description = "La facture de cette phase sera disponible ici lorsqu'elle sera émise.";
  } else if (bundle.payment.status === 'awaiting_proof') {
    // SESSION1-UX-1 / D11 - passive; the payment_proof action carries the call to action.
    title = 'Facture disponible';
    description = 'La facture de cette phase est disponible.';
  } else if (bundle.payment.status === 'pending_validation') {
    title = 'Quittance transmise';
    description = 'Votre quittance a bien été transmise. Elle sera validée par le service Finance.';
  } else if (!bundle.siteVisit) {
    title = 'Visite en préparation';
    description = "La DN planifie la visite sur site avec l'équipe technique.";
  } else if (!visitHeld) {
    title = 'Visite sur site planifiée';
    description = 'Consultez les informations de visite et préparez votre équipe.';
  }

  return { title, description, tone, paymentValidated, visitHeld };
}

/** One line for the collapsed row of a closed phase. */
export function summarizeSiteInspection(bundle: SiteInspectionBundle): string {
  const parts: string[] = [];
  if (bundle.siteVisit) {
    parts.push(`Visite : ${labelOf(MEETING_STATUS_LABELS, bundle.siteVisit.status).toLowerCase()} (${formatDate(bundle.siteVisit.scheduledAt)})`);
  }
  parts.push(labelOf(PAYMENT_STATUS_LABELS, bundle.payment?.status, 'Paiement en attente').toLowerCase());
  return parts.join(' · ');
}

export function SiteInspectionSection({ requestId }: { requestId: number }) {
  const { actions } = useApplicantActions();
  const { bundle, loadFailed, isFetching, retry, invalidate } = usePhaseBundle(requestId, 'M6', fetchSiteInspectionBundle);

  if (loadFailed) {
    return <PhaseLoadError phaseLabel="Démonstration / inspection" onRetry={retry} retrying={isFetching} />;
  }
  if (!bundle?.phase) return null;

  const phaseId = bundle.phase.id;
  const phaseClosed = bundle.phase.status === 'closed';
  const presentation = buildSiteInspectionPresentation(bundle);

  async function submitProof(file: File) {
    const uploaded = await uploadFile(file);
    await submitSiteInspectionProof(phaseId, requestId, uploaded.uploadAssetId);
    await invalidate();
  }

  return (
    <section className="space-y-4">
      <PhaseSummaryCard
        phaseLabel="Démonstration / inspection"
        title={presentation.title}
        description={presentation.description}
        tone={presentation.tone}
        action={topPhaseAction(actions ?? [], requestId, 'M6')}
        closed={phaseClosed}
      >
        <PhaseStep
          label="Paiement"
          detail={labelOf(PAYMENT_STATUS_LABELS, bundle.payment?.status, 'En attente')}
          state={presentation.paymentValidated ? 'done' : 'waiting'}
        />
        <PhaseStep
          label="Visite"
          detail={bundle.siteVisit ? formatDateTime(bundle.siteVisit.scheduledAt) : 'À planifier'}
          state={bundle.siteVisit ? 'done' : 'waiting'}
        />
        <PhaseStep
          label="Avis interne"
          detail={phaseClosed ? 'Traité' : 'Réservé à la DN'}
          state={phaseClosed ? 'done' : 'waiting'}
        />
      </PhaseSummaryCard>

      {bundle.payment && (
        <PaymentBlock
          anchor="paiement-M6"
          payment={bundle.payment}
          waitingInvoiceText="En attente de la facture du service Finance."
          onSubmitProof={submitProof}
        />
      )}

      <SectionCard icon={MapPinned} title="Visite sur site">
        {!bundle.siteVisit ? (
          <p className="mt-3 text-sm text-anac-muted">
            La visite sera affichée ici une fois planifiée par l&apos;ANAC.
          </p>
        ) : (
          <MeetingDetails meeting={bundle.siteVisit} />
        )}
        <p className="mt-3 text-xs text-anac-muted">
          L&apos;avis technique interne n&apos;est pas publié dans le portail postulant.
        </p>
      </SectionCard>
    </section>
  );
}
