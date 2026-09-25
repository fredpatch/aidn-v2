import { api } from '../axios';
import type {
  DevToolsResetResult,
  DevToolsSessionResult,
  DevToolsStatus,
  ParameterView,
  UploadCleanupResult,
  UploadDiagnostics,
} from './settings.types';

export async function fetchSystemParameters(): Promise<ParameterView[]> {
  const { data } = await api.get('/system-parameters');
  return data;
}

export async function updateSystemParameter(key: string, value: string): Promise<void> {
  await api.patch(`/system-parameters/${key}`, { value });
}

export async function fetchDevToolsStatus(): Promise<DevToolsStatus> {
  try {
    const { data } = await api.get('/dev-tools/status');
    return data;
  } catch {
    return {
      enabled: false,
      environment: 'unknown',
      accessRequired: 'Super admin',
      mode: 'irreversible',
      scopes: [],
      labels: {},
      scopeDetails: [],
      session: {
        active: false,
        expiresAt: null,
        durationMinutes: null,
      },
    };
  }
}

export async function startDevToolsSession(
  durationMinutes: number
): Promise<DevToolsSessionResult> {
  const { data } = await api.post('/dev-tools/session', { durationMinutes });
  return data;
}

export async function resetDevTools(
  scopes: string[],
  confirmation: string
): Promise<DevToolsResetResult> {
  const { data } = await api.post('/dev-tools/reset', { scopes, confirmation });
  return data;
}

export async function fetchUploadDiagnostics(): Promise<UploadDiagnostics> {
  const { data } = await api.get('/uploads/diagnostics');
  return data;
}

export async function cleanupOrphanUploads(retentionDays?: number): Promise<UploadCleanupResult> {
  const payload = retentionDays === undefined ? {} : { retentionDays };
  const { data } = await api.post('/uploads/cleanup-orphans', payload);
  return data;
}
