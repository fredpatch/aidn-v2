import { financeInvoiceLabel, type FinancePhaseCode } from '@aidn/shared';
import { useDossierIdentity } from './PhaseDossierContext';

/** FINANCE-LABELS-1 - « Objet de la facture » on the M5 / M6 / M7 payment
 *  cards (and so the Finance compact pages): the shared catalog's wording,
 *  from the dossier identity the page header already loads (same query). */
export function InvoicePurpose({ requestId, phaseCode }: { requestId: string | undefined; phaseCode: FinancePhaseCode }) {
  const { identity } = useDossierIdentity(requestId);
  if (!identity) return null;
  return (
    <div className="rounded-md bg-anac-gray/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-anac-muted">Objet de la facture</p>
      <p className="text-sm font-semibold text-anac-navy">
        {financeInvoiceLabel({ phaseCode, requestType: identity.requestType })}
      </p>
    </div>
  );
}
