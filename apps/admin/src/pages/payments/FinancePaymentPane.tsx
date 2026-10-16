import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, Send, XCircle } from 'lucide-react';
import type { InternalRole } from '@aidn/shared';
import { Button, buttonVariants } from '../../components/ui/button';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { QueueEmptyPane, QueueReadingPane } from '../../components/cockpit/QueueReadingPane';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import { canAct } from '../../lib/next-action-owner';
import { cn } from '../../lib/utils';
import { PHASE_LABELS, financeCallout } from './financeCopy';

export function phasePath(item: FinanceQueueItem): string {
  if (item.phaseCode === 'M5') return `/demandes/${item.requestId}/evaluation-approfondie`;
  if (item.phaseCode === 'M6') return `/demandes/${item.requestId}/demonstration-inspection`;
  return `/demandes/${item.requestId}/delivrance`;
}

export function FinancePaymentPane({
  item, roles, busy, actionButtonRef, onUploadInvoice, onValidate, onReject, onPreview,
}: {
  item: FinanceQueueItem | null;
  roles: readonly string[];
  busy: boolean;
  actionButtonRef: RefObject<HTMLButtonElement>;
  onUploadInvoice: (item: FinanceQueueItem) => void;
  onValidate: (item: FinanceQueueItem) => void;
  onReject: (item: FinanceQueueItem) => void;
  onPreview: (file: { title: string; url: string }) => void;
}) {
  if (!item) return <QueueEmptyPane title="Sélectionnez un paiement" description="Le résumé, les pièces et l’action Finance apparaîtront ici." />;
  const copy = financeCallout(item);
  const allowed = canAct(item.owner, roles as InternalRole[]);
  const cta =
    item.actionKey === 'send_invoice' ? (
      <Button ref={actionButtonRef} type="button" size="sm" disabled={busy} onClick={() => onUploadInvoice(item)}>
        <Send size={14} aria-hidden="true" /> Joindre la facture transmise
      </Button>
    ) : item.actionKey === 'validate_payment_proof' ? (
      <>
        <Button ref={actionButtonRef} type="button" size="sm" disabled={busy} onClick={() => onValidate(item)}>
          <CheckCircle2 size={14} aria-hidden="true" /> Valider la preuve de paiement
        </Button>
        <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onReject(item)}>
          <XCircle size={14} aria-hidden="true" /> Rejeter
        </Button>
      </>
    ) : undefined;
  const secondary = (
    <Link to={phasePath(item)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-2')}>
      <Eye size={14} aria-hidden="true" /> Consulter la phase
    </Link>
  );
  const { payment } = item;
  return (
    <QueueReadingPane
      ariaLabel={`Détail du paiement ${item.requestReference}`}
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h2 className="text-lg font-semibold text-anac-navy">{item.requestReference}</h2>
            <span className="text-sm text-anac-text/80">{PHASE_LABELS[item.phaseCode]}</span>
            <span className="ml-auto">{item.dossierClosed ? <ClosedDossierBadge status={item.dossierStatus} /> : null}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold">{item.organisationName}</p>
        </>
      }
      callout={{ state: item.state, title: copy.title, description: copy.description, owner: item.owner, canAct: allowed && !!cta, cta, secondary, blockReason: copy.blockReason }}
    >
      <Section title="Pièces de paiement">
        <div className="space-y-2">
          <PaymentDocumentRow
            label="Facture transmise"
            date={payment.invoiceUploadedAt}
            url={payment.invoiceFileUrl}
            onPreview={() => payment.invoiceFileUrl && onPreview({ title: `Facture ${item.requestReference}`, url: payment.invoiceFileUrl })}
          />
          <PaymentDocumentRow
            label="Preuve de paiement"
            date={payment.proofUploadedAt}
            url={payment.proofFileUrl}
            onPreview={() => payment.proofFileUrl && onPreview({ title: `Preuve de paiement ${item.requestReference}`, url: payment.proofFileUrl })}
          />
        </div>
      </Section>
      <Section title="Suivi">
        <div className="grid gap-4 md:grid-cols-2">
          <PaymentTimeline item={item} />
          {item.newProofRequested && payment.rejectionReason ? (
            <dl>
              <Info label="Motif de la demande" value={payment.rejectionReason} />
            </dl>
          ) : null}
        </div>
      </Section>
    </QueueReadingPane>
  );
}

function PaymentTimeline({ item }: { item: FinanceQueueItem }) {
  const { payment } = item;
  const steps = [
    { label: 'Facture transmise', date: payment.invoiceUploadedAt, done: !!payment.invoiceUploadedAt, current: payment.status === 'awaiting_invoice' },
    { label: 'Preuve de paiement reçue', date: payment.proofUploadedAt, done: !!payment.proofUploadedAt, current: payment.status === 'awaiting_proof' },
    {
      label: 'Décision Finance',
      date: payment.validatedAt,
      done: payment.status === 'validated' || payment.status === 'rejected',
      current: payment.status === 'pending_validation',
    },
  ];
  return (
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
  );
}

function PaymentDocumentRow({ label, date, url, onPreview }: { label: string; date: string | null; url: string | null; onPreview: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-anac-border bg-anac-gray/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-anac-navy">{label}</p>
        <p className="text-[11px] text-anac-muted">{url ? formatDateTime(date) : 'Non disponible'}</p>
      </div>
      {url ? (
        <button type="button" onClick={onPreview} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 gap-2')}>
          <Eye size={14} aria-hidden="true" />
          Voir
        </button>
      ) : null}
    </div>
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
    <div>
      <dt className="text-[11px] text-anac-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-anac-navy">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}
