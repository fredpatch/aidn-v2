import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileSignature, FileUp, Inbox, Printer } from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { api, apiErrorMessage } from '../../lib/axios';
import {
  confirmCourrierPrinted,
  fetchCourrierTasks,
  returnSignedCourrier,
  type CourrierTask,
  type CourrierTaskBucket,
} from '../../lib/api/courrier-tasks';

const SOURCE_LABELS: Record<string, string> = {
  intake_request: 'Demande initiale',
  formal_request_letter: 'Lettre formelle',
};

const BUCKET_LABELS: Record<CourrierTaskBucket | 'all', string> = {
  all: 'Tous',
  to_signature: 'A imprimer',
  in_signature: 'En signature',
  returned: 'Retour signe',
  legacy_signed: 'Ancien statut signe',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  recognition: 'Reconnaissance',
  issuance: 'Delivrance',
  modification: 'Modification',
  renewal: 'Renouvellement',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function statusClass(bucket: CourrierTaskBucket): string {
  if (bucket === 'to_signature') return 'bg-anac-info/10 text-anac-info';
  if (bucket === 'in_signature') return 'bg-anac-warning/10 text-anac-warning';
  if (bucket === 'returned') return 'bg-anac-success/10 text-anac-success';
  return 'bg-anac-muted/10 text-anac-muted';
}

export default function CourrierTasksPage() {
  const [tasks, setTasks] = useState<CourrierTask[]>([]);
  const [counts, setCounts] = useState({
    toSignature: 0,
    inSignature: 0,
    returned: 0,
    legacySigned: 0,
  });
  const [bucket, setBucket] = useState<CourrierTaskBucket | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printTask, setPrintTask] = useState<CourrierTask | null>(null);
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
      const data = await fetchCourrierTasks(bucket === 'all' ? undefined : { bucket });
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
  }, [bucket]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null,
    [tasks, selectedId]
  );

  useEffect(() => {
    if (!selectedId && tasks[0]) setSelectedId(tasks[0].id);
  }, [selectedId, tasks]);

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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-anac-navy">Courriers a traiter</h1>
          <p className="text-sm text-anac-muted">
            Impression, mise en signature et scan des retours signes.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-anac-danger">{error}</p>}
      {actionError && <p className="text-sm text-anac-danger">{actionError}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="A imprimer" value={counts.toSignature} icon={Printer} />
        <Counter label="En signature" value={counts.inSignature} icon={FileSignature} />
        <Counter label="Retour signe" value={counts.returned} icon={FileCheck2} />
        <Counter label="Ancien signe" value={counts.legacySigned} icon={Inbox} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'to_signature', 'in_signature', 'returned', 'legacy_signed'] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBucket(value)}
              className={`rounded border px-3 py-1.5 text-xs font-medium ${
                bucket === value
                  ? 'border-anac-navy bg-anac-navy text-white'
                  : 'border-anac-border bg-white text-anac-navy hover:bg-anac-gray'
              }`}
            >
              {BUCKET_LABELS[value]}
            </button>
          )
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          {loading ? (
            <div className="card text-sm text-anac-muted">Chargement...</div>
          ) : tasks.length === 0 ? (
            <div className="card text-sm text-anac-muted">Aucun courrier dans cette vue.</div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedId(task.id)}
                className={`w-full rounded-lg border bg-white p-3 text-left transition-colors hover:bg-anac-gray ${
                  selectedTask?.id === task.id ? 'border-anac-navy ring-1 ring-anac-navy' : 'border-anac-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-anac-navy">
                      {task.requestReference}
                    </p>
                    <p className="truncate text-xs text-anac-muted">{task.organisationName}</p>
                    <p className="mt-1 text-xs text-anac-muted">
                      {SOURCE_LABELS[task.source]} - {REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusClass(task.bucket)}`}>
                    {BUCKET_LABELS[task.bucket]}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <TaskDetail
          task={selectedTask}
          busy={busyId === selectedTask?.id}
          onPrint={(task) => setPrintTask(task)}
          onReturn={(task) => {
            setReturnTask(task);
            setReturnFile(null);
          }}
        />
      </div>

      <DocumentViewer
        file={
          printTask?.fileUrl
            ? {
                title: `${SOURCE_LABELS[printTask.source]} ${printTask.requestReference}`,
                url: printTask.fileUrl,
              }
            : null
        }
        onClose={() => setPrintTask(null)}
        primaryActionLabel={busyId === printTask?.id ? 'Confirmation...' : 'Impression OK - mettre en signature'}
        primaryActionDisabled={!printTask || busyId !== null}
        actionHint="Imprimez le document, verifiez le contenu, puis confirmez sa mise en signature."
        onPrimaryAction={() => printTask && handleConfirmPrinted(printTask)}
      />

      {returnTask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-anac-navy">Scanner le retour signe</h2>
            <p className="mt-1 text-xs text-anac-muted">
              {SOURCE_LABELS[returnTask.source]} {returnTask.requestReference}
            </p>
            <div className="mt-4 space-y-2">
              <label className="label">Document signe</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                disabled={busyId === returnTask.id}
                onChange={(event) => setReturnFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busyId === returnTask.id}
                onClick={() => {
                  setReturnTask(null);
                  setReturnFile(null);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!returnFile || busyId === returnTask.id}
                onClick={handleReturnSigned}
              >
                {busyId === returnTask.id ? 'Enregistrement...' : 'Enregistrer le retour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Counter({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-anac-border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-anac-muted">{label}</p>
        <Icon size={16} className="text-anac-navy" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-anac-navy">{value}</p>
    </div>
  );
}

function TaskDetail({
  task,
  busy,
  onPrint,
  onReturn,
}: {
  task: CourrierTask | null;
  busy: boolean;
  onPrint: (task: CourrierTask) => void;
  onReturn: (task: CourrierTask) => void;
}) {
  if (!task) {
    return <div className="card text-sm text-anac-muted">Selectionnez un courrier.</div>;
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-anac-border px-2 py-0.5 text-xs text-anac-navy">
            {SOURCE_LABELS[task.source]}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(task.bucket)}`}>
            {BUCKET_LABELS[task.bucket]}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-anac-navy">{task.requestReference}</h2>
        <p className="text-sm text-anac-muted">{task.organisationName}</p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Postulant" value={task.applicantName} />
        <Info label="Type" value={REQUEST_TYPE_LABELS[task.requestType] ?? task.requestType} />
        <Info label="Depot" value={formatDateTime(task.depositedAt)} />
        <Info label="Mise en signature" value={formatDateTime(task.signatureSentAt)} />
        <Info label="Retour signe" value={formatDateTime(task.pendingReviewAt ?? task.signedAt)} />
      </dl>

      <div className="rounded-lg border border-anac-border bg-anac-gray p-4">
        {task.bucket === 'to_signature' ? (
          <div className="space-y-3">
            <p className="text-sm text-anac-muted">
              Ouvrez le document, imprimez-le, puis confirmez sa mise en signature.
            </p>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={busy || !task.fileUrl}
              onClick={() => onPrint(task)}
            >
              <Printer size={14} />
              Imprimer
            </button>
            {!task.fileUrl && (
              <p className="text-xs text-anac-danger">Aucun fichier courant disponible.</p>
            )}
          </div>
        ) : task.bucket === 'in_signature' ? (
          <div className="space-y-3">
            <p className="text-sm text-anac-muted">
              Le courrier est en signature. Scannez le retour signe des qu'il revient.
            </p>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={busy}
              onClick={() => onReturn(task)}
            >
              <FileUp size={14} />
              Scanner le retour signe
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-anac-success">
              Retour signe recu. Le service DN peut poursuivre le traitement.
            </p>
            {task.fileUrl && (
              <a href={task.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-anac-blue underline">
                Ouvrir le document courant
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-anac-muted">{label}</dt>
      <dd className="font-medium text-anac-navy">{value}</dd>
    </div>
  );
}
