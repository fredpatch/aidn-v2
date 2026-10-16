import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileUp, FolderOpen, Send } from 'lucide-react';
import type { InternalRole } from '@aidn/shared';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { CockpitPage } from '../../components/cockpit/CockpitPage';
import { QueueColumn } from '../../components/cockpit/QueueColumn';
import { AgingBadge } from '../../components/cockpit/AgingBadge';
import { CockpitUploadModal } from '../../components/cockpit/CockpitUploadModal';
import { QueueEmptyPane, QueueReadingPane } from '../../components/cockpit/QueueReadingPane';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { Button, buttonVariants } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchDnAnnotationTasks,
  returnDirectorAnnotation,
  sendToDirectorDn,
  type DnAnnotationTask,
} from '../../lib/api/dn-annotation';
import { apiErrorMessage } from '../../lib/axios';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue, type AgeOrder } from '../../lib/cockpit/queue';
import { useQueueTab } from '../../lib/cockpit/useQueueTab';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';
import { formatRowDate } from '../../lib/dayGroups';
import { canAct } from '../../lib/next-action-owner';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { uploadFile } from '../../lib/uploads';
import { cn } from '../../lib/utils';
import { formatDateTime } from '../dashboard/dashboard.helpers';
import { REQUEST_TYPE_LABELS } from '../courrier-tasks/courrierCopy';
import { DN_CIRCUIT_TAB_MODES, DN_CIRCUIT_TABS, dnCircuitCallout, dnCircuitMetrics, type DnCircuitTab } from './dnCircuitCopy';

const EMPTY_COUNTS = { to_send: 0, with_director: 0, returned: 0, inactive: 0 };
const DN_VIEW_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];

/** SESSION1-COCKPIT-1 - Circuit Directeur DN cockpit (home of the Assistante
 *  DN): the dossiers whose DG annotation was received, to hand to the
 *  Directeur DN and bring back annotated. Entrée only focuses the action. */
export default function CircuitDirecteurDnPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.dnCircuit.queue(), queryFn: () => fetchDnAnnotationTasks() });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = query.data?.counts ?? EMPTY_COUNTS;

  const [tab, setTab] = useQueueTab<DnCircuitTab>(DN_CIRCUIT_TABS.map((t) => t.key), 'to_send');
  const mode = DN_CIRCUIT_TAB_MODES[tab];
  const [order, setOrder] = useState<AgeOrder | null>(null);
  const effectiveOrder = order ?? defaultOrderFor(mode);
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      sortQueue(
        filterQueue(items, tab, search, (item) =>
          [item.requestReference, item.organisationName, item.applicantName, REQUEST_TYPE_LABELS[item.requestType]].join(' ')
        ),
        mode,
        effectiveOrder
      ),
    [items, tab, search, mode, effectiveOrder]
  );
  const groups = useMemo(() => groupQueue(visible, mode), [visible, mode]);
  const { selected, select } = useUrlSelection(visible, !query.isLoading);

  const [previewTask, setPreviewTask] = useState<DnAnnotationTask | null>(null);
  const [returnTask, setReturnTask] = useState<DnAnnotationTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.dnCircuit.queue() });

  async function run(task: DnAnnotationTask, action: () => Promise<void>, fallback: string, close: () => void) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await action();
      close();
      await reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
      // K7c - dossier closed meanwhile: reload so the row shows it, no action.
      if (isDossierClosedError(err)) {
        close();
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const closeReturn = () => {
    setReturnTask(null);
    setReturnFile(null);
  };

  return (
    <CockpitPage
      title="Circuit Directeur DN"
      metrics={dnCircuitMetrics(items, counts)}
      search={{ value: search, onChange: setSearch, placeholder: 'Référence, organisation, postulant, type...', label: 'Rechercher un dossier' }}
      errors={[query.error ? apiErrorMessage(query.error, 'Impossible de charger le circuit Directeur DN.') : null, actionError]}
      list={
        <QueueColumn
          tabs={DN_CIRCUIT_TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === 'all' ? items.length : counts[t.key] }))}
          tab={tab}
          onTabChange={(next) => {
            setTab(next);
            setActionError(null);
            setOrder(null);
          }}
          order={effectiveOrder}
          onOrderChange={setOrder}
          groups={groups}
          selectedId={selected?.id ?? null}
          status={query.isLoading ? 'loading' : query.error ? 'error' : 'ready'}
          texts={{
            loading: 'Chargement du circuit Directeur DN',
            error: 'Impossible de charger le circuit Directeur DN.',
            empty: 'Aucun dossier dans cette vue',
            listLabel: 'Dossiers du circuit Directeur DN',
            noun: ['dossier', 'dossiers'],
          }}
          onSelect={(task) => {
            setActionError(null);
            select(task);
          }}
          onActivate={() => {
            const button = actionButtonRef.current;
            if (button && !button.disabled) button.focus();
            else previewButtonRef.current?.focus();
          }}
          renderRow={(task) => <DnCircuitRow task={task} />}
        />
      }
      pane={
        <DnCircuitReadingPane
          task={selected}
          roles={roles}
          busy={busyId !== null && busyId === selected?.id}
          actionButtonRef={actionButtonRef}
          previewButtonRef={previewButtonRef}
          onPreview={setPreviewTask}
          onSend={(task) => run(task, () => sendToDirectorDn(task.id), 'Mise en circuit impossible.', () => undefined)}
          onReturn={(task) => {
            setReturnTask(task);
            setReturnFile(null);
          }}
        />
      }
    >
      <DocumentViewer
        file={previewTask?.fileUrl ? { title: `Circuit Directeur DN ${previewTask.requestReference}`, url: previewTask.fileUrl } : null}
        onClose={() => setPreviewTask(null)}
        actionHint="Document courant du circuit Directeur DN."
      />
      {returnTask ? (
        <CockpitUploadModal
          title="Téléverser le retour annoté"
          subtitle={`Annotation du Directeur DN - ${returnTask.requestReference}`}
          label="Document annoté par le Directeur DN"
          hint="Une fois enregistré, la DN peut ouvrir la phase préliminaire du dossier."
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          submitLabel="Enregistrer le retour"
          busySubmitLabel="Enregistrement..."
          file={returnFile}
          busy={busyId === returnTask.id}
          onFileChange={setReturnFile}
          onClose={closeReturn}
          onSubmit={() =>
            returnFile &&
            run(
              returnTask,
              async () => returnDirectorAnnotation(returnTask.id, (await uploadFile(returnFile)).uploadAssetId),
              'Retour annoté impossible.',
              closeReturn
            )
          }
        />
      ) : null}
    </CockpitPage>
  );
}

