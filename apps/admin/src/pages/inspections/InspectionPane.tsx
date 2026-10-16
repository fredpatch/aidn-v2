import type { ReactNode, RefObject } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, FileText, MapPin, XCircle } from 'lucide-react';
import type { InternalRole } from '@aidn/shared';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { QueueEmptyPane, QueueReadingPane } from '../../components/cockpit/QueueReadingPane';
import { apiErrorMessage } from '../../lib/axios';
import { markSiteVisitHeld, submitVerdict } from '../../lib/api/site-inspection.api';
import type { InspectionQueueItem } from '../../lib/api/site-inspection.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { canAct } from '../../lib/next-action-owner';
import { cn } from '../../lib/utils';
import { inspectionCallout } from './inspectionCopy';

type VerdictValue = 'compliant' | 'non_compliant' | 'compliant_with_reserves';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Délivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

const VERDICT_LABELS: Record<VerdictValue, string> = {
  compliant: 'Conforme',
  compliant_with_reserves: 'Conforme avec réserves',
  non_compliant: 'Non conforme',
};

export function InspectionPane({
  item,
  roles,
  setActionError,
  actionButtonRef,
}: {
  item: InspectionQueueItem | null;
  roles: readonly string[];
  setActionError: (message: string | null) => void;
  actionButtonRef: RefObject<HTMLButtonElement>;
}) {
  const queryClient = useQueryClient();
  const verdictForm = useForm<{ verdict: VerdictValue; note: string }>({
    resolver: zodResolver(
      z.object({
        verdict: z.enum(['compliant', 'non_compliant', 'compliant_with_reserves']),
        note: z.string().trim().min(1, "La note est obligatoire pour soumettre l'avis d’inspection."),
      })
    ),
    defaultValues: { verdict: 'compliant', note: '' },
  });

  const markHeldMutation = useMutation({
    mutationFn: (meetingId: number) => markSiteVisitHeld(meetingId),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
    onError: async (err) => {
      setActionError(apiErrorMessage(err, 'Impossible de marquer la visite comme tenue.'));
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
  });

  const verdictMutation = useMutation({
    mutationFn: (params: { phaseId: number; verdict: VerdictValue; note: string }) =>
      submitVerdict(params.phaseId, params.verdict, params.note),
    onSuccess: async () => {
      verdictForm.reset();
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
    onError: async (err) => {
      setActionError(apiErrorMessage(err, "Impossible de soumettre l'avis d’inspection."));
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteInspection.myQueue() });
    },
  });

  if (!item) return <QueueEmptyPane title="Sélectionnez une mission" description="Le détail de la mission et l’action apparaîtront ici." />;

  const busy = markHeldMutation.isPending || verdictMutation.isPending;
  const copy = inspectionCallout(item);

  async function onVerdictSubmit(values: { verdict: VerdictValue; note: string }) {
    if (!item) return;
    await verdictMutation.mutateAsync({ phaseId: item.phaseId, verdict: values.verdict, note: values.note });
  }

  function onVerdictInvalid(errors: FieldErrors<{ verdict: VerdictValue; note: string }>) {
    setActionError(errors.note?.message ?? errors.verdict?.message ?? null);
  }

  const cta =
    item.actionKey === 'record_visit_held' ? (
      <Button ref={actionButtonRef} type="button" size="sm" onClick={() => markHeldMutation.mutate(item.siteVisit.id)} disabled={busy}>
        {busy ? 'Mise à jour...' : 'Enregistrer la tenue'}
      </Button>
    ) : item.actionKey === 'submit_verdict' ? (
      <form onSubmit={verdictForm.handleSubmit(onVerdictSubmit, onVerdictInvalid)} className="w-full rounded-lg border border-anac-border bg-white p-4">
        <h3 className="text-sm font-semibold text-anac-navy">Soumettre l&apos;avis d’inspection</h3>
        <label className="mt-3 block text-xs font-semibold text-anac-muted" htmlFor="ci-verdict">
          Verdict
        </label>
        <select
          id="ci-verdict"
          {...verdictForm.register('verdict')}
          className="mt-1 h-9 w-full rounded-md border border-anac-border bg-white px-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
        >
          {Object.entries(VERDICT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs font-semibold text-anac-muted" htmlFor="ci-note">
          Note
        </label>
        <textarea
          id="ci-note"
          rows={4}
          {...verdictForm.register('note')}
          className="mt-1 w-full rounded-md border border-anac-border bg-white px-3 py-2 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
          required
        />
        <Button type="submit" className="mt-3 w-full" disabled={busy}>
          {busy ? 'Soumission...' : "Soumettre l'avis"}
        </Button>
      </form>
    ) : undefined;

  // D11/D14 - the services act only for the assigned agent, even for an SU.
  const allowed = canAct(item.owner, roles as InternalRole[]) && item.assignedToViewer && !!cta;

  return (
    <QueueReadingPane
      ariaLabel={`Détail de la mission ${item.requestReference}`}
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-lg font-semibold text-anac-navy">{item.requestReference}</h2>
            <span className="text-sm text-anac-text/80">{item.organisationName}</span>
            <span className="ml-auto">{item.dossierClosed ? <ClosedDossierBadge status={item.dossierStatus} /> : null}</span>
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-anac-muted">
            <CalendarDays size={14} aria-hidden="true" />
            {formatDateTime(item.siteVisit.scheduledAt)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-anac-muted">
            <MapPin size={14} aria-hidden="true" />
            {item.siteVisit.location ?? 'Lieu non renseigné'}
          </p>
          {roles.includes('SU') ? (
            <p className="mt-1 text-xs text-anac-muted">Agent CI : {item.assignedAgentName ?? 'Non assigné'}</p>
          ) : null}
        </>
      }
      callout={{
        state: item.state,
        title: copy.title,
        description: copy.description,
        owner: item.owner,
        canAct: allowed,
        cta,
        secondary: (
          <Link
            to={`/demandes/${item.requestId}/demonstration-inspection`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'justify-center')}
          >
            Ouvrir la mission
          </Link>
        ),
        blockReason: copy.blockReason,
      }}
    >
      <PanelBlock title="Détails de la mission" icon={ClipboardList}>
        <Info label="Type de demande" value={REQUEST_TYPE_LABELS[item.requestType] ?? item.requestType} />
        <Info label="Paiement" value={paymentLabel(item.payment?.status)} />
        <Info label="Visite" value={visitLabel(item.siteVisit.status)} />
        <Info
          label="Avis d’inspection"
          value={item.inspection ? verdictLabel(item.inspection.verdict) : item.dossierClosed ? 'Non rendu' : 'Attendu'}
        />
      </PanelBlock>

      <PanelBlock title="Avancement" icon={ClipboardCheck}>
        <ProgressStep label="Paiement validé" done={item.payment?.status === 'validated'} />
        <ProgressStep label="Visite tenue" done={item.siteVisit.status === 'held'} />
        <ProgressStep label="Avis d’inspection soumis" done={!!item.inspection} />
      </PanelBlock>

      {item.inspection ? (
        <PanelBlock title="Avis soumis" icon={FileText}>
          <p className="text-sm font-semibold text-anac-navy">{verdictLabel(item.inspection.verdict)}</p>
          <p className="mt-1 text-xs text-anac-muted">Soumis le {formatDateTime(item.inspection.submittedAt)}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-anac-text">{item.inspection.note}</p>
        </PanelBlock>
      ) : null}
    </QueueReadingPane>
  );
}

function PanelBlock({ title, icon: Icon, children }: { title: string; icon: typeof ClipboardList; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-anac-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <Icon size={14} aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="text-right font-semibold text-anac-navy">{value}</span>
    </div>
  );
}

function ProgressStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 size={14} className="text-anac-success" aria-hidden="true" />
      ) : (
        <XCircle size={14} className="text-anac-muted" aria-hidden="true" />
      )}
      <span className={done ? 'text-anac-navy' : 'text-anac-muted'}>{label}</span>
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentLabel(status: string | undefined): string {
  if (status === 'validated') return 'Validé';
  if (status === 'awaiting_invoice') return 'Facture attendue';
  if (status === 'awaiting_proof') return 'Preuve de paiement attendue';
  if (status === 'pending_validation') return 'Validation Finance attendue';
  if (status === 'rejected') return 'Rejeté';
  return 'Non initialisé';
}

function visitLabel(status: string | undefined): string {
  if (status === 'scheduled') return 'Prévue';
  if (status === 'held') return 'Tenue';
  if (status === 'rescheduled') return 'Reprogrammée';
  if (status === 'no_show') return 'Absence';
  if (status === 'file_cancelled') return 'Dossier annulé';
  return '-';
}

function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict as VerdictValue] ?? verdict;
}
