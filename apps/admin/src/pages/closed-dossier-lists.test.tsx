/** K7c - the staff work lists show a closed dossier (rejected, cancelled,
 *  completed) and offer no action on it; documents stay viewable. The API
 *  sends dossierClosed (and already drops its own actions); these tests pin
 *  what each screen renders from it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { api } from '../lib/axios';
import type { PaymentQueueItem } from '../lib/api/deep-evaluation.types';
import type { MeetingCockpitItem, MeetingCockpitSummary } from '../lib/api/meetings.types';
import type { CourrierTask } from '../lib/api/courrier-tasks/types';
import type { MyQueueItem } from '../lib/api/site-inspection.types';
import { queryClient as appQueryClient } from '../lib/react-query/queryClient';
import { queryKeys } from '../lib/react-query/queryKeys';
import { renderWithProviders } from '../test/render';
import S5PaymentsPage from './payments/S5PaymentsPage';
import MeetingsPage from './meetings/MeetingsPage';
import CourrierTasksPage from './courrier-tasks/CourrierTasksPage';
import MyInspectionsPage from './inspections/MyInspectionsPage';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: ['reception'] } }) }));

const AT = '2026-10-02T08:00:00.000Z';
const SOON = new Date(Date.now() + 86_400_000).toISOString();
const closed = { dossierStatus: 'rejected', dossierClosed: true };
const open = { dossierStatus: 'in_progress', dossierClosed: false };

let responses: Record<string, unknown> = {};
beforeEach(() => {
  responses = {};
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: responses[url] ?? [] }));
});
afterEach(() => vi.restoreAllMocks());

const payment = (over: Partial<PaymentQueueItem>): PaymentQueueItem => ({
  phaseId: 1, requestId: 1, requestReference: 'DEM-K7C-01', requestType: 'issuance', organisationName: 'OMA K7c',
  payment: {
    id: 1, status: 'pending_validation', invoiceFileUrl: '/api/files/facture.pdf', invoiceUploadedAt: AT,
    proofFileUrl: '/api/files/preuve.pdf', proofUploadedAt: AT, validatedAt: null, rejectionReason: null, rejectionAction: null,
  },
  nextAction: 'validate_payment', ...open, ...over,
});

describe('<S5PaymentsPage> (K7c)', () => {
  it('closed dossier: badge, "Dossier clos" note, no validate / reject, documents still listed', async () => {
    responses['/deep-evaluation/payment-queue'] = [payment(closed)];
    renderWithProviders(<S5PaymentsPage />);
    // K7d - a pending payment of a closed dossier is no longer in the action tabs
    fireEvent.click(await screen.findByRole('button', { name: /Preuve reçue/ }));
    expect(await screen.findByText('Aucun paiement dans cette vue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Tous/ }));
    expect((await screen.findAllByText('Dossier rejeté')).length).toBeGreaterThan(0);
    expect(screen.getByText('Dossier clos - consultation')).toBeInTheDocument();
    expect(screen.getByText('Dossier clos - consultation uniquement')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Valider le paiement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rejeter/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Facture transmise').length).toBeGreaterThan(0); // documents still listed
  });

  it('open dossier: actions unchanged', async () => {
    responses['/deep-evaluation/payment-queue'] = [payment({})];
    renderWithProviders(<S5PaymentsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Preuve reçue/ }));
    expect(await screen.findByRole('button', { name: /Valider le paiement/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

const meeting = (over: Partial<MeetingCockpitItem>): MeetingCockpitItem => ({
  id: 7, phaseId: 3, phaseCode: 'M3', phaseLabel: 'Préliminaire', phaseStatus: 'open', requestId: 1,
  requestReference: 'DEM-K7C-01', requestType: 'issuance', organisationName: 'OMA K7c', applicantName: 'P',
  meetingType: 'preliminary', meetingTypeLabel: 'Reunion preliminaire', status: 'held', statusLabel: 'Tenue',
  scheduledAt: SOON, location: 'Salle A', dnAgentId: 5, dnAgentName: 'Agent DN', crDocumentUrl: '/api/files/cr.pdf',
  crUploadedAt: AT, ticketUrl: '/api/meetings/7/ticket', phaseHref: '/demandes/1/phase-preliminaire',
  canManage: true, actionLabel: 'Compte-rendu depose', ...open, ...over,
});

function cockpit(item: MeetingCockpitItem): MeetingCockpitSummary {
  return { periodStart: AT, periodEnd: AT, metrics: [], items: [item], upcoming: [item], missingReports: [], updatedAt: AT };
}

describe('<MeetingsPage> (K7c)', () => {
  it('closed dossier: badge, no held / report actions, the CR stays viewable', async () => {
    responses['/meetings'] = cockpit(meeting({ ...closed, canManage: false, actionLabel: 'Dossier clos' }));
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.getByText(/la réunion reste consultable, aucune action/)).toBeInTheDocument();
    expect(screen.getByText('Consulter le compte-rendu')).toBeInTheDocument();
    expect(screen.queryByText(/Remplacer le compte-rendu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Les actions R3 restent disponibles/)).not.toBeInTheDocument();
  });

  it('open dossier: report form unchanged', async () => {
    responses['/meetings'] = cockpit(meeting({}));
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.getByText('Remplacer le compte-rendu')).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

const task = (over: Partial<CourrierTask>): CourrierTask => ({
  id: 'formal_request_letter:1', source: 'formal_request_letter', bucket: 'to_signature', requestId: 1,
  requestReference: 'DEM-K7C-01', requestType: 'issuance', organisationName: 'OMA K7c', applicantName: 'P',
  circuitDocumentId: 1, circuitStatus: 'submitted', fileUrl: '/api/files/lettre.pdf', mimeType: 'application/pdf',
  depositedAt: AT, signatureSentAt: null, signedAt: null, pendingReviewAt: null,
  availableActions: ['print', 'confirm_signature_circuit'], ...open, ...over,
});
const tasks = (item: CourrierTask) => ({ items: [item], counts: { toSignature: 1, inSignature: 0, returned: 0, legacySigned: 0 } });

describe('<CourrierTasksPage> (K7c)', () => {
  it('closed dossier: badge, no print, the document stays viewable', async () => {
    responses['/courrier-tasks'] = tasks(task({ ...closed, availableActions: [] }));
    renderWithProviders(<CourrierTasksPage />);
    // K7d - not in "A imprimer" any more (default tab), still under "Tous"
    expect(await screen.findByText('Sélectionnez un courrier')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Tous/ }));
    expect(await screen.findByText('Dossier clos - consultation uniquement')).toBeInTheDocument();
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Ouvrir \/ imprimer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ouvrir document/ })).toBeInTheDocument();
  });

  it('open dossier: print unchanged', async () => {
    responses['/courrier-tasks'] = tasks(task({}));
    renderWithProviders(<CourrierTasksPage />);
    expect(await screen.findByRole('button', { name: /Ouvrir \/ imprimer/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

const mission = (over: Partial<MyQueueItem>): MyQueueItem => ({
  phaseId: 1, phaseStatus: 'open', openedAt: AT, closedAt: null, requestId: 1, requestReference: 'DEM-K7C-01',
  requestType: 'issuance', organisationName: 'OMA K7c',
  payment: { id: 1, status: 'validated', invoiceFileUrl: null, invoiceUploadedAt: null, proofFileUrl: null, proofUploadedAt: null, validatedAt: AT, rejectionReason: null, rejectionAction: null },
  siteVisit: { id: 1, r3AgentId: 5, scheduledAt: AT, location: 'Hangar', status: 'scheduled' },
  inspection: null, missionStatus: 'to_hold', statusLabel: 'Prevue', nextAction: 'mark_held',
  nextActionLabel: 'Marquer tenue', priority: 'haute', waitingDays: 0, ...open, ...over,
});

describe('<MyInspectionsPage> (K7c)', () => {
  function renderMissions(items: MyQueueItem[]) {
    renderWithProviders(<MyInspectionsPage />, { seed: [[queryKeys.siteInspection.myQueue(), items]] });
  }

  it('closed dossier: listed as closed, no "Enregistrer la tenue", reason shown', () => {
    renderMissions([mission({ ...closed, missionStatus: 'closed', statusLabel: 'Dossier clos', nextAction: 'consult', nextActionLabel: 'Consulter', priority: 'basse' })]);
    fireEvent.click(screen.getAllByText('DEM-K7C-01')[0]);
    expect(screen.getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(screen.getByText(/aucune action R3 n’est possible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer la tenue/ })).not.toBeInTheDocument();
  });

  it('open dossier: unchanged', () => {
    renderMissions([mission({})]);
    fireEvent.click(screen.getAllByText('DEM-K7C-01')[0]);
    expect(screen.getByRole('button', { name: /Enregistrer la tenue/ })).toBeInTheDocument();
    expect(screen.queryByText(/Dossier rejeté/)).not.toBeInTheDocument();
  });
});

describe('queryClient: DOSSIER_CLOSED also reloads the staff work lists (K7c)', () => {
  it('invalidates the S5 queues, the R3 queue and the meetings', async () => {
    const invalidate = vi.spyOn(appQueryClient, 'invalidateQueries').mockResolvedValue();
    const error = new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409, statusText: '', headers: {}, config: { headers: new AxiosHeaders() },
      data: { message: 'refused', code: 'DOSSIER_CLOSED' },
    });
    const mutation = appQueryClient.getMutationCache().build(appQueryClient, { mutationFn: () => Promise.reject(error) });
    await mutation.execute(undefined).catch(() => undefined);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.meetings.all }));
    for (const queryKey of [
      queryKeys.deepEvaluation.paymentQueue(),
      queryKeys.siteInspection.paymentQueue(),
      queryKeys.certificates.paymentQueue(),
      queryKeys.siteInspection.myQueue(),
      ['phases', 'dossier-state'],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
});
