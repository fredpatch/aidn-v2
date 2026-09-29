/** Presentation metadata for system parameters (Paramètres > Configuration).
 *
 *  The API stays generic (key/value/type/module); this file decides how
 *  parameters are grouped, labelled and unit-annotated for administrators.
 *  UI-only - nothing here is sent to the backend. A parameter without an
 *  entry below is never hidden: it lands in "Autres paramètres". */
import type { ParameterView } from '../../lib/api/settings.types';

export interface UnitLabel {
  one: string;
  other: string;
}

export const UNITS = {
  attempts: { one: 'tentative', other: 'tentatives' },
  minutes: { one: 'minute', other: 'minutes' },
  days: { one: 'jour', other: 'jours' },
  calendarDays: { one: 'jour calendaire', other: 'jours calendaires' },
  workingDays: { one: 'jour ouvré', other: 'jours ouvrés' },
} satisfies Record<string, UnitLabel>;

/** French agreement: 0 and 1 take the singular. */
export function formatUnit(unit: UnitLabel, value: string): string {
  const trimmed = value.trim();
  const n = Number(trimmed);
  return trimmed !== '' && Number.isFinite(n) && Math.abs(n) < 2 ? unit.one : unit.other;
}

export type ParameterSectionId = 'security' | 'workflow' | 'monitoring' | 'documents' | 'certificates';
export type ParameterSubgroupId = 'phase-targets' | 'operational-targets';

interface SectionDefinition {
  id: ParameterSectionId;
  title: string;
  description?: string;
  subgroups?: Array<{ id: ParameterSubgroupId; title: string; description?: string }>;
}

const SECTIONS: SectionDefinition[] = [
  {
    id: 'security',
    title: 'Authentification et sécurité',
    description: 'Règles appliquées à la connexion et à la première authentification des utilisateurs.',
  },
  {
    id: 'workflow',
    title: 'Courriers et workflow OMA',
    description: 'Délais utilisés pour les alertes et échéances du circuit administratif.',
  },
  {
    id: 'monitoring',
    title: 'Pilotage et délais de traitement',
    description:
      'Objectifs de suivi utilisés par les tableaux de bord pour signaler les dossiers qui nécessitent une attention. Il ne s’agit pas de délais réglementaires.',
    subgroups: [
      {
        id: 'phase-targets',
        title: 'Délais des phases OMA',
        description: 'Durée au-delà de laquelle une phase encore ouverte est signalée.',
      },
      {
        id: 'operational-targets',
        title: 'Délais opérationnels',
        description: 'Durée au-delà de laquelle une étape en attente est signalée.',
      },
    ],
  },
  {
    id: 'documents',
    title: 'Documents et stockage',
  },
  {
    id: 'certificates',
    title: 'Délivrance et certificats',
  },
];

export interface ParameterUiMeta {
  section: ParameterSectionId;
  subgroup?: ParameterSubgroupId;
  label: string;
  description?: string;
  unit?: UnitLabel;
  /** Text parameters: example shown in the empty field. */
  placeholder?: string;
  /** Text parameters that may be left empty. */
  optional?: boolean;
}

/** Keyed by parameter key (a duplicate key is a compile error). Rows render
 *  in declaration order within their section/subgroup. */
