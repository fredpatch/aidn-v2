import { useEffect, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { api } from '../../../lib/axios';
import { uploadFile } from '../../../lib/uploads';
import { formatDateTime } from '../../../lib/format';
import type { SiteInspectionBundle } from '../../../lib/api/requests.types';
import { PAYMENT_STATUS_LABELS, labelOf } from '../constants';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { PaymentBlock } from '../../../components/request/PaymentBlock';
import { MeetingDetails } from '../../../components/request/MeetingDetails';

function buildPresentation(bundle: SiteInspectionBundle) {
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
  } else if (!bundle.siteVisit) {
    title = 'Visite en préparation';
    description = "La DN planifie la visite sur site avec l'équipe technique.";
  } else if (!visitHeld) {
    title = 'Visite sur site planifiée';
    description = 'Consultez les informations de visite et préparez votre équipe.';
  }

  return { title, description, tone, paymentValidated, visitHeld };
}

export function SiteInspectionSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<SiteInspectionBundle | null>(null);

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

  const phaseId = bundle.phase.id;
  const phaseClosed = bundle.phase.status === 'closed';
  const presentation = buildPresentation(bundle);

  async function submitProof(file: File) {
    const uploaded = await uploadFile(file);
    await api.post(`/site-inspection/phases/${phaseId}/requests/${requestId}/proof`, {
      uploadAssetId: uploaded.uploadAssetId,
    });
    await load();
  }

  return (
    <section className="border-t border-anac-border pt-4 mt-4 space-y-4">
      <PhaseSummaryCard
        phaseLabel="Démonstration / inspection"
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
          payment={bundle.payment}
          waitingInvoiceText="En attente de la facture de la DN."
          onSubmitProof={submitProof}
        />
      )}

      <SectionCard icon={MapPinned} title="Visite sur site">
        {!bundle.siteVisit ? (
          <p className="mt-3 text-sm text-anac-muted">
            La visite sera affichée ici une fois planifiée par l'ANAC.
          </p>
        ) : (
          <MeetingDetails meeting={bundle.siteVisit} />
        )}
        <p className="mt-3 text-xs text-anac-muted">
          L'avis technique interne n'est pas publié dans le portail postulant.
        </p>
      </SectionCard>
    </section>
  );
}
