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

export const PHASE_LABELS = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
} as const;

export const PHASE_OPTIONS = [
  { value: '', label: 'Toutes les phases' },
  { value: 'M3', label: PHASE_LABELS.M3 },
  { value: 'M4', label: PHASE_LABELS.M4 },
  { value: 'M5', label: PHASE_LABELS.M5 },
  { value: 'M6', label: PHASE_LABELS.M6 },
  { value: 'M7', label: PHASE_LABELS.M7 },
] as const;

export const KPI_EXPLANATIONS = [
  {
    key: 'average_processing_duration',
    label: 'Délai moyen de traitement',
    definition: 'Moyenne entre le dépôt initial et la clôture de la délivrance.',
    dnValue: 'Mesure la durée réelle du processus complet.',
  },
  {
    key: 'median_processing_duration',
    label: 'Médiane de traitement',
    definition: 'Durée centrale des dossiers clôturés, moins sensible aux cas extrêmes.',
    dnValue: 'Donne une lecture plus réaliste du dossier typique.',
  },
  {
    key: 'outside_sla',
    label: 'Dossiers hors délai',
    definition: 'Phases encore ouvertes qui dépassent leur cible SLA.',
    dnValue: 'Identifie immédiatement les dossiers à reprendre en priorité.',
  },
  {
    key: 'sla_compliance',
    label: 'Taux de respect SLA',
    definition: 'Part des phases clôturées dans leur délai cible.',
    dnValue: 'Suit la discipline opérationnelle par période.',
  },
  {
    key: 'dg_wait',
    label: 'Temps moyen en attente DG',
    definition: 'Temps moyen des courriers encore en dépôt ou en signature.',
    dnValue: 'Sépare les blocages du circuit signature du traitement DN.',
  },
  {
    key: 'inactivity',
    label: "Temps d'inactivité moyen",
    definition: 'Temps moyen des dossiers actifs sans mise à jour depuis plus de 15 jours.',
    dnValue: 'Repère les dossiers oubliés avant qu’ils deviennent critiques.',
  },
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
