import type { ChecklistItem, CertificateBundle } from './types';
import type { PhaseWorkflowSummaryState } from '../components/workflow-state';
import { DN_OWNER, FINANCE_OWNER, paymentPendingState } from '../owners';

export function buildChecklist(bundle: CertificateBundle): ChecklistItem[] {
  const { payment, certificate } = bundle;
  return [
    { label: 'Facture envoyée au postulant', done: !!payment?.invoiceFileUrl },
    { label: 'Preuve de paiement soumise', done: !!payment?.proofFileUrl },
    { label: 'Paiement validé (certificat créé)', done: payment?.status === 'validated' },
    { label: 'Champs du certificat renseignés', done: !!certificate?.approvalReferenceNumber },
    { label: 'Document généré', done: (certificate?.status ?? 'in_preparation') !== 'in_preparation' },
    { label: 'Imprimé', done: !!certificate?.printedAt },
    { label: 'Retour signé enregistré', done: !!certificate?.signedAt && !!certificate?.signedFileUrl },
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
            ? 'Retour signé'
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
      state: 'done',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!bundle.payment?.invoiceFileUrl) {
    return {
      title: 'Facture à envoyer',
      description: 'Finance envoie la facture avant la création du certificat.',
      state: 'action_required',
      owner: FINANCE_OWNER,
      phaseStatus,
      blockReason: 'Le certificat est créé après validation du paiement.',
      metrics,
    };
  }

  if (bundle.payment.status !== 'validated') {
    return {
      ...paymentPendingState(bundle.payment, 'Finance valide la preuve de paiement pour créer ou poursuivre le certificat.'),
      phaseStatus,
      blockReason: 'La délivrance ne peut pas avancer tant que le paiement n’est pas validé.',
      metrics,
    };
  }

  if (!certificate) {
    return {
      title: 'Certificat à créer',
      description: 'Le certificat sera créé après validation du paiement.',
      state: 'information',
      owner: FINANCE_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.approvalReferenceNumber || !certificate.scopeDetails) {
    return {
      title: 'Champs du certificat à compléter',
      description: 'Renseigner les références administratives et le périmètre avant génération.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (certificate.status === 'in_preparation') {
    return {
      title: 'Document à générer',
      description: 'Générer le document de certificat après vérification des champs.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.printedAt) {
    return {
      title: 'Certificat à imprimer',
      description: 'Marquer le certificat comme imprimé lorsque le document physique est produit.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.signedAt || !certificate.signedFileUrl) {
    return {
      title: 'Retour signé à enregistrer',
      description: 'Scanner le certificat retourné signé avant archivage.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.archivedAt) {
    return {
      title: 'Archivage à effectuer',
      description: 'Archiver le certificat signé avant notification du postulant.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  if (!certificate.notifiedAt) {
    return {
      title: 'Postulant à notifier',
      description: 'Notifier le postulant que le certificat est disponible.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  // Ruling (SESSION1-UX-1 final review, kept on purpose): the phase page shows
  // the collection as DN work - the DN records it here - while the Demandes
  // cockpit says « En attente du postulant » (retrait en personne).
  if (!certificate.collectedAt) {
    return {
      title: 'Retrait à enregistrer',
      description: 'Enregistrer le retrait du certificat par le postulant pour terminer la phase.',
      state: 'action_required',
      owner: DN_OWNER,
      phaseStatus,
      metrics,
    };
  }

  return {
    title: 'Délivrance terminée',
    description: 'Le certificat a été retiré par le postulant.',
    state: 'done',
    owner: DN_OWNER,
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
