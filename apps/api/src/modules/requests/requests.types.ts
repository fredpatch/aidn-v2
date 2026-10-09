import type { PreparedAttachment } from '../uploads/upload-attachment.js';

export interface SubmitRequestParams {
  applicantId: number;
  requestType: 'recognition' | 'issuance' | 'modification' | 'renewal';
  message?: string;
  /** STORAGE-0B - the checked upload; address and type come from it. */
  attachment: PreparedAttachment;
  submittedByUserId?: number; // set when reception/assistant_dg enters it manually
}

export interface RequestView {
  id: number;
  reference: string;
  applicantId: number;
  organisationId: number;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  circuitDocumentUrl: string | null;
  circuitDocumentMimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  /** D3a - latest events of the dossier, all phases, newest first (max 5). */
  activity: RequestCockpitActivity[];
  /** D3a - latest linked audit event, or the submission date. */
  lastActivityAt: string;
  /** D3b - for the viewer: open dossier with news since they last opened it. */
  unread: boolean;
}

export interface RequestCockpitSummary {
  metrics: RequestCockpitMetric[];
  items: RequestCockpitItem[];
  updatedAt: string;
}
