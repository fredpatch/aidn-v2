export const FORMAL_DOCUMENT_SLOTS = [
  'form_dn_air_r2_3_f_e_010',
  'form_dn_air_r2_3_f_e_012_personnel',
  'certification_personnel_list',
  'maintenance_procedures_manual',
  'quality_manual',
  'sms_manual',
  'capability_list',
  'training_program',
  'subcontractor_contracts',
  'technical_documents',
  'compliance_statement_011',
] as const;

export type FormalDocumentSlot = (typeof FORMAL_DOCUMENT_SLOTS)[number];

export const FORMAL_DOCUMENT_SLOT_LABELS: Record<FormalDocumentSlot, string> = {
  form_dn_air_r2_3_f_e_010: "Formulaire DN-AIR-R2-3-F-E-010 — Demande d'agrément d'OMA",
  form_dn_air_r2_3_f_e_012_personnel:
    "Formulaires DN-AIR-R2-3-F-E-012 — Acceptation du personnel d'encadrement",
  certification_personnel_list: 'Liste du personnel de certification',
  maintenance_procedures_manual: 'Manuel des Procédures de Maintenance (MPM)',
  quality_manual: 'Manuel Qualité (ou intégré au MPM)',
  sms_manual: 'Manuel SGS',
  capability_list: 'Liste des capacités (ou intégrée au MPM)',
  training_program: 'Manuel ou programme de formation (ou intégré au MPM)',
  subcontractor_contracts: "Copies des contrats avec les sous-traitants ou lettres d'intention",
  technical_documents: 'Documents techniques relatifs à la capacité de la structure',
  compliance_statement_011: 'État de conformité — Formulaire DN-AIR-R2-3-F-E-011',
};
