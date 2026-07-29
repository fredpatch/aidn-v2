import { useState } from 'react';
import { AlertCircle, CheckCircle2, Circle, Eye } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
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
  canEvaluateDocuments: boolean;
  setActionError: (message: string | null) => void;
}

export default function DocumentEvaluationsCard({
  requestId,
  evaluations,
  completionRate,
  canEvaluateDocuments,
  setActionError,
}: DocumentEvaluationsCardProps) {
  const { busy, verdict } = useEvaluationActions(requestId, setActionError);
  const [verdictingId, setVerdictingId] = useState<number | null>(null);
  const [correctionDays, setCorrectionDays] = useState('');
  const [viewerFile, setViewerFile] = useState<{
    evaluationId: number;
    title: string;
    url: string;
  } | null>(null);

  const viewerEvaluation = viewerFile
    ? evaluations.find((evaluation) => evaluation.id === viewerFile.evaluationId)
    : null;
  const canEvaluateInViewer =
    canEvaluateDocuments && !!viewerEvaluation && viewerEvaluation.verdict === null;
  const allDocumentsValidated =
    completionRate.total > 0 && completionRate.validated === completionRate.total;

  async function handleVerdict(
    evalId: number,
    value: 'validated' | 'rejected' | 'needs_correction',
    closeViewer = false
  ) {
    const ok = await verdict(evalId, value, correctionDays ? Number(correctionDays) : undefined);
    if (ok) {
      setVerdictingId(null);
      setCorrectionDays('');
      if (closeViewer) setViewerFile(null);
    }
  }

  return (
    <CollapsibleCard
      title="Evaluation des documents"
      icon={<CheckCircle2 size={16} className="text-anac-navy" />}
      defaultOpen={!allDocumentsValidated}
      resetKey={`${completionRate.validated}-${completionRate.pending}-${completionRate.needsAction}`}
      badge={
        <div className="flex gap-2 text-xs">
          <span className="text-anac-success font-medium">{completionRate.validated} valides</span>
          {completionRate.needsAction > 0 && (
            <span className="text-anac-danger font-medium">
              {completionRate.needsAction} a traiter
            </span>
          )}
          {completionRate.pending > 0 && (
            <span className="text-anac-muted">{completionRate.pending} en attente</span>
          )}
        </div>
      }
    >
      <div className="space-y-2">
        {evaluations.map((evaluation) => (
          <div key={evaluation.id} className="border border-anac-border rounded p-3 space-y-2">
            <div className="flex items-start gap-2">
              {evaluation.verdict === 'validated' ? (
                <CheckCircle2 size={14} className="text-anac-success flex-shrink-0 mt-0.5" />
              ) : evaluation.verdict === 'rejected' ||
                evaluation.verdict === 'needs_correction' ? (
                <AlertCircle size={14} className="text-anac-danger flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={14} className="text-anac-muted/40 flex-shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs leading-tight font-medium">{evaluation.label}</p>

                {evaluation.currentFileUrl && (
                  <button
                    type="button"
                    className="inline-flex w-fit items-center gap-1 text-[10px] text-anac-blue underline"
                    onClick={() =>
                      setViewerFile({
                        evaluationId: evaluation.id,
                        title: `${evaluation.label}${
                          evaluation.resubmittedFileUrl ? ' - version corrigee' : ''
                        }`,
                        url: `${API_ORIGIN}${evaluation.currentFileUrl}`,
                      })
                    }
                  >
                    <Eye size={11} aria-hidden="true" />
                    Previsualiser le document
                    {evaluation.resubmittedFileUrl ? ' (version corrigee)' : ''}
                  </button>
                )}

                {evaluation.verdict && (
                  <PhaseStatusBadge
                    status={evaluation.verdict}
                    label={VERDICT_LABELS[evaluation.verdict] ?? evaluation.verdict}
                    toneMap={VERDICT_TONES}
                  />
                )}

                {evaluation.correctionDeadline && evaluation.verdict !== 'validated' && (
                  <p className="text-[10px] text-anac-warning">
                    Correction attendue avant le {formatDate(evaluation.correctionDeadline)}
                  </p>
                )}

                {(evaluation.verdict === 'rejected' ||
                  evaluation.verdict === 'needs_correction') && (
                  <p className="pt-1 text-[10px] text-anac-muted">
                    Correction attendue via le portail postulant.
                  </p>
                )}
              </div>

              {canEvaluateDocuments && !evaluation.verdict && verdictingId !== evaluation.id && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-shrink-0 text-[10px]"
                  onClick={() => setVerdictingId(evaluation.id)}
                  disabled={busy}
                >
                  Evaluer
                </Button>
              )}
            </div>

            {canEvaluateDocuments && verdictingId === evaluation.id && (
              <div className="pt-1 space-y-2 border-t border-anac-border">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleVerdict(evaluation.id, 'validated')}
                    disabled={busy}
                  >
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleVerdict(evaluation.id, 'needs_correction')}
                    disabled={busy}
                  >
                    A corriger
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleVerdict(evaluation.id, 'rejected')}
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
                  <label className="label">Delai de correction (jours, optionnel)</label>
                  <input
                    type="number"
                    className="input h-7 text-xs w-24"
                    value={correctionDays}
                    placeholder="15"
                    onChange={(event) => setCorrectionDays(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <DocumentViewer
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        actionHint={
          canEvaluateInViewer ? 'Consultez le document puis choisissez un verdict.' : undefined
        }
        actionBar={
          canEvaluateInViewer && viewerEvaluation ? (
            <div className="flex items-center gap-2 border-l border-anac-border pl-2">
              <Button
                size="sm"
                onClick={() => handleVerdict(viewerEvaluation.id, 'validated', true)}
                disabled={busy}
              >
                Valider
              </Button>
              <input
                type="number"
                className="input h-8 w-20 text-xs"
                value={correctionDays}
                placeholder="Jours"
                title="Delai de correction"
                onChange={(event) => setCorrectionDays(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleVerdict(viewerEvaluation.id, 'needs_correction', true)}
                disabled={busy}
              >
                A corriger
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleVerdict(viewerEvaluation.id, 'rejected', true)}
                disabled={busy}
              >
                Rejeter
              </Button>
            </div>
          ) : undefined
        }
      />
    </CollapsibleCard>
  );
}
