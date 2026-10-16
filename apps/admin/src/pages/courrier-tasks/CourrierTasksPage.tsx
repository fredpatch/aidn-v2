import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { CockpitPage } from '../../components/cockpit/CockpitPage';
import { QueueColumn } from '../../components/cockpit/QueueColumn';
import { CockpitUploadModal } from '../../components/cockpit/CockpitUploadModal';
import { useAuth } from '../../hooks/useAuth';
import { confirmCourrierPrinted, fetchCourrierTasks, returnAnnotatedCourrier, type CourrierTask } from '../../lib/api/courrier-tasks';
import { apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { uploadFile } from '../../lib/uploads';
import { courrierDefaultTab } from '../../lib/home-for';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue, type AgeOrder } from '../../lib/cockpit/queue';
import { useQueueTab } from '../../lib/cockpit/useQueueTab';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';
import { CourrierReadingPane } from './CourrierReadingPane';
import { CourrierRow } from './CourriersList';
import { COURRIER_TAB_MODES, COURRIER_TABS, REQUEST_TYPE_LABELS, SOURCE_LABELS, courrierMetrics, type CourrierTab } from './courrierCopy';

const EMPTY_COUNTS = { to_print: 0, with_dg: 0, returned: 0, inactive: 0 };

/** SESSION1-COCKPIT-1 - Réception / Assistant DG cockpit (home of both roles):
 *  DG-circuit queue on the shared shell. Actions unchanged: « Ouvrir /
 *  imprimer » opens the viewer whose « Impression OK » confirms; the annotated
 *  return goes through the upload dialog. Entrée only focuses the action. */
export default function CourrierTasksPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.courrierTasks.queue(), queryFn: () => fetchCourrierTasks() });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = query.data?.counts ?? EMPTY_COUNTS;
  const thresholds = query.data?.thresholds ?? { dgAlertWorkingDays: 3, depositDays: 1 };

  const [tab, setTab] = useQueueTab<CourrierTab>(COURRIER_TABS.map((t) => t.key), courrierDefaultTab(roles));
  const mode = COURRIER_TAB_MODES[tab];
  const [order, setOrder] = useState<AgeOrder | null>(null);
  const effectiveOrder = order ?? defaultOrderFor(mode);
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      sortQueue(
        filterQueue(items, tab, search, (item) =>
          [item.requestReference, item.organisationName, item.applicantName, SOURCE_LABELS[item.source], REQUEST_TYPE_LABELS[item.requestType]].join(' ')
        ),
        mode,
        effectiveOrder
      ),
    [items, tab, search, mode, effectiveOrder]
  );
  const groups = useMemo(() => groupQueue(visible, mode), [visible, mode]);
  const { selected, select } = useUrlSelection(visible, !query.isLoading);

  const [printTask, setPrintTask] = useState<CourrierTask | null>(null);
  const [previewTask, setPreviewTask] = useState<CourrierTask | null>(null);
  const [returnTask, setReturnTask] = useState<CourrierTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.courrierTasks.queue() });

  async function run(task: CourrierTask, action: () => Promise<void>, fallback: string, close: () => void) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await action();
      close();
      await reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
      if (isDossierClosedError(err)) {
        close();
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const viewerTask = printTask ?? previewTask;
  return (
    <CockpitPage
      title="Courriers — circuit DG"
      metrics={courrierMetrics(items, counts)}
      search={{ value: search, onChange: setSearch, placeholder: 'Référence, organisation, postulant, type...', label: 'Rechercher un courrier' }}
      errors={[query.error ? apiErrorMessage(query.error, 'Impossible de charger les courriers.') : null, actionError]}
      list={
        <QueueColumn
          tabs={COURRIER_TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === 'all' ? items.length : counts[t.key] }))}
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
          texts={{ loading: 'Chargement des courriers', error: 'Impossible de charger les courriers.', empty: 'Aucun courrier dans cette vue', listLabel: 'Courriers', noun: ['courrier', 'courriers'] }}
          onSelect={(task) => {
            setActionError(null);
            select(task);
          }}
          onActivate={() => {
            const button = actionButtonRef.current;
            if (button && !button.disabled) button.focus();
            else previewButtonRef.current?.focus();
          }}
          renderRow={(task) => <CourrierRow task={task} />}
        />
      }
      pane={
        <CourrierReadingPane
          task={selected}
          roles={roles}
          busy={busyId !== null && busyId === selected?.id}
          thresholds={thresholds}
          actionButtonRef={actionButtonRef}
          previewButtonRef={previewButtonRef}
          onPrint={setPrintTask}
          onPreview={setPreviewTask}
          onReturn={(task) => {
            setReturnTask(task);
            setReturnFile(null);
          }}
        />
      }
    >
      <DocumentViewer
        file={viewerTask?.fileUrl ? { title: `${SOURCE_LABELS[viewerTask.source] ?? viewerTask.source} ${viewerTask.requestReference}`, url: viewerTask.fileUrl } : null}
        onClose={() => {
          setPrintTask(null);
          setPreviewTask(null);
        }}
        primaryActionLabel={printTask ? (busyId === printTask.id ? 'Confirmation...' : 'Impression OK - mettre en circuit DG') : undefined}
        primaryActionDisabled={!printTask || busyId !== null}
        actionHint={printTask ? 'Imprimez le document, vérifiez le contenu, puis confirmez sa mise en circuit DG.' : 'Prévisualisation intégrée du document courant.'}
        onPrimaryAction={() =>
          printTask && run(printTask, () => confirmCourrierPrinted(printTask.id), 'Confirmation impossible.', () => setPrintTask(null))
        }
      />
      {returnTask ? (
        <CockpitUploadModal
          title="Scanner le retour annoté"
          subtitle={`${SOURCE_LABELS[returnTask.source] ?? returnTask.source} - ${returnTask.requestReference}`}
          label="Document annoté par le DG"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          submitLabel="Enregistrer le retour"
          busySubmitLabel="Enregistrement..."
          file={returnFile}
          busy={busyId === returnTask.id}
          onFileChange={setReturnFile}
          onClose={() => {
            setReturnTask(null);
            setReturnFile(null);
          }}
          onSubmit={() =>
            returnFile &&
            run(
              returnTask,
              async () => returnAnnotatedCourrier(returnTask.id, (await uploadFile(returnFile)).uploadAssetId),
              'Enregistrement du retour annoté impossible.',
              () => {
                setReturnTask(null);
                setReturnFile(null);
              }
            )
          }
        />
      ) : null}
    </CockpitPage>
  );
}
