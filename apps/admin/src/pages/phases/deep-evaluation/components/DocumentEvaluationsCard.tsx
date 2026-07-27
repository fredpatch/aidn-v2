import { useState } from 'react';
import { CheckCircle2, Circle, AlertCircle, Eye } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import DocumentViewer from '../../../../components/documents/DocumentViewer';
import { API_ORIGIN, VERDICT_LABELS, VERDICT_TONES } from '../constants';
import { formatDate } from '../helpers';
import { useEvaluationActions } from '../hooks/useEvaluationActions';
import type { DocumentEvaluationView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface DocumentEvaluationsCardProps {
  requestId: string | undefined;
  evaluations: DocumentEvaluationView[];
  completionRate: {
    total: number;
    validated: number;
    pending: number;
    needsAction: number;
  };
  setActionError: (message: string | null) => void;
}

export default function DocumentEvaluationsCard({
  requestId,
  evaluations,
  completionRate,
  setActionError,
}: DocumentEvaluationsCardProps) {
  const { busy, verdict, resubmit } = useEvaluationActions(requestId, setActionError);
  const [verdictingId, setVerdictingId] = useState<number | null>(null);
  const [correctionDays, setCorrectionDays] = useState('');
  const [resubmitFiles, setResubmitFiles] = useState<Record<number, File>>({});
  const [viewerFile, setViewerFile] = useState<{ title: string; url: string } | null>(null);

  async function handleVerdict(evalId: number, v: 'validated' | 'rejected' | 'needs_correction') {
    const ok = await verdict(evalId, v, correctionDays ? Number(correctionDays) : undefined);
    if (ok) {
      setVerdictingId(null);
      setCorrectionDays('');
    }
  }

  async function handleResubmit(evalId: number) {
    const file = resubmitFiles[evalId];
    if (!file) return;
    const ok = await resubmit(evalId, file);
    if (ok) {
      setResubmitFiles((prev) => {
        const n = { ...prev };
        delete n[evalId];
        return n;
      });
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-anac-navy" />
          <span className="font-medium text-sm">Évaluation des documents</span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-anac-success font-medium">{completionRate.validated} validés</span>
          {completionRate.needsAction > 0 && (
            <span className="text-anac-danger font-medium">
              {completionRate.needsAction} à traiter
            </span>
          )}
          {completionRate.pending > 0 && (
            <span className="text-anac-muted">{completionRate.pending} en attente</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {evaluations.map((ev) => (
          <div key={ev.id} className="border border-anac-border rounded p-3 space-y-2">
            <div className="flex items-start gap-2">
              {ev.verdict === 'validated' ? (
                <CheckCircle2 size={14} className="text-anac-success flex-shrink-0 mt-0.5" />
              ) : ev.verdict === 'rejected' || ev.verdict === 'needs_correction' ? (
                <AlertCircle size={14} className="text-anac-danger flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={14} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs leading-tight font-medium">{ev.label}</p>

                {ev.currentFileUrl && (
                  <button
                    type="button"
                    className="inline-flex w-fit items-center gap-1 text-[10px] text-anac-blue underline"
                    onClick={() =>
                      setViewerFile({
                        title: `${ev.label}${ev.resubmittedFileUrl ? ' - version corrigée' : ''}`,
                        url: `${API_ORIGIN}${ev.currentFileUrl}`,
                      })
                    }
                  >
                    <Eye size={11} aria-hidden="true" />
                    Prévisualiser le document
                    {ev.resubmittedFileUrl ? ' (version corrigée)' : ''}
                  </button>
                )}

                {ev.verdict && (
                  <PhaseStatusBadge
                    status={ev.verdict}
                    label={VERDICT_LABELS[ev.verdict] ?? ev.verdict}
                    toneMap={VERDICT_TONES}
                  />
                )}

                {ev.correctionDeadline && ev.verdict !== 'validated' && (
                  <p className="text-[10px] text-anac-warning">
                    Correction attendue avant le {formatDate(ev.correctionDeadline)}
                  </p>
                )}

                {/* Resubmit area — only shown for rejected/needs_correction */}
                {(ev.verdict === 'rejected' || ev.verdict === 'needs_correction') && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      className="text-[10px]"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setResubmitFiles((prev) => ({ ...prev, [ev.id]: f }));
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!resubmitFiles[ev.id] || busy}
                      onClick={() => handleResubmit(ev.id)}
                    >
                      Soumettre correction
                    </Button>
                  </div>
                )}
              </div>

              {/* Verdict controls */}
              {!ev.verdict && verdictingId !== ev.id && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-shrink-0 text-[10px]"
                  onClick={() => setVerdictingId(ev.id)}
                  disabled={busy}
                >
                  Évaluer
                </Button>
              )}

              {/* Re-evaluate after resubmission */}
              {ev.verdict === null && ev.resubmittedFileUrl && verdictingId !== ev.id && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-shrink-0 text-[10px]"
                  onClick={() => setVerdictingId(ev.id)}
                  disabled={busy}
                >
                  Réévaluer
                </Button>
              )}
            </div>

            {/* Inline verdict form */}
            {verdictingId === ev.id && (
              <div className="pt-1 space-y-2 border-t border-anac-border">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleVerdict(ev.id, 'validated')}
                    disabled={busy}
                  >
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleVerdict(ev.id, 'needs_correction')}
                    disabled={busy}
                  >
                    À corriger
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleVerdict(ev.id, 'rejected')}
                    disabled={busy}
                  >
                    Rejeter
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setVerdictingId(null);
                      setCorrectionDays('');
                    }}
                    disabled={busy}
                  >
                    Annuler
                  </Button>
                </div>
                <div>
                  <label className="label">Délai de correction (jours, optionnel)</label>
                  <input
                    type="number"
                    className="input h-7 text-xs w-24"
                    value={correctionDays}
                    placeholder="15"
                    onChange={(e) => setCorrectionDays(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <DocumentViewer file={viewerFile} onClose={() => setViewerFile(null)} />
    </div>
  );
}
