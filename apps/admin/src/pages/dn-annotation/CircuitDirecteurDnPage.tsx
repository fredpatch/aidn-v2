import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Search, Send } from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { BucketTabs } from '../../components/common/BucketTabs';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  fetchDnAnnotationTasks,
  returnDirectorAnnotation,
  sendToDirectorDn,
  type DnAnnotationBucket,
  type DnAnnotationTask,
} from '../../lib/api/dn-annotation';
import { apiErrorMessage } from '../../lib/axios';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { uploadFile } from '../../lib/uploads';
import { formatDateTime } from '../dashboard/dashboard.helpers';
import { REQUEST_TYPE_LABELS } from '../courrier-tasks/courrierBuckets';
import { DN_ANNOTATION_TABS, countDnTabs, dnActionLabel, filterDnTasks } from './dnAnnotationBuckets';

const BUCKET_HINTS: Record<DnAnnotationBucket, string> = {
  to_send: 'Annotation du DG reçue. Remettez le dossier au Directeur DN, puis marquez-le en circuit Directeur DN.',
  with_director:
    'Le dossier est chez le Directeur DN. Dès que le retour annoté physique est disponible, scannez-le et téléversez-le.',
  returned: 'Annotation du Directeur DN reçue. La DN peut ouvrir la phase préliminaire.',
};

const TAB_TONES: Record<DnAnnotationBucket, string> = {
  to_send: 'border-blue-100 bg-blue-50 text-anac-blue',
  with_director: 'border-orange-100 bg-orange-50 text-anac-warning',
  returned: 'border-green-100 bg-green-50 text-anac-success',
};

/**
 * SESSION1-M1-1 - Circuit Directeur DN, the Assistante DN inbox: the dossiers
 * whose DG annotation was received, to hand to the Directeur DN and bring back
 * annotated. Only this page: the Réception courrier page has no DN branch.
 * The selected task is kept in `?id=`.
 */
