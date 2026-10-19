/** ROLE-ANALYTICS-1F - /pilotage French copy, keyed by the API's semantic
 *  keys. Presentation only: no value is computed here. */
import {
  Activity,
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Inbox,
  Printer,
  Send,
  Timer,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { formatCalendarDuration } from '@aidn/shared';
import type {
  RoleAnalyticsActivity,
  RoleAnalyticsDomain,
  RoleAnalyticsEventKey,
  RoleAnalyticsMetric,
  RoleAnalyticsPreset,
  RoleAnalyticsScope,
} from '@aidn/shared';

export const DOMAIN_LABELS: Record<RoleAnalyticsDomain, string> = {
  courrier: 'Courrier',
  dn_circuit: 'Circuit Directeur DN',
  finance: 'Finance',
  inspection: 'Cellule Inspection',
};

export const SCOPE_LABELS: Record<RoleAnalyticsScope, string> = {
  mine: 'Mon activité',
  service: 'Activité du service',
};

export const PERIOD_OPTIONS: Array<{ value: RoleAnalyticsPreset; label: string }> = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'last_7_days', label: '7 jours' },
  { value: 'last_30_days', label: '30 jours' },
  { value: 'this_month', label: 'Ce mois' },
  { value: 'previous_month', label: 'Mois précédent' },
  { value: 'custom', label: 'Personnalisé' },
];

interface MetricCopy {
  label: string;
  icon: LucideIcon;
  description?: string;
}

export const METRIC_COPY: Record<string, MetricCopy> = {
  'courrier.sent_to_dg': { label: 'Mis en circuit DG', icon: Send },
  'courrier.dg_return_recorded': { label: 'Retours DG enregistrés', icon: Undo2 },
  'courrier.average_dg_circuit_duration': { label: 'Durée moyenne du circuit DG', icon: Timer, description: 'De la mise en circuit au retour du DG.' },
  'courrier.to_print_backlog': { label: 'À imprimer', icon: Printer },
  'courrier.dg_return_overdue': { label: 'Retours DG en retard', icon: AlarmClock },
  'dn_circuit.sent_to_director': { label: 'Transmis au Directeur DN', icon: Send },
  'dn_circuit.return_recorded': { label: 'Retours Directeur DN enregistrés', icon: Undo2 },
  'dn_circuit.average_director_duration': { label: 'Durée moyenne chez le Directeur DN', icon: Timer, description: 'Indicatif : aucun délai cible n’est fixé.' },
  'dn_circuit.average_handoff_delay': { label: 'Délai avant transmission au Directeur DN', icon: Clock, description: 'Du retour du DG à la transmission au Directeur DN.' },
  'dn_circuit.with_director': { label: 'Actuellement chez le Directeur DN', icon: Inbox },
  'finance.payment_validated': { label: 'Paiements validés', icon: CheckCircle2 },
  'finance.m5_validated': { label: 'Validations M5', icon: CreditCard },
  'finance.m6_validated': { label: 'Validations M6', icon: CreditCard },
  'finance.m7_validated': { label: 'Validations M7', icon: CreditCard },
  'finance.invoice_uploaded': { label: 'Factures transmises', icon: FileText },
  'finance.payment_rejected': { label: 'Paiements rejetés', icon: XCircle },
  'finance.proof_received': { label: 'Preuves reçues', icon: Inbox },
  'finance.average_validation_delay': { label: 'Délai moyen de validation', icon: Timer, description: 'Du dépôt de la preuve à sa validation.' },
  'finance.proof_to_validate': { label: 'Preuves à valider', icon: ClipboardCheck },
  'finance.proof_overdue': { label: 'Validations en retard', icon: AlarmClock },
  'finance.invoice_to_send': { label: 'Factures à transmettre', icon: FileText },
  'inspection.visits_planned': { label: 'Visites planifiées', icon: Activity },
  'inspection.visit_held_recorded': { label: 'Visites enregistrées comme tenues', icon: CheckCircle2 },
  'inspection.opinion_submitted': { label: 'Avis transmis', icon: Send },
  'inspection.verdict_compliant': { label: 'Avis conformes', icon: CheckCircle2 },
  'inspection.verdict_compliant_with_reserves': { label: 'Avis conformes avec réserves', icon: ClipboardCheck },
  'inspection.verdict_non_compliant': { label: 'Avis non conformes', icon: XCircle },
  'inspection.visit_overdue': { label: 'Visites en retard', icon: AlarmClock },
  'inspection.blocked_by_payment': { label: 'Visites bloquées par paiement', icon: CreditCard },
  'inspection.awaiting_opinion': { label: 'Avis à transmettre', icon: ClipboardCheck },
};

