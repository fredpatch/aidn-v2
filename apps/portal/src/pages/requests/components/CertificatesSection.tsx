import { FileBadge2, PackageCheck } from 'lucide-react';
import { uploadFile } from '../../../lib/uploads';
import { formatDate } from '../../../lib/format';
import type { CertificatesBundle } from '../../../lib/api/requests.types';
import { fetchCertificatesBundle, submitCertificatesProof } from '../../../lib/api/requests.api';
import { usePhaseBundle } from '../hooks/usePhaseBundle';
import { PhaseLoadError } from '../../../components/request/PhaseLoadError';
import { PAYMENT_STATUS_LABELS, labelOf } from '../constants';
import { PhaseSummaryCard, type PhaseTone } from '../../../components/request/PhaseSummaryCard';
import { PhaseStep } from '../../../components/request/PhaseStep';
import { SectionCard } from '../../../components/request/SectionCard';
import { PaymentBlock } from '../../../components/request/PaymentBlock';

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
  let tone: PhaseTone = 'info';

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
  const { bundle, loadFailed, isFetching, retry, invalidate } = usePhaseBundle(requestId, 'M7', fetchCertificatesBundle);

  if (loadFailed) {
    return <PhaseLoadError phaseLabel="Délivrance du certificat" onRetry={retry} retrying={isFetching} />;
  }
  if (!bundle?.phase) return null;

  const phaseId = bundle.phase.id;
  const phaseClosed = bundle.phase.status === 'closed';
  const cert = bundle.certificate;
  const presentation = buildPresentation(bundle);

  async function submitProof(file: File) {
    const uploaded = await uploadFile(file);
    await submitCertificatesProof(phaseId, requestId, uploaded.uploadAssetId);
    await invalidate();
  }

  return (
    <section className="border-t border-anac-border pt-4 mt-4 space-y-4">
      <PhaseSummaryCard
        phaseLabel="Délivrance du certificat"
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
          label="Préparation"
          detail={cert ? 'Certificat créé' : 'En attente'}
          state={cert ? 'done' : 'waiting'}
        />
        <PhaseStep
          label="Retrait"
          detail={
            presentation.simplifiedStatus === 'notified'
              ? 'Prêt au retrait'
              : presentation.simplifiedStatus === 'collected'
                ? `Retiré le ${formatDate(cert?.collectedAt)}`
                : 'Pas encore disponible'
          }
          state={presentation.simplifiedStatus === 'collected' ? 'done' : 'waiting'}
        />
      </PhaseSummaryCard>

      {bundle.payment && !cert && (
        <PaymentBlock
          title="Paiement final"
          payment={bundle.payment}
          waitingInvoiceText="En attente de la facture du service S5."
          onSubmitProof={submitProof}
        />
      )}

      <SectionCard
        icon={presentation.simplifiedStatus === 'notified' ? PackageCheck : FileBadge2}
        iconClassName={presentation.simplifiedStatus === 'notified' ? 'text-anac-success' : undefined}
        title="Statut du certificat"
      >
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
      </SectionCard>
    </section>
  );
}