export default function CircuitDirecteurDnPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<DnAnnotationTask[]>([]);
  const [tab, setTab] = useState<DnAnnotationBucket>('to_send');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewTask, setViewTask] = useState<DnAnnotationTask | null>(null);
  const [returnTask, setReturnTask] = useState<DnAnnotationTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTasks((await fetchDnAnnotationTasks()).items);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger le circuit Directeur DN.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => countDnTabs(tasks), [tasks]);
  const visible = useMemo(() => filterDnTasks(tasks, tab, search), [tasks, tab, search]);
  const requestedId = searchParams.get('id');
  const selected = visible.find((task) => task.id === requestedId) ?? visible[0] ?? null;

  function select(task: DnAnnotationTask) {
    setActionError(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', task.id);
        return next;
      },
      { replace: true }
    );
  }

  async function handleSend(task: DnAnnotationTask) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await sendToDirectorDn(task.id);
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Mise en circuit impossible.'));
      // K7c - dossier closed meanwhile: reload so the task shows it, no action.
      if (isDossierClosedError(err)) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReturn() {
    if (!returnTask || !returnFile) {
      setActionError('Sélectionnez le document annoté par le Directeur DN.');
      return;
    }
    setActionError(null);
    setBusyId(returnTask.id);
    try {
      const uploaded = await uploadFile(returnFile);
      await returnDirectorAnnotation(returnTask.id, uploaded.uploadAssetId);
      setReturnTask(null);
      setReturnFile(null);
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Retour annoté impossible.'));
      if (isDossierClosedError(err)) {
        setReturnTask(null);
        setReturnFile(null);
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="mr-auto">
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilité</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-anac-navy">Circuit Directeur DN</h1>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Synthèse">
            <StatusBadge label={`${counts.to_send} à transmettre`} tone={TAB_TONES.to_send} />
            <StatusBadge label={`${counts.with_director} en attente du retour`} tone={TAB_TONES.with_director} />
            <StatusBadge label={`${counts.returned} annotation(s) reçue(s)`} tone={TAB_TONES.returned} />
          </div>
          <label className="relative block w-full sm:w-[340px]">
            <span className="sr-only">Rechercher un dossier</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              placeholder="Référence, organisation, postulant..."
            />
          </label>
        </header>

        {[error, actionError].map((message, index) =>
          message ? (
            <div
              key={index}
              role="alert"
              className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger"
            >
              {message}
            </div>
          ) : null
        )}

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
            <BucketTabs
              size="compact"
              value={tab}
              items={DN_ANNOTATION_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
              onChange={setTab}
            />
            <ul className="max-h-[calc(100vh-14rem)] divide-y divide-anac-border overflow-y-auto">
              {loading ? (
                <li className="px-4 py-6 text-sm text-anac-muted">Chargement...</li>
              ) : visible.length === 0 ? (
                <li className="px-4 py-6 text-sm text-anac-muted">Aucun dossier dans cet onglet.</li>
              ) : (
                visible.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => select(task)}
                      aria-current={selected?.id === task.id}
                      className={`block w-full px-4 py-3 text-left transition hover:bg-anac-gray/60 ${
                        selected?.id === task.id ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <span className="block text-sm font-semibold text-anac-navy">{task.requestReference}</span>
                      <span className="block text-xs text-anac-muted">
                        {task.organisationName} · {task.applicantName}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <DetailPane
            task={selected}
            busy={busyId !== null && busyId === selected?.id}
            onView={setViewTask}
            onSend={handleSend}
            onReturn={(task) => {
              setReturnTask(task);
              setReturnFile(null);
            }}
          />
        </section>

        <DocumentViewer
          file={
            viewTask?.fileUrl
              ? { title: `Circuit Directeur DN ${viewTask.requestReference}`, url: viewTask.fileUrl }
              : null
          }
          onClose={() => setViewTask(null)}
          actionHint="Document courant du circuit Directeur DN."
        />

        {returnTask && (
          <Modal
            title="Téléverser le retour annoté"
            subtitle={`Annotation du Directeur DN - ${returnTask.requestReference}`}
            onClose={() => {
              setReturnTask(null);
              setReturnFile(null);
            }}
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === returnTask.id}
                  onClick={() => {
                    setReturnTask(null);
                    setReturnFile(null);
                  }}
                >
                  Annuler
                </Button>
                <Button type="button" size="sm" disabled={!returnFile || busyId === returnTask.id} onClick={handleReturn}>
                  <Send size={14} aria-hidden="true" />
                  {busyId === returnTask.id ? 'Enregistrement...' : 'Enregistrer le retour'}
                </Button>
              </>
            }
          >
            <div className="space-y-2">
              <label className="label">Document annoté par le Directeur DN</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                disabled={busyId === returnTask.id}
                onChange={(event) => setReturnFile(event.target.files?.[0] ?? null)}
              />
              {returnFile ? <p className="text-xs text-anac-muted">{returnFile.name}</p> : null}
              <p className="text-xs text-anac-muted">
                Une fois enregistré, la DN peut ouvrir la phase préliminaire du dossier.
              </p>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function DetailPane({
  task,
  busy,
  onView,
  onSend,
  onReturn,
}: {
  task: DnAnnotationTask | null;
  busy: boolean;
  onView: (task: DnAnnotationTask) => void;
  onSend: (task: DnAnnotationTask) => void;
  onReturn: (task: DnAnnotationTask) => void;
}) {
  if (!task) {
    return (
      <EmptyState
        title="Aucun dossier sélectionné"
        description="Les dossiers dont l'annotation du DG est reçue apparaissent ici, à transmettre au Directeur DN."
        className="min-h-[240px]"
      />
    );
  }
  const action = dnActionLabel(task);
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-anac-border px-5 py-4">
        <div className="mr-auto">
          <p className="text-xs text-anac-muted">
            {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
          </p>
          <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
        </div>
        <StatusBadge label={task.statusLabel} tone={TAB_TONES[task.bucket]} />
        {task.dossierClosed ? <ClosedDossierBadge status={task.dossierStatus} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-anac-border bg-anac-gray/40 px-5 py-3">
        {task.fileUrl ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onView(task)}>
            <Eye size={14} aria-hidden="true" />
            Voir le document
          </Button>
        ) : null}
        {action && task.availableActions.includes('send_to_director') ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onSend(task)}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : action}
          </Button>
        ) : null}
        {action && task.availableActions.includes('upload_annotated_return') ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onReturn(task)}>
            <Send size={14} aria-hidden="true" />
            {action}
          </Button>
        ) : null}
        {!action ? (
          <span className="text-xs text-anac-muted">
            {task.dossierClosed ? 'Dossier clos : consultation uniquement.' : 'Aucune action à effectuer.'}
          </span>
        ) : null}
      </div>

      <p className="border-b border-anac-border px-5 py-3 text-sm text-anac-muted">{BUCKET_HINTS[task.bucket]}</p>

      <dl className="grid gap-x-8 gap-y-2 px-5 py-4 text-sm md:grid-cols-2">
        <Info label="Organisation" value={task.organisationName} />
        <Info label="Postulant" value={task.applicantName} />
        <Info label="Annotation du DG reçue" value={formatDateTime(task.createdAt)} />
        <Info label="En circuit Directeur DN" value={formatDateTime(task.sentToDirectorAt)} />
        <Info label="Annotation du Directeur DN reçue" value={formatDateTime(task.returnedAt)} />
        {task.directorWorkingDays !== null ? (
          <Info label="Délai chez le Directeur DN" value={`${task.directorWorkingDays} jour(s) ouvré(s)`} />
        ) : null}
        {task.predatesProcess ? (
          <p className="text-xs text-anac-muted md:col-span-2">
            Dossier antérieur à cette étape : aucun document d&apos;annotation du Directeur DN n&apos;est conservé.
          </p>
        ) : null}
      </dl>
    </article>
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
