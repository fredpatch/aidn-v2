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
}

export interface UploadCleanupResult {
  retentionDays: number;
  marked: number;
  deleted: number;
}
