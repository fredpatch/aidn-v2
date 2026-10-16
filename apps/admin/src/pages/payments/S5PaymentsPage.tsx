import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import DocumentViewer from '../../components/documents/DocumentViewer';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import {
  DOSSIER_REJECTION_TITLE,
  DossierRejectionSummary,
  FINAL_REJECTION_BUTTON_CLASS,
} from '../../components/common/DossierRejectionConfirm';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { AgingBadge } from '../../components/cockpit/AgingBadge';
import { CockpitPage } from '../../components/cockpit/CockpitPage';
import { CockpitUploadModal } from '../../components/cockpit/CockpitUploadModal';
import { QueueColumn } from '../../components/cockpit/QueueColumn';
import { useAuth } from '../../hooks/useAuth';
import { fetchFinanceQueue } from '../../lib/api/payments.api';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import {
  rejectPayment as rejectDeepPayment,
  uploadInvoice as uploadDeepInvoice,
  validatePayment as validateDeepPayment,
} from '../../lib/api/deep-evaluation.api';
import {
  rejectPayment as rejectSitePayment,
  uploadInvoice as uploadSiteInvoice,
  validatePayment as validateSitePayment,
} from '../../lib/api/site-inspection.api';
import {
  rejectPayment as rejectCertificatePayment,
  uploadInvoice as uploadCertificateInvoice,
  validatePayment as validateCertificatePayment,
} from '../../lib/api/certificates.api';
import type { UploadedAsset } from '@aidn/shared';
import { PAYMENT_REJECTION_REASON_MAX_LENGTH } from '@aidn/shared';
import { apiErrorMessage } from '../../lib/axios';
import { uploadFile } from '../../lib/uploads';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { isDossierClosedError } from '../../lib/react-query/queryClient';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue, type AgeOrder } from '../../lib/cockpit/queue';
import { useQueueTab } from '../../lib/cockpit/useQueueTab';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';
import { formatRowDate } from '../../lib/dayGroups';
import { FinancePaymentPane } from './FinancePaymentPane';
import { FINANCE_TAB_MODES, FINANCE_TABS, PHASE_LABELS, financeCallout, financeMetrics, type FinanceTab } from './financeCopy';

const EMPTY_COUNTS = { invoice_to_send: 0, proof_to_validate: 0, awaiting_applicant: 0, done: 0, inactive: 0 };
const EMPTY_ITEMS: FinanceQueueItem[] = [];

async function uploadInvoiceForItem(item: FinanceQueueItem, uploaded: UploadedAsset): Promise<void> {
  if (item.phaseCode === 'M5') {
    await uploadDeepInvoice(item.phaseId, uploaded.uploadAssetId);
    return;
  }
  if (item.phaseCode === 'M6') {
    await uploadSiteInvoice(item.phaseId, uploaded.uploadAssetId);
    return;
  }
  await uploadCertificateInvoice(item.phaseId, uploaded.uploadAssetId);
}

async function validatePaymentForItem(item: FinanceQueueItem): Promise<void> {
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
  item: FinanceQueueItem,
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

/** SESSION1-COCKPIT-1 - Finance cockpit (home of s5_agent): the three phase
 *  payments in one queue on the shared shell. Actions unchanged: invoice
 *  upload, validation, rejection (RejectModal). Entrée only focuses the action. */
export default function S5PaymentsPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.payments.financeQueue(), queryFn: fetchFinanceQueue });
  const items = query.data?.items ?? EMPTY_ITEMS;
  const counts = query.data?.counts ?? EMPTY_COUNTS;

  const [tab, setTab] = useQueueTab<FinanceTab>(FINANCE_TABS.map((t) => t.key), 'invoice_to_send');
  const mode = FINANCE_TAB_MODES[tab];
  const [order, setOrder] = useState<AgeOrder | null>(null);
  const effectiveOrder = order ?? defaultOrderFor(mode);
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      sortQueue(
        filterQueue(items, tab, search, (item) => [item.requestReference, item.organisationName, PHASE_LABELS[item.phaseCode], item.requestType].join(' ')),
        mode,
        effectiveOrder
      ),
    [items, tab, search, mode, effectiveOrder]
  );
  const groups = useMemo(() => groupQueue(visible, mode), [visible, mode]);
  const { selected, select } = useUrlSelection(visible, !query.isLoading);

  const [invoiceTask, setInvoiceTask] = useState<FinanceQueueItem | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [rejectTask, setRejectTask] = useState<FinanceQueueItem | null>(null);
  const [previewFile, setPreviewFile] = useState<{ title: string; url: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.payments.financeQueue() });

  async function run(item: FinanceQueueItem, action: () => Promise<void>, fallback: string, close: () => void) {
    setActionError(null);
    setBusyId(item.id);
    try {
      await action();
      close();
      await reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
      // K7c - dossier closed meanwhile (409 DOSSIER_CLOSED): close the dialog and
      // reload, so the row shows the dossier as closed with no action.
      if (isDossierClosedError(err)) {
        close();
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const closeInvoice = () => {
    setInvoiceTask(null);
    setInvoiceFile(null);
  };

  return (
    <CockpitPage
      title="Paiements — Finance"
      metrics={financeMetrics(items, counts)}
      search={{ value: search, onChange: setSearch, placeholder: 'Référence, organisation, phase, type...', label: 'Rechercher un paiement' }}
      errors={[query.error ? apiErrorMessage(query.error, 'Impossible de charger les paiements.') : null, actionError]}
      list={
        <QueueColumn
          tabs={FINANCE_TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === 'all' ? items.length : counts[t.key] }))}
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
          texts={{ loading: 'Chargement des paiements', error: 'Impossible de charger les paiements.', empty: 'Aucun paiement dans cette vue', listLabel: 'Paiements', noun: ['paiement', 'paiements'] }}
          onSelect={(item) => {
            setActionError(null);
            select(item);
          }}
          onActivate={() => {
            const button = actionButtonRef.current;
            if (button && !button.disabled) button.focus();
          }}
          renderRow={(item) => <FinanceRow item={item} />}
        />
      }
      pane={
        <FinancePaymentPane
          item={selected}
          roles={roles}
          busy={busyId !== null && busyId === selected?.id}
          actionButtonRef={actionButtonRef}
          onUploadInvoice={(item) => {
            setInvoiceTask(item);
            setInvoiceFile(null);
          }}
          onValidate={(item) => run(item, () => validatePaymentForItem(item), 'Validation du paiement impossible.', () => undefined)}
          onReject={setRejectTask}
          onPreview={setPreviewFile}
        />
      }
    >
      <DocumentViewer file={previewFile} onClose={() => setPreviewFile(null)} actionHint="Prévisualisation intégrée du document de paiement." />
      {invoiceTask ? (
        <CockpitUploadModal
          title="Joindre la facture transmise"
          subtitle={`${invoiceTask.requestReference} - ${PHASE_LABELS[invoiceTask.phaseCode]}`}
          label="Facture transmise au postulant"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          hint="Cette action enregistre la facture comme transmise au postulant."
          submitLabel="Enregistrer"
          busySubmitLabel="Enregistrement..."
          file={invoiceFile}
          busy={busyId === invoiceTask.id}
          onFileChange={setInvoiceFile}
          onClose={closeInvoice}
          onSubmit={() =>
            invoiceFile &&
            run(invoiceTask, async () => uploadInvoiceForItem(invoiceTask, await uploadFile(invoiceFile)), 'Impossible d’enregistrer la facture.', closeInvoice)
          }
        />
      ) : null}
      {rejectTask ? (
        <RejectModal
          item={rejectTask}
          busy={busyId === rejectTask.id}
          onClose={() => setRejectTask(null)}
          onSubmit={(params) =>
            run(rejectTask, () => rejectPaymentForItem(rejectTask, params.action, params.reason), 'Rejet du paiement impossible.', () => setRejectTask(null))
          }
        />
      ) : null}
    </CockpitPage>
  );
}

