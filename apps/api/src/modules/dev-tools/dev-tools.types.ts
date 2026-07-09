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
