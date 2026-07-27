export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
    bootstrapStatus: () => ['auth', 'bootstrap-status'] as const,
  },
  settings: {
    all: ['settings'] as const,
    systemParameters: () => ['settings', 'system-parameters'] as const,
    devToolsStatus: () => ['settings', 'dev-tools-status'] as const,
    uploadDiagnostics: () => ['settings', 'upload-diagnostics'] as const,
  },
  preliminary: {
    all: ['preliminary'] as const,
    bundle: (requestId: string) => ['preliminary', 'bundle', requestId] as const,
  },
  formal: {
    all: ['formal'] as const,
    bundle: (requestId: string) => ['formal', 'bundle', requestId] as const,
  },
  deepEvaluation: {
    all: ['deepEvaluation'] as const,
    bundle: (requestId: string) => ['deepEvaluation', 'bundle', requestId] as const,
  },
  siteInspection: {
    all: ['siteInspection'] as const,
    bundle: (requestId: string) => ['siteInspection', 'bundle', requestId] as const,
    myQueue: () => ['siteInspection', 'my-queue'] as const,
    usersByRole: (role: string) => ['siteInspection', 'users-by-role', role] as const,
  },
  certificates: {
    all: ['certificates'] as const,
    bundle: (requestId: string) => ['certificates', 'bundle', requestId] as const,
  },
  phases: {
    all: ['phases'] as const,
    summary: (requestId: string) => ['phases', 'summary', requestId] as const,
  },
};
