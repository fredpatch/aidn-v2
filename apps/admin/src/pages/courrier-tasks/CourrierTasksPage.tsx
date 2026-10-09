import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownAZ, Search, Send } from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { BucketTabs } from '../../components/common/BucketTabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { useAuth } from '../../hooks/useAuth';
import {
  confirmCourrierPrinted,
  fetchCourrierTasks,
  returnSignedCourrier,
  type CourrierTask,
} from '../../lib/api/courrier-tasks';
import { apiErrorMessage } from '../../lib/axios';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { uploadFile } from '../../lib/uploads';
import { CourrierReadingPane } from './CourrierReadingPane';
import { CourriersList } from './CourriersList';
import {
  COURRIER_SORT_OPTIONS,
  COURRIER_TABS,
  SOURCE_LABELS,
  averageSignatureWait,
  countTabs,
  courrierActionKind,
  defaultSortFor,
  filterCourriers,
  groupCourriersByDay,
  type CourrierSortKey,
  type CourrierTab,
} from './courrierBuckets';

function canOperateCourrier(roles: string[] | undefined): boolean {
  return ['reception', 'assistant_dg', 'SU'].some((role) => roles?.includes(role));
}

function canViewDossier(roles: string[] | undefined): boolean {
  return ['dn_agent', 'dn_supervisor', 'SU'].some((role) => roles?.includes(role));
}

/**
 * C2b - Courriers à traiter, two panes (Outlook-inspired, same frame as D1
 * Demandes): circuit tabs and a list grouped by the day of the current step
 * on the left, the reading pane on the right. Rules in courrierBuckets.ts;
 * the selected courrier is kept in `?id=`.
 *
 * Circuit actions are unchanged: « Ouvrir / imprimer » opens the viewer
 * whose « Impression OK - mettre en signature » confirms; « Scanner le retour
 * signé » opens the upload modal. Entrée in the list only focuses them.
 */
