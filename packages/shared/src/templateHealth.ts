/** M13 - operational state of an official document template. Shared by the
 *  API (system status) and the admin "Modèles de documents" page so both
 *  screens classify the same template the same way. */
export type TemplateHealthStatus = 'healthy' | 'missing' | 'file_missing' | 'inactive' | 'unchecked';

export interface TemplateHealthInput {
  active: boolean;
  fileUrl: string | null;
  /** Whether the referenced file is on disk (meaningless if storage is unavailable). */
  fileExists: boolean;
}

/** First matching rule wins:
 *  no row -> missing; inactive -> inactive; storage unreachable -> unchecked;
 *  null or absent file -> file_missing; otherwise healthy. */
export function classifyTemplateHealth(
  row: TemplateHealthInput | undefined,
  context: { storageAvailable: boolean }
): TemplateHealthStatus {
  if (!row) return 'missing';
  if (!row.active) return 'inactive';
  if (!context.storageAvailable) return 'unchecked';
  if (!row.fileUrl || !row.fileExists) return 'file_missing';
  return 'healthy';
}
