import { FormEvent, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { VERDICT_LABELS, VERDICT_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { useVerdictAction } from '../hooks/useVerdictAction';
import type { InspectionView, SiteVisitView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

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
  const [verdict, setVerdict] = useState<
    'compliant' | 'non_compliant' | 'compliant_with_reserves' | ''
  >('');
  const [note, setNote] = useState('');
  const { busy, submit } = useVerdictAction(requestId, setActionError);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!verdict) {
      setActionError('Merci de sélectionner un verdict.');
      return;
    }
    if (!note.trim()) {
      setActionError(
        'La note est requise - elle fait partie de la même soumission que le verdict.'
      );
      return;
    }
    const ok = await submit(phaseId, verdict, note);
    if (ok) {
      setVerdict('');
      setNote('');
    }
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
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-anac-muted text-xs">
            Verdict et note sont soumis ensemble, en une seule action - pas d&apos;étape séparée.
          </p>
          <div>
            <label className="label">Verdict</label>
            <select
              className="input"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as typeof verdict)}
              required
            >
              <option value="">Sélectionner</option>
              <option value="compliant">Conforme</option>
              <option value="compliant_with_reserves">Conforme avec réserves</option>
              <option value="non_compliant">Non conforme</option>
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <textarea
              className="input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Soumission...' : "Soumettre l'avis et clôturer la phase"}
          </Button>
        </form>
      )}
    </div>
  );
}