/** One list row: organisation and date, reference and badges, then the step. */
function DnCircuitRow({ task }: { task: DnAnnotationTask }) {
  return (
    <>
      <span className="truncate text-sm font-medium text-anac-text">{task.organisationName}</span>
      <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">{task.stepSince ? formatRowDate(task.stepSince) : '-'}</span>
      <span className="truncate text-xs text-anac-text/80">{task.requestReference}</span>
      <span className="flex justify-end gap-1.5">
        {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
        {task.bucket === 'to_send' || task.bucket === 'with_director' ? (
          <AgingBadge urgency="normal" since={task.stepSince} workingDays={task.bucket === 'with_director' ? task.directorWorkingDays : null} />
        ) : null}
      </span>
      <span className="col-span-2 truncate text-xs">
        <span className={cn('font-semibold', task.state === 'action_required' ? 'text-anac-blue' : task.state === 'waiting' ? 'text-anac-warning' : 'text-anac-muted')}>
          {dnCircuitCallout(task).title}
        </span>
      </span>
    </>
  );
}

function DnCircuitReadingPane({
  task, roles, busy, actionButtonRef, previewButtonRef, onPreview, onSend, onReturn,
}: {
  task: DnAnnotationTask | null;
  roles: readonly string[];
  busy: boolean;
  actionButtonRef: RefObject<HTMLButtonElement>;
  previewButtonRef: RefObject<HTMLButtonElement>;
  onPreview: (task: DnAnnotationTask) => void;
  onSend: (task: DnAnnotationTask) => void;
  onReturn: (task: DnAnnotationTask) => void;
}) {
  if (!task) return <QueueEmptyPane title="Sélectionnez un dossier" description="Le circuit, le document et l’action apparaîtront ici." />;
  const copy = dnCircuitCallout(task);
  const cta = task.availableActions.includes('send_to_director') ? (
    <Button ref={actionButtonRef} type="button" size="sm" disabled={busy} onClick={() => onSend(task)}>
      <Send size={14} aria-hidden="true" /> Marquer transmis au Directeur DN
    </Button>
  ) : task.availableActions.includes('upload_annotated_return') ? (
    <Button ref={actionButtonRef} type="button" size="sm" disabled={busy} onClick={() => onReturn(task)}>
      <FileUp size={14} aria-hidden="true" /> Téléverser le retour annoté
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
        <Link to={`/demandes/${task.requestId}/phase-preliminaire`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}>
          <FolderOpen size={14} aria-hidden="true" /> Voir le dossier
        </Link>
      ) : null}
    </>
  );
  return (
    <QueueReadingPane
      ariaLabel={`Détail du dossier ${task.requestReference}`}
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
            <span className="text-sm text-anac-text/80">{REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}</span>
            <span className="ml-auto">{task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}</span>
          </div>
          <p className="mt-1.5 text-sm"><span className="font-semibold">{task.organisationName}</span><span className="text-anac-muted"> · {task.applicantName}</span></p>
        </>
      }
      callout={{
        state: task.state,
        title: copy.title,
        description: copy.description,
        owner: task.owner,
        canAct: canAct(task.owner, roles as InternalRole[]) && !!cta,
        cta,
        secondary,
        blockReason: copy.blockReason,
      }}
    >
      <Section title="Informations clés">
        <dl className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
          <Info label="Organisation" value={task.organisationName} />
          <Info label="Postulant" value={task.applicantName} />
          <Info label="Annotation du DG reçue" value={formatDateTime(task.createdAt)} />
          <Info label="Transmis au Directeur DN" value={formatDateTime(task.sentToDirectorAt)} />
          <Info label="Annotation du Directeur DN reçue" value={formatDateTime(task.returnedAt)} />
          {task.directorWorkingDays !== null ? (
            <Info label="Délai chez le Directeur DN" value={`${task.directorWorkingDays} jour(s) ouvré(s)`} />
          ) : null}
        </dl>
        {task.predatesProcess ? (
          <p className="mt-3 text-xs text-anac-muted">
            Dossier antérieur à cette étape : aucun document d&apos;annotation du Directeur DN n&apos;est conservé.
          </p>
        ) : null}
      </Section>
    </QueueReadingPane>
  );
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
    <div className="flex items-start justify-between gap-4">
      <dt className="text-anac-muted">{label}</dt>
      <dd className="text-right font-semibold text-anac-navy">{value}</dd>
    </div>
  );
}