export const PARAMETER_UI_META: Record<string, ParameterUiMeta> = {
  // ── Authentification et sécurité ──────────────────────────────────────────
  lockout_max_attempts: {
    section: 'security',
    label: 'Nombre maximal de tentatives de connexion',
    description: 'Au-delà, le compte est bloqué temporairement.',
    unit: UNITS.attempts,
  },
  lockout_duration_minutes: {
    section: 'security',
    label: 'Durée du blocage temporaire',
    description: 'Temps pendant lequel le compte reste verrouillé après trop d’échecs.',
    unit: UNITS.minutes,
  },
  otp_expiration_minutes: {
    section: 'security',
    label: 'Durée de validité du code OTP',
    description: 'Validité du code envoyé lors de la première connexion.',
    unit: UNITS.minutes,
  },

  // ── Courriers et workflow OMA ─────────────────────────────────────────────
  dg_circuit_alert_days: {
    section: 'workflow',
    label: 'Alerte de blocage du circuit DG',
    description:
      'DN, la réception et l’assistant(e) DG sont alertés lorsqu’un courrier reste en circuit de signature au-delà de ce délai (week-ends et jours fériés exclus). Sert aussi d’objectif de suivi pour le retour de signature dans le tableau de bord.',
    unit: UNITS.workingDays,
  },
  public_holidays: {
    section: 'workflow',
    label: 'Jours fériés',
    description:
      'Exclus du décompte des jours ouvrés du circuit DG. AAAA-MM-JJ pour une date précise (fêtes mobiles), MM-JJ pour chaque année, séparés par des virgules.',
    placeholder: '01-01, 05-01, 08-17, 2026-04-06',
    optional: true,
  },
  preliminary_evaluation_return_days: {
    section: 'workflow',
    label: 'Délai de retour par défaut de la déclaration de pré-évaluation',
    description: 'Proposé à chaque envoi de la déclaration ; DN peut l’ajuster au cas par cas.',
    unit: UNITS.calendarDays,
  },

  // ── Pilotage - délais des phases OMA ──────────────────────────────────────
  dashboard_sla_phase_m3_days: {
    section: 'monitoring',
    subgroup: 'phase-targets',
    label: 'Phase préliminaire',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_phase_m4_days: {
    section: 'monitoring',
    subgroup: 'phase-targets',
    label: 'Demande formelle',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_phase_m5_days: {
    section: 'monitoring',
    subgroup: 'phase-targets',
    label: 'Évaluation approfondie',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_phase_m6_days: {
    section: 'monitoring',
    subgroup: 'phase-targets',
    label: 'Démonstration / inspection',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_phase_m7_days: {
    section: 'monitoring',
    subgroup: 'phase-targets',
    label: 'Délivrance',
    unit: UNITS.calendarDays,
  },

  // ── Pilotage - délais opérationnels ───────────────────────────────────────
  dashboard_sla_signature_deposit_days: {
    section: 'monitoring',
    subgroup: 'operational-targets',
    label: 'Dépôt courrier → mise en circuit de signature',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_invoice_upload_days: {
    section: 'monitoring',
    subgroup: 'operational-targets',
    label: 'Envoi de facture par S5',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_payment_validation_days: {
    section: 'monitoring',
    subgroup: 'operational-targets',
    label: 'Validation d’une preuve de paiement par S5',
    unit: UNITS.calendarDays,
  },
  dashboard_sla_document_evaluation_days: {
    section: 'monitoring',
    subgroup: 'operational-targets',
    label: 'Évaluation d’une pièce documentaire par DN',
    unit: UNITS.calendarDays,
  },

  // ── Documents et stockage ─────────────────────────────────────────────────
  upload_orphan_retention_days: {
    section: 'documents',
    label: 'Délai de rétention des uploads non liés',
    description:
      'Les fichiers téléversés rattachés à aucune pièce de dossier sont marqués puis supprimés après ce délai. Utilisé aussi par le nettoyage manuel (onglet Sauvegardes) lorsqu’aucun délai n’est saisi.',
    unit: UNITS.days,
  },

  // ── Délivrance et certificats ─────────────────────────────────────────────
  certificate_dg_full_name: {
    section: 'certificates',
    label: 'Nom du Directeur Général par défaut',
    description:
      'Affiché sur les certificats générés. Un autre nom peut être saisi pour un dossier donné sans modifier cette valeur.',
  },
};

export const OTHER_SECTION_ID = 'other';

export interface ParameterGroupView {
  id: string;
  title: string | null;
  description?: string;
  parameters: ParameterView[];
}

export interface ParameterSectionView {
  id: ParameterSectionId | typeof OTHER_SECTION_ID;
  title: string;
  description?: string;
  groups: ParameterGroupView[];
}

const META_ORDER = new Map(Object.keys(PARAMETER_UI_META).map((key, index) => [key, index]));

/** Groups parameters into business sections. Sections and subgroups with no
 *  parameter are omitted; parameters without metadata go to a trailing
 *  "Autres paramètres" section so nothing ever disappears. */
export function groupParameters(parameters: ParameterView[]): ParameterSectionView[] {
  const known = parameters
    .filter((p) => META_ORDER.has(p.key))
    .sort((a, b) => META_ORDER.get(a.key)! - META_ORDER.get(b.key)!);
  const unknown = parameters
    .filter((p) => !META_ORDER.has(p.key))
    .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key));

  const sections: ParameterSectionView[] = [];

  for (const section of SECTIONS) {
    const inSection = known.filter((p) => PARAMETER_UI_META[p.key].section === section.id);
    const groups: ParameterGroupView[] = [
      { id: 'main', title: null, parameters: inSection.filter((p) => !PARAMETER_UI_META[p.key].subgroup) },
      ...(section.subgroups ?? []).map((subgroup) => ({
        id: subgroup.id,
        title: subgroup.title,
        description: subgroup.description,
        parameters: inSection.filter((p) => PARAMETER_UI_META[p.key].subgroup === subgroup.id),
      })),
    ].filter((group) => group.parameters.length > 0);

    if (groups.length > 0) {
      sections.push({ id: section.id, title: section.title, description: section.description, groups });
    }
  }

  if (unknown.length > 0) {
    sections.push({
      id: OTHER_SECTION_ID,
      title: 'Autres paramètres',
      description: 'Paramètres système sans présentation dédiée.',
      groups: [{ id: 'main', title: null, parameters: unknown }],
    });
  }

  return sections;
}

/** Same rules as the API (PATCH /system-parameters/:key rejects anything
 *  else) - defined once in @aidn/shared. */
export { validateParameterValue } from '@aidn/shared';
