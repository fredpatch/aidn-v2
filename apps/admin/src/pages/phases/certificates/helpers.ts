import type { ChecklistItem, CertificateBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/PhaseWorkflowSummary';

export function buildChecklist(bundle: CertificateBundle): ChecklistItem[] {
  const { payment, certificate } = bundle;
  return [
    { label: 'Facture envoyée au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement validé (certificat créé)', done: payment?.status === 'validated' },
    { label: 'Champs du certificat renseignés', done: !!certificate?.approvalReferenceNumber },
    { label: 'Document généré', done: (certificate?.status ?? 'in_preparation') !== 'in_preparation' },
    { label: 'Imprimé', done: !!certificate?.printedAt },
    { label: 'Signé', done: !!certificate?.signedAt },
    { label: 'Archivé', done: !!certificate?.archivedAt },
    { label: 'Postulant notifié', done: !!certificate?.notifiedAt },
    { label: 'Retiré par le postulant (phase clôturée)', done: !!certificate?.collectedAt },
  ];
}

export function certificateWorkflowSummary(bundle: CertificateBundle): PhaseWorkflowSummaryState {
  const phaseStatus = bundle.phase?.status ?? 'open';
  const certificate = bundle.certificate;
  const paymentLabel =
    bundle.payment?.status === 'validated'
      ? 'Validé'
      : bundle.payment?.proofFileUrl
        ? 'À valider'
        : bundle.payment?.invoiceFileUrl
          ? 'Preuve attendue'
          : 'Facture attendue';
  const certificateLabel = certificate?.reference ?? 'Non créé';
  const lifecycleLabel = !certificate
    ? 'Non démarré'
    : certificate.collectedAt
      ? 'Retiré'
      : certificate.notifiedAt
        ? 'Postulant notifié'
        : certificate.archivedAt
          ? 'Archivé'
          : certificate.signedAt
            ? 'Signé'
            : certificate.printedAt
              ? 'Imprimé'
              : certificate.status === 'in_preparation'
                ? 'En préparation'
                : certificate.status;

  const metrics = [
    { label: 'Paiement', value: paymentLabel },
    { label: 'Certificat', value: certificateLabel },
    { label: 'Cycle', value: lifecycleLabel },
  ];

  if (phaseStatus === 'closed') {
    return {
      title: 'Phase clôturée',
      description: 'Le cycle de délivrance est terminé et reste disponible pour audit.',
      owner: 'DN',
      tone: 'muted',
      phaseStatus,
      metrics,
    };
  }

  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture à envoyer',
      description: 'Envoyer la facture avant la création du certificat.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason: 'Le certificat est créé après validation du paiement.',
      metrics,
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      title: 'Paiement à valider',
      description: 'Valider la preuve de paiement pour créer ou poursuivre le certificat.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      blockReason: 'La délivrance ne peut pas avancer tant que le paiement n’est pas validé.',
      metrics,
    };
  }

  if (!certificate) {
    return {
      title: 'Certificat à créer',
      description: 'Le certificat sera créé après validation du paiement.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.approvalReferenceNumber || !certificate.scopeDetails) {
    return {
      title: 'Champs du certificat à compléter',
      description: 'Renseigner les références administratives et le périmètre avant génération.',
      owner: 'DN',
      tone: 'warning',
      phaseStatus,
      metrics,
    };
  }

  if (certificate.status === 'in_preparation') {
    return {
      title: 'Document à générer',
      description: 'Générer le document de certificat après vérification des champs.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.printedAt) {
    return {
      title: 'Certificat à imprimer',
      description: 'Marquer le certificat comme imprimé lorsque le document physique est produit.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.signedAt) {
    return {
      title: 'Signature DG attendue',
      description: 'Marquer le certificat comme signé après signature DG.',
      owner: 'DG',
      tone: 'warning',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.archivedAt) {
    return {
      title: 'Archivage à effectuer',
      description: 'Archiver le certificat signé avant notification du postulant.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.notifiedAt) {
    return {
      title: 'Postulant à notifier',
      description: 'Notifier le postulant que le certificat est disponible.',
      owner: 'DN',
      tone: 'info',
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.collectedAt) {
    return {
      title: 'Retrait à enregistrer',
      description: 'Enregistrer le retrait du certificat par le postulant pour terminer la phase.',
      owner: 'DN',
      tone: 'success',
      phaseStatus,
      metrics,
    };
  }

  return {
    title: 'Délivrance terminée',
    description: 'Le certificat a été retiré par le postulant.',
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
