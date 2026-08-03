import {
  AlertTriangle,
  BarChart3,
  Clock,
  FileText,
  Gauge,
  Hourglass,
  ShieldCheck,
} from 'lucide-react';
import type { AnalyticsMetric } from '../../lib/api/analytics.types';

export const PHASE_OPTIONS = [
  { value: '', label: 'Toutes les phases' },
  { value: 'M3', label: 'Preliminaire' },
  { value: 'M4', label: 'Demande formelle' },
  { value: 'M5', label: 'Evaluation approfondie' },
  { value: 'M6', label: 'Demonstration / Inspection' },
  { value: 'M7', label: 'Delivrance' },
] as const;

export const REQUEST_TYPE_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'recognition', label: 'Reconnaissance' },
  { value: 'issuance', label: 'Delivrance' },
  { value: 'modification', label: 'Modification' },
  { value: 'renewal', label: 'Renouvellement' },
] as const;

export const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'submitted', label: 'Depose' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Termine' },
  { value: 'cancelled', label: 'Annule' },
  { value: 'rejected', label: 'Rejete' },
] as const;

export const METRIC_ICONS: Record<string, React.ElementType> = {
  average_processing_duration: Clock,
  outside_sla: AlertTriangle,
  sla_compliance: ShieldCheck,
  dg_wait: Hourglass,
  inactivity: Gauge,
  median_processing_duration: BarChart3,
};

export const REPORT_ICONS: Record<string, React.ElementType> = {
  processing_delay: FileText,
  sla: ShieldCheck,
  bottlenecks: AlertTriangle,
  inspections: BarChart3,
  s5: Gauge,
};

export const TONE_STYLES: Record<AnalyticsMetric['tone'], string> = {
  info: 'border-blue-100 bg-blue-50 text-anac-blue',
  success: 'border-green-100 bg-green-50 text-green-700',
  warning: 'border-orange-100 bg-orange-50 text-orange-700',
  danger: 'border-red-100 bg-red-50 text-red-700',
  neutral: 'border-slate-100 bg-slate-50 text-slate-600',
};

export function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function defaultPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}
