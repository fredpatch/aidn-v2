/** K7c - the staff work lists show a closed dossier (rejected, cancelled,
 *  completed) and offer no action on it; documents stay viewable. The API
 *  sends dossierClosed (and already drops its own actions); these tests pin
 *  what each screen renders from it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { api } from '../lib/axios';
import { CONFIRMED_NEGOTIATION } from '../test/meetingFixtures';
import type { FinanceQueueItem } from '../lib/api/payments.types';
import { finance, financePayment } from '../test/financeFixtures';
import type { MeetingCockpitItem, MeetingCockpitSummary } from '../lib/api/meetings.types';
import type { CourrierTask } from '../lib/api/courrier-tasks/types';
import { courrier } from '../test/courrierFixtures';
import type { InspectionQueueItem } from '../lib/api/site-inspection.types';
import { mission as inspectionMission } from '../test/inspectionFixtures';
import { queryClient as appQueryClient } from '../lib/react-query/queryClient';
import { queryKeys } from '../lib/react-query/queryKeys';
import { renderWithProviders } from '../test/render';
import S5PaymentsPage from './payments/S5PaymentsPage';
import MeetingsPage from './meetings/MeetingsPage';
import CourrierTasksPage from './courrier-tasks/CourrierTasksPage';
import MyInspectionsPage from './inspections/MyInspectionsPage';

let roles = ['reception'];
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));

const AT = '2026-10-02T08:00:00.000Z';
const SOON = new Date(Date.now() + 86_400_000).toISOString();
const closed = { dossierStatus: 'rejected', dossierClosed: true };
const open = { dossierStatus: 'in_progress', dossierClosed: false };

let responses: Record<string, unknown> = {};
beforeEach(() => {
  roles = ['reception'];
  responses = {};
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: responses[url] ?? [] }));
});
afterEach(() => vi.restoreAllMocks());

const payment = (over: Partial<FinanceQueueItem>): FinanceQueueItem =>
  finance({
    requestReference: 'DEM-K7C-01', organisationName: 'OMA K7c', bucket: 'proof_to_validate', actionKey: 'validate_payment_proof',
    payment: financePayment({
      status: 'pending_validation', invoiceFileUrl: '/api/files/facture.pdf', invoiceUploadedAt: AT,
      proofFileUrl: '/api/files/preuve.pdf', proofUploadedAt: AT,
    }),
    ...open, ...over,
  });
const FINANCE_COUNTS = { invoice_to_send: 0, proof_to_validate: 1, awaiting_applicant: 0, done: 0, inactive: 0 };
const queue = (item: FinanceQueueItem, counts = FINANCE_COUNTS) => ({ items: [item], counts });

describe('<S5PaymentsPage> (K7c)', () => {
  beforeEach(() => {
    roles = ['s5_agent'];
  });

  it('closed dossier: badge, "Dossier clos" note, no validate / reject, documents still listed', async () => {
    responses['/payments/finance-queue'] = queue(
      payment({ ...closed, bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed' }),
      { ...FINANCE_COUNTS, proof_to_validate: 0, inactive: 1 }
    );
    renderWithProviders(<S5PaymentsPage />, { route: '/paiements-s5?tab=all' });
    const article = await screen.findByRole('article', { name: /DEM-K7C-01/ });
    expect(within(article).getByText('Dossier clos — consultation uniquement')).toBeInTheDocument();
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Valider la preuve de paiement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rejeter/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Facture transmise').length).toBeGreaterThan(0); // documents still listed
  });

  it('open dossier: actions unchanged', async () => {
    responses['/payments/finance-queue'] = queue(payment({}));
    renderWithProviders(<S5PaymentsPage />, { route: '/paiements-s5?tab=proof_to_validate' });
    expect(await screen.findByRole('button', { name: /Valider la preuve de paiement/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });

  it('SESSION1-MEET-2 - a held site visit shows no compte-rendu rows', async () => {
    responses['/meetings'] = cockpit(
      meeting({ meetingType: 'site_visit', meetingTypeLabel: 'Visite sur site', phaseCode: 'M6', canManage: false, crDocumentUrl: null, crUploadedAt: null })
    );
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.queryByRole('region', { name: 'Compte rendu DN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Compte rendu signé par le postulant' })).not.toBeInTheDocument();
  });
});

const meeting = (over: Partial<MeetingCockpitItem>): MeetingCockpitItem => ({
  id: 7, phaseId: 3, phaseCode: 'M3', phaseLabel: 'Préliminaire', phaseStatus: 'open', requestId: 1,
  requestReference: 'DEM-K7C-01', requestType: 'issuance', organisationName: 'OMA K7c', applicantName: 'P',
  meetingType: 'preliminary', meetingTypeLabel: 'Reunion preliminaire', status: 'held', statusLabel: 'Tenue',
  scheduledAt: SOON, location: 'Salle A', dnAgentId: 5, dnAgentName: 'Agent DN', crDocumentUrl: '/api/files/41',
  crUploadedAt: AT, signedCrDocumentUrl: null, signedCrUploadedAt: null, ticketUrl: '/api/meetings/7/ticket', phaseHref: '/demandes/1/phase-preliminaire',
  canManage: true, actionLabel: 'Compte-rendu depose', negotiation: CONFIRMED_NEGOTIATION, ...open, ...over,
});

function cockpit(item: MeetingCockpitItem): MeetingCockpitSummary {
  return { periodStart: AT, periodEnd: AT, metrics: [], items: [item], upcoming: [item], missingReports: [], pendingNegotiations: [], updatedAt: AT };
}

describe('<MeetingsPage> (K7c)', () => {
  it('closed dossier: badge, no held / report actions, the CR stays viewable', async () => {
    responses['/meetings'] = cockpit(meeting({ ...closed, canManage: false, actionLabel: 'Dossier clos' }));
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.getByText(/la réunion reste consultable, aucune action/)).toBeInTheDocument();
    const dnReport = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(within(dnReport).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remplacer le compte rendu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Les actions de la Cellule Inspection restent disponibles/)).not.toBeInTheDocument();
  });

  it('open dossier: report form unchanged', async () => {
    responses['/meetings'] = cockpit(meeting({}));
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.getByRole('button', { name: /Remplacer le compte rendu/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

const task = (over: Partial<CourrierTask>): CourrierTask =>
  courrier({ requestReference: 'DEM-K7C-01', organisationName: 'OMA K7c', applicantName: 'P', stepSince: AT, depositedAt: AT, ...open, ...over });
const COUNTS = { to_print: 1, with_dg: 0, returned: 0, inactive: 0 };
const tasks = (item: CourrierTask, counts = COUNTS) => ({ items: [item], counts, thresholds: { dgAlertWorkingDays: 3, depositDays: 1 } });

describe('<CourrierTasksPage> (K7c)', () => {
  it('closed dossier: badge, no print, the document stays viewable', async () => {
    responses['/courrier-tasks'] = tasks(
      task({ ...closed, bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed', availableActions: [] }),
      { to_print: 0, with_dg: 0, returned: 0, inactive: 1 }
    );
    renderWithProviders(<CourrierTasksPage />, { route: '/courriers?tab=all' });
    expect(await screen.findByText('Dossier clos — consultation uniquement')).toBeInTheDocument();
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Ouvrir \/ imprimer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
  });

  it('open dossier: print unchanged', async () => {
    responses['/courrier-tasks'] = tasks(task({}));
    renderWithProviders(<CourrierTasksPage />);
    expect(await screen.findByRole('button', { name: /Ouvrir \/ imprimer/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

const mission = (over: Partial<InspectionQueueItem>) =>
  inspectionMission({ requestReference: 'DEM-K7C-01', organisationName: 'OMA K7c', ...open, ...over });
const MISSION_COUNTS = { to_hold: 0, verdict_due: 0, awaiting_payment: 0, closed: 0, inactive: 0 };

describe('<MyInspectionsPage> (K7c)', () => {
  beforeEach(() => {
    roles = ['r3_agent'];
  });

  it('closed dossier: listed as closed, no "Enregistrer la tenue", reason shown', async () => {
    responses['/site-inspection/my-queue'] = {
      items: [mission({ ...closed, bucket: 'inactive', state: 'done', owner: null, actionKey: 'none', blockReason: 'dossier_closed' })],
      counts: { ...MISSION_COUNTS, inactive: 1 },
    };
    renderWithProviders(<MyInspectionsPage />, { route: '/mes-inspections?tab=all' });
    expect((await screen.findAllByText('Dossier clos — consultation uniquement')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.getByText(/Aucune action de la Cellule Inspection n’est possible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer la tenue/ })).not.toBeInTheDocument();
  });

  it('open dossier: unchanged', async () => {
    responses['/site-inspection/my-queue'] = { items: [mission({})], counts: { ...MISSION_COUNTS, to_hold: 1 } };
    renderWithProviders(<MyInspectionsPage />);
    expect(await screen.findByRole('button', { name: /Enregistrer la tenue/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

describe('queryClient: DOSSIER_CLOSED also reloads the staff work lists (K7c)', () => {
  it('invalidates the Finance queue, the R3 queue and the meetings', async () => {
    const invalidate = vi.spyOn(appQueryClient, 'invalidateQueries').mockResolvedValue();
    const error = new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409, statusText: '', headers: {}, config: { headers: new AxiosHeaders() },
      data: { message: 'refused', code: 'DOSSIER_CLOSED' },
    });
    const mutation = appQueryClient.getMutationCache().build(appQueryClient, { mutationFn: () => Promise.reject(error) });
    await mutation.execute(undefined).catch(() => undefined);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.meetings.all }));
    for (const queryKey of [
      queryKeys.payments.financeQueue(),
      queryKeys.siteInspection.myQueue(),
      queryKeys.courrierTasks.queue(),
      ['phases', 'dossier-state'],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
});
