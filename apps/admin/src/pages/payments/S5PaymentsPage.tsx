import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowDownAZ,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  FileText,
  FileUp,
  Search,
  Send,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button, buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Pagination, paginate } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { fetchDeepEvaluationPaymentQueue } from '../../lib/api/deep-evaluation.api';
import {
  rejectPayment as rejectDeepPayment,
  uploadInvoice as uploadDeepInvoice,
  validatePayment as validateDeepPayment,
} from '../../lib/api/deep-evaluation.api';
import { fetchSiteInspectionPaymentQueue } from '../../lib/api/site-inspection.api';
import {
  rejectPayment as rejectSitePayment,
  uploadInvoice as uploadSiteInvoice,
  validatePayment as validateSitePayment,
} from '../../lib/api/site-inspection.api';
import { fetchCertificatesPaymentQueue } from '../../lib/api/certificates.api';
import {
  rejectPayment as rejectCertificatePayment,
  uploadInvoice as uploadCertificateInvoice,
  validatePayment as validateCertificatePayment,
} from '../../lib/api/certificates.api';
import type { PaymentQueueItem as DeepPaymentQueueItem } from '../../lib/api/deep-evaluation.types';
import type { PaymentQueueItem as SitePaymentQueueItem } from '../../lib/api/site-inspection.types';
import type { PaymentQueueItem as CertificatePaymentQueueItem } from '../../lib/api/certificates.types';
import { api, apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';

type S5PaymentQueueItem = (
  | DeepPaymentQueueItem
  | SitePaymentQueueItem
  | CertificatePaymentQueueItem
) & {
  phaseCode: 'M5' | 'M6' | 'M7';
};

type PaymentBucket =
  | 'to_invoice'
  | 'waiting_proof'
  | 'proof_received'
  | 'validated'
  | 'rejected'
  | 'all';

const PAGE_SIZE = 20;

type SortKey = 'waiting' | 'newest' | 'oldest';

const STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'Facture a transmettre',
  awaiting_proof: 'Preuve attendue',
  pending_validation: 'Preuve a valider',
  validated: 'Paiement valide',
  rejected: 'Paiement rejete',
};

const NEXT_ACTION_LABELS: Record<S5PaymentQueueItem['nextAction'], string> = {
  send_invoice: 'Importer la facture transmise',
  waiting_for_proof: 'Attendre la preuve postulant',
  validate_payment: 'Valider ou rejeter la preuve',
  done: 'Paiement termine',
  rejected: 'Paiement a verifier',
};

const PHASE_LABELS: Record<S5PaymentQueueItem['phaseCode'], string> = {
  M5: 'Evaluation approfondie',
  M6: 'Demonstration / Inspection',
  M7: 'Delivrance',
};

const BUCKET_LABELS: Record<PaymentBucket, string> = {
  to_invoice: 'Facture a envoyer',
  waiting_proof: 'Preuve attendue',
  proof_received: 'Preuve recue',
  validated: 'Valides',
  rejected: 'Rejetes',
  all: 'Tous',
};

const BUCKET_SEQUENCE: PaymentBucket[] = [
  'to_invoice',
  'waiting_proof',
  'proof_received',
  'validated',
  'rejected',
  'all',
];

