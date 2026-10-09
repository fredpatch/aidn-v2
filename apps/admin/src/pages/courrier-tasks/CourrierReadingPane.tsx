import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  FileText,
  FileUp,
  FolderOpen,
  LockKeyhole,
  Printer,
} from 'lucide-react';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import { cn } from '../../lib/utils';
import {
  BUCKET_LABELS,
  REQUEST_TYPE_LABELS,
  SOURCE_LABELS,
  STEP_LABELS,
  courrierActionKind,
  signatureWaitDays,
  stepDateOf,
} from './courrierBuckets';

const BUCKET_TONES: Record<CourrierTask['bucket'], string> = {
  to_signature: 'border-blue-100 bg-blue-50 text-anac-blue',
  in_signature: 'border-orange-100 bg-orange-50 text-anac-warning',
  returned: 'border-green-100 bg-green-50 text-anac-success',
  legacy_signed: 'border-slate-200 bg-slate-50 text-anac-muted',
};

const DOCUMENT_LABELS: Record<CourrierTask['bucket'], string> = {
  to_signature: 'Document source à imprimer',
  in_signature: 'Courrier actuellement en signature',
  returned: 'Retour signé scanné',
  legacy_signed: 'Document archivé',
};

const PANE_CLASS =
  'min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]';

/**
 * C2b - Reading pane: header, an action bar with the one circuit action and
 * « Voir le document », then the circuit, the document and the key facts.
 * The action buttons only open the existing confirmation steps (viewer with
 * « Impression OK », signed-return modal); nothing changes the circuit here.
 * Closed dossier (K7c): no action, the document stays viewable.
 */
