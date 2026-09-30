import type { TemplateHealthStatus } from '@aidn/shared';

export interface ParameterView {
  id: number;
  key: string;
  value: string;
  type: 'integer' | 'boolean' | 'text';
  module: string;
  description: string | null;
}

export interface DevToolsStatus {
  enabled: boolean;
  environment: string;
  accessRequired: string;
  mode: 'irreversible';
  scopes: string[];
  labels: Record<string, string>;
  scopeDetails: DevToolsScopeMeta[];
  session: DevToolsSession;
}

export interface DevToolsScopeMeta {
  key: string;
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

export interface DevToolsResetResult {
  scopesCleared: string[];
}

export interface DevToolsSessionResult {
  session: DevToolsSession;
}

export interface UploadDiagnostics {
  total: number;
  linked: number;
  unlinked: number;
  orphanMarked: number;
  bySource: Array<{ source: string; total: number }>;
  /** STORAGE-2B - linked assets of a relocatable owner type whose storage_key
   *  is still under staging/, and the subset older than 24h. Excludes
   *  document_template/report, which never relocate by design. Read-only:
   *  no repair action in the UI. */
  linkedButStaging: number;
  linkedButStagingOver24h: number;
  /** Linked assets of a non-relocatable owner type (document_template,
   *  report) still under staging/ - expected steady state, informational
   *  only, never a health signal. */
  linkedStagingExcludedFromRelocation: number;
}

export interface UploadCleanupResult {
  retentionDays: number;
  marked: number;
  deleted: number;
}

/** GET /seeding/status - « Paramètres → État du système ». */
export type SectionStatus = 'healthy' | 'attention';
export type ServiceStatus = 'available' | 'unavailable';
export type { TemplateHealthStatus };

export interface SystemStatus {
  checkedAt: string;
  overallStatus: SectionStatus;
  /** Items « Créer les éléments manquants » can create. */
  missingCount: number;
  /** null when the database could not be queried. */
  referenceData: {
    systemParameters: {
      status: SectionStatus;
      expected: number;
      present: number;
      missing: number;
      items: { key: string; status: 'healthy' | 'missing' }[];
    };
    documentTemplates: {
      status: SectionStatus;
      expected: number;
      healthy: number;
      missing: number;
      fileMissing: number;
      inactive: number;
      unchecked: number;
      items: { key: string; label: string; status: TemplateHealthStatus }[];
    };
  } | null;
  infrastructure: {
    api: { status: 'available' };
    /** Space used by the AIDN database; null if not measurable. */
    database: { status: ServiceStatus; sizeBytes: number | null };
    /** Disk holding the uploads folder; lowSpace below 10% free. */
    storage: { status: ServiceStatus; freeBytes: number | null; totalBytes: number | null; lowSpace: boolean };
  };
  /** Stored /uploads/... addresses not yet converted (unreachable files). */
  files: { legacyAddresses: number | null };
}

/** POST /seeding/run */
export interface ReferenceDataRunResult {
  created: number;
  skipped: number;
  seeds: { name: string; label: string; created: number; skipped: number; createdKeys: string[] }[];
}
