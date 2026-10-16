import { OPERATIONAL_OWNERS } from '@aidn/shared';
import type { FinancePaymentView, FinanceQueueItem } from '../lib/api/payments.types';

export const financePayment = (over: Partial<FinancePaymentView> = {}): FinancePaymentView => ({
  id: 1, status: 'awaiting_invoice', invoiceFileUrl: null, invoiceUploadedAt: null, proofFileUrl: null, proofUploadedAt: null,
  validatedAt: null, rejectionReason: null, rejectionAction: null, ...over,
});

/** Default: an invoice to send (M5), open dossier. */
export const finance = (over: Partial<FinanceQueueItem> = {}): FinanceQueueItem => ({
  id: 'M5:1', requestId: 1, requestReference: 'DEM-FIN-01', organisationName: 'OMA 1', bucket: 'invoice_to_send',
  state: 'action_required', owner: OPERATIONAL_OWNERS.finance, actionKey: 'send_invoice', blockReason: null, urgency: 'normal',
  stepSince: '2026-10-15T09:00:00.000Z', dueAt: null, dossierClosed: false, dossierStatus: 'in_progress',
  phaseId: 1, phaseCode: 'M5', requestType: 'issuance', phaseOpenedAt: '2026-10-15T09:00:00.000Z',
  payment: financePayment(), newProofRequested: false, ...over,
});
