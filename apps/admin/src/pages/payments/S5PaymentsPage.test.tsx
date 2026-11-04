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

describe('<S5PaymentsPage> FINANCE-LABELS-1 - objet de la facture', () => {
  const MATRIX: Array<[Partial<FinanceQueueItem>, string]> = [
    [{ phaseCode: 'M5', requestType: 'recognition' }, 'Frais d’étude de Reconnaissance d’agrément'],
    [{ phaseCode: 'M5', requestType: 'issuance' }, 'Frais d’étude de Certification d’un OMA'],
    [{ phaseCode: 'M5', requestType: 'modification' }, 'Frais d’étude de Modification d’un agrément OMA'],
    [{ phaseCode: 'M5', requestType: 'renewal' }, 'Frais d’étude de Renouvellement d’un agrément OMA'],
    [{ phaseCode: 'M6', requestType: 'recognition' }, 'Frais d’audit - Reconnaissance d’agrément'],
    [{ phaseCode: 'M7', requestType: 'issuance' }, 'Frais de délivrance - Certification d’un OMA'],
  ];
  const items = MATRIX.map(([over], index) =>
    invoice(index + 1, { ...over, id: `${over.phaseCode}:${index + 1}` })
  );
  const counts = { ...COUNTS, invoice_to_send: items.length };

  it('each row and the reading pane show the invoice purpose before any upload', async () => {
    renderPage('/paiements-s5', items, counts);
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(MATRIX.length);
    for (const [index, [, label]] of MATRIX.entries()) {
      const reference = `DEM-FIN-${String(index + 1).padStart(2, '0')}`;
      const option = options.find((element) => element.textContent?.includes(reference))!;
      expect(option).toHaveTextContent(label);
      fireEvent.click(option);
      const article = await screen.findByRole('article', { name: new RegExp(reference) });
      expect(within(article).getByText('Objet de la facture')).toBeInTheDocument();
      expect(within(article).getByText(label)).toBeInTheDocument();
      // The operational step stays the action; the purpose never replaces it.
      expect(within(article).getByText('Facture à transmettre')).toBeInTheDocument();
      expect(within(article).getByRole('button', { name: /Joindre la facture transmise/ })).toBeInTheDocument();
    }
    expect(document.body.textContent).not.toMatch(/recognition|issuance|modification|renewal/);
    expect(document.body.textContent).not.toMatch(/provisoire/i);
  });

  it('the upload dialog names the invoice; the upload flow is unchanged', async () => {
    renderPage('/paiements-s5', items, counts);
    const article = await screen.findByRole('article', { name: /DEM-FIN-01/ });
    fireEvent.click(within(article).getByRole('button', { name: /Joindre la facture transmise/ }));
    expect(await screen.findByText('DEM-FIN-01 - Frais d’étude de Reconnaissance d’agrément')).toBeInTheDocument();
    expect(screen.getByText('Facture transmise au postulant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('validation and rejection actions are unchanged on a labelled proof', async () => {
    renderPage('/paiements-s5?tab=proof_to_validate', [proof(7, { phaseCode: 'M6', id: 'M6:7', requestType: 'renewal' })]);
    const article = await screen.findByRole('article', { name: /DEM-FIN-07/ });
    expect(within(article).getByText('Frais d’audit - Renouvellement')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Valider la preuve de paiement/ })).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Rejeter/ })).toBeInTheDocument();
  });

  it('search finds dossiers by the business label', async () => {
    renderPage('/paiements-s5', items, counts);
    await screen.findAllByRole('option');
    const search = screen.getByPlaceholderText('Référence, organisation, phase, objet de la facture...');
    for (const [needle, references] of [
      ['Reconnaissance', ['DEM-FIN-01', 'DEM-FIN-05']],
      ['Certification', ['DEM-FIN-02', 'DEM-FIN-06']],
      ['Renouvellement', ['DEM-FIN-04']],
      ['Frais d’audit', ['DEM-FIN-05']],
    ] as const) {
      fireEvent.change(search, { target: { value: needle } });
      await waitFor(() => {
        const visible = screen.queryAllByRole('option').map((option) => option.textContent?.match(/DEM-FIN-\d+/)?.[0]);
        expect(visible.sort()).toEqual([...references]);
      });
    }
  });
});
