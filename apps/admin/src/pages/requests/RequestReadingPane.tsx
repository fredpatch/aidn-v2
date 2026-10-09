import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, FolderOpen } from 'lucide-react';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { apiErrorMessage } from '../../lib/axios';
import { startPreliminaryPhase } from '../../lib/api/requests.api';
import type { RequestCockpitItem, RequestCockpitPhase } from '../../lib/api/requests.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';
import { isClosedRequest, nextActionKind } from './requestBuckets';

const STATUS_STYLES: Record<string, string> = {
  submitted: 'border-blue-100 bg-blue-50 text-anac-blue',
  pending_review: 'border-green-100 bg-green-50 text-anac-success',
  in_progress: 'border-blue-100 bg-blue-50 text-anac-blue',
  completed: 'border-green-100 bg-green-50 text-anac-success',
  rejected: 'border-red-100 bg-red-50 text-anac-danger',
  cancelled: 'border-slate-200 bg-slate-50 text-anac-muted',
};

/**
 * D1 - Reading pane: header, then an action bar holding the one next action
 * (Outlook's Répondre / Transférer row), then the dossier in a single column.
 * Closed dossier (K7): no workflow action, at most « Consulter le dossier ».
 */
export function RequestReadingPane({
  item,
  startButtonRef,
  onActionError,
}: {
  item: RequestCockpitItem | null;
  startButtonRef: RefObject<HTMLButtonElement>;
  onActionError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const startMutation = useMutation({
    mutationFn: (requestId: number) => startPreliminaryPhase(requestId),
    onSuccess: async () => {
      onActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.requests.all });
    },
    onError: (err) =>
      onActionError(apiErrorMessage(err, "Impossible d'ouvrir la phase préliminaire.")),
  });

  if (!item) {
    return (
      <article aria-label="Détail de la demande" className={PANE_CLASS}>
        <EmptyState
          title="Aucune demande sélectionnée"
          description="Sélectionnez une demande dans la liste."
        />
      </article>
    );
  }

  const kind = nextActionKind(item);
  const closed = isClosedRequest(item);

  return (
    <article aria-label={`Détail de la demande ${item.reference}`} className={PANE_CLASS}>
      <header className="border-b border-anac-border px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h2 className="text-lg font-semibold text-anac-navy">{item.reference}</h2>
          <span className="text-sm text-anac-text/80">{item.requestTypeLabel}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            {closed ? <ClosedDossierBadge status={item.status} /> : null}
            <StatusBadge
              label={item.statusLabel}
              tone={STATUS_STYLES[item.status] ?? STATUS_STYLES.in_progress}
            />
          </span>
        </div>
        <p className="mt-1.5 text-sm text-anac-text">
          <span className="font-semibold">{item.organisationName}</span>
          <span className="text-anac-muted">
            {' '}
            · {item.applicantName} · déposée le {formatDate(item.createdAt)}
          </span>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-anac-border bg-anac-gray/50 px-5 py-2.5">
        {kind === 'start' ? (
          <Button
            ref={startButtonRef}
            type="button"
            size="sm"
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate(item.id)}
          >
            <ArrowRight size={14} aria-hidden="true" />
            {startMutation.isPending ? 'Ouverture...' : 'Ouvrir la phase préliminaire'}
          </Button>
        ) : null}
        {kind === 'treat' && item.nextActionHref ? (
          <Link to={item.nextActionHref} className={cn(buttonVariants({ size: 'sm' }))}>
            <ArrowRight size={14} aria-hidden="true" />
            Traiter — {item.nextActionLabel}
          </Link>
        ) : null}
        {kind === 'consult' && item.nextActionHref ? (
          <Link
            to={item.nextActionHref}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Consulter le dossier
          </Link>
        ) : null}
        {kind === 'readonly' ? (
          <span className="rounded-md border border-anac-border bg-white px-3 py-1.5 text-xs font-semibold text-anac-muted">
            {item.nextActionLabel}
          </span>
        ) : null}
        <p className="min-w-0 flex-1 text-right text-xs text-anac-muted">
          {item.nextActionDescription}
        </p>
      </div>

      <div className="space-y-5 px-5 py-4">
        <Section title="Avancement">
          <PhaseStepper phases={item.phases} />
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Organisation">
            <Info label="Responsable" value={item.applicantName} />
            <Info label="E-mail" value={item.organisationEmail ?? item.applicantEmail} />
            <Info label="Téléphone" value={item.organisationPhone ?? item.applicantPhone ?? '-'} />
          </Section>
          <Section title="Informations clés">
            <Info label="Phase actuelle" value={item.currentPhaseLabel} />
            <Info label="Circuit signature" value={item.circuitStatusLabel} />
            <Info label="Date de dépôt" value={formatDateTime(item.createdAt)} />
            <Info label="Dernière mise à jour" value={formatDate(item.updatedAt)} />
          </Section>
        </div>

        <Section title="Documents obligatoires">
          <DocumentCells summary={item.documentSummary} />
        </Section>

        <Section title="Activité récente">
          <ActivityList item={item} />
        </Section>
      </div>
    </article>
  );
}

