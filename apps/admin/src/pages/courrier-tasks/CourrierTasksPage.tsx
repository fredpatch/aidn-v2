import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  FileUp,
  Inbox,
  Printer,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button, buttonVariants } from '../../components/ui/button';
import { useAuth } from '../../hooks/useAuth';
import {
  confirmCourrierPrinted,
  fetchCourrierTasks,
  returnSignedCourrier,
  type CourrierTask,
  type CourrierTaskBucket,
} from '../../lib/api/courrier-tasks';
import { api, apiErrorMessage } from '../../lib/axios';
import { cn } from '../../lib/utils';

const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
};

const BUCKET_LABELS: Record<CourrierTaskBucket | 'all', string> = {
  all: 'Tous',
  to_signature: 'A imprimer',
  in_signature: 'En signature',
  returned: 'Retour signe',
  legacy_signed: 'Ancien signe',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Delivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

type SortKey = 'newest' | 'oldest' | 'waiting';

const BUCKET_SEQUENCE: Array<CourrierTaskBucket | 'all'> = [
  'to_signature',
  'in_signature',
  'returned',
  'legacy_signed',
  'all',
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function waitingReferenceDate(task: CourrierTask): string {
  return task.signatureSentAt ?? task.depositedAt;
}

function daysBetween(from: string | null | undefined, to = new Date()): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.round((to.getTime() - start) / 86_400_000));
}