export default function CourrierTasksPage() {
  const { user } = useAuth();
  const canOperate = canOperateCourrier(user?.roles);
  const dossierVisible = canViewDossier(user?.roles);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<CourrierTask[]>([]);
  const [signatureAlertDays, setSignatureAlertDays] = useState<number | null>(null);
  const [tab, setTab] = useState<CourrierTab>('to_signature');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CourrierSortKey>(defaultSortFor('to_signature'));
  const [printTask, setPrintTask] = useState<CourrierTask | null>(null);
  const [previewTask, setPreviewTask] = useState<CourrierTask | null>(null);
  const [returnTask, setReturnTask] = useState<CourrierTask | null>(null);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCourrierTasks();
      setTasks(data.items);
      setSignatureAlertDays(data.signatureAlertDays ?? null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les courriers.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const counts = useMemo(() => countTabs(tasks), [tasks]);
  const averageWait = useMemo(() => averageSignatureWait(tasks), [tasks]);
  const filtered = useMemo(
    () => filterCourriers(tasks, { tab, search, sort }),
    [tasks, tab, search, sort]
  );
  const groups = useMemo(() => groupCourriersByDay(filtered), [filtered]);

  // Never show a courrier that is not in the current list: fall back to the
  // first visible row, or to the empty state.
  const requestedId = searchParams.get('id');
  const selected = filtered.find((task) => task.id === requestedId) ?? filtered[0] ?? null;

  function changeTab(value: CourrierTab) {
    setTab(value);
    setSort(defaultSortFor(value));
  }

  function select(task: CourrierTask) {
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

  /** Entrée on a row: every circuit action changes a state, so Entrée only
   *  focuses its button (the user still confirms); else « Voir le document ». */
  function activate(task: CourrierTask) {
    const button = actionButtonRef.current;
    if (courrierActionKind(task) !== 'none' && button && !button.disabled) button.focus();
    else previewButtonRef.current?.focus();
  }

  function handlePageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      return;
    event.preventDefault();
    searchRef.current?.focus();
  }

  async function handleConfirmPrinted(task: CourrierTask) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await confirmCourrierPrinted(task.id);
      setPrintTask(null);
      await loadTasks();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Confirmation impossible.'));
      // K7c - dossier closed meanwhile: reload so the task shows it, no action.
      if (isDossierClosedError(err)) {
        setPrintTask(null);
        await loadTasks();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleReturnSigned() {
    if (!returnTask || !returnFile) {
      setActionError('Sélectionnez le document signé.');
      return;
    }
    setActionError(null);
    setBusyId(returnTask.id);
    try {
      const uploaded = await uploadFile(returnFile);
      await returnSignedCourrier(returnTask.id, uploaded.uploadAssetId);
      setReturnTask(null);
      setReturnFile(null);
      await loadTasks();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Retour signé impossible.'));
      if (isDossierClosedError(err)) {
        setReturnTask(null);
        setReturnFile(null);
        await loadTasks();
      }
    } finally {
      setBusyId(null);
    }
  }

  const viewerTask = printTask ?? previewTask;

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text" onKeyDown={handlePageKeyDown}>
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="mr-auto">
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilité</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-anac-navy">
              Courriers - circuit signature
            </h1>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Synthèse">
            <StatusBadge
              label={`${counts.to_signature} à imprimer`}
              tone="border-blue-100 bg-blue-50 text-anac-blue"
            />
            <StatusBadge
              label={`${counts.in_signature} en signature${
                averageWait ? ` · délai moyen ${averageWait}` : ''
              }`}
              tone="border-orange-100 bg-orange-50 text-anac-warning"
            />
            <StatusBadge
              label={`${counts.returned} retour(s) signé(s)`}
              tone="border-green-100 bg-green-50 text-anac-success"
            />
          </div>
          <label className="relative block w-full sm:w-[340px]">
            <span className="sr-only">Rechercher un courrier</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              placeholder="Référence, organisation, postulant, type..."
            />
          </label>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger"
          >
            {error}
          </div>
        ) : null}
        {actionError ? (
          <div
            role="alert"
            className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger"
          >
            {actionError}
          </div>
        ) : null}

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
            <BucketTabs
              size="compact"
              value={tab}
              items={COURRIER_TABS.map((t) => ({
                key: t.key,
                label: t.label,
                count: counts[t.key],
              }))}
              onChange={changeTab}
            />
            <div className="flex items-center justify-between gap-3 border-b border-anac-border px-4 py-2">
              <Select value={sort} onValueChange={(value) => setSort(value as CourrierSortKey)}>
                <SelectTrigger
                  aria-label="Trier les courriers"
                  className="h-8 w-[200px] gap-2 text-xs font-semibold text-anac-navy"
                >
                  <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURRIER_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-anac-muted">Regroupé par date d&apos;étape</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CourriersList
                groups={groups}
                selectedId={selected?.id ?? null}
                loading={loading}
                error={!!error}
                onSelect={select}
                onActivate={activate}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-anac-border bg-anac-gray/50 px-4 py-2 text-[11px] text-anac-muted">
              <span>
                <span className="font-semibold text-anac-navy">{filtered.length}</span> courrier
                {filtered.length > 1 ? 's' : ''}
              </span>
              <span className="ml-auto hidden md:inline">
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> naviguer · <Kbd>Entrée</Kbd> action · <Kbd>/</Kbd>{' '}
                rechercher
              </span>
            </div>
          </div>

          <CourrierReadingPane
            task={selected}
            busy={busyId !== null && busyId === selected?.id}
            canOperate={canOperate}
            canViewDossier={dossierVisible}
            signatureAlertDays={signatureAlertDays}
            actionButtonRef={actionButtonRef}
            previewButtonRef={previewButtonRef}
            onPrint={(task) => setPrintTask(task)}
            onPreview={(task) => setPreviewTask(task)}
            onReturn={(task) => {
              setReturnTask(task);
              setReturnFile(null);
            }}
          />
        </section>

        <DocumentViewer
          file={
            viewerTask?.fileUrl
              ? {
                  title: `${SOURCE_LABELS[viewerTask.source] ?? viewerTask.source} ${
                    viewerTask.requestReference
                  }`,
                  url: viewerTask.fileUrl,
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
              ? 'Imprimez le document, vérifiez le contenu, puis confirmez sa mise en signature.'
              : 'Prévisualisation intégrée du document courant.'
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

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-b-2 border-anac-border bg-white px-1 font-mono text-[10px] text-anac-text/80">
      {children}
    </kbd>
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
    <Modal
      title="Scanner le retour signé"
      subtitle={`${SOURCE_LABELS[task.source] ?? task.source} - ${task.requestReference}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer le retour'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="label">Document signé</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          disabled={busy}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        {file ? <p className="text-xs text-anac-muted">{file.name}</p> : null}
      </div>
    </Modal>
  );
}
