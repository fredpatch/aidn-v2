import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, CreditCard, Eye, FileUp, Send, ShieldCheck, XCircle } from 'lucide-react';
import { EmptyState } from '../../../components/common/EmptyState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { PHASE_LABELS, STATUS_LABELS, statusClass, statusIcon } from '../s5PaymentLabels';
import type { S5PaymentQueueItem } from '../s5PaymentTypes';

type PreviewFile = { url: string; title: string };

function paymentKey(item: S5PaymentQueueItem): string {
  return `${item.phaseCode}:${item.phaseId}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

function detailWaitingReferenceDate(item: S5PaymentQueueItem): string {
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
  const days = daysSince(detailWaitingReferenceDate(item));
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

export function S5PaymentDetailPanel({
  item,
  busy,
  onUploadInvoice,
  onValidate,
  onReject,
  onPreview,
}: {
  item: S5PaymentQueueItem | null;
  busy: string | null;
  onUploadInvoice: (item: S5PaymentQueueItem) => void;
  onValidate: (item: S5PaymentQueueItem) => void;
  onReject: (item: S5PaymentQueueItem) => void;
  onPreview: (file: PreviewFile) => void;
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

  const isBusy = busy === paymentKey(item);

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
          busy={isBusy}
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
              {step.done ? <CheckCircle2 size={12} aria-hidden="true" /> : step.current ? <span aria-hidden="true">&bull;</span> : ''}
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