export function CourrierReadingPane({
  task,
  busy,
  canOperate,
  canViewDossier,
  actionButtonRef,
  previewButtonRef,
  onPrint,
  onPreview,
  onReturn,
}: {
  task: CourrierTask | null;
  busy: boolean;
  canOperate: boolean;
  canViewDossier: boolean;
  actionButtonRef: RefObject<HTMLButtonElement>;
  previewButtonRef: RefObject<HTMLButtonElement>;
  onPrint: (task: CourrierTask) => void;
  onPreview: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (!task) {
    return (
      <article
        aria-label="Détail du courrier"
        className={cn(PANE_CLASS, 'grid min-h-[420px] place-items-center p-6')}
      >
        <EmptyState
          icon={FileText}
          title="Sélectionnez un courrier"
          description="Le détail du circuit, les documents et les actions apparaîtront ici."
        />
      </article>
    );
  }

  const kind = courrierActionKind(task);
  const sourceLabel = SOURCE_LABELS[task.source] ?? task.source;

  return (
    <article aria-label={`Détail du courrier ${task.requestReference}`} className={PANE_CLASS}>
      <header className="border-b border-anac-border px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
          <span className="text-sm text-anac-text/80">
            {sourceLabel} · {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
            <StatusBadge label={BUCKET_LABELS[task.bucket]} tone={BUCKET_TONES[task.bucket]} />
          </span>
        </div>
        <p className="mt-1.5 text-sm text-anac-text">
          <span className="font-semibold">{task.organisationName}</span>
          <span className="text-anac-muted">
            {' '}
            · {task.applicantName} · {STEP_LABELS[task.bucket].toLowerCase()} le{' '}
            {formatDate(stepDateOf(task))}
          </span>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-anac-border bg-anac-gray/50 px-5 py-2.5">
        {kind === 'print' ? (
          <Button
            ref={actionButtonRef}
            type="button"
            size="sm"
            disabled={busy || !task.fileUrl || !canOperate}
            onClick={() => onPrint(task)}
          >
            <Printer size={14} aria-hidden="true" />
            Ouvrir / imprimer
          </Button>
        ) : null}
        {kind === 'return' ? (
          <Button
            ref={actionButtonRef}
            type="button"
            size="sm"
            disabled={busy || !canOperate}
            onClick={() => onReturn(task)}
          >
            <FileUp size={14} aria-hidden="true" />
            Scanner le retour signé
          </Button>
        ) : null}
        {kind === 'none' ? (
          <span className="rounded-md border border-anac-border bg-white px-3 py-1.5 text-xs font-semibold text-anac-muted">
            {task.dossierClosed
              ? 'Dossier clos - consultation'
              : task.bucket === 'returned'
                ? 'Transmis à la DN'
                : 'Consultation historique'}
          </span>
        ) : null}
        {task.fileUrl ? (
          <button
            ref={previewButtonRef}
            type="button"
            onClick={() => onPreview(task)}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
          >
            <Eye size={14} aria-hidden="true" />
            Voir le document
          </button>
        ) : null}
        {canViewDossier ? (
          <Link
            to={dossierPath(task)}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Voir le dossier
          </Link>
        ) : null}
        <p className="min-w-0 flex-1 text-right text-xs text-anac-muted">
          {actionHint(task, canOperate)}
        </p>
      </div>

      <div className="space-y-5 px-5 py-4">
        <Section title="Circuit signature">
          <CircuitStepper task={task} />
        </Section>

        {task.dossierClosed ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <LockKeyhole size={16} className="text-slate-500" aria-hidden="true" />
              Dossier clos - consultation uniquement
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Le courrier et son document restent consultables. Aucune action du circuit signature
              n&apos;est possible sur ce dossier.
            </p>
          </section>
        ) : null}

        <section className="flex items-center gap-4 rounded-lg border border-anac-border p-4">
          <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-anac-gray text-anac-blue">
            <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-anac-navy">{DOCUMENT_LABELS[task.bucket]}</h3>
            <p className="mt-1 text-xs text-anac-muted">
              {task.fileUrl
                ? 'Le document courant est disponible pour consultation.'
                : 'Aucun fichier courant disponible pour ce courrier.'}
            </p>
          </div>
        </section>

        <Section title="Informations clés">
          <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Info label="Type de courrier" value={sourceLabel} />
            <Info
              label="Nature de demande"
              value={REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
            />
            <Info label="Demandeur" value={task.organisationName} />
            <Info label="Postulant" value={task.applicantName} />
          </dl>
        </Section>
      </div>
    </article>
  );
}

function actionHint(task: CourrierTask, canOperate: boolean): string {
  if (task.dossierClosed) return 'Consultation et téléchargement uniquement.';
  const kind = courrierActionKind(task);
  if (kind !== 'none' && !canOperate)
    return 'Consultation seule : action réservée à la réception / assistant DG.';
  if (kind === 'print')
    return 'Imprimez le courrier, puis confirmez sa mise en signature dans la visionneuse.';
  if (kind === 'return') {
    const days = signatureWaitDays(task);
    const since = days === null ? '' : `En signature depuis ${days} j. `;
    return `${since}Scannez le retour signé dès qu'il revient.`;
  }
  if (task.bucket === 'returned') return 'Aucune action : le dossier poursuit dans le workflow DN.';
  return 'Courrier archivé.';
}

function CircuitStepper({ task }: { task: CourrierTask }) {
  const returnedAt = task.pendingReviewAt ?? task.signedAt;
  const transmitted = task.bucket === 'returned' || task.bucket === 'legacy_signed';
  const steps = [
    {
      label: 'Déposé',
      date: task.depositedAt,
      done: true,
      current: task.bucket === 'to_signature',
    },
    {
      label: 'En signature',
      date: task.signatureSentAt,
      done: !!task.signatureSentAt,
      current: task.bucket === 'in_signature',
    },
    { label: 'Retour scanné', date: returnedAt, done: !!returnedAt, current: false },
    {
      label: 'Transmis DN',
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
                {state === 'done'
                  ? ' (fait)'
                  : state === 'current'
                    ? ' (étape en cours)'
                    : ' (à venir)'}
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
