export const FORMAL_SLOT_LABELS: Record<string, string> = {
  form_dn_air_r2_3_f_e_010: "Formulaire DN-AIR-R2-3-F-E-010 - Demande d'agrement d'OMA",
  form_dn_air_r2_3_f_e_012_personnel:
    "Formulaires DN-AIR-R2-3-F-E-012 - Acceptation du personnel d'encadrement",
  certification_personnel_list: 'Liste du personnel de certification',
  maintenance_procedures_manual: 'Manuel des Procedures de Maintenance (MPM)',
  quality_manual: 'Manuel Qualite (ou integre au MPM)',
  sms_manual: 'Manuel SGS',
  capability_list: 'Liste des capacites (ou integree au MPM)',
  training_program: 'Manuel ou programme de formation (ou integre au MPM)',
  subcontractor_contracts: "Copies des contrats avec les sous-traitants ou lettres d'intention",
  technical_documents: 'Documents techniques relatifs a la capacite de la structure',
  compliance_statement_011: 'Etat de conformite - Formulaire DN-AIR-R2-3-F-E-011',
};

export const CIRCUIT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Deposee - a mettre en signature',
  in_signature_circuit: 'En signature',
  signed: 'Signee',
  pending_review: 'Retour signe recu',
};

export const CIRCUIT_STATUS_TONES: Record<string, string> = {
  submitted: 'bg-anac-info/10 text-anac-info',
  in_signature_circuit: 'bg-anac-warning/10 text-anac-warning',
  signed: 'bg-anac-warning/10 text-anac-warning',
  pending_review: 'bg-anac-success/10 text-anac-success',
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planifiee',
  held: 'Tenue',
  no_show: 'Absence constatee',
  rescheduled: 'Reprogrammee',
  file_cancelled: 'Dossier annule',
};

export const MEETING_STATUS_TONES: Record<string, string> = {
  scheduled: 'bg-anac-info/10 text-anac-info',
  held: 'bg-anac-success/10 text-anac-success',
  no_show: 'bg-anac-warning/10 text-anac-warning',
  rescheduled: 'bg-anac-muted/10 text-anac-muted',
  file_cancelled: 'bg-anac-danger/10 text-anac-danger',
};

export const API_ORIGIN = 'http://localhost:4000';
