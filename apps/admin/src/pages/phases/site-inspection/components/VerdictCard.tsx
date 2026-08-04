import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { VERDICT_LABELS, VERDICT_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { useVerdictAction } from '../hooks/useVerdictAction';
import type { InspectionView, SiteVisitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

const VERDICT_VALUES = ['compliant', 'non_compliant', 'compliant_with_reserves'] as const;
type Verdict = (typeof VERDICT_VALUES)[number];

const verdictSchema = z.object({
  verdict: z
    .string()
    .refine((v) => (VERDICT_VALUES as readonly string[]).includes(v), {
      message: 'Merci de sélectionner un verdict.',
    }),
  note: z
    .string()
    .trim()
    .min(1, 'La note est requise - elle fait partie de la même soumission que le verdict.'),
});

type VerdictFormValues = z.infer<typeof verdictSchema>;

interface VerdictCardProps {
  phaseId: number;
  siteVisit: SiteVisitView | null;
  inspection: InspectionView | null;
  paymentValidated: boolean;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function VerdictCard({
  phaseId,
  siteVisit,
  inspection,
  paymentValidated,
  requestId,
  setActionError,
}: VerdictCardProps) {
  const { busy, submit } = useVerdictAction(requestId, setActionError);
  const { register, handleSubmit, reset } = useForm<VerdictFormValues>({
    resolver: zodResolver(verdictSchema),
    defaultValues: { verdict: '', note: '' },
  });

  async function onSubmit(values: VerdictFormValues) {
    const ok = await submit(phaseId, values.verdict as Verdict, values.note);
    if (ok) reset();
  }

  function onInvalid(errors: FieldErrors<VerdictFormValues>) {
    setActionError(errors.verdict?.message ?? errors.note?.message ?? null);
  }

  if (inspection) {
    return (
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} className="text-anac-navy" />
            <span className="font-medium text-sm">Avis R3</span>
          </div>
          <PhaseStatusBadge
            status={inspection.verdict}
            label={VERDICT_LABELS[inspection.verdict] ?? inspection.verdict}
            toneMap={VERDICT_TONES}
          />
        </div>
        <p className="text-xs text-anac-muted">
          Soumis le {formatDateTime(inspection.submittedAt)}
        </p>
        <p className="text-sm whitespace-pre-wrap">{inspection.note}</p>
        <p className="text-anac-success text-xs">
          Phase clôturée automatiquement à la soumission de cet avis.
        </p>
      </div>
    );
  }

  const blockReason = !paymentValidated
    ? 'Le paiement doit être validé avant de soumettre un avis.'
    : !siteVisit
      ? "La visite sur site doit d'abord être planifiée."
      : siteVisit.status !== 'held'
        ? "La visite sur site doit être marquée 'tenue' avant de soumettre un avis."
        : null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Avis R3</span>
      </div>

      {blockReason ? (
        <p className="text-anac-muted text-xs">{blockReason}</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-3">
          <p className="text-anac-muted text-xs">
            Verdict et note sont soumis ensemble, en une seule action - pas d&apos;étape séparée.
          </p>
          <div>
            <label className="label">Verdict</label>
            <select className="input" {...register('verdict')} required>
              <option value="">Sélectionner</option>
              <option value="compliant">Conforme</option>
              <option value="compliant_with_reserves">Conforme avec réserves</option>
              <option value="non_compliant">Non conforme</option>
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <textarea className="input" rows={4} {...register('note')} required />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Soumission...' : "Soumettre l'avis et clôturer la phase"}
          </Button>
        </form>
      )}
    </div>
  );
}