function waitingLabel(task: CourrierTask): string {
  const days = daysBetween(waitingReferenceDate(task));
  if (days === null) return '-';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

function statusClass(bucket: CourrierTaskBucket): string {
  if (bucket === 'to_signature') return 'bg-anac-info/10 text-anac-info border-anac-info/20';
  if (bucket === 'in_signature') return 'bg-anac-warning/10 text-anac-warning border-anac-warning/20';
  if (bucket === 'returned') return 'bg-anac-success/10 text-anac-success border-anac-success/20';
  return 'bg-anac-muted/10 text-anac-muted border-anac-border';
}

function statusIcon(bucket: CourrierTaskBucket) {
  if (bucket === 'to_signature') return Printer;
  if (bucket === 'in_signature') return FileSignature;
  if (bucket === 'returned') return FileCheck2;
  return Inbox;
}

function nextActionLabel(task: CourrierTask): string {
  if (task.bucket === 'to_signature') return 'Imprimer puis mettre en signature';
  if (task.bucket === 'in_signature') return 'Scanner le retour signe';
  if (task.bucket === 'returned') return 'Transmis a la DN';
  return 'Consultation historique';
}

function currentDocumentLabel(task: CourrierTask): string {
  if (task.bucket === 'to_signature') return 'Document source a imprimer';
  if (task.bucket === 'in_signature') return 'Courrier actuellement en signature';
  if (task.bucket === 'returned') return 'Retour signe scanne';
  return 'Document archive';
}

function dossierPath(task: CourrierTask): string {
  if (task.source === 'formal_request_letter') return `/demandes/${task.requestId}/phase-formelle`;
  return `/demandes/${task.requestId}/phase-preliminaire`;
}

function averageWaitingDays(tasks: CourrierTask[]): string {
  const values = tasks
    .filter((task) => task.bucket === 'in_signature')
    .map((task) => daysBetween(task.signatureSentAt))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return '-';
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${avg.toFixed(avg >= 10 ? 0 : 1)} j`;
}

function canOperateCourrier(roles: string[] | undefined): boolean {
  return ['reception', 'assistant_dg', 'SU'].some((role) => roles?.includes(role));
}

function canViewDossier(roles: string[] | undefined): boolean {
  return ['dn_agent', 'dn_supervisor', 'SU'].some((role) => roles?.includes(role));
}

export default function CourrierTasksPage() {
  const { user } = useAuth();
  const canOperate = canOperateCourrier(user?.roles);
  const dossierVisible = canViewDossier(user?.roles);
  const [tasks, setTasks] = useState<CourrierTask[]>([]);
  const [counts, setCounts] = useState({
    toSignature: 0,
    inSignature: 0,
    returned: 0,
    legacySigned: 0,
  });
  const [bucket, setBucket] = useState<CourrierTaskBucket | 'all'>('to_signature');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('waiting');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printTask, setPrintTask] = useState<CourrierTask | null>(null);
  const [previewTask, setPreviewTask] = useState<CourrierTask | null>(null);
  const [returnTask, setReturnTask] = useState<CourrierTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCourrierTasks();
      setTasks(data.items);
      setCounts(data.counts);
      if (selectedId && !data.items.some((task) => task.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les courriers.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks
      .filter((task) => bucket === 'all' || task.bucket === bucket)
      .filter((task) => {
        if (!normalizedQuery) return true;
        const haystack = [
          task.requestReference,
          task.organisationName,
          task.applicantName,
          SOURCE_LABELS[task.source],
          REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === 'oldest') {
          return new Date(a.depositedAt).getTime() - new Date(b.depositedAt).getTime();
        }
        if (sort === 'waiting') {
          return (
            new Date(waitingReferenceDate(a)).getTime() -
            new Date(waitingReferenceDate(b)).getTime()
          );
        }
        return new Date(b.depositedAt).getTime() - new Date(a.depositedAt).getTime();
      });
  }, [bucket, query, sort, tasks]);

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? null,
    [filteredTasks, selectedId]
  );

  useEffect(() => {
    if (filteredTasks.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredTasks.some((task) => task.id === selectedId)) {
      setSelectedId(filteredTasks[0].id);
    }
  }, [filteredTasks, selectedId]);

  async function handleConfirmPrinted(task: CourrierTask) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await confirmCourrierPrinted(task.id);
      setPrintTask(null);
      await loadTasks();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Confirmation impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReturnSigned() {
    if (!returnTask || !returnFile) {
      setActionError('Selectionnez le document signe.');
      return;
    }
    setActionError(null);
    setBusyId(returnTask.id);
    try {
      const formData = new FormData();
      formData.append('file', returnFile);
      const { data: uploaded } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await returnSignedCourrier(
        returnTask.id,
        uploaded.fileUrl,
        uploaded.mimeType,
        uploaded.id
      );
      setReturnTask(null);
      setReturnFile(null);
      await loadTasks();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Retour signe impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1480px] space-y-5 px-6 py-6">
        <CourrierHeader />

        {error && <p className="rounded border border-anac-danger/20 bg-anac-danger/5 p-3 text-sm text-anac-danger">{error}</p>}
        {actionError && (
          <p className="rounded border border-anac-danger/20 bg-anac-danger/5 p-3 text-sm text-anac-danger">{actionError}</p>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CourrierMetricCard
            label="A imprimer"
            value={counts.toSignature}
            helper="Courriers deposes a ouvrir et confirmer"
            icon={Printer}
            tone="blue"
          />
          <CourrierMetricCard
            label="En signature"
            value={counts.inSignature}
            helper="Retours DG attendus"
            icon={Clock3}
            tone="warning"
          />
          <CourrierMetricCard
            label="Retours signes"
            value={counts.returned}
            helper="Prets pour traitement DN"
            icon={CheckCircle2}
            tone="success"
          />
          <CourrierMetricCard
            label="Delai moyen"
            value={averageWaitingDays(tasks)}
            helper="Courriers actuellement en signature"
            icon={CalendarClock}
            tone="purple"
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
          <CourrierBucketTabs
            value={bucket}
            counts={counts}
            total={tasks.length}
            onChange={setBucket}
          />

          <div className="grid min-h-[620px] lg:grid-cols-[minmax(0,1fr)_460px]">
            <div className="min-w-0 border-b border-anac-border lg:border-b-0 lg:border-r">
              <CourrierToolbar
                query={query}
                sort={sort}
                onQueryChange={setQuery}
                onSortChange={setSort}
              />
              <CourrierTaskTable
                tasks={filteredTasks}
                selectedId={selectedTask?.id ?? null}
                loading={loading}
                onSelect={setSelectedId}
              />
            </div>

            <CourrierDetailPanel
              task={selectedTask}
              busy={busyId === selectedTask?.id}
              canOperate={canOperate}
              canViewDossier={dossierVisible}
              onCloseSelection={() => setSelectedId(null)}
              onPrint={(task) => setPrintTask(task)}
              onPreview={(task) => setPreviewTask(task)}
              onReturn={(task) => {
                setReturnTask(task);
                setReturnFile(null);
              }}
            />
          </div>
        </section>

        <DocumentViewer
          file={
            (printTask ?? previewTask)?.fileUrl
              ? {
                  title: `${SOURCE_LABELS[(printTask ?? previewTask)!.source]} ${
                    (printTask ?? previewTask)!.requestReference
                  }`,
                  url: (printTask ?? previewTask)!.fileUrl!,
                }
              : null
          }
          onClose={() => {
            setPrintTask(null);
            setPreviewTask(null);
          }}
          primaryActionLabel={
            printTask
              ? busyId === printTask.id
                ? 'Confirmation...'
                : 'Impression OK - mettre en signature'
              : undefined
          }
          primaryActionDisabled={!printTask || busyId !== null || !canOperate}
          actionHint={
            printTask
              ? 'Imprimez le document, verifiez le contenu, puis confirmez sa mise en signature.'
              : 'Previsualisation integree du document courant.'
          }
          onPrimaryAction={() => printTask && handleConfirmPrinted(printTask)}
        />

        {returnTask && (
          <ReturnSignedModal
            task={returnTask}
            file={returnFile}
            busy={busyId === returnTask.id}
            onFileChange={setReturnFile}
            onClose={() => {
              setReturnTask(null);
              setReturnFile(null);
            }}
            onSubmit={handleReturnSigned}
          />
        )}
      </main>
    </div>
  );
}

function CourrierHeader() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">
          Courriers officiels - Circuit signature
        </h1>
        <p className="mt-1 text-sm text-anac-muted">
          Suivez les courriers emis, leur mise en signature et le retour scanne vers la DN.
        </p>
      </div>
    </header>
  );
}

function CourrierMetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: React.ElementType;
  tone: 'blue' | 'warning' | 'success' | 'purple';
}) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-anac-blue',
    warning: 'border-orange-100 bg-orange-50 text-anac-warning',
    success: 'border-green-100 bg-green-50 text-anac-success',
    purple: 'border-violet-100 bg-violet-50 text-violet-700',
  }[tone];

  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2.5', toneClass)}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{helper}</p>
    </section>
  );
}

function CourrierBucketTabs({
  value,
  counts,
  total,
  onChange,
}: {
  value: CourrierTaskBucket | 'all';
  counts: {
    toSignature: number;
    inSignature: number;
    returned: number;
    legacySigned: number;
  };
  total: number;
  onChange: (value: CourrierTaskBucket | 'all') => void;
}) {
  const countFor = {
    all: total,
    to_signature: counts.toSignature,
    in_signature: counts.inSignature,
    returned: counts.returned,
    legacy_signed: counts.legacySigned,
  };

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-anac-border px-4 pt-3">
      {BUCKET_SEQUENCE.map((bucket) => (
        <button
          key={bucket}
          type="button"
          onClick={() => onChange(bucket)}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
            value === bucket
              ? 'border-anac-blue text-anac-blue'
              : 'border-transparent text-anac-muted hover:text-anac-navy'
          )}
        >
          {BUCKET_LABELS[bucket]}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              value === bucket ? 'bg-anac-blue text-white' : 'bg-anac-gray text-anac-muted'
            )}
          >
            {countFor[bucket]}
          </span>
        </button>
      ))}
    </div>
  );
}

function CourrierToolbar({
  query,
  sort,
  onQueryChange,
  onSortChange,
}: {
  query: string;
  sort: SortKey;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-anac-border p-4 md:flex-row md:items-center md:justify-between">
      <label className="relative min-w-0 flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
          aria-hidden="true"
        />
        <span className="sr-only">Rechercher un courrier</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher un courrier, dossier, postulant..."
          className="h-10 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm text-anac-navy outline-none transition focus:border-anac-sky focus:ring-2 focus:ring-anac-sky/30"
        />
      </label>
      <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-anac-border bg-white px-3 text-sm text-anac-navy">
        <ArrowDownAZ size={15} className="text-anac-muted" aria-hidden="true" />
        <span className="sr-only">Trier</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          className="bg-transparent text-sm font-medium outline-none"
        >
          <option value="waiting">Attente la plus longue</option>
          <option value="newest">Plus recents</option>
          <option value="oldest">Plus anciens</option>
        </select>
      </label>
    </div>
  );
}

function CourrierTaskTable({
  tasks,
  selectedId,
  loading,
  onSelect,
}: {
  tasks: CourrierTask[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return <CourrierEmptyState icon={Inbox} title="Chargement des courriers" />;
  }

  if (tasks.length === 0) {
    return (
      <CourrierEmptyState
        icon={CheckCircle2}
        title="Aucun courrier dans cette vue"
        description="Les courriers reapparaitront ici des qu'une action sera attendue."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-anac-border bg-anac-gray/60 text-[11px] uppercase tracking-wide text-anac-muted">
            <th className="px-4 py-3 font-semibold">Reference dossier</th>
            <th className="px-4 py-3 font-semibold">Demandeur</th>
            <th className="px-4 py-3 font-semibold">Type de courrier</th>
            <th className="px-4 py-3 font-semibold">Depot</th>
            <th className="px-4 py-3 font-semibold">Attente</th>
            <th className="px-4 py-3 font-semibold">Statut circuit</th>
            <th className="px-4 py-3 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const selected = task.id === selectedId;
            const StatusIcon = statusIcon(task.bucket);
            return (
              <tr
                key={task.id}
                className={cn(
                  'cursor-pointer border-b border-anac-border/70 text-sm transition-colors hover:bg-anac-blue/5',
                  selected && 'bg-anac-blue/5 outline outline-1 -outline-offset-1 outline-anac-blue'
                )}
                onClick={() => onSelect(task.id)}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(task.id)}
                    className="text-left font-semibold text-anac-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
                  >
                    {task.requestReference}
                  </button>
                </td>
                <td className="max-w-[190px] px-4 py-3">
                  <p className="truncate font-medium text-anac-navy">{task.organisationName}</p>
                  <p className="truncate text-xs text-anac-muted">{task.applicantName}</p>
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <p className="truncate text-anac-navy">{SOURCE_LABELS[task.source]}</p>
                  <p className="truncate text-xs text-anac-muted">
                    {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
                  </p>
                </td>
                <td className="px-4 py-3 text-anac-muted">{formatDate(task.depositedAt)}</td>
                <td className="px-4 py-3 text-anac-muted">{waitingLabel(task)}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold',
                      statusClass(task.bucket)
                    )}
                  >
                    <StatusIcon size={12} aria-hidden="true" />
                    {BUCKET_LABELS[task.bucket]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-medium text-anac-blue">
                  {nextActionLabel(task)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CourrierDetailPanel({
  task,
  busy,
  canOperate,
  canViewDossier,
  onCloseSelection,
  onPrint,
  onPreview,
  onReturn,
}: {
  task: CourrierTask | null;
  busy: boolean;
  canOperate: boolean;
  canViewDossier: boolean;
  onCloseSelection: () => void;
  onPrint: (task: CourrierTask) => void;
  onPreview: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (!task) {
    return (
      <aside className="grid min-h-[420px] place-items-center p-6">
        <CourrierEmptyState
          icon={FileText}
          title="Selectionnez un courrier"
          description="Le detail du circuit, les documents et les actions apparaitront ici."
        />
      </aside>
    );
  }

  return (
    <aside className="min-w-0 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-anac-border p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded border border-anac-border px-2 py-0.5 text-xs text-anac-navy">
              {task.requestReference}
            </span>
            <StatusBadge bucket={task.bucket} />
          </div>
          <h2 className="text-lg font-semibold leading-tight text-anac-navy">
            {SOURCE_LABELS[task.source]}
          </h2>
          <p className="mt-1 text-sm text-anac-muted">par {task.organisationName}</p>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded text-anac-muted hover:bg-anac-gray hover:text-anac-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
          onClick={onCloseSelection}
          aria-label="Fermer le detail"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <CourrierActionPanel
          task={task}
          busy={busy}
          canOperate={canOperate}
          onPrint={onPrint}
          onReturn={onReturn}
        />

        <CourrierDocumentPanel task={task} onPreview={onPreview} />

        <section className="grid gap-4 rounded-lg border border-anac-border bg-white p-4 md:grid-cols-2">
          <CourrierTimeline task={task} />
          <CourrierInfo task={task} />
        </section>

        <section className="rounded-lg border border-anac-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-anac-navy">Actions rapides</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {canViewDossier ? (
              <Link
                to={dossierPath(task)}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'justify-start gap-2')}
              >
                <ChevronRight size={14} aria-hidden="true" />
                Voir le dossier
              </Link>
            ) : (
              <div className="rounded-lg border border-anac-border bg-anac-gray px-3 py-2 text-xs text-anac-muted">
                Dossier reserve a la DN / SU.
              </div>
            )}
            {task.fileUrl ? (
              <button
                type="button"
                onClick={() => onPreview(task)}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'justify-start gap-2')}
              >
                <Eye size={14} aria-hidden="true" />
                Ouvrir document
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}

function CourrierActionPanel({
  task,
  busy,
  canOperate,
  onPrint,
  onReturn,
}: {
  task: CourrierTask;
  busy: boolean;
  canOperate: boolean;
  onPrint: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (task.bucket === 'to_signature') {
    return (
      <section className="rounded-lg border border-anac-info/20 bg-anac-info/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
              <Printer size={16} className="text-anac-info" aria-hidden="true" />
              Impression et mise en signature
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-anac-muted">
              Ouvrez le courrier, imprimez-le, puis confirmez seulement lorsque le document est
              place dans le circuit signature.
            </p>
          </div>
          <Button
            size="sm"
            disabled={busy || !task.fileUrl || !canOperate}
            onClick={() => onPrint(task)}
          >
            <Printer size={14} aria-hidden="true" />
            Ouvrir / imprimer
          </Button>
        </div>
        {!canOperate ? (
          <p className="mt-3 text-xs font-medium text-anac-muted">
            Consultation seule: action reservee a la reception / assistant DG.
          </p>
        ) : null}
      </section>
    );
  }

  if (task.bucket === 'in_signature') {
    return (
      <section className="rounded-lg border border-anac-warning/20 bg-anac-warning/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
              <FileSignature size={16} className="text-anac-warning" aria-hidden="true" />
              Retour DG attendu
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-anac-muted">
              Le courrier est en signature depuis {waitingLabel(task)}. Scannez le retour signe
              des qu'il revient.
            </p>
          </div>
          <Button size="sm" disabled={busy || !canOperate} onClick={() => onReturn(task)}>
            <FileUp size={14} aria-hidden="true" />
            Scanner retour signe
          </Button>
        </div>
        {!canOperate ? (
          <p className="mt-3 text-xs font-medium text-anac-muted">
            Consultation seule: action reservee a la reception / assistant DG.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-anac-success/20 bg-anac-success/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <CheckCircle2 size={16} className="text-anac-success" aria-hidden="true" />
        Circuit pret pour la DN
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-anac-muted">
        Le retour signe a ete enregistre. Le dossier peut continuer dans le workflow DN.
      </p>
    </section>
  );
}

function CourrierDocumentPanel({
  task,
  onPreview,
}: {
  task: CourrierTask;
  onPreview: (task: CourrierTask) => void;
}) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4">
      <div className="grid items-center gap-4 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
        <div className="grid h-16 w-16 place-items-center rounded-lg bg-anac-gray text-anac-blue">
          <FileText size={26} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-anac-navy">{currentDocumentLabel(task)}</h3>
          <p className="mt-1 text-xs text-anac-muted">
            {task.fileUrl
              ? 'Le document courant est disponible pour consultation.'
              : 'Aucun fichier courant disponible pour ce courrier.'}
          </p>
        </div>
        {task.fileUrl ? (
          <button
            type="button"
            onClick={() => onPreview(task)}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
          >
            <Eye size={14} aria-hidden="true" />
            Voir
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CourrierTimeline({ task }: { task: CourrierTask }) {
  const steps = [
    {
      label: 'Depose',
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
    {
      label: 'Retour scanne',
      date: task.pendingReviewAt ?? task.signedAt,
      done: !!(task.pendingReviewAt ?? task.signedAt),
      current: task.bucket === 'returned',
    },
    {
      label: 'Transmis DN',
      date: task.pendingReviewAt,
      done: task.bucket === 'returned' || task.bucket === 'legacy_signed',
      current: false,
    },
  ];

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-anac-navy">Circuit actuel</h3>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.label} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border text-[10px]',
                step.done
                  ? 'border-anac-success bg-anac-success text-white'
                  : step.current
                    ? 'border-anac-blue bg-anac-blue text-white'
                    : 'border-anac-border bg-white text-anac-muted'
              )}
            >
              {step.done ? <CheckCircle2 size={12} aria-hidden="true" /> : step.current ? '•' : ''}
            </span>
            <div>
              <p className="text-xs font-semibold text-anac-navy">{step.label}</p>
              <p className="text-[11px] text-anac-muted">{formatDateTime(step.date)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CourrierInfo({ task }: { task: CourrierTask }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-anac-navy">Informations cles</h3>
      <dl className="space-y-3">
        <Info label="Type de courrier" value={SOURCE_LABELS[task.source]} />
        <Info label="Nature de demande" value={REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType} />
        <Info label="Reference dossier" value={task.requestReference} />
        <Info label="Demandeur" value={task.organisationName} />
        <Info label="Postulant" value={task.applicantName} />
      </dl>
    </div>
  );
}

function StatusBadge({ bucket }: { bucket: CourrierTaskBucket }) {
  const Icon = statusIcon(bucket);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold',
        statusClass(bucket)
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {BUCKET_LABELS[bucket]}
    </span>
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

function CourrierEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center p-6 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg border border-anac-border bg-white text-anac-muted">
          <Icon size={18} aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-anac-navy">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-xs text-anac-muted">{description}</p> : null}
      </div>
    </div>
  );
}

function ReturnSignedModal({
  task,
  file,
  busy,
  onFileChange,
  onClose,
  onSubmit,
}: {
  task: CourrierTask;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-anac-navy">Scanner le retour signe</h2>
            <p className="mt-1 text-xs text-anac-muted">
              {SOURCE_LABELS[task.source]} - {task.requestReference}
            </p>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded text-anac-muted hover:bg-anac-gray hover:text-anac-navy"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          <label className="label">Document signe</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          {file ? <p className="text-xs text-anac-muted">{file.name}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer le retour'}
          </Button>
        </div>
      </div>
    </div>
  );
}