/** An unknown key (newer API) still renders, with a neutral label. */
export function metricCopy(key: string): MetricCopy {
  return METRIC_COPY[key] ?? { label: 'Indicateur', icon: Activity };
}

export const WARNING_LABELS: Record<string, string> = {
  'courrier.dg_return_overdue': 'Retours DG en retard',
  'courrier.dg_return_oldest': 'Retours DG attendus',
  'dn_circuit.with_director_oldest': 'Dossiers chez le Directeur DN',
  'finance.proof_overdue': 'Validations de paiement en retard',
  'finance.proof_to_validate_oldest': 'Preuves en attente de validation',
  'inspection.visit_overdue': 'Visites à enregistrer en retard',
  'inspection.blocked_by_payment': 'Visites en attente du paiement (Finance ou postulant)',
  'inspection.awaiting_opinion': 'Avis d’inspection à transmettre',
};

/** Cockpit named in the warning's call to action, from the API link. */
export function cockpitName(href: string): string {
  if (href.startsWith('/courriers')) return 'Courriers';
  if (href.startsWith('/circuit-directeur-dn')) return 'Circuit Directeur DN';
  if (href.startsWith('/paiements-s5')) return 'Paiements / Finance';
  if (href.startsWith('/mes-inspections')) return 'Mes inspections';
  return 'la file';
}

export const EVENT_LABELS: Record<RoleAnalyticsEventKey, string> = {
  'courrier.sent_to_dg': 'Mise en circuit DG',
  'courrier.dg_return_recorded': 'Retour DG enregistré',
  'dn_circuit.sent_to_director': 'Transmission au Directeur DN',
  'dn_circuit.return_recorded': 'Retour Directeur DN enregistré',
  'finance.invoice_uploaded': 'Facture transmise',
  'finance.proof_uploaded': 'Preuve de paiement reçue',
  'finance.payment_validated': 'Paiement validé',
  'finance.payment_rejected': 'Paiement rejeté',
  'inspection.visit_held': 'Visite enregistrée comme tenue',
  'inspection.verdict_submitted': 'Avis d’inspection transmis',
};

export const CAVEAT_LABELS: Record<string, string> = {
  legacy_db_timezone: 'Certaines anciennes données peuvent présenter un léger décalage horaire.',
  latest_proof_only: 'Délai calculé à partir de la dernière preuve déposée avant validation.',
  recorded_time_not_actual_visit_time:
    'La date correspond à l’enregistrement dans AIDN, pas nécessairement à l’heure réelle de la visite.',
};

export function caveatText(key: string | undefined): string {
  return (key && CAVEAT_LABELS[key]) || 'Indicateur à interpréter avec prudence.';
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** One calendar-duration formatter for every analytics screen and report (@aidn/shared). */
export { formatCalendarDuration };

/** The API value as is, with its unit; null = not computable. Working days
 *  stay in working days (no hours-per-working-day rule exists). */
export function formatMetricValue(metric: Pick<RoleAnalyticsMetric, 'value' | 'unit'>): string {
  if (metric.value === null) return '—';
  switch (metric.unit) {
    case 'count':
      return integer.format(metric.value);
    case 'calendar_days':
      return formatCalendarDuration(metric.value);
    case 'working_days':
      return `${decimal.format(metric.value)} j ouvrés`;
    case 'percent':
      return `${decimal.format(metric.value)} %`;
  }
}

/** « +3 vs période précédente », « −2 … », « Stable »; null when absent. */
export function previousPeriodText(metric: Pick<RoleAnalyticsMetric, 'value' | 'previousValue' | 'unit'>): string | null {
  if (metric.unit !== 'count' || metric.previousValue === undefined || metric.previousValue === null || metric.value === null) {
    return null;
  }
  const delta = metric.value - metric.previousValue;
  if (delta === 0) return 'Stable vs période précédente';
  return `${delta > 0 ? '+' : '−'}${integer.format(Math.abs(delta))} vs période précédente`;
}

export function sampleSizeText(sampleSize: number | undefined): string | null {
  if (sampleSize === undefined) return null;
  return sampleSize === 1 ? 'Basé sur 1 dossier' : `Basé sur ${integer.format(sampleSize)} dossiers`;
}

export function actorText(actor: RoleAnalyticsActivity['actor']): string {
  if (!actor) return '—';
  return actor.kind === 'applicant' ? 'Postulant' : actor.fullName || '—';
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Libreville',
});
const dateOnly = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Libreville' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const timeOnly = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });
/** « 19/10/2026 à 09:30 » (Libreville). */
export const formatGeneratedAt = (iso: string) => `${dateOnly.format(new Date(iso))} à ${timeOnly.format(new Date(iso))}`;
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

/** « 2026-10-01 » -> « 01/10/2026 » (the API's display dates are calendar dates). */
export function formatCalendarDate(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}
