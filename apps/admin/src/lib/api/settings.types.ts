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
