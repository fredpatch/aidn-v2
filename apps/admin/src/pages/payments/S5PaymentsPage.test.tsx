/** SESSION1-COCKPIT-1 - Finance cockpit: landing tab, CTA by role, waiting
 *  grouping, DOSSIER_CLOSED reload, no pagination. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { OPERATIONAL_OWNERS } from '@aidn/shared';
import { api } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import type { FinanceQueueItem } from '../../lib/api/payments.types';
import { finance, financePayment } from '../../test/financeFixtures';
import { renderWithProviders } from '../../test/render';
import S5PaymentsPage from './S5PaymentsPage';

let roles = ['s5_agent'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));

const invoice = (n: number, over: Partial<FinanceQueueItem> = {}) =>
  finance({ id: `M5:${n}`, phaseId: n, requestId: n, requestReference: `DEM-FIN-${String(n).padStart(2, '0')}`, organisationName: `OMA ${n}`, ...over });
const proof = (n: number, over: Partial<FinanceQueueItem> = {}) =>
  invoice(n, {
    bucket: 'proof_to_validate', actionKey: 'validate_payment_proof',
    payment: financePayment({ status: 'pending_validation', invoiceFileUrl: '/api/files/f.pdf', invoiceUploadedAt: '2026-10-10T09:00:00.000Z', proofFileUrl: '/api/files/p.pdf', proofUploadedAt: '2026-10-12T09:00:00.000Z' }),
    ...over,
  });
const waiting = (n: number, over: Partial<FinanceQueueItem> = {}) =>
  invoice(n, {
    bucket: 'awaiting_applicant', state: 'waiting', owner: OPERATIONAL_OWNERS.applicant, actionKey: 'await_payment_proof',
    payment: financePayment({ status: 'awaiting_proof', invoiceFileUrl: '/api/files/f.pdf', invoiceUploadedAt: '2026-10-10T09:00:00.000Z' }),
    ...over,
  });

const COUNTS = { invoice_to_send: 1, proof_to_validate: 1, awaiting_applicant: 1, done: 0, inactive: 0 };
const ITEMS = [invoice(1), proof(2), waiting(3)];
const seed = (items: FinanceQueueItem[], counts = COUNTS) => ({ items, counts });

const renderPage = (route = '/paiements-s5', items = ITEMS, counts = COUNTS) =>
  renderWithProviders(<S5PaymentsPage />, { route, seed: [[queryKeys.payments.financeQueue(), seed(items, counts)]] });
const tabBtn = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  roles = ['s5_agent'];
});
afterEach(() => vi.restoreAllMocks());

describe('<S5PaymentsPage> Finance cockpit', () => {
  it('lands on « Factures à transmettre »; Finance gets « Joindre la facture transmise »', async () => {
    renderPage();
    expect(tabBtn(/^Factures à transmettre/)).toHaveClass('border-anac-blue');
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    const article = screen.getByRole('article', { name: /DEM-FIN-01/ });
    expect(within(article).getByText('Facture à transmettre')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Joindre la facture transmise/ })).toBeInTheDocument();
    expect(screen.queryByText(/quittance/i)).not.toBeInTheDocument();
  });

  it('a proof to validate offers « Valider » and « Rejeter »; the rejection flow is unchanged (RejectModal)', async () => {
    renderPage('/paiements-s5?tab=proof_to_validate');
    const article = await screen.findByRole('article', { name: /DEM-FIN-02/ });
    expect(within(article).getByRole('button', { name: /Valider la preuve de paiement/ })).toBeInTheDocument();
    fireEvent.click(within(article).getByRole('button', { name: /Rejeter/ }));
    expect(await screen.findByText('Rejeter la preuve de paiement')).toBeInTheDocument();
    expect(screen.getByLabelText('Action après rejet')).toBeInTheDocument();
  });

  it('validating posts to the phase endpoint and reloads the queue', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null });
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: seed([], { ...COUNTS, proof_to_validate: 0 }) });
    renderPage('/paiements-s5?tab=proof_to_validate');
    fireEvent.click(await screen.findByRole('button', { name: /Valider la preuve de paiement/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/deep-evaluation/phases/2/payment/validate'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/payments/finance-queue'));
  });

  it('waiting on the applicant: owner Postulant, no CTA, the rejection reason is shown when a new proof was requested', async () => {
    renderPage('/paiements-s5?tab=awaiting_applicant', [
      waiting(3, { newProofRequested: true, payment: financePayment({ status: 'awaiting_proof', rejectionReason: 'Montant illisible', invoiceFileUrl: '/api/files/f.pdf', invoiceUploadedAt: '2026-10-10T09:00:00.000Z' }) }),
    ]);
    const article = await screen.findByRole('article', { name: /DEM-FIN-03/ });
    expect(within(article).getByText('En attente de : Postulant')).toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: /Valider|Rejeter|Joindre/ })).not.toBeInTheDocument();
    expect(within(article).getByText('Motif de la demande')).toBeInTheDocument();
    expect(within(article).getAllByText(/Montant illisible/).length).toBeGreaterThan(0);
    expect(within(article).getByText('Preuve de paiement reçue')).toBeInTheDocument();
  });

  it('« En attente du postulant » groups a normal item under « En attente », never « À traiter »', async () => {
    renderPage('/paiements-s5?tab=awaiting_applicant');
    await screen.findAllByRole('option');
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('À traiter')).not.toBeInTheDocument();
  });

  it('a role that cannot act (dn_agent) sees the pane without any CTA but with « Consulter la phase »', async () => {
    roles = ['dn_agent'];
    renderPage('/paiements-s5?tab=proof_to_validate');
    const article = await screen.findByRole('article', { name: /DEM-FIN-02/ });
    expect(within(article).queryByRole('button', { name: /Valider|Rejeter/ })).not.toBeInTheDocument();
    expect(within(article).getByRole('link', { name: /Consulter la phase/ })).toHaveAttribute('href', '/demandes/2/evaluation-approfondie');
  });

  it('empty queue: the default tab shows « Aucun paiement dans cette vue », metrics 0, no error', async () => {
    renderPage('/paiements-s5', [], { invoice_to_send: 0, proof_to_validate: 0, awaiting_applicant: 0, done: 0, inactive: 0 });
    expect(await screen.findByText('Aucun paiement dans cette vue')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Synthèse')).getAllByText('0')).toHaveLength(4);
    expect(screen.queryByText(/Impossible de charger/)).not.toBeInTheDocument();
  });

  it('DOSSIER_CLOSED on « Valider »: reloads the queue and shows the API message', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() },
        data: { code: 'DOSSIER_CLOSED', message: 'Le dossier est clos.' },
      })
    );
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: seed([proof(2, { bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed', dossierClosed: true, dossierStatus: 'rejected' })], { ...COUNTS, proof_to_validate: 0, inactive: 1 }),
    });
    renderPage('/paiements-s5?tab=proof_to_validate');
    fireEvent.click(await screen.findByRole('button', { name: /Valider la preuve de paiement/ }));
    expect(await screen.findByText('Le dossier est clos.')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: /Valider la preuve de paiement/ })).not.toBeInTheDocument());
  });

  it('no pagination control is rendered', async () => {
    const many = Array.from({ length: 25 }, (_, i) => invoice(i + 1));
    renderPage('/paiements-s5', many, { ...COUNTS, invoice_to_send: 25 });
    expect(await screen.findAllByRole('option')).toHaveLength(25);
    expect(screen.queryByRole('button', { name: /Suivant|Précédent/ })).not.toBeInTheDocument();
  });
});