const PANE_CLASS =
  'min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-anac-text/70">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="text-right font-semibold text-anac-navy">{value}</span>
    </div>
  );
}

function PhaseStepper({ phases }: { phases: RequestCockpitPhase[] }) {
  return (
    <ol className="flex gap-2">
      {phases.map((phase, index) => (
        <li
          key={phase.phaseCode}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center text-[11px]',
            phase.status === 'not_started' ? 'text-anac-muted' : 'font-semibold text-anac-navy'
          )}
        >
          <span
            className={cn(
              'grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold',
              phase.status === 'closed'
                ? 'border-anac-success bg-anac-success text-white'
                : phase.status === 'open'
                  ? 'border-anac-blue bg-anac-blue text-white'
                  : 'border-anac-border bg-white text-anac-muted'
            )}
          >
            {phase.status === 'closed' ? <CheckCircle2 size={12} aria-hidden="true" /> : index + 1}
          </span>
          <span>
            {phase.label}
            <span className="sr-only">
              {phase.status === 'closed'
                ? ' (clôturée)'
                : phase.status === 'open'
                  ? ' (ouverte)'
                  : ' (non démarrée)'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One cell per mandatory document: evaluated, submitted awaiting review, missing. */
function DocumentCells({ summary }: { summary: RequestCockpitItem['documentSummary'] }) {
  if (summary.total === 0) {
    return (
      <p className="text-sm text-anac-muted">
        Le dossier documentaire sera suivi à partir de la demande formelle.
      </p>
    );
  }
  const evaluated = Math.max(summary.completed - summary.pending, 0);
  const cells = Array.from({ length: summary.total }, (_, index) =>
    index < evaluated ? 'evaluated' : index < summary.completed ? 'pending' : 'missing'
  );
  return (
    <div>
      <div className="flex flex-wrap gap-1" aria-hidden="true">
        {cells.map((cell, index) => (
          <span
            key={index}
            className={cn(
              'h-3.5 w-3.5 rounded-[3px]',
              cell === 'evaluated'
                ? 'bg-anac-success'
                : cell === 'pending'
                  ? 'bg-slate-400'
                  : 'bg-anac-border'
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-anac-muted">
        {evaluated} évalué(s) · {summary.pending} en attente de revue · {summary.missing}{' '}
        manquant(s) — sur {summary.total}
      </p>
    </div>
  );
}

function ActivityList({ item }: { item: RequestCockpitItem }) {
  if (item.activity.length === 0) {
    return <p className="text-sm text-anac-muted">Aucune activité récente disponible.</p>;
  }
  return (
    <ol className="space-y-2">
      {item.activity.map((activity) => (
        <li key={activity.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
          <span className="text-xs text-anac-muted">{formatDateTime(activity.createdAt)}</span>
          <span>
            <span className="font-semibold text-anac-navy">{activity.title}</span>{' '}
            <span className="text-anac-muted">par {activity.actor}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR');
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
