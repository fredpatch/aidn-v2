import { BarChart3, Clock, CreditCard, FolderOpen, Inbox, Mail } from 'lucide-react';
import type { DashboardActionItem } from '../../lib/api/dashboard.types';

export const METRIC_ICONS: Record<string, React.ElementType> = {
  active_requests: Inbox,
  open_phases: FolderOpen,
  average_global_duration: Clock,
  pending_dg_mail: Mail,
  pending_payments: CreditCard,
};

export const FALLBACK_METRIC_ICON = BarChart3;

export const TONE_STYLES = {
  success: 'text-anac-success bg-green-50 border-green-100',
  warning: 'text-anac-warning bg-orange-50 border-orange-100',
  danger: 'text-anac-danger bg-red-50 border-red-100',
  info: 'text-anac-blue bg-blue-50 border-blue-100',
  muted: 'text-anac-muted bg-slate-50 border-slate-100',
};

export const PRIORITY_STYLES: Record<DashboardActionItem['priority'], string> = {
  haute: 'bg-red-50 text-anac-danger border-red-100',
  moyenne: 'bg-orange-50 text-anac-warning border-orange-100',
  basse: 'bg-green-50 text-anac-success border-green-100',
};

export const SLA_STYLES = {
  on_track: 'bg-green-50 text-anac-success border-green-100',
  warning: 'bg-orange-50 text-anac-warning border-orange-100',
  overdue: 'bg-red-50 text-anac-danger border-red-100',
  blocked: 'bg-red-100 text-anac-danger border-red-200',
  unknown: 'bg-slate-50 text-anac-muted border-slate-100',
};

export function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
