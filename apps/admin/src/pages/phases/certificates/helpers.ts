import type { ChecklistItem, CertificateBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/PhaseWorkflowSummary';

export function buildChecklist(bundle: CertificateBundle): ChecklistItem[] {
  const { payment, certificate } = bundle;
  return [
    { label: 'Facture envoyee au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement valide (certificat cree)', done: payment?.status === 'validated' },
    { label: 'Champs du certificat renseignes', done: !!certificate?.approvalReferenceNumber },
    { label: 'Document genere', done: (certificate?.status ?? 'in_preparation') !== 'in_preparation' },
    { label: 'Imprime', done: !!certificate?.printedAt },
    { label: 'Retour signe enregistre', done: !!certificate?.signedAt && !!certificate?.signedFileUrl },
    { label: 'Archive', done: !!certificate?.archivedAt },
    { label: 'Postulant notifie', done: !!certificate?.notifiedAt },
    { label: 'Retire par le postulant (phase cloturee)', done: !!certificate?.collectedAt },
  ];
}

export function certificateWorkflowSummary(bundle: CertificateBundle): PhaseWorkflowSummaryState {
  const phaseStatus = bundle.phase?.status ?? 'open';
  const certificate = bundle.certificate;
  const paymentLabel =
    bundle.payment?.status === 'validated'
      ? 'Valide'
      : bundle.payment?.proofFileUrl
        ? 'A valider'
        : bundle.payment?.invoiceFileUrl
          ? 'Preuve attendue'
          : 'Facture attendue';
  const certificateLabel = certificate?.reference ?? 'Non cree';
  const lifecycleLabel = !certificate
    ? 'Non demarre'
    : certificate.collectedAt
      ? 'Retire'
      : certificate.notifiedAt
        ? 'Postulant notifie'
        : certificate.archivedAt
          ? 'Archive'
          : certificate.signedAt
            ? 'Retour signe'
            : certificate.printedAt
              ? 'Imprime'
              : certificate.status === 'in_preparation'
                ? 'En preparation'
                : certificate.status;

  const metrics = [
    { label: 'Paiement', value: paymentLabel },
    { label: 'Certificat', value: certificateLabel },
    { label: 'Cycle', value: lifecycleLabel },
  ];

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase cloturee',
      description: 'Le cycle de delivrance est termine et reste disponible pour audit.',
      owner: 'DN',
      tone: 'muted',
      phaseStatus,
      metrics,
    };
  }

  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture a envoyer',
      description: 'S5 envoie la facture avant la creation du certificat.',
      owner: 'S5',
      tone: 'warning',
      phaseStatus,
      blockReason: 'Le certificat est cree apres validation du paiement.',
      metrics,
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      title: 'Paiement a valider',
      description: 'S5 valide la preuve de paiement pour creer ou poursuivre le certificat.',
      owner: 'S5',
      tone: 'warning',
      phaseStatus,
      blockReason: 'La delivrance ne peut pas avancer tant que le paiement n est pas valide.',
      metrics,
    };
  }

  if (!certificate) {
    return {
      title: 'Certificat a creer',
      description: 'Le certificat sera cree apres validation du paiement.',
      owner: 'S5',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.approvalReferenceNumber || !certificate.scopeDetails) {
    return {
      title: 'Champs du certificat a completer',
      description: 'Renseigner les references administratives et le perimetre avant generation.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      metrics,
    };
  }

  if (certificate.status === 'in_preparation') {
    return {
      title: 'Document a generer',
      description: 'Generer le document de certificat apres verification des champs.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.printedAt) {
    return {
      title: 'Certificat a imprimer',
      description: 'Marquer le certificat comme imprime lorsque le document physique est produit.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.signedAt || !certificate.signedFileUrl) {
    return {
      title: 'Retour signe a enregistrer',
      description: 'Scanner le certificat retourne signe avant archivage.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.archivedAt) {
    return {
      title: 'Archivage a effectuer',
      description: 'Archiver le certificat signe avant notification du postulant.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.notifiedAt) {
    return {
      title: 'Postulant a notifier',
      description: 'Notifier le postulant que le certificat est disponible.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.collectedAt) {
    return {
      title: 'Retrait a enregistrer',
      description: 'Enregistrer le retrait du certificat par le postulant pour terminer la phase.',
      owner: 'DN',
      tone: 'success',
      phaseStatus,
      metrics,
    };
  }

  return {
    title: 'Delivrance terminee',
    description: 'Le certificat a ete retire par le postulant.',
    owner: 'DN',
    tone: 'success',
    phaseStatus,
    metrics,
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

/** yyyy-MM-dd for <input type="date"> from an ISO datetime string. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}
