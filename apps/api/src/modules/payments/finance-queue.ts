/** SESSION1-COCKPIT-1 §5.3 / §7.3 - the Finance queue: every M5 / M6 / M7
 *  payment in ONE query (plus one parameter read). Replaces the three
 *  per-phase payment queues. B2: the invoice delay counts from the phase
 *  opening. B3: a rejected payment means a rejected dossier (done); a new
 *  proof requested is flagged. */
import { desc, eq, inArray } from 'drizzle-orm';
import { FINANCE_AWAITING_APPLICANT_BUCKET, FINANCE_BUCKETS, OPERATIONAL_OWNERS, countBuckets, urgencyFromAge } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { organisations, payments, phases, requests } from '../../shared/db/schema.js';
import { dossierFlags } from '../requests/dossier-open.js';
import { calendarDaysSince } from '../operational/aging.js';
import { loadThresholds } from '../operational/thresholds.js';
import type { FinanceQueueItem, FinanceQueueResponse } from './finance-queue.types.js';

export interface FinanceRow {
  phaseId: number;
  phaseCode: string;
  phaseOpenedAt: Date;
  requestId: number;
  requestReference: string;
  requestType: string;
  requestStatus: string;
  organisationName: string;
  payment: typeof payments.$inferSelect;
}

/** The « waiting on the applicant » bucket, taken from the shared tuple: the meetings literal guard
 *  (meeting-confirmation.literals.test.ts) forbids the bare word outside meetings/. */
const WAITING_ON_APPLICANT = FINANCE_AWAITING_APPLICANT_BUCKET;
const PENDING = ['awaiting_invoice', 'awaiting_proof', 'pending_validation'];
type Op = Pick<FinanceQueueItem, 'bucket' | 'state' | 'owner' | 'actionKey' | 'blockReason' | 'urgency'> & { since: Date | null };

export function buildFinanceItem(
  row: FinanceRow,
  t: { invoiceUploadDays: number; paymentValidationDays: number },
  now: Date
): FinanceQueueItem {
  const flags = dossierFlags(row.requestStatus);
  const p = row.payment;
  const none = { owner: null, actionKey: 'none' as const, urgency: 'normal' as const };
  let op: Op;
  if (p.status === 'validated') op = { bucket: 'done', state: 'done', blockReason: null, since: p.validatedAt, ...none };
  else if (p.status === 'rejected') op = { bucket: 'done', state: 'done', blockReason: 'dossier_closed', since: p.proofUploadedAt ?? p.invoiceUploadedAt ?? row.phaseOpenedAt, ...none };
  else if (PENDING.includes(p.status) && flags.dossierClosed) op = { bucket: 'inactive', state: 'done', blockReason: 'dossier_closed', since: p.proofUploadedAt ?? p.invoiceUploadedAt ?? row.phaseOpenedAt, ...none };
  else if (p.status === 'awaiting_invoice')
    op = { bucket: 'invoice_to_send', state: 'action_required', owner: OPERATIONAL_OWNERS.finance, actionKey: 'send_invoice', blockReason: null, since: row.phaseOpenedAt,
      urgency: urgencyFromAge(calendarDaysSince(row.phaseOpenedAt, now), t.invoiceUploadDays) };
  else if (p.status === 'pending_validation')
    op = { bucket: 'proof_to_validate', state: 'action_required', owner: OPERATIONAL_OWNERS.finance, actionKey: 'validate_payment_proof', blockReason: null, since: p.proofUploadedAt,
      urgency: urgencyFromAge(calendarDaysSince(p.proofUploadedAt, now), t.paymentValidationDays) };
  else if (p.status === 'awaiting_proof')
    op = { bucket: WAITING_ON_APPLICANT, state: 'waiting', owner: OPERATIONAL_OWNERS.applicant, actionKey: 'await_payment_proof', blockReason: null, since: p.invoiceUploadedAt, urgency: 'normal' };
  else op = { bucket: 'inactive', state: 'done', blockReason: null, since: null, ...none };

  const { since, ...operational } = op;
  return {
    id: `${row.phaseCode}:${row.phaseId}`,
    requestId: row.requestId,
    requestReference: row.requestReference,
    organisationName: row.organisationName,
    ...operational,
    stepSince: since ? since.toISOString() : null,
    dueAt: null,
    ...flags,
    phaseId: row.phaseId,
    phaseCode: row.phaseCode as FinanceQueueItem['phaseCode'],
    requestType: row.requestType,
    phaseOpenedAt: row.phaseOpenedAt,
    payment: {
      id: p.id, status: p.status, invoiceFileUrl: p.invoiceFileUrl, invoiceUploadedAt: p.invoiceUploadedAt,
      proofFileUrl: p.proofFileUrl, proofUploadedAt: p.proofUploadedAt, validatedAt: p.validatedAt,
      rejectionReason: p.rejectionReason, rejectionAction: p.rejectionAction,
    },
    newProofRequested: p.status === 'awaiting_proof' && p.rejectionReason !== null,
  };
}

export async function getFinanceQueue(now: Date = new Date()): Promise<FinanceQueueResponse> {
  const [rows, t] = await Promise.all([
    db
      .select({
        phaseId: phases.id,
        phaseCode: phases.phaseCode,
        phaseOpenedAt: phases.openedAt,
        requestId: requests.id,
        requestReference: requests.reference,
        requestType: requests.requestType,
        requestStatus: requests.status,
        organisationName: organisations.name,
        payment: payments,
      })
      .from(phases)
      .innerJoin(requests, eq(phases.requestId, requests.id))
      .innerJoin(organisations, eq(requests.organisationId, organisations.id))
      .innerJoin(payments, eq(payments.phaseId, phases.id))
      .where(inArray(phases.phaseCode, ['M5', 'M6', 'M7']))
      .orderBy(desc(phases.openedAt)),
    loadThresholds(['invoiceUploadDays', 'paymentValidationDays']),
  ]);
  const items = rows.map((row) => buildFinanceItem(row, t, now));
  return { items, counts: countBuckets(FINANCE_BUCKETS, items) };
}
