import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownAZ,
  CheckCircle2,
  Clock3,
  FileText,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { BucketTabs } from '../../components/common/BucketTabs';
import { Pagination, paginate } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
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
import { api, apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { cn } from '../../lib/utils';
import { S5PaymentDetailPanel } from './components/S5PaymentDetailPanel';
import { S5PaymentTable } from './components/S5PaymentTable';
import { PHASE_LABELS, STATUS_LABELS } from './s5PaymentLabels';
import type { S5PaymentQueueItem } from './s5PaymentTypes';

type PaymentBucket =
  | 'to_invoice'
  | 'waiting_proof'
  | 'proof_received'
  | 'validated'
  | 'rejected'
  | 'all';

const PAGE_SIZE = 20;

type SortKey = 'waiting' | 'newest' | 'oldest';

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

function bucketForItem(item: S5PaymentQueueItem): PaymentBucket {
  if (item.payment.status === 'awaiting_invoice') return 'to_invoice';
  if (item.payment.status === 'awaiting_proof') return 'waiting_proof';
  if (item.payment.status === 'pending_validation') return 'proof_received';
  if (item.payment.status === 'validated') return 'validated';
  if (item.payment.status === 'rejected') return 'rejected';
  return 'all';
}

function waitingReferenceDate(item: S5PaymentQueueItem): string {
  return (
    item.payment.proofUploadedAt ??
    item.payment.invoiceUploadedAt ??
    item.payment.validatedAt ??
    new Date(0).toISOString()
  );
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
          <BucketTabs
            value={bucket}
            items={BUCKET_SEQUENCE.map((b) => ({ key: b, label: BUCKET_LABELS[b], count: counts[b] }))}
            onChange={updateBucket}
          />

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

            <S5PaymentDetailPanel
              item={selectedItem}
              busy={busyKey}
              onUploadInvoice={(item) => {
                setInvoiceTask(item);
                setInvoiceFile(null);
              }}
              onValidate={handleValidate}
              onReject={setRejectTask}
              onPreview={(file) => setPreviewFile({ title: file.title ?? '', url: file.url })}
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
    <Modal
      title="Joindre la facture transmise"
      subtitle={`${item.requestReference} - ${PHASE_LABELS[item.phaseCode]}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" disabled={!file || busy} onClick={onSubmit}>
            <Send size={14} aria-hidden="true" />
            {busy ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
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
    </Modal>
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
    <Modal
      title="Rejeter la preuve de paiement"
      subtitle={item.requestReference}
      onClose={onClose}
      footer={
        <>
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
        </>
      }
    >
      <div className="space-y-3">
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
    </Modal>
  );
}


