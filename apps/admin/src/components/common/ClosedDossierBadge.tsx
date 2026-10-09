import { LockKeyhole } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

/** K7b/K7c - French label of a closed dossier status (rejected, cancelled,
 *  completed). Shared by the phase pages banner and the work lists. */
export const CLOSED_DOSSIER_LABELS: Record<string, string> = {
  rejected: 'rejeté',
  cancelled: 'annulé',
  completed: 'terminé',
};

/** K7c - row / panel marker on the staff work lists (S5 payments, meetings,
 *  courriers, R3 inspections): the dossier is closed, consultation only. */
export function ClosedDossierBadge({ status, pill = true }: { status: string; pill?: boolean }) {
  return (
    <span title="Dossier clos - consultation uniquement">
      <StatusBadge
        label={`Dossier ${CLOSED_DOSSIER_LABELS[status] ?? 'clos'}`}
        tone="border-slate-300 bg-slate-100 text-slate-700"
        icon={pill ? undefined : LockKeyhole}
        pill={pill}
      />
    </span>
  );
}
