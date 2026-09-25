/** Every resettable scope. Deliberately explicit (not "reset everything")
 *  so a misclick can't wipe more than intended - each scope is its own
 *  checkbox in the UI. `users`/`user_roles`/`system_parameters`/
 *  `document_templates` are never resettable through this feature at all -
 *  not even as an option - since losing staff accounts or configured
 *  templates would be far more disruptive to re-seed than demo dossiers. */
export const RESETTABLE_SCOPES = [
  'requests_and_workflow',
  'organisations_and_applicants',
  'notifications',
  'audit_logs',
  'reports',
] as const;

export type ResettableScope = (typeof RESETTABLE_SCOPES)[number];

export const SCOPE_LABELS: Record<ResettableScope, string> = {
  requests_and_workflow:
    'Demandes & circuit complet (demandes, circuit DG, phases, reunions, declarations, paiements, certificats)',
  organisations_and_applicants:
    'Organisations & comptes postulants (entraine aussi la suppression des demandes liees)',
  notifications: 'Notifications',
  audit_logs: "Journal d'audit",
  reports: 'Rapports (dashboard/IA)',
};

export const SCOPE_DESCRIPTIONS: Record<ResettableScope, string> = {
  requests_and_workflow:
    'Supprime les demandes de test et tout le graphe workflow associe. Les modeles et utilisateurs restent conserves.',
  organisations_and_applicants:
    'Supprime les organisations, postulants et demandes de comptes creees pendant les essais.',
  notifications:
    "Vide le centre de notifications et l'historique fonctionnel lie aux essais.",
  audit_logs:
    'Vide le journal technique. Une nouvelle trace de nettoyage est recreree apres la suppression.',
  reports:
    'Supprime les rapports generes et les historiques de generation de test.',
};

export const SCOPE_WARNINGS: Partial<Record<ResettableScope, string>> = {
  requests_and_workflow: 'Ce scope entraine la suppression de donnees liees par cascade.',
  organisations_and_applicants: 'Ce scope peut entrainer la suppression de demandes liees.',
  audit_logs: 'Le journal existant sera efface avant la creation de la trace de nettoyage.',
};

export interface DevToolsScopeMeta {
  key: ResettableScope;
  label: string;
  description: string;
  dangerous: boolean;
  warning?: string;
}

export interface DevToolsSession {
  active: boolean;
  expiresAt: string | null;
  durationMinutes: number | null;
}

export interface DevToolsStatus {
  enabled: boolean;
  environment: string;
  accessRequired: string;
  mode: 'irreversible';
  scopes: ResettableScope[];
  labels: Record<ResettableScope, string>;
  scopeDetails: DevToolsScopeMeta[];
  session: DevToolsSession;
}
