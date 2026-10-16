import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, FileText, FileUp, FolderOpen, Printer } from 'lucide-react';
import type { InternalRole } from '@aidn/shared';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { QueueEmptyPane, QueueReadingPane } from '../../components/cockpit/QueueReadingPane';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { canAct } from '../../lib/next-action-owner';
import { cn } from '../../lib/utils';
import { REQUEST_TYPE_LABELS, SOURCE_LABELS, courrierCallout } from './courrierCopy';

const DN_VIEW_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];

const DOCUMENT_LABELS: Record<CourrierTask['bucket'], string> = {
  to_print: 'Document source à imprimer',
  with_dg: 'Courrier actuellement en circuit DG',
  returned: 'Retour annoté scanné',
  inactive: 'Document du courrier',
};

export function CourrierReadingPane({
  task, roles, busy, thresholds, actionButtonRef, previewButtonRef, onPrint, onPreview, onReturn,
}: {
  task: CourrierTask | null;
  roles: readonly string[];
  busy: boolean;
  thresholds: { dgAlertWorkingDays: number };
  actionButtonRef: RefObject<HTMLButtonElement>;
  previewButtonRef: RefObject<HTMLButtonElement>;
  onPrint: (task: CourrierTask) => void;
  onPreview: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (!task) return <QueueEmptyPane title="Sélectionnez un courrier" description="Le circuit, le document et l'action apparaîtront ici." />;
  const copy = courrierCallout(task, thresholds);
  const allowed = canAct(task.owner, roles as InternalRole[]);
  const sourceLabel = SOURCE_LABELS[task.source] ?? task.source;
  const cta = task.availableActions.includes('print') ? (
    <Button ref={actionButtonRef} type="button" size="sm" disabled={busy || !task.fileUrl} onClick={() => onPrint(task)}>
      <Printer size={14} aria-hidden="true" /> Ouvrir / imprimer
    </Button>
  ) : task.availableActions.includes('upload_signed_return') ? (
    <Button ref={actionButtonRef} type="button" size="sm" disabled={busy} onClick={() => onReturn(task)}>
      <FileUp size={14} aria-hidden="true" /> Scanner le retour annoté
    </Button>
  ) : undefined;
  const secondary = (
    <>
      {task.fileUrl ? (
        <button ref={previewButtonRef} type="button" onClick={() => onPreview(task)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}>
          <Eye size={14} aria-hidden="true" /> Voir le document
        </button>
      ) : null}
      {roles.some((role) => DN_VIEW_ROLES.includes(role)) ? (
        <Link to={dossierPath(task)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}>
          <FolderOpen size={14} aria-hidden="true" /> Voir le dossier
        </Link>
      ) : null}
    </>
  );
  return (
    <QueueReadingPane
      ariaLabel={`Détail du courrier ${task.requestReference}`}
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
            <span className="text-sm text-anac-text/80">{sourceLabel} · {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}</span>
            <span className="ml-auto">{task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}</span>
          </div>
          <p className="mt-1.5 text-sm"><span className="font-semibold">{task.organisationName}</span><span className="text-anac-muted"> · {task.applicantName}</span></p>
        </>
      }
      callout={{ state: task.state, title: copy.title, description: copy.description, owner: task.owner, canAct: allowed && !!cta, cta, secondary, blockReason: copy.blockReason }}
    >
      <Section title="Circuit DG"><CircuitStepper task={task} /></Section>
      <section className="flex items-center gap-4 rounded-lg border border-anac-border p-4">
        <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-anac-gray text-anac-blue">
          <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-anac-navy">{DOCUMENT_LABELS[task.bucket]}</h3>
          <p className="mt-1 text-xs text-anac-muted">
            {task.fileUrl ? 'Le document courant est disponible pour consultation.' : 'Aucun fichier courant disponible pour ce courrier.'}
          </p>
        </div>
      </section>
      <Section title="Informations clés">
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <Info label="Type de courrier" value={sourceLabel} />
          <Info label="Nature de demande" value={REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType} />
          <Info label="Demandeur" value={task.organisationName} />
          <Info label="Postulant" value={task.applicantName} />
        </dl>
      </Section>
    </QueueReadingPane>
  );
}

function CircuitStepper({ task }: { task: CourrierTask }) {
  const returnedAt = task.pendingReviewAt ?? task.signedAt;
  const transmitted = task.circuitStep === 'returned' || task.circuitStep === 'legacy_signed';
  const steps = [
    { label: 'Déposé', date: task.depositedAt as string | null, done: true, current: task.circuitStep === 'deposited' },
    { label: 'En circuit DG', date: task.signatureSentAt, done: !!task.signatureSentAt, current: task.circuitStep === 'with_dg' },
    { label: 'Annotation reçue', date: returnedAt, done: !!returnedAt, current: false },
    {
      label: task.actionKey === 'handed_to_assistant_dn' ? 'Transmis à l’Assistante DN' : 'Transmis à la DN',
      date: transmitted ? returnedAt : null,
      done: transmitted,
      current: false,
    },
  ].map((step) => ({ ...step, current: step.current && !task.dossierClosed }));

  return (
    <ol className="flex gap-2">
      {steps.map((step, index) => {
        const state = step.current ? 'current' : step.done ? 'done' : 'todo';
        return (
          <li
            key={step.label}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center text-[11px]',
              state === 'todo' ? 'text-anac-muted' : 'font-semibold text-anac-navy'
            )}
          >
            <span
              className={cn(
                'grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold',
                state === 'done'
                  ? 'border-anac-success bg-anac-success text-white'
                  : state === 'current'
                    ? 'border-anac-blue bg-anac-blue text-white'
                    : 'border-anac-border bg-white text-anac-muted'
              )}
            >
              {state === 'done' ? <CheckCircle2 size={12} aria-hidden="true" /> : index + 1}
            </span>
            <span>
              {step.label}
              <span className="sr-only">
                {state === 'done' ? ' (fait)' : state === 'current' ? ' (étape en cours)' : ' (à venir)'}
              </span>
            </span>
            <span className="font-normal text-anac-muted">
              {step.done && step.date ? formatDate(step.date) : '-'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function dossierPath(task: CourrierTask): string {
  if (task.source === 'formal_request_letter') return `/demandes/${task.requestId}/phase-formelle`;
  return `/demandes/${task.requestId}/phase-preliminaire`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-anac-navy">{title}</h3>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-anac-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-anac-navy">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR');
}