interface UploadedFile {
  fileUrl: string;
  mimeType: string;
  id?: number;
  uploadAssetId?: number;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function bucketForItem(item: S5PaymentQueueItem): PaymentBucket {
  if (item.payment.status === 'awaiting_invoice') return 'to_invoice';
  if (item.payment.status === 'awaiting_proof') return 'waiting_proof';
  if (item.payment.status === 'pending_validation') return 'proof_received';
  if (item.payment.status === 'validated') return 'validated';
  if (item.payment.status === 'rejected') return 'rejected';
  return 'all';
}

function statusClass(status: string): string {
  if (status === 'awaiting_invoice') return 'border-anac-info/20 bg-anac-info/10 text-anac-info';
  if (status === 'awaiting_proof') return 'border-anac-muted/20 bg-anac-muted/10 text-anac-muted';
  if (status === 'pending_validation') return 'border-anac-warning/20 bg-anac-warning/10 text-anac-warning';
  if (status === 'validated') return 'border-anac-success/20 bg-anac-success/10 text-anac-success';
  if (status === 'rejected') return 'border-anac-danger/20 bg-anac-danger/10 text-anac-danger';
  return 'border-anac-border bg-anac-gray text-anac-muted';
}

function statusIcon(status: string) {
  if (status === 'awaiting_invoice') return Send;
  if (status === 'pending_validation') return ShieldCheck;
  if (status === 'validated') return CheckCircle2;
  if (status === 'rejected') return XCircle;
  return Clock3;
}

function waitingReferenceDate(item: S5PaymentQueueItem): string {
  return (
    item.payment.proofUploadedAt ??
    item.payment.invoiceUploadedAt ??
    item.payment.validatedAt ??
    new Date(0).toISOString()
  );
}

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.round((Date.now() - start) / 86_400_000));
}

