export interface RequestCockpitMetric {
  key: string;
  label: string;
  value: number | string;
  helper: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface RequestCockpitPhase {
  phaseCode: 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  label: string;
  status: 'not_started' | 'open' | 'closed';
  href: string;
}

export interface RequestCockpitActivity {
  id: number;
  title: string;
  actor: string;
  createdAt: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
}

export interface RequestCockpitDocumentSummary {
  completed: number;
  missing: number;
  pending: number;
  total: number;
}

export interface RequestCockpitItem {
  id: number;
  reference: string;
  requestType: string;
  requestTypeLabel: string;
  status: string;
  statusLabel: string;
  circuitStatus: string | null;
  circuitStatusLabel: string;
  createdAt: string;
  updatedAt: string;
  organisationName: string;
  organisationEmail: string | null;
  organisationPhone: string | null;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  currentPhaseCode: string | null;
  currentPhaseLabel: string;
  phases: RequestCockpitPhase[];
  documentSummary: RequestCockpitDocumentSummary;
  nextActionLabel: string;
  nextActionDescription: string;
  nextActionHref: string | null;
  nextActionTone: 'info' | 'warning' | 'success' | 'danger';
  canStartPreliminary: boolean;
  activity: RequestCockpitActivity[];
}

export interface RequestCockpitSummary {
  metrics: RequestCockpitMetric[];
  items: RequestCockpitItem[];
  updatedAt: string;
}