/** One list row: organisation and date, reference and phase, badges, then the callout title. */
function FinanceRow({ item }: { item: FinanceQueueItem }) {
  return (
    <>
      <span className="truncate text-sm font-medium text-anac-text">{item.organisationName}</span>
      <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">{item.stepSince ? formatRowDate(item.stepSince) : '-'}</span>
      <span className="truncate text-xs text-anac-text/80">{item.requestReference} · {PHASE_LABELS[item.phaseCode]}</span>
      <span className="flex justify-end gap-1.5">
        {item.dossierClosed ? <ClosedDossierBadge status={item.dossierStatus} /> : null}
        {item.bucket === 'invoice_to_send' || item.bucket === 'proof_to_validate' ? <AgingBadge urgency={item.urgency} since={item.stepSince} /> : null}
      </span>
      <span className="col-span-2 truncate text-xs font-semibold text-anac-text">{financeCallout(item).title}</span>
    </>
  );
}

/** Exported for tests only. */
export function RejectModal({
  item,
  busy,
  onClose,
  onSubmit,
}: {
  item: FinanceQueueItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (params: {
    action: 'request_new_proof' | 'reject_dossier';
    reason: string;
  }) => void;
}) {
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'request_new_proof' | 'reject_dossier'>('request_new_proof');
  // A final rejection of the dossier takes a second step in the same modal
  // (one Modal throughout, so closing still returns focus to the row).
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const finalRejection = action === 'reject_dossier';
  const backRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const stepChanged = useRef(false);

  useEffect(() => {
    // The button that was clicked is gone after a step change: put focus on
    // the safe choice (Retour) or back on Continuer.
    if (!stepChanged.current) return;
    (step === 'confirm' ? backRef : continueRef).current?.focus();
  }, [step]);

  function goTo(next: 'form' | 'confirm') {
    stepChanged.current = true;
    setStep(next);
  }

  if (step === 'confirm') {
    return (
      <Modal
        title={DOSSIER_REJECTION_TITLE}
        subtitle={item.requestReference}
        onClose={() => {
          if (!busy) goTo('form');
        }}
        footer={
          <>
            <Button ref={backRef} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => goTo('form')}>
              Retour
            </Button>
            <Button
              type="button"
              size="sm"
              className={FINAL_REJECTION_BUTTON_CLASS}
              disabled={busy}
              onClick={() => onSubmit({ action: 'reject_dossier', reason })}
            >
              {busy ? 'Rejet...' : 'Rejeter le dossier'}
            </Button>
          </>
        }
      >
        <DossierRejectionSummary reason={reason} />
      </Modal>
    );
  }

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
            ref={continueRef}
            type="button"
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || busy}
            onClick={() => (finalRejection ? goTo('confirm') : onSubmit({ action, reason }))}
          >
            <XCircle size={14} aria-hidden="true" />
            {finalRejection ? 'Continuer…' : busy ? 'Rejet...' : 'Confirmer le rejet'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="label" htmlFor="rejection-action">Action après rejet</label>
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
          maxLength={PAYMENT_REJECTION_REASON_MAX_LENGTH}
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

