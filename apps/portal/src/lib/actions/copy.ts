import type { ApplicantAction, ApplicantActionKey } from '@aidn/shared';
import { formatDate, formatDateTime } from '../format';

export interface ActionCopy {
  title: string;
  description: string;
  cta: string;
  phaseTitle: string;
  phaseDescription: string;
  phaseCta: string;
}

type CopyBuilder = (a: ApplicantAction) => ActionCopy;

/** All French applicant-action wording lives here (the API sends none). */
const ACTION_COPY: Record<ApplicantActionKey, CopyBuilder> = {
  meeting_confirmation: () => ({
    title: 'Rendez-vous à confirmer',
    description: 'La DN vous propose un rendez-vous. Confirmez-le ou proposez une autre date.',
    cta: 'Répondre',
    phaseTitle: 'Rendez-vous à confirmer',
    phaseDescription: 'Confirmez le rendez-vous proposé par la DN ou proposez une autre date.',
    phaseCta: 'Répondre',
  }),
  signed_meeting_report: () => ({
    title: 'Compte rendu à signer',
    description: 'Un compte rendu de réunion est disponible et doit être retourné signé.',
    cta: 'Voir le dossier',
    phaseTitle: 'Action requise — Compte rendu à signer',
    phaseDescription:
      'Le compte rendu de votre réunion est disponible. Consultez-le, signez-le puis déposez la version signée.',
    phaseCta: 'Accéder au compte rendu',
  }),
  preliminary_declaration: () => ({
    title: 'Déclaration à déposer',
    description: 'Téléchargez le formulaire, remplissez-le, puis déposez votre déclaration.',
    cta: 'Déposer',
    phaseTitle: 'Action requise',
    phaseDescription: 'Téléchargez le formulaire, remplissez-le, puis déposez votre déclaration.',
    phaseCta: 'Déposer la déclaration',
  }),
  formal_letter: () => ({
    title: 'Lettre officielle à déposer',
    description: "Déposez votre lettre officielle de demande d'agrément OMA.",
    cta: 'Déposer',
    phaseTitle: 'Action requise',
    phaseDescription: "Déposez votre lettre officielle de demande d'agrément OMA.",
    phaseCta: 'Déposer la lettre',
  }),
  formal_missing_documents: (a) => {
    const description = `Déposez les pièces manquantes du dossier formel (${a.count ?? 0} manquante(s)).`;
    return {
      title: 'Pièces à compléter',
      description,
      cta: 'Déposer',
      phaseTitle: 'Pièces à compléter',
      phaseDescription: description,
      phaseCta: 'Déposer les pièces',
    };
  },
  payment_proof: (a) => {
    const rejected = a.variant === 'after_rejection';
    const description = rejected
      ? "Votre précédente quittance n'a pas été acceptée. Déposez une nouvelle quittance."
      : 'Téléchargez la facture puis déposez votre quittance de paiement.';
    return {
      title: rejected ? 'Nouvelle quittance requise' : 'Quittance à déposer',
      description,
      cta: 'Déposer',
      phaseTitle: rejected ? 'Nouvelle quittance requise' : 'Action requise',
      phaseDescription: description,
      phaseCta: 'Déposer la quittance',
    };
  },
  document_correction: (a) => ({
    title: 'Document à corriger',
    description: `${a.count ?? 0} document(s) de votre dossier doivent être corrigés.`,
    cta: 'Voir les corrections',
    phaseTitle: 'Corrections requises',
    phaseDescription: `${a.count ?? 0} document(s) nécessitent une correction.`,
    phaseCta: 'Voir les corrections',
  }),
  certificate_collection: () => ({
    title: 'Certificat à retirer',
    description: "Votre certificat est prêt. Présentez-vous aux bureaux de l'ANAC pour le retirer.",
    cta: 'Voir le dossier',
    phaseTitle: 'Certificat prêt',
    phaseDescription: "Présentez-vous aux bureaux de l'ANAC pour retirer le certificat en personne.",
    phaseCta: 'Voir le retrait',
  }),
};

export function actionCopy(action: ApplicantAction): ActionCopy {
  return ACTION_COPY[action.key](action);
}

/** Due-date line of a row, or null when the action has no date. */
export function dueLine(action: ApplicantAction): string | null {
  if (!action.dueAt) return null;
  return action.key === 'meeting_confirmation'
    ? `Rendez-vous le ${formatDateTime(action.dueAt)}`
    : `À traiter avant le ${formatDate(action.dueAt)}`;
}