function waitingLabel(item: S5PaymentQueueItem): string {
  if (item.payment.status === 'awaiting_invoice') return 'facture attendue';
  const days = daysSince(waitingReferenceDate(item));
  if (days === null) return '-';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

function amountLabel(): string {
  return '-';
}

function phasePath(item: S5PaymentQueueItem): string {
  if (item.phaseCode === 'M5') return `/demandes/${item.requestId}/evaluation-approfondie`;
  if (item.phaseCode === 'M6') return `/demandes/${item.requestId}/demonstration-inspection`;
  return `/demandes/${item.requestId}/delivrance`;
}

async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async function uploadInvoiceForItem(item: S5PaymentQueueItem, uploaded: UploadedFile): Promise<void> {
  const uploadAssetId = uploaded.uploadAssetId ?? uploaded.id;
  if (item.phaseCode === 'M5') {
    await uploadDeepInvoice(item.phaseId, uploaded.fileUrl, uploaded.mimeType, uploadAssetId);
    return;
  }
  if (item.phaseCode === 'M6') {
    await uploadSiteInvoice(item.phaseId, uploaded.fileUrl, uploaded.mimeType, uploadAssetId);
    return;
  }
  await uploadCertificateInvoice(item.phaseId, uploaded.fileUrl, uploaded.mimeType, uploadAssetId);
}

async function validatePaymentForItem(item: S5PaymentQueueItem): Promise<void> {
  if (item.phaseCode === 'M5') {
    await validateDeepPayment(item.phaseId);
    return;
  }
  if (item.phaseCode === 'M6') {
    await validateSitePayment(item.phaseId);
    return;
  }
  await validateCertificatePayment(item.phaseId);
}

async function rejectPaymentForItem(
  item: S5PaymentQueueItem,
  rejectionAction: 'request_new_proof' | 'reject_dossier',
  rejectionReason: string
): Promise<void> {
  if (item.phaseCode === 'M5') {
    await rejectDeepPayment(item.phaseId, rejectionAction, rejectionReason);
    return;
  }
  if (item.phaseCode === 'M6') {
    await rejectSitePayment(item.phaseId, rejectionAction, rejectionReason);
    return;
  }
  await rejectCertificatePayment(item.phaseId, rejectionAction, rejectionReason);
}

export default function S5PaymentsPage() {
  const deepQueue = useQuery({
    queryKey: queryKeys.deepEvaluation.paymentQueue(),
    queryFn: fetchDeepEvaluationPaymentQueue,
  });
  const siteQueue = useQuery({
    queryKey: queryKeys.siteInspection.paymentQueue(),
    queryFn: fetchSiteInspectionPaymentQueue,
  });
  const certificateQueue = useQuery({
    queryKey: queryKeys.certificates.paymentQueue(),
    queryFn: fetchCertificatesPaymentQueue,
  });

  const data: S5PaymentQueueItem[] = [
    ...(deepQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M5' as const })),
    ...(siteQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M6' as const })),
    ...(certificateQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M7' as const })),
  ];
  const isLoading = deepQueue.isLoading || siteQueue.isLoading || certificateQueue.isLoading;
  const error = deepQueue.error || siteQueue.error || certificateQueue.error;

  const [bucket, setBucket] = useState<PaymentBucket>('to_invoice');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('waiting');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [invoiceTask, setInvoiceTask] = useState<S5PaymentQueueItem | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [rejectTask, setRejectTask] = useState<S5PaymentQueueItem | null>(null);
  const [previewFile, setPreviewFile] = useState<{ title: string; url: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  function updateBucket(value: PaymentBucket) {
    setBucket(value);
    setPage(1);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateSort(value: SortKey) {
    setSort(value);
    setPage(1);
  }

  const counts = useMemo(() => {
    const byBucket = data.reduce(
      (acc, item) => {
        const itemBucket = bucketForItem(item);
        if (itemBucket !== 'all') acc[itemBucket] += 1;
        return acc;
      },
      {
        to_invoice: 0,
        waiting_proof: 0,
        proof_received: 0,
        validated: 0,
        rejected: 0,
      }
    );
    return { ...byBucket, all: data.length };
  }, [data]);

  const filteredData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data
      .filter((item) => bucket === 'all' || bucketForItem(item) === bucket)
      .filter((item) => {
        if (!normalizedQuery) return true;
        const haystack = [
          item.requestReference,
          item.organisationName,
          PHASE_LABELS[item.phaseCode],
          STATUS_LABELS[item.payment.status],
          item.requestType,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === 'newest') {
          return new Date(waitingReferenceDate(b)).getTime() - new Date(waitingReferenceDate(a)).getTime();
        }
        if (sort === 'oldest') {
          return new Date(waitingReferenceDate(a)).getTime() - new Date(waitingReferenceDate(b)).getTime();
        }
        return new Date(waitingReferenceDate(a)).getTime() - new Date(waitingReferenceDate(b)).getTime();
      });
  }, [bucket, data, query, sort]);

  const selectedItem = useMemo(
    () =>
      filteredData.find((item) => `${item.phaseCode}:${item.phaseId}` === selectedKey) ??
      filteredData[0] ??
      null,
    [filteredData, selectedKey]
  );

  const { pageItems, totalPages, page: currentPage } = paginate(filteredData, page, PAGE_SIZE);

  useEffect(() => {
    if (filteredData.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !filteredData.some((item) => `${item.phaseCode}:${item.phaseId}` === selectedKey)) {
      setSelectedKey(`${filteredData[0].phaseCode}:${filteredData[0].phaseId}`);
    }
  }, [filteredData, selectedKey]);

  async function refreshQueues() {
    await Promise.all([deepQueue.refetch(), siteQueue.refetch(), certificateQueue.refetch()]);
  }

  async function handleUploadInvoice() {
    if (!invoiceTask || !invoiceFile) {
      setActionError('Selectionnez la facture recue par S5.');
      return;
    }
    const key = `${invoiceTask.phaseCode}:${invoiceTask.phaseId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const uploaded = await uploadFile(invoiceFile);
      await uploadInvoiceForItem(invoiceTask, uploaded);
      setSelectedKey(key);
      setBucket('waiting_proof');
      setInvoiceTask(null);
      setInvoiceFile(null);
      await refreshQueues();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible d'enregistrer la facture."));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleValidate(item: S5PaymentQueueItem) {
    const key = `${item.phaseCode}:${item.phaseId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await validatePaymentForItem(item);
      setSelectedKey(key);
      setBucket('validated');
      await refreshQueues();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Validation du paiement impossible.'));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReject(params: {
    action: 'request_new_proof' | 'reject_dossier';
    reason: string;
  }) {
    if (!rejectTask) return;
    const key = `${rejectTask.phaseCode}:${rejectTask.phaseId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await rejectPaymentForItem(rejectTask, params.action, params.reason);
      setSelectedKey(key);
      setBucket('rejected');
      setRejectTask(null);
      await refreshQueues();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Rejet du paiement impossible.'));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1480px] space-y-5 px-6 py-6">
        <S5Header />

        {error ? (
          <p className="rounded border border-anac-danger/20 bg-anac-danger/5 p-3 text-sm text-anac-danger">
            Impossible de charger les paiements.
          </p>
        ) : null}
        {actionError ? (
          <p className="rounded border border-anac-danger/20 bg-anac-danger/5 p-3 text-sm text-anac-danger">
            {actionError}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <S5MetricCard
            label="Factures a envoyer"
            value={counts.to_invoice}
            helper="Factures recues par S5 a transmettre"
            icon={FileText}
            tone="blue"
          />
          <S5MetricCard
            label="Preuves attendues"
            value={counts.waiting_proof}
            helper="Factures deja transmises au postulant"
            icon={Clock3}
            tone="warning"
          />
          <S5MetricCard
            label="Preuves a valider"
            value={counts.proof_received}
            helper="Quittances retournees par le postulant"
            icon={ShieldCheck}
            tone="purple"
          />
          <S5MetricCard
            label="Paiements valides"
            value={counts.validated}
            helper="Phases debloquees par S5"
            icon={CheckCircle2}
            tone="success"
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)]">
          <S5BucketTabs value={bucket} counts={counts} onChange={updateBucket} />

          <div className="grid min-h-[620px] lg:grid-cols-[minmax(0,1fr)_460px]">
            <div className="min-w-0 border-b border-anac-border lg:border-b-0 lg:border-r">
              <S5Toolbar
                query={query}
                sort={sort}
                onQueryChange={updateQuery}
                onSortChange={updateSort}
              />
              <S5PaymentTable
                items={pageItems}
                selectedKey={selectedItem ? `${selectedItem.phaseCode}:${selectedItem.phaseId}` : null}
                loading={isLoading}
                onSelect={setSelectedKey}
              />
              <Pagination
                label={`${filteredData.length} paiement${filteredData.length > 1 ? 's' : ''}`}
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>

            <S5DetailPanel
              item={selectedItem}
              busy={selectedItem ? busyKey === `${selectedItem.phaseCode}:${selectedItem.phaseId}` : false}
              onUploadInvoice={(item) => {
                setInvoiceTask(item);
                setInvoiceFile(null);
              }}
              onValidate={handleValidate}
              onReject={setRejectTask}
              onPreview={setPreviewFile}
            />
          </div>
        </section>

        <DocumentViewer
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          actionHint="Previsualisation integree du document de paiement."
        />

        {invoiceTask ? (
          <InvoiceModal
            item={invoiceTask}
            file={invoiceFile}
            busy={busyKey === `${invoiceTask.phaseCode}:${invoiceTask.phaseId}`}
            onFileChange={setInvoiceFile}
            onClose={() => {
              setInvoiceTask(null);
              setInvoiceFile(null);
            }}
            onSubmit={handleUploadInvoice}
          />
        ) : null}

        {rejectTask ? (
          <RejectModal
            item={rejectTask}
            busy={busyKey === `${rejectTask.phaseCode}:${rejectTask.phaseId}`}
            onClose={() => setRejectTask(null)}
            onSubmit={handleReject}
          />
        ) : null}
      </main>
    </div>
  );
}

function S5Header() {
  return (
    <header>
      <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight text-anac-navy">Facturation S5</h1>
      <p className="mt-1 text-sm text-anac-muted">
        Suivez les factures recues par S5, leur transmission au postulant et la validation des preuves de paiement.
      </p>
    </header>
  );
}

function S5MetricCard({
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
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{helper}</p>
    </section>
  );
}

function S5BucketTabs({
  value,
  counts,
  onChange,
}: {
  value: PaymentBucket;
  counts: Record<PaymentBucket, number>;
  onChange: (value: PaymentBucket) => void;
}) {
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
            {counts[bucket]}
          </span>
        </button>
      ))}
    </div>
  );
}

function S5Toolbar({
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
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
          aria-hidden="true"
        />
        <span className="sr-only">Rechercher un paiement</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher un dossier, organisme, phase..."
          className="h-10 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm text-anac-navy outline-none transition focus:border-anac-sky focus:ring-2 focus:ring-anac-sky/30"
        />
      </label>
      <Select value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
        <SelectTrigger className="h-10 w-[220px] gap-2 text-sm font-medium text-anac-navy">
          <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="waiting">Attente la plus longue</SelectItem>
          <SelectItem value="newest">Plus recents</SelectItem>
          <SelectItem value="oldest">Plus anciens</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function S5PaymentTable({
  items,
  selectedKey,
  loading,
  onSelect,
}: {
  items: S5PaymentQueueItem[];
  selectedKey: string | null;
  loading: boolean;
  onSelect: (key: string) => void;
}) {
  if (loading) {
    return <EmptyState icon={WalletCards} title="Chargement des paiements" />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Aucun paiement dans cette vue"
        description="Les paiements reapparaitront ici des qu'une action S5 sera attendue."
      />
    );
  }

  return (
    <Table className="min-w-[860px]">
      <TableHeader>
        <TableRow>
          <TableHead>Dossier</TableHead>
          <TableHead>Organisme</TableHead>
          <TableHead>Phase</TableHead>
          <TableHead>Facture</TableHead>
          <TableHead>Preuve</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const key = `${item.phaseCode}:${item.phaseId}`;
          const selected = key === selectedKey;
          return (
            <TableRow
              key={key}
              className={cn('cursor-pointer', selected && 'bg-anac-blue/5 outline outline-1 -outline-offset-1 outline-anac-blue')}
              onClick={() => onSelect(key)}
            >
              <TableCell>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className="text-left font-semibold text-anac-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
                >
                  {item.requestReference}
                </button>
                <p className="text-xs text-anac-muted">{item.requestType}</p>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <p className="truncate font-medium text-anac-navy">{item.organisationName}</p>
              </TableCell>
              <TableCell className="text-xs text-anac-muted">{PHASE_LABELS[item.phaseCode]}</TableCell>
              <TableCell className="text-xs text-anac-muted">{formatDate(item.payment.invoiceUploadedAt)}</TableCell>
              <TableCell className="text-xs text-anac-muted">{formatDate(item.payment.proofUploadedAt)}</TableCell>
              <TableCell>
                <StatusBadge label={STATUS_LABELS[item.payment.status] ?? item.payment.status} tone={statusClass(item.payment.status)} icon={statusIcon(item.payment.status)} pill={false} />
              </TableCell>
              <TableCell className="text-xs font-medium text-anac-blue">
                {NEXT_ACTION_LABELS[item.nextAction]}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function S5DetailPanel({
  item,
  busy,
  onUploadInvoice,
  onValidate,
  onReject,
  onPreview,
}: {
  item: S5PaymentQueueItem | null;
  busy: boolean;
  onUploadInvoice: (item: S5PaymentQueueItem) => void;
  onValidate: (item: S5PaymentQueueItem) => void;
  onReject: (item: S5PaymentQueueItem) => void;
  onPreview: (file: { title: string; url: string }) => void;
}) {
  if (!item) {
    return (
      <aside className="grid min-h-[420px] place-items-center p-6">
        <EmptyState
          icon={CreditCard}
          title="Selectionnez un paiement"
          description="Le resume, les pieces et les actions S5 apparaitront ici."
        />
      </aside>
    );
  }

  return (
    <aside className="min-w-0 bg-white">
      <div className="border-b border-anac-border p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-anac-border px-2 py-0.5 text-xs text-anac-navy">
            {item.requestReference}
          </span>
          <StatusBadge label={STATUS_LABELS[item.payment.status] ?? item.payment.status} tone={statusClass(item.payment.status)} icon={statusIcon(item.payment.status)} pill={false} />
        </div>
        <h2 className="text-lg font-semibold leading-tight text-anac-navy">
          Paiement - {PHASE_LABELS[item.phaseCode]}
        </h2>
        <p className="mt-1 text-sm text-anac-muted">par {item.organisationName}</p>
      </div>

      <div className="space-y-4 p-4">
        <S5ActionPanel
          item={item}
          busy={busy}
          onUploadInvoice={onUploadInvoice}
          onValidate={onValidate}
          onReject={onReject}
        />

        <section className="grid gap-4 rounded-lg border border-anac-border bg-white p-4 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-sm font-semibold text-anac-navy">Resume du paiement</h3>
            <dl className="space-y-3">
              <Info label="Dossier" value={item.requestReference} />
              <Info label="Phase" value={PHASE_LABELS[item.phaseCode]} />
              <Info label="Montant" value={amountLabel()} />
              <Info label="Attente" value={waitingLabel(item)} />
            </dl>
          </div>
          <S5Timeline item={item} />
        </section>

        <section className="rounded-lg border border-anac-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-anac-navy">Pieces de paiement</h3>
          <div className="space-y-2">
            <PaymentDocumentRow
              label="Facture transmise"
              date={item.payment.invoiceUploadedAt}
              url={item.payment.invoiceFileUrl}
              onPreview={() =>
                item.payment.invoiceFileUrl &&
                onPreview({ title: `Facture ${item.requestReference}`, url: item.payment.invoiceFileUrl })
              }
            />
            <PaymentDocumentRow
              label="Preuve postulant"
              date={item.payment.proofUploadedAt}
              url={item.payment.proofFileUrl}
              onPreview={() =>
                item.payment.proofFileUrl &&
                onPreview({ title: `Preuve ${item.requestReference}`, url: item.payment.proofFileUrl })
              }
            />
          </div>
        </section>

        <section className="rounded-lg border border-anac-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-anac-navy">Acces rapide</h3>
          <Link
            to={phasePath(item)}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}
          >
            <Eye size={14} aria-hidden="true" />
            Consulter la phase
          </Link>
        </section>
      </div>
    </aside>
  );
}

function S5ActionPanel({
  item,
  busy,
  onUploadInvoice,
  onValidate,
  onReject,
}: {
  item: S5PaymentQueueItem;
  busy: boolean;
  onUploadInvoice: (item: S5PaymentQueueItem) => void;
  onValidate: (item: S5PaymentQueueItem) => void;
  onReject: (item: S5PaymentQueueItem) => void;
}) {
  if (item.payment.status === 'awaiting_invoice') {
    return (
      <section className="rounded-lg border border-anac-info/20 bg-anac-info/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
              <FileUp size={16} className="text-anac-info" aria-hidden="true" />
              Facture recue a transmettre
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-anac-muted">
              Importez la facture recue par S5. Cette action enregistre sa transmission au postulant et attend la preuve.
            </p>
          </div>
          <Button size="sm" disabled={busy} onClick={() => onUploadInvoice(item)}>
            <Send size={14} aria-hidden="true" />
            Joindre facture envoyee
          </Button>
        </div>
      </section>
    );
  }

  if (item.payment.status === 'pending_validation') {
    return (
      <section className="rounded-lg border border-anac-warning/20 bg-anac-warning/5 p-4">
        <div className="space-y-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
              <ShieldCheck size={16} className="text-anac-warning" aria-hidden="true" />
              Preuve a valider
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-anac-muted">
              Controlez la preuve de paiement retournee par le postulant avant de debloquer la phase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onValidate(item)}>
              <CheckCircle2 size={14} aria-hidden="true" />
              Valider le paiement
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(item)}>
              <XCircle size={14} aria-hidden="true" />
              Rejeter
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (item.payment.status === 'awaiting_proof') {
    return (
      <section className="rounded-lg border border-anac-muted/20 bg-anac-muted/5 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
          <Clock3 size={16} className="text-anac-muted" aria-hidden="true" />
          Preuve postulant attendue
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-anac-muted">
          La facture a ete transmise. S5 attend maintenant la preuve de paiement du postulant.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-anac-success/20 bg-anac-success/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <CheckCircle2 size={16} className="text-anac-success" aria-hidden="true" />
        Paiement traite
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-anac-muted">
        Le paiement ne requiert plus d&apos;action S5 immediate.
      </p>
    </section>
  );
}

function S5Timeline({ item }: { item: S5PaymentQueueItem }) {
  const steps = [
    {
      label: 'Facture transmise',
      date: item.payment.invoiceUploadedAt,
      done: !!item.payment.invoiceUploadedAt,
      current: item.payment.status === 'awaiting_invoice',
    },
    {
      label: 'Preuve recue',
      date: item.payment.proofUploadedAt,
      done: !!item.payment.proofUploadedAt,
      current: item.payment.status === 'awaiting_proof',
    },
    {
      label: 'Decision S5',
      date: item.payment.validatedAt,
      done: item.payment.status === 'validated' || item.payment.status === 'rejected',
      current: item.payment.status === 'pending_validation',
    },
  ];

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-anac-navy">Historique</h3>
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

function PaymentDocumentRow({
  label,
  date,
  url,
  onPreview,
}: {
  label: string;
  date: string | null;
  url: string | null;
  onPreview: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-anac-border bg-anac-gray/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-anac-navy">{label}</p>
        <p className="text-[11px] text-anac-muted">{url ? formatDateTime(date) : 'Non disponible'}</p>
      </div>
      {url ? (
        <button
          type="button"
          onClick={onPreview}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 gap-2')}
        >
          <Eye size={14} aria-hidden="true" />
          Voir
        </button>
      ) : null}
    </div>
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


function InvoiceModal({
  item,
  file,
  busy,
  onFileChange,
  onClose,
  onSubmit,
}: {
  item: S5PaymentQueueItem;
  file: File | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl">
        <ModalHeader title="Joindre la facture transmise" subtitle={`${item.requestReference} - ${PHASE_LABELS[item.phaseCode]}`} onClose={onClose} />
        <div className="mt-4 space-y-2">
          <label className="label">Facture recue par S5</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-anac-muted">
            Cette action enregistre la facture comme transmise au postulant.
          </p>
          {file ? <p className="text-xs font-medium text-anac-navy">{file.name}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  item,
  busy,
  onClose,
  onSubmit,
}: {
  item: S5PaymentQueueItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (params: {
    action: 'request_new_proof' | 'reject_dossier';
    reason: string;
  }) => void;
}) {
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'request_new_proof' | 'reject_dossier'>('request_new_proof');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-anac-navy/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-anac-border bg-white p-5 shadow-xl">
        <ModalHeader title="Rejeter la preuve de paiement" subtitle={item.requestReference} onClose={onClose} />
        <div className="mt-4 space-y-3">
          <label className="label" htmlFor="rejection-action">Action apres rejet</label>
          <select
            id="rejection-action"
            value={action}
            disabled={busy}
            onChange={(event) => setAction(event.target.value as 'request_new_proof' | 'reject_dossier')}
            className="input"
          >
            <option value="request_new_proof">Demander une nouvelle preuve</option>
            <option value="reject_dossier">Rejeter le dossier</option>
          </select>
          <label className="label" htmlFor="rejection-reason">Motif</label>
          <textarea
            id="rejection-reason"
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            className="input min-h-24"
            placeholder="Expliquez ce qui rend la preuve non conforme..."
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || busy}
            onClick={() => onSubmit({ action, reason })}
          >
            <XCircle size={14} aria-hidden="true" />
            {busy ? 'Rejet...' : 'Confirmer le rejet'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-anac-navy">{title}</h2>
        <p className="mt-1 text-xs text-anac-muted">{subtitle}</p>
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
  );
}
