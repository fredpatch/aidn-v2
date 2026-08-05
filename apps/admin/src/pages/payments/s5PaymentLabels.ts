import { CheckCircle2, Clock3, Send, ShieldCheck, XCircle } from 'lucide-react';
import type { S5PaymentQueueItem } from './s5PaymentTypes';

export const STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'Facture a transmettre',
  awaiting_proof: 'Preuve attendue',
  pending_validation: 'Preuve a valider',
  validated: 'Paiement valide',
  rejected: 'Paiement rejete',
};

export const NEXT_ACTION_LABELS: Record<S5PaymentQueueItem['nextAction'], string> = {
  send_invoice: 'Importer la facture transmise',
  waiting_for_proof: 'Attendre la preuve postulant',
  validate_payment: 'Valider ou rejeter la preuve',
  done: 'Paiement termine',
  rejected: 'Paiement a verifier',
};

export const PHASE_LABELS: Record<S5PaymentQueueItem['phaseCode'], string> = {
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

export function statusClass(status: string): string {
  if (status === 'awaiting_invoice') return 'border-anac-info/20 bg-anac-info/10 text-anac-info';
  if (status === 'awaiting_proof') return 'border-anac-muted/20 bg-anac-muted/10 text-anac-muted';
  if (status === 'pending_validation') return 'border-anac-warning/20 bg-anac-warning/10 text-anac-warning';
  if (status === 'validated') return 'border-anac-success/20 bg-anac-success/10 text-anac-success';
  if (status === 'rejected') return 'border-anac-danger/20 bg-anac-danger/10 text-anac-danger';
  return 'border-anac-border bg-anac-gray text-anac-muted';
}

export function statusIcon(status: string) {
  if (status === 'awaiting_invoice') return Send;
  if (status === 'pending_validation') return ShieldCheck;
  if (status === 'validated') return CheckCircle2;
  if (status === 'rejected') return XCircle;
  return Clock3;
}
