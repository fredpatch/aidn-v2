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
  scopes: string[];
  labels: Record<string, string>;
}

export interface DevToolsResetResult {
  scopesCleared: string[];
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
